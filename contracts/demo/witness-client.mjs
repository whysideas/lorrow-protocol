import {fork} from 'node:child_process';
export class WitnessClient {
  constructor(index) {
    this.pending=new Map();this.sequence=0;this.alive=true;this.address=null;
    this.child=fork(new URL('../../witness/runner.mjs',import.meta.url),[],{
      env:{...process.env,LORROW_DEV_WITNESS_INDEX:String(index)},stdio:['ignore','ignore','inherit','ipc']
    });
    this.child.on('message',m=>{const item=this.pending.get(m.id);if(!item)return;
      clearTimeout(item.timer);this.pending.delete(m.id);this.address=m.address??this.address;
      item.resolve(m);
    });
    const fail=()=>{this.alive=false;for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(new Error('Witness unavailable'));}this.pending.clear();};
    this.child.on('exit',fail);this.child.on('error',fail);
  }
  request(type,data={}) {
    if(!this.alive||!this.child.connected)return Promise.reject(new Error('Witness unavailable'));
    const id=++this.sequence;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('Witness response timed out'));},10000);
      this.pending.set(id,{resolve,reject,timer});
      this.child.send({id,type,...data},error=>{if(error){clearTimeout(timer);this.pending.delete(id);reject(error);}});
    });
  }
  async stop() {
    if(!this.alive)return;
    await new Promise(resolve=>{const timer=setTimeout(()=>{this.child.kill();resolve();},1500);
      this.child.once('exit',()=>{clearTimeout(timer);resolve();});this.child.disconnect();});
  }
}
