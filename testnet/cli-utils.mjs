import fs from 'node:fs/promises';
import path from 'node:path';
import {Wallet,JsonRpcProvider} from '../contracts/demo/deps.mjs';
export function args(argv=process.argv.slice(2)) {
  const out={};for(let i=0;i<argv.length;i+=2){if(!argv[i].startsWith('--')||!argv[i+1])throw new Error('Use --name value arguments');out[argv[i].slice(2)]=argv[i+1];}return out;
}
export const encode=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v,2)+'\n';
export async function writeNew(filename,data) {
  await fs.mkdir(path.dirname(filename),{recursive:true,mode:0o700});
  const file=await fs.open(filename,'wx',0o600);try{await file.writeFile(encode(data));await file.sync();}finally{await file.close();}
  let directory;try{directory=await fs.open(path.dirname(filename),'r');await directory.sync();}catch(e){if(!['EPERM','EISDIR','ENOTSUP','EINVAL'].includes(e.code))throw e;}finally{await directory?.close();}
}
export async function readJSON(filename){return JSON.parse(await fs.readFile(filename,'utf8'));}
export async function password(label='Keystore password: ') {
  if(process.env.LORROW_KEY_PASSWORD)return process.env.LORROW_KEY_PASSWORD;
  if(!process.stdin.isTTY)throw new Error('Interactive terminal required, or provide LORROW_KEY_PASSWORD locally');
  process.stdout.write(label);process.stdin.setRawMode(true);process.stdin.resume();
  return new Promise((resolve,reject)=>{let value='';const done=(error)=>{process.stdin.off('data',listener);process.stdin.setRawMode(false);process.stdin.pause();process.stdout.write('\n');error?reject(error):resolve(value);};
    const listener=chunk=>{for(const c of chunk.toString()){if(c==='\r'||c==='\n'){done();return;}if(c==='\u0003'){done(new Error('Cancelled'));return;}if(c==='\u007f'||c==='\b')value=value.slice(0,-1);else if(c>=' ')value+=c;}};process.stdin.on('data',listener);});
}
export async function loadKey(filename){return Wallet.fromEncryptedJson(await fs.readFile(filename,'utf8'),await password());}
export function rpcProvider(){const url=process.env.LORROW_RPC_URL;if(!url)throw new Error('Set LORROW_RPC_URL to your Sepolia RPC endpoint');
  const parsed=new URL(url);if(!['http:','https:'].includes(parsed.protocol))throw new Error('HTTP(S) RPC required');
  return new JsonRpcProvider(url,undefined,{cacheTimeout:-1});}
export async function runCLI(task) {
  try{await task();}catch(error){let message=error.shortMessage??error.message??'Operation failed';
    for(const secret of [process.env.LORROW_RPC_URL,process.env.LORROW_KEY_PASSWORD])if(secret)message=message.split(secret).join('[redacted]');
    console.error(message);process.exitCode=1;
  }
}
