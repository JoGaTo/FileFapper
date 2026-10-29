'use strict';
// Development-only launcher. Nothing is injected into website tabs or releases.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
const {_electron:electron}=require('playwright');
const root=path.resolve(__dirname,'..'),appDir=path.join(root,'app');
const args=new Set(process.argv.slice(2)),verify=args.has('--verify');
const profile=verify?path.join(root,'..','qa-css-preview-'+crypto.randomUUID()):path.join(root,'..','css-preview-profile');
const firstRun=!fs.existsSync(path.join(profile,'state.json'));
let app,page,watcher,timer,closing=false,checkFile;
const pending=new Set();
async function reloadCss(names){
 if(!page||page.isClosed())return;
 const results=await page.evaluate(async names=>{
  const links=[...document.querySelectorAll('link[rel="stylesheet"]')];
  return Promise.all(links.filter(link=>names.includes(decodeURIComponent(new URL(link.href).pathname.split('/').pop()))).map(old=>new Promise(resolve=>{
   const next=old.cloneNode(),url=new URL(old.href);url.searchParams.set('df-css-preview',Date.now()+'-'+Math.random());next.href=url.href;
   const timeout=setTimeout(()=>{next.remove();resolve({file:url.pathname.split('/').pop(),loaded:false});},5000);
   next.onload=()=>{clearTimeout(timeout);old.remove();resolve({file:url.pathname.split('/').pop(),loaded:true});};
   next.onerror=()=>{clearTimeout(timeout);next.remove();resolve({file:url.pathname.split('/').pop(),loaded:false});};old.after(next);
  })));
 },names);
 for(const row of results)console.log((row.loaded?'Updated: ':'Could not reload: ')+row.file);
}
async function stop(){
 if(closing)return;closing=true;clearTimeout(timer);watcher?.close();
 try{if(app)await app.close();}finally{if(checkFile)fs.rmSync(checkFile,{force:true});}
}
process.once('SIGINT',()=>stop().catch(console.error));
process.once('SIGTERM',()=>stop().catch(console.error));
(async()=>{try{
 app=await electron.launch({args:[root],cwd:root,env:{...process.env,DF_DATA_DIR:profile,DF_SHOW_UI:'1',DF_USE_BUNDLED:'1'},timeout:45000});
 page=await app.firstWindow();await page.waitForSelector('#urls');
 if(firstRun)await page.evaluate(()=>window.df.invoke('set-prefs',{autoStart:false,clipboard:false,resumeOnLaunch:false,theme:'mother_daughter'}));
 if(args.has('--sample')){
  const state=await page.evaluate(()=>window.df.invoke('get-state'));
  if(!state.tasks.length)await page.evaluate(()=>window.df.invoke('add-urls','dfdemo://sample/afternoon\ndfdemo://sample/next'));
 }
 await app.evaluate(({BrowserWindow})=>{
  const win=BrowserWindow.getAllWindows()[0];
  win.webContents.on('before-input-event',(event,input)=>{
   if(input.type==='keyDown'&&(input.key==='F12'||input.control&&input.shift&&input.key.toLowerCase()==='i')){event.preventDefault();win.webContents.toggleDevTools();}
  });
 });
 if(args.has('--devtools'))await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.openDevTools({mode:'detach'}));
 watcher=fs.watch(appDir,(_,name)=>{
  if(!name||!name.toString().endsWith('.css'))return;
  pending.add(path.basename(name.toString()));clearTimeout(timer);
  timer=setTimeout(()=>{const names=[...pending];pending.clear();reloadCss(names).catch(e=>console.error('CSS preview:',e.message));},120);
 });
 console.log('FileFapper live CSS preview is open. Save app/*.css to update this window.');
 console.log('F12 opens Inspect tools. Close the preview window or press Ctrl+C to stop.');
 console.log('Preview profile: '+profile);
 if(verify){
  checkFile=path.join(appDir,'.df-preview-check-'+crypto.randomUUID()+'.css');
  fs.writeFileSync(checkFile,':root{--df-preview-check:1}');
  await page.evaluate(href=>new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.onload=resolve;link.onerror=()=>reject(Error('Initial stylesheet failed'));document.head.append(link);}),pathToFileURL(checkFile).href);
  await page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--df-preview-check').trim()==='1');
  await page.locator('#task-filter').fill('Preview state stays intact');
  fs.writeFileSync(checkFile,':root{--df-preview-check:2}');
  await page.waitForFunction(()=>getComputedStyle(document.documentElement).getPropertyValue('--df-preview-check').trim()==='2');
  if(await page.locator('#task-filter').inputValue()!=='Preview state stays intact')throw Error('CSS reload reset renderer state');
  await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows()[0].webContents;w.sendInputEvent({type:'keyDown',keyCode:'F12'});w.sendInputEvent({type:'keyUp',keyCode:'F12'});});
  let inspected=false;for(let n=0;n<20&&!inspected;n++){await new Promise(r=>setTimeout(r,100));inspected=await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.isDevToolsOpened());}
  if(!inspected)throw Error('F12 did not open preview Inspect tools');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.closeDevTools());
  console.log('PASS: saving CSS updates the real app without resetting its filter or reloading the page; F12 opens Inspect tools.');
  await stop();
 }else await new Promise(resolve=>app.once('close',resolve));
 }catch(e){console.error(e.message);process.exitCode=1;await stop();}finally{watcher?.close();clearTimeout(timer);if(checkFile)fs.rmSync(checkFile,{force:true});}})();
