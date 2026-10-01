const $=id=>document.getElementById(id);
let state,path='repayment',working=false,lastError='',refreshing=false;
const paths={
 repayment:{help:'Fund the loan, repay the fixed debt, then release all collateral back to the borrower.',steps:[
  ['Fund the loan','The named lender provides 1 test ETH.',['fund','Fund as lender']],
  ['Withdraw the principal','The borrower claims the funded principal.',['claimPrincipal','Withdraw 1 ETH']],
  ['Repay the loan','Pay the fixed principal plus 0.1 test ETH interest.',['repay','Repay 1.1 ETH'],['claimRepayment','Lender claims payment']],
  ['Ask the witnesses','Each process checks the chain and exact zero-lender allocation.',['approve','Request approvals']],
  ['Queue the exit','Submit the signatures; the 20-second exit delay begins.',['queue','Queue settlement']],
  ['Wait, then allocate','Advance test time to the delay endpoint, then execute.',['advanceDelay','Advance 20s delay'],['execute','Execute settlement']],
  ['Withdraw collateral','All 3 test ETH go back to the borrower.',['claimBorrower','Borrower claims 3 ETH']]]},
 default:{help:'Leave the loan unpaid past grace. The lender recovers only 1.1 ETH; 1.9 ETH returns to the borrower.',steps:[
  ['Fund the loan','The named lender provides 1 test ETH.',['fund','Fund as lender']],
  ['Withdraw the principal','The borrower claims the funded principal.',['claimPrincipal','Withdraw 1 ETH']],
  ['Move past grace','Advance to one second after maturity plus grace.',['advanceDefault','Advance to default']],
  ['Ask the witnesses','Witnesses independently verify the debt cap and surplus.',['approve','Request approvals']],
  ['Queue the exit','An approved default still needs the full exit delay.',['queue','Queue settlement']],
  ['Wait, then allocate','You can test a veto below before proceeding.',['advanceDelay','Advance 20s delay'],['execute','Execute settlement']],
  ['Claim the exact allocation','Lender receives debt. Borrower retains the surplus.',['claimLender','Lender claims 1.1 ETH'],['claimBorrower','Borrower claims 1.9 ETH']]]},
 expiry:{help:'Do not fund the loan. After the funding window closes, witnesses can approve return of all collateral.',steps:[
  ['Let funding expire','Advance past the five-minute funding window.',['expireFunding','Expire funding window']],
  ['Ask the witnesses','No loan was funded, so the lender receives no collateral.',['approve','Request approvals']],
  ['Queue the exit','Submit approvals and start the exit delay.',['queue','Queue settlement']],
  ['Wait, then allocate','Advance test time, then execute the approved exit.',['advanceDelay','Advance 20s delay'],['execute','Execute settlement']],
  ['Withdraw collateral','The borrower recovers all 3 test ETH.',['claimBorrower','Borrower claims 3 ETH']]]}
};
function element(tag,className,text){const el=document.createElement(tag);if(className)el.className=className;if(text!==undefined)el.textContent=text;return el;}
function button(action,label){const b=element('button','button',label);b.dataset.action=action;b.disabled=working||state.busy||!state.flags[action];return b;}
function render() {
 if(!state)return;
 for(const id of ['principal','interest','collateral'])$(id).textContent=state[id];
 $('phase').textContent=state.pending?'Exit queued':state.phase;
 const explanations={'Awaiting funding':'Collateral is locked. Only the named lender can fund this loan.','Loan active':'Repayment remains available through maturity and grace. No collateral exit is eligible yet.',Repaid:'Debt has been repaid. Witnesses can authorize return of all collateral.',Default:'Grace has ended without repayment. Witnesses can authorize recovery of the agreed debt.','Unfunded expiry':'The funding window closed. All collateral can be returned to the borrower.',Settled:'Collateral has been allocated once. Each recipient can withdraw their own credit.'};
 $('state-description').textContent=state.pending?'An approved allocation is waiting. A witness veto can still cancel this proposal.':explanations[state.phase];
 $('lender-allocation').textContent=state.allocation.eligible||state.settled?`${state.allocation.lender} ETH`:'—';
 $('borrower-allocation').textContent=state.allocation.eligible||state.settled?`${state.allocation.borrower} ETH`:'—';
 $('eligibility').textContent=state.settled?'Allocation is final. Claims are separate.':state.allocation.eligible?'Eligible under the loan rules. Quorum and delay still required.':'No allocation eligible yet.';
 for(const [id,key]of [['principal-credit','principal'],['repayment-credit','repayment'],['borrower-credit','borrowerCollateral'],['lender-credit','lenderCollateral']])$(id).textContent=`${state.credits[key]} ETH`;
 $('proposal').textContent=state.pending?`Queued · nonce ${state.pending.nonce}`:state.approval?`${state.approval.count} approvals collected`:'None';
 $('delay').textContent=state.pending?`${Math.max(0,state.pending.readyAt-state.timestamp)}s`:'—';
 $('block').textContent=`Local chain ${state.chainId} · block ${state.block}`;
 $('clock').textContent=new Date(state.timestamp*1000).toLocaleString();
 $('path-help').textContent=paths[path].help;
 document.querySelectorAll('[data-path]').forEach(b=>{b.setAttribute('aria-selected',String(b.dataset.path===path));b.tabIndex=b.dataset.path===path?0:-1;});
 $('steps').setAttribute('aria-labelledby',`tab-${path}`);$('steps').replaceChildren();
 paths[path].steps.forEach(([title,description,...actions],i)=>{
  const row=element('div','step'+(actions.some(([a])=>state.flags[a])?' available':''));
  row.append(element('span','step-number',String(i+1)));const copy=element('div');copy.append(element('h3',null,title),element('p',null,description));row.append(copy);
  const controls=element('div','step-actions');actions.forEach(([action,label])=>controls.append(button(action,label)));row.append(controls);$('steps').append(row);
 });
 document.querySelectorAll('[data-action]').forEach(b=>b.disabled=working||state.busy||!state.flags[b.dataset.action]);
 $('witnesses').replaceChildren();state.witnesses.forEach((w,i)=>{
  const card=element('div','witness-card'),top=element('div','topline');
  const verdict=!w.alive?'Offline':w.result?(w.result.ok?'Signed':'Refused'):'Ready';
  top.append(element('h3',null,`Witness ${i+1}`),element('span','verdict'+(verdict==='Refused'||verdict==='Offline'?' rejected':''),verdict));
  card.append(top,element('code',null,`${w.address.slice(0,10)}…${w.address.slice(-6)} · process ${w.pid}`),element('p',null,w.result?(w.result.ok?`Verified ${w.result.reason.toLowerCase()} at block ${Number(BigInt(w.result.blockNumber))}.`:w.result.error):'Waiting for a proposal to verify.'));$('witnesses').append(card);
 });
 $('events').replaceChildren();state.events.forEach(e=>{const li=element('li');li.append(element('span','event-kind',e.kind));const text=element('div',null,e.message);if(e.hash)text.append(element('code',null,e.hash));li.append(text);$('events').append(li);});
 $('addresses').replaceChildren();for(const key of ['loan','vault','borrower','lender'])$('addresses').append(element('dt',null,key[0].toUpperCase()+key.slice(1)),element('dd',null,state[key]));
 $('notice').className='notice'+(lastError?' error':'');
 $('notice').textContent=working?'Processing your local action…':lastError||'Connected. Test ETH only. Select a path; use “New test loan” to start another scenario.';
}
async function refresh() {
 if(working||refreshing)return;refreshing=true;
 try{const res=await fetch('/api/state');const data=await res.json();if(!res.ok)throw new Error(data.error);state=data;if(lastError.startsWith('Connection unavailable:'))lastError='';render();}
 catch(e){lastError=`Connection unavailable: ${e.message}. Check that the walkthrough terminal is still running.`;if(state)render();else{$('notice').textContent=lastError;$('notice').className='notice error';}}
 finally{refreshing=false;}
}
document.addEventListener('click',async event=>{
 const tab=event.target.closest('[data-path]');if(tab){path=tab.dataset.path;render();return;}
 const b=event.target.closest('[data-action]');if(!b||b.disabled||!state||working)return;
 working=true;lastError='';render();
 try{const response=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json','X-Lorrow-Token':state.token},body:JSON.stringify({action:b.dataset.action,session:state.session})});const data=await response.json();if(!response.ok)throw new Error(data.error);state=data;}
 catch(e){lastError=e.message;}
 finally{working=false;await refresh();render();}
});
document.querySelector('.tabs').addEventListener('keydown',event=>{
 if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
 const keys=Object.keys(paths),index=keys.indexOf(path);event.preventDefault();
 path=event.key==='Home'?keys[0]:event.key==='End'?keys.at(-1):keys[(index+(event.key==='ArrowRight'?1:keys.length-1))%keys.length];
 render();document.querySelector(`[data-path="${path}"]`).focus();
});
refresh();setInterval(refresh,2500);
