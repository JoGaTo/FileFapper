'use strict';
const CHUNK_BYTES=1048576,MAX_BYTES=128000000,REQUEST_TIMEOUT_MS=180000;
function install(){
 if(window.top!==window||location.protocol!=='https:'||!['pixiv.net','www.pixiv.net'].includes(location.hostname)||window.__dfPixivNetwork||!window.chrome?.webview)return;
 const CHUNK=1048576,MAX=128000000,pending=new Map();let sequence=0;
 const finish=(id,job,result)=>{if(pending.get(id)!==job)return;pending.delete(id);clearTimeout(job.timer);job.buffer=null;job.resolve(result);};
 const fail=(id,job)=>finish(id,job,{error:'The Pixiv media bridge returned incomplete or invalid data.'});
 chrome.webview.addEventListener('message',event=>{
  const m=event.data;if(!m||typeof m.id!=='string'||!['df-pixiv-reply','df-pixiv-start','df-pixiv-chunk','df-pixiv-complete'].includes(m.kind))return;
  const job=pending.get(m.id);if(!job)return;
  if(m.kind==='df-pixiv-reply'){
   if(job.buffer)return fail(m.id,job);
   if(typeof m.result?.error==='string')return finish(m.id,job,{error:m.result.error.slice(0,1000)});
   const bytes=m.result?.bytes;if(!Array.isArray(bytes)||bytes.length>CHUNK||bytes.some(n=>!Number.isInteger(n)||n<0||n>255))return fail(m.id,job);
   return finish(m.id,job,{bytes:Uint8Array.from(bytes)});
  }
  if(m.kind==='df-pixiv-start'){
   if(job.buffer||!Number.isInteger(m.totalBytes)||m.totalBytes<=CHUNK||m.totalBytes>MAX||m.chunkSize!==CHUNK||m.chunks!==Math.ceil(m.totalBytes/CHUNK))return fail(m.id,job);
   try{job.buffer=new Uint8Array(m.totalBytes);}catch{return fail(m.id,job);}
   job.total=m.totalBytes;job.chunks=m.chunks;job.next=0;job.received=0;return;
  }
  if(!job.buffer)return fail(m.id,job);
  if(m.kind==='df-pixiv-chunk'){
   if(!Number.isInteger(m.index)||m.index!==job.next||m.index>=job.chunks||typeof m.base64!=='string')return fail(m.id,job);
   const expected=Math.min(CHUNK,job.total-job.received);
   if(m.base64.length!==Math.ceil(expected/3)*4||!/^[A-Za-z0-9+/]*={0,2}$/.test(m.base64))return fail(m.id,job);
   let binary;try{binary=atob(m.base64);}catch{return fail(m.id,job);}
   if(binary.length!==expected)return fail(m.id,job);
   for(let i=0;i<binary.length;i++)job.buffer[job.received+i]=binary.charCodeAt(i);
   job.received+=binary.length;job.next++;return;
  }
  if(job.received!==job.total||job.next!==job.chunks||m.totalBytes!==job.total||m.chunks!==job.chunks)return fail(m.id,job);
  const bytes=job.buffer;finish(m.id,job,{bytes});
 });
 Object.defineProperty(window,'__dfPixivNetwork',{configurable:false,writable:false,value:Object.freeze({request:request=>{
  if(pending.size>=4)return Promise.resolve({error:'Too many Pixiv media downloads are active. Try again shortly.'});
  let u;try{u=new URL(String(request?.url||''));}catch{return Promise.resolve({error:'Invalid Pixiv media address.'});}
  if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!['i.pximg.net','i-cf.pximg.net'].includes(u.hostname)||request?.method&&request.method!=='GET')return Promise.resolve({error:'This address is outside the Pixiv media bridge.'});
  return new Promise(resolve=>{const id='df-'+(++sequence)+'-'+crypto.randomUUID(),job={resolve,buffer:null};job.timer=setTimeout(()=>finish(id,job,{error:'The Pixiv media download timed out.'}),180000);pending.set(id,job);try{chrome.webview.postMessage({kind:'df-pixiv-fetch',id,url:u.href,method:'GET'});}catch{finish(id,job,{error:'The Pixiv media bridge is unavailable.'});}});
 }})});
}
module.exports={source:'('+install.toString()+')();',CHUNK_BYTES,MAX_BYTES,REQUEST_TIMEOUT_MS};
