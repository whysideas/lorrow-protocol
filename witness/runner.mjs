import {HDNodeWallet,JsonRpcProvider,Contract} from '../contracts/demo/deps.mjs';
import {readChain,canonical} from './read-chain.mjs';
import {evaluate,approvalDigest,vetoDigest,requireThat} from './model.mjs';
// Public development mnemonic ONLY. There is deliberately no real key/RPC option.
import {DEV_MNEMONIC} from '../contracts/demo/dev.mjs';
const index=Number(process.env.LORROW_DEV_WITNESS_INDEX);
if(![4,5,6].includes(index)||!process.send)throw new Error('Start this local witness via npm run walkthrough');
const wallet=HDNodeWallet.fromPhrase(DEV_MNEMONIC,undefined,`m/44'/60'/0'/0/${index}`);
let provider,artifacts,config;
let working=false;
process.on('disconnect',()=>{provider?.destroy();process.exit(0);});
process.on('message',async message=>{
  if(working){process.send({id:message.id,ok:false,error:'Witness busy'});return;}
  working=true;
  try {
    const {id,type}=message;
    if(type==='init') {
      const url=new URL(message.rpc);
      requireThat(url.protocol==='http:'&&url.hostname==='127.0.0.1','Local RPC only');
      provider?.destroy();provider=new JsonRpcProvider(message.rpc,undefined,{cacheTimeout:-1});
      artifacts=message.artifacts;
      process.send({id,ok:true,address:wallet.address,pid:process.pid});return;
    }
    requireThat(provider&&artifacts,'Uninitialized witness');
    if(type==='register') {
      const candidate=message.config;
      requireThat(candidate.chainId===31337&&candidate.witnesses.some(w=>w===wallet.address),'Local committee only');
      evaluate(await readChain(provider,artifacts,candidate),candidate);
      config=candidate;
      process.send({id,ok:true,address:wallet.address,pid:process.pid});return;
    }
    requireThat(config,'No registered loan');
    const s=await readChain(provider,artifacts,config), model=evaluate(s,config);
    let digest;
    if(type==='approve') {
      const p=message.proposal;
      requireThat(model.eligible,'Loan is not eligible for settlement');
      requireThat(s.pending.readyAt===0n,'A proposal is already queued');
      requireThat(BigInt(p.nonce)===s.nonce+1n,'Incorrect nonce');
      requireThat(BigInt(p.lenderAmount)===model.lenderAmount,'Incorrect lender payout');
      requireThat(p.stateHash===model.stateHash,'Incorrect state commitment');
      requireThat(BigInt(p.deadline)>s.timestamp+s.exitDelay&&BigInt(p.deadline)<=s.timestamp+3600n,'Invalid signing deadline');
      const loan=new Contract(config.loan,artifacts.loan.abi,provider);
      const [allowed,stateHash]=await loan.settlementState(config.vault,model.lenderAmount,{blockTag:s.blockNumber});
      requireThat(allowed&&stateHash===model.stateHash,'Policy and independent model disagree');
      digest=approvalDigest(config,p);
      const vault=new Contract(config.vault,artifacts.vault.abi,provider);
      requireThat(digest===await vault.settlementDigest(p.nonce,p.lenderAmount,p.stateHash,p.deadline,{blockTag:s.blockNumber}),'Digest mismatch');
    } else if(type==='veto') {
      requireThat(!s.settled&&s.pending.readyAt>0n&&BigInt(message.nonce)===s.pending.nonce,'No matching pending proposal');
      requireThat(message.reason==='demo_operator_cancel','Unsupported veto request');
      digest=vetoDigest(config,s.pending.nonce);
    } else throw new Error('Unsupported witness request');
    await canonical(provider,s);
    process.send({id,ok:true,address:wallet.address,pid:process.pid,signature:wallet.signingKey.sign(digest).serialized,
      blockNumber:s.blockNumber,blockHash:s.blockHash,reason:type==='veto'?'Operator requested demo cancellation':model.reason});
  } catch(error) {process.send({id:message.id,ok:false,address:wallet.address,pid:process.pid,error:error.message});}
  finally {working=false;}
});
