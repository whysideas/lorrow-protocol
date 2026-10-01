import {AbiCoder,Contract,Interface,keccak256,getAddress,TypedDataEncoder,toUtf8Bytes,encodeBytes32String} from '../contracts/demo/deps.mjs';
import {requireThat,termsCommitment,evaluate} from '../witness/model.mjs';
import {readChain,canonical} from '../witness/read-chain.mjs';
const coder=AbiCoder.defaultAbiCoder();
const same=(a,b)=>String(a).toLowerCase()===String(b).toLowerCase();
export const SEPOLIA=11155111;
export function allowedChain(chainId,allowLocal=false) {
  requireThat(Number(chainId)===SEPOLIA||(allowLocal&&Number(chainId)===31337),'Sepolia only; mainnet and other chains are refused');
}
export function expectedRuntime(artifact,values) {
  let code=artifact.evm.deployedBytecode.object;
  for(const [id,locations]of Object.entries(artifact.evm.deployedBytecode.immutableReferences)){
    const name=artifact.immutableNames[id];requireThat(Object.hasOwn(values,name),`Missing immutable ${name}`);
    const value=values[name],type=['borrower','lender','policy'].includes(name)?'address':name==='termsHash'?'bytes32':'uint256';
    const encoded=coder.encode([type],[value]).slice(2);
    for(const {start,length}of locations){requireThat(length===32,'Unexpected immutable width');code=code.slice(0,start*2)+encoded+code.slice((start+length)*2);}
  }
  return '0x'+code;
}
export function validatePlan(plan,chainId,borrower) {
  allowedChain(chainId);const t=plan.terms,c=BigInt(plan.collateral);
  requireThat(getAddress(t.lender)!==getAddress(borrower),'Borrower and lender must differ');
  requireThat(BigInt(t.principal)>0n&&BigInt(t.interest)>=0n&&c>=BigInt(t.principal)+BigInt(t.interest),'Invalid principal/interest/collateral');
  requireThat(BigInt(t.principal)<=10n**16n&&c<=3n*10n**16n,'Demo limit: principal 0.01 ETH, collateral 0.03 ETH');
  for(const k of ['duration','grace','fundingDeadline','exitDelay'])requireThat(BigInt(t[k])>0n,`Invalid ${k}`);
  const witnesses=plan.witnesses.map(getAddress).sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);
  requireThat(witnesses.length===3&&new Set(witnesses).size===3&&witnesses.every(w=>BigInt(w)>0n),'Three distinct nonzero witnesses required');
  requireThat(BigInt(t.approvalThreshold)===2n&&BigInt(t.vetoThreshold)===1n,'Demo uses 2 approvals and 1 veto');
  return {...plan,collateral:c.toString(),witnesses,terms:{lender:getAddress(t.lender),...Object.fromEntries(['principal','interest','duration','grace','fundingDeadline','exitDelay','approvalThreshold','vetoThreshold'].map(k=>[k,BigInt(t[k]).toString()]))}};
}
export async function verifyCreation(provider,artifacts,draft,{allowLocal=false}={}) {
  const chainId=BigInt(await provider.send('eth_chainId',[]));allowedChain(chainId,allowLocal);
  requireThat(chainId===BigInt(draft.chainId),'Draft chain mismatch');
  const transaction=await provider.getTransaction(draft.creationTxHash),receipt=await provider.getTransactionReceipt(draft.creationTxHash);
  requireThat(transaction&&receipt&&receipt.status===1,'Creation is not confirmed');
  requireThat(transaction.to===null&&transaction.value===0n&&same(transaction.from,draft.borrower)&&same(receipt.contractAddress,draft.loan),'Draft creation identity mismatch');
  const block=await provider.getBlock(receipt.blockNumber);requireThat(block?.hash===receipt.blockHash,'Creation is not canonical');
  const iface=new Interface(artifacts.loan.abi),expected='0x'+artifacts.loan.evm.bytecode.object+iface.encodeDeploy([draft.terms,draft.witnesses]).slice(2);
  requireThat(same(transaction.data,expected),'Draft constructor differs from compiled source');
  const t=draft.terms,termsHash=termsCommitment(draft);
  const values={borrower:draft.borrower,lender:t.lender,principal:t.principal,debt:BigInt(t.principal)+BigInt(t.interest),duration:t.duration,grace:t.grace,fundingDeadline:t.fundingDeadline,exitDelay:t.exitDelay,approvalThreshold:t.approvalThreshold,vetoThreshold:t.vetoThreshold,termsHash};
  requireThat(same(await provider.getCode(draft.loan),expectedRuntime(artifacts.loan,values)),'Draft loan runtime mismatch');
  return receipt;
}
// Recompute exact constructor input and both runtime bytecodes from the checked-in
// compiler/dependencies plus immutable values. Manifest-supplied code hashes alone
// are never sufficient. Verify receipts and opening call from the named borrower.
export async function verifyDeployment(provider,artifacts,manifest,{blockTag='latest',allowLocal=false}={}) {
  const chainId=BigInt(await provider.send('eth_chainId',[]));allowedChain(chainId,allowLocal);
  requireThat(chainId===BigInt(manifest.chainId),'Manifest chain mismatch');
  const block=await provider.getBlock(blockTag);requireThat(block,'RPC did not provide verification block');
  const tag='0x'+block.number.toString(16),t=manifest.terms;
  const [creation,created,opening,opened]=await Promise.all([
    provider.getTransaction(manifest.creationTxHash),provider.getTransactionReceipt(manifest.creationTxHash),
    provider.getTransaction(manifest.openTxHash),provider.getTransactionReceipt(manifest.openTxHash)]);
  requireThat(creation&&created&&opening&&opened,'Deployment receipts unavailable');
  requireThat(created.status===1&&opened.status===1,'Deployment transaction failed');
  requireThat(created.blockNumber<=block.number&&opened.blockNumber<=block.number,'Deployment is not yet in the selected finality block');
  for(const receipt of [created,opened]){
    const canonicalBlock=await provider.getBlock(receipt.blockNumber);
    requireThat(canonicalBlock&&canonicalBlock.hash===receipt.blockHash,'Deployment receipt is not canonical');
  }
  requireThat(creation.to===null&&same(created.contractAddress,manifest.loan)&&same(creation.from,manifest.borrower)&&creation.value===0n,'Incorrect loan creation');
  const iface=new Interface(artifacts.loan.abi);
  const expectedCreation='0x'+artifacts.loan.evm.bytecode.object+iface.encodeDeploy([t,manifest.witnesses]).slice(2);
  requireThat(same(creation.data,expectedCreation),'Constructor differs from the compiled source and agreed terms');
  requireThat(same(opening.to,manifest.loan)&&same(opening.from,manifest.borrower)&&opening.value===BigInt(manifest.collateral)&&same(opening.data,iface.encodeFunctionData('openVault')),'Incorrect collateral opening call');
  const loan=new Contract(manifest.loan,artifacts.loan.abi,provider),vault=await loan.vault({blockTag:tag});
  requireThat(same(vault,manifest.vault),'Wrong vault');
  const config={...manifest,chainId:Number(chainId),lender:t.lender,vault};
  const termsHash=termsCommitment(config);
  const loanValues={borrower:manifest.borrower,lender:t.lender,principal:t.principal,debt:BigInt(t.principal)+BigInt(t.interest),duration:t.duration,grace:t.grace,
    fundingDeadline:t.fundingDeadline,exitDelay:t.exitDelay,approvalThreshold:t.approvalThreshold,vetoThreshold:t.vetoThreshold,termsHash};
  const vaultValues={borrower:manifest.borrower,lender:t.lender,policy:manifest.loan,termsHash,collateral:manifest.collateral,exitDelay:t.exitDelay,approvalThreshold:t.approvalThreshold,vetoThreshold:t.vetoThreshold};
  Object.assign(vaultValues,{_cachedDomainSeparator:TypedDataEncoder.hashDomain({name:'LorrowEscrow',version:'0.0.1',chainId:Number(chainId),verifyingContract:vault}),
    _cachedChainId:chainId,_cachedThis:vault,_hashedName:keccak256(toUtf8Bytes('LorrowEscrow')),_hashedVersion:keccak256(toUtf8Bytes('0.0.1')),
    _name:encodeBytes32String('LorrowEscrow').slice(0,-2)+toUtf8Bytes('LorrowEscrow').length.toString(16).padStart(2,'0'),_version:encodeBytes32String('0.0.1').slice(0,-2)+'05'});
  const [loanCode,vaultCode]=await Promise.all([provider.getCode(manifest.loan,tag),provider.getCode(vault,tag)]);
  requireThat(same(loanCode,expectedRuntime(artifacts.loan,loanValues)),'Loan runtime does not match compiled source');
  requireThat(same(vaultCode,expectedRuntime(artifacts.vault,vaultValues)),'Vault runtime does not match compiled source');
  config.loanCodeHash=keccak256(loanCode);config.vaultCodeHash=keccak256(vaultCode);
  const s=await readChain(provider,artifacts,config,tag);evaluate(s,config);await canonical(provider,s);
  return {config,verifiedAt:{blockNumber:tag,blockHash:block.hash,tag:blockTag}};
}
