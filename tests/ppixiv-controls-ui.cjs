'use strict';
const {_electron:electron}=require('playwright'),{launchPackaged}=require('./launch_packaged.cjs'),{markup}=require('./fixtures/alpha-browser.cjs');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),qa=path.resolve(process.env.DF_PPIXIV_QA||path.join(root,'..','qa-ppixiv-controls-'+Date.now()));fs.mkdirSync(qa,{recursive:true});
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a1ZkAAAAASUVORK5CYII=','base64');
const invoke=(page,name,...args)=>page.evaluate(({name,args})=>window.df.invoke(name,...args),{name,args});
const delay=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){const end=Date.now()+30000;while(Date.now()<end){if(await fn())return;await delay(100);}throw new Error(label);}
let app;
(async()=>{
 const server=http.createServer((req,res)=>{const u=new URL(new URL(req.url,'http://fixture').searchParams.get('url'));if(u.hostname.endsWith('pximg.net')){res.setHeader('content-type','image/png');return res.end(png);}const data=markup(u);res.setHeader('content-type',data.json?'application/json':'text/html');res.end(data.json?JSON.stringify(data.json):data);});await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 try{
  const options={cwd:root,env:{...process.env,DF_DATA_DIR:qa}};app=process.env.DF_APP_EXE?await launchPackaged(process.env.DF_APP_EXE,options):await electron.launch({args:[root],...options});const page=await app.firstWindow();await page.waitForFunction(()=>typeof state!=='undefined'&&state&&sites.length===50);
  await app.evaluate(async({session},base)=>{await session.fromPartition('persist:dandf-browser').protocol.handle('https',request=>fetch(base+'/?url='+encodeURIComponent(request.url)));},base);
  await page.locator('[data-page=browser]').first().click();await invoke(page,'browser-navigate','https://www.pixiv.net/artworks/123');
  const remote=expression=>app.evaluate(async({webContents},expression)=>{const w=webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://www.pixiv.net/'));return w?w.executeJavaScript(expression):false;},expression);
  await until(()=>remote("!!window.ppixiv?.app&&[...document.images].some(i=>i.src.includes('pximg.net')&&i.naturalWidth>0)"),'Artwork did not load');
  const file=path.join(qa,'upstream-button.png');await app.evaluate(({session},file)=>{session.fromPartition('persist:dandf-browser').once('will-download',(_event,item)=>item.setSavePath(file));},file);
  assert(await remote("(()=>{const b=document.querySelector('.download-image-button');if(!b)return false;b.click();return true;})()"),'The upstream Download image control is missing');await until(()=>fs.existsSync(file),'The real upstream Download image button did not save');assert(fs.readFileSync(file).equals(png));
  const controls=await remote("({download:!!document.querySelector('.download-image-button'),image:[...document.images].some(i=>i.naturalWidth>0),viewer:!!ppixiv.app,slideshow:typeof ppixiv.app.toggleSlideshow==='function'})");assert(controls.download&&controls.image&&controls.viewer&&controls.slideshow);
  await remote("ppixiv.app.toggleSlideshow();true");await until(()=>remote("location.hash.includes('slideshow')"),'The upstream slideshow control did not activate');await remote("ppixiv.app.toggleSlideshow();true");await until(()=>remote("!location.hash.includes('slideshow')"),'The upstream slideshow control did not stop');
  await invoke(page,'browser-settings',{ppixivPlugin:false});await until(()=>remote("typeof window.ppixiv==='undefined'"),'Disabling left a viewer script behind');await invoke(page,'browser-settings',{ppixivPlugin:true});await until(()=>remote("!!window.ppixiv?.app&&[...document.images].some(i=>i.src.includes('img-original')&&i.naturalWidth>0)"),'Re-enabling did not restore the viewer');
  const result={passed:true,checks:['A fresh browser tab loads Pixiv and ppixiv without a prior website navigation','Actual ppixiv Download image button saves its full original bytes through the native bridge and Save As path','Actual ppixiv slideshow toggles on and off through the upstream control','Disabling removes the real viewer script; re-enabling restores artwork display'],controls};fs.writeFileSync(path.join(qa,'ppixiv-controls-report.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
 }finally{await app?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
