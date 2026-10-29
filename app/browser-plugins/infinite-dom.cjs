'use strict';

// These functions run in a sandboxed website renderer. Keep them self-contained.
function pageHealth(doc=document,url=location.href){
 const title=doc.title||'',body=doc.body,host=new URL(url).hostname,text=(body?.textContent||'').trim();
 const locked=node=>!!node?.closest?.('[data-reader-locked="1"],[data-reader-locked="true"]');
 const visible=node=>{
  if(!node)return false;
  for(let n=node;n?.nodeType===1;n=n.parentElement){
   if(n.hidden||n.inert||n.hasAttribute('disabled')||n.getAttribute('aria-hidden')==='true'||n.getAttribute('aria-disabled')==='true')return false;
   const style=doc.defaultView?.getComputedStyle(n);
   if(style&&(style.display==='none'||['hidden','collapse'].includes(style.visibility)||style.opacity==='0'))return false;
  }
  const rects=[...node.getClientRects()],view=doc.defaultView;
  // Background tabs can load before their WebContentsView has a viewport.
  // Keep CSS visibility meaningful there without counting zero-area widgets.
  return rects.some(rect=>rect.width>0&&rect.height>0)||node.tagName!=='IFRAME'&&!!view&&(!view.innerWidth||!view.innerHeight)&&rects.length>0;
 };
 const placeholderSource=value=>{try{return /(?:^|[\/_.-])(?:placeholder|loading|spinner|blank|transparent|spacer|pixel|no-?image)(?:[\/_.-]|$)/i.test(new URL(value,url).pathname);}catch{return true;}};
 const meaningfulSource=value=>{
  if(!value||/^(?:#|about:|javascript:)/i.test(value.trim()))return false;
  try{const source=new URL(value,url);return /^https?:$/.test(source.protocol)&&!placeholderSource(value)&&(/\.(?:jpe?g|png|gif|webp|avif|bmp)$/i.test(source.pathname)||/\/media\/photos\/[^/]+\/.+/.test(source.pathname));}catch{return false;}
 };
 const readableImage=node=>{
  if(!visible(node)||locked(node)||['width','height'].some(name=>/^\d+$/.test(node.getAttribute(name)||'')&&Number(node.getAttribute(name))<=1))return false;
  if(['data-original','data-lazy-src','data-src','src'].some(name=>meaningfulSource(node.getAttribute(name))))return true;
  const current=node.currentSrc||node.getAttribute('src')||'';
  return !placeholderSource(current)&&node.complete&&node.naturalWidth>=180&&node.naturalHeight>=180;
 };
 const results=doc.querySelector('#post-list .thumb,#post-list-posts > *,table.itg a[href*="/g/"],div.itg a[href*="/g/"],[data-infinite-content] > article');
 // The worker's JMComic adapter uses these image fields. A hidden sign-in
 // widget is not an interstitial when the actual chapter is already readable.
 const imageReader=[...doc.querySelectorAll('img[data-reader-image],.reading-content img,img[id^="album_photo"],img[data-original*="/media/photos/"]')].some(readableImage);
 const reader=imageReader||[...doc.querySelectorAll('script[data-reader-data],#readerApp:not([data-reader-locked="1"]):not([data-reader-locked="true"])')].find(node=>!locked(node));
 const readableResults=!!results&&visible(results)&&!locked(results)&&[...(results.matches('a[href]')?[results]:results.querySelectorAll('a[href]'))].some(a=>{if(!visible(a))return false;try{const link=new URL(a.getAttribute('href'),url);return /^https?:$/.test(link.protocol)&&/\/g\/\d+\/|\/posts?\/\d+|\/artworks\/\d+|[?&]id=\d+/.test(link.href);}catch{return false;}});
 const readable=imageReader||readableResults;
 const blockedTitle=/^(?:access denied|(?:sorry[, ]+)?you have been blocked|403[ -]+forbidden|forbidden)[.! ]*(?:\s*[-|–—]\s*Cloudflare)?$/i.test(title.trim());
 const hardBlock=[...doc.querySelectorAll('#cf-error-details')].some(node=>visible(node)&&/sorry,? you have been blocked|access denied|error (?:code[: ]*)?1020/i.test(node.textContent||''));
 if(blockedTitle||hardBlock)
  return {kind:'access',reason:'blocked',challenge:false,readable:false,message:'The site has blocked this connection. This is a server block, rather than a CAPTCHA waiting to be completed. Try Site compatibility or your regular browser. If it is blocked there too, only the site can grant access.'};
 const challengeTitle=/^(?:captcha\b|just a moment|checking your browser|security verification|access denied|attention required|verify (?:you are|that you are) human)/i.test(title.trim());
 const challengeForm=[...doc.querySelectorAll('#challenge-running,#challenge-form,form[action*="/cdn-cgi/challenge"],form[action*="captcha"]')].some(visible);
 const challengeFrame=[...doc.querySelectorAll('iframe[src*="challenges.cloudflare.com"]')].some(visible);
 if(challengeTitle||challengeForm||!results&&!reader&&(/\bcaptcha\b/i.test(title)||challengeFrame))
  return {kind:'access',reason:'verification',challenge:true,readable:false,message:'This site is showing a CAPTCHA or browser check. Complete it in this tab, then choose Sync & resume. If it repeats, try Site compatibility to reload without ad filters and page helpers. Some sites reject embedded browsers or downloader connections even after verification.'};
 if(!results&&/^(?:exhentai\.org|e-hentai\.org)$/.test(host)&&text.length<5&&!doc.querySelector('a[href*="/g/"],img[src]'))
  return {kind:'access',readable:false,message:'ExHentai returned an empty access page. Load valid browser cookies for this host or sign in, then reload the page.'};
 if([...doc.querySelectorAll('#readerApp')].some(node=>visible(node)&&locked(node)))
  return {kind:'access',reason:'signin',challenge:false,readable:false,message:'This reader requires account access. Sign in in this browser, then choose Sync & resume.'};
 const password=[...doc.querySelectorAll('input[type="password"]')].some(visible);
 if(password&&(/^(?:log.?in|sign.?in|member(?:\s+login)?)\b/i.test(title.trim())||!results&&!reader&&/log.?in|sign.?in|member/i.test(title)))
  return {kind:'access',readable:false,message:'This page requires sign-in. Sign in in this browser or load valid browser cookies, then reload.'};
 if(!results&&/^(?:you (?:have been|are)|your ip|ip address|temporarily unavailable|too many requests)/i.test(text)&&/banned|blocked|limit|excessive|unavailable|too many/i.test(text.slice(0,1500)))
  return {kind:'access',readable:false,message:'The site returned an access restriction or cooldown. Retry after the site allows access.'};
 return {kind:'ok',readable,message:''};
}

function install(token,health){
 if(window[token])return;
 const s={armed:false,seen:new Set(),keys:new Set(),pages:0,recipe:null,lastDocument:null,currentUrl:location.href,scrollNode:null,end:false,nativePending:null};
 const numericKeys=['pid','page','p','offset','start','o'];
 const pagerSelector='#paginator,.paginator,.pagination,.pagination-next,.searchnav,.ptt,nav[aria-label*="agination"],[class*="pagination"],[id*="pagination"]';
 const forbidden='script,iframe,frame,frameset,object,embed,applet,form,input,textarea,select,button,link,style,meta,base,header,footer,nav,aside,svg,math,template,audio,video,.pagination,.paginator,#paginator,.pagination-next,.searchnav,.ptt,[data-df-infinite-marker]';
 const canonical=(value,base=location.href)=>{try{const u=new URL(value,base);if(!/^https?:$/.test(u.protocol)||u.username||u.password||u.origin!==location.origin)return null;u.hash='';u.searchParams.sort();return u.href;}catch{return null;}};
 const resolve=(value,base)=>{if(!value||value.trim().startsWith('#'))return null;try{const u=new URL(value,base);if(!canonical(u.href))return null;u.hash='';return u;}catch{return null;}};
 s.seen.add(canonical(location.href));
 function items(doc,recipe){const parent=doc.querySelector(recipe.container);return parent?[...parent.querySelectorAll(recipe.items)].filter(n=>!n.matches(forbidden)):[];}
 function recipeFor(doc){
  const choices=[
   {name:'Rule34 / Gelbooru results',container:'#post-list .content',items:'.thumb'},
   {name:'Rule34 / Gelbooru results',container:'#post-list',items:'.thumb'},
   {name:'E/ExHentai gallery table',container:'table.itg > tbody',items:':scope > tr:has(a[href*="/g/"])'},
   {name:'E/ExHentai gallery cards',container:'div.itg',items:':scope > .gl1t'},
   {name:'Booru results',container:'#post-list-posts',items:':scope > li, :scope > article, :scope > .post-preview'},
   {name:'Booru results',container:'#posts-container',items:'.post-preview'},
   {name:'Booru results',container:'.post-gallery .posts-container',items:':scope > article.post-preview'},
   {name:'Gallery cards',container:'.card-list__items',items:':scope > *'}
  ];
  for(const recipe of choices)if(items(doc,recipe).length)return recipe;
  const container=['[data-infinite-content]','.post-list','.reading-content','#vertical-pages-container','#posts-container','main','#content','body'].find(sel=>doc.querySelector(sel));
  if(!container)return null;
  const parent=doc.querySelector(container);
  for(const selector of [':scope > article',':scope > .thumb',':scope > .post-preview',':scope > .gallery-card',':scope > li',':scope > .item'])
   if(parent.querySelector(selector))return {name:'Page results',container,items:selector};
  // Infer repeated card siblings, avoiding an entire site's header and sidebar.
  const groups=new Map();
  for(const a of parent.querySelectorAll('a[href]:has(img),article a[href]')){
   const card=a.closest('article,li,.thumb,.post-preview,.gallery-card')||a.parentElement;
   if(!card||card===parent||card.matches('header,nav,aside,footer')||card.closest('header,nav,aside,footer'))continue;
   const group=card.parentElement;if(!groups.has(group))groups.set(group,new Set());groups.get(group).add(card);
  }
  const best=[...groups].sort((a,b)=>b[1].size-a[1].size)[0];
  if(best&&best[1].size>=2){
   const node=best[0];let selector=node.id?'#'+CSS.escape(node.id):null;
   if(!selector&&node.classList.length){const candidate=node.tagName.toLowerCase()+[...node.classList].map(c=>'.'+CSS.escape(c)).join('');if(doc.querySelectorAll(candidate).length===1)selector=candidate;}
   if(selector)return {name:'Detected result cards',container:selector,items:':scope > *'};
  }
  return {name:'Page content',container,items:':scope > *'};
 }
 function keyFor(node,base){
  const links=[...node.querySelectorAll('a[href]')];if(node.matches('a[href]'))links.unshift(node);
  const link=links.find(a=>/\/g\/\d+\/|[?&]s=view(?:&|$)|\/posts?\/\d+|\/artworks\/\d+/.test(a.getAttribute('href')||''))||links.find(a=>resolve(a.getAttribute('href'),base));
  const href=link&&canonical(link.getAttribute('href'),base);if(href)return 'link:'+href;
  if(node.id)return 'id:'+node.id;if(node.dataset.id)return 'data:'+node.dataset.id;
  const img=node.matches('img')?node:node.querySelector('img');
  if(img)return 'image:'+(img.getAttribute('data-src')||img.getAttribute('data-original')||img.getAttribute('src'));
  const text=(node.textContent||'').trim().replace(/\s+/g,' ');return text?'text:'+text:null;
 }
 function nextUrl(doc,base,recipe,force){
  const current=new URL(base),pagination=doc.querySelector(pagerSelector),eh=recipe?.name.startsWith('E/ExHentai');
  const continueUrl=(raw)=>{
   const u=resolve(raw,base);if(!u)return null;
   // Some pagers omit the original search fields. Keep filters and tag exclusions.
   if(u.pathname===current.pathname||u.pathname.replace(/\/page\/\d+\/?$/,'/')===current.pathname.replace(/\/page\/\d+\/?$/,'/')){for(const [k,v] of current.searchParams)if(!['next','prev','seek','jump'].includes(k)&&!(numericKeys.includes(k)&&/^\d+$/.test(v))&&!u.searchParams.has(k))u.searchParams.append(k,v);}
   if(canonical(u.href)===canonical(base)||s.seen.has(canonical(u.href)))return null;return u.href;
  };
  const nodes=[...doc.querySelectorAll('#unext[href],#dnext[href],a[rel~="next"],link[rel~="next"],a.next,.pagination-next a,#paginator a,.paginator a,.pagination a,.ptt a,.searchnav a,nav[aria-label*="agination"] a,[data-next-page]')];
  if(force)for(const a of doc.querySelectorAll('a[href]'))if(!nodes.includes(a))nodes.push(a);
  const label=/^(?:(?:next(?:\s+page)?|older(?:\s+(?:posts|entries))?|siguiente(?:\s+página)?|próxim[oa]|下一[页頁]|次へ|다음)\s*[>›»→]*|[>›»→]+)$/i;
  for(const a of nodes){
   if(a.matches('[disabled],[aria-disabled="true"],.disabled')||a.closest('.disabled')||/prev|previous/i.test(a.getAttribute('rel')||''))continue;
   const labels=[a.textContent?.trim(),a.getAttribute('aria-label'),a.getAttribute('title'),a.getAttribute('alt'),a.querySelector('img')?.getAttribute('alt')].filter(Boolean);
   const explicit=['unext','dnext'].includes(a.id)||a.rel?.split(/\s+/).includes('next')||a.classList.contains('next')||a.closest('.pagination-next')||a.hasAttribute('data-next-page')||labels.some(v=>label.test(v.trim()));
   if(explicit){const url=continueUrl(a.getAttribute('href')||a.getAttribute('data-next-page'));if(url)return {next:url,method:'Next link'};}
  }
  // E/Ex search uses server-issued gallery cursors; never invent numeric cursors.
  if(eh){
   for(const a of nodes){const u=resolve(a.getAttribute('href'),base);if(u&&u.pathname===current.pathname&&u.searchParams.has('next')){const next=continueUrl(u.href);if(next)return {next,method:'Gallery cursor'};}}
   return {next:null,terminal:true};
  }
  if(!force)return {next:null,terminal:!!pagination};
  // A numbered link is evidence of a page/offset scheme, even without a Next label.
  const numbered=[];
  for(const a of nodes){
   if(!a.hasAttribute('href'))continue;const u=resolve(a.getAttribute('href'),base);if(!u)continue;
   if(u.pathname===current.pathname){
    for(const key of numericKeys){const v=u.searchParams.get(key),old=current.searchParams.get(key);if(v===null||!/^\d+$/.test(v)||old!==null&&!/^\d+$/.test(old))continue;
     const n=Number(v),start=Number(old||(/^(?:page|p)$/.test(key)?1:0));
     if(n<=start||[...u.searchParams].some(([k,v])=>k!==key&&current.searchParams.has(k)&&current.searchParams.get(k)!==v))continue;
     const url=continueUrl(u.href);if(url)numbered.push({next:url,distance:n-start,method:'Numbered page link'});
    }
   }
   const pattern=/\/page\/(\d+)\/?$/;const p=u.pathname.match(pattern),old=current.pathname.match(pattern);
   if(p&&u.pathname.replace(pattern,'/')===current.pathname.replace(pattern,'/')&&Number(p[1])>Number(old?.[1]||1)){
    const url=continueUrl(u.href);if(url)numbered.push({next:url,distance:Number(p[1])-Number(old?.[1]||1),method:'Numbered page link'});
   }
  }
  if(numbered.length){numbered.sort((a,b)=>a.distance-b.distance);return numbered[0];}
  if(pagination)return {next:null,terminal:true};
  // With no pager, Force can probe a numeric page field. Duplicates end it.
  for(const key of numericKeys){const v=current.searchParams.get(key);if(v===null||!/^\d+$/.test(v))continue;
   const offset=['pid','offset','start','o'].includes(key),step=offset?(s.pageSize||items(doc,recipe).length):1;if(!step)continue;
   const u=new URL(base);u.searchParams.set(key,String(Number(v)+step));const next=continueUrl(u.href);if(next)return {next,method:'Forced '+(offset?'result offset':'page number')};
  }
  if(recipe?.name==='Rule34 / Gelbooru results'&&items(doc,recipe).length){const u=new URL(base);u.searchParams.set('pid',String(items(doc,recipe).length));const next=continueUrl(u.href);if(next)return {next,method:'Forced result offset'};}
  return {next:null,terminal:false};
 }
 function loadMore(){
  const labels=/^(?:(?:load|show|view)\s+more(?:\s+(?:posts|results|items|images))?|加载更多|載入更多|顯示更多|显示更多|더\s*보기|もっと見る|さらに表示)$/i;
  return [...document.querySelectorAll('button,[role="button"],a.load-more,a[data-load-more],a#load-more')].find(n=>!n.disabled&&n.getAttribute('aria-disabled')!=='true'&&!(n.type==='submit'&&n.form)&&n.getClientRects().length&&labels.test((n.textContent||n.getAttribute('aria-label')||'').trim()));
 }
 s.inspect=(force,options)=>{
  const scroll=s.scrollNode?.isConnected?s.scrollNode:document.scrollingElement;
  const near=!!scroll&&scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<Math.max(700,scroll.clientHeight*.8);
  if(!force&&(!s.armed||!near))return {near:false};
  const access=health(document,location.href);if(access.kind!=='ok')return {near:true,error:access.message,phase:'access'};
  const doc=s.lastDocument||document;s.recipe=s.recipe||recipeFor(doc);
  if(!s.recipe)return {near:true,phase:'unsupported',message:'This page has no results to extend.'};
  const existing=items(document,s.recipe);for(const n of existing){const key=keyFor(n,location.href);if(key)s.keys.add(key);}if(!s.pageSize)s.pageSize=existing.length;
  const count=existing.length;
  if(s.nativePending){
   if(count>s.nativePending.count||scroll.scrollHeight>s.nativePending.height+100){s.nativePending=null;s.pages++;s.armed=false;return {near:true,phase:'native-complete',pages:s.pages,profile:s.recipe.name};}
   if(Date.now()-s.nativePending.at>15000){s.nativePending=null;return {near:true,error:'The site’s Load more control did not add results. Retry or use its own navigation.',phase:'unsupported'};}
   return {near:true,phase:'waiting',message:'Waiting for the site’s Load more results…',profile:s.recipe.name};
  }
  if(s.end)return {near:true,phase:'end',message:s.end,profile:s.recipe.name};
  if((!count||(doc.body?.textContent||'').trim().length<500&&!doc.querySelector('article,.thumb,.gl1t,a[href*="/g/"]'))&&/no (?:posts|results|galleries|hits)(?: found| match| to|\.)?|nothing found/i.test(doc.body?.textContent||''))return {near:true,phase:'end',message:'This search returned no results.',profile:s.recipe.name};
  const plan=nextUrl(doc,s.currentUrl,s.recipe,options.force);s.plan=plan;
  if(options.force&&loadMore()&&(!plan.next||plan.method.startsWith('Forced')))return {near:true,native:true,phase:'ready',profile:s.recipe.name,method:'Site Load more control'};
  if(plan.next)return {near:true,...plan,recipe:s.recipe,profile:s.recipe.name,phase:'ready'};
  return {near:true,phase:plan.terminal?'end':'unsupported',profile:s.recipe.name,message:plan.terminal?'End of the linked results.':options.force?'No usable next page or Load more control found. Auto-scroll can still trigger the site’s own loading.':'No Next link found. Enable Force mode in Browser tools → Scrolling.'};
 };
 s.setColumns=value=>{const count=Math.max(1,Math.min(5,Math.round(Number(value)||4)));for(const group of document.querySelectorAll('[data-df-infinite-grid]'))group.style.gridTemplateColumns='repeat('+count+',minmax(0,1fr))';};
 s.append=(html,url,recipe,columns)=>{
  const id=canonical(url);if(!id||s.seen.has(id))return {added:0,end:true,message:'This results page has already been loaded.'};
  const doc=new DOMParser().parseFromString(html,'text/html'),access=health(doc,url);if(access.kind!=='ok')return {added:0,error:access.message};
  const target=document.querySelector(recipe.container),source=doc.querySelector(recipe.container);
  if(!target)return {added:0,error:'The results container changed. Reload this tab before retrying.'};
  if(!source){if(/no (?:posts|results|galleries|hits)|nothing found/i.test(doc.body?.textContent||'')){s.end='End of results — the next page was empty.';return {added:0,end:true,message:s.end};}return {added:0,error:'The next page has no matching results container. It may be an access page or a different layout.'};}
  const children=items(doc,recipe),fresh=[],newKeys=new Set();
  for(const child of children){const key=keyFor(child,url);if(key&&(s.keys.has(key)||newKeys.has(key)))continue;const clone=child.cloneNode(true);clone.querySelectorAll(forbidden).forEach(n=>n.remove());if(!clone.textContent.trim()&&!clone.matches('img')&&!clone.querySelector('img,canvas,a'))continue;
   for(const n of [clone,...clone.querySelectorAll('*')]){
    for(const attr of [...n.attributes]){const name=attr.name.toLowerCase();
     if(name.startsWith('on')||['srcdoc','nonce','integrity','autofocus','formaction','action','srcset','ping','is'].includes(name)){n.removeAttribute(attr.name);continue;}
     if(['href','src','poster','data-src','data-original','data-lazy-src'].includes(name)){try{const u=new URL(attr.value,url);if(/^https?:$/.test(u.protocol)&&!u.username&&!u.password)n.setAttribute(attr.name,u.href);else if(!(name==='src'&&/^data:image\/(?:png|jpeg|gif|webp);/i.test(attr.value)))n.removeAttribute(attr.name);}catch{n.removeAttribute(attr.name);}}
     if(name==='id'&&document.getElementById(attr.value))n.removeAttribute('id');
     if(name==='style')n.setAttribute('style',attr.value.replace(/url\(([^)]+)\)/gi,(_,raw)=>{try{const u=new URL(raw.trim().replace(/^['"]|['"]$/g,''),url);return /^https?:$/.test(u.protocol)?'url("'+u.href.replace(/"/g,'%22')+'")':'none';}catch{return 'none';}}));
    }
    if(n.tagName==='IMG'){const lazy=n.getAttribute('data-original')||n.getAttribute('data-lazy-src')||n.getAttribute('data-src');if(lazy&&/^https?:/.test(lazy))n.src=lazy;n.loading='lazy';}
   }
   fresh.push(clone);if(key)newKeys.add(key);
  }
  if(!fresh.length){s.seen.add(id);s.end=children.length?'No new results  the site repeated an earlier page.':'End of results  the next page was empty.';return {added:0,end:true,message:s.end};}
  const host=location.hostname.toLowerCase(),aibooru=/(^|\.)aibooru\.online$/.test(host)&&fresh.some(node=>node.matches('article.post-preview'));
  // AIBooru intentionally hides uninitialized posts. Register new posts with
  // its own blacklist before insertion so a user's filters remain in force.
  const blacklist=aibooru?document.querySelector('#blacklist-box')?.blacklist:null,Post=aibooru?window.Danbooru?.Blacklist?.Post:null;
  if(aibooru&&(!blacklist||!Array.isArray(blacklist.posts)||!Array.isArray(blacklist.rules)||typeof Post!=='function'))return {added:0,error:'AIBooru has not initialized its post filters. Reload the page, or open the next page normally.'};
  const fragment=document.createDocumentFragment(),table=/^(?:TBODY|THEAD|TABLE)$/.test(target.tagName);
  const marker=document.createElement(table?'tr':/^(?:UL|OL)$/.test(target.tagName)?'li':'div');marker.dataset.dfInfiniteMarker='true';marker.style.cssText='grid-column:1/-1;clear:both;margin:20px 0;padding:12px 0;border-top:1px solid currentColor;font:16px sans-serif';
  const box=table?document.createElement('td'):marker;if(table){box.colSpan=Math.max(1,...[...target.querySelectorAll('tr')].slice(0,3).map(tr=>tr.children.length));marker.append(box);}
  const link=document.createElement('a');link.href=url;link.textContent='Continued page '+(s.pages+2);box.append(link);fragment.append(marker);
  const booru=/(^|\.)(rule34\.xxx|rule34\.us|rule34\.pw|rule34ai\.art|gelbooru\.com|danbooru\.donmai\.us|tbib\.org|aibooru\.online|aibooru\.download|yande\.re|r34\.app|kurosearch\.com|kurozenzen\.github\.io)$/.test(host);
  const grid=booru&&!table&&(host!=='kurozenzen.github.io'||location.pathname.startsWith('/r34-react/'))&&(/^(?:Rule34 \/ Gelbooru results|Booru results)$/.test(recipe.name)||/^(?:Page results|Detected result cards)$/.test(recipe.name)&&fresh.every(node=>node.matches('img')||node.querySelector('img')));
  let destination=fragment,group=null,wrapper=null;
  if(grid){const list=/^(?:UL|OL)$/.test(target.tagName);wrapper=list?document.createElement('li'):null;group=document.createElement(list?'ul':'div');group.dataset.dfInfiniteGrid='true';group.style.cssText='display:grid;grid-column:1/-1;clear:both;width:100%;max-width:100%;box-sizing:border-box;gap:12px;list-style:none;margin:0;padding:0;grid-template-columns:repeat('+Math.max(1,Math.min(5,Math.round(Number(columns)||4)))+',minmax(0,1fr))';if(wrapper){wrapper.dataset.dfInfiniteContainer='true';wrapper.style.cssText='grid-column:1/-1;clear:both;width:100%;list-style:none;margin:0;padding:0';wrapper.append(group);fragment.append(wrapper);}else fragment.append(group);destination=group;}
  const models=[];
  try{
   for(const node of fresh){const imported=document.importNode(node,true);if(grid){imported.style.setProperty('float','none','important');imported.style.setProperty('width','100%','important');imported.style.setProperty('max-width','100%','important');imported.style.setProperty('min-width','0','important');imported.style.setProperty('box-sizing','border-box','important');for(const image of imported.querySelectorAll('img')){image.style.setProperty('max-width','100%','important');image.style.setProperty('height','auto','important');}}if(aibooru&&imported.matches('article.post-preview')){const model=new Post(imported,blacklist);models.push(model);model.applyRules();}destination.append(imported);}
   if(aibooru)blacklist.posts.push(...models);
   target.append(fragment);
  }catch(error){
   if(aibooru)for(const model of models){for(const rule of blacklist.rules)try{rule.posts?.delete(model);}catch{}const index=blacklist.posts.indexOf(model);if(index>=0)blacklist.posts.splice(index,1);}
   marker.remove();(wrapper||group)?.remove();
   return {added:0,error:'Could not apply the site post filters. Open the next page normally and try again.'};
  }
  s.seen.add(id);
  for(const key of newKeys)s.keys.add(key);s.pages++;s.lastDocument=doc;s.currentUrl=url;s.recipe=recipe;s.armed=false;
  return {added:fresh.length,pages:s.pages};
 };
 s.loadMore=()=>{const button=loadMore();if(!button)return false;const scroll=s.scrollNode?.isConnected?s.scrollNode:document.scrollingElement;s.nativePending={at:Date.now(),count:items(document,s.recipe).length,height:scroll.scrollHeight};s.armed=true;button.click();return true;};
 s.arm=event=>{s.armed=true;const target=event.target;if(target instanceof Element&&target.scrollHeight>target.clientHeight+100)s.scrollNode=target;};
 window.addEventListener('scroll',s.arm,{passive:true,capture:true});window.addEventListener('wheel',s.arm,{passive:true});window[token]=s;
}
function inspect(token,force,options){return window[token]?.inspect(force,options)||{};}
function append(token,html,url,recipe,columns){return window[token]?.append(html,url,recipe,columns)||{added:0};}
function setColumns(token,columns){return window[token]?.setColumns(columns);}
function loadMore(token){return window[token]?.loadMore()||false;}
function autoStep(token,pixels){
 const s=window[token];if(!s)return;
 if(!s.scrollNode?.isConnected){let node=document.elementFromPoint(innerWidth*.5,innerHeight*.65);while(node&&node!==document.body){const style=getComputedStyle(node);if(/auto|scroll/.test(style.overflowY)&&node.scrollHeight>node.clientHeight+100){s.scrollNode=node;break;}node=node.parentElement;}if(!s.scrollNode)s.scrollNode=document.scrollingElement;}
 s.armed=true;s.scrollNode?.scrollBy({top:pixels,behavior:'instant'});
}
function remove(token){const s=window[token];if(!s)return;window.removeEventListener('scroll',s.arm,true);window.removeEventListener('wheel',s.arm);delete window[token];}
module.exports={pageHealth,install,inspect,append,setColumns,loadMore,autoStep,remove};
