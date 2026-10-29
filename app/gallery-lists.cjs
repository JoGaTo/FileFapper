'use strict';
const {validUrl,siteFor}=require('./core.cjs');
const dates=require('./date-range.cjs');
const extra=require('./extra-listings.cjs');
const categories=[{id:2,name:'Doujinshi'},{id:4,name:'Manga'},{id:8,name:'Artist CG'},{id:16,name:'Game CG'},{id:512,name:'Western'},{id:256,name:'Non-H'},{id:32,name:'Image Set'},{id:64,name:'Cosplay'},{id:128,name:'Asian Porn'},{id:1,name:'Misc'}];
function isRule34Host(hostname,pathname=''){return ['rule34.xxx','r34.app','kurosearch.com'].includes(hostname)||(hostname==='kurozenzen.github.io'&&/(?:^|\/)r34-react(?:\/|$)/.test(pathname));}
// Self-contained: also passed into the sandboxed page scanner below.
function frontendPostUrl(value){try{const u=new URL(value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password)return null;if(!['rule34.xxx','r34.app','kurosearch.com'].includes(u.hostname)&&!(u.hostname==='kurozenzen.github.io'&&/^\/r34-react(?:\/|$)/.test(u.pathname)))return null;const provider=u.pathname.match(/^\/posts?\/([^/]+)/);const q=new URLSearchParams(u.search);const board=q.get('source')||q.get('site')||q.get('booru')||(provider&&!/^\d+$/.test(provider[1])?provider[1]:null);if(u.hostname==='r34.app'&&board&&board!=='rule34.xxx')return null;if(u.hash.includes('?'))for(const [k,v] of new URLSearchParams(u.hash.split('?').slice(1).join('?')))q.set(k,v);let id=['id','post','postId'].map(k=>q.get(k)).find(v=>/^\d+$/.test(v||''));if(!id)id=(u.pathname+'/'+u.hash).match(/\/(?:posts?|view)\/(?:rule34\.xxx\/)?(\d+)(?:\/|$|[?#])/)?.[1];return id?'https://rule34.xxx/index.php?page=post&s=view&id='+id:null;}catch{return null;}}
function baseListingKind(value){try{const u=new URL(value);if(!validUrl(value,false))return null;if(['e-hentai.org','g.e-hentai.org','exhentai.org'].includes(u.hostname)&&u.pathname==='/')return 'eh';if(['danbooru.donmai.us','aibooru.online','aibooru.download','safe.aibooru.online','general.aibooru.online'].includes(u.hostname)&&u.pathname==='/posts')return 'api';if(['kemono.cr','kemono.su','kemono.party','pawchive.pw','pawchive.st'].includes(u.hostname)&&(/^\/[^/]+\/user\/[^/]+\/?$/.test(u.pathname)||u.pathname.replace(/\/$/,'')==='/posts'))return 'api';if(['gelbooru.com','tbib.org'].includes(u.hostname)&&u.searchParams.get('page')==='post'&&u.searchParams.get('s')==='list')return 'booru';if(frontendPostUrl(value))return null;if(u.hostname==='rule34.xxx')return u.pathname==='/index.php'&&u.searchParams.get('page')==='post'&&u.searchParams.get('s')==='list'?'rule34':null;if(isRule34Host(u.hostname,u.pathname)&&(/^(?:\/|\/share\/?|\/posts\/rule34\.xxx\/?|\/index\.php)$/.test(u.pathname)||/^\/r34-react(?:\/|$)/.test(u.pathname)))return 'rule34';}catch{}return null;}
function listingKind(value){
 const added=extra.profile(value);if(added)return added.listing&&!added.detail?'extra':null;
 const base=baseListingKind(value);if(base)return base;
 try{const u=new URL(value);if(!validUrl(value,false))return null;
  if(/^(?:www\.)?hentai-foundry\.com$/.test(u.hostname)){
   if(/^\/pictures\/user\/[^/]+\/\d+(?:\/|$)/.test(u.pathname))return null;
   if(/^\/pictures(?:\/|$)/.test(u.pathname)||/^\/search(?:\/pictures)?\/?$/.test(u.pathname)||/^\/user\/[^/]+\/faves\/pictures/.test(u.pathname))return 'foundry';
  }
  if(/^(?:www\.)?(?:fapreactor\.com|pornreactor\.cc)$/.test(u.hostname)&&!/^\/post\/\d+/.test(u.pathname)&&/^\/(?:$|\d+\/?$|(?:tag|tags|category|categories|search|user|new|best|all|good|top)(?:\/|$))/.test(u.pathname))return 'reactor';
 }catch{}return null;
}
function galleryKey(value){try{const u=new URL(value),g=u.pathname.match(/^\/g\/(\d+)\/([a-z\d]+)\/?$/i);if(g&&['exhentai.org','e-hentai.org','g.e-hentai.org'].includes(u.hostname))return u.origin+'/g/'+g[1]+'/'+g[2].toLowerCase();const post=frontendPostUrl(value);return post?'https://rule34.xxx/post/'+new URL(post).searchParams.get('id'):value;}catch{return value;}}
function categoryState(value){let u;try{u=new URL(value);if(!['e-hentai.org','g.e-hentai.org','exhentai.org'].includes(u.hostname))u=null;}catch{}u=u||new URL('https://exhentai.org/');const raw=Number(u.searchParams.get('f_cats')||0),mask=Number.isInteger(raw)&&raw>=0&&raw<=1023?raw:0;return {url:u.href,site:u.hostname==='exhentai.org'?'exhentai':'ehentai',query:u.searchParams.get('f_search')||'',selected:categories.filter(c=>!(mask&c.id)).map(c=>c.id),categories};}
function categoryUrl({url,site,query,selected}={}){const current=categoryState(url),u=new URL(current.url);u.hostname=site==='ehentai'?'e-hentai.org':'exhentai.org';u.pathname='/';u.hash='';for(const key of ['next','prev','page','seek','jump'])u.searchParams.delete(key);const chosen=new Set((Array.isArray(selected)?selected:[]).map(Number).filter(n=>categories.some(c=>c.id===n)));if(!chosen.size)throw new Error('Choose at least one category.');u.searchParams.set('f_cats',String(1023-[...chosen].reduce((n,bit)=>n|bit,0)));const q=String(query||'').trim().slice(0,1000);if(q)u.searchParams.set('f_search',q);else u.searchParams.delete('f_search');return u.href;}
function collectionSettings(p={}){return {extraPages:Math.max(0,Math.min(199,Math.round(Number(p.extraPages??10)||0))),maxGalleries:Math.max(1,Math.min(5000,Math.round(Number(p.maxGalleries)||500))),...dates.range(p)};}

function postDate(html){
 const doc=new DOMParser().parseFromString(html,'text/html');
 const direct=doc.querySelector('time[datetime]')?.getAttribute('datetime')||doc.querySelector('meta[property="article:published_time"]')?.content;
 if(direct)return direct;
 for(const script of doc.querySelectorAll('script[type="application/ld+json"]'))try{
  const queue=[JSON.parse(script.textContent)];let checked=0;
  while(queue.length&&checked++<100){const row=queue.shift();if(!row||typeof row!=='object')continue;if(row.datePublished)return row.datePublished;if(Array.isArray(row))queue.push(...row);else if(row['@graph'])queue.push(row['@graph']);}
 }catch{}
 const text=doc.body?.textContent||'';return text.match(/(?:Posted|Submitted|Published):?\s*(\d{4}-\d{2}-\d{2})/i)?.[1]||'';
}

// Parse result documents without executing fetched scripts or loading their images.
function scanListing(html,url,health,postUrl,extraScan,extraProfile){
 const doc=html===null?document:new DOMParser().parseFromString(html,'text/html'),u=new URL(url),access=health(doc,url);
 if(access.kind!=='ok')return {error:access.message};
 if(extraProfile?.(url))return extraScan(doc,url,extraProfile);
 const eh=/^(?:e-hentai\.org|g\.e-hentai\.org|exhentai\.org)$/.test(u.hostname),foundry=/^(?:www\.)?hentai-foundry\.com$/.test(u.hostname),reactor=/^(?:www\.)?(?:fapreactor\.com|pornreactor\.cc)$/.test(u.hostname),rows=[],seen=new Set();let truncated=false;
 for(const a of doc.querySelectorAll('a[href]')){
  let target;try{target=new URL(a.getAttribute('href'),url);}catch{continue;}
  if(target.username||target.password)continue;
  let key;
  if(eh){if(target.origin!==u.origin)continue;const match=target.pathname.match(/^\/g\/(\d+)\/([a-z\d]+)\/?$/i);if(!match)continue;target.pathname='/g/'+match[1]+'/'+match[2]+'/';target.search='';key=target.href;}
  else if(foundry||reactor){
   if(target.origin!==u.origin)continue;
   const match=target.pathname.match(foundry?/^\/pictures\/user\/[^/]+\/\d+(?:\/[^?#]*)?$/:/^\/post\/\d+\/?$/);
   if(!match)continue;target.search='';target.hash='';
   if(reactor)target.pathname=target.pathname.replace(/\/$/,'');
   key=target.href;
  }
  else{if(target.origin!==u.origin&&target.hostname!=='rule34.xxx')continue;const own=['gelbooru.com','tbib.org'].includes(u.hostname)&&target.origin===u.origin&&target.searchParams.get('s')==='view'&&/^\d+$/.test(target.searchParams.get('id')||'');const source=own?target.origin+'/index.php?page=post&s=view&id='+target.searchParams.get('id'):postUrl(target.href);if(!source)continue;target=new URL(source);key=target.href;}
  target.hash='';key=target.href;
  const title=([a.querySelector('.glink')?.textContent,a.textContent,a.querySelector('img')?.getAttribute('alt'),a.getAttribute('title')].find(t=>typeof t==='string'&&t.trim())||'Gallery '+(target.pathname.match(/\/g\/(\d+)/)?.[1]||target.searchParams.get('id'))).trim().replace(/\s+/g,' ').slice(0,500);
  if(seen.has(key)){const old=rows.find(r=>r.url===key);if(old&&(!old.title||/^Gallery \d+$/.test(old.title))&&title)old.title=title;continue;}
  if(rows.length>=5000){truncated=true;break;}seen.add(key);const container=a.closest('tr,.gl1e,.gl1t,.gl1m,.gl1c,article,.thumb,.thumb_square,.postContainer,.preview')||a;const posted=container.querySelector('[id^=posted_],time[datetime],[data-created-at]');const date=(posted?.getAttribute('datetime')||posted?.getAttribute('data-created-at')||posted?.textContent||'').match(/\d{4}-\d{2}-\d{2}/)?.[0]||'';rows.push({url:key,title:title||'Gallery',date});
 }
 let next=null;
 const candidates=[...doc.querySelectorAll(eh?'#unext[href],#dnext[href],a[rel~="next"],.ptt a,.searchnav a':'#paginator a,a[rel~="next"],a.next,.next a,.pagination a,.yiiPager a,.pager a,.pagination_expanded a')];
 for(const a of candidates){
  if(a.matches('[aria-disabled="true"],.disabled,[disabled]'))continue;
  const label=(a.textContent||a.getAttribute('alt')||a.getAttribute('title')||a.querySelector('img')?.getAttribute('alt')||'').trim();
  if(!['unext','dnext'].includes(a.id)&&a.rel!=='next'&&!a.matches('.next,.next a')&&!/^(?:next(?:\s+page)?\s*[>»›→]*|[>»›→]+)$/i.test(label))continue;
  const raw=a.getAttribute('href');if(!raw||raw.startsWith('#'))continue;
  try{const n=new URL(raw,url);if(n.origin!==u.origin||n.username||n.password)continue;
    const collectionPath=path=>foundry?path.replace(/\/page\/\d+\/?$/,'').replace(/\/$/,''):reactor?path.replace(/\/\d+\/?$/,'').replace(/\/$/,''):path;
    if(collectionPath(n.pathname)!==collectionPath(u.pathname))continue;for(const [k,v] of u.searchParams)if(!['next','prev','page','pid','seek','jump'].includes(k)&&!n.searchParams.has(k))n.searchParams.append(k,v);if(!eh&&u.searchParams.get('page')==='post'&&!n.searchParams.has('page'))n.searchParams.set('page','post');n.hash='';if(n.href!==u.href){next=n.href;break;}}catch{}
 }
 return {url,rows,next,truncated,title:doc.title,kind:eh?'eh':foundry?'foundry':reactor?'reactor':'rule34'};
}

class GalleryCollector{
 constructor({read,worker,onChange=()=>{}}){this.read=read;this.worker=worker;this.onChange=onChange;this.job=null;this.sequence=0;this.lastRequests=new Map();}
 status(){const j=this.job;return j?{id:j.id,running:j.running,found:j.rows.length,pages:j.pages,phase:j.phase,message:j.message,error:j.error||'',url:j.url,next:j.continuation||j.next,revision:j.revision,scanned:j.scanned||j.rows.length,undated:j.undated||0,dateFrom:j.range?.dateFrom||'',dateTo:j.range?.dateTo||''}:{running:false,found:0,pages:0};}
 results(){return {...this.status(),rows:this.job?.rows||[]};}
 async parse(w,html,url){const {pageHealth}=require('./browser-plugins/infinite-dom.cjs');const code=`(${scanListing.toString()})(${JSON.stringify(html)},${JSON.stringify(url)},(${pageHealth.toString()}),(${frontendPostUrl.toString()}),(${extra.scan.toString()}),(${extra.profile.toString()}))`;return w.executeJavaScript(code);}
 async prepare(w,seed){if(this.job?.running)throw new Error('Stop the current collection before starting another.');const url=w?.getURL();if(!listingKind(url))throw new Error('Open a supported search, tag, category or creator results page first.');if(this.job?.url===url){this.job.w=w;return this.results();}const data=listingKind(url)==='api'?{rows:[],next:null}:await this.parse(w,null,url);if(data.error)throw new Error(data.error);if(w.isDestroyed()||w.getURL()!==url)throw new Error('The page changed. Open Queue galleries again.');this.job={id:++this.sequence,w,url,api:listingKind(url)==='api',rawRows:data.rows,rows:data.rows,continuation:data.truncated?url:null,keys:new Set(data.rows.map(r=>r.url)),pages:1,next:seed?.hasOwnProperty('next')?seed.next:data.next,running:false,phase:'preview',message:data.rows.length+' galleries found on the loaded page.',revision:0};this.onChange();return this.results();}
 async start(w,options,seed){
  const p=collectionSettings(options);await this.prepare(w,seed);const j=this.job;
  if(j.running)throw new Error('A collection is already running.');
  const changed=JSON.stringify(j.range||{})!==JSON.stringify({dateFrom:p.dateFrom,dateTo:p.dateTo});
  if(changed&&!j.api){const data=await this.parse(w,null,j.url);j.rawRows=data.rows;j.rows=data.rows;j.next=seed?.hasOwnProperty('next')?seed.next:data.next;j.pages=1;j.keys=new Set(j.rows.map(r=>r.url));j.continuation=null;}
  j.range={dateFrom:p.dateFrom,dateTo:p.dateTo};j.undated=0;j.scanned=0;
  if(j.api){j.rows=[];j.keys=new Set();}
  if(!p.dateFrom&&!p.dateTo&&j.rows.length>p.maxGalleries){j.rows=j.rows.slice(0,p.maxGalleries);j.keys=new Set(j.rows.map(r=>r.url));j.continuation=j.url;}
  j.running=true;j.error='';j.phase='collecting';j.message='Collecting and checking post dates…';j.controller=new AbortController();const controller=j.controller;j.revision++;this.onChange();
  if(j.api){
   if(!this.worker)throw new Error('The collection worker is unavailable.');
   const child=this.worker({url:j.url,siteId:siteFor(j.url)?.id,...p},e=>{
    if(this.job!==j||j.controller!==controller||controller.signal.aborted)return;
    if(e.event==='collection'){j.rows=e.rows;j.pages=e.pages;j.scanned=e.scanned;j.undated=e.undated;j.next=e.next;j.running=e.running;j.message=e.message||`${j.rows.length} matches · ${j.scanned} posts checked`;j.phase=e.running?'collecting':e.next?'batch-limit':'end';}
    if(e.event==='error'){j.running=false;j.error=e.message;j.phase='error';j.message='Collection stopped. Links already found are kept.';}
    j.revision++;this.onChange();
   });j.worker=child;child.once('error',e=>{if(this.job===j){j.running=false;j.error=e.message;j.revision++;this.onChange();}});child.once('exit',()=>{if(this.job===j&&j.running){j.running=false;j.phase='error';j.error='Collection worker stopped. Links already found are kept.';j.revision++;this.onChange();}});
  }else this.run(j,p,controller).catch(e=>{if(this.job!==j||j.controller!==controller||controller.signal.aborted)return;j.error=e.message;j.running=false;j.phase='error';j.message='Collection paused. You can queue the links already found.';j.revision++;this.onChange();});
  return this.results();
 }
 async filterRows(j,rows,signal){
  if(!j.range?.dateFrom&&!j.range?.dateTo){j.scanned+=(rows||[]).length;return rows;}
  const accepted=[],base=rows===j.rows?0:j.rows.length;
  for(const row of rows){
   if(signal.aborted)throw new Error('Collection stopped.');
   let date=row.date||'';
   if(!date&&listingKind(j.url)!=='eh'){
    await this.wait(1100,signal);const response=await this.read(row.url,j.url,signal);
    const parsed=await j.w.executeJavaScript(`(${postDate.toString()})(${JSON.stringify(response.html)})`);date=dates.day(parsed);
   }
   j.scanned++;if(!date)j.undated++;if(dates.includes(date,j.range))accepted.push({...row,date});j.message=`${j.scanned} post dates checked · ${accepted.length+base} matches`;j.revision++;this.onChange();
  }
  return accepted;
 }
 async wait(ms,signal){if(ms<=0)return;await new Promise((resolve,reject)=>{if(signal.aborted)return reject(new Error('Cancelled'));const cancel=()=>{clearTimeout(timer);reject(new Error('Cancelled'));};const timer=setTimeout(()=>{signal.removeEventListener('abort',cancel);resolve();},ms);signal.addEventListener('abort',cancel,{once:true});});}
 async run(j,p,controller){
  const signal=controller.signal;
  j.rows=await this.filterRows(j,j.rows,signal);if(j.rows.length>p.maxGalleries){j.rows=j.rows.slice(0,p.maxGalleries);j.continuation=j.url;}j.keys=new Set(j.rows.map(r=>r.url));j.revision++;this.onChange();
  const visited=new Set([j.url]),origin=new URL(j.url).origin,interval=listingKind(j.url)==='eh'?3100:1200;let extra=0;
  while(j.next&&extra<p.extraPages&&j.rows.length<p.maxGalleries){
   if(this.job!==j||j.controller!==controller||signal.aborted||j.w.isDestroyed()||j.w.getURL()!==j.url)return;
   const next=j.next,id=new URL(next);id.hash='';id.searchParams.sort();if(visited.has(id.href)){j.next=null;j.message='Stopped because the site repeated a results page.';break;}visited.add(id.href);
   if(id.origin!==origin)throw new Error('The next results page leaves this site.');
   await this.wait(Math.max(0,interval-(Date.now()-(this.lastRequests.get(origin)||Date.now()))),signal);
   this.lastRequests.set(origin,Date.now());const response=await this.read(next,j.url,signal);
   if(this.job!==j||j.controller!==controller||signal.aborted||j.w.isDestroyed()||j.w.getURL()!==j.url)return;
   const data=await this.parse(j.w,response.html,response.url);if(data.error)throw new Error(data.error);
   extra++;j.pages++;let fresh=0,truncated=false;
   const candidates=await this.filterRows(j,data.rows,signal);for(const row of candidates){if(j.keys.has(row.url))continue;if(j.rows.length>=p.maxGalleries){truncated=true;break;}j.keys.add(row.url);j.rows.push(row);fresh++;}
   j.next=data.next;j.continuation=truncated?response.url:null;j.revision++;j.message=j.rows.length+' gallery links collected from '+j.pages+' result pages.';this.onChange();
   if(!fresh&&!j.range?.dateFrom&&!j.range?.dateTo){j.next=null;j.message=data.rows.length?'No new galleries — the site repeated earlier results.':'End of the search results.';break;}
   if(truncated)break;
  }
  if(this.job!==j||j.controller!==controller||signal.aborted)return;
  j.running=false;j.phase=j.continuation||j.rows.length>=p.maxGalleries?'gallery-limit':j.next?'batch-limit':'end';j.message=j.rows.length+' galleries ready for review. '+(j.phase==='end'?'Reached the end of available results.':'Batch complete; continue from the next results page if needed.');j.revision++;this.onChange();
 }
 cancel(w){const j=this.job;if(!j||w&&j.w.id!==w.id)return;if(j.running){j.running=false;j.controller?.abort();j.worker?.kill();j.phase='cancelled';j.message='Collection stopped. The links already found are kept for review.';j.revision++;this.onChange();}}
 close(){this.cancel();}
}
module.exports={categories,listingKind,galleryKey,frontendPostUrl,categoryState,categoryUrl,collectionSettings,scanListing,postDate,GalleryCollector};
