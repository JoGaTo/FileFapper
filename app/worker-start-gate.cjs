'use strict';
class WorkerStartGate{
 constructor({settled=()=>{}}={}){this.pending=new Map();this.settled=settled;}
 get size(){return this.pending.size;} has(id){return this.pending.has(id);}
 cancel(id){const token=this.pending.get(id);if(token)token.cancelled=true;this.pending.delete(id);} clear(){for(const token of this.pending.values())token.cancelled=true;this.pending.clear();}
 run(id,prepare,ready,failed){
  if(this.pending.has(id))return false;const token={};this.pending.set(id,token);
  Promise.resolve().then(prepare).then(value=>{if(this.pending.get(id)!==token)return;this.pending.delete(id);token.started=true;return ready(value);}).catch(error=>{if(token.cancelled||this.pending.get(id)!==token&&!token.started)return;if(this.pending.get(id)===token)this.pending.delete(id);failed(error);}).finally(()=>{if(this.pending.get(id)===token)this.pending.delete(id);this.settled();});return true;
 }
}
module.exports={WorkerStartGate};
