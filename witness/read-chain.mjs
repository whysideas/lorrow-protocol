import {Contract,keccak256} from '../contracts/demo/deps.mjs';
// All calls are pinned to one block. Reject a reorganization before signing.
export async function readChain(provider,artifacts,config) {
  const number=await provider.send('eth_blockNumber',[]);
  const block=await provider.getBlock(number);
  if(!block)throw new Error('Missing block');
  const call={blockTag:number};
  const loan=new Contract(config.loan,artifacts.loan.abi,provider);
  const vault=new Contract(config.vault,artifacts.vault.abi,provider);
  const fields=['borrower','lender','principal','debt','duration','grace','fundingDeadline','exitDelay','approvalThreshold','vetoThreshold','termsHash','fundedAt','dueAt','funded','repaid'];
  const values=await Promise.all(fields.map(k=>loan[k](call)));
  const s=Object.fromEntries(fields.map((k,i)=>[k,values[i]]));
  const extra=await Promise.all([loan.vault(call),vault.policy(call),vault.collateral(call),vault.termsHash(call),vault.settled(call),vault.nonce(call),vault.pending(call),
    provider.getCode(config.loan,number),provider.getCode(config.vault,number),provider.send('eth_chainId',[]),
    ...config.witnesses.map(w=>vault.witness(w,call))]);
  const [v,p,c,h,settled,nonce,pending,loanCode,vaultCode,chainId,...committee]=extra;
  // Verify the vault's own immutable gate/recipient fields, not only the policy.
  const vaultFields=['borrower','lender','exitDelay','approvalThreshold','vetoThreshold'];
  const vv=await Promise.all(vaultFields.map(k=>vault[k](call)));
  vaultFields.forEach((k,i)=>{if(String(vv[i]).toLowerCase()!==String(s[k]).toLowerCase())throw new Error(`Vault ${k} mismatch`);});
  return {...s,vault:v,policy:p,collateral:c,vaultTerms:h,settled,nonce,
    pending:{nonce:pending.nonce,lenderAmount:pending.lenderAmount,stateHash:pending.stateHash,readyAt:pending.readyAt,deadline:pending.deadline},
    loanCodeHash:keccak256(loanCode),vaultCodeHash:keccak256(vaultCode),committee,chainId:BigInt(chainId),
    timestamp:BigInt(block.timestamp),blockNumber:number,blockHash:block.hash};
}
export async function canonical(provider,s) {
  const block=await provider.getBlock(s.blockNumber);
  if(!block||block.hash!==s.blockHash)throw new Error('Block changed during verification');
}
