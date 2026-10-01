import assert from 'node:assert/strict';
import http from 'node:http';
import {createWalkthrough} from '../demo/server.mjs';
import {evaluate,termsCommitment} from '../../witness/model.mjs';
const app=await createWalkthrough({port:0});
let state,count=0;
const pass=name=>console.log(`WALKTHROUGH PASS ${++count}: ${name}`);
async function get(){const r=await fetch(`${app.url}/api/state`);assert.equal(r.status,200);state=await r.json();return state;}
async function action(name,{expected=200,...fields}={}) {
 const r=await fetch(`${app.url}/api/action`,{method:'POST',headers:{'Content-Type':'application/json','X-Lorrow-Token':state.token},body:JSON.stringify({session:state.session,action:name,...fields})});
 const data=await r.json();assert.equal(r.status,expected,JSON.stringify(data));if(r.ok)state=data;return data;
}
try {
 await get();assert.equal(state.phase,'Awaiting funding');assert.equal(state.witnesses.length,3);
 assert.equal(new Set(state.witnesses.map(w=>w.pid)).size,3);
 const page=await fetch(app.url);assert.equal(page.status,200);assert.match(await page.text(),/Follow the funds/);
 assert.match(page.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 const script=await fetch(`${app.url}/app.js`);assert.equal(script.status,200);
 pass('browser assets, isolated local chain, and three separate witness processes');
 for(const headers of [{},{'Content-Type':'text/plain','X-Lorrow-Token':state.token},{'Content-Type':'application/json','X-Lorrow-Token':state.token,Origin:'https://example.com'}]){
  const r=await fetch(`${app.url}/api/action`,{method:'POST',headers,body:JSON.stringify({action:'fund',session:state.session})});assert.equal(r.status,403);
 }
 await action('fund',{expected:400,session:'stale'});
 const hostile=await new Promise((resolve,reject)=>{http.get(`${app.url}/api/state`,{headers:{Host:'example.com'}},r=>{r.resume();resolve(r.statusCode);}).on('error',reject);});assert.equal(hostile,403);
 pass('foreign origin, incorrect Host, missing token, non-JSON and stale loan requests rejected');
 // Two simultaneous funding requests must never both execute.
 const results=await Promise.all([1,2].map(()=>fetch(`${app.url}/api/action`,{method:'POST',headers:{'Content-Type':'application/json','X-Lorrow-Token':state.token},body:JSON.stringify({action:'fund',session:state.session})})));
 assert.equal(results.filter(r=>r.ok).length,1);assert(results.some(r=>r.status===409||r.status===400));
 await get();assert.equal(state.credits.principal,'1.0');await action('claimPrincipal');
 await action('repay');assert.equal(state.phase,'Repaid');await action('claimRepayment');
 await action('rejectExcess');assert(state.witnesses.every(w=>w.result&&!w.result.ok));assert.equal(state.approval,null);
 await action('approve');assert.equal(state.approval.count,3);
 await action('queue');assert(state.pending);assert.equal(state.flags.execute,false);
 await action('execute',{expected:400});await action('advanceDelay');await action('execute');
 assert.equal(state.credits.borrowerCollateral,'3.0');assert.equal(state.credits.lenderCollateral,'0.0');
 await action('claimBorrower');assert.equal(state.credits.borrowerCollateral,'0.0');await action('claimBorrower',{expected:400});
 pass('repayment HTTP lifecycle, concurrent funding guard, incorrect payout refusal, delayed exit and single claims');
 await action('reset');await action('fund');await action('claimPrincipal');await action('advanceDefault');
 assert.equal(state.phase,'Default');assert.equal(state.allocation.lender,'1.1');assert.equal(state.allocation.borrower,'1.9');
 await action('repay',{expected:400});
 const proposal=await app.getProposal();
 const worker=app.workers[0];
 for(const p of [{...proposal,nonce:String(BigInt(proposal.nonce)+1n)},{...proposal,stateHash:`0x${'00'.repeat(32)}`},{...proposal,deadline:'1'},{...proposal,lenderAmount:String(BigInt(proposal.lenderAmount)+1n)}]){
  const response=await worker.request('approve',{proposal:p});assert.equal(response.ok,false);assert.equal(response.signature,undefined);
 }
 const corrupted={...app.getConfig(),loanCodeHash:`0x${'00'.repeat(32)}`};
 assert.equal((await worker.request('register',{config:corrupted})).ok,false);
 assert.equal((await worker.request('approve',{proposal})).ok,true);
 pass('witness refuses wrong nonce, state, deadline, payout and changed code; failed registration preserves trusted loan');
 await action('approve');await action('queue');const oldNonce=state.pending.nonce;
 await action('veto');assert.equal(state.pending,null);assert.equal(state.flags.execute,false);
 await action('approve');await action('queue');assert.equal(state.pending.nonce,oldNonce+1);
 assert.equal((await worker.request('veto',{nonce:oldNonce,reason:'demo_operator_cancel'})).ok,false);
 await action('advanceDelay');await action('execute');assert.equal(state.credits.lenderCollateral,'1.1');assert.equal(state.credits.borrowerCollateral,'1.9');
 await action('claimLender');await action('claimBorrower');await action('fund',{expected:400});
 pass('default lifecycle: debt cap, veto, fresh nonce/delay, stale veto refusal and surplus claims');
 await action('reset');await action('expireFunding');assert.equal(state.phase,'Unfunded expiry');await action('fund',{expected:400});
 await action('approve');await action('queue');await action('expireProposal');
 await action('execute',{expected:400});await action('clear');await action('approve');await action('queue');
 await action('advanceDelay');await action('execute');await action('claimBorrower');
 assert.equal(state.credits.borrowerCollateral,'0.0');
 pass('unfunded expiry returns all collateral and rejects late funding');
 const c=app.getConfig(),t=c.terms;
 const sample={chainId:31337n,borrower:c.borrower,lender:c.lender,vault:c.vault,policy:c.loan,
  ...Object.fromEntries(Object.entries(t).filter(([k])=>k!=='lender').map(([k,v])=>[k,BigInt(v)])),
  debt:BigInt(t.principal)+BigInt(t.interest),collateral:BigInt(c.collateral),termsHash:termsCommitment(c),vaultTerms:termsCommitment(c),
  loanCodeHash:c.loanCodeHash,vaultCodeHash:c.vaultCodeHash,committee:[true,true,true],funded:true,repaid:false,fundedAt:BigInt(t.fundingDeadline),
  dueAt:BigInt(t.fundingDeadline)+BigInt(t.duration),settled:false};
 const endpoint=sample.dueAt+sample.grace;
 assert.equal(evaluate({...sample,timestamp:endpoint},c).eligible,false);
 assert.equal(evaluate({...sample,timestamp:endpoint+1n},c).lenderAmount,sample.debt);
 assert.equal(evaluate({...sample,timestamp:endpoint+1n,repaid:true},c).lenderAmount,0n);
 assert.throws(()=>evaluate({...sample,timestamp:endpoint+1n,debt:sample.debt+1n},c),/debt/);
 assert.throws(()=>evaluate({...sample,timestamp:endpoint+1n,chainId:1n},c),/chain/);
 assert.throws(()=>evaluate({...sample,timestamp:endpoint+1n,dueAt:sample.dueAt+1n},c),/clock/);
 pass('independent model exact grace boundary, repayment priority and immutable term checks');
 await action('reset');await action('fund');await action('repay');
 await app.workers[0].stop();await get();assert.equal(state.witnesses.filter(w=>w.alive).length,2);
 await action('approve');assert.equal(state.approval.count,2);await action('queue');await action('veto');
 await app.workers[1].stop();await get();await action('approve',{expected:400});await get();assert.equal(state.approval,null);assert.equal(state.settled,false);assert.equal(state.pending,null);
 pass('one offline witness permits quorum; two offline witnesses block exit without bypass');
 console.log(`Complete: ${count} walkthrough scenario groups passed.`);
} finally {await app.close();}
