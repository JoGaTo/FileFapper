'use strict';
const {_electron:electron}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {launchPackaged}=require('./launch_packaged.cjs');
const themes=require('../app/theme-data.js');
const root=path.resolve(__dirname,'..'),qa=path.resolve(process.env.DF_QA_DIR||path.join(root,'..','qa-character-themes-'+Date.now()));
fs.mkdirSync(qa,{recursive:true});
const errors=[],checks=[],sizes=[];
const invoke=(p,name,...args)=>p.evaluate(({name,args})=>window.df.invoke(name,...args),{name,args});
const record=s=>{checks.push(s);console.log('PASS '+s);};
async function until(test,label){for(let i=0;i<100;i++){if(await test())return;await new Promise(r=>setTimeout(r,80));}throw new Error(label);}
async function open(){const options={cwd:root,env:{...process.env,DF_DATA_DIR:qa,DF_USE_BUNDLED:'1',DF_PYTHON:'C:\\DandF-test-no-external-python\\python.exe'}};return process.env.DF_APP_EXE?launchPackaged(process.env.DF_APP_EXE,options):electron.launch({args:[root],...options,timeout:30000});}
async function select(p,id){await p.locator(`.theme-shortcuts [data-theme-choice=${id}]`).click();await p.waitForFunction(id=>document.documentElement.dataset.theme===id,id);if(themes.artworkThemes.some(t=>t.id===id))await p.waitForFunction(()=>{const i=document.querySelector('#workspace-artwork-image');return i.complete&&i.naturalWidth>0;});}
const box=(p,s)=>p.locator(s).evaluate(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
function same(a,b){for(const k of ['x','y','w','h'])assert(Math.abs(a[k]-b[k])<1,JSON.stringify({a,b}));}
let app,p;
(async()=>{
 try{
  app=await open();p=await app.firstWindow();p.on('pageerror',e=>errors.push(e.message));
  await p.waitForSelector('#task-list .empty-state');
  await invoke(p,'set-prefs',{autoStart:false,downloadDir:path.join(qa,'galleries'),compactSidebar:true});
  await invoke(p,'add-urls',Array.from({length:8},(_,i)=>'dfdemo://sample/theme-'+i).join('\n'));
  const taskIds=(await invoke(p,'get-state')).tasks.map(t=>t.id);
  await p.locator('[data-page=preferences]').first().click();assert.equal(await p.locator('.theme-card').count(),18);
  assert.equal(await p.locator('.theme-card.artwork-card').count(),7);record('All eighteen themes share one picker with seven artwork cards and sidebar shortcuts');
  await p.locator('[data-page=queue]').first().click();
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1920,1080));
  for(const theme of themes.artworkThemes){
    await select(p,theme.id);assert(await p.locator('#artwork-tools').isVisible());
    assert.equal(await p.locator('#artwork-fit').inputValue(),theme.defaultFit);
    assert((await p.locator('#workspace-artwork-image').getAttribute('src')).endsWith(theme.artwork));
    const backdrop=await box(p,'#workspace-artwork'),canvas=await box(p,'.workspace-canvas');same(backdrop,canvas);
    const main=await box(p,'#main');assert(backdrop.h>main.h,'Artwork includes toolbar and main workspace');
    await p.screenshot({path:path.join(qa,theme.id+'-less.png')});
  }
  record('All seven approved images decode and span the whole workspace, with baseball medium-full and the eleven-character club full-image by default');
  await select(p,'asagi');const backdrop=await box(p,'#workspace-artwork');const widths=[];
  for(const width of ['less','more','full']){
    await p.locator(`button[data-artwork-width=${width}]`).click();await p.waitForFunction(w=>document.body.dataset.artworkWidth===w,width);
    widths.push((await box(p,'.queue-layout')).w);same(await box(p,'#workspace-artwork'),backdrop);
  }
  assert(widths[0]<widths[1]&&widths[1]<widths[2]);record('Less, More and Full width resize the queue without moving or resizing the artwork');
  await p.locator('#artwork-fit').selectOption('full');await p.waitForFunction(()=>document.body.dataset.artworkFit==='full');
  await select(p,'survival');assert.equal(await p.locator('#artwork-fit').inputValue(),'fill');
  await select(p,'asagi');assert.equal(await p.locator('#artwork-fit').inputValue(),'full');
  await select(p,'suketto');assert.equal(await p.locator('#artwork-fit').inputValue(),'medium');
  await p.locator('#artwork-fit').selectOption('full');await p.waitForFunction(()=>document.body.dataset.artworkFit==='full');
  assert.equal(await p.locator('#workspace-artwork-image').evaluate(e=>getComputedStyle(e).objectFit),'contain');
  await p.locator('#artwork-fit').selectOption('medium');await p.waitForFunction(()=>document.body.dataset.artworkFit==='medium');
  record('Framing is remembered per template; Show full image contains the image, and baseball can return to Medium full shot');
  const newFits={fantasy_witch:'full',mother_daughter:'full',fantasy_club:'fill'};
  for(const [id,fit] of Object.entries(newFits)){
    await select(p,id);await p.locator('#artwork-fit').selectOption(fit);await until(async()=>(await invoke(p,'get-state')).prefs.artworkFits[id]===fit,'New template framing did not save: '+id);
  }
  for(const [id,fit] of Object.entries(newFits)){await select(p,id);assert.equal(await p.locator('#artwork-fit').inputValue(),fit);}
  await p.locator('#artwork-only').click();assert.equal(await p.locator('#page-queue').evaluate(e=>e.inert),true);
  await select(p,'fantasy_witch');assert.equal(await p.locator('#page-queue').evaluate(e=>e.inert),false);
  await p.locator('#artwork-only').click();await p.locator('[data-page=preferences]').first().click();
  assert.equal(await p.locator('#page-queue').evaluate(e=>e.inert),false);assert(!await p.locator('#artwork-tools').isVisible());
  await p.locator('[data-page=queue]').first().click();await select(p,'suketto');
  record('The three added templates retain separate framing; changing template or page restores queue access after Artwork only');
  await p.locator('#artwork-opacity').fill('83');await p.locator('#artwork-opacity').dispatchEvent('change');
  await until(async()=>(await invoke(p,'get-state')).prefs.artworkOpacity===83,'Opacity did not save');
  assert.equal(await p.locator('.task-title').first().evaluate(e=>getComputedStyle(e).opacity),'1');
  assert.equal(await p.locator('#artwork-opacity-value').textContent(),'83%');
  await p.locator('#artwork-only').click();assert.equal(await p.locator('#page-queue').evaluate(e=>e.inert),true);
  assert.equal(await p.locator('#page-queue').evaluate(e=>getComputedStyle(e).visibility),'hidden');
  await p.keyboard.press('Escape');assert.equal(await p.locator('#page-queue').evaluate(e=>e.inert),false);
  assert.equal((await invoke(p,'get-state')).tasks.length,8);record('Opacity affects panel backgrounds while text stays opaque; Artwork only and Escape restore queue access without changing tasks');
  for(const width of [1120,1500,1920]){
    await app.evaluate(({BrowserWindow},w)=>BrowserWindow.getAllWindows()[0].setSize(w,1000),width);
    await p.locator('button[data-artwork-width=less]').click();await p.waitForFunction(()=>document.body.dataset.artworkWidth==='less');
    const metrics=await p.evaluate(()=>{const image=document.querySelector('#workspace-artwork-image'),canvas=document.querySelector('.workspace-canvas'),queue=document.querySelector('.queue-layout'),row=document.querySelector('.task-row'),bar=document.querySelector('.address-footer');return {width:innerWidth,overflow:document.documentElement.scrollWidth>innerWidth,imageWidth:image.clientWidth,imageHeight:image.clientHeight,sourceRatio:image.naturalWidth/image.naturalHeight,canvasHeight:canvas.clientHeight,queueWidth:queue.clientWidth,rowOverflow:row.scrollWidth>row.clientWidth,addressOverflow:bar.scrollWidth>bar.clientWidth};});
    assert(!metrics.overflow&&!metrics.rowOverflow&&!metrics.addressOverflow,JSON.stringify(metrics));
    assert(Math.abs(metrics.imageWidth/metrics.imageHeight-metrics.sourceRatio)<.003);assert(Math.abs(metrics.imageHeight/metrics.canvasHeight-1.12)<.01);sizes.push(metrics);
    await p.screenshot({path:path.join(qa,'baseball-'+width+'.png')});
  }
  record('The medium-full image keeps its proportions and the narrow queue fits at 1120, 1500 and 1920 pixels');
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1120,760));
  await p.locator('.queue-main').evaluate(e=>{e.scrollTop=e.scrollHeight;});
  const shortQueue=await box(p,'.queue-main'),shortFoot=await box(p,'.queue-foot');assert(shortFoot.y+shortFoot.h<=shortQueue.y+shortQueue.h+1);
  await p.locator('.sidebar').evaluate(e=>{e.scrollTop=e.scrollHeight;});
  const sidebar=await box(p,'.sidebar'),lastDot=await box(p,`.theme-shortcuts [data-theme-choice=${themes.list.at(-1).id}]`);assert(lastDot.y+lastDot.h<=sidebar.y+sidebar.h);
  await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1920,1000));await p.locator('.queue-main').evaluate(e=>{e.scrollTop=0;});
  record('At the minimum 1120 × 760 window, the queue and sidebar scroll to keep controls and the last theme reachable');
  await p.locator('[data-action=queue-details]').click();assert(await p.locator('#inspector').isVisible());
  await p.locator('[data-action=queue-details]').click();
  const rows=p.locator('[data-task-row]');await rows.nth(0).click();await rows.nth(2).click({modifiers:['Control']});assert.equal(await p.locator('[data-check]:checked').count(),2);
  await p.locator('[data-action=deselect]').click();await rows.first().click({button:'right'});assert(await p.getByRole('menuitem',{name:'Gallery metadata',exact:true}).isVisible());await p.keyboard.press('Escape');
  await p.locator('#task-filter').fill('theme-4');assert.equal(await p.locator('[data-task-row]').count(),1);await p.locator('#task-filter').fill('');
  await p.locator('#view-icons').click();assert.equal(await p.locator('.gallery-card').count(),8);await p.locator('#view-list').click();
  await p.locator(`[data-task-row="${taskIds[2]}"]`).click({button:'right'});await p.getByRole('menuitem',{name:'Move up in queue',exact:true}).click();
  assert.equal((await invoke(p,'get-state')).tasks[1].id,taskIds[2]);
  record('Task details, multi-selection, right-click actions, filtering, icon/list views and reordering work over the template');
  await invoke(p,'task-action',taskIds[0],'play');await until(async()=>(await invoke(p,'get-state')).tasks.find(t=>t.id===taskIds[0]).status==='complete','Bundled sample download did not finish');
  const downloaded=await invoke(p,'get-state');assert.equal(downloaded.tasks.find(t=>t.id===taskIds[0]).files.length,12);if(process.env.DF_APP_EXE)assert.equal(downloaded.engine.bundled,true);
  await p.locator(`[data-task-row="${taskIds[0]}"]`).dblclick();await p.waitForSelector('.preview-canvas img');await p.waitForFunction(()=>document.querySelector('.preview-canvas img').naturalWidth>0);await p.keyboard.press('Escape');record('The real bundled downloader completes a local gallery and opens its preview with artwork active');
  for(const t of themes.list.filter(t=>!t.artwork)){
    await select(p,t.id);assert(!await p.locator('#artwork-tools').isVisible());assert(!await p.locator('#workspace-artwork').isVisible());
    const layout=await box(p,'.queue-layout'),main=await box(p,'#main');assert(layout.w>main.w*.9);
  }
  await p.locator('[data-page=browser]').first().click();await p.waitForSelector('#browser-host');
  await p.locator('[data-page=preferences]').first().click();
  const contrast={};
  for(const theme of themes.artworkThemes){
    await p.locator(`.theme-card[data-theme-choice=${theme.id}]`).click();await p.waitForFunction(id=>document.documentElement.dataset.theme===id,theme.id);
    await p.waitForFunction(()=>{const images=[...document.querySelectorAll('.artwork-card img'),document.querySelector('#workspace-artwork-image')];return images.every(i=>i.complete&&i.naturalWidth>0);});
    contrast[theme.id]=await p.evaluate(()=>{const s=getComputedStyle(document.documentElement),lum=n=>{const x=s.getPropertyValue(n).trim().slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*x[0]+.7152*x[1]+.0722*x[2];};return Math.min(...['--text','--secondary','--muted'].flatMap(f=>['--bg','--surface','--surface2','--sidebar'].map(b=>(Math.max(lum(f),lum(b))+.05)/(Math.min(lum(f),lum(b))+.05))));});assert(contrast[theme.id]>=4.5,theme.id+' text contrast '+contrast[theme.id]);
  }
  await p.screenshot({path:path.join(qa,'appearance-picker.png')});
  record('Every ordinary theme restores the usual queue; all seven artwork palettes meet 4.5:1 text contrast and pages remain accessible');
  await p.locator('[data-page=queue]').first().click();await select(p,'fantasy_club');await p.locator('button[data-artwork-width=more]').click();
  const expected=(await invoke(p,'get-state')).prefs,sessionFile=path.join(qa,'theme-session.json');
  await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},sessionFile);
  await invoke(p,'session-export');const saved=JSON.parse(fs.readFileSync(sessionFile));assert.deepEqual(saved.prefs,expected);
  await invoke(p,'set-prefs',{theme:'light',artworkOpacity:100,artworkQueueWidth:'full'});
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1});},sessionFile);
  await invoke(p,'session-import');await p.waitForFunction(()=>document.documentElement.dataset.theme==='fantasy_club');assert.deepEqual((await invoke(p,'get-state')).prefs,expected);record('Session export/import restores the new club template, queue size, opacity and all seven individual framing choices');
  await p.locator('#artwork-only').click();await app.close();app=await open();p=await app.firstWindow();p.on('pageerror',e=>errors.push(e.message));await p.waitForSelector('[data-task-row]');
  assert.deepEqual((await invoke(p,'get-state')).prefs,expected);assert.equal(await p.locator('#artwork-only').textContent(),'Artwork only');assert.equal(await p.locator('#page-queue').evaluate(e=>e.inert),false);
  assert.deepEqual((await invoke(p,'get-state')).tasks.map(t=>t.id),saved.tasks.map(t=>t.id));record('Restart retains theme layout and queue order while restoring access to the queue');
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(qa,'theme-report.json'),JSON.stringify({passed:true,version:require('../package.json').version,packaged:!!process.env.DF_APP_EXE,checks,sizes,artworkTextContrast:contrast,rendererErrors:errors},null,2));
  console.log(JSON.stringify({passed:true,checks:checks.length,qa}));
 }catch(e){if(p)await p.screenshot({path:path.join(qa,'failure.png')}).catch(()=>{});fs.writeFileSync(path.join(qa,'failure.txt'),e.stack);throw e;}
 finally{await app?.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
