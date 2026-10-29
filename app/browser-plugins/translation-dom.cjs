'use strict';
// Self-contained page functions. Service URLs and API keys never enter the page.
function install(token){
 if(window[token])return;const state={records:new Map(),ids:new WeakMap(),serial:0,dirty:true};
 state.observer=new MutationObserver(()=>{state.dirty=true;});state.options={subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['class','style','hidden']};
 state.observer.observe(document.documentElement,state.options);state.scroll=()=>{state.dirty=true;};window.addEventListener('scroll',state.scroll,{passive:true,capture:true});window[token]=state;
}
function collect(token,maxNodes,maxChars){
 const s=window[token];if(!s||!document.body)return [];if(!s.dirty)return [];s.dirty=false;
 for(const [id,r] of s.records)if(!r.node.isConnected)s.records.delete(id);
 const rows=[];let chars=0;const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);let node;
 while(node=walker.nextNode()){
  const p=node.parentElement,text=node.nodeValue;
  if(!p||!text.trim()||p.closest('script,style,noscript,textarea,input,select,option,code,pre,[contenteditable],svg,[translate="no"],.notranslate')||!p.getClientRects().length)continue;
  const style=getComputedStyle(p);if(style.visibility==='hidden'||style.display==='none')continue;
  let id=s.ids.get(node),record=id&&s.records.get(id);if(record&&text===record.applied)continue;
  if(text.length>60000)continue;
  if(rows.length>=maxNodes||(chars+text.length>maxChars&&rows.length)){s.dirty=true;break;}
  if(!record){if(s.records.size>=20000)break;id=++s.serial;s.ids.set(node,id);record={node,original:text};s.records.set(id,record);}else if(text!==record.original){record.original=text;record.applied=undefined;}
  rows.push({id,text});chars+=text.length;
 }
 return rows;
}
function apply(token,rows){
 const s=window[token];if(!s)return 0;s.observer.disconnect();let count=0;
 for(const r of rows){const record=s.records.get(r.id);if(!record?.node.isConnected||record.node.nodeValue!==r.source||typeof r.text!=='string')continue;record.original=r.source;record.applied=r.text;record.node.nodeValue=r.text;count++;}
 s.observer.observe(document.documentElement,s.options);return count;
}
function restore(token,replace){
 const s=window[token];if(!s)return;s.observer.disconnect();window.removeEventListener('scroll',s.scroll,true);
 if(replace)for(const r of s.records.values())if(r.node.isConnected&&r.applied!==undefined&&r.node.nodeValue===r.applied)r.node.nodeValue=r.original;
 delete window[token];
}
module.exports={install,collect,apply,restore};
