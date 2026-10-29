'use strict';
const crypto=require('node:crypto');
const {validUrl}=require('../core.cjs');
const dom=require('./translation-dom.cjs');
const manifest={id:'page-translator',name:'FileFapper Page Translator',version:'2.0.0',author:'FileFapper',description:'Translate the current tab and newly loaded text, with a no-key Microsoft default and optional service keys.'};
const PROVIDERS=new Set(['microsoft','deepl','azure','libre','google-proxy']);
function language(value){return /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(String(value))?String(value):'en';}
function settings(p={}){return {provider:PROVIDERS.has(p.provider)?p.provider:'microsoft',target:language(p.target||'en'),libreEndpoint:String(p.libreEndpoint||'').slice(0,2000),region:String(p.region||'').replace(/[^a-z0-9-]/gi,'').slice(0,80),deeplPlan:p.deeplPlan==='pro'?'pro':'free',continuous:p.continuous!==false,includeFrames:p.includeFrames!==false};}
function googleUrl(url,target){if(!validUrl(url,false))throw new Error('Open a web page first.');const u=new URL('https://translate.google.com/translate');u.searchParams.set('sl','auto');u.searchParams.set('tl',language(target));u.searchParams.set('u',url);return u.href;}
function endpoint(value){let u;try{u=new URL(value);}catch{throw new Error('Enter a LibreTranslate service address in Browser tools.');}if(!validUrl(u.href,false))throw new Error('Enter an HTTP or HTTPS LibreTranslate service address.');u.pathname=u.pathname.replace(/\/?(?:translate)?\/?$/,'')+'/translate';u.search='';u.hash='';return u.href;}
function splitText(text,limit=1800){const result=[];while(text.length>limit){let end=text.lastIndexOf(' ',limit);if(end<limit*.5)end=limit;if(/[\uD800-\uDBFF]/.test(text[end-1]))end--;result.push(text.slice(0,end));text=text.slice(end);}if(text)result.push(text);return result;}
function requestFor(p,texts,key=''){
 const target=language(p.target),headers={'Content-Type':'application/json'};
 if(p.provider==='microsoft'){const u=new URL('https://edge.microsoft.com/translate/translatetext');u.search=new URLSearchParams({isEnterpriseClient:'false',to:target==='zh'?'zh-Hans':target==='zh-TW'?'zh-Hant':target,textType:'plain'});return {url:u.href,headers,body:JSON.stringify(texts),parse:j=>j.map(r=>r.translations?.[0]?.text)};}
 if(p.provider==='azure'){if(!key)throw new Error('Add your Microsoft Translator API key in Browser tools → Translation.');const u=new URL('https://api.cognitive.microsofttranslator.com/translate');u.search=new URLSearchParams({'api-version':'3.0',to:target==='zh'?'zh-Hans':target==='zh-TW'?'zh-Hant':target,textType:'plain'});headers['Ocp-Apim-Subscription-Key']=key;if(p.region)headers['Ocp-Apim-Subscription-Region']=p.region;return {url:u.href,headers,body:JSON.stringify(texts.map(Text=>({Text}))),parse:j=>j.map(r=>r.translations?.[0]?.text)};}
 if(p.provider==='deepl'){if(!key)throw new Error('Add your DeepL API key in Browser tools → Translation.');headers.Authorization='DeepL-Auth-Key '+key;return {url:`https://api${p.deeplPlan==='pro'?'':'-free'}.deepl.com/v2/translate`,headers,body:JSON.stringify({text:texts,target_lang:target==='zh-TW'?'ZH-HANT':target.toUpperCase(),preserve_formatting:true}),parse:j=>j.translations.map(r=>r.text)};}
 if(p.provider==='libre')return {url:endpoint(p.libreEndpoint),headers,body:JSON.stringify({q:texts,source:'auto',target,format:'text',...(key?{api_key:key}:{})}),parse:j=>Array.isArray(j.translatedText)?j.translatedText:[j.translatedText]};
 throw new Error('Choose an in-page translation provider.');
}
const script=(fn,...args)=>`(${fn.toString()})(${args.map(x=>JSON.stringify(x)).join(',')})`;
class Translator{
 constructor({onChange=()=>{},fetcher=(...args)=>global.fetch(...args)}={}){this.jobs=new Map();this.onChange=onChange;this.fetcher=fetcher;this.cache=new Map();this.nextRequest=0;}
 status(w){const job=w&&this.jobs.get(w.id);return job?{active:true,busy:job.busy,paused:!!job.error,error:job.error||'',segments:job.count,provider:job.settings.provider,target:job.settings.target,continuous:job.settings.continuous}:{active:false,segments:0};}
 async stop(w,{restore=true}={}){const job=this.jobs.get(w.id);if(!job)return;job.active=false;job.abort.abort();clearInterval(job.timer);this.jobs.delete(w.id);for(const frame of job.frames.values())try{await frame.ref.executeJavaScript(script(dom.restore,job.token,restore));}catch{}this.onChange(w);}
 async restore(w){return this.stop(w);}
 frames(w,p){try{return p.includeFrames?[...new Map([w.mainFrame,...w.mainFrame.framesInSubtree].filter(f=>validUrl(f.url,false)).map(f=>[f.processId+':'+f.routingId,f])).values()]:[w.mainFrame];}catch{return [];}}
 async texts(texts,job){
  const results=new Map(),missing=[];
  for(const text of new Set(texts)){const id=job.settings.provider+'|'+job.settings.target+'|'+text;if(this.cache.has(id))results.set(text,this.cache.get(id));else missing.push(text);}
  const pieces=[];for(const text of missing)splitText(text).forEach((part,index)=>pieces.push({text,part,index}));
  const translated=new Map();
  for(let i=0;i<pieces.length;){const batch=[];let length=0;while(i<pieces.length&&batch.length<25&&length+pieces[i].part.length<=5000){length+=pieces[i].part.length;batch.push(pieces[i++]);}
   if(!job.active)throw new Error('Translation stopped.');
   const wait=Math.max(0,this.nextRequest-Date.now());this.nextRequest=Math.max(Date.now(),this.nextRequest)+450;
   if(wait)await new Promise(resolve=>{const done=()=>{clearTimeout(t);job.abort.signal.removeEventListener('abort',done);resolve();};const t=setTimeout(done,wait);job.abort.signal.addEventListener('abort',done,{once:true});});
   if(!job.active)throw new Error('Translation stopped.');
   const request=requestFor(job.settings,batch.map(x=>x.part),job.key);
   const response=await this.fetcher(request.url,{method:'POST',headers:request.headers,body:request.body,signal:AbortSignal.any([job.abort.signal,AbortSignal.timeout(45000)])});
   if(!response.ok){if(response.status===429)throw new Error('Translation service rate limit reached. Translation is paused; try later or choose your own service key.');throw new Error(`Translation service returned HTTP ${response.status}. Choose another provider in Browser tools or try again later.`);}
   let values;try{values=request.parse(await response.json());}catch{throw new Error('The translation service returned an unreadable response.');}
   if(values.length!==batch.length||values.some(t=>typeof t!=='string'||t.length>100000))throw new Error('The translation service returned an incomplete text batch.');
   batch.forEach((piece,index)=>{if(!translated.has(piece.text))translated.set(piece.text,[]);translated.get(piece.text)[piece.index]=values[index];});
  }
  for(const [text,parts] of translated){const value=parts.join('');results.set(text,value);if(text.length<15000)this.cache.set(job.settings.provider+'|'+job.settings.target+'|'+text,value);}
  while(this.cache.size>2500)this.cache.delete(this.cache.keys().next().value);
  return results;
 }
 async tick(w,job){
  if(!job.active||job.busy||job.error||w.isDestroyed())return;
  job.busy=true;let touched=false;
  try{
   for(const ref of this.frames(w,job.settings)){
    if(!job.active)break;const id=ref.processId+':'+ref.routingId;let frame=job.frames.get(id);
    if(!frame||frame.url!==ref.url){await ref.executeJavaScript(script(dom.install,job.token));frame={ref,url:ref.url};job.frames.set(id,frame);}
    let rows;try{rows=await ref.executeJavaScript(script(dom.collect,job.token,200,12000));}catch{continue;}
    if(!Array.isArray(rows)||!rows.length)continue;
    rows=rows.slice(0,200).filter(r=>Number.isInteger(r.id)&&typeof r.text==='string'&&r.text.length<=60000);
    if(!rows.length)continue;touched=true;this.onChange(w);const values=await this.texts(rows.map(r=>r.text),job);
    if(!job.active||w.isDestroyed()||frame.url!==ref.url)continue;
    const count=await ref.executeJavaScript(script(dom.apply,job.token,rows.map(r=>({id:r.id,source:r.text,text:values.get(r.text)}))));job.count+=Number(count)||0;
   }
  }catch(e){if(job.active){job.error=e.message;clearInterval(job.timer);}}
  finally{job.busy=false;if(touched||job.error)this.onChange(w);}
 }
 async translate(w,p,key){
  if(!validUrl(w.getURL(),false))throw new Error('Open a web page first.');await this.restore(w);
  const job={active:true,busy:false,count:0,settings:settings(p),key,token:'__dfTranslation_'+crypto.randomBytes(12).toString('hex'),frames:new Map(),abort:new AbortController()};
  this.jobs.set(w.id,job);await this.tick(w,job);
  if(job.error)throw new Error(job.error);
  if(job.settings.continuous){job.timer=setInterval(()=>this.tick(w,job),1100);job.timer.unref();}
  else{job.timer=setInterval(async()=>{if(!job.busy){const before=job.count;await this.tick(w,job);if(before===job.count)clearInterval(job.timer);}},900);job.timer.unref();}
  this.onChange(w);return {segments:job.count,continuous:job.settings.continuous,provider:job.settings.provider};
 }
 close(){for(const job of this.jobs.values()){job.active=false;job.abort.abort();clearInterval(job.timer);}this.jobs.clear();this.cache.clear();}
}
module.exports={manifest,language,googleUrl,endpoint,settings,requestFor,splitText,Translator};
