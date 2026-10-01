import {Contract} from '../contracts/demo/deps.mjs';
import {Journal} from './journal.mjs';
import {finalityBlock} from './finality.mjs';
import {readChain,canonical} from './read-chain.mjs';
import {evaluate,approvalDigest,vetoDigest,requireThat,termsCommitment} from './model.mjs';
import {verifyDeployment} from '../testnet/verify.mjs';
export class DurableWitness {
  constructor({provider,artifacts,manifest,wallet,journal,allowLocal=false,finality={tag:'finalized'}}) {
    this.provider=provider;this.artifacts=artifacts;this.manifest=manifest;this.wallet=wallet;
    this.allowLocal=allowLocal;this.finality=finality;this.busy=false;
    requireThat(manifest.witnesses.some(w=>w.toLowerCase()===wallet.address.toLowerCase()),'Key is not on the committee');
    this.journal=new Journal(journal,wallet.address);
  }
  async sign(request) {
    requireThat(!this.busy,'Witness is busy');this.busy=true;
    try {
      const tag=await finalityBlock(this.provider,this.finality,{allowLocal:this.allowLocal});
      const {config}=await verifyDeployment(this.provider,this.artifacts,this.manifest,{blockTag:tag,allowLocal:this.allowLocal});
      requireThat(BigInt(request.chainId)===BigInt(config.chainId)&&request.vault.toLowerCase()===config.vault.toLowerCase()&&request.loan.toLowerCase()===config.loan.toLowerCase(),'Request deployment mismatch');
      const final=await readChain(this.provider,this.artifacts,config,tag),head=await readChain(this.provider,this.artifacts,config);
      const stable=evaluate(final,config),current=evaluate(head,config);
      let digest,nonce,proposal;
      if(request.type==='approve') {
        proposal=request.proposal;nonce=BigInt(proposal.nonce);
        requireThat(stable.eligible&&current.eligible,'Settlement is not eligible in both finalized and latest state');
        requireThat(stable.stateHash===current.stateHash&&final.nonce===head.nonce,'Wait for the current loan state/nonce to finalize');
        requireThat(head.pending.readyAt===0n&&final.pending.readyAt===0n,'Proposal is already queued or cancellation is not finalized');
        requireThat(nonce===head.nonce+1n,'Incorrect nonce');
        requireThat(BigInt(proposal.lenderAmount)===stable.lenderAmount&&proposal.stateHash===stable.stateHash,'Incorrect payout/state');
        const deadline=BigInt(proposal.deadline);
        requireThat(deadline>head.timestamp+head.exitDelay&&deadline<=head.timestamp+7200n,'Invalid deadline');
        const loan=new Contract(config.loan,this.artifacts.loan.abi,this.provider);
        const [allowed,state]=await loan.settlementState(config.vault,stable.lenderAmount,{blockTag:tag});
        requireThat(allowed&&state===stable.stateHash,'Independent rules disagree with finalized policy');
        digest=approvalDigest(config,proposal);
        const vault=new Contract(config.vault,this.artifacts.vault.abi,this.provider);
        requireThat(digest===await vault.settlementDigest(nonce,proposal.lenderAmount,proposal.stateHash,proposal.deadline,{blockTag:head.blockNumber}),'Approval digest mismatch');
      }else if(request.type==='veto'){
        nonce=BigInt(request.nonce);
        requireThat(request.reason==='operator_cancel','Explicit operator cancellation reason required');
        requireThat(!head.settled&&head.pending.readyAt>0n&&head.pending.nonce===nonce,'No matching current proposal');
        // A veto only cancels: current pending state is allowed once the deployment
        // is finalized, avoiding a finality wait that could consume the veto window.
        digest=vetoDigest(config,nonce);
      }else throw new Error('Unsupported signing request');
      await canonical(this.provider,final);await canonical(this.provider,head);
      const identity={chainId:config.chainId,vault:config.vault,nonce:nonce.toString(),type:request.type};
      const previous=this.journal.lookup(identity);
      for(const r of previous){
        if(r.digest===digest)return r; // durable delivery replay after restart
        requireThat(request.type==='approve'&&r.proposal.stateHash===proposal.stateHash&&r.proposal.lenderAmount===proposal.lenderAmount,'Conflicting authorization for the same nonce');
        requireThat(BigInt(r.proposal.deadline)<final.timestamp,'Prior signature must expire in finalized time before deadline renewal');
      }
      const signature=this.wallet.signingKey.sign(digest).serialized;
      return this.journal.append({...identity,termsHash:termsCommitment(config),loan:config.loan,digest,signature,proposal:proposal??null,
        blockNumber:head.blockNumber,blockHash:head.blockHash,finalizedBlock:final.blockNumber,finalizedHash:final.blockHash});
    } finally {this.busy=false;}
  }
  close(){this.journal.close();}
}
