const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const core=require('../app/core.cjs'),dates=require('../app/date-range.cjs'),galleries=require('../app/gallery-lists.cjs'),ppixiv=require('../app/browser-plugins/ppixiv.cjs');
test('five new site profiles match hosts and preserve adapter precedence',()=>{
 for(const [url,id] of [['https://www.hentai-foundry.com/pictures/user/name/123/title','hentaifoundry'],['https://tbib.org/index.php?page=post&s=view&id=1','tbib'],['https://fapreactor.com/post/1','fapreactor'],['https://aibooru.online/posts/1','aibooru'],['https://civitai.com/images/1','civitai']]){assert.equal(core.siteFor(url).id,id);assert.equal(core.siteFor(url.replace(new URL(url).hostname,new URL(url).hostname+'.evil.test')),null);}
 assert.equal(core.sites.length,50);
});
test('nine themes persist, including all five additions',()=>{
 for(const theme of ['light','dark','black','brown','summer','winter','ruby','sapphire','kawaii'])assert.equal(core.preferences({theme}).theme,theme);
});
test('inclusive date ranges reject invalid calendar days and reversed endpoints',()=>{
 assert(dates.includes('2026-10-19T23:59:59Z',{dateFrom:'2026-10-19',dateTo:'2026-10-19'}));assert(!dates.includes('',{dateFrom:'2026-10-19'}));assert(dates.includes('',{}));
 for(const p of [{dateFrom:'2026-02-30'},{dateTo:'bad'},{dateFrom:'2026-10-20',dateTo:'2026-10-19'}])assert.throws(()=>dates.range(p));
 assert.equal(galleries.collectionSettings({dateFrom:'2026-10-19'}).dateFrom,'2026-10-19');
});
test('date collection recognizes supported API listings without confusing individual posts',()=>{
 for(const url of ['https://danbooru.donmai.us/posts?tags=test','https://aibooru.online/posts?tags=test','https://pawchive.pw/patreon/user/123','https://kemono.cr/posts?q=test'])assert.equal(galleries.listingKind(url),'api');
 for(const url of ['https://danbooru.donmai.us/posts/1','https://pawchive.pw/patreon/user/123/post/4','https://kemono.cr/evil/post/1'])assert.equal(galleries.listingKind(url),null);
 assert.equal(galleries.listingKind('https://tbib.org/index.php?page=post&s=list&tags=test'),'booru');
});
test('a dated EHex batch excludes undated rows and does not stop on an empty date match page',async()=>{
 const url='https://exhentai.org/?f_search=fixture',w={id:1,getURL:()=>url,isDestroyed:()=>false},row=(id,date)=>({url:`https://exhentai.org/g/${id}/abcdef/`,title:'Fixture',date});
 const collector=new galleries.GalleryCollector({read:async url=>({url,html:'next'})});
 collector.wait=async()=>{};collector.parse=async(_,html)=>html===null?{rows:[row(1,'2026-09-01'),row(2,'')],next:url+'&next=1'}:html==='next'?{rows:[row(3,'2026-10-19')],next:null}:null;
 await collector.start(w,{dateFrom:'2026-10-19',dateTo:'2026-10-19',extraPages:1});while(collector.status().running)await new Promise(r=>setImmediate(r));
 assert.equal(collector.results().rows.length,1);assert.equal(collector.results().rows[0].date,'2026-10-19');assert.equal(collector.status().undated,1);collector.close();
});
test('date API jobs accept incremental results and are cancelled with their worker',async()=>{
 const {EventEmitter}=require('node:events'),child=new EventEmitter();let killed=false,received;
 child.kill=()=>{killed=true;};const url='https://kemono.cr/patreon/user/123',w={id:2,getURL:()=>url,isDestroyed:()=>false};
 const collector=new galleries.GalleryCollector({worker:(req,emit)=>{received={req,emit};return child;}});
 await collector.start(w,{dateFrom:'2026-10-01',maxGalleries:20});assert.equal(received.req.siteId,'kemono');assert.equal(received.req.dateFrom,'2026-10-01');
 received.emit({event:'collection',rows:[{url:url+'/post/1',date:'2026-10-19'}],pages:1,scanned:4,undated:1,next:null,running:true});assert.equal(collector.results().rows.length,1);collector.cancel();assert(killed);assert.equal(collector.status().running,false);
 received.emit({event:'collection',rows:[],running:false});assert.equal(collector.results().rows.length,1);
});
test('changing an empty date range retains the review identity and restores matches',async()=>{
 const url='https://exhentai.org/?f_search=dates',w={id:3,getURL:()=>url,isDestroyed:()=>false};
 const collector=new galleries.GalleryCollector({read:async()=>{throw new Error('No next page');}});
 collector.parse=async()=>({rows:[{url:'https://exhentai.org/g/1/abcdef/',title:'Fixture',date:'2026-10-19'}],next:null});
 await collector.start(w,{dateFrom:'2026-10-20',extraPages:0});while(collector.status().running)await new Promise(r=>setImmediate(r));
 const id=collector.status().id;assert.equal(collector.results().rows.length,0);
 await collector.start(w,{dateFrom:'2026-10-19',extraPages:0});while(collector.status().running)await new Promise(r=>setImmediate(r));
 assert.equal(collector.status().id,id);assert.equal(collector.results().rows.length,1);collector.close();
});
test('ppixiv is the verified official bundle with a strictly scoped media bridge',()=>{
 const injected=ppixiv.injection();assert(injected.includes('new AppStartup()'));assert(injected.includes('ppixiv setup:'));assert(ppixiv.matches('https://www.pixiv.net/artworks/1'));assert(!ppixiv.matches('https://sketch.pixiv.net/'));
 for(const url of ['https://i.pximg.net/a.zip','https://i-cf.pximg.net/a.jpg'])assert(ppixiv.allowedImage(url));
 for(const url of ['http://i.pximg.net/a','https://i.pximg.net.evil.test/a','https://i.pximg.net:999/a','file:///secret','https://user:pass@i.pximg.net/a'])assert(!ppixiv.allowedImage(url));
});
test('local media protocol supports seeking, companion previews, and confinement',async()=>{
 const {serve}=require('../app/media-protocol.cjs'),root=fs.mkdtempSync(path.join(os.tmpdir(),'df-media-')),folder=path.join(root,'gallery');fs.mkdirSync(folder);
 fs.writeFileSync(path.join(folder,'sample.wav'),'0123456789');fs.writeFileSync(path.join(folder,'preview.webp'),'WEBP');fs.writeFileSync(path.join(root,'outside'),'PRIVATE');
 const tasks=[{id:'media',folder,files:[{index:1,path:path.join(folder,'sample.wav'),previewPath:path.join(folder,'preview.webp')}]}];
 let response=serve(new Request('dfmedia://media/1',{headers:{Range:'bytes=3-6'}}),tasks);assert.equal(response.status,206);assert.equal(response.headers.get('content-type'),'audio/wav');assert.equal(await response.text(),'3456');
 response=serve(new Request('dfmedia://media/1',{headers:{Range:'bytes=-2'}}),tasks);assert.equal(await response.text(),'89');
 assert.equal(await serve(new Request('dfmedia://media/1?preview=1'),tasks).text(),'WEBP');assert.equal(serve(new Request('dfmedia://media/1',{headers:{Range:'bytes=100-'}}),tasks).status,416);
 tasks[0].files[0].path=path.join(root,'outside');assert.equal(serve(new Request('dfmedia://media/1'),tasks).status,404);
 fs.rmSync(root,{recursive:true,force:true});
});
