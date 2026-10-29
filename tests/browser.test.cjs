const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../app/core.cjs');
const sessions=require('../app/browser-plugins/tab-sessions.cjs');
const translator=require('../app/browser-plugins/page-translator.cjs');
const {editItems,addressUrl}=require('../app/edit-menu.cjs');
const scroll=require('../app/browser-plugins/infinite-scroll.cjs');
const galleries=require('../app/gallery-lists.cjs');
test('download acceleration preferences are separate opt-ins and persist',()=>{
 const defaults=core.preferences();assert.equal(defaults.fastResolve,false);assert.equal(defaults.bypassRateLimits,false);
 assert.equal(core.preferences({fastResolve:true}).bypassRateLimits,false);
 assert.equal(core.preferences({bypassRateLimits:true}).fastResolve,false);
 assert.equal(core.preferences(JSON.parse(JSON.stringify({fastResolve:true,bypassRateLimits:true}))).bypassRateLimits,true);
 assert.equal(core.preferences({fastResolve:'false',bypassRateLimits:'false'}).bypassRateLimits,false);
});
test('three frontend entries recognize project paths and canonical post identities',()=>{
 for(const [url,id] of [['https://r34.app/posts/rule34.xxx','r34app'],['https://kurosearch.com/share?tags=landscape','kurosearch'],['https://kurozenzen.github.io/r34-react/#/search','r34react']]){assert.equal(core.siteFor(url).id,id);assert.equal(galleries.listingKind(url),'rule34');}
 assert.equal(core.siteFor('https://kurozenzen.github.io/unrelated'),null);
 assert.equal(core.siteFor('https://r34.app.evil.test/'),null);
 const source='https://rule34.xxx/index.php?page=post&s=view&id=123';
 for(const url of ['https://r34.app/posts/rule34.xxx/123','https://kurosearch.com/post/123','https://kurozenzen.github.io/r34-react/#/post/123']){assert.equal(galleries.frontendPostUrl(url),source);assert.equal(galleries.listingKind(url),null);assert.equal(galleries.galleryKey(url),galleries.galleryKey(source));}
 assert.equal(galleries.frontendPostUrl('https://r34.app/posts/e621.net/123'),null);
});
test('saved tab imports discard executable schemes and embedded credentials',()=>{
 const tabs=sessions.tabs([{url:'javascript:alert(1)'},{url:'file:///secret'},{url:'https://name:secret@example.com'},{url:'https://example.com/page',title:'A page'}]);
 assert.equal(tabs.length,1);assert.equal(tabs[0].url,'https://example.com/page');assert.equal(tabs[0].title,'A page');
 assert.equal(sessions.tabs(Array.from({length:200},()=>({url:'https://example.com/'}))).length,100);
 assert.throws(()=>sessions.snapshot('Empty',[]));
});
test('Google translation encodes the full URL and keeps provider parameters separate',()=>{
 const url='https://example.com/page?q=a&x=b#part';const google=new URL(translator.googleUrl(url,'zh-TW'));
 assert.equal(google.origin,'https://translate.google.com');assert.equal(google.searchParams.get('u'),url);assert.equal(google.searchParams.get('tl'),'zh-TW');
 assert.throws(()=>translator.googleUrl('file:///secret','en'));assert.equal(translator.language('<script>'),'en');
 assert.equal(translator.endpoint('http://localhost:5000/'),'http://localhost:5000/translate');assert.equal(translator.endpoint('https://example.com/translate'),'https://example.com/translate');
});
test('creator task enlargement defaults apply only to Kemono and survive restoration',()=>{
 const prefs=core.preferences({kemonoUpscale:2,maxPosts:900,compactSidebar:true});assert.equal(prefs.maxPosts,500);
 const task=core.makeTask('https://kemono.cr/patreon/user/123/post/456',prefs);assert.equal(task.upscale,2);assert.equal(core.restoreTasks([task])[0].upscale,2);
 assert.equal(core.makeTask('https://pixiv.net/artworks/123',prefs).upscale,1);assert.equal(core.preferences({kemonoUpscale:10}).kemonoUpscale,1);
});
test('new sites recognize mirrors without matching lookalike hosts',()=>{
 assert.equal(core.siteFor('https://comix.ws/title/example/chapter').id,'comix');assert.equal(core.siteFor('https://pawchive.st/patreon/user/123').id,'pawchive');
 assert.equal(core.siteFor('https://toonkor412.org/chapter').id,'toonkor');assert.equal(core.siteFor('https://toonkor0.org.evil.com/chapter'),null);
 assert.equal(core.siteFor('https://notpixiv.net/artworks/1'),null);
 const added=core.sites.filter(s=>['doujinhentai','ikuhentai','toonkor','blacktoon','danbooru','gelbooru','rule34','yandere'].includes(s.id));assert.equal(added.length,8);assert(added.every(s=>s.engine==='native'));
});
test('editable menus expose standard editing roles and selection flags',()=>{
 const items=editItems({editFlags:{canCopy:true,canPaste:true,canUndo:false,canSelectAll:true}});
 assert.deepEqual(items.filter(i=>i.role).map(i=>i.role),['undo','redo','cut','copy','paste','delete','selectAll']);assert(items.find(i=>i.role==='copy').enabled);assert(!items.find(i=>i.role==='undo').enabled);
 assert.equal(addressUrl('kemono.cr/artists'),'https://kemono.cr/artists');assert.equal(addressUrl('localhost:9000/test'),'http://localhost:9000/test');
 assert.equal(new URL(addressUrl('artist search')).searchParams.get('q'),'artist search');assert.throws(()=>addressUrl('javascript:alert(1)'));
});
test('in-page translation defaults to a no-key service with correct provider requests',()=>{
 const defaults=translator.settings({provider:'google'});assert.equal(defaults.provider,'microsoft');assert(defaults.continuous);assert(defaults.includeFrames);
 const request=translator.requestFor({...defaults,target:'zh-TW'},['Hola']);assert.equal(new URL(request.url).hostname,'edge.microsoft.com');assert.equal(new URL(request.url).searchParams.get('to'),'zh-Hant');assert.deepEqual(JSON.parse(request.body),['Hola']);assert(!request.headers.Authorization);
 assert.deepEqual(request.parse([{translations:[{text:'Hello'}]}]),['Hello']);
 const deep=translator.requestFor({provider:'deepl',target:'en',deeplPlan:'free'},['Hola'],'fixture-key');assert.equal(new URL(deep.url).hostname,'api-free.deepl.com');assert.equal(deep.headers.Authorization,'DeepL-Auth-Key fixture-key');assert(!deep.url.includes('fixture-key'));
 const azure=translator.requestFor({provider:'azure',target:'en',region:'eastus'},['Hola'],'fixture-key');assert.equal(azure.headers['Ocp-Apim-Subscription-Region'],'eastus');assert.deepEqual(JSON.parse(azure.body),[{Text:'Hola'}]);
 assert.throws(()=>translator.requestFor({provider:'deepl',target:'en'},['Hola']));
});
test('long translation text is split losslessly and next pages stay on origin',()=>{
 const text=('你好 🌍 words '.repeat(800));const parts=translator.splitText(text);assert(parts.length>1);assert.equal(parts.join(''),text);assert(parts.every(p=>p.length<=1800));
 assert(scroll.sameOrigin('https://kemono.cr/posts?o=50','https://kemono.cr/posts'));assert(!scroll.sameOrigin('https://other.example/posts','https://kemono.cr/posts'));assert(!scroll.sameOrigin('file:///secret','https://kemono.cr/posts'));
 assert.equal(scroll.settings({speed:99999,maxPages:-1}).speed,2000);assert.equal(scroll.settings({maxPages:-1}).maxPages,1);
});
test('E/Ex categories decode exclusion masks and retain filters while resetting a cursor',()=>{
 const initial='https://exhentai.org/?f_cats=1022&f_search=ashits&next=123&f_srdd=4';
 assert.deepEqual(galleries.categoryState(initial).selected,[1]);
 const url=new URL(galleries.categoryUrl({url:initial,site:'exhentai',query:'artist name -excluded',selected:[2,4]}));
 assert.equal(url.searchParams.get('f_cats'),'1017');assert.equal(url.searchParams.get('f_search'),'artist name -excluded');assert.equal(url.searchParams.get('f_srdd'),'4');assert(!url.searchParams.has('next'));
 const all=new URL(galleries.categoryUrl({url:initial,site:'ehentai',query:'',selected:galleries.categories.map(c=>c.id)}));assert.equal(all.hostname,'e-hentai.org');assert.equal(all.searchParams.get('f_cats'),'0');assert(!all.searchParams.has('f_search'));
 assert.throws(()=>galleries.categoryUrl({selected:[]}));assert.equal(galleries.listingKind(initial),'eh');assert.equal(galleries.listingKind('https://exhentai.org/g/123/abcdef1234/'),null);assert.equal(galleries.listingKind('https://exhentai.org.evil.test/?f_search=test'),null);
});
test('a cancelled gallery collection cannot overwrite a newly started batch',async()=>{
 const url='https://exhentai.org/?f_search=fixture',w={id:5,getURL:()=>url,isDestroyed:()=>false};
 const collector=new galleries.GalleryCollector({read:async()=>{throw new Error('Should still be waiting');}});
 collector.parse=async()=>({rows:[{url:'https://exhentai.org/g/1/abcdef1234/',title:'Sample'}],next:url+'&next=2'});
 collector.wait=async(_,signal)=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(new Error('Cancelled')),{once:true}));
 await collector.start(w,{extraPages:10,maxGalleries:50});assert(collector.status().running);collector.cancel(w);
 await collector.start(w,{extraPages:0,maxGalleries:50});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(collector.status().error,'');assert.equal(collector.status().phase,'batch-limit');assert.equal(collector.status().running,false);collector.close();
});
