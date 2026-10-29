'use strict';
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('node:crypto');
const manifest={id:'ppixiv',name:'ppixiv for Pixiv',version:'257',author:'ppixiv',description:'The original ppixiv viewer: endless searches, bookmarks, manga and ugoira playback. Runs only on Pixiv.'};
const hash='37791646521c80a0de71447fcb5fed79f4c0c420d00d91260e6b2217065b23ac';
function matches(value){try{const u=new URL(value);return u.protocol==='https:'&&['www.pixiv.net','pixiv.net'].includes(u.hostname);}catch{return false;}}
function allowedImage(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&['i.pximg.net','i-cf.pximg.net'].includes(u.hostname)&&(!u.port||u.port==='443');}catch{return false;}}
// WebView2 exposes a host-object proxy even when native access is disabled.
// Only the actual upstream VVbrowser may probe its private host interface.
function nativeBrowserHost({sync=true}={}){
 if(!navigator.userAgent.includes('VVbrowser/'))return null;
 try{return sync?window.chrome?.webview?.hostObjects?.sync?.vvbrowser:window.chrome?.webview?.hostObjects?.vvbrowser;}catch{return null;}
}
let source;
function injection(){
 if(source)return source;
 const upstream=fs.readFileSync(path.join(__dirname,'ppixiv','ppixiv-main.user.js'),'utf8');
 if(crypto.createHash('sha256').update(upstream).digest('hex')!==hash)throw new Error('The bundled ppixiv script failed its integrity check.');
 // Unpack the official string bundle without executing its browser code.
 const box={};vm.runInNewContext(upstream.replace('Bootstrap({bundle});','globalThis.packedBundle=bundle;'),box,{timeout:3000});
 if(typeof box.packedBundle!=='string'||!box.packedBundle.includes('new AppStartup()'))throw new Error('The ppixiv bundle could not be read.');
 const nativeProbe='static _vvbrowser({ sync = true } = {}) {\n      if (sync)\n        return window.chrome?.webview?.hostObjects?.sync?.vvbrowser;\n      else\n        return window.chrome?.webview?.hostObjects?.vvbrowser;\n    }';
 if(!box.packedBundle.includes(nativeProbe))throw new Error('The bundled ppixiv compatibility hook was not found.');
 const compatibleBundle=box.packedBundle.replace(nativeProbe,'static _vvbrowser(options) { return ('+nativeBrowserHost.toString()+')(options); }');

 source=`(()=>{if(window.top!==window||!['www.pixiv.net','pixiv.net'].includes(location.hostname)||location.protocol!=='https:')return;
 const launch=()=>{if(window.ppixiv)return;window.__dfPpixiv={version:'257',source:'Bundled official ppixiv with FileFapper WebView2 compatibility',startedAt:Date.now()};
 const send=MessagePort.prototype.postMessage;
 window.addEventListener('request-download-channel',event=>{event.preventDefault();const {port1,port2}=new MessageChannel();window.postMessage({cmd:'download-setup'},'*',[port1]);port2.onmessage=async event=>{const reply=event.ports[0];try{const data=event.data;if(data.method&&data.method!=='GET')throw new Error('Only Pixiv media downloads are supported by this bridge.');const result=await window.__dfPixivNetwork.request({url:String(data.url),method:'GET'});if(result.error)throw new Error(result.error);const response=Uint8Array.from(result.bytes).buffer;send.call(reply,{success:true,response},[response]);}catch(error){send.call(reply,{success:false,error:error.message});}};});
 ${compatibleBundle}
 };if(document.documentElement)launch();else{const observer=new MutationObserver(()=>{if(document.documentElement){observer.disconnect();launch();}});observer.observe(document,{childList:true});}})();`;
 return source;
}
function toolbarVisibility(hidden){
 if(location.protocol!=='https:'||!['www.pixiv.net','pixiv.net'].includes(location.hostname)||!window.ppixiv?.app)return false;
 const key='__filefapperPpixivBars',selector='.screen-search-container .search-desktop-ui,.screen-search-container .search-mobile-ui,.screen-search-container .mobile-navigation-bar-container,.screen-illust-container > .ui,.mobile-illust-ui-container';
 let state=window[key];
 if(!hidden){if(state){state.tree.disconnect();for(const [node,entry] of state.nodes){entry.observer.disconnect();if(entry.value)node.style.setProperty('display',entry.value,entry.priority);else node.style.removeProperty('display');}delete window[key];}document.documentElement.removeAttribute('data-filefapper-hide-ppixiv-bar');return true;}
 if(state)return true;
 state={nodes:new Map(),tree:null};window[key]=state;
 const hide=node=>{if(node.style.getPropertyValue('display')!=='none'||node.style.getPropertyPriority('display')!=='important')node.style.setProperty('display','none','important');};
 const update=()=>{for(const [node,entry] of state.nodes)if(!node.isConnected){entry.observer.disconnect();state.nodes.delete(node);}for(const node of document.querySelectorAll(selector)){if(!state.nodes.has(node)){const entry={value:node.style.getPropertyValue('display'),priority:node.style.getPropertyPriority('display'),observer:new MutationObserver(()=>hide(node))};state.nodes.set(node,entry);entry.observer.observe(node,{attributes:true,attributeFilter:['style']});}hide(node);}};
 let pending=false;state.tree=new MutationObserver(()=>{if(pending)return;pending=true;requestAnimationFrame(()=>{pending=false;if(window[key]===state)update();});});state.tree.observe(document.documentElement,{childList:true,subtree:true});document.documentElement.setAttribute('data-filefapper-hide-ppixiv-bar','');update();return true;
}
class Ppixiv{
 async setToolbar(w,hidden){if(!w||w.isDestroyed()||!matches(w.getURL()))return false;return !!(await w.executeJavaScript('('+toolbarVisibility.toString()+')('+JSON.stringify(!!hidden)+')'));}
 constructor(){this.targets=new Map();this.states=new Map();this.pending=new Map();this.observed=new Set();}
 status(w){return this.states.get(w?.id)||{ready:false,message:''};}
 async inspect(w){
  if(!w||w.isDestroyed()||!matches(w.getURL()))return;
  try{
   const state=await w.executeJavaScript(`(()=>({ready:!!window.ppixiv?.app?._screenSearch&&!!window.ppixiv?.app?._screenIllust,bridge:typeof window.__dfPixivNetwork?.request==='function',disabled:location.hash.includes('no-ppixiv'),loggedIn:!!window.ppixiv?.pixivInfo?.userId}))()`);
   this.states.set(w.id,{...state,message:state.disabled?'Original Pixiv view':!state.bridge?'The Pixiv media bridge did not start. Reload this tab.':state.ready?'ppixiv viewer ready':!state.loggedIn?'Sign in to Pixiv, then choose Reload ppixiv.':'ppixiv is starting…'});
  }catch(e){this.states.set(w.id,{ready:false,message:'ppixiv could not start: '+e.message});}
 }
 configure(w,enabled){
  // A restored Pixiv tab and a simultaneous navigation can request setup
  // together. Serialise registration so disabling removes the only script.
  const previous=this.pending.get(w.id)||Promise.resolve();
  const next=previous.catch(()=>{}).then(()=>this.applyConfiguration(w,enabled));this.pending.set(w.id,next);
  const clear=()=>{if(this.pending.get(w.id)===next)this.pending.delete(w.id);};next.then(clear,clear);return next;
 }
 async applyConfiguration(w,enabled){
  if(w.isDestroyed())return;
  const current=this.targets.get(w.id);
  if(!enabled){if(current)try{await w.debugger.sendCommand('Page.removeScriptToEvaluateOnNewDocument',{identifier:current});}catch{}this.targets.delete(w.id);return;}
  if(current)return;
  // A brand-new WebContentsView has no DevTools Page target until its first
  // document exists. Loading a local blank document avoids waiting for Page
  // setup before the very navigation which would create that target.
  if(!w.getURL()){await w.loadURL('about:blank');if(w.isDestroyed())return;}
  if(!w.debugger.isAttached())w.debugger.attach('1.3');
  await w.debugger.sendCommand('Page.enable');
  const result=await w.debugger.sendCommand('Page.addScriptToEvaluateOnNewDocument',{source:injection()});
  this.targets.set(w.id,result.identifier);
  if(!this.observed.has(w.id)){this.observed.add(w.id);w.once('destroyed',()=>{this.targets.delete(w.id);this.states.delete(w.id);this.observed.delete(w.id);this.pending.delete(w.id);});}
 }
}
module.exports={Ppixiv,manifest,matches,allowedImage,injection,hash,nativeBrowserHost};
