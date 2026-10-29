'use strict';
const {_electron:electron}=require('playwright');
const {launchPackaged}=require('./launch_packaged.cjs');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),qa=path.resolve(process.env.DF_UPDATES_QA||path.join(root,'..','qa-updates-'+Date.now()));
fs.mkdirSync(qa,{recursive:true});
const png=fs.readFileSync(path.join(root,'assets/icon.png'));
const invoke=(p,name,...args)=>p.evaluate(({name,args})=>window.df.invoke(name,...args),{name,args});
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,message){const end=Date.now()+30000;while(Date.now()<end){if(await fn())return;await pause(100);}throw new Error(message);}
async function launch(){const options={cwd:root,env:{...process.env,DF_DATA_DIR:qa,DF_PYTHON:path.resolve(root,'..','build-venv/Scripts/python.exe')}};return process.env.DF_APP_EXE?launchPackaged(process.env.DF_APP_EXE,options):electron.launch({args:[root],...options,timeout:30000});}
async function heavyModules(app){return app.evaluate(()=>{const req=process.getBuiltinModule('module').createRequire(process.resourcesPath+'/app.asar/app/main.cjs');return Object.keys(req.cache).filter(p=>/[\\/]adblock\.cjs$/.test(p)||p.includes('@ghostery'));});}
(async()=>{
 let imageRequests=0;const checks=[],errors=[];
 const server=http.createServer((req,res)=>{imageRequests++;if(imageRequests===1){res.writeHead(429,{'Retry-After':'60'});res.end();}else{res.writeHead(200,{'Content-Type':'image/png','Content-Length':png.length});res.end(png);}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
 const plugin=path.join(qa,'request-options.py');
 fs.writeFileSync(plugin,`MANIFEST={'api':1,'id':'exhentai','name':'Local download preferences','version':'1.0','domains':['127.0.0.1']}
def resolve(url,ctx):
    return {'title':'Download preferences fixture','images':[{'url':url+'image.png','extension':'png'}],'metadata':{'fastResolve':ctx.request.get('fastResolve'),'bypassRateLimits':ctx.request.get('bypassRateLimits'),'effectiveDelay':ctx.delay}}
`);
 let app;
 try{
  const began=Date.now();app=await launch();let p=await app.firstWindow();p.on('pageerror',e=>errors.push(e.message));await p.waitForSelector('#task-list .empty-state');const startupMs=Date.now()-began;
  assert((await p.locator('.version').textContent()).includes('v1.0.0-Alpha'));
  assert.equal((await invoke(p,'browser-state')).runtimeReady,false);assert.deepEqual(await heavyModules(app),[]);
  checks.push('Version 1.0.0-Alpha starts with a lightweight browser snapshot and no heavy ad-block modules');
  await invoke(p,'set-prefs',{downloadDir:path.join(qa,'galleries'),autoStart:false,quality:'original',workers:1});
  await p.locator('[data-page="preferences"]').first().click();
  const fast=p.getByRole('switch',{name:'Faster E/Ex gallery resolution',exact:true}),skip=p.getByRole('switch',{name:'Skip automatic download cooldowns',exact:true});
  assert.equal(await fast.getAttribute('aria-checked'),'false');assert.equal(await skip.getAttribute('aria-checked'),'false');
  await fast.click();await until(async()=>(await invoke(p,'get-state')).prefs.fastResolve,'Fast preference did not save');assert.equal((await invoke(p,'get-state')).prefs.bypassRateLimits,false);
  checks.push('Both visible switches default off and fast resolution does not enable cooldown skipping');
  await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1});},plugin);
  await p.locator('[data-page="sites"]').first().click();await p.locator('[data-action="plugin-import"]').click();await p.waitForSelector('.plugin-row');
  for(const name of ['R34.app','Kurosearch','Rule34 React']){await p.locator('#site-filter').fill(name);assert.equal(await p.locator('#site-grid .site-card').count(),1);}
  await p.locator('#site-filter').fill('');assert.equal((await invoke(p,'get-sites')).length,40);assert.equal(await p.locator('#search-site option[value="r34react"]').count(),1);
  checks.push('All three frontend profiles appear separately in Sites and Search');
  await p.locator('[data-page="queue"]').first().click();await invoke(p,'add-urls',base);let snapshot=await invoke(p,'get-state'),task=snapshot.tasks[0];
  await invoke(p,'task-action',task.id,'play');await p.locator(`[data-task-row="${task.id}"] .status-label.waiting`).waitFor({timeout:30000});
  snapshot=await invoke(p,'get-state');task=snapshot.tasks[0];assert(task.retryAt>Date.now());assert.equal(task.metadata.fastResolve,true);assert.equal(task.metadata.bypassRateLimits,false);assert.equal(task.metadata.effectiveDelay,.05);assert.equal(imageRequests,1);
  checks.push('Fast preference reaches the real worker while HTTP 429 still enters Cooldown by default');
  await p.locator('[data-page="preferences"]').first().click();await skip.click();await until(async()=>(await invoke(p,'get-state')).prefs.bypassRateLimits,'Cooldown preference did not save');await fast.scrollIntoViewIfNeeded();await p.screenshot({path:path.join(qa,'download-switches.png')});
  imageRequests=0;await p.locator('[data-page="queue"]').first().click();await invoke(p,'task-action',task.id,'play');await p.locator(`[data-task-row="${task.id}"] .status-label.complete`).waitFor({timeout:30000});
  snapshot=await invoke(p,'get-state');task=snapshot.tasks[0];assert.equal(task.metadata.bypassRateLimits,true);assert.equal(task.quality,'original');assert.equal(imageRequests,2);assert(fs.readFileSync(task.files[0].path).equals(png));
  checks.push('Enabled cooldown skipping resumes through an existing cooldown and retries one transient 429');
  assert.equal((await invoke(p,'browser-state')).runtimeReady,false);
  await app.evaluate(async({session},image)=>{await session.fromPartition('persist:dandf-browser').protocol.handle('https',request=>{const u=new URL(request.url),post=u.hostname==='r34.app'?'/posts/rule34.xxx/123':u.hostname==='kurosearch.com'?'/post/123':'#/post/123';return new Response(`<!doctype html><title>Frontend fixture</title><main><h1>Source posts</h1><a href="https://rule34.xxx/index.php?page=post&amp;s=view&amp;id=123">Source post</a><a href="${post}">Duplicate frontend post</a><a href="https://evil.example/index.php?page=post&amp;s=view&amp;id=9">Off-site</a><img width="512" height="512" data-full-url="https://cdn.example/full.png" src="data:image/png;base64,${image}"></main>`,{headers:{'Content-Type':'text/html'}});});},png.toString('base64'));
  await p.locator('[data-page="browser"]').first().click();
  for(const url of ['https://r34.app/posts/rule34.xxx','https://kurosearch.com/','https://kurozenzen.github.io/r34-react/']){
    await invoke(p,'browser-navigate',url);await until(async()=>{const s=await invoke(p,'browser-state');return s.url===url&&!s.loading;},'Frontend fixture did not load');
    assert.equal((await invoke(p,'browser-state')).listing,'rule34');assert.equal((await p.locator('[data-action="browser-download"]').textContent()).trim(),'Queue galleries');
    const result=await invoke(p,'browser-galleries','inspect');assert.equal(result.rows.length,1);assert.equal(result.rows[0].url,'https://rule34.xxx/index.php?page=post&s=view&id=123');
    await invoke(p,'browser-galleries','refresh');
  }
  assert.equal((await invoke(p,'browser-state')).runtimeReady,true);assert((await heavyModules(app)).length>0);
  checks.push('Browser initializes on first use and loaded frontend source links deduplicate correctly');
  await invoke(p,'browser-action','capture');snapshot=await invoke(p,'get-state');const capture=snapshot.tasks.find(t=>t.capture);assert(capture);assert.deepEqual(capture.capture.images,[{url:'https://cdn.example/full.png'}]);
  checks.push('Frontend rendered capture keeps the declared full image source');
  await app.close();app=null;app=await launch();p=await app.firstWindow();await p.waitForSelector('.task-row');snapshot=await invoke(p,'get-state');assert(snapshot.prefs.fastResolve&&snapshot.prefs.bypassRateLimits);assert.equal((await invoke(p,'browser-state')).runtimeReady,false);assert.deepEqual(await heavyModules(app),[]);assert(snapshot.tasks.some(t=>t.status==='complete'));assert.deepEqual(errors,[]);
  checks.push('Preferences and completed tasks persist, and browser initialization stays deferred after restart');
  const report={passed:true,version:'1.0.0-Alpha',checks,startupMs,rendererErrors:errors,qaDir:qa};fs.writeFileSync(path.join(qa,'updates-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
 }finally{if(app)await app.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
