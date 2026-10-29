'use strict';
const {_electron:electron}=require('playwright');
const {launchPackaged}=require('./launch_packaged.cjs');
const path=require('node:path'),fs=require('node:fs'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),qa=path.resolve(process.env.DF_PAGINATION_QA||path.join(root,'..','qa-pagination-'+Date.now()));fs.mkdirSync(qa,{recursive:true});
const invoke=(p,name,...args)=>p.evaluate(async({name,args})=>window.df.invoke(name,...args),{name,args});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,message,timeout=20000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await delay(150);}throw new Error(message);}
const rule='https://rule34.xxx/index.php?page=post&s=list&tags=-futa_on_male+ai_generated+male_on_futa';
const ex='https://exhentai.org/?f_cats=1022&f_search=ashits';
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6xkAAAAASUVORK5CYII=','base64');
let app;
(async()=>{
 const requests=[],errors=[],checks=[];
 const record=name=>{checks.push(name);console.log('PASS '+name);};
 const pageHtml=(body,title='Pagination fixture')=>'<!doctype html><title>'+title+'</title><body style="margin:20px;font:20px sans-serif">'+body+'</body>';
 const article=id=>`<article class="item" data-id="${id}" style="height:650px"><a href="/gallery/${id}">Sample result ${id}</a><p>Non-explicit local test content.</p></article>`;
 const thumb=id=>`<span class="thumb" id="p${id}" style="display:inline-block;width:45%;height:850px"><a href="index.php?page=post&amp;s=view&amp;id=${id}"><img src="/fixture.png" data-original="/fixture.png" onerror="window.badAppend=true">Sample thumbnail ${id}</a></span>`;
 const gallery=(id,cards=false)=>cards?`<div class="gl1t" style="height:650px"><a href="/g/${id}/fixture/">Sample gallery ${id}</a><img data-src="/fixture.png"></div>`:`<tr class="gtr0" style="height:650px"><td>${id}</td><td><a href="/g/${id}/fixture/">Sample gallery ${id}</a><img data-src="/fixture.png" onerror="window.badAppend=true"></td></tr>`;
 const server=http.createServer(async(req,res)=>{
  const u=new URL(req.url,'http://fixture'),remote=u.searchParams.get('remote');
  if(u.pathname==='/cookie-page'){requests.push({url:'http://127.0.0.1:'+server.address().port+req.url,cookie:req.headers.cookie||'',referer:req.headers.referer||''});res.setHeader('Content-Type','text/html');res.setHeader('Set-Cookie','native_cookie=retained; Path=/; HttpOnly');const n=u.searchParams.get('step')||'1';return res.end(pageHtml(`<main data-infinite-content>${article(Number(n))}</main>${n==='1'?'<a rel="next" href="?step=2">Next</a>':''}`));}
  if(!remote){res.statusCode=404;return res.end();}
  const url=new URL(remote);requests.push({url:remote,cookie:req.headers['x-fixture-cookie']||'',referer:req.headers['x-fixture-referer']||''});
  res.setHeader('Content-Type','text/html; charset=utf-8');
  if(url.pathname==='/fixture.png'){res.setHeader('Content-Type','image/png');return res.end(png);}
  if(url.hostname==='rule34.xxx'){
   assert.equal(url.searchParams.get('page'),'post');assert.equal(url.searchParams.get('s'),'list');assert.equal(url.searchParams.get('tags'),new URL(rule).searchParams.get('tags'));
   const pid=Number(url.searchParams.get('pid')||0),ids=pid===0?[1,2]:pid===42?[2,3]:[4,5];
   return res.end(pageHtml(`<h1>Rule34 layout fixture</h1><form><input placeholder="Search"></form><div id="post-list"><aside>Sidebar</aside><div class="content">${ids.map(thumb).join('')}</div></div><div id="paginator">${pid<84?`<a href="?pid=${pid===0?42:84}" alt="next">&gt;</a>`:'<span>End</span>'}</div><script>window.originalPageScript=true</script>`));
  }
  if(['exhentai.org','e-hentai.org'].includes(url.hostname)){
   if(url.searchParams.get('f_search')==='blank')return res.end('');
   if(url.searchParams.get('f_search')==='login')return res.end(pageHtml('<form><input type="password"></form>Sign in','Member login'));
   const cards=url.searchParams.get('view')==='cards',legacy=url.searchParams.get('view')==='legacy',cursor=url.searchParams.get('next'),second=cursor!==null||url.searchParams.get('page')==='1';
   const ids=second?[100,98]:[101,100],link=second?'':legacy?'<table class="ptt"><tr><td><a href="?page=1">&gt;</a></td></tr></table>':`<div class="searchnav"><a id="unext" href="?next=99">Next &gt;</a><a href="?prev=1">Last &gt;&gt;</a></div>`;
   return res.end(pageHtml(`<form><input placeholder="Search"></form>${cards?'<div class="itg gld">'+ids.map(id=>gallery(id,true)).join('')+'</div>':'<table class="itg gltc"><tbody><tr><th>Category</th><th>Gallery</th></tr>'+ids.map(id=>gallery(id)).join('')+'</tbody></table>'}${link}`));
  }
  const name=url.pathname;
  if(name==='/denied'){res.statusCode=403;return res.end(pageHtml('<p>Please complete the access check.</p>','Rule34.xxx CAPTCHA'));}
  if(name==='/http-error'){res.statusCode=503;return res.end(pageHtml('<p>Service unavailable.</p>'));}
  if(name==='/cooldown-next'){res.statusCode=429;return res.end('Too many requests');}
  if(name==='/cooldown')return res.end(pageHtml(`<main data-infinite-content>${article(1)}</main><a rel="next" href="/cooldown-next">Next</a>`));
  if(name==='/access-next')return res.end(pageHtml(`<main data-infinite-content>${article(1)}</main><a rel="next" href="/denied">Next</a>`));
  if(name==='/numbers'){
   const n=Number(url.searchParams.get('page')||1);return res.end(pageHtml(`<main data-infinite-content>${article(n*10)}${article(n*10+1)}</main><div class="unusual-pager">${n<3?`<a href="?page=${n+1}">${n+1}</a>`:''}</div>`));
  }
  if(name==='/probe'){
   const n=Math.min(2,Number(url.searchParams.get('page')||1));return res.end(pageHtml(`<main data-infinite-content>${article(n*10)}${article(n*10+1)}</main>`));
  }
  if(name==='/offset'){
   const n=Number(url.searchParams.get('offset'));return res.end(pageHtml(n>=4?'<p>No results found.</p>':`<main data-infinite-content>${article(n)}${article(n+1)}</main>`));
  }
  if(name==='/path/'||name==='/path/page/2/')return res.end(pageHtml(`<main data-infinite-content>${article(name==='/path/'?1:2)}</main>${name==='/path/'?'<a href="/path/page/2/">2</a>':''}`));
  if(name==='/fragment')return res.end(pageHtml(`<main data-infinite-content>${article(1)}</main><nav class="pagination"><a rel="next" href="#next">Next</a></nav>`));
  if(name==='/external')return res.end(pageHtml(`<main data-infinite-content>${article(1)}</main><nav class="pagination"><a rel="next" href="https://unrelated.test/results">Next</a></nav>`));
  if(name==='/load-more')return res.end(pageHtml(`<main data-infinite-content>${article(1)}</main><button id="more">Load more</button><script>document.querySelector('#more').onclick=()=>{document.querySelector('main').insertAdjacentHTML('beforeend',${JSON.stringify(article(2))});document.querySelector('#more').remove();};</script>`));
  if(name==='/slow')return res.end(pageHtml(`<main data-infinite-content>${article(1)}</main><a rel="next" href="/slow-next">Next</a>`));
  if(name==='/slow-next'){await delay(1500);return res.end(pageHtml(`<main data-infinite-content>${article(2)}</main>`));}
  if(name==='/limit')return res.end(pageHtml(`<main data-infinite-content>${article(Number(url.searchParams.get('page')||1))}</main>`));
  if(name==='/sanitizer'){
   const n=Number(url.searchParams.get('page')||1);return res.end(pageHtml(`<main data-infinite-content>${n===1?article(1):'<article class="item"><a href="/gallery/2">Two</a><img data-src="/fixture.png" onerror="window.badAppend=true"><svg onload="window.badAppend=true"></svg><iframe src="/denied"></iframe><script>window.badAppend=true</script><form><input></form></article>'}</main>${n===1?'<a rel="next" href="?page=2">Next</a>':''}`));
  }
  return res.end(pageHtml('<main><p>No pagination here.</p></main>'));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base=`http://127.0.0.1:${server.address().port}`;
 const options={cwd:root,env:{...process.env,DF_DATA_DIR:qa,DF_PYTHON:path.resolve(root,'..','build-venv','Scripts','python.exe')}};
 try{
  app=process.env.DF_APP_EXE?await launchPackaged(process.env.DF_APP_EXE,options):await electron.launch({args:[root],...options,timeout:30000});
  const p=await app.firstWindow();p.on('pageerror',e=>errors.push(e.message));await p.waitForSelector('#task-list');
  // Supply harmless fixtures at real host/path URLs, without contacting those sites.
  await app.evaluate(async({session},base)=>{
   const ses=session.fromPartition('persist:dandf-browser');
   ses.protocol.handle('https',async req=>fetch(base+'/?remote='+encodeURIComponent(req.url),{headers:{'x-fixture-cookie':req.headers.get('cookie')||'','x-fixture-referer':req.headers.get('referer')||''}}));
   for(const url of ['https://rule34.xxx','https://exhentai.org','https://e-hentai.org','https://scroll.example.test'])await ses.cookies.set({url,name:'fixture_access',value:'yes',secure:true});
  },base);
  await p.locator('[data-page=browser]').first().click();await invoke(p,'browser-settings',{scrolling:{delay:1,force:true}});
  const state=()=>invoke(p,'browser-state');
  const inPage=expression=>app.evaluate(async({webContents},expression)=>{const w=webContents.getAllWebContents().find(w=>/^https?:\/\//.test(w.getURL()));return w.executeJavaScript(expression);},expression);
  const open=async url=>{await invoke(p,'browser-navigate',url);await until(async()=>{const s=await state();return s.url===url&&!s.loading;},'Page did not load: '+url);await delay(180);};
  const next=async()=>{await delay(1100);return invoke(p,'browser-scroll','next');};
  await open(rule);let r=await invoke(p,'browser-scroll','force');assert(r.force&&r.enabled);assert.match(r.profile,/Rule34/);
  await inPage('scrollTo(0,document.documentElement.scrollHeight)');await until(()=>inPage('document.querySelectorAll(".thumb").length===3'),'Rule34 did not append/de-duplicate page 2');
  assert.equal(await inPage('document.querySelectorAll("form").length'),1);assert.equal(await inPage('document.querySelectorAll("#paginator").length'),1);
  const ruleRequest=requests.find(r=>new URL(r.url).searchParams.get('pid')==='42');assert(ruleRequest);assert.equal(new URL(ruleRequest.url).searchParams.get('tags'),new URL(rule).searchParams.get('tags'));assert.equal(new URL(ruleRequest.url).searchParams.get('page'),'post');
  await next();assert.equal(await inPage('document.querySelectorAll(".thumb").length'),5);await next();assert.equal((await state()).scrolling.phase,'end');record('Rule34 exact search URL: offset links, tag/exclusion preservation, thumbnail-only append and duplicates');
  await open(ex);r=await invoke(p,'browser-scroll','force');assert.match(r.profile,/table/);await next();assert.equal(await inPage('document.querySelectorAll("table.itg tr.gtr0 a").length'),3);assert.equal(await inPage('document.querySelectorAll("table.itg th").length'),2);assert.equal(await inPage('document.querySelector("[data-df-infinite-marker]").tagName'),'TR');assert.equal(await inPage('document.querySelectorAll("form").length'),1);
  const exRequest=requests.find(r=>r.url.startsWith('https://exhentai.org/')&&new URL(r.url).searchParams.get('next')==='99');assert(exRequest);assert.equal(new URL(exRequest.url).searchParams.get('f_cats'),'1022');assert.equal(new URL(exRequest.url).searchParams.get('f_search'),'ashits');await delay(3100);await invoke(p,'browser-scroll','next');assert.equal((await state()).scrolling.phase,'end');record('ExHentai exact search URL: gallery cursor, valid table rows and search filters');
  await open(base+'/cookie-page');await invoke(p,'browser-scroll','force');await next();const nativeRequest=requests.find(r=>r.url.startsWith(base+'/cookie-page')&&new URL(r.url).searchParams.get('step')==='2');assert(nativeRequest.cookie.includes('native_cookie=retained'));assert.equal(nativeRequest.referer,base+'/cookie-page');record('Actual Chromium HTTP requests retain session cookies and the original page referrer');
  await open('https://e-hentai.org/?f_search=fixture&view=cards');await invoke(p,'browser-scroll','force');await next();assert.equal(await inPage('document.querySelectorAll(".gl1t").length'),3);record('E/ExHentai thumbnail-card display');
  await open('https://e-hentai.org/?f_search=fixture&view=legacy');await invoke(p,'browser-scroll','force');await next();assert.equal(await inPage('document.querySelectorAll("table.itg tr.gtr0 a").length'),3);record('E/ExHentai legacy table pager with > link');
  await open('https://scroll.example.test/numbers?q=keep+filters');await invoke(p,'browser-settings',{scrolling:{force:false}});await invoke(p,'browser-scroll','force');await invoke(p,'browser-settings',{scrolling:{force:false}});r=await next();assert.equal(r.phase,'unsupported');await invoke(p,'browser-scroll','force');r=await next();assert.equal(r.pages,1);assert(requests.some(r=>new URL(r.url).pathname==='/numbers'&&new URL(r.url).searchParams.get('page')==='2'&&new URL(r.url).searchParams.get('q')==='keep filters'));record('Force recognizes numbered pagination with no Next label and preserves omitted search fields');
  await open('https://scroll.example.test/probe?page=1&q=keep');await invoke(p,'browser-scroll','force');await next();r=await next();assert.equal(r.phase,'end');assert.match(r.message,/repeated/);assert.equal(await inPage('document.querySelectorAll("article").length'),4);const duplicateRequests=requests.filter(r=>new URL(r.url).pathname==='/probe').length;await next();assert.equal(requests.filter(r=>new URL(r.url).pathname==='/probe').length,duplicateRequests);record('Force advances numeric page without a pager and stops permanently on repeated results');
  await open('https://scroll.example.test/offset?offset=0');await invoke(p,'browser-scroll','force');await next();r=await next();assert.equal(r.phase,'end');assert.equal(await inPage('document.querySelectorAll("article").length'),4);record('Force infers offset step and stops at empty results');
  await open('https://scroll.example.test/path/?q=kept');await invoke(p,'browser-scroll','force');await next();assert.equal(await inPage('document.querySelectorAll("article").length'),2);assert(requests.some(r=>new URL(r.url).pathname==='/path/page/2/'&&new URL(r.url).searchParams.get('q')==='kept'));record('Force follows numbered path pagination and retains search query');
  for(const route of ['fragment','external']){await open('https://scroll.example.test/'+route);await invoke(p,'browser-scroll','force');const before=requests.length;await next();assert.equal(requests.length,before);}record('Fragment-only and cross-origin next links never fetch a duplicate page or leave the site');
  await open('https://scroll.example.test/load-more');await invoke(p,'browser-scroll','force');await next();assert.equal(await inPage('document.querySelectorAll("article").length'),2);await next();assert.equal((await state()).scrolling.pages,1);record('Force activates native Load more without a form submission');
  await open('https://scroll.example.test/sanitizer?page=1');await invoke(p,'browser-scroll','force');await next();assert.equal(await inPage('window.badAppend===true'),false);assert.equal(await inPage('document.querySelectorAll("article")[1].querySelectorAll("script,svg,iframe,form,[onerror]").length'),0);assert.equal(await inPage('document.querySelectorAll("article")[1].querySelector("img").src'),'https://scroll.example.test/fixture.png');record('Appended scripts, frames, SVG handlers and forms removed; relative lazy images resolved');
  await open('https://scroll.example.test/denied');await until(async()=> (await state()).page.kind==='access','CAPTCHA did not get a persistent diagnostic');assert.match(await p.locator('#browser-page-alert').innerText(),/CAPTCHA/);await delay(800);assert.match((await state()).page.message,/CAPTCHA/);record('Initial CAPTCHA/access error remains visible across browser state updates');
  await open('https://exhentai.org/?f_search=blank');await until(async()=> (await state()).page.kind==='access','Empty ExHentai access page was not diagnosed');assert.match((await state()).page.message,/empty access/);
  await open('https://exhentai.org/?f_search=login');await until(async()=> (await state()).page.kind==='access','Sign-in page was not diagnosed');record('Empty ExHentai and sign-in pages are distinguished from exhausted pagination');
  await open('https://scroll.example.test/http-error');assert.equal((await state()).page.httpStatus,503);assert.match((await state()).page.message,/HTTP 503/);record('Initial HTTP failures remain attached to their browser tab');
  await open('https://scroll.example.test/cooldown');await invoke(p,'browser-scroll','force');r=await next();assert.match(r.error,/cooldown.*429/);const rateCount=requests.filter(r=>r.url.endsWith('/cooldown-next')).length;await inPage('scrollTo(0,document.documentElement.scrollHeight)');await delay(1800);assert.equal(requests.filter(r=>r.url.endsWith('/cooldown-next')).length,rateCount);record('HTTP 429 pauses pagination without automatic retries');
  await open('https://scroll.example.test/slow');await invoke(p,'browser-scroll','force');const pending=invoke(p,'browser-scroll','next');await until(async()=> (await state()).scrolling.loading,'Slow request did not start');await invoke(p,'browser-scroll','toggle');await pending;await delay(1700);assert.equal(await inPage('document.querySelectorAll("article").length'),1);assert.equal((await state()).scrolling.enabled,false);assert.equal((await state()).scrolling.error,'');record('Turning Infinite scroll off aborts a pending request without appending late results');
  await open('https://scroll.example.test/limit?page=1');await invoke(p,'browser-settings',{scrolling:{maxPages:1}});await invoke(p,'browser-scroll','force');await next();r=await next();assert.match(r.error,/Page limit/);await invoke(p,'browser-settings',{scrolling:{maxPages:50}});r=await next();assert.equal(r.pages,2);record('Extra-page limit enforced and raising the limit permits a manual retry');
  await p.locator('[data-action=browser-tools]').click();await p.locator('.tools-tabs [data-browser-tool=tab][data-value=scrolling]').click();assert(await p.locator('#scrolling-force').isChecked());await p.screenshot({path:path.join(qa,'force-scroll-settings.png')});await p.keyboard.press('Escape');assert.deepEqual(errors,[]);
  const report={passed:true,checks,rendererErrors:errors,requests:requests.filter(r=>!r.url.endsWith('/fixture.png')).map(r=>({url:r.url,cookie:!!r.cookie,referer:r.referer})),note:'All gallery/layout fixtures are local non-explicit content served at the named URLs by an isolated test-only protocol handler. No real gallery images or user cookies were used.'};fs.writeFileSync(path.join(qa,'pagination-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({passed:true,groups:checks.length,rendererErrors:errors}));
 }finally{if(app)await app.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
