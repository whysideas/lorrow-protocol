import {requireThat} from './model.mjs';
export async function finalityBlock(provider,policy={tag:'finalized'},{allowLocal=false}={}) {
  if(policy.tag==='finalized'){
    const b=await provider.getBlock('finalized');requireThat(b,'RPC does not support finalized blocks');return '0x'+b.number.toString(16);
  }
  requireThat(allowLocal&&Number.isInteger(policy.confirmations)&&policy.confirmations>=1,'Finalized blocks required; no latest/safe fallback');
  const head=BigInt(await provider.send('eth_blockNumber',[])),height=head-BigInt(policy.confirmations);
  requireThat(height>=0n,'Not enough local confirmation blocks');return '0x'+height.toString(16);
}
