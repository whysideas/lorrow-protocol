import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {recoverAddress,TypedDataEncoder} from '../contracts/demo/deps.mjs';
import {settlementTypes} from './model.mjs';
const hash=s=>createHash('sha256').update(s).digest('hex');
const syncDirectory=directory=>{let fd;try{fd=fs.openSync(directory,'r');fs.fsyncSync(fd);}catch(e){if(!['EPERM','EISDIR','ENOTSUP','EINVAL'].includes(e.code))throw e;}finally{if(fd!==undefined)fs.closeSync(fd);}};
const key=r=>`${r.chainId}:${r.vault.toLowerCase()}:${r.nonce}:${r.type}`;
export class Journal {
  constructor(filename,address) {
    this.filename=filename;this.address=address;this.records=[];this.lock=filename+'.lock';this.fd=null;
    fs.mkdirSync(path.dirname(filename),{recursive:true,mode:0o700});
    try{this.acquire();this.load();this.fd=fs.openSync(filename,'a',0o600);}catch(error){this.close();throw error;}
  }
  acquire() {
    const recovery=this.lock+'.recovery';
    const create=()=>{const fd=fs.openSync(this.lock,'wx',0o600);this.ownsLock=true;
      try{fs.writeFileSync(fd,JSON.stringify({pid:process.pid,host:os.hostname()}));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}};
    const deadOwner=()=>{
      let owner;try{owner=JSON.parse(fs.readFileSync(this.lock,'utf8'));}catch{throw new Error('Unverifiable journal lock; inspect it before removal');}
      if(owner.host!==os.hostname()||!Number.isInteger(owner.pid)||owner.pid<=0)throw new Error('Foreign or invalid journal lock');
      try{process.kill(owner.pid,0);return false;}catch(e){return e.code==='ESRCH';}
    };
    if(fs.existsSync(recovery))throw new Error('Journal recovery is already active; inspect stale recovery locks');
    try{create();return;}catch(error){if(error.code!=='EEXIST')throw error;}
    if(!deadOwner())throw new Error('Journal already has a live writer');
    // Serialize stale-lock recovery so competing restarts cannot delete a newly
    // acquired writer lock. Re-read the owner while holding the recovery guard.
    fs.mkdirSync(recovery,{mode:0o700});
    try{if(!deadOwner())throw new Error('Journal acquired by another live writer');fs.unlinkSync(this.lock);create();}
    finally{fs.rmdirSync(recovery);}
  }
  load() {
    if(!fs.existsSync(this.filename))return;
    const text=fs.readFileSync(this.filename,'utf8');
    if(text&&!text.endsWith('\n'))throw new Error('Incomplete journal tail: refusing to sign');
    let previous='0'.repeat(64);
    for(const line of text.trimEnd().split('\n').filter(Boolean)){
      const wrapped=JSON.parse(line),r=wrapped.record;
      if(r.sequence!==this.records.length+1||r.previous!==previous||wrapped.hash!==hash(JSON.stringify(r)))throw new Error('Journal hash/sequence mismatch');
      if(r.address.toLowerCase()!==this.address.toLowerCase()||recoverAddress(r.digest,r.signature).toLowerCase()!==this.address.toLowerCase())throw new Error('Invalid journal signer');
      const domain={name:'LorrowEscrow',version:'0.0.1',chainId:r.chainId,verifyingContract:r.vault};
      const expected=r.type==='approve'?TypedDataEncoder.hash(domain,settlementTypes,{...r.proposal,termsHash:r.termsHash}):r.type==='veto'?TypedDataEncoder.hash(domain,{Veto:[{name:'nonce',type:'uint256'}]},{nonce:r.nonce}):null;
      if(expected!==r.digest||(r.type==='approve'&&String(r.proposal.nonce)!==String(r.nonce)))throw new Error('Journal authorization payload mismatch');
      this.records.push(r);previous=wrapped.hash;
    }
    this.previous=previous;
  }
  lookup(record){return this.records.filter(r=>key(r)===key(record));}
  append(record) {
    if(this.fd===null)throw new Error('Closed journal');
    const r={...record,address:this.address,sequence:this.records.length+1,previous:this.previous??'0'.repeat(64)};
    const digest=hash(JSON.stringify(r));const bytes=Buffer.from(JSON.stringify({record:r,hash:digest})+'\n');
    let offset=0;while(offset<bytes.length)offset+=fs.writeSync(this.fd,bytes,offset,bytes.length-offset);
    // Never deliver a signature before the record is durably flushed.
    fs.fsyncSync(this.fd);syncDirectory(path.dirname(this.filename));this.records.push(r);this.previous=digest;return r;
  }
  close(){if(this.fd!==null){fs.closeSync(this.fd);this.fd=null;}if(this.ownsLock){fs.unlinkSync(this.lock);this.ownsLock=false;}}
}
