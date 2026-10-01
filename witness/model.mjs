import {AbiCoder,TypedDataEncoder,keccak256} from '../contracts/demo/deps.mjs';
const coder=AbiCoder.defaultAbiCoder();
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
export function requireThat(condition,message){if(!condition)throw new Error(message);}
const TERM_TYPE='tuple(address lender,uint256 principal,uint256 interest,uint256 duration,uint256 grace,uint256 fundingDeadline,uint256 exitDelay,uint256 approvalThreshold,uint256 vetoThreshold)';
export function termsCommitment(config) {
  const t=config.terms;
  return keccak256(coder.encode(['string','uint256','address','address',TERM_TYPE,'address[]'],
    ['LorrowFixedTermLoan/0.1',config.chainId,config.loan,config.borrower,t,config.witnesses]));
}
// Independent JS implementation of the fixed-term rules. Does not ask the policy
// which amount to sign. The policy's answer is cross-checked only after computing it.
export function evaluate(s,config) {
  const t=config.terms;
  requireThat(s.chainId===BigInt(config.chainId),'Unexpected chain');
  for(const key of ['borrower','lender','vault','policy']) {
    const expected=key==='policy'?config.loan:config[key];
    requireThat(same(s[key],expected),`Unexpected ${key}`);
  }
  for(const key of ['principal','duration','grace','fundingDeadline','exitDelay','approvalThreshold','vetoThreshold'])
    requireThat(s[key]===BigInt(t[key]),`Changed ${key}`);
  const debt=BigInt(t.principal)+BigInt(t.interest);
  requireThat(s.debt===debt && s.collateral===BigInt(config.collateral) && s.collateral>=debt,'Invalid debt/collateral');
  requireThat(same(s.termsHash,termsCommitment(config)) && same(s.vaultTerms,s.termsHash),'Terms commitment mismatch');
  requireThat(same(s.loanCodeHash,config.loanCodeHash) && same(s.vaultCodeHash,config.vaultCodeHash),'Changed contract code');
  requireThat(config.witnesses.every((w,i)=>s.committee[i]),'Missing configured witness');
  requireThat(!s.repaid||s.funded,'Repayment without funding');
  requireThat(s.funded ? s.fundedAt<=s.fundingDeadline&&s.dueAt===s.fundedAt+s.duration : s.fundedAt===0n&&s.dueAt===0n,'Invalid funding clock');
  let mode=0n;
  if(!s.funded&&s.timestamp>s.fundingDeadline)mode=1n;
  else if(s.repaid)mode=2n;
  else if(s.funded&&s.timestamp>s.dueAt+s.grace)mode=3n;
  const lenderAmount=mode===3n?debt:0n;
  const stateHash=keccak256(coder.encode(['bytes32','address','uint256','uint256','uint256','bool','bool','uint256','uint256'],
    [s.termsHash,s.vault,s.collateral,s.fundedAt,s.dueAt,s.funded,s.repaid,mode,lenderAmount]));
  return {mode,lenderAmount,stateHash,eligible:mode!==0n&&!s.settled,
    reason:s.settled?'Settled':mode===1n?'Unfunded expiry':mode===2n?'Repaid':mode===3n?'Default':s.funded?'Loan active':'Awaiting funding'};
}
export const settlementTypes={Settlement:[{name:'nonce',type:'uint256'},{name:'lenderAmount',type:'uint256'},
  {name:'stateHash',type:'bytes32'},{name:'deadline',type:'uint256'},{name:'termsHash',type:'bytes32'}]};
export function approvalDigest(config,p) {
  return TypedDataEncoder.hash({name:'LorrowEscrow',version:'0.0.1',chainId:config.chainId,verifyingContract:config.vault},settlementTypes,
    {...p,termsHash:termsCommitment(config)});
}
export function vetoDigest(config,nonce) {
  return TypedDataEncoder.hash({name:'LorrowEscrow',version:'0.0.1',chainId:config.chainId,verifyingContract:config.vault},
    {Veto:[{name:'nonce',type:'uint256'}]},{nonce});
}
