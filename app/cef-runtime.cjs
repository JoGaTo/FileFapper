'use strict';
// CEF uses the native browser transport contract, with its own profile and
// executable. The production browser uses this runtime by default.
const path=require('node:path'),fs=require('node:fs');
const {EdgeRuntime,EdgeSession}=require('./edge-runtime.cjs');
function bootstrap(){
 if(window.top!==window||location.protocol!=='https:'||!['pixiv.net','www.pixiv.net'].includes(location.hostname)||typeof globalThis.__filefapperNativeSend!=='function')return;
 const target=new EventTarget(),webview=Object.freeze({postMessage:value=>globalThis.__filefapperNativeSend(JSON.stringify(value)),addEventListener:(...args)=>target.addEventListener(...args),removeEventListener:(...args)=>target.removeEventListener(...args)});
 const chrome=window.chrome||(window.chrome={});if(chrome.webview)return;
 Object.defineProperty(chrome,'webview',{value:webview,configurable:false,writable:false});
 Object.defineProperty(window,'__filefapperCefReceive',{value:value=>target.dispatchEvent(new MessageEvent('message',{data:value})),configurable:false,writable:false});
}
class CefRuntime extends EdgeRuntime{
 constructor(options={}){super({...options,engineName:'Chromium Embedded Framework',profileName:'CefBrowser',bridgeBootstrap:'('+bootstrap.toString()+')();'});}
 helperPath(){if(this.options.helperPath)return this.options.helperPath;const resources=this.options.resourcesPath||process.resourcesPath,packaged=resources&&path.join(resources,'browser','DandF.CefHost.exe');if(packaged&&fs.existsSync(packaged))return packaged;return path.resolve(__dirname,'..','native','cef-host','bin','Release','net48','win-x64','DandF.CefHost.exe');}
 async close(){
  if(this.closed)return;this.closed=true;const child=this.child,lines=this.lines;
  if(child){
   let timer;const exited=new Promise(resolve=>{if(child.exitCode!==null&&child.exitCode!==undefined)return resolve();child.once('exit',resolve);timer=setTimeout(resolve,15000);});
   try{await Promise.race([this.raw('shutdown',{},3000),exited]);}catch{}await exited;clearTimeout(timer);
   await this.cleanupChild(child,lines);
  }
  for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(new Error('The browser is closed.'));}this.pending.clear();
 }
}
let qaSession;
function createCefSession(options={}){const runtime=new CefRuntime(options);const session=new EdgeSession({...options,engineName:'Chromium Embedded Framework',runtime});session.isCef=true;if(options.qaMode&&process.env.DF_DATA_DIR)qaSession=session;return session;}
function getQaSession(){if(!process.env.DF_DATA_DIR||!qaSession?.options.qaMode)throw new Error('CEF QA access requires an isolated test profile.');return qaSession;}
module.exports={CefRuntime,createCefSession,getQaSession,bootstrap};
