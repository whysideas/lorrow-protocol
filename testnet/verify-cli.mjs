import {compile} from '../contracts/demo/compile.mjs';
import {verifyDeployment} from './verify.mjs';
import {args,readJSON,encode,rpcProvider,runCLI} from './cli-utils.mjs';
await runCLI(async()=>{
const options=args();if(!options.manifest)throw new Error('Required: --manifest deployment.json');
if(options.finality&&!['latest','finalized'].includes(options.finality))throw new Error('Use --finality latest or finalized');
const provider=rpcProvider();
try{const result=await verifyDeployment(provider,compile(),await readJSON(options.manifest),{blockTag:options.finality==='finalized'?'finalized':'latest'});console.log(encode(result));}
finally{provider.destroy();}
});
