import http from 'node:http';
import fs from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {randomBytes} from 'node:crypto';
import ganache from 'ganache';
import {JsonRpcProvider,ContractFactory,Contract,HDNodeWallet,keccak256,parseEther,formatEther} from './deps.mjs';
import {compile} from './compile.mjs';
import {DEV_MNEMONIC} from './dev.mjs';
import {WitnessClient} from './witness-client.mjs';
import {readChain} from '../../witness/read-chain.mjs';
import {evaluate,requireThat} from '../../witness/model.mjs';
const encode=x=>JSON.stringify(x,(_,v)=>typeof v==='bigint'?v.toString():v);
const txOptions={gasLimit:8000000};
const display=x=>formatEther(x);
const assetFiles={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};

export async function createWalkthrough({port=4173}={}) {
  const artifacts=compile();
  const chain=ganache.server({logging:{quiet:true},chain:{chainId:31337,hardfork:'shanghai'},miner:{timestampIncrement:0},wallet:{mnemonic:DEV_MNEMONIC,totalAccounts:10,defaultBalance:1000}});
  await chain.listen(0,'127.0.0.1');
  const rpc=`http://127.0.0.1:${chain.address().port}`;
  const provider=new JsonRpcProvider(rpc,undefined,{cacheTimeout:-1});provider.pollingInterval=20;
  const [relay,borrowerSigner,lenderSigner]=await Promise.all([0,1,2].map(i=>provider.getSigner(i)));
  const borrower=await borrowerSigner.getAddress(),lender=await lenderSigner.getAddress();
  const committee=[4,5,6].map(i=>HDNodeWallet.fromPhrase(DEV_MNEMONIC,undefined,`m/44'/60'/0'/0/${i}`).address).sort((a,b)=>BigInt(a)<BigInt(b)?-1:1);
  const workers=[4,5,6].map(i=>new WitnessClient(i));
  let config,loan,vault,session,approval=null,busy=false,closed=false,events=[],witnessResults=[];
  const token=randomBytes(24).toString('hex');
  const log=(kind,message,hash=null)=>{events.unshift({kind,message,hash});events=events.slice(0,60);};
  async function transact(label,promise) {
    const transaction=await promise,receipt=await transaction.wait();
    if(receipt.status!==1)throw new Error('Transaction failed');
    log('transaction',label,receipt.hash);return receipt;
  }
  async function reset() {
    approval=null;witnessResults=[];events=[];session=randomBytes(12).toString('hex');
    const now=BigInt((await provider.getBlock('latest')).timestamp);
    const terms={lender,principal:parseEther('1'),interest:parseEther('0.1'),duration:120n,grace:30n,
      fundingDeadline:now+300n,exitDelay:20n,approvalThreshold:2n,vetoThreshold:1n};
    loan=await new ContractFactory(artifacts.loan.abi,artifacts.loan.evm.bytecode.object,borrowerSigner).deploy(terms,committee,txOptions);
    await loan.waitForDeployment();log('transaction','Borrower created a fixed-term loan',loan.deploymentTransaction().hash);
    const collateral=parseEther('3');await transact('Borrower locked 3 test ETH collateral',loan.openVault({...txOptions,value:collateral}));
    vault=new Contract(await loan.vault(),artifacts.vault.abi,relay);
    config={chainId:31337,borrower,lender,loan:await loan.getAddress(),vault:await vault.getAddress(),terms:JSON.parse(encode(terms)),
      witnesses:committee,collateral:collateral.toString(),loanCodeHash:keccak256(await provider.getCode(await loan.getAddress())),vaultCodeHash:keccak256(await provider.getCode(await vault.getAddress()))};
    const replies=await Promise.all(workers.filter(w=>w.alive).map(w=>w.request('register',{config})));
    requireThat(replies.length>0&&replies.every(r=>r.ok),'Witness registration failed');
    log('witness','Separate witness processes registered this loan');
  }
  async function snapshot() {
    const s=await readChain(provider,artifacts,config),m=evaluate(s,config),call={blockTag:s.blockNumber};
    if(approval&&(approval.stateHash!==m.stateHash||BigInt(approval.nonce)!==s.nonce+1n||BigInt(approval.deadline)<=s.timestamp+s.exitDelay))approval=null;
    const credits=await Promise.all([loan.paymentCredit(borrower,call),loan.paymentCredit(lender,call),vault.credit(borrower,call),vault.credit(lender,call)]);
    const pending=s.pending.readyAt!==0n;
    const flags={reset:true,fund:!s.funded&&!s.settled&&s.timestamp<=s.fundingDeadline,
      claimPrincipal:credits[0]>0n,repay:s.funded&&!s.repaid&&!s.settled&&s.timestamp<=s.dueAt+s.grace,
      claimRepayment:credits[1]>0n,advanceDefault:s.funded&&!s.repaid&&!s.settled&&s.timestamp<=s.dueAt+s.grace,
      expireFunding:!s.funded&&!s.settled&&s.timestamp<=s.fundingDeadline,
      approve:m.eligible&&!pending,queue:!!approval&&!pending&&!s.settled,
      veto:pending&&!s.settled,advanceDelay:pending&&s.timestamp<s.pending.readyAt,
      execute:pending&&!s.settled&&s.timestamp>=s.pending.readyAt&&s.timestamp<=s.pending.deadline,
      expireProposal:pending&&s.timestamp<=s.pending.deadline,clear:pending&&s.timestamp>s.pending.deadline,
      claimBorrower:credits[2]>0n,claimLender:credits[3]>0n,rejectExcess:m.eligible&&!pending};
    return {session,token,busy,phase:m.reason,chainId:31337,block:Number(BigInt(s.blockNumber)),timestamp:Number(s.timestamp),
      borrower,lender,loan:config.loan,vault:config.vault,funded:s.funded,repaid:s.repaid,settled:s.settled,
      principal:display(s.principal),interest:display(s.debt-s.principal),debt:display(s.debt),collateral:display(s.collateral),
      dueAt:Number(s.dueAt),grace:Number(s.grace),fundingDeadline:Number(s.fundingDeadline),exitDelay:Number(s.exitDelay),
      allocation:{eligible:m.eligible,lender:display(m.lenderAmount),borrower:display(s.collateral-m.lenderAmount)},
      credits:{principal:display(credits[0]),repayment:display(credits[1]),borrowerCollateral:display(credits[2]),lenderCollateral:display(credits[3])},
      pending:pending?{nonce:Number(s.pending.nonce),lender:display(s.pending.lenderAmount),readyAt:Number(s.pending.readyAt),deadline:Number(s.pending.deadline)}:null,
      approval:approval?{count:approval.signatures.length,required:2,lender:display(BigInt(approval.lenderAmount)),nonce:Number(approval.nonce)}:null,
      witnesses:workers.map(w=>({address:w.address,pid:w.child.pid,alive:w.alive,result:witnessResults.find(r=>r.address===w.address)??null})),events,flags};
  }
  async function getProposal(wrong=false) {
    const s=await readChain(provider,artifacts,config),m=evaluate(s,config);
    return {nonce:(s.nonce+1n).toString(),lenderAmount:(m.lenderAmount+(wrong?1n:0n)).toString(),stateHash:m.stateHash,deadline:(s.timestamp+600n).toString()};
  }
  async function collect(proposal) {
    const replies=await Promise.all(workers.map(async w=>{
      try{return await w.request('approve',{proposal});}catch(error){return {ok:false,address:w.address,pid:w.child.pid,error:error.message};}
    }));
    witnessResults=replies;
    replies.forEach(r=>log(r.ok?'witness':'rejected',r.ok?`Witness ${r.address.slice(0,8)} verified and signed ${r.reason}`:`Witness ${r.address?.slice(0,8)??'offline'} refused: ${r.error}`));
    return replies;
  }
  async function advance(target) {
    const current=BigInt((await provider.getBlock('latest')).timestamp);
    requireThat(target>current,'Clock is already at or past this point');
    await provider.send('evm_setTime',[Number(target)*1000]);await provider.send('evm_mine',[]);
    log('clock','Advanced the local chain clock');
  }
  async function action(name,requestSession) {
    requireThat(requestSession===session,'This loan changed. Refresh before taking another action.');
    const state=await snapshot();requireThat(Object.hasOwn(state.flags,name)&&state.flags[name],'This action is unavailable in the current loan state');
    if(name==='reset'){await reset();return;}
    // Any write/time change makes previously collected signatures stale for the UI.
    if(!['queue','approve','rejectExcess'].includes(name))approval=null;
    switch(name) {
      case 'fund':await transact('Lender funded 1 test ETH',loan.connect(lenderSigner).fund({...txOptions,value:parseEther('1')}));break;
      case 'claimPrincipal':await transact('Borrower withdrew principal',loan.connect(borrowerSigner).claimPayment(txOptions));break;
      case 'repay':await transact('Borrower repaid 1.1 test ETH',loan.connect(borrowerSigner).repay({...txOptions,value:parseEther('1.1')}));break;
      case 'claimRepayment':await transact('Lender withdrew repayment',loan.connect(lenderSigner).claimPayment(txOptions));break;
      case 'advanceDefault':await advance(BigInt(state.dueAt+state.grace+1));break;
      case 'expireFunding':await advance(BigInt(state.fundingDeadline+1));break;
      case 'advanceDelay':await advance(BigInt(state.pending.readyAt));break;
      case 'expireProposal':await advance(BigInt(state.pending.deadline+1));break;
      case 'approve': {
        const p=await getProposal(),replies=await collect(p);
        const accepted=replies.filter(r=>r.ok).sort((a,b)=>BigInt(a.address)<BigInt(b.address)?-1:1);
        requireThat(accepted.length>=2,'Approval quorum unavailable; collateral remains locked');
        approval={...p,signatures:accepted.map(r=>r.signature)};break;
      }
      case 'rejectExcess': {
        const replies=await collect(await getProposal(true));
        requireThat(replies.every(r=>!r.ok),'Incorrect payout unexpectedly signed');
        log('rejected','Incorrect payout test passed: no witness signed the extra wei');break;
      }
      case 'queue': {
        const p=approval;await transact('Witness-approved allocation queued',vault.queueSettlement(p.lenderAmount,p.deadline,p.signatures,txOptions));approval=null;break;
      }
      case 'veto': {
        const worker=workers.find(w=>w.alive);requireThat(worker,'No witness available to veto');
        const reply=await worker.request('veto',{nonce:state.pending.nonce,reason:'demo_operator_cancel'});
        requireThat(reply.ok,reply.error??'Veto refused');
        await transact('Witness vetoed the proposal; a fresh quorum and delay are required',vault.veto([reply.signature],txOptions));break;
      }
      case 'execute':await transact('Collateral allocated to fixed recipients',vault.executeSettlement(txOptions));break;
      case 'clear':await transact('Expired proposal cleared',vault.clearInvalid(txOptions));break;
      case 'claimBorrower':await transact('Borrower withdrew collateral credit',vault.connect(borrowerSigner).claim(txOptions));break;
      case 'claimLender':await transact('Lender withdrew collateral credit',vault.connect(lenderSigner).claim(txOptions));break;
      default:throw new Error('Unknown action');
    }
  }
  let server;
  async function close() {
    if(closed)return;closed=true;
    if(server?.listening)await new Promise(resolve=>server.close(resolve));
    await Promise.all(workers.map(w=>w.stop()));provider.destroy();await chain.close();
  }
  try {
    const init=await Promise.all(workers.map(w=>w.request('init',{rpc,artifacts:{loan:{abi:artifacts.loan.abi},vault:{abi:artifacts.vault.abi}}})));
    requireThat(init.every(r=>r.ok),'Witness initialization failed');await reset();
    server=http.createServer(async(req,res)=>{
      res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
      res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'");
      const json=(code,data)=>{res.writeHead(code,{'Content-Type':'application/json; charset=utf-8'});res.end(encode(data));};
      const allowedHosts=[`127.0.0.1:${server.address().port}`,`localhost:${server.address().port}`];
      if(!allowedHosts.includes(req.headers.host)){json(403,{error:'Local host required'});return;}
      const url=new URL(req.url,`http://${req.headers.host}`);
      if(req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`){json(403,{error:'Same origin required'});return;}
      try {
        if(req.method==='GET'&&url.pathname==='/api/state'){json(200,await snapshot());return;}
        if(req.method==='GET'&&Object.hasOwn(assetFiles,url.pathname)) {
          const [file,type]=assetFiles[url.pathname];const content=await fs.readFile(new URL(`../../app/${file}`,import.meta.url));
          res.writeHead(200,{'Content-Type':type});res.end(content);return;
        }
        if(req.method!=='POST'||url.pathname!=='/api/action'){json(404,{error:'Not found'});return;}
        if(req.headers['x-lorrow-token']!==token||req.headers['content-type']!=='application/json'){json(403,{error:'Local action token and JSON required'});return;}
        if(busy){json(409,{error:'Another action is running. Try again shortly.'});return;}
        let body='';for await(const chunk of req){body+=chunk;if(body.length>4096){json(413,{error:'Request too large'});return;}}
        let data;try{data=JSON.parse(body);}catch{json(400,{error:'Invalid JSON'});return;}
        if(busy){json(409,{error:'Another action is running. Try again shortly.'});return;}
        busy=true;
        try {await action(data.action,data.session);json(200,{...await snapshot(),busy:false});}
        catch(error){log('error',error.shortMessage??error.message);json(400,{error:error.shortMessage??error.message});}
        finally {busy=false;}
      } catch(error){json(500,{error:error.shortMessage??error.message});}
    });
    server.requestTimeout=15000;
    await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',resolve);});
    return {url:`http://127.0.0.1:${server.address().port}`,close,workers,getConfig:()=>config,getProposal:()=>getProposal()};
  } catch(error){await close();throw error;}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const port=Number(process.env.LORROW_DEMO_PORT??4173);
  if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid LORROW_DEMO_PORT');
  const app=await createWalkthrough({port});
  console.log(`\nLorrow local walkthrough: ${app.url}\nTest assets only. Three local witness processes; no independent operators.\nPress Ctrl+C to stop and discard the local chain.\n`);
  for(const signal of ['SIGINT','SIGTERM'])process.once(signal,async()=>{await app.close();process.exit(0);});
}
