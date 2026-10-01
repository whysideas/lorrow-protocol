import path from 'node:path';
import {compile} from '../contracts/demo/compile.mjs';
import {DurableWitness} from './durable.mjs';
import {args,readJSON,writeNew,loadKey,rpcProvider,runCLI} from '../testnet/cli-utils.mjs';
await runCLI(async()=>{
const options=args();
if(!options.manifest||!options.key||!options.request||!options.out)throw new Error('Required: --manifest file --key keystore --request proposal-or-veto.json --out signature.json');
const manifest=await readJSON(options.manifest),request=await readJSON(options.request),wallet=await loadKey(options.key);
const provider=rpcProvider();let witness;
try {
 witness=new DurableWitness({provider,artifacts:compile(),manifest,wallet,journal:options.journal??path.join('.lorrow','journals',`${manifest.chainId}-${wallet.address}.jsonl`)});
 const signature=await witness.sign(request);await writeNew(options.out,signature);
 console.log(`Verified and durably recorded ${request.type}; public signature saved to ${options.out}`);
} finally {witness?.close();provider.destroy();}
});
