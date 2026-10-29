const {_electron:electron}=require('playwright');
const path=require('node:path');
const fs=require('node:fs');
const assert=require('node:assert/strict');
const http=require('node:http');
const {launchPackaged}=require('./launch_packaged.cjs');
const root=path.resolve(__dirname,'..');
const qa=process.env.DF_QA_DIR?path.resolve(process.env.DF_QA_DIR):path.resolve(root,'..','qa-'+Date.now());
fs.mkdirSync(qa,{recursive:true});
const output=path.resolve(root,'..','..','outputs');
const errors=[];
async function waitFor(page,predicate,timeout=30000){await page.waitForFunction(predicate,null,{timeout});}
async function invoke(page,name,...args){return page.evaluate(async({name,args})=>window.df.invoke(name,...args),{name,args});}
async function launch(){
  const localPython=path.join(root,'.venv','Scripts','python.exe');
  const options={cwd:root,env:{...process.env,DF_DATA_DIR:qa,DF_PYTHON:process.env.DF_PYTHON||(fs.existsSync(localPython)?localPython:path.resolve(root,'..','build-venv','Scripts','python.exe'))}};
  if(process.env.DF_APP_EXE)return launchPackaged(process.env.DF_APP_EXE,options);
  return await electron.launch({args:[root],...options,timeout:30000});
}
(async()=>{
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html');res.setHeader('Set-Cookie','df_fixture=working; Path=/; HttpOnly');res.end('<!doctype html><html><title>D&F browser test</title><body style="background:#f7f6fb;font-family:Segoe UI;padding:60px"><h1>Your browser is connected.</h1><p>A local page for testing D&F browsing and cookie sync.</p></body></html>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let app;
  try{
    app=await launch();let page=await app.firstWindow();
    page.on('pageerror',e=>errors.push(e.message));
    await page.waitForSelector('#task-list .empty-state');
    await invoke(page,'set-prefs',{downloadDir:path.join(qa,'galleries'),autoStart:false,workers:1});
    await page.screenshot({path:path.join(qa,'01-empty.png')});
    await page.locator('#urls').fill('dfdemo://sample/design?sampleDelay=0.7\ndfdemo://sample/afternoon\ndfdemo://sample/next');
    await page.locator('#add-workers').selectOption('1');
    await page.locator('#add-urls').click();
    await page.waitForSelector('.task-row');
    let snapshot=await invoke(page,'get-state');assert.equal(snapshot.tasks.length,3);assert(snapshot.tasks.every(t=>t.status==='paused'));
    const ids=snapshot.tasks.map(t=>t.id);
    await page.locator(`[data-task-row="${ids[2]}"]`).click({button:'right'});
    await page.getByRole('menuitem',{name:'Move up in queue'}).click();
    snapshot=await invoke(page,'get-state');assert.deepEqual(snapshot.tasks.map(t=>t.id),[ids[0],ids[2],ids[1]]);
    await page.locator('#task-filter').fill('dfdemo://sample/afternoon');assert.equal(await page.locator('.task-row').count(),1);
    await page.locator('#task-filter').fill('');
    await page.locator(`[data-task-row="${ids[0]}"] [data-task-action="play"]`).click();
    await waitFor(page,()=>document.querySelector('.task-row .status-label.downloading'));
    await page.locator(`[data-task-row="${ids[0]}"] [data-task-action="pause"]`).click();
    snapshot=await invoke(page,'get-state');assert.equal(snapshot.tasks.find(t=>t.id===ids[0]).status,'paused');
    await page.locator(`[data-task-row="${ids[0]}"] [data-task-action="play"]`).click();
    await waitFor(page,()=>document.querySelector('.task-row .status-label.complete'));
    snapshot=await invoke(page,'get-state');let task=snapshot.tasks.find(t=>t.id===ids[0]);assert.equal(task.files.length,12);assert.equal(task.done,12);assert(fs.existsSync(path.join(task.folder,'gallery.json')));
    await page.locator(`[data-task-row="${ids[0]}"]`).dblclick();
    await page.waitForSelector('.preview-canvas img');assert.equal(await page.locator('.preview-canvas img').evaluate(img=>img.complete&&img.naturalWidth>0),true);
    await page.getByRole('button',{name:'Next',exact:true}).click();assert((await page.locator('.preview-controls span').textContent()).includes('File 2'));
    await page.keyboard.press('Escape');
    await page.locator('#view-icons').click();await page.waitForSelector('.gallery-card');assert.equal(await page.locator('.gallery-card').count(),3);
    await page.locator('#view-list').click();await page.waitForSelector('.task-row');
    await page.locator('[data-page="preferences"]').first().click();
    for(const theme of ['dark','black','brown','light']){await page.locator(`.theme-card[data-theme-choice="${theme}"]`).click();await page.waitForFunction(t=>document.documentElement.dataset.theme===t,theme);await page.screenshot({path:path.join(qa,`theme-${theme}.png`)});}
    await page.locator('[data-toggle="hideThumbnails"]').click();assert.equal((await invoke(page,'get-state')).prefs.hideThumbnails,true);
    await page.locator('[data-toggle="hideThumbnails"]').click();
    await page.locator('[data-action="diagnostics"]').click();await page.waitForFunction(()=>document.querySelector('#engine-status').textContent.includes('Engine ready'));
    // Native dialogs are mocked only in this test process, so the UI flows and
    // actual file serialization/import run without user interaction.
    const sessionFile=path.join(qa,'session-export.json');
    await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},sessionFile);
    await page.locator('[data-page="queue"]').first().click();await page.locator('[data-action="session-export"]').click();
    await page.waitForFunction(()=>document.querySelector('#toast-stack').textContent.includes('Session saved'));
    assert(fs.existsSync(sessionFile));assert(!fs.readFileSync(sessionFile,'utf8').includes('cookieSummary'));
    await page.locator('[data-page="cookies"]').first().click();
    await page.locator('#cookie-text').fill(JSON.stringify([{domain:'.example.com',name:'auth',value:'fixture-secret',secure:true,httpOnly:true}]));
    await page.locator('#cookies-paste').click();await page.waitForSelector('[data-cookie-remove=".example.com"]');
    assert(fs.existsSync(path.join(qa,'cookies.bin')));assert(!fs.readFileSync(path.join(qa,'cookies.bin')).includes(Buffer.from('fixture-secret')));
    const local=`http://127.0.0.1:${server.address().port}/`;
    await page.locator('[data-page="browser"]').first().click();await page.locator('#browser-url').fill(local);await page.locator('#browser-go').click();
    await page.waitForFunction(()=>document.querySelector('#browser-message').textContent.includes('D&F browser test'));
    await page.locator('[data-action="cookies-sync"]').click();
    snapshot=await invoke(page,'get-state');assert(snapshot.cookieSummary.some(c=>c.domain==='127.0.0.1'));
    const browserContents=await app.evaluate(({webContents})=>webContents.getAllWebContents().filter(w=>w.getURL().startsWith('http://127.0.0.1')).map(w=>({url:w.getURL(),node:w.getLastWebPreferences().nodeIntegration,preload:w.getLastWebPreferences().preload,sandbox:w.getLastWebPreferences().sandbox})));
    assert(browserContents.length);assert.equal(browserContents[0].node,false);assert.equal(browserContents[0].sandbox,true);assert(!browserContents[0].preload);
    const pluginPath=path.join(qa,'fixture_site.py');fs.writeFileSync(pluginPath,"MANIFEST={'api':1,'id':'fixture','name':'Local Test Site','version':'1.0','domains':['127.0.0.1']}\ndef resolve(url, context):\n    raise ValueError('Local script is connected')\n");
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1});},pluginPath);
    await page.locator('[data-page="sites"]').first().click();await page.locator('[data-action="plugin-import"]').click();await page.waitForSelector('.plugin-row');
    await invoke(page,'add-urls',local+'gallery');snapshot=await invoke(page,'get-state');let plugTask=snapshot.tasks.find(t=>t.siteId==='fixture');assert(plugTask);
    await page.locator('[data-page="queue"]').first().click();
    await invoke(page,'task-action',plugTask.id,'play');
    await page.locator(`[data-task-row="${plugTask.id}"] .status-label.error`).waitFor({timeout:30000});snapshot=await invoke(page,'get-state');assert.equal(snapshot.tasks.find(t=>t.id===plugTask.id).error,'Local script is connected');
    await invoke(page,'task-action',plugTask.id,'remove');
    // Load the saved session through the native dialog flow, then prove it
    // replaced the current queue and paused pending tasks.
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},sessionFile);
    await page.locator('[data-page="queue"]').first().click();await page.locator('[data-action="session-import"]').click();
    await page.waitForFunction(()=>document.querySelector('#toast-stack').textContent.includes('Session loaded'));
    snapshot=await invoke(page,'get-state');assert.equal(snapshot.tasks.length,3);assert.equal(snapshot.tasks.filter(t=>t.status==='complete').length,1);
    await page.locator(`[data-task-row="${ids[0]}"]`).click();
    await page.locator('#toast-stack').evaluate(el=>el.replaceChildren());
    await page.screenshot({path:path.join(qa,'02-populated.png')});
    fs.mkdirSync(output,{recursive:true});fs.copyFileSync(path.join(qa,'02-populated.png'),path.join(output,'DandF-preview.png'));
    // Resize down to the supported minimum and check the workspace for overflow.
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1080,720));
    await page.waitForTimeout(250);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    await page.screenshot({path:path.join(qa,'03-minimum-size.png')});
    await app.close();app=null;
    app=await launch();page=await app.firstWindow();await page.waitForSelector('.task-row');snapshot=await invoke(page,'get-state');assert.equal(snapshot.tasks.length,3);assert.equal(snapshot.tasks[0].id,ids[0]);assert(snapshot.cookieSummary.some(c=>c.domain==='.example.com'));
    assert.deepEqual(errors,[]);
    const report={passed:true,checks:['Multiline URL entry and paused defaults','Task menu reorder and text filtering','Real engine pause/resume, metadata and 12 image files','Local image protocol and page preview','List/icon views and four themes','Persisted workspace toggles and engine diagnostics','Session export/import','Encrypted cookie import and scoped browser sync','Sandboxed embedded Chromium browser','Plugin import, execution, and error isolation','Minimum window size','Restart restores queue order and encrypted cookies'],qaDir:qa,rendererErrors:errors};
    fs.writeFileSync(path.join(qa,'ui-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{if(app)await app.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
