'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),{_electron:electron}=require('playwright'),{launchPackaged}=require('./launch_packaged.cjs');
const qa=path.resolve(process.env.DF_UPDATES_QA||path.join(root,'..','qa-sites-tags-'+Date.now()));
if(fs.existsSync(path.join(qa,'state.json')))throw Error('Use a fresh QA profile.');fs.mkdirSync(qa,{recursive:true});
let app,page;const checks=[],errors=[],delay=ms=>new Promise(r=>setTimeout(r,ms));
const invoke=(name,...args)=>page.evaluate(({name,args})=>window.df.invoke(name,...args),{name,args});
const native=(fn,arg)=>app.evaluate(({app},{root,source,arg})=>{const req=process.getBuiltinModule('module').createRequire(app.isPackaged?process.resourcesPath+'/app.asar/app/main.cjs':root+'/app/main.cjs');return (0,eval)('('+source+')')(req('./edge-runtime.cjs').getQaSession(),arg);},{root,source:fn.toString(),arg});
const record=s=>{checks.push(s);console.log('PASS '+s);};
async function launch(){const options={cwd:root,env:{...process.env,DF_DATA_DIR:qa,DF_USE_BUNDLED:'1',DF_SHOW_UI:'1'}};app=process.env.DF_APP_EXE?await launchPackaged(process.env.DF_APP_EXE,options):await electron.launch({args:[root],...options,timeout:45000});page=await app.firstWindow();page.on('pageerror',e=>errors.push(e.message));await page.waitForSelector('#urls');}
async function navigate(url){await invoke('browser-navigate',url);for(let n=0;n<200;n++){const s=await invoke('browser-state');if(s.url===url&&!s.loading&&await native((s,url)=>[...s.runtime.views.values()].some(v=>v.webContents.getURL()===url&&!v.webContents.isLoading()),url)){await delay(150);return;}await delay(100);}throw Error('Navigation timed out');}
const routes=require('./fixtures/tag-editors.cjs').routes();
routes.push({hostname:'rule34.us',status:200,headers:{'Content-Type':'text/html'},body:'<!doctype html><title>Post results</title><main><a href="/index.php?r=posts/view&id=123"><img alt="Scenery"></a><a href="https://rule34.us.evil.test/index.php?r=posts/view&id=456">Other</a></main><div class="pagination"><a rel="next" href="/index.php?r=posts/index&page=2">Next</a></div>'});
(async()=>{try{
 await launch();await invoke('set-prefs',{autoStart:false});await invoke('add-urls','dfdemo://sample/artwork');
 const templates=require('../app/theme-data.js').artworkThemes;
 for(const t of templates){await invoke('set-prefs',{theme:t.id,artworkOpacity:35,artworkQueueWidth:'less'});await page.evaluate(()=>setPage('queue'));
  await page.waitForFunction(id=>document.documentElement.dataset.theme===id,t.id);
  const result=await page.evaluate(()=>{
   const alpha=c=>{const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d');ctx.fillStyle=c;ctx.fillRect(0,0,1,1);return ctx.getImageData(0,0,1,1).data[3]/255;};
   return {effect:document.body.dataset.artworkEffect,panels:['.page-heading','.task-row','.queue-toolbar','.queue-foot','.stats','.address-card'].map(selector=>({selector,alpha:alpha(getComputedStyle(document.querySelector('#page-queue '+selector)).backgroundColor)})),titleShadow:getComputedStyle(document.querySelector('.task-title')).textShadow,captionColor:getComputedStyle(document.querySelector('.queue-foot')).color,captionWeight:getComputedStyle(document.querySelector('.queue-foot')).fontWeight,headingShadow:getComputedStyle(document.querySelector('#page-queue h1')).textShadow,border:parseFloat(getComputedStyle(document.querySelector('#urls')).borderTopWidth),height:document.querySelector('#urls').getBoundingClientRect().height,font:parseFloat(getComputedStyle(document.querySelector('.task-title')).fontSize)};
  });
  assert.equal(result.captionColor,'rgb(255, 255, 255)');assert(Number(result.captionWeight)>=600);assert.equal(result.effect,t.textEffect||'glow');for(const r of result.panels)assert.equal(r.alpha,0,t.id+' still has a filled '+r.selector);
  assert.notEqual(result.titleShadow,'none');assert.notEqual(result.headingShadow,'none');assert(result.border>=2);assert(result.height<=56);assert(result.font>=16);
 }
 record('All seven templates expose the artwork, retain readable text size, use glow/shadow and strengthen compact control borders');
 for(const id of ['mother_daughter','suketto']){
  await invoke('set-prefs',{theme:id});await page.evaluate(()=>setPage('queue'));
  const styles=await page.evaluate(()=>({selects:[...document.querySelectorAll('select')].map(n=>({color:getComputedStyle(n).color,bg:getComputedStyle(n).backgroundColor,scheme:getComputedStyle(n).colorScheme,options:[...n.options].map(o=>getComputedStyle(o).color)})),icons:[...document.querySelectorAll('.browser-toolbar [data-browser="back"],.browser-toolbar [data-browser="forward"],.browser-toolbar [data-browser="reload"]')].map(n=>({color:getComputedStyle(n).color,bg:getComputedStyle(n).backgroundColor,border:parseFloat(getComputedStyle(n).borderTopWidth)}))}));
  for(const row of styles.selects){assert.equal(row.color,'rgb(62, 39, 52)');assert.equal(row.scheme,'light');assert(row.options.every(c=>c==='rgb(62, 39, 52)'));}
  assert.equal(styles.icons.length,3);for(const row of styles.icons){assert.equal(row.color,'rgb(62, 39, 52)');assert(row.border>=2);}
 }
 record('Both light templates use dark dropdown/option text and visible navigation icons');
 for(const t of templates){await invoke('set-prefs',{theme:t.id});await page.evaluate(()=>setPage('sites'));await page.waitForFunction(id=>document.documentElement.dataset.theme===id&&document.body.classList.contains('artwork-theme')&&document.querySelector('#page-sites').classList.contains('active'),t.id);const style=await (await page.waitForFunction(()=>{const n=document.querySelector('.site-open');if(!n||!n.isConnected)return false;const v={bg:getComputedStyle(n).backgroundColor,color:getComputedStyle(n).color,width:n.getBoundingClientRect().width};return v.bg&&v.width>=34?v:false;})).jsonValue();assert.notEqual(style.bg,'rgba(0, 0, 0, 0)');assert(style.width>=34,JSON.stringify({theme:t.id,style}));}
 record('Open-site icons have a solid colored button on every artwork template');
 await invoke('set-prefs',{theme:'mother_daughter'});await page.evaluate(()=>setPage('queue'));
 const controlBefore=await page.locator('#artwork-fit').evaluate(n=>getComputedStyle(n).color);
 await page.locator('#artwork-brightness').fill('60');await page.locator('#artwork-brightness').dispatchEvent('change');await page.waitForFunction(()=>state.prefs.artworkBrightness.mother_daughter===60);
 assert.equal(await page.locator('#workspace-artwork').evaluate(n=>getComputedStyle(n).filter),'brightness(0.6)');assert.equal(await page.locator('#artwork-fit').evaluate(n=>getComputedStyle(n).color),controlBefore);
 await invoke('set-prefs',{theme:'asagi'});assert.equal(await page.locator('#workspace-artwork').evaluate(n=>getComputedStyle(n).filter),'brightness(1)');
 await invoke('set-prefs',{theme:'mother_daughter'});assert.equal(await page.locator('#artwork-brightness').inputValue(),'60');
 record('Brightness updates only artwork and remembers a separate value for each template');

 for(const id of ['search','sites','cookies','preferences','browser']){
  await page.evaluate(id=>setPage(id),id);
  const unprotected=await page.evaluate(()=>{
   const page=document.querySelector('.page.active')||[...document.querySelectorAll('.page')].find(n=>n.getClientRects().length),rows=[];
   const walker=document.createTreeWalker(page,NodeFilter.SHOW_TEXT);
   for(let n;n=walker.nextNode();){if(!n.textContent.trim())continue;const el=n.parentElement;if(el.closest('.browser-all-tabs,.tab-scroll'))continue;if(!el.getClientRects().length||getComputedStyle(el).visibility==='hidden')continue;
    if(getComputedStyle(el).textShadow==='none')rows.push({text:n.textContent.trim().slice(0,70),element:el.className||el.tagName});
   }return rows;
  });
  assert.deepEqual(unprotected,[],id+' has text without a glow or shadow');
 }
 record('Text outside cards receives glow/shadow across search, sites, cookies, preferences and browser controls');

 if(process.env.DF_PREVIEW_DIR){
  const preview=path.resolve(process.env.DF_PREVIEW_DIR);fs.mkdirSync(preview,{recursive:true});
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1720,1050));
  await invoke('set-prefs',{theme:'mother_daughter',artworkBrightness:{mother_daughter:100},artworkOpacity:90,compactSidebar:true,artworkQueueWidth:'less',queueDetails:false});await invoke('add-urls','dfdemo://sample/next');await page.evaluate(()=>setPage('queue'));await delay(900);await page.screenshot({path:path.join(preview,'mother-daughter-queue.png')});
  await page.evaluate(()=>setPage('sites'));await page.locator('#site-filter').fill('kasei');await page.screenshot({path:path.join(preview,'mother-daughter-sites.png')});
  await invoke('set-prefs',{theme:'asagi'});await page.evaluate(()=>setPage('queue'));await delay(500);await page.screenshot({path:path.join(preview,'asagi-queue.png')});
  await invoke('set-prefs',{theme:'suketto'});await page.screenshot({path:path.join(preview,'baseball-queue.png')});await page.evaluate(()=>setPage('browser'));await page.screenshot({path:path.join(preview,'baseball-browser-controls.png')});await invoke('set-prefs',{theme:'mother_daughter',artworkBrightness:{mother_daughter:60}});await page.evaluate(()=>setPage('queue'));
 }
 await invoke('set-prefs',{theme:'asagi'});await page.evaluate(()=>setPage('queue'));await page.screenshot({path:path.join(qa,'artwork-reading-surfaces.png')});
 await invoke('browser-settings',{scrolling:{speed:2000},ppixivPlugin:false});assert.equal((await invoke('browser-state')).prefs.scrolling.speed,2000);
 await page.locator('[data-page=browser]').first().click();await page.evaluate(()=>showBrowserTools('scrolling'));assert.equal(await page.locator('#scrolling-speed').getAttribute('max'),'2000');await page.locator('#scrolling-speed').fill('1750');await page.locator('[data-browser-tool=save-scrolling]').click();assert.equal((await invoke('browser-state')).prefs.scrolling.speed,1750);await page.evaluate(()=>closeModal());record('Scrolling UI accepts and persists speeds up to 2000');
 await native((s,r)=>s.setFixtures(r),routes);await navigate('https://kurosearch.com/');
 await page.locator('[data-action=browser-saved-tags]').click();await page.locator('[data-browser-tool=tags-read]').click();await page.waitForFunction(()=>document.querySelector('#saved-tag-query')?.value==='landscape -water');assert.equal(await page.locator('#saved-tag-query').inputValue(),'landscape -water');
 await page.locator('#saved-tag-name').fill('Scenery');await page.locator('#saved-tag-query').fill('landscape -water rating:safe');await page.locator('[data-browser-tool=tags-save]').click();await page.waitForSelector('[data-browser-tool=tags-apply]');
 let rows=(await invoke('browser-tools')).savedTags;assert.equal(rows.length,1);assert.equal(rows[0].tags,'landscape -water rating:safe');record('Saved tags UI reads the native page and saves names, tags and exclusions');
 await page.locator('[data-browser-tool=tags-edit]').click();await page.locator('#saved-tag-name').fill('Scenery revised');await page.locator('[data-browser-tool=tags-save]').click();await page.waitForFunction(()=>document.querySelector('.history-row strong')?.textContent==='Scenery revised');assert.equal((await invoke('browser-tools')).savedTags.length,1);record('Editing a saved tag search updates the existing entry');
 await page.locator('[data-browser-tool=tags-apply]').click();await page.waitForSelector('#modal.hidden',{state:'attached'});assert.equal((await invoke('browser-tags','read')).tags,'landscape -water rating:safe');record('Apply restores all Kurosearch selected chips, exclusions and remembered sort/filter settings');
 await navigate('https://kurozenzen.github.io/r34-react/');await invoke('browser-tags','save',{site:'r34react',name:'Sky',tags:'sky -cloud'});rows=(await invoke('browser-tools')).savedTags;const applied=await invoke('browser-tags','apply',{id:rows.find(r=>r.site==='r34react').id});assert.equal(applied.verified,true);assert.equal(applied.count,2);assert.equal((await invoke('browser-tags','read')).tags,'sky -cloud');record('R34 React creates separate selected chips, replaces old tags and starts its search');
 await assert.rejects(()=>invoke('browser-tags','apply',{id:rows.find(r=>r.site==='kurosearch').id}),/Open Kurosearch/);record('Applying tags cannot write to a different site');
 await navigate('https://rule34.us/index.php?r=posts/index&q=landscape');const collected=await invoke('browser-galleries','inspect');assert.equal(collected.rows.length,1);assert.equal(collected.rows[0].url,'https://rule34.us/index.php?r=posts/view&id=123');assert.equal(new URL(collected.next).searchParams.get('q'),'landscape');record('New listing collection keeps native post identities, query filters and host boundaries');
 await page.evaluate(()=>setPage('queue'));const sites=await invoke('get-sites');assert.equal(sites.length,50);record('All 50 site profiles are available through the packaged application');
 await app.close();app=null;await launch();const restored=await invoke('browser-tools');assert.equal(restored.savedTags.length,2);assert.equal((await invoke('get-state')).prefs.artworkBrightness.mother_daughter,60);assert.equal(restored.prefs.scrolling.speed,1750);assert.equal(restored.savedTags.find(r=>r.site==='kurosearch').name,'Scenery revised');await invoke('browser-tags','delete',{id:restored.savedTags[0].id});assert.equal((await invoke('browser-tools')).savedTags.length,1);record('Restart preserves both libraries and scrolling preferences; removal persists');
 const legacy=path.join(qa,'DandF-session.json'),oldTask=(await invoke('get-state')).tasks[0];fs.writeFileSync(legacy,JSON.stringify({version:1,prefs:{theme:'suketto',autoStart:false,workers:3},tasks:[{...oldTask,title:'Legacy DandF gallery',status:'paused'}],searches:[]}));
 await app.evaluate(({dialog,app},legacy)=>{if(!app.getPath('userData').includes('qa-'))throw Error('Legacy import fixture needs an isolated QA profile.');global.__oldDialogs={open:dialog.showOpenDialog,message:dialog.showMessageBox};dialog.showOpenDialog=async()=>({canceled:false,filePaths:[legacy]});dialog.showMessageBox=async()=>({response:1});},legacy);
 try{assert.equal(await invoke('session-import'),1);}finally{await app.evaluate(({dialog})=>{dialog.showOpenDialog=global.__oldDialogs.open;dialog.showMessageBox=global.__oldDialogs.message;delete global.__oldDialogs;});}
 const imported=await invoke('get-state');assert.equal(imported.tasks[0].title,'Legacy DandF gallery');assert.equal(imported.tasks[0].status,'paused');assert.equal(imported.prefs.workers,3);assert.equal(imported.prefs.artworkBrightness.suketto,100);assert.equal(await app.evaluate(({app})=>app.getName()),'FileFapper');record('FileFapper imports a legacy DandF session, preserves its task/preferences and supplies new brightness defaults');
 assert.deepEqual(errors,[]);const exe=process.env.DF_APP_EXE||path.join(root,'node_modules/electron/dist/electron.exe');fs.writeFileSync(path.join(qa,'sites-tags-report.json'),JSON.stringify({passed:true,version:require('../package.json').version,build:await page.locator('[data-build]').getAttribute('data-build'),packaged:!!process.env.DF_APP_EXE,executable:exe,executableSha256:crypto.createHash('sha256').update(fs.readFileSync(exe)).digest('hex'),checks,rendererErrors:errors,scope:'Actual app and native Edge with controlled search-page fixtures. Public gallery parsers are tested separately; no authenticated site claim.'},null,2));
 }catch(e){console.error(e);process.exitCode=1;}finally{if(app)await app.close();}})();
