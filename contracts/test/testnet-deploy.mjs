import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {JsonRpcProvider,HDNodeWallet,parseEther} from '../demo/deps.mjs';
import {DEV_MNEMONIC} from '../demo/dev.mjs';
import {compile} from '../demo/compile.mjs';
import {verifyDeployment} from '../../testnet/verify.mjs';
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lorrow-deploy-'));
const chain=ganache.server({logging:{quiet:true},wallet:{mnemonic:DEV_MNEMONIC},chain:{chainId:11155111,hardfork:'shanghai'},miner:{timestampIncrement:0}});
await chain.listen(0,'127.0.0.1');const rpc=`http://127.0.0.1:${chain.address().port}`,provider=new JsonRpcProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=20;
function run(args){return new Promise((resolve,reject)=>{const child=spawn(process.execPath,[fileURLToPath(new URL('../../testnet/deploy.mjs',import.meta.url)),...args],{env:{...process.env,LORROW_RPC_URL:rpc,LORROW_KEY_PASSWORD:'test-password-not-real'}});let output='';const timer=setTimeout(()=>{child.kill();reject(new Error('CLI deployment timed out'));},45000);
 child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);child.once('exit',code=>{clearTimeout(timer);resolve({code,output});});child.once('error',reject);});}
try {
 const wallet=HDNodeWallet.fromPhrase(DEV_MNEMONIC,undefined,"m/44'/60'/0'/0/1"),lender=HDNodeWallet.fromPhrase(DEV_MNEMONIC,undefined,"m/44'/60'/0'/0/2").address;
 const witnesses=[4,5,6].map(i=>HDNodeWallet.fromPhrase(DEV_MNEMONIC,undefined,`m/44'/60'/0'/0/${i}`).address);
 const block=await provider.getBlock('latest');
 const plan={collateral:parseEther('0.003').toString(),witnesses,terms:{lender,principal:parseEther('0.001').toString(),interest:parseEther('0.0001').toString(),duration:'1800',grace:'600',fundingDeadline:String(block.timestamp+172800),exitDelay:'1800',approvalThreshold:'2',vetoThreshold:'1'}};
 const key=path.join(temp,'borrower.json'),planFile=path.join(temp,'plan.json'),out=path.join(temp,'deployment.json');
 await fs.writeFile(key,await wallet.encrypt('test-password-not-real'));await fs.writeFile(planFile,JSON.stringify(plan));
 const args=['--plan',planFile,'--key',key,'--out',out];const first=await run(args);assert.equal(first.code,0,first.output);
 const manifest=JSON.parse(await fs.readFile(out));await verifyDeployment(provider,compile(),manifest);
 const nonce=await provider.getTransactionCount(wallet.address);
 const resumed=await run([...args,'--resume','yes']);assert.equal(resumed.code,0,resumed.output);assert.equal(await provider.getTransactionCount(wallet.address),nonce);
 assert.equal((await run(args)).code,1);
 const signed=JSON.parse(await fs.readFile(out+'.draft.json'));signed.loan=lender;await fs.writeFile(out+'.draft.json',JSON.stringify(signed));
 const bad=await run([...args,'--resume','yes']);assert.equal(bad.code,1);assert.match(bad.output,/Unsafe/);assert.equal(await provider.getTransactionCount(wallet.address),nonce);
 console.log('DEPLOY PASS: signed drafts saved before broadcast; exact source/runtime verified; resume sends no new transaction; overwrite and changed draft refused. Sepolia-tagged local chain only.');
}finally{provider.destroy();await chain.close();await fs.rm(temp,{recursive:true,force:true});}
