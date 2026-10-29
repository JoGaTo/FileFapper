'use strict';
const crypto=require('node:crypto');
const dom=require('./infinite-dom.cjs');
const {validUrl}=require('../core.cjs');
const manifest={id:'infinite-scroll',name:'FileFapper Infinite Scroll',version:'1.1.0',author:'FileFapper',description:'Rule34 and E/ExHentai pagination, forced numbered pages and native Load more controls.'};
const script=(fn,...args)=>`(${fn.toString()})(${args.map(x=>JSON.stringify(x)).join(',')})`;
function settings(p={}){return {enabled:!!p.enabled,force:p.force!==false,speed:Math.max(20,Math.min(2000,Number(p.speed)||90)),maxPages:Math.max(1,Math.min(200,Math.round(Number(p.maxPages)||50))),delay:Math.max(1,Math.min(15,Number(p.delay)||2)),columns:Math.max(1,Math.min(5,Math.round(Number(p.columns)||4)))};}
function sameOrigin(url,base){try{return !!validUrl(url,false)&&new URL(url).origin===new URL(base).origin;}catch{return false;}}
class InfiniteScroll{
 constructor({session,onChange=()=>{},isVisible=()=>true}){this.session=session;this.onChange=onChange;this.isVisible=isVisible;this.jobs=new Map();}
 status(w){const j=w&&this.jobs.get(w.id);return j?{enabled:j.enabled,force:j.prefs.force,auto:j.auto,loading:!!j.loading,pages:j.pages,profile:j.profile||'',phase:j.phase||'',method:j.method||'',message:j.message,error:j.error||''}:{enabled:false,auto:false,pages:0,message:''};}
 async ensure(w,p){
  let j=this.jobs.get(w.id);
  if(!j){
   j={url:w.getURL(),token:'__dfScroll_'+crypto.randomBytes(10).toString('hex'),enabled:false,auto:false,pages:0,message:'',last:0,prefs:settings(p)};this.jobs.set(w.id,j);
   j.ready=w.executeJavaScript(`(${dom.install.toString()})(${JSON.stringify(j.token)},(${dom.pageHealth.toString()}))`);
   try{await j.ready;}catch(e){if(this.jobs.get(w.id)===j)this.jobs.delete(w.id);throw e;}
   if(this.jobs.get(w.id)!==j)return j;
   j.timer=setInterval(()=>this.tick(w,j),700);j.timer.unref();
   j.autoTimer=setInterval(()=>{if(j.auto&&this.isVisible(w)&&!w.isDestroyed())w.executeJavaScript(script(dom.autoStep,j.token,j.prefs.speed*.1)).catch(()=>{});},100);j.autoTimer.unref();
  }
  await j.ready;j.prefs=settings(p);await w.executeJavaScript(script(dom.setColumns,j.token,j.prefs.columns)).catch(()=>{});return j;
 }
 async enable(w,enabled,p){
  if(!w||!validUrl(w.getURL(),false))throw new Error('Open a web page first.');const j=await this.ensure(w,p);j.enabled=enabled;j.error='';
  if(!enabled){j.controller?.abort();j.message='Infinite scrolling off.';j.phase='off';}
  else{const state=await w.executeJavaScript(script(dom.inspect,j.token,true,j.prefs));this.describe(j,state);}
  this.onChange(w);return this.status(w);
 }
 describe(j,state){
  j.profile=state.profile||j.profile;j.method=state.method||'';j.phase=state.phase||'';
  if(state.error){j.error=state.error;j.auto=false;}
  else if(state.next||state.native)j.message=`${j.profile} · ${j.prefs.force?'Force mode':'Linked pages'} ready. Scroll near the bottom to continue.`;
  else j.message=state.message||'Scroll near the bottom to continue.';
 }
 async auto(w,p){if(!w||!validUrl(w.getURL(),false))throw new Error('Open a web page first.');const j=await this.ensure(w,p);j.auto=!j.auto;j.message=j.auto?'Auto-scrolling. Click Auto-scroll again to stop.':'Auto-scroll stopped.';this.onChange(w);return this.status(w);}
 async read(url,base,signal){
  let current=url;
  for(let i=0;i<4;i++){
   if(!sameOrigin(current,base))throw new Error('The next page leaves this site. Open it normally.');
   const response=await this.session.fetch(current,{redirect:'manual',credentials:'include',headers:{Accept:'text/html,application/xhtml+xml',Referer:base},signal:AbortSignal.any([signal,AbortSignal.timeout(30000)])});
   if(response.status>=300&&response.status<400){const location=response.headers.get('location');await response.body?.cancel();if(!location)throw new Error('The next page redirected without a destination.');current=new URL(location,current).href;continue;}
   if(!response.ok){await response.body?.cancel();throw new Error([429,509].includes(response.status)?'The site requested a cooldown (HTTP '+response.status+'). Infinite scrolling is paused.':[401,403].includes(response.status)?'The next page requires sign-in or a CAPTCHA (HTTP '+response.status+'). Complete it in this tab, then retry.':'The next page returned HTTP '+response.status+'.');}
   if(!/text\/html|application\/xhtml\+xml/i.test(response.headers.get('content-type')||'')){await response.body?.cancel();throw new Error('The next link did not return a web results page. Use the site’s own reader controls.');}
   if(!response.body)return {html:'',url:current};
   const reader=response.body.getReader(),parts=[];let size=0;
   while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>8000000){await reader.cancel();throw new Error('The next page is too large to append.');}parts.push(value);}
   return {html:Buffer.concat(parts).toString('utf8'),url:current};
  }
  throw new Error('Too many next-page redirects.');
 }
 async tick(w,j,force=false){
  if(w.isDestroyed()||this.jobs.get(w.id)!==j||j.busy||(!force&&(!j.enabled||!this.isVisible(w)))||j.error)return;
  const interval=Math.max(j.prefs.delay,/^(?:exhentai|e-hentai)\.org$/.test(new URL(j.url).hostname)?3:0)*1000;
  if(Date.now()-j.last<interval){if(force){j.message='Waiting for the minimum request interval. Try again in a moment.';this.onChange(w);}return;}
  j.busy=true;
  try{
   const state=await w.executeJavaScript(script(dom.inspect,j.token,force,j.prefs));if(!state.near)return;
   this.describe(j,state);if(state.pages!==undefined)j.pages=state.pages;
   if(state.phase==='native-complete'){j.message=`${j.pages} additional ${j.pages===1?'page':'pages'} loaded by the site.`;return;}
   if(!state.next&&!state.native)return;
   if(j.pages>=j.prefs.maxPages){j.error='Page limit reached. Increase the extra-page limit in Browser tools or reload this tab.';j.auto=false;return;}
   j.last=Date.now();
   if(state.native){const clicked=await w.executeJavaScript(script(dom.loadMore,j.token));j.message=clicked?'Loading more results using the site’s own control…':'The Load more control is no longer available.';return;}
   if(!sameOrigin(state.next,j.url))throw new Error('The next page leaves this site. Open it normally.');
   j.loading=true;j.phase='loading';j.message='Loading the next page…';this.onChange(w);j.controller=new AbortController();
   const response=await this.read(state.next,j.url,j.controller.signal);
   if(w.isDestroyed()||this.jobs.get(w.id)!==j||w.getURL()!==j.url||j.controller.signal.aborted)return;
   const result=await w.executeJavaScript(script(dom.append,j.token,response.html,response.url,state.recipe,j.prefs.columns));
   if(result.end){j.phase='end';j.message=result.message;return;}
   if(!result.added)throw new Error(result.error||'No additional items found.');
   j.pages=result.pages;j.phase='ready';j.message=`${j.pages} additional ${j.pages===1?'page':'pages'} loaded · ${j.profile}.`;
  }catch(e){if(!j.controller?.signal.aborted){j.error=e.name==='TimeoutError'?'The next page timed out. Retry when the site is responding.':e.message;j.auto=false;j.phase='error';}}
  finally{j.loading=false;j.busy=false;j.controller=null;if(this.jobs.get(w.id)===j)this.onChange(w);}
 }
 async next(w,p){if(!w||!validUrl(w.getURL(),false))throw new Error('Open a web page first.');const j=await this.ensure(w,p);j.error='';await this.tick(w,j,true);return this.status(w);}
 async collectionSeed(w){const j=this.jobs.get(w?.id);if(!j||!j.pages)return undefined;const state=await w.executeJavaScript(script(dom.inspect,j.token,true,j.prefs));return {next:state.next||null};}
 stop(w){const j=this.jobs.get(w.id);if(!j)return;clearInterval(j.timer);clearInterval(j.autoTimer);j.controller?.abort();this.jobs.delete(w.id);if(!w.isDestroyed())w.executeJavaScript(script(dom.remove,j.token)).catch(()=>{});}
 close(){for(const j of this.jobs.values()){clearInterval(j.timer);clearInterval(j.autoTimer);j.controller?.abort();}this.jobs.clear();}
}
module.exports={manifest,settings,sameOrigin,InfiniteScroll};
