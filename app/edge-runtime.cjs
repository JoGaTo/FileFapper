'use strict';
// Trusted native-browser transport; pages cannot issue native RPC.
const {EventEmitter}=require('node:events'),{spawn}=require('node:child_process');
const readline=require('node:readline'),path=require('node:path'),fs=require('node:fs'),dns=require('node:dns');
let nextWebId=100000;
const PIXIV=new Set(['pixiv.net','www.pixiv.net']),MEDIA=new Set(['i.pximg.net','i-cf.pximg.net']);
const httpUrl=value=>{try{const u=new URL(value);return /^https?:$/.test(u.protocol)&&!u.username&&!u.password?u:null;}catch{return null;}};
const pixivUrl=value=>{const u=httpUrl(value);return !!u&&u.protocol==='https:'&&PIXIV.has(u.hostname)&&(!u.port||u.port==='443');};
const mediaUrl=value=>{const u=httpUrl(value);return !!u&&u.protocol==='https:'&&MEDIA.has(u.hostname)&&(!u.port||u.port==='443');};
function cookieForCdp(d){
 const u=httpUrl(d.url);if(!u)throw new Error('A browser cookie requires an HTTP or HTTPS URL.');
 const out={url:u.href,name:String(d.name),value:String(d.value),path:d.path||'/',secure:!!d.secure,httpOnly:!!d.httpOnly};
 if(d.domain!==undefined)out.domain=String(d.domain);
 const sameSite=({strict:'Strict',lax:'Lax',no_restriction:'None',none:'None'})[String(d.sameSite||'').toLowerCase()];if(sameSite)out.sameSite=sameSite;
 if(d.expirationDate!==undefined)out.expires=Number(d.expirationDate);
 if(sameSite==='None'&&!out.secure)throw new Error('A SameSite=None cookie must retain its Secure flag.');
 if(out.name.startsWith('__Host-')&&(!out.secure||out.domain!==undefined||out.path!=='/'))throw new Error('A __Host- cookie must be Secure, host-only and / scoped.');
 if(out.name.startsWith('__Secure-')&&!out.secure)throw new Error('A __Secure- cookie must retain its Secure flag.');
 return out;
}
function cookieFromCdp(c){return {name:c.name,value:c.value,domain:c.domain,path:c.path||'/',secure:!!c.secure,httpOnly:!!c.httpOnly,hostOnly:!c.domain.startsWith('.'),session:!!c.session||!(c.expires>0),...(c.expires>0?{expirationDate:c.expires}:{}),sameSite:({Strict:'strict',Lax:'lax',None:'no_restriction'})[c.sameSite]||'unspecified'};}
function cookieMatches(c,f={}){
 if(f.name!==undefined&&c.name!==f.name||f.path!==undefined&&c.path!==f.path||f.secure!==undefined&&c.secure!==f.secure||f.session!==undefined&&c.session!==f.session)return false;
 const domain=c.domain.replace(/^\./,'').toLowerCase();
 if(f.domain){const requested=String(f.domain).replace(/^\./,'').toLowerCase();if(domain!==requested&&!domain.endsWith('.'+requested))return false;}
 if(f.url){const u=httpUrl(f.url);if(!u)return false;if(u.hostname!==domain&&(!c.domain.startsWith('.')||!u.hostname.endsWith('.'+domain)))return false;if(c.secure&&u.protocol!=='https:')return false;const p=c.path||'/';if(u.pathname!==p&&!u.pathname.startsWith(p.endsWith('/')?p:p+'/'))return false;}
 return true;
}
const cookieId=c=>JSON.stringify([c.domain,c.path||'/',c.name]);
function nativeHandle(win){const b=win?.getNativeWindowHandle?.();return !b?'0':b.length>=8?b.readBigUInt64LE().toString():String(b.readUInt32LE());}
function nativeErrorCode(value){
 if(typeof value==='number'&&value<0)return value;
 return ({HostNameNotResolved:-105,NameNotResolved:-105,Timeout:-118,ConnectionAborted:-103,ConnectionReset:-101,Disconnected:-106,CannotConnect:-102,ServerUnreachable:-109,OperationCanceled:-3,RedirectFailed:-310,CertificateCommonNameIsIncorrect:-200,CertificateExpired:-201,CertificateIsInvalid:-202,CertificateRevoked:-206,ErrorHttpInvalidServerResponse:-320})[String(value)]||-2;
}
class EdgeRuntime extends EventEmitter{
 constructor(options={}){super();this.options=options;this.win=options.win;this.dataDir=options.dataDir;this.child=null;this.lines=null;this.pending=new Map();this.sequence=0;this.started=false;this.startPromise=null;this.closed=false;this.views=new Map();this.identity={engine:options.engineName||'Microsoft Edge WebView2',version:'',initialized:false};this.userAgent='';}
 getWindow(){return typeof this.win==='function'?this.win():this.win;}
 helperPath(){if(this.options.helperPath)return this.options.helperPath;const resources=this.options.resourcesPath||process.resourcesPath;if(resources&&fs.existsSync(path.join(resources,'browser','DandF.EdgeHost.exe')))return path.join(resources,'browser','DandF.EdgeHost.exe');return path.resolve(__dirname,'..','browser-dist','edge-host','DandF.EdgeHost.exe');}
 start(){if(this.closed)return Promise.reject(new Error('The browser is closed.'));if(this.startPromise)return this.startPromise;const attempt=this._start();let current;current=attempt.catch(e=>{if(this.startPromise===current){this.startPromise=null;this.started=false;}throw e;});this.startPromise=current;return current;}
 async _start(){
  const exe=this.helperPath();if(!this.options.spawnImpl&&!fs.existsSync(exe))throw new Error('The '+(this.options.engineName||'Microsoft Edge')+' browser helper is missing. Reinstall the complete FileFapper package.');
  const child=(this.options.spawnImpl||spawn)(exe,[],{windowsHide:true,stdio:['pipe','pipe','pipe'],cwd:path.dirname(exe)});this.child=child;
  child.stdin.on('error',()=>{});child.stderr.on('data',()=>{});
  const lines=readline.createInterface({input:child.stdout});this.lines=lines;
  lines.on('line',line=>{if(this.child!==child)return;if(line.length>190000000){this.fail(new Error('The browser returned an oversized reply.'));return;}let value;try{value=JSON.parse(line);}catch{return;}this.receive(value);});
  child.once('error',()=>{if(this.child===child)this.fail(new Error('The '+(this.options.engineName||'Microsoft Edge')+' browser helper could not start.'));});
  child.once('exit',()=>{if(this.child!==child)return;this.child=null;this.started=false;this.startPromise=null;lines.close();if(this.lines===lines)this.lines=null;if(!this.closed)this.fail(new Error('The '+(this.options.engineName||'Microsoft Edge')+' browser stopped. Reopen Browser to try again.'));});
  try{
   const params={parentWindow:nativeHandle(this.getWindow()),userDataDir:path.join(this.dataDir,this.options.profileName||'EdgeBrowser'),qaMode:!!this.options.qaMode,...(this.options.downloadDir?{downloadDir:this.options.downloadDir}:{})};
   const identity=await this.raw('init',params,90000);
   if(this.closed||this.child!==child)throw new Error('The browser was closed while starting.');
   if(this.options.downloadDir!==params.downloadDir)await this.raw('configure-downloads',{directory:this.options.downloadDir||''});
   this.identity={...identity,engine:this.options.engineName||'Microsoft Edge WebView2',initialized:true};this.started=true;this.emit('ready',this.identity);return this.identity;
  }catch(error){await this.cleanupChild(child,lines);throw error;}
 }
 async cleanupChild(child,lines){
  lines?.close();if(this.lines===lines)this.lines=null;if(this.child===child){this.child=null;this.started=false;}
  if(child.exitCode!==null&&child.exitCode!==undefined)return;
  await new Promise(resolve=>{let finished=false;const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);child.removeListener('exit',finish);resolve();};const timer=setTimeout(finish,2000);child.once('exit',finish);try{child.stdin?.destroy();child.kill();}catch{finish();}if(child.exitCode!==null&&child.exitCode!==undefined)finish();});
 }
 fail(error){for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(error);}this.pending.clear();this.emit('runtime-error',error);if(this.listenerCount('error'))this.emit('error',error);for(const v of this.views.values()){v.webContents.ready=null;v.webContents.emit('render-process-gone',{},{});}}
 raw(method,params={},timeout=60000){return new Promise((resolve,reject)=>{const id=++this.sequence,timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('The browser did not respond in time.'));},timeout);this.pending.set(id,{resolve,reject,timer});try{this.child.stdin.write(JSON.stringify({id,method,params})+'\n',error=>{if(error){clearTimeout(timer);this.pending.delete(id);reject(new Error('The browser connection closed.'));}});}catch{clearTimeout(timer);this.pending.delete(id);reject(new Error('The browser connection closed.'));}});}
 async call(method,params={},timeout){await this.start();return this.raw(method,params,timeout);}
 receive(m){if(Object.prototype.hasOwnProperty.call(m,'id')){const item=this.pending.get(m.id);if(!item)return;this.pending.delete(m.id);clearTimeout(item.timer);m.error?item.reject(new Error(m.error.message||'The browser action failed.')):item.resolve(m.result);return;}if(typeof m.event!=='string')return;const v=this.views.get(String(m.tabId));if(v)v.webContents.nativeEvent(m.event,m.params||{});this.emit(m.event,{tabId:String(m.tabId||''),...(m.params||{})});}
 async cdp(tabId,method,args={}){return this.call('cdp',{tabId:String(tabId),method,args});}
 async close(){if(this.closed)return;this.closed=true;const child=this.child,lines=this.lines;if(child){try{await this.raw('shutdown',{},2500);}catch{}await this.cleanupChild(child,lines);}for(const item of this.pending.values()){clearTimeout(item.timer);item.reject(new Error('The browser is closed.'));}this.pending.clear();}
}
class EdgeFrame{
 constructor(w,id,url,main=false){this.w=w;this.frameId=id;this.url=url;this.routingId=id;this.processId=w.id;this.main=main;this.framesInSubtree=[];this.contexts=new Map();}
 async executeJavaScript(code){await this.w.ensure();return this.main?this.w.evaluate(code):this.w.evaluateInFrame(this,code);}
}
class EdgeWebContents extends EventEmitter{
 constructor(runtime,session,tabId){
  super();this.runtime=runtime;this.session=session;this.tabId=String(tabId);this.id=++nextWebId;this.url='';this.title='';this.loading=false;this.destroyed=false;this.ready=null;this.generation=0;this.canBack=false;this.canForward=false;this.mainFrame=new EdgeFrame(this,'','',true);this.frames=new Map();this.openHandler=null;
  this.navigationHistory={canGoBack:()=>this.canBack,canGoForward:()=>this.canForward,goBack:()=>this.command('goBack'),goForward:()=>this.command('goForward')};
  this.debugger={attached:false,isAttached:()=>this.debugger.attached,attach:()=>{this.debugger.attached=true;},detach:()=>{this.debugger.attached=false;},sendCommand:async(method,args={})=>{await this.ensure();return runtime.cdp(this.tabId,method,args);}};
 }
 ensure(){if(this.destroyed)return Promise.reject(new Error('This browser tab is closed.'));if(!this.ready)this.ready=this.runtime.call('create',{tabId:this.tabId}).then(async()=>{await this.runtime.cdp(this.tabId,'Page.enable');await this.runtime.cdp(this.tabId,'Runtime.enable');if(this.runtime.options?.bridgeBootstrap){await this.runtime.cdp(this.tabId,'Runtime.addBinding',{name:'__filefapperNativeSend'});await this.runtime.cdp(this.tabId,'Page.addScriptToEvaluateOnNewDocument',{source:this.runtime.options.bridgeBootstrap});}await this.runtime.cdp(this.tabId,'Page.addScriptToEvaluateOnNewDocument',{source:require('./edge-pixiv-bridge.cjs').source});await this.refreshFrames();if(!this.session.userAgent)await this.session.refreshUserAgent(this).catch(()=>{});return this;}).catch(e=>{this.ready=null;throw e;});return this.ready;}
 async command(method,extra={}){await this.ensure();return this.runtime.call(method,{tabId:this.tabId,...extra});}
 async refreshFrames(){try{const data=await this.runtime.cdp(this.tabId,'Page.getFrameTree');if(!data?.frameTree)return;const collect=(tree,main=false)=>{const old=this.frames.get(tree.frame.id),f=old&&old.url===tree.frame.url?old:new EdgeFrame(this,tree.frame.id,tree.frame.url,main);f.url=tree.frame.url;f.main=main;this.frames.set(f.frameId,f);const children=(tree.childFrames||[]).flatMap(child=>collect(child));f.framesInSubtree=[f,...children];return [f,...children];};const all=collect(data.frameTree,true);this.mainFrame=all[0];this.mainFrame.framesInSubtree=all;this.frames=new Map(all.map(f=>[f.frameId,f]));}catch{}}
 async evaluate(code,contextId){const r=await this.runtime.cdp(this.tabId,'Runtime.evaluate',{expression:String(code),awaitPromise:true,returnByValue:true,userGesture:true,...(contextId?{contextId}:{})});if(r?.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text||'The browser page script failed.');return r?.result?.value;}
 async evaluateInFrame(frame,code,world='DandFFrame'){const key=world+':'+this.generation;let contextId=frame.contexts.get(key);if(!contextId){const r=await this.runtime.cdp(this.tabId,'Page.createIsolatedWorld',{frameId:frame.frameId,worldName:world,grantUniveralAccess:false});contextId=r.executionContextId;frame.contexts.set(key,contextId);}return this.evaluate(code,contextId);}
 async executeJavaScript(code){await this.ensure();return this.evaluate(code);}
 async executeJavaScriptInIsolatedWorld(world,scripts){await this.ensure();await this.refreshFrames();return this.evaluateInFrame(this.mainFrame,scripts.map(r=>r.code).join('\n'),'DandFWorld'+world);}
 async loadURL(url){if(url!=='about:blank'&&!httpUrl(url))throw new Error('Enter an HTTP or HTTPS address.');this.loading=true;this.emit('did-start-loading');try{await this.session.ensureInitialCookies();await this.ensure();await this.command('navigate',{url});}catch(error){this.loading=false;throw error;}}
 getURL(){return this.url;} getTitle(){return this.title;} isLoading(){return this.loading;} isDestroyed(){return this.destroyed;} getUserAgent(){return this.session.getUserAgent();}
 setWindowOpenHandler(handler){this.openHandler=handler;} focus(){return this.command('focus').catch(()=>{});} reload(){return (this.ready?this.command('reload'):this.loadURL(this.url||'about:blank')).catch(()=>{});} stop(){return this.command('stop').catch(()=>{});}
 downloadURL(url){return this.executeJavaScript('(function(){const a=document.createElement("a");a.href='+JSON.stringify(url)+';a.download="";document.body.append(a);a.click();a.remove();})()').catch(()=>{});}
 copyImageAt(x,y){return this.executeJavaScript('(async()=>{const n=document.elementFromPoint('+(Number(x)||0)+','+(Number(y)||0)+');if(!n||n.tagName!=="IMG")return;const r=await fetch(n.currentSrc||n.src);const b=await r.blob();await navigator.clipboard.write([new ClipboardItem({[b.type]:b})]);})()').catch(()=>{});}
 async close(){if(this.destroyed)return;this.destroyed=true;if(this.ready)try{await this.ready;await this.runtime.call('close',{tabId:this.tabId});}catch{}this.emit('destroyed');this.removeAllListeners();this.runtime.views.delete(this.tabId);}
 nativeEvent(name,p){
  if(this.destroyed)return;const event={preventDefault:()=>this.stop()};
  if(name==='navigation-starting'){this.generation++;this.nativeNavigationId=p.navigationId;this.loading=true;this.url=p.url||this.url;this.mainFrame.url=this.url;this.emit('will-navigate',event,this.url);this.emit('did-start-navigation',{},this.url,false,true);this.emit('did-start-loading');}
  else if(name==='source-changed'){this.url=p.url||this.url;this.mainFrame.url=this.url;if(!p.isNewDocument)this.emit('did-navigate-in-page',{},this.url,true);}
  else if(name==='title-changed'){this.title=p.title||'';this.emit('page-title-updated',{},this.title);}
  else if(name==='history-changed'){this.canBack=!!p.canBack;this.canForward=!!p.canForward;}
  else if(name==='dom-ready'){if(p.navigationId!==undefined&&this.nativeNavigationId!==undefined&&String(p.navigationId)!==String(this.nativeNavigationId))return;this.refreshFrames().then(()=>this.emit('dom-ready')).catch(()=>{});}
  else if(name==='navigation-completed'){if(p.navigationId!==undefined&&this.nativeNavigationId!==undefined&&String(p.navigationId)!==String(this.nativeNavigationId))return;this.url=p.url||this.url;this.loading=false;this.refreshFrames().then(async()=>{if(p.success===false&&!Number(p.httpStatus))this.emit('did-fail-load',{},nativeErrorCode(p.errorCode),p.error||String(p.errorCode||'Page loading failed'),this.url,true);else this.emit('did-navigate',{},this.url,Number(p.httpStatus)||200);this.emit('did-stop-loading');await this.session.cookies.poll().catch(()=>{});});}
  else if(name==='new-window'){try{this.openHandler?.({url:p.url,disposition:p.disposition||'foreground-tab'});}catch{}}
  else if(name==='accelerator')this.emit('before-input-event',event,{type:'keyDown',key:p.key||'',control:!!p.control,shift:!!p.shift});
  else if(name==='process-gone'){this.loading=false;this.emit('render-process-gone',{},p);}
  else if(name==='tab-command')this.emit('tab-command',{},p);else if(name==='context-menu')this.emit('context-menu',{},p);else if(name==='request-translate')this.emit('request-translate',p);
 }
}
class EdgeView{
 constructor(runtime,session,tab){this.runtime=runtime;this.isEdgeView=true;this.webContents=new EdgeWebContents(runtime,session,tab.id);this.bounds={x:0,y:0,width:0,height:0};this.visible=false;this.lastPlacement=null;this.placementPromise=null;this.placementDirty=false;this.forcePlacement=false;}
 placementKey(){const b=this.bounds;return JSON.stringify([b.x,b.y,b.width,b.height,this.visible]);}
 setBounds(bounds){if(['x','y','width','height'].every(k=>this.bounds[k]===bounds[k]))return;this.bounds={...bounds};if(this.visible)this.position();}
 setVisible(visible){visible=!!visible;if(this.visible===visible&&this.lastPlacement?.key===this.placementKey()&&this.lastPlacement.ready===this.webContents.ready)return;this.visible=visible;if(!visible&&!this.webContents.ready)return;this.position();}
 position(force=false){
  if(this.runtime.closed||this.webContents.isDestroyed())return Promise.resolve();
  this.placementDirty=true;this.forcePlacement=this.forcePlacement||force;if(this.placementPromise)return this.placementPromise;
  this.placementPromise=Promise.resolve().then(async()=>{
   await this.webContents.ensure();
   while(this.placementDirty&&!this.runtime.closed&&!this.webContents.isDestroyed()){
    this.placementDirty=false;const key=this.placementKey(),ready=this.webContents.ready,notifyParentMoved=this.forcePlacement;this.forcePlacement=false;
    if(!notifyParentMoved&&this.lastPlacement?.key===key&&this.lastPlacement.ready===ready)continue;
    await this.runtime.call('position',{tabId:this.webContents.tabId,...this.bounds,visible:this.visible,...(notifyParentMoved?{notifyParentMoved:true}:{})});
    this.lastPlacement={key,ready};
   }
  }).catch(error=>{this.placementDirty=false;this.lastPlacement=null;if(!this.runtime.closed&&!this.webContents.isDestroyed())this.runtime.emit('runtime-error',error);}).finally(()=>{this.placementPromise=null;if(this.placementDirty&&!this.runtime.closed&&!this.webContents.isDestroyed())this.position();});
  return this.placementPromise;
 }
}
class EdgeCookies extends EventEmitter{
 constructor(session){super();this.session=session;this.snapshot=null;this.polling=null;}
 async allRaw(){const tab=await this.session.service(),r=await this.session.runtime.cdp(tab.tabId,'Storage.getCookies');return (r.cookies||[]).filter(c=>c.expires<0||!c.expires||c.expires>Date.now()/1000).map(cookieFromCdp);}
 async get(filter={}){await this.session.ensureInitialCookies();const rows=await this.allRaw();this.diff(rows);return rows.filter(c=>cookieMatches(c,filter));}
 diff(rows,emit=true){const next=new Map(rows.map(c=>[cookieId(c),c]));if(emit){const previous=this.snapshot||new Map();for(const [key,old]of previous)if(!next.has(key))this.emit('changed',{},old,'explicit',true);for(const [key,row]of next)if(JSON.stringify(previous.get(key))!==JSON.stringify(row))this.emit('changed',{},row,'explicit',false);}this.snapshot=next;}
 async poll(){if(!this.session.runtime.started)return;if(this.polling)return this.polling;this.polling=this.allRaw().then(rows=>this.diff(rows)).finally(()=>{this.polling=null;});return this.polling;}
 async setRaw(details){const tab=await this.session.service(),r=await this.session.runtime.cdp(tab.tabId,'Network.setCookie',cookieForCdp(details));if(r?.success===false)throw new Error(this.session.engine+' rejected this cookie’s attributes.');}
 async set(details){await this.session.ensureInitialCookies();if(!this.snapshot)this.diff(await this.allRaw(),false);await this.setRaw(details);this.diff(await this.allRaw());}
 async remove(url,name){await this.session.ensureInitialCookies();const tab=await this.session.service();await this.session.runtime.cdp(tab.tabId,'Network.deleteCookies',{url,name});await this.poll();}
 async flushStore(){if(this.session.runtime.started)await this.poll();}
}
class EdgeSession extends EventEmitter{
 constructor(options={}){
  super();this.isEdge=true;this.engine=options.engineName||'Microsoft Edge WebView2';this.options=options;this.runtime=options.runtime||new EdgeRuntime(options);this.cookies=new EdgeCookies(this);this.userAgent='';this._service=null;this._servicePromise=null;this._initialRows=[];this._initialPromise=null;this.initialCookieStatus=null;this.beforeRequest=null;this.beforeHeaders=null;this.fixturePromise=null;this.pixivHandler=null;this.pixivActive=new Map();this.downloadHandler=null;this.downloadChoosing=false;
  this.webRequest={onBeforeRequest:(filter,listener)=>{this.beforeRequest=typeof filter==='function'?filter:listener;},onBeforeSendHeaders:(filter,listener)=>{this.beforeHeaders=typeof filter==='function'?filter:listener;}};
  this.runtime.on('resource-request',e=>this.resourceRequest(e));this.runtime.on('web-message',e=>this.webMessage(e));this.runtime.on('download-requested',e=>this.downloadRequested(e));this.runtime.on('download-starting',e=>this.emit('native-download',e));this.runtime.on('runtime-error',e=>{this.emit('runtime-error',e);if(this.listenerCount('error'))this.emit('error',e);});
  this.cookieTimer=setInterval(()=>{if(this.runtime.started&&[...this.runtime.views.values()].some(v=>httpUrl(v.webContents.getURL())))this.cookies.poll().catch(()=>{});},3000);this.cookieTimer.unref();
 }
 createView(tab,win){if(win)this.runtime.win=win;const v=new EdgeView(this.runtime,this,tab);this.runtime.views.set(String(tab.id),v);return v;}
 setInitialCookies(rows){if(this._initialPromise)throw new Error('Initial browser cookies are already being restored.');this._initialRows=Array.isArray(rows)?rows.map(r=>({...r})):[];}
 ensureInitialCookies(){
  if(this._initialPromise)return this._initialPromise;
  if(!this._initialRows.length)return Promise.resolve(this.initialCookieStatus||{count:0,browserAccepted:0,browserRejected:0});
  const rows=this._initialRows;this._initialRows=[];
  const attempt=(async()=>{await this.service();let browserAccepted=0,browserRejected=0;
   for(const r of rows){try{const bare=r.domain.replace(/^\./,''),hostOnly=r.hostOnly??!r.domain.startsWith('.'),d={url:(r.secure?'https':'http')+'://'+bare+(r.path||'/'),name:r.name,value:r.value,path:r.path||'/',secure:!!r.secure,httpOnly:!!r.httpOnly,sameSite:r.sameSite,...(!hostOnly?{domain:r.domain}:{}),...(!r.session&&r.expirationDate!==undefined?{expirationDate:r.expirationDate}:{})};
    await this.cookies.setRaw(d);
    const peers=(await this.cookies.allRaw()).filter(c=>c.domain.replace(/^\./,'')===bare&&c.name===r.name&&c.path===(r.path||'/')&&c.hostOnly!==hostOnly);
    for(const peer of peers)await this.cookies.setRaw({url:(peer.secure?'https':'http')+'://'+bare+peer.path,name:peer.name,value:peer.value,path:peer.path,secure:peer.secure,httpOnly:peer.httpOnly,sameSite:peer.sameSite,...(!peer.hostOnly?{domain:peer.domain}:{}),expirationDate:1});
    browserAccepted++;
   }catch{browserRejected++;}}
   this.cookies.diff(await this.cookies.allRaw(),false);this.initialCookieStatus={count:rows.length,browserAccepted,browserRejected};this.emit('initial-cookie-status',this.initialCookieStatus);return this.initialCookieStatus;
  })();let current;current=attempt.catch(error=>{if(this._initialPromise===current){this._initialRows=[...rows,...this._initialRows];this._initialPromise=null;}throw error;});this._initialPromise=current;return current;
 }
 async service(){
  if(this._servicePromise)return this._servicePromise.then(async w=>{await w.ensure();return w;});
  const v=this.createView({id:'__service'});this._service=v.webContents;
  this._servicePromise=this._service.ensure().then(async()=>{if(this.fixturePromise)await this.fixturePromise;return this._service;}).catch(e=>{this._service=null;this._servicePromise=null;throw e;});return this._servicePromise;
 }
 async refreshUserAgent(w){
  const tab=w||await this.service();let ua='';
  try{const r=await this.runtime.cdp(tab.tabId,'Runtime.evaluate',{expression:'navigator.userAgent',returnByValue:true});ua=r?.result?.value||'';}catch{}
  if(typeof ua!=='string'||!ua.trim())try{const r=await this.runtime.cdp(tab.tabId,'Browser.getVersion');ua=r?.userAgent||'';}catch{}
  if(typeof ua!=='string'||ua.length<15||ua.length>2000||/[\r\n]/.test(ua))throw new Error('The '+this.engine+' browser identity could not be read. Reopen Browser before retrying this download.');
  this.userAgent=ua;this.runtime.userAgent=ua;return ua;
 }
 async prepareForWorker(){
  const initialCookies=await this.ensureInitialCookies(),tab=await this.service();
  const userAgent=await this.refreshUserAgent(tab);await this.cookies.poll();
  return {userAgent,identity:{...this.runtime.identity},initialCookies};
 }
 async setDownloadDir(directory){
  if(typeof directory!=='string'||directory.length>8000||directory.includes('\0'))throw new Error('Choose a valid browser download folder.');
  this.options.downloadDir=directory;this.runtime.options=this.runtime.options||{};this.runtime.options.downloadDir=directory;
  if(this.runtime.started)await this.runtime.call('configure-downloads',{directory});
  return {directory};
 }
 setUserAgent(value){this.userAgent=String(value||'');} getUserAgent(){return this.userAgent||this.runtime.userAgent||'';}
 setPermissionRequestHandler(handler){this.permissionHandler=handler;}
 setDownloadHandler(handler){this.downloadHandler=handler;}
 async downloadRequested(event){
  let result={canceled:true},choosing=false;
  try{
   const w=this.runtime.views.get(String(event.tabId))?.webContents;
   if(!this.downloadChoosing&&w&&!w.isDestroyed()&&w.tabId!=='__service'&&httpUrl(w.getURL())&&this.downloadHandler){
    this.downloadChoosing=true;choosing=true;const chosen=await this.downloadHandler({...event,webContents:w});
    if(chosen?.canceled!==true&&typeof chosen?.filePath==='string'&&path.isAbsolute(chosen.filePath)&&!chosen.filePath.includes('\0'))result={canceled:false,filePath:chosen.filePath};
   }
  }catch{}finally{
   if(choosing)this.downloadChoosing=false;
   if(!this.runtime.closed)await this.runtime.call('download-choice',{downloadId:event.downloadId,...result}).catch(()=>{});
  }
 }
 setPixivHandler(handler){this.pixivHandler=handler;}
 async webMessage(e){
  const w=this.runtime.views.get(e.tabId)?.webContents;let m=e.message;if(typeof m==='string')try{m=JSON.parse(m);}catch{return;}
  if(!w||w.isDestroyed()||!pixivUrl(w.getURL())||!pixivUrl(e.source)||new URL(w.getURL()).origin!==new URL(e.source).origin||m?.kind!=='df-pixiv-fetch'||m.method&&m.method!=='GET'||!mediaUrl(m.url)||typeof m.id!=='string'||!m.id.length||m.id.length>200)return;
  const id=m.id,navigationGeneration=w.generation;
  const current=()=>!this.runtime.closed&&!w.isDestroyed()&&w.generation===navigationGeneration&&pixivUrl(w.getURL())&&new URL(w.getURL()).origin===new URL(e.source).origin;
  const post=async message=>{if(!current())return false;await this.runtime.call('post-message',{tabId:w.tabId,message});return current();};
  let active=this.pixivActive.get(e.tabId);if(!active){active=new Map();this.pixivActive.set(e.tabId,active);}
  if(active.has(id))return;
  if(active.size>=4){await post({kind:'df-pixiv-reply',id,result:{error:'Too many Pixiv media downloads are active. Try again shortly.'}}).catch(()=>{});return;}
  const token={navigationGeneration};active.set(id,token);
  try{
   if(!this.pixivHandler)throw new Error('The Pixiv media bridge is unavailable.');
   const result=await this.pixivHandler({url:m.url,method:'GET'},{webContents:w,source:e.source,navigationGeneration});if(!current())return;
   if(typeof result?.error==='string'){await post({kind:'df-pixiv-reply',id,result:{error:result.error.slice(0,1000)}});return;}
   const value=result?.bytes;let bytes;
   if(Buffer.isBuffer(value))bytes=value;
   else if(value instanceof Uint8Array)bytes=Buffer.from(value.buffer,value.byteOffset,value.byteLength);
   else if(value instanceof ArrayBuffer)bytes=Buffer.from(value);
   else if(Array.isArray(value)&&value.length<=128000000&&value.every(n=>Number.isInteger(n)&&n>=0&&n<=255))bytes=Buffer.from(value);
   else throw new Error('The Pixiv media bridge returned no valid bytes.');
   if(bytes.length>128000000)throw new Error('The Pixiv media exceeds the bridge size limit.');
   const chunkSize=1048576;
   if(bytes.length<=chunkSize){await post({kind:'df-pixiv-reply',id,result:{bytes:Array.from(bytes)}});return;}
   const chunks=Math.ceil(bytes.length/chunkSize);
   if(!await post({kind:'df-pixiv-start',id,totalBytes:bytes.length,chunkSize,chunks}))return;
   for(let index=0;index<chunks;index++)if(!await post({kind:'df-pixiv-chunk',id,index,base64:bytes.subarray(index*chunkSize,Math.min(bytes.length,(index+1)*chunkSize)).toString('base64')}))return;
   await post({kind:'df-pixiv-complete',id,totalBytes:bytes.length,chunks});
  }catch{await post({kind:'df-pixiv-reply',id,result:{error:'The Pixiv media download could not finish.'}}).catch(()=>{});}
  finally{if(active.get(id)===token)active.delete(id);if(!active.size&&this.pixivActive.get(e.tabId)===active)this.pixivActive.delete(e.tabId);}
 }
 resourceRequest(d){
  const w=this.runtime.views.get(d.tabId)?.webContents,type=({Document:'mainFrame',Script:'script',Stylesheet:'stylesheet',Image:'image',Media:'media',Font:'font',XmlHttpRequest:'xhr',Fetch:'fetch',SubDocument:'subFrame'})[d.type]||String(d.type||'other').toLowerCase(),request={...d,webContentsId:w?.id,referrer:d.source||w?.getURL()||'',resourceType:type};
  let done=false;const reply=r=>{if(done)return;done=true;this.runtime.call('resource-decision',{requestId:d.requestId,block:!!r?.cancel,...(r?.response?r.response:{})}).catch(()=>{});};
  try{this.beforeRequest?this.beforeRequest(request,reply):reply({});}catch{reply({});}
 }
 async setFixtures(routes){if(!this.options.qaMode)throw new Error('Native fixture routing is restricted to isolated test profiles.');this.fixturePromise=this.runtime.call('set-fixtures',{routes,blockUnmatched:true});await this.fixturePromise;}
 async fetch(url,o={}){
  const u=httpUrl(url);if(!u)throw new Error('Browser requests require HTTP or HTTPS.');if(o.signal?.aborted)throw o.signal.reason||new Error('The browser request was cancelled.');
  await this.ensureInitialCookies();const ref=o.headers?.Referer||o.headers?.referer,source=o.webContents||[...this.runtime.views.values()].map(v=>v.webContents).find(w=>!w.isDestroyed()&&httpUrl(w.getURL())?.origin===(httpUrl(ref)?.origin||u.origin));
  // Same-origin pagination uses the actual Edge connection and cookies. Opaque
  // redirect responses fail closed instead of silently following off-site.
  if(source&&httpUrl(source.getURL())?.origin===u.origin&&o.redirect==='manual'){
   const code='(async()=>{const r=await fetch('+JSON.stringify(u.href)+',{credentials:"include",redirect:"manual",signal:AbortSignal.timeout(30000),headers:{Accept:"text/html,application/xhtml+xml"}});if(r.type==="opaqueredirect")return {redirect:true};const reader=r.body?.getReader(),parts=[];let size=0;while(reader){const p=await reader.read();if(p.done)break;size+=p.value.length;if(size>8000000){await reader.cancel();throw new Error("The next page is too large to append.");}for(const byte of p.value)parts.push(byte);}return {status:r.status,headers:[...r.headers],bytes:parts};})()';
   const r=await source.executeJavaScript(code);if(o.signal?.aborted)throw o.signal.reason||new Error('The browser request was cancelled.');if(r.redirect)throw new Error('The next page redirected. Open it normally before continuing.');
   return new Response([204,205,304].includes(r.status)?null:new Uint8Array(r.bytes),{status:r.status,headers:r.headers});
  }
  // CDP loadNetworkResource does not expose the final URL of redirects. Strict
  // cross-origin media therefore uses separate HTTP with exact scoped Edge
  // cookies and real Edge UA, without pretending this transport is WebView2.
  if(o.redirect==='error'){
   const headers=new Headers(o.headers||{}),rows=await this.cookies.get({url:u.href});if(rows.length)headers.set('Cookie',rows.map(c=>c.name+'='+c.value).join('; '));if(this.getUserAgent())headers.set('User-Agent',this.getUserAgent());
   return fetch(u.href,{method:o.method||'GET',headers,signal:o.signal,redirect:'error'});
  }
  const w=source||await this.service();await w.ensure();await w.refreshFrames();const r=await this.runtime.cdp(w.tabId,'Network.loadNetworkResource',{frameId:w.mainFrame.frameId,url:u.href,options:{disableCache:false,includeCredentials:true}}),resource=r.resource||{};
  if(!resource.success&&!resource.httpStatusCode)throw new Error('The browser could not load this resource.');
  const status=Number(resource.httpStatusCode)||200,handle=resource.stream,headers=new Headers(resource.headers||{}),runtime=this.runtime,tabId=w.tabId,signal=o.signal;let size=0,closed=false;
  const close=async()=>{if(closed)return;closed=true;if(handle)await runtime.cdp(tabId,'IO.close',{handle}).catch(()=>{});};
  const body=new ReadableStream({async pull(controller){try{if(signal?.aborted){await close();controller.error(signal.reason||new Error('The browser request was cancelled.'));return;}if(!handle){await close();controller.close();return;}const p=await runtime.cdp(tabId,'IO.read',{handle,size:65536}),bytes=Buffer.from(p.data||'',p.base64Encoded?'base64':'utf8');size+=bytes.length;if(size>(Number(o.maxBytes)||128000000))throw new Error('The browser resource exceeds its size limit.');if(bytes.length)controller.enqueue(new Uint8Array(bytes));if(p.eof){await close();controller.close();}}catch(e){await close();controller.error(e);}},cancel:close});
  return new Response([204,205,304].includes(status)?null:body,{status,headers});
 }
 async resolveHost(host){const rows=await dns.promises.lookup(host,{all:true});return {endpoints:rows.map(r=>({address:r.address,family:r.family}))};}
 async getCacheSize(){return null;}
 async clearCache(){if(this.runtime.started)await this.runtime.call('clear-data',{options:{cache:true}});}
 async clearStorageData({storages=[]}={}){await this.ensureInitialCookies();await this.runtime.call('clear-data',{options:{cookies:storages.includes('cookies'),storage:storages.some(s=>s!=='cookies')}});await this.cookies.poll();}
 close(){clearInterval(this.cookieTimer);return this.runtime.close();}
}
let qaSession=null;
function createEdgeSession(options){const session=new EdgeSession({...options,qaMode:options?.qaMode??!!process.env.DF_DATA_DIR});if(session.options.qaMode&&process.env.DF_DATA_DIR)qaSession=session;return session;}
function getQaSession(){if(!process.env.DF_DATA_DIR||!qaSession?.options.qaMode)throw new Error('Native QA access requires an isolated test profile.');return qaSession;}
module.exports={createEdgeSession,getQaSession,nativeErrorCode,EdgeSession,EdgeRuntime,EdgeWebContents,EdgeFrame,cookieForCdp,cookieFromCdp,cookieMatches,pixivUrl,mediaUrl,nativeHandle};

