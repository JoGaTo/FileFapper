'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const core=require('../app/core.cjs'),lists=require('../app/gallery-lists.cjs'),{serve}=require('../app/media-protocol.cjs');
test('picture and reactor collection URLs are distinguished from individual posts and lookalikes',()=>{
 for(const url of ['https://www.hentai-foundry.com/pictures/tagged/sample','https://www.hentai-foundry.com/pictures/user/Artist','https://www.hentai-foundry.com/search/pictures?query=sample','https://www.hentai-foundry.com/pictures/category/1/page/2'])assert.equal(lists.listingKind(url),'foundry',url);
 for(const url of ['https://fapreactor.com/search?q=sample','https://fapreactor.com/search/sample','https://fapreactor.com/tag/sample/10','https://pornreactor.cc/user/Artist','https://fapreactor.com/category/sample'])assert.equal(lists.listingKind(url),'reactor',url);
 for(const url of ['https://www.hentai-foundry.com/pictures/user/Artist/123/title','https://fapreactor.com/post/123','https://fapreactor.com.evil.test/tag/sample','https://evil.test/pictures/tagged/sample'])assert.equal(lists.listingKind(url),null,url);
});
test('new enlargement settings persist without changing the original-size default',()=>{
 const p=core.preferences({upscaleMethod:'waifu2x',upscaleDenoise:'gentle',upscaleDevice:'cpu'});assert.equal(p.kemonoUpscale,1);
 const t=core.makeTask('https://kemono.cr/patreon/user/1/post/2',{...p,kemonoUpscale:2});const [restored]=core.restoreTasks([t]);assert.equal(restored.upscaleMethod,'waifu2x');assert.equal(restored.upscaleDenoise,'gentle');assert.equal(restored.upscaleDevice,'cpu');assert.equal(restored.upscale,2);
 const invalid=core.preferences({upscaleMethod:'remote-upload',upscaleDevice:'evil',upscaleDenoise:'strong'});assert.equal(invalid.upscaleMethod,'waifu2x');assert.equal(invalid.upscaleDevice,'auto');assert.equal(invalid.upscaleDenoise,'off');
});
test('all five Alpha theme preferences survive saved-session restoration',()=>{
 for(const theme of ['steampunk','cyberpunk','survival','asagi','suketto'])assert.equal(core.preferences(JSON.parse(JSON.stringify({theme}))).theme,theme);
});
test('concurrent ppixiv setup registers exactly one script and disabling removes it',async()=>{
 const {Ppixiv}=require('../app/browser-plugins/ppixiv.cjs');const {EventEmitter}=require('node:events');let registrations=0,document='';const active=new Set(),w=new EventEmitter();Object.assign(w,{id:123,isDestroyed:()=>false,getURL:()=>document,loadURL:async url=>{document=url;},debugger:{isAttached:()=>true,sendCommand:async(name,args)=>{assert(document,'A Page command preceded the initial document');await new Promise(resolve=>setTimeout(resolve,3));if(name==='Page.addScriptToEvaluateOnNewDocument'){const identifier=String(++registrations);active.add(identifier);return {identifier};}if(name==='Page.removeScriptToEvaluateOnNewDocument')active.delete(args.identifier);return {};}}});const pp=new Ppixiv();await Promise.all([pp.configure(w,true),pp.configure(w,true)]);assert.equal(document,'about:blank');assert.equal(registrations,1);assert.equal(active.size,1);await pp.configure(w,false);assert.equal(active.size,0);await Promise.all([pp.configure(w,true),pp.configure(w,false)]);assert.equal(active.size,0);assert.equal(w.listenerCount('destroyed'),1);
});
test('comparison originals stay confined to the owned gallery folder',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'dandf-comparison-'));try{const inside=path.join(folder,'originals');fs.mkdirSync(inside);const original=path.join(inside,'0001.png');fs.writeFileSync(original,'original');const processed=path.join(folder,'0001.png');fs.writeFileSync(processed,'processed');const task={id:'comparison',folder,files:[{index:1,path:processed,originalPath:original}]};assert.equal(await serve(new Request('dfmedia://comparison/1?original=1'),[task]).text(),'original');task.files[0].originalPath=path.join(folder,'..','outside.png');assert.equal(serve(new Request('dfmedia://comparison/1?original=1'),[task]).status,404);}finally{fs.rmSync(folder,{recursive:true,force:true});}
});
