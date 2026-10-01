import {BrowserProvider,ContractFactory,Contract,Interface,parseEther,formatEther,getAddress,recoverAddress} from '../contracts/demo/deps.mjs';
import {allowedChain,validatePlan,verifyDeployment,verifyCreation} from '../testnet/verify.mjs';
import {readChain} from '../witness/read-chain.mjs';
import {evaluate,approvalDigest,vetoDigest} from '../witness/model.mjs';
const $=id=>document.getElementById(id),stringify=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v,2);
const artifacts=await(await fetch(new URL('../artifacts.json',import.meta.url))).json();
let provider,account,manifest,config,snapshot,model,busy=false,approvals=[],vetoSignature=null;
const draftKey='lorrow:sepolia:deployment-draft:v1';
function message(text,error=false){$('notice').textContent=text;$('notice').className='notice'+(error?' error':'');}
function download(name,data){const url=URL.createObjectURL(new Blob([stringify(data)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function event(text,hash){const li=document.createElement('li'),kind=document.createElement('span'),body=document.createElement('div');kind.className='event-kind';kind.textContent='transaction';body.textContent=text;if(hash){const a=document.createElement('a');a.href=`https://sepolia.etherscan.io/tx/${hash}`;a.textContent=hash;a.target='_blank';a.rel='noopener';body.append(document.createElement('br'),a);}li.append(kind,body);$('events').prepend(li);}
function storedDraft(){try{return JSON.parse(localStorage.getItem(draftKey));}catch{return null;}}
function render(){
 $('connect').disabled=busy;$('deploy').disabled=busy||!provider||!!manifest||!!storedDraft();$('resume').disabled=busy||!provider||!storedDraft();
 $('refresh').disabled=busy||!provider;$('export-manifest').disabled=busy||!manifest;
 $('load-manifest').disabled=busy||!provider;$('load-signatures').disabled=busy||!config;
 const ready=!!config&&!!snapshot&&!busy,role=ready?account.toLowerCase():'';
 for(const b of document.querySelectorAll('[data-action]')){
  const a=b.dataset.action;let enabled=false;
  if(ready){if(a==='fund')enabled=role===config.lender.toLowerCase()&&!snapshot.funded&&!snapshot.settled&&snapshot.timestamp<=snapshot.fundingDeadline;
   if(a==='repay')enabled=role===config.borrower.toLowerCase()&&snapshot.funded&&!snapshot.repaid&&!snapshot.settled&&snapshot.timestamp<=snapshot.dueAt+snapshot.grace;
   if(a==='claimPayment')enabled=snapshot.myPayment>0n;
   if(a==='execute')enabled=!snapshot.settled&&snapshot.pending.readyAt>0n&&snapshot.timestamp>=snapshot.pending.readyAt&&snapshot.timestamp<=snapshot.pending.deadline;
   if(a==='claimCollateral')enabled=snapshot.myCollateral>0n;
   if(a==='clear')enabled=snapshot.pending.readyAt>0n&&snapshot.timestamp>snapshot.pending.deadline;}
  b.disabled=!enabled;
 }
 $('export-proposal').disabled=!ready||!model.eligible||snapshot.pending.readyAt>0n;
 $('queue').disabled=!ready||approvals.length<2||!model.eligible||snapshot.pending.readyAt>0n;
 $('export-veto').disabled=!ready||snapshot.pending.readyAt===0n;
 $('veto').disabled=!ready||!vetoSignature||snapshot.pending.readyAt===0n;
 if(!ready)return;
 $('phase').textContent=snapshot.pending.readyAt>0n?'Exit queued':model.reason;
 $('summary').textContent='Constructor and runtime match the compiled source. Two signatures approve; one signature can veto.';
 $('loan-state').replaceChildren();
 const rows=[['Principal',formatEther(snapshot.principal)+' ETH'],['Debt',formatEther(snapshot.debt)+' ETH'],['Collateral',formatEther(snapshot.collateral)+' ETH'],['My payment credit',formatEther(snapshot.myPayment)+' ETH'],['My collateral credit',formatEther(snapshot.myCollateral)+' ETH'],['Eligible lender allocation',model.eligible?formatEther(model.lenderAmount)+' ETH':'—'],['Proposal nonce',snapshot.pending.readyAt>0n?snapshot.pending.nonce.toString():'None'],['Delay remaining',snapshot.pending.readyAt>0n?Math.max(0,Number(snapshot.pending.readyAt-snapshot.timestamp))+'s':'—']];
 for(const [label,value]of rows){const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;div.append(dt,dd);$('loan-state').append(div);}
 $('timing').textContent=`Chain block ${Number(BigInt(snapshot.blockNumber))}. ${new Date(Number(snapshot.timestamp)*1000).toLocaleString()}. Approvals require finalized state; testnet time cannot be accelerated.`;
 $('addresses').replaceChildren();for(const [name,address]of [['Loan',config.loan],['Vault',config.vault]]){const a=document.createElement('a');a.textContent=`${name}: ${address}`;a.href=`https://sepolia.etherscan.io/address/${address}`;a.target='_blank';a.rel='noopener';$('addresses').append(a);}
 $('signature-status').textContent=`${approvals.length} matching approval signatures; ${vetoSignature?'1 veto':'no veto'} loaded.`;
}
async function checkChain(){if(!provider)throw new Error('Connect a wallet');allowedChain(BigInt(await provider.send('eth_chainId',[])));const accounts=await provider.send('eth_accounts',[]);if(!accounts.length)throw new Error('Wallet is locked or disconnected. Reconnect to continue.');account=getAddress(accounts[0]);$('account').textContent=`Connected: ${account} · Sepolia`;} 
async function refresh(){await checkChain();if(manifest){validatePlan(manifest,11155111,manifest.borrower);const report=await verifyDeployment(provider,artifacts,manifest);config=report.config;snapshot=await readChain(provider,artifacts,config);model=evaluate(snapshot,config);
 const loan=new Contract(config.loan,artifacts.loan.abi,provider),vault=new Contract(config.vault,artifacts.vault.abi,provider),tag={blockTag:snapshot.blockNumber};
 [snapshot.myPayment,snapshot.myCollateral]=await Promise.all([loan.paymentCredit(account,tag),vault.credit(account,tag)]);
 if(approvals.length&&(!model.eligible||approvals[0].proposal.stateHash!==model.stateHash||BigInt(approvals[0].nonce)!==snapshot.nonce+1n||BigInt(approvals[0].proposal.deadline)<=snapshot.timestamp+snapshot.exitDelay))approvals=[];
 if(vetoSignature&&snapshot.pending.nonce!==BigInt(vetoSignature.nonce))vetoSignature=null;
 }render();}
async function run(fn){if(busy)return;busy=true;render();message('Waiting for verification or wallet confirmation…');let failure;
 try{await fn();}catch(error){failure=error.shortMessage??error.message;}
 finally{busy=false;if(provider){try{await refresh();}catch(error){config=null;snapshot=null;model=null;failure=error.shortMessage??error.message;}}render();
  message(failure??'Ready. Use test ETH only. Save deployment and signature files for the other participants.',!!failure);
 }
}
$('connect').addEventListener('click',()=>run(async()=>{
 if(!window.ethereum)throw new Error('Install or enable a browser wallet with Sepolia support');
 await window.ethereum.request({method:'eth_requestAccounts'});
 if(BigInt(await window.ethereum.request({method:'eth_chainId'}))!==11155111n)await window.ethereum.request({method:'wallet_switchEthereumChain',params:[{chainId:'0xaa36a7'}]});
 provider=new BrowserProvider(window.ethereum,undefined,{cacheTimeout:-1});provider.pollingInterval=1000;await checkChain();
}));
async function deploy(resume=false){
 await checkChain();const signer=await provider.getSigner();let draft=resume?storedDraft():null;
 if(!draft){const block=await provider.getBlock('latest');
  const plan=validatePlan({collateral:parseEther($('collateral').value).toString(),witnesses:$('committee').value.split(/[\s,]+/).filter(Boolean),terms:{lender:getAddress($('lender').value.trim()),principal:parseEther($('principal').value).toString(),interest:parseEther($('interest').value).toString(),duration:$('duration').value,grace:$('grace').value,fundingDeadline:String(block.timestamp+172800),exitDelay:$('exit-delay').value,approvalThreshold:'2',vetoThreshold:'1'}},11155111,account);
  const loan=await new ContractFactory(artifacts.loan.abi,artifacts.loan.evm.bytecode.object,signer).deploy(plan.terms,plan.witnesses,{chainId:11155111});
  draft={...plan,chainId:11155111,borrower:account,loan:await loan.getAddress(),creationTxHash:loan.deploymentTransaction().hash};
  localStorage.setItem(draftKey,stringify(draft));event('Loan creation broadcast',draft.creationTxHash);
 }
 if(draft.borrower.toLowerCase()!==account.toLowerCase())throw new Error('Switch to the borrower account to resume');
 const creation=await provider.getTransaction(draft.creationTxHash);if(!creation)throw new Error('Creation transaction unavailable; try again later');
 const iface=new Interface(artifacts.loan.abi),expected='0x'+artifacts.loan.evm.bytecode.object+iface.encodeDeploy([draft.terms,draft.witnesses]).slice(2);
 if(creation.data.toLowerCase()!==expected.toLowerCase()||creation.from.toLowerCase()!==account.toLowerCase())throw new Error('Saved creation differs from compiled terms');
 const created=await creation.wait();if(created.status!==1)throw new Error('Creation reverted');
 validatePlan(draft,11155111,account);await verifyCreation(provider,artifacts,draft);
 const loan=new Contract(draft.loan,artifacts.loan.abi,signer);
 if(!draft.openTxHash){const transaction=await loan.openVault({value:draft.collateral,chainId:11155111});draft.openTxHash=transaction.hash;localStorage.setItem(draftKey,stringify(draft));event('Collateral lock broadcast',transaction.hash);}
 const opening=await provider.getTransaction(draft.openTxHash);if(!opening)throw new Error('Collateral transaction unavailable; try again later');
 const opened=await opening.wait();if(opened.status!==1){delete draft.openTxHash;localStorage.setItem(draftKey,stringify(draft));throw new Error('Collateral lock reverted. Resume to try it again.');}
 draft.vault=await loan.vault();const report=await verifyDeployment(provider,artifacts,draft);
 manifest=report.config;config=report.config;localStorage.removeItem(draftKey);download('lorrow-deployment.json',manifest);event('Deployment and bytecode verified',draft.openTxHash);
}
$('terms-form').addEventListener('submit',e=>{e.preventDefault();run(()=>deploy());});$('resume').addEventListener('click',()=>run(()=>deploy(true)));
$('refresh').addEventListener('click',()=>run(refresh));
$('export-manifest').addEventListener('click',()=>download('lorrow-deployment.json',manifest));
$('load-manifest').addEventListener('change',e=>run(async()=>{const candidate=JSON.parse(await e.target.files[0].text());validatePlan(candidate,11155111,candidate.borrower);const report=await verifyDeployment(provider,artifacts,candidate);manifest=report.config;config=report.config;approvals=[];vetoSignature=null;}));
function envelope(type){return {type,chainId:11155111,loan:config.loan,vault:config.vault};}
$('export-proposal').addEventListener('click',()=>run(async()=>{await refresh();if(!model.eligible||snapshot.pending.readyAt>0n)throw new Error('No eligible unqueued exit');download('lorrow-approval-request.json',{...envelope('approve'),proposal:{nonce:(snapshot.nonce+1n).toString(),lenderAmount:model.lenderAmount.toString(),stateHash:model.stateHash,deadline:(snapshot.timestamp+7200n).toString()}});}));
$('export-veto').addEventListener('click',()=>download('lorrow-veto-request.json',{...envelope('veto'),nonce:snapshot.pending.nonce.toString(),reason:'operator_cancel'}));
$('load-signatures').addEventListener('change',e=>run(async()=>{
 await refresh();const incoming=await Promise.all([...e.target.files].map(async f=>JSON.parse(await f.text()))),next=[...approvals];let nextVeto=vetoSignature;
 for(const r of incoming){if(BigInt(r.chainId)!==11155111n||r.vault.toLowerCase()!==config.vault.toLowerCase())throw new Error('Signature is for a different chain/vault');
  let digest;if(r.type==='approve'){
   if(!model.eligible||BigInt(r.nonce)!==snapshot.nonce+1n||BigInt(r.proposal.nonce)!==snapshot.nonce+1n||r.proposal.stateHash!==model.stateHash||BigInt(r.proposal.lenderAmount)!==model.lenderAmount||BigInt(r.proposal.deadline)<=snapshot.timestamp+snapshot.exitDelay)throw new Error('Approval is stale or incorrect');
   digest=approvalDigest(config,r.proposal);if(next.length&&approvalDigest(config,next[0].proposal)!==digest)throw new Error('Approval files do not match the same proposal');
  }else if(r.type==='veto'){if(snapshot.pending.readyAt===0n||BigInt(r.nonce)!==snapshot.pending.nonce)throw new Error('Veto is not for the current proposal');digest=vetoDigest(config,r.nonce);}else throw new Error('Unknown signature type');
  const signer=recoverAddress(digest,r.signature);if(signer.toLowerCase()!==r.address.toLowerCase()||!config.witnesses.some(w=>w.toLowerCase()===signer.toLowerCase())||r.digest!==digest)throw new Error('Invalid witness signature');
  if(r.type==='veto')nextVeto=r;else if(!next.some(x=>x.address.toLowerCase()===signer.toLowerCase()))next.push(r);
 }
 approvals=next.sort((a,b)=>BigInt(a.address)<BigInt(b.address)?-1:1);vetoSignature=nextVeto;
}));
async function send(label,method){await checkChain();const transaction=await method();event(label,transaction.hash);const receipt=await transaction.wait();if(receipt.status!==1)throw new Error('Transaction reverted');}
$('queue').addEventListener('click',()=>run(async()=>{await refresh();if(approvals.length<2)throw new Error('Two matching signatures required');const signer=await provider.getSigner(),vault=new Contract(config.vault,artifacts.vault.abi,signer),p=approvals[0].proposal;
 await send('Queue settlement',()=>vault.queueSettlement(p.lenderAmount,p.deadline,approvals.map(r=>r.signature),{chainId:11155111}));approvals=[];}));
$('veto').addEventListener('click',()=>run(async()=>{await refresh();if(!vetoSignature)throw new Error('Matching veto signature required');const vault=new Contract(config.vault,artifacts.vault.abi,await provider.getSigner());await send('Veto settlement',()=>vault.veto([vetoSignature.signature],{chainId:11155111}));vetoSignature=null;approvals=[];}));
for(const b of document.querySelectorAll('[data-action]'))b.addEventListener('click',()=>run(async()=>{await refresh();const signer=await provider.getSigner(),loan=new Contract(config.loan,artifacts.loan.abi,signer),vault=new Contract(config.vault,artifacts.vault.abi,signer);
 const methods={fund:()=>loan.fund({value:snapshot.principal,chainId:11155111}),repay:()=>loan.repay({value:snapshot.debt,chainId:11155111}),claimPayment:()=>loan.claimPayment({chainId:11155111}),execute:()=>vault.executeSettlement({chainId:11155111}),claimCollateral:()=>vault.claim({chainId:11155111}),clear:()=>vault.clearInvalid({chainId:11155111})};await send(b.textContent,methods[b.dataset.action]);}));
window.ethereum?.on?.('accountsChanged',()=>{approvals=[];vetoSignature=null;if(!busy)run(refresh);});
window.ethereum?.on?.('chainChanged',()=>{provider?.destroy();provider=null;config=null;snapshot=null;model=null;approvals=[];vetoSignature=null;account=null;$('account').textContent='Network changed. Reconnect on Sepolia.';message('Reconnect your wallet after a network change.');render();});
render();
