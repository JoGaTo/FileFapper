'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {webContents}=require('electron');
const {ElectronBlocker,Request}=require('@ghostery/adblocker-electron');
const {settings}=require('./adblock-settings.cjs');
const {challengeResource}=require('./challenge-resources.cjs');
const {hosts,hostOf}=require('./site-connection.cjs');
const LISTS={ads:'https://easylist.to/easylist/easylist.txt',tracking:'https://easylist.to/easylist/easyprivacy.txt'};
class Adblock{
  constructor(session,dataDir,onChange){this.session=session;this.dir=path.join(dataDir,'filters');this.notify=onChange;this.blocked=0;this.engine=null;this.updatedAt='Bundled lists';this.error='';}
  configure(p,compatibilitySites=[]){
    this.prefs=settings(p);
    this.compatibilitySites=hosts(compatibilitySites);
    if(this.engine?.isBlockingEnabled(this.session))this.engine.disableBlockingInSession(this.session);
    this.engine=null;
    if(this.session.isEdge)this.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},null);
    if(!this.prefs.enabled){this.notify?.();return;}
    let rules=[];
    for(const [name,file] of [['ads','easylist.txt'],['tracking','easyprivacy.txt']])if(this.prefs[name]){const local=path.join(this.dir,file),bundled=path.join(__dirname,'filters',file);if(fs.existsSync(local)){rules.push(fs.readFileSync(local,'utf8'));this.updatedAt=fs.statSync(local).mtime.toISOString();}else if(fs.existsSync(bundled))rules.push(fs.readFileSync(bundled,'utf8'));}
    rules.push(this.prefs.custom);
    for(const host of this.prefs.allowlist)rules.push(`@@*$domain=${host}\n@@||${host}^$document`);
    this.engine=ElectronBlocker.parse(rules.join('\n'),{loadCosmeticFilters:this.prefs.cosmetic,loadGenericCosmeticsFilters:this.prefs.cosmetic,enableMutationObserver:this.prefs.cosmetic,loadNetworkFilters:true});
    const allowed=url=>{const host=hostOf(url);return !!host&&(this.compatibilitySites.includes(host)||this.prefs.allowlist.some(d=>host===d||host.endsWith('.'+d)));};
    if(this.session.isEdge){
      this.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,callback)=>{
        const source=details.referrer||details.sourceUrl||details.source||details.url;
        if(challengeResource(details.url)||allowed(source))return callback({});
        const types={mainframe:'main_frame',subframe:'sub_frame',document:'main_frame',iframe:'sub_frame',stylesheet:'stylesheet',script:'script',image:'image',media:'media',font:'font',xmlhttprequest:'xmlhttprequest',fetch:'xmlhttprequest',xhr:'xmlhttprequest',websocket:'websocket'};
        const result=this.engine.match(Request.fromRawDetails({url:details.url,sourceUrl:source,type:types[String(details.resourceType||details.type||'').toLowerCase()]||'other'}));
        if(result.match){this.blocked++;if(this.blocked%10===1)this.notify?.();return callback({cancel:true});}callback({});
      });this.error='';this.notify?.();return;
    }
    const beforeRequest=this.engine.onBeforeRequest;
    this.engine.onBeforeRequest=(details,callback)=>{const source=details.webContentsId?webContents.fromId(details.webContentsId)?.getURL():details.referrer;if(challengeResource(details.url)||allowed(source)||allowed(details.referrer))return callback({});return beforeRequest(details,callback);};
    const cosmetic=this.engine.onInjectCosmeticFilters;
    this.engine.onInjectCosmeticFilters=(event,url,msg)=>{if(allowed(event.sender.getURL())||allowed(url))return;return cosmetic(event,url,msg);};
    this.engine.on('request-blocked',()=>{this.blocked++;if(this.blocked%10===1)this.notify?.();});
    this.engine.enableBlockingInSession(this.session);this.error='';this.notify?.();
  }
  async applyCosmetics(w){
    if(!this.session.isEdge||!this.engine||!this.prefs.cosmetic||!w||w.isDestroyed())return;
    const url=w.getURL(),host=hostOf(url);if(!host||this.compatibilitySites.includes(host)||this.prefs.allowlist.some(d=>host===d||host.endsWith('.'+d)))return;
    const request=Request.fromRawDetails({url,sourceUrl:url});
    const dom=await w.executeJavaScript("(()=>({classes:[...new Set([...document.querySelectorAll('[class]')].slice(0,2000).flatMap(n=>[...n.classList]))].slice(0,1000),ids:[...document.querySelectorAll('[id]')].slice(0,1000).map(n=>n.id),hrefs:[...document.querySelectorAll('a[href]')].slice(0,1000).map(n=>n.getAttribute('href'))}))()");
    const result=this.engine.getCosmeticsFilters({url,hostname:request.hostname,domain:request.domain,...dom,getInjectionRules:false,getExtendedRules:false});
    if(result.styles)await w.executeJavaScript("(()=>{let s=document.getElementById('__dfEdgeCosmetic');if(!s){s=document.createElement('style');s.id='__dfEdgeCosmetic';document.documentElement.appendChild(s);}s.textContent="+JSON.stringify(result.styles)+";})()");
  }
  async update(){
    const lists=[];
    for(const [name,url] of Object.entries(LISTS)){const r=await fetch(url,{signal:AbortSignal.timeout(45000)});if(!r.ok)throw new Error('Could not update '+name+' filters: HTTP '+r.status);const text=await r.text();if(!text.includes('[Adblock')||text.length>15000000)throw new Error('Invalid filter list received.');lists.push([name==='ads'?'easylist.txt':'easyprivacy.txt',text]);}
    fs.mkdirSync(this.dir,{recursive:true});for(const [file,text] of lists){fs.writeFileSync(path.join(this.dir,file+'.tmp'),text);fs.renameSync(path.join(this.dir,file+'.tmp'),path.join(this.dir,file));}
    this.configure(this.prefs,this.compatibilitySites);return this.summary();
  }
  summary(){return {blocked:this.blocked,updatedAt:this.updatedAt,error:this.error,enabled:this.prefs?.enabled!==false};}
  close(){if(this.session.isEdge)this.session.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},null);else if(this.engine?.isBlockingEnabled(this.session))this.engine.disableBlockingInSession(this.session);}
}
module.exports={Adblock,settings,LISTS};
