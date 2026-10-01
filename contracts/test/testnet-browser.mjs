// Wallet UI + durable signer integration on a Sepolia-tagged LOCAL simulator.
// No extension credentials or public-chain funds are used by this test.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import ganache from 'ganache';
import {JsonRpcProvider,HDNodeWallet} from '../demo/deps.mjs';
import {DEV_MNEMONIC} from '../demo/dev.mjs';
import {serveTestnet} from '../../testnet/server.mjs';
import {DurableWitness} from '../../witness/durable.mjs';
const require=createRequire(import.meta.url),{chromium}=require(process.env.LORROW_PLAYWRIGHT_MODULE??'playwright');
const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lorrow-wallet-'));
const chain=ganache.server({logging:{quiet:true},wallet:{mnemonic:DEV_MNEMONIC},chain:{chainId:11155111,hardfork:'shanghai'},miner:{timestampIncrement:0}});
await chain.listen(0,'127.0.0.1');
const provider=new JsonRpcProvider(`http://127.0.0.1:${chain.address().port}`,undefined,{cacheTimeout:-1});provider.pollingInterval=20;
let app,browser;const accounts=[1,2,4,5,6].map(i=>HDNodeWallet.fromPhrase(DEV_MNEMONIC,undefined,`m/44'/60'/0'/0/${i}`));let selected=accounts[0].address;
const output=new URL('../artifacts/',import.meta.url);await fs.mkdir(output,{recursive:true});
try {
 app=await serveTestnet({port:0,directory:path.join(temp,'site')});browser=await chromium.launch({headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.exposeFunction('localWalletRequest',async({method,params=[]})=>{
  if(method==='eth_requestAccounts'||method==='eth_accounts')return [selected];
  if(method==='wallet_switchEthereumChain')return null;
  return chain.provider.request({method,params});
 });
 await page.addInitScript(()=>{const handlers={};window.ethereum={request:request=>window.localWalletRequest(request),on:(type,handler)=>{(handlers[type]??=[]).push(handler);}};
  window.simulateAccountChange=addresses=>(handlers.accountsChanged??[]).forEach(fn=>fn(addresses));});
 await page.goto(app.url);
 async function idle(){await page.waitForFunction(()=>!document.getElementById('notice').textContent.includes('Waiting')&&!document.getElementById('connect').disabled);assert.equal(await page.locator('#notice').evaluate(el=>el.classList.contains('error')),false,await page.locator('#notice').textContent());}
 await page.locator('#connect').click();await idle();
 await page.locator('#lender').fill(accounts[1].address);await page.locator('#committee').fill(accounts.slice(2).map(w=>w.address).join('\n'));
 await page.locator('#terms-form details summary').click();await page.locator('#exit-delay').fill('10');
 const manifestDownload=page.waitForEvent('download');await page.locator('#deploy').click();const download=await manifestDownload;
 const manifest=JSON.parse(await fs.readFile(await download.path(),'utf8'));await idle();assert.equal(await page.locator('#phase').textContent(),'Awaiting funding');
 const draft=await page.evaluate(()=>localStorage.getItem('lorrow:sepolia:deployment-draft:v1'));assert.equal(draft,null);
 selected=accounts[1].address;await page.evaluate(a=>window.simulateAccountChange([a]),selected);await idle();
 await page.locator('[data-action="fund"]').click();await idle();assert.equal(await page.locator('#phase').textContent(),'Loan active');
 selected=accounts[0].address;await page.evaluate(a=>window.simulateAccountChange([a]),selected);await idle();
 await page.locator('[data-action="claimPayment"]').click();await idle();await page.locator('[data-action="repay"]').click();await idle();
 for(let i=0;i<3;i++)await provider.send('evm_mine',[]);
 const requested=page.waitForEvent('download');await page.locator('#export-proposal').click();const proposalDownload=await requested;
 const request=JSON.parse(await fs.readFile(await proposalDownload.path(),'utf8'));await idle();
 // Explicit fixture finality: provider tag resolves to head-minus-two. This is not
 // an assertion that Ganache implements Ethereum consensus finality.
 const finalProvider=new Proxy(provider,{get(target,key){if(key==='getBlock')return async tag=>tag==='finalized'?target.getBlock(Number(BigInt(await target.send('eth_blockNumber',[])))-2):target.getBlock(tag);const value=target[key];return typeof value==='function'?value.bind(target):value;}});
 const signatureFiles=[];
 for(let i=2;i<4;i++){
  const witness=new DurableWitness({provider:finalProvider,artifacts:app.artifacts,manifest,wallet:accounts[i],journal:path.join(temp,`witness-${i}.jsonl`)});
  try{const record=await witness.sign(request);const file=path.join(temp,`signature-${i}.json`);await fs.writeFile(file,JSON.stringify(record));signatureFiles.push(file);}finally{witness.close();}
 }
 await page.locator('#load-signatures').setInputFiles(signatureFiles);await idle();assert.match(await page.locator('#signature-status').textContent(),/2 matching/);
 await page.locator('#queue').click();await idle();assert.equal(await page.locator('#phase').textContent(),'Exit queued');
 assert.equal(await page.locator('[data-action="execute"]').isDisabled(),true);
 await provider.send('evm_increaseTime',[11]);await provider.send('evm_mine',[]);await page.locator('#refresh').click();await idle();
 await page.locator('[data-action="execute"]').click();await idle();assert.equal(await page.locator('#phase').textContent(),'Settled');
 await page.locator('[data-action="claimCollateral"]').click();await idle();
 await page.screenshot({path:fileURLToPath(new URL('testnet-wallet-desktop.png',output)),fullPage:true});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:fileURLToPath(new URL('testnet-wallet-mobile.png',output)),fullPage:true});
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 console.log('WALLET BROWSER PASS: injected wallet connect, borrower deployment, source/runtime verification, account switching, funding/repayment, durable witness file exchange, delayed settlement, claims and mobile layout. LOCAL simulator only.');
}finally{await browser?.close();await app?.close();provider.destroy();await chain.close();await fs.rm(temp,{recursive:true,force:true});}
