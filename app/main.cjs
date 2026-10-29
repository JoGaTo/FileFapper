const {app,BrowserWindow,WebContentsView,ipcMain,dialog,shell,clipboard,session,protocol,net,safeStorage,Menu,nativeImage} = require('electron');
const fs=require('node:fs');
const fsp=require('node:fs/promises');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {spawn}=require('node:child_process');
const readline=require('node:readline');
const crypto=require('node:crypto');
const core=require('./core.cjs');
const cookieTools=require('./cookies.cjs');
const galleryLists=require('./gallery-lists.cjs');
const {BrowserWorkspace}=require('./browser.cjs');
const {editItems,addressUrl}=require('./edit-menu.cjs');
const {AccountVault}=require('./accounts.cjs');
const {fillLoginForm}=require('./login-form.cjs');
const {restoreContentFocus}=require('./focus.cjs');
app.setName('FileFapper');
const testMode=!!process.env.DF_DATA_DIR;
app.setPath('userData',require('./profile.cjs').profilePath({appData:app.getPath('appData'),override:process.env.DF_DATA_DIR}));
protocol.registerSchemesAsPrivileged([{scheme:'dfmedia',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
let win,browser,browserSession,state,accounts,vault=[],cookieStatus=null,saver,cookieSaver,quitting=false,clipboardTimer,lastClipboard='',lastError='';
const active=new Map();
const folderOperations=new Set();
const transient=new Set();
const siteCooldowns=new Map();
const accessBlocks=new Map();
const networkStarts=new (require('./worker-start-gate.cjs').WorkerStartGate)({settled:()=>setTimeout(pump,30)});
let lastTick=0;
const uiPath=path.join(__dirname,'index.html');
const dataDir=()=>app.getPath('userData');
const statePath=()=>path.join(dataDir(),'state.json');
function atomic(file,data){fs.mkdirSync(path.dirname(file),{recursive:true});const tmp=file+'.tmp';fs.writeFileSync(tmp,data);fs.renameSync(tmp,file);}
function save(){if(!state)return;atomic(statePath(),JSON.stringify({version:1,...state},null,2));}
function scheduleSave(){clearTimeout(saver);saver=setTimeout(()=>{try{save();}catch(e){lastError='Could not save your session: '+e.message;toast(lastError);}},250);}
function cleanSnapshot(){return {...state,cookieSummary:cookieSummary(),cookieStatus,accountSummary:accounts?.summary()||[],accountError:accounts?.error||'',engine:{bundled:app.isPackaged,active:active.size},lastError};}
function send(channel,payload){if(win&&!win.isDestroyed())win.webContents.send(channel,payload);}
function changed(){send('state',cleanSnapshot());scheduleSave();}
let workerUpdateTimer;
function workerChanged(){if(workerUpdateTimer)return;workerUpdateTimer=setTimeout(()=>{workerUpdateTimer=null;changed();},120);workerUpdateTimer.unref?.();}
function toast(message){send('toast',message);}
function cookieSummary(){const groups={};for(const c of vault){if(c.expirationDate&&c.expirationDate<Date.now()/1000)continue;groups[c.domain]=(groups[c.domain]||0)+1;}return Object.entries(groups).map(([domain,count])=>({domain,count}));}
function saveVault(){if(!safeStorage.isEncryptionAvailable())throw new Error('Windows credential encryption is unavailable. Cookies will remain in memory for this session.');atomic(path.join(dataDir(),'cookies.bin'),safeStorage.encryptString(JSON.stringify(vault)));}
function scopedCookies(url){const host=new URL(url).hostname;return cookieTools.liveCookies(vault,{skipInvalid:true}).filter(c=>core.domainMatches(host,c.domain));}
function loadState(){
  const defaults={prefs:core.preferences({},path.join(app.getPath('downloads'),'FileFapper')),tasks:[],plugins:[],searches:[]};
  try{const j=JSON.parse(fs.readFileSync(statePath(),'utf8'));state={...defaults,prefs:core.preferences(j.prefs,defaults.prefs.downloadDir),tasks:core.restoreTasks(j.tasks||[]),plugins:Array.isArray(j.plugins)?j.plugins.filter(p=>p.id&&p.path&&fs.existsSync(p.path)):[],searches:Array.isArray(j.searches)?j.searches.slice(0,20):[],browser:j.browser||{}};
    if(state.prefs.resumeOnLaunch)for(const t of state.tasks)if(t.resumeAfterExit){t.status='queued';delete t.resumeAfterExit;}
  }catch(e){state=defaults;if(fs.existsSync(statePath())){fs.copyFileSync(statePath(),statePath()+'.recovered-'+Date.now());lastError='A damaged session was backed up. FileFapper started with a new queue.';}}
  for(const t of state.tasks)if(t.retryAt>Date.now())siteCooldowns.set(t.siteId,Math.max(t.retryAt,siteCooldowns.get(t.siteId)||0));
  try{const file=path.join(dataDir(),'cookies.bin');if(fs.existsSync(file)&&safeStorage.isEncryptionAvailable()){
    let invalid=0;const rows=cookieTools.liveCookies(JSON.parse(safeStorage.decryptString(fs.readFileSync(file))),{skipInvalid:true,onInvalid:()=>invalid++});
    vault=[...new Map(rows.map(c=>[cookieTools.cookieKey(c),c])).values()];
    if(invalid)lastError=`${invalid} saved cookie entries had invalid attributes. Import a fresh export to restore them.`;
  }}catch{lastError='Saved cookies could not be decrypted. Import them again.';}
  accounts=new AccountVault(path.join(dataDir(),'accounts.bin'),safeStorage).load();
}
async function fillSavedLogin(w,options={}){
  if(!w||w.isDestroyed()||!Array.from(browser?.views.values()||[]).some(v=>v.webContents===w))throw new Error('Open the site’s sign-in page in Browser first.');
  const row=accounts.forUrl(w.getURL(),options);
  if(!row){if(options.automatic)return {filled:false};throw new Error('Save a login for this exact HTTPS site in Cookies & accounts. If several accounts are saved, choose Fill from that account’s row.');}
  const result=await w.executeJavaScriptInIsolatedWorld(1001,[{code:`(${fillLoginForm.toString()})(${JSON.stringify({origin:row.origin,username:row.username,password:row.password})},${!!options.automatic})`}]);
  if(result?.filled&&options.automatic)toast(result.message);return result;
}
function rememberBrowserCookie(cookie,removed){
  let row;try{row=cookieTools.normalizeCookie(cookie,{includeExpired:true});}catch{return;}
  const key=cookieTools.cookieKey;
  const own=Array.from(browser?.views.values()||[]).some(v=>{const url=v.webContents.getURL();try{const u=new URL(url);return core.domainMatches(u.hostname,cookie.domain)&&(core.siteFor(url,state.plugins.filter(p=>p.enabled!==false))||accounts.summary().some(a=>a.origin===u.origin));}catch{return false;}});
  if(!own)return;
  vault=vault.filter(c=>key(c)!==key(row)||(removed&&c.hostOnly!==row.hostOnly));if(!removed&&cookieTools.normalizeCookie(row))vault.push(row);
  clearTimeout(cookieSaver);cookieSaver=setTimeout(()=>{try{saveVault();}catch{}changed();},400);cookieSaver.unref();
}
function pluginFor(url){return core.siteFor(url,state.plugins.filter(p=>p.enabled!==false));}
function workerCommand(){
  if(app.isPackaged)return {exe:path.join(process.resourcesPath,'engine','df-engine.exe'),args:[]};
  const bundled=path.join(__dirname,'..','engine-dist','df-engine','df-engine.exe');
  if(process.env.DF_USE_BUNDLED&&fs.existsSync(bundled))return {exe:bundled,args:[]};
  const localPython=path.resolve(__dirname,'..','.venv','Scripts','python.exe');
  const python=process.env.DF_PYTHON||(fs.existsSync(localPython)?localPython:path.resolve(__dirname,'..','..','build-venv','Scripts','python.exe'));
  return {exe:fs.existsSync(python)?python:'python',args:['-u',path.join(__dirname,'..','engine','engine.py')]};
}
function runWorker(request,onEvent){
  const cmd=workerCommand();
  const child=spawn(cmd.exe,cmd.args,{windowsHide:true,stdio:['pipe','pipe','pipe'],env:{...process.env,PYTHONIOENCODING:'utf-8'}});
  child.stderr.on('data',()=>{}); // Never expose raw site responses or credentials.
  const lines=readline.createInterface({input:child.stdout});
  lines.on('line',line=>{try{onEvent(JSON.parse(line));}catch(e){if(e instanceof SyntaxError)return;toast(e.message);}});
  child.stdin.on('error',()=>{});
  child.stdin.end(JSON.stringify(request)+'\n');
  return child;
}
function onceWorker(request){return new Promise((resolve,reject)=>{
  let value,failed=false;
  const child=runWorker(request,e=>{if(e.event==='error'){failed=true;reject(new Error(e.message));}else value=e;});
  transient.add(child);
  const timeout=setTimeout(()=>{child.kill();reject(new Error('This request timed out. Open the site in Browser or try again.'));},120000);
  child.on('error',e=>{failed=true;reject(e);});
  child.on('exit',code=>{clearTimeout(timeout);transient.delete(child);if(!failed){if(code===0&&value)resolve(value);else reject(new Error('The site worker exited without a result.'));}});
});}
function startTask(task,mode='download',force=false,browserReady=false){
  if(active.has(task.id)||networkStarts.has(task.id)||folderOperations.has(task.id))return;
  const blocked=accessBlocks.get(new URL(task.url).hostname);
  if(blocked){task.status='paused';task.errorKind='access';task.error=blocked;changed();return;}
  task.previewOnly=mode==='preview';task.forceNext=!!(force||task.forceNext);
  if(active.size+networkStarts.size>=state.prefs.concurrentTasks){task.status='queued';changed();return;}
  const cool=Math.max(siteCooldowns.get(task.siteId)||0,task.retryAt||0);
  if(cool>Date.now()&&!state.prefs.bypassRateLimits){task.status='waiting';task.retryAt=cool;changed();return;}
  if(browserSession.isEdge&&!task.url.startsWith('dfdemo:')&&!browserReady){
    task.status='resolving';task.error='';task.transferNote='Preparing '+browserSession.engine+' session…';changed();
    networkStarts.run(task.id,()=>browserSession.prepareForWorker(),()=>{if(!quitting&&state.tasks.includes(task)&&task.status==='resolving'){task.transferNote='';startTask(task,mode,force,true);}},error=>{if(!quitting&&state.tasks.includes(task)){task.status='error';task.transferNote='';task.error='The '+browserSession.engine+' session could not start: '+error.message;task.errorKind='browser';changed();}});return;
  }
  const found=pluginFor(task.url);
  const plugin=state.plugins.find(p=>p.id===found?.id&&p.enabled!==false);
  force=task.forceNext;delete task.forceNext;
  task.status='resolving';task.error='';task.errorKind='';task.challenge=false;task.transferNote='';task.speed=0;task.retryAt=0;
  if(force){task.done=0;task.files=[];task.bytes=0;}
  const req={mode,id:task.id,url:task.url,siteId:task.siteId,siteName:task.site,folder:task.folder,downloadDir:state.prefs.downloadDir,
    quality:task.quality,workers:task.workers,delay:state.prefs.delay,speedLimit:state.prefs.speedLimit,
    repair:state.prefs.repair,upscale:task.upscale||1,upscaleMethod:task.upscaleMethod||'waifu2x',upscaleDenoise:task.upscaleDenoise||'off',upscaleDevice:task.upscaleDevice||'auto',maxPosts:state.prefs.maxPosts,fastResolve:state.prefs.fastResolve,bypassRateLimits:state.prefs.bypassRateLimits,capture:task.capture,captureRoot:path.join(dataDir(),'browser-captures'),cookies:task.url.startsWith('dfdemo:')?[]:task.capture?vault.filter(c=>[task.url,...task.capture.images.map(i=>i.url).filter(Boolean)].some(u=>core.domainMatches(new URL(u).hostname,c.domain))):scopedCookies(task.url),userAgent:browserSession.getUserAgent(),plugin:plugin?.path,force};
  let finished=false;
  const child=runWorker(req,e=>{
    if(active.get(task.id)!==child||quitting)return;
    if(e.event==='metadata'){
      if(e.title)task.title=e.title;
      if(e.metadata)task.metadata=e.metadata;
      if(e.total)task.total=e.total;
      if(e.folder)task.folder=e.folder;
    }else if(e.event==='progress'){
      task.status='downloading';Object.assign(task,{done:e.done,total:e.total,bytes:e.bytes,speed:e.speed});
    }else if(e.event==='source-retry'){
      task.transferNote=e.message;
    }else if(e.event==='file'){
      task.transferNote='';
      task.files=task.files.filter(f=>f.index!==e.index);task.files.push({name:e.name,path:e.path,index:e.index,bytes:e.bytes,repaired:!!e.repaired,upscale:e.upscale||1,originalPath:e.originalPath||'',enhancement:e.enhancement||'',mediaKind:e.mediaKind||'image',previewPath:e.previewPath||'',companions:e.companions||[],note:e.note||''});task.files.sort((a,b)=>a.index-b.index);
    }else if(e.event==='complete'){
      finished=true;task.status=e.preview?'paused':'complete';task.done=e.done;task.total=e.total;task.folder=e.folder;task.speed=0;
      if(!e.preview)task.completedAt=new Date().toISOString();
    }else if(e.event==='error'){
      finished=true;task.status=e.kind==='rate_limit'?'waiting':e.kind==='access'?'paused':'error';task.error=e.message;task.errorKind=e.kind;task.challenge=!!e.challenge;task.speed=0;
      if(e.kind==='access'){
        const host=new URL(task.url).hostname;accessBlocks.set(host,e.message);
        for(const other of state.tasks)if(other.id!==task.id&&new URL(other.url).hostname===host&&['queued','resolving','downloading'].includes(other.status)){pauseTask(other);other.errorKind='access';other.challenge=!!e.challenge;other.error='This site needs a sign-in or access check. Open it in Browser, then choose Sync & resume.';}
      }
      if(e.kind==='rate_limit'){
        const until=Date.now()+Math.max(1000,(e.retryAfter||60)*1000);task.retryAt=until;siteCooldowns.set(task.siteId,until);
        for(const other of state.tasks){if(other.siteId===task.siteId&&other.id!==task.id&&active.has(other.id)){pauseTask(other,'waiting');other.retryAt=until;other.error='Server cooldown is active for this site.';}}
      }
    }
    workerChanged();
  });
  active.set(task.id,child);
  child.on('error',e=>{if(active.get(task.id)===child){finished=true;task.status='error';task.error='Could not start the download engine: '+e.message;changed();}});
  child.on('exit',()=>{
    if(active.get(task.id)!==child)return;
    active.delete(task.id);
    if(!finished){task.status='error';task.error='The download worker stopped unexpectedly. Resume to recover completed and partial files.';}
    task.speed=0;changed();setTimeout(pump,30);
  });
  changed();
}
function pauseTask(task,status='paused',notify=true){
  networkStarts.cancel(task.id);const child=active.get(task.id);if(child){active.delete(task.id);child.kill();}
  task.status=status;task.speed=0;if(notify)changed();
}
function pump(){
  if(quitting)return;
  for(const task of state.tasks){
    if(active.size+networkStarts.size>=state.prefs.concurrentTasks)break;
    if(task.status==='queued')startTask(task,task.previewOnly?'preview':'download');
  }
}
function taskById(id){const t=state.tasks.find(t=>t.id===id);if(!t)throw new Error('This task is no longer in the queue.');return t;}
function requireIdle(task){if(active.has(task.id)||networkStarts.has(task.id)||folderOperations.has(task.id))throw new Error('Pause this task and wait for its folder operation to finish.');}
async function withFolderOperation(task,operation){requireIdle(task);folderOperations.add(task.id);try{return await operation();}finally{folderOperations.delete(task.id);setTimeout(pump,30);}}
function ownedFolder(task){
  if(!task.folder)throw new Error('This task has no download folder yet.');
  const resolved=path.resolve(task.folder);
  if(!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,79}$/.test(task.id)||task.id.includes('..'))throw new Error('Invalid task identifier.');
  const legacy=path.join(resolved,'.dandf-task.json'),shared=path.join(resolved,'.filefapper',task.id,'.dandf-task.json');
  let marker;try{marker=JSON.parse(fs.readFileSync(fs.existsSync(legacy)?legacy:shared,'utf8'));}catch{throw new Error('The folder does not contain this task ownership marker.');}
  if(marker.id!==task.id||marker.url!==task.url||resolved===path.parse(resolved).root||resolved===path.resolve(app.getPath('home'))||resolved===path.resolve(state.prefs.downloadDir))throw new Error('The selected folder does not belong to this task.');
  return resolved;
}
async function addUrls(text){
  const urls=core.parseUrls(text);if(!urls.length)throw new Error('Paste at least one HTTP or HTTPS gallery URL.');
  const added=[],listings=urls.filter(galleryLists.listingKind),existing=new Set(state.tasks.map(t=>galleryLists.galleryKey(t.url))),incoming=new Set(urls.filter(u=>!galleryLists.listingKind(u)).map(galleryLists.galleryKey));
  if(state.tasks.length+[...incoming].filter(key=>!existing.has(key)).length>10000)throw new Error('The queue supports 10,000 tasks. Remove completed tasks from the list before adding another batch; their files can stay in place.');
  for(const url of urls){if(galleryLists.listingKind(url))continue;const key=galleryLists.galleryKey(url);if(existing.has(key))continue;existing.add(key);
    const task=core.makeTask(url,state.prefs,state.plugins.filter(p=>p.enabled!==false));
    if(!core.siteFor(url,state.plugins.filter(p=>p.enabled!==false))){task.status='error';task.error='This host has no site adapter. Import a matching Python site script.';}
    else if(!state.prefs.autoStart)task.status='paused';
    state.tasks.push(task);added.push(task.id);
  }
  if(listings.length){openBrowser(listings[0]);send('show-browser',listings[0]);for(const url of listings.slice(1,require('./browser-plugins/tab-sessions.cjs').MAX_TABS))try{browser.newTab(url,false);}catch{}toast('Results page opened. Choose Queue galleries to collect its gallery links.');}
  changed();pump();return {added,duplicates:urls.length-added.length-listings.length,openedListings:listings.length};
}
function ensureLocal(event){if(!win||event.sender!==win.webContents||event.senderFrame!==win.webContents.mainFrame)throw new Error('Untrusted IPC request.');}
function handle(name,fn){ipcMain.handle(name,async(event,...args)=>{ensureLocal(event);try{return {ok:true,value:await fn(...args)};}catch(e){return {ok:false,error:e.message};}});}
function browserState(){return browser.snapshot();}
function positionBrowser(bounds){browser.position(bounds);}
function openBrowser(url){return browser.navigate(url);}
function translatorKeys(){try{const file=path.join(dataDir(),'translator-keys.bin');if(fs.existsSync(file)&&safeStorage.isEncryptionAvailable())return JSON.parse(safeStorage.decryptString(fs.readFileSync(file)));}catch{}return {};}
function translatorKey(provider=browser.prefs.translation.provider){const keys=translatorKeys();if(keys[provider])return keys[provider];if(provider==='libre')try{const file=path.join(dataDir(),'translator-key.bin');if(fs.existsSync(file)&&safeStorage.isEncryptionAvailable())return safeStorage.decryptString(fs.readFileSync(file));}catch{}return '';}
async function queueRendered(){
  const url=browser.current()?.getURL();if(!core.validUrl(url,false))throw new Error('Open a reader chapter first.');
  if(state.tasks.some(t=>t.url===url))throw new Error('This URL is already in the queue. Remove that task before capturing it again.');
  const task=core.makeTask(url,state.prefs);task.capture=await browser.capture(task.id);task.title=task.capture.title;task.total=task.capture.images.length;
  const hosts=[url,...task.capture.images.map(i=>i.url).filter(Boolean)].map(u=>new URL(u).hostname);
  const cookies=(await browserSession.cookies.get({})).filter(c=>hosts.some(h=>core.domainMatches(h,c.domain)));
  if(cookies.length)await mergeCookies(cookies);
  if(!state.prefs.autoStart)task.status='paused';state.tasks.push(task);changed();pump();return {added:[task.id],pages:task.total};
}
async function installBrowserCookies(rows){
  let browserAccepted=0,browserRejected=0;
  for(const c of rows){try{
    const details=cookieTools.toElectronCookie(c);
    await browserSession.cookies.set(details);
    // Chromium can retain host-only and Domain copies for the same host/path/name.
    // Expire only the opposite scope through its exact cookie attributes, after
    // the replacement succeeds. URL-only removal can also delete unrelated paths.
    const peers=(await browserSession.cookies.get({name:c.name})).filter(row=>cookieTools.cookieKey(row)===cookieTools.cookieKey(c)&&row.hostOnly!==c.hostOnly);
    for(const peer of peers)await browserSession.cookies.set({...cookieTools.toElectronCookie(peer),expirationDate:1});
    const stale=(await browserSession.cookies.get({name:c.name})).some(row=>cookieTools.cookieKey(row)===cookieTools.cookieKey(c)&&row.hostOnly!==c.hostOnly);
    if(stale)throw new Error('Cookie scope replacement was incomplete.');
    browserAccepted++;
  }catch{browserRejected++;}}
  try{await browserSession.cookies.flushStore();}catch{}
  return {browserAccepted,browserRejected};
}
async function mergeCookies(rows){
  const live=cookieTools.liveCookies(rows),key=cookieTools.cookieKey;
  for(const c of live){vault=vault.filter(x=>key(x)!==key(c));vault.push(c);}
  const result=await installBrowserCookies(live),notes=[];
  if(!live.length)notes.push('No unexpired cookies were found in this export.');
  if(result.browserRejected)notes.push(`${result.browserRejected} cookies were saved for the downloader but were not accepted by the built-in browser. Check their domain, Secure and SameSite attributes or import a fresh export.`);
  try{saveVault();}catch(e){notes.push(e.message);}
  cookieStatus={count:live.length,...result,note:notes.join(' '),updatedAt:new Date().toISOString()};
  changed();return cookieStatus;
}
async function fetchEdgePixivMedia(url,w){try{const response=await browserSession.fetch(url,{method:'GET',headers:{Referer:'https://www.pixiv.net/'},redirect:'error',signal:AbortSignal.timeout(90000),webContents:w});if(!response.ok)throw new Error('Pixiv media returned HTTP '+response.status);if(Number(response.headers.get('content-length'))>128000000)throw new Error('This media exceeds ppixiv’s browser bridge limit. Queue the artwork instead.');const reader=response.body.getReader(),chunks=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>128000000){await reader.cancel();throw new Error('This media exceeds ppixiv’s browser bridge limit. Queue the artwork instead.');}chunks.push(Buffer.from(value));}return {bytes:new Uint8Array(Buffer.concat(chunks))};}catch(error){return {error:error.message};}}
function setupIPC(){
  ipcMain.handle('ppixiv-fetch',async(event,payload)=>{
    const pixiv=require('./browser-plugins/ppixiv.cjs');
    if(!browser||!browser.prefs.ppixivPlugin||!Array.from(browser.views.values()).some(v=>v.webContents===event.sender)||event.senderFrame!==event.sender.mainFrame||!pixiv.matches(event.senderFrame.url)||!pixiv.allowedImage(payload?.url))return {error:'This download is outside the Pixiv media bridge.'};
    try{const response=await browserSession.fetch(payload.url,{method:'GET',headers:{Referer:'https://www.pixiv.net/'},redirect:'error',signal:AbortSignal.timeout(90000)});if(!response.ok)throw new Error('Pixiv media returned HTTP '+response.status);if(Number(response.headers.get('content-length'))>128000000)throw new Error('This media exceeds ppixiv’s 128 MB browser bridge limit. Queue the URL in FileFapper instead.');const reader=response.body.getReader(),chunks=[];let size=0;while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>128000000){await reader.cancel();throw new Error('This media exceeds ppixiv’s browser bridge limit. Queue it in FileFapper.');}chunks.push(Buffer.from(value));}return {bytes:new Uint8Array(Buffer.concat(chunks))};}catch(e){return {error:e.message};}
  });

  handle('get-state',()=>cleanSnapshot());handle('get-sites',()=>core.activeSites());
  handle('window-focus-content',when=>restoreContentFocus(win,browserSession?.runtime,when));
  handle('window-control',action=>{if(action==='minimize')win.minimize();if(action==='maximize')win.isMaximized()?win.unmaximize():win.maximize();if(action==='close')win.close();});
  handle('add-urls',addUrls);
  handle('task-action',async(id,action,index)=>{
    const t=taskById(id);
    if(action==='play'){if(active.has(id))return;if(t.status==='complete')return;accessBlocks.delete(new URL(t.url).hostname);t.previewOnly=false;t.status='queued';t.error='';changed();pump();}
    else if(action==='pause'||action==='stop'){pauseTask(t,action==='stop'?'stopped':'paused');pump();}
    else if(action==='restart'){accessBlocks.delete(new URL(t.url).hostname);pauseTask(t,'paused');startTask(t,'download',true);}
    else if(action==='preview'){if(!t.files.length&&!active.has(id)){accessBlocks.delete(new URL(t.url).hostname);startTask(t,'preview');}return t.id;}
    else if(action==='remove'){pauseTask(t);state.tasks=state.tasks.filter(x=>x.id!==id);changed();pump();}
    else if(action==='copy-link'){clipboard.writeText(t.url);lastClipboard=t.url;}
    else if(action==='open-browser'){if(!t.url.startsWith('dfdemo:')){openBrowser(t.url);send('show-browser',t.url);}}
    else if(action==='open-external'){if(core.validUrl(t.url,false))await shell.openExternal(t.url);}
    else if(action==='open-folder'){const folder=ownedFolder(t);const error=await shell.openPath(folder);if(error)throw new Error(error);}
    else if(action==='open-first'||action==='open-file'){ownedFolder(t);const file=action==='open-file'?t.files.find(f=>f.index===Number(index)):t.files[0];if(!file||!fs.existsSync(file.path))throw new Error('Download a page first.');if(!core.isInside(t.folder,file.path))throw new Error('Invalid gallery file.');const error=await shell.openPath(file.path);if(error)throw new Error(error);}
    else if(action==='delete-folder'){
      requireIdle(t);const folder=ownedFolder(t),shared=!fs.existsSync(path.join(folder,'.dandf-task.json'));
      const choice=await dialog.showMessageBox(win,{type:'warning',title:shared?'Delete gallery files':'Delete gallery folder',message:shared?'Move this gallery’s files to the Recycle Bin?':'Move this gallery folder to the Recycle Bin?',detail:shared?'Other galleries in this shared folder will remain.\n'+folder:folder,buttons:['Keep files','Move to Recycle Bin'],defaultId:0,cancelId:0});
      if(choice.response===1){await withFolderOperation(t,async()=>{if(shared)await require('./shared-folders.cjs').remove(t,p=>shell.trashItem(p));else await shell.trashItem(folder);t.folder='';t.files=[];t.done=0;t.bytes=0;t.status='stopped';changed();});}
    }else if(action==='move-folder'){
      requireIdle(t);const source=ownedFolder(t),shared=!fs.existsSync(path.join(source,'.dandf-task.json'));
      const selected=await dialog.showOpenDialog(win,{title:'Choose the destination parent folder',properties:['openDirectory','createDirectory']});
      if(selected.canceled)return;
      requireIdle(t);
      const destination=path.resolve(selected.filePaths[0],path.basename(source));
      if(destination===source)return;
      await withFolderOperation(t,async()=>{
        if(shared){const result=await require('./shared-folders.cjs').move(t,selected.filePaths[0]);if(result.warnings.length)toast('The gallery was copied, but some originals remain in the old folder: '+result.warnings.join('; '));}
        else{if(core.isInside(source,destination)||fs.existsSync(destination))throw new Error('Choose a different destination; the target must be outside this gallery and must not already exist.');try{await fsp.rename(source,destination);}catch(e){if(e.code!=='EXDEV')throw e;await fsp.cp(source,destination,{recursive:true,errorOnExist:true,force:false});await shell.trashItem(source);}}
        for(const file of t.files){for(const key of ['path','previewPath','originalPath'])if(file[key]&&core.isInside(source,file[key]))file[key]=path.join(destination,path.relative(source,file[key]));}
        t.folder=destination;changed();
      });
    }else if(!['play','pause','stop','restart','preview','remove','copy-link','open-browser','open-external','open-folder','open-first','open-file','delete-folder','move-folder'].includes(action))throw new Error('Unknown task action.');
    return true;
  });
  handle('bulk-task-action',(ids,action)=>{if(!Array.isArray(ids)||!['play','pause','stop','remove'].includes(action))throw new Error('Invalid bulk action.');const selected=new Set(ids);for(const t of state.tasks){if(!selected.has(t.id))continue;if(action==='play'){if(!active.has(t.id)&&t.status!=='complete'){accessBlocks.delete(new URL(t.url).hostname);t.previewOnly=false;t.status='queued';t.error='';}}else pauseTask(t,action==='stop'?'stopped':'paused',false);}if(action==='remove')state.tasks=state.tasks.filter(t=>!selected.has(t.id));changed();if(action==='play'||action==='remove')pump();});
  handle('queue-action',async action=>{if(action==='pause-all'||action==='stop-all'){for(const t of state.tasks)if(['queued','resolving','downloading','waiting'].includes(t.status)||(action==='stop-all'&&t.status==='paused'))pauseTask(t,action==='stop-all'?'stopped':'paused',false);changed();}
    else if(action==='resume-all'){accessBlocks.clear();for(const t of state.tasks)if(['paused','stopped','error','waiting'].includes(t.status))t.status='queued';changed();pump();}
    else if(action==='clear-completed'){state.tasks=state.tasks.filter(t=>t.status!=='complete');changed();}
    else if(action==='clear-all'){
      if(!state.tasks.length)return {cleared:0};
      const answer=await dialog.showMessageBox(win,{type:'question',title:'Clear the download queue?',message:`Remove all ${state.tasks.length} tasks from the queue?`,detail:'Running downloads will stop. Downloaded files and gallery folders stay on your computer.',buttons:['Cancel','Clear all tasks'],defaultId:0,cancelId:0,noLink:true});
      if(answer.response!==1)return {cancelled:true};
      const count=state.tasks.length;for(const t of state.tasks)if(active.has(t.id))pauseTask(t);
      state.tasks=[];changed();return {cleared:count};
    }
  });
  handle('reorder',(id,target)=>{const i=state.tasks.findIndex(t=>t.id===id);if(i<0)return;let to=target==='up'?i-1:target==='down'?i+1:state.tasks.findIndex(t=>t.id===target);if(to<0||to>=state.tasks.length)return;const [t]=state.tasks.splice(i,1);state.tasks.splice(to,0,t);changed();});
  handle('set-prefs',patch=>{state.prefs=core.preferences({...state.prefs,...patch},state.prefs.downloadDir);win.setAlwaysOnTop(state.prefs.alwaysOnTop);if(browserSession.isEdge)browserSession.setDownloadDir(state.prefs.downloadDir).catch(()=>{});changed();pump();return state.prefs;});
  handle('set-task-options',(id,options)=>{const t=taskById(id);requireIdle(t);if(options.quality){const quality=options.quality==='original'?'original':'resampled';if(quality!==t.quality){t.quality=quality;t.forceNext=true;t.done=0;t.files=[];t.bytes=0;if(t.status==='complete')t.status='paused';}}if(options.upscale!==undefined){const scale=[1,1.5,2].includes(Number(options.upscale))?Number(options.upscale):1;if(t.upscale!==scale){t.upscale=scale;t.forceNext=true;t.done=0;t.files=[];t.bytes=0;if(t.status==='complete')t.status='paused';}}for(const [key,choices] of Object.entries({upscaleMethod:['waifu2x','lanczos'],upscaleDenoise:['off','gentle'],upscaleDevice:['auto','cpu']})){if(choices.includes(options[key])&&t[key]!==options[key]){t[key]=options[key];t.forceNext=true;t.done=0;t.files=[];t.bytes=0;if(t.status==='complete')t.status='paused';}}if(options.workers)t.workers=Math.round(core.clamp(options.workers,1,50,4));changed();});
  handle('choose-download-dir',async()=>{const d=await dialog.showOpenDialog(win,{title:'Choose download folder',defaultPath:state.prefs.downloadDir,properties:['openDirectory','createDirectory']});if(!d.canceled){state.prefs.downloadDir=d.filePaths[0];if(browserSession.isEdge)await browserSession.setDownloadDir(state.prefs.downloadDir);changed();}return state.prefs.downloadDir;});
  handle('session-export',async()=>{const d=await dialog.showSaveDialog(win,{title:'Save FileFapper session',defaultPath:'FileFapper-session.json',filters:[{name:'FileFapper session',extensions:['json']}]});if(!d.canceled){atomic(d.filePath,JSON.stringify({version:1,application:'FileFapper',prefs:state.prefs,tasks:state.tasks,searches:state.searches,browser:browser.data()},null,2));return d.filePath;}});
  handle('session-import',async()=>{const d=await dialog.showOpenDialog(win,{title:'Load FileFapper session',filters:[{name:'FileFapper session',extensions:['json']}],properties:['openFile']});if(d.canceled)return;const j=JSON.parse(await fsp.readFile(d.filePaths[0],'utf8'));const tasks=core.restoreTasks(j.tasks);const prefs=core.preferences(j.prefs,state.prefs.downloadDir);
    const confirm=await dialog.showMessageBox(win,{type:'question',message:`Replace this queue with ${tasks.length} saved tasks?`,detail:'Current downloads will pause. Downloaded files are retained. Cookies and scripts stay on this computer.',buttons:['Cancel','Load session'],defaultId:0,cancelId:0});if(confirm.response!==1)return;
    for(const t of state.tasks)if(active.has(t.id))pauseTask(t);state.tasks=tasks;state.prefs=prefs;state.searches=Array.isArray(j.searches)?j.searches.slice(0,20):[];if(j.browser){browser.close();browser=new BrowserWorkspace({win,session:browserSession,state:j.browser,dataDir:dataDir(),send,fillLogin:(w,options)=>fillSavedLogin(w,options),persist:value=>{state.browser=value;scheduleSave();},runCollection:(payload,onEvent)=>{if(quitting)throw new Error('FileFapper is closing.');const child=runWorker({mode:'collect',...payload,cookies:scopedCookies(payload.url),userAgent:browserSession.getUserAgent(),delay:state.prefs.delay},onEvent);transient.add(child);child.once('exit',()=>transient.delete(child));return child;}});}win.setAlwaysOnTop(prefs.alwaysOnTop);changed();return tasks.length;});
  handle('accounts-save',row=>{const id=accounts.save(row);changed();return {id};});
  handle('accounts-import',async()=>{const choice=await dialog.showOpenDialog(win,{title:'Import site logins',filters:[{name:'Login exports',extensions:['json','csv']}],properties:['openFile']});if(choice.canceled)return;const file=choice.filePaths[0];if((await fsp.stat(file)).size>2_000_000)throw new Error('Import at most 2 MB of site logins at a time.');const count=accounts.import(await fsp.readFile(file,'utf8'));changed();return {count};});
  handle('accounts-action',async(action,id,value)=>{const row=accounts.summary().find(r=>r.id===id);if(!row)throw new Error('That saved login no longer exists.');if(action==='remove')accounts.remove(id);else if(action==='autofill')accounts.toggle(id,value);else if(action==='open'){openBrowser(row.loginUrl);send('show-browser',row.loginUrl);}else if(action==='fill')return fillSavedLogin(browser.current(),{id});else throw new Error('Unknown account action.');changed();return true;});
  handle('browser-fill-login',()=>fillSavedLogin(browser.current()));
  handle('access-resume',async()=>{const current=browser.current()?.getURL();if(!core.validUrl(current,false))throw new Error('Open this site in Browser first.');const page=await browser.refreshAccess();if(['access','http','network'].includes(page?.kind)||browser.current().isLoading())throw new Error('The browser still shows a loading or access error. Complete the check first, or import cookies from your regular browser and resume the task from its queue controls.');const host=new URL(current).hostname,rows=(await browserSession.cookies.get({})).filter(c=>core.domainMatches(host,c.domain));if(rows.length)await mergeCookies(rows);accessBlocks.delete(host);let resumed=0;for(const task of state.tasks)if(new URL(task.url).hostname===host&&task.errorKind==='access'&&['paused','error'].includes(task.status)){task.status='queued';task.error='';resumed++;}changed();pump();return {count:rows.length,resumed};});
  handle('cookies-import-file',async()=>{const d=await dialog.showOpenDialog(win,{title:'Import browser extension cookies',filters:[{name:'Cookie exports',extensions:['txt','json']}],properties:['openFile']});if(d.canceled)return;const data=await fsp.readFile(d.filePaths[0],'utf8');if(data.length>5e6)throw new Error('The cookie file is too large. Export cookies for the sites you use.');return mergeCookies(core.parseCookies(data));});
  handle('cookies-import-text',text=>{if(String(text).length>5e6)throw new Error('Cookie export is too large.');return mergeCookies(core.parseCookies(text));});
  handle('cookies-sync',async()=>{const current=browser.current()?.getURL();if(!core.validUrl(current,false))throw new Error('Open a site in Browser and sign in first.');const host=new URL(current).hostname;const rows=(await browserSession.cookies.get({})).filter(c=>core.domainMatches(host,c.domain));if(!rows.length)throw new Error('The current site has no browser cookies yet. Sign in first.');return mergeCookies(rows);});
  handle('cookies-clear',async domain=>{vault=vault.filter(c=>c.domain!==domain);const browserCookies=await browserSession.cookies.get({domain});for(const c of browserCookies)await browserSession.cookies.remove(`https://${c.domain.replace(/^\./,'')}${c.path}`,c.name);try{saveVault();}catch{}changed();});
  handle('browser-navigate',url=>openBrowser(addressUrl(url)));handle('browser-bounds',positionBrowser);handle('browser-state',browserState);
  handle('browser-action',async action=>{if(action==='download'){const url=browser.current()?.getURL()||'';if(galleryLists.listingKind(url))return {listing:true};return addUrls(url);}if(action==='capture')return queueRendered();return browser.action(action);});
  handle('browser-open',url=>browser.open(url));
  handle('browser-tabs-menu',position=>browser.tabMenu(position));
  handle('browser-tab',(action,id)=>{if(action==='duplicate')return browser.newTab(browser.tabs.find(t=>t.id===id)?.url||'');if(['close-others','close-left','close-right','sort-title','sort-domain','sort-accessed'].includes(action))return browser.tabCommand(action,id||browser.activeId);if(action==='new')return browser.newTab();if(action==='activate')return browser.activate(id);if(action==='close')return browser.closeTab(id);});
  handle('browser-tools',()=>({...browser.tools(),translationKeySet:!!translatorKey(),translationKeys:{libre:!!translatorKey('libre'),deepl:!!translatorKey('deepl'),azure:!!translatorKey('azure')}}));
  handle('browser-categories',(action,payload)=>{if(action==='open'){const url=galleryLists.categoryUrl(payload);openBrowser(url);send('show-browser',url);return url;}return galleryLists.categoryState(browser.current()?.getURL());});
  handle('browser-galleries',async(action,payload={})=>{
    if(action!=='queue'){if(action==='start'){const url=browser.current()?.getURL();if(url){const host=new URL(url).hostname;const cookies=(await browserSession.cookies.get({domain:host})).filter(c=>core.domainMatches(host,c.domain));if(cookies.length)await mergeCookies(cookies);}}const data=await browser.galleries(action,payload);if(!data?.rows)return data;const queued=new Set(state.tasks.map(t=>galleryLists.galleryKey(t.url)));return {...data,rows:data.rows.map(r=>({...r,alreadyQueued:queued.has(galleryLists.galleryKey(r.url))}))};}
    const requested=new Set((Array.isArray(payload.urls)?payload.urls:[]).slice(0,5000));const rows=browser.collector.results().rows.filter(r=>requested.has(r.url));
    if(!rows.length)throw new Error('Select at least one gallery.');const source=browser.collector.status().url;if(source){const host=new URL(source).hostname;const cookies=(await browserSession.cookies.get({domain:host})).filter(c=>core.domainMatches(host,c.domain));if(cookies.length)await mergeCookies(cookies);}const result=await addUrls(rows.map(r=>r.url).join('\n'));const titles=new Map(rows.map(r=>[r.url,r.title]));for(const id of result.added){const task=taskById(id);task.title=titles.get(task.url)||task.title;const row=rows.find(r=>r.url===task.url);if(row?.date)task.metadata={...task.metadata,collected_posted_date:row.date};}changed();return result;
  });
  handle('browser-tags',(action,payload)=>browser.tags(action,payload));
  handle('browser-scroll',action=>browser.scroll(action));
  handle('browser-settings',patch=>{
    if(patch.apiKey!==undefined){const provider=patch.translation?.provider||browser.prefs.translation.provider;if(!['deepl','azure','libre'].includes(provider))throw new Error('Choose a keyed provider before saving an API key.');const key=String(patch.apiKey).slice(0,2000),file=path.join(dataDir(),'translator-keys.bin'),keys=translatorKeys();if(key){if(!safeStorage.isEncryptionAvailable())throw new Error('Windows encryption is unavailable. The key was not saved.');keys[provider]=key;}else{delete keys[provider];if(provider==='libre')fs.rmSync(path.join(dataDir(),'translator-key.bin'),{force:true});}atomic(file,safeStorage.encryptString(JSON.stringify(keys)));delete patch.apiKey;}
    return browser.configure(patch);
  });
  handle('browser-compatibility',enabled=>browser.compatibility(enabled===true));
  handle('browser-reset-verification',()=>browser.resetVerification());
  handle('browser-connection',async()=>{const {hostOf}=require('./site-connection.cjs'),host=hostOf(browser.current()?.getURL()||browser.active().url);if(!host)throw new Error('Open a site first.');const deadline=async fn=>{let timer;try{return await Promise.race([fn(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('The lookup timed out.')),6000);})]);}catch(e){return {error:String(e.code||e.message).slice(0,160)};}finally{clearTimeout(timer);}};const [system,chromium]=await Promise.all([deadline(()=>require('node:dns').promises.lookup(host,{all:true})),deadline(()=>browserSession.resolveHost(host,{cacheUsage:'disallowed'}))]);return {host,system,chromium,checkedAt:new Date().toISOString()};});
  handle('browser-adblock-update',()=>{browser.ensureRuntime();return browser.adblock.update();});
  handle('browser-translate',action=>browser.translate(action,translatorKey()));
  handle('browser-data',async(action,options)=>{const result=await browser.browsingData(action,options);if(action==='clear'&&options?.cookies){vault=[];saveVault();changed();}return result;});
  handle('browser-sessions',async(action,payload)=>{
    if(action==='export'){const d=await dialog.showSaveDialog(win,{title:'Export tab sessions',defaultPath:'FileFapper-tabs.json',filters:[{name:'Tab sessions',extensions:['json']}]});if(!d.canceled){atomic(d.filePath,JSON.stringify({version:1,sessions:browser.savedSessions},null,2));return true;}return false;}
    if(action==='import'){const d=await dialog.showOpenDialog(win,{title:'Import tab sessions',filters:[{name:'Tab sessions',extensions:['json']}],properties:['openFile']});if(d.canceled)return;const raw=await fsp.readFile(d.filePaths[0],'utf8');if(raw.length>5000000)throw new Error('The tab session file is too large.');const j=JSON.parse(raw);return browser.sessions('import',{sessions:j.sessions});}
    return browser.sessions(action,payload);
  });
  handle('search',async(siteId,query)=>{
    const site=core.activeSites().find(s=>s.id===siteId);if(!site)throw new Error('Choose a search site.');if(!String(query).trim())throw new Error('Enter search terms.');const url=site.search.replace('{q}',encodeURIComponent(String(query).trim()));
    if(site.searchBrowser){openBrowser(url);send('show-browser',url);return {browser:true,results:[]};}
    const plugin=state.plugins.find(p=>p.enabled!==false&&p.domains.some(d=>site.domains.includes(d)));
    if(browserSession.isEdge)await browserSession.prepareForWorker();
    if(quitting)throw new Error('FileFapper is closing.');
    const result=await onceWorker({mode:'search',site,url,query,cookies:scopedCookies(url),userAgent:browserSession.getUserAgent(),delay:state.prefs.delay,plugin:plugin?.path});
    const results=(result.results||[]).filter(r=>core.validUrl(r.url,false)).slice(0,100);
    state.searches=[{siteId,query:String(query),results,at:new Date().toISOString()},...state.searches].slice(0,20);changed();return {results,url};
  });
  handle('plugin-import',async()=>{
    const d=await dialog.showOpenDialog(win,{title:'Import a FileFapper Python site script',filters:[{name:'Python site scripts',extensions:['py']}],properties:['openFile']});if(d.canceled)return;
    const result=await onceWorker({mode:'inspect',path:d.filePaths[0]});const manifest=result.manifest;
    const confirm=await dialog.showMessageBox(win,{type:'warning',title:'Trust site script',message:`Import ${manifest.name||manifest.id}?`,detail:`Hosts: ${manifest.domains.join(', ')}\n\nPython scripts run with your Windows account permissions and can access files and site cookies. Import only scripts you wrote or reviewed. The script can override an existing site adapter.`,buttons:['Cancel','Trust and import'],defaultId:0,cancelId:0});if(confirm.response!==1)return;
    const dir=path.join(dataDir(),'scripts');await fsp.mkdir(dir,{recursive:true});const target=path.join(dir,manifest.id+'-'+crypto.randomBytes(4).toString('hex')+'.py');await fsp.copyFile(d.filePaths[0],target);
    state.plugins=state.plugins.filter(p=>p.id!==manifest.id);state.plugins.push({...manifest,path:target,enabled:true});changed();return manifest;
  });
  handle('plugin-action',(id,action)=>{const plugin=state.plugins.find(p=>p.id===id);if(!plugin)return;if(action==='remove')state.plugins=state.plugins.filter(p=>p.id!==id);if(action==='toggle')plugin.enabled=!plugin.enabled;changed();});
  handle('open-doc',async name=>{const mapping={guide:'USER-GUIDE.md',scripts:'SITE-SCRIPTS.md',sites:'SITE-SUPPORT.md',audit:'SITE-CHECK-2026-10-21.md',licenses:'THIRD-PARTY-NOTICES.md'};if(!mapping[name])return;const file=name==='licenses'?path.join(__dirname,'..',mapping[name]):path.join(__dirname,'..','docs',mapping[name]);return await fsp.readFile(file,'utf8');});
  handle('diagnostics',()=>onceWorker({mode:'diagnostics',checks:[]}));
  handle('copy-text',text=>{clipboard.writeText(String(text));lastClipboard=String(text);});
}

app.whenReady().then(async()=>{
  Menu.setApplicationMenu(null);
  loadState();
  const legacyBrowser=testMode&&process.env.DF_BROWSER_ENGINE==='electron';
  const nativeOptions={win:()=>win,dataDir:dataDir(),qaMode:testMode,downloadDir:state.prefs.downloadDir};
  browserSession=legacyBrowser?session.fromPartition('persist:dandf-browser'):testMode&&process.env.DF_BROWSER_ENGINE==='edge'?require('./edge-runtime.cjs').createEdgeSession(nativeOptions):require('./cef-runtime.cjs').createCefSession(nativeOptions);
  if(browserSession.isEdge)browserSession.runtime.on('error',error=>send('browser-error',error.message||String(error)));
  if(!browserSession.isEdge){
  // Use Chromium's normal identity for sites which reject embedded-app branding.
  browserSession.setUserAgent(browserSession.getUserAgent().replace(/\sElectron\/[^\s]+/g,'').replace(/\s(?:dandf|D&F|filefapper)\/[^\s]+/gi,''));
  browserSession.setPermissionRequestHandler((w,permission,callback)=>callback(['fullscreen','clipboard-sanitized-write'].includes(permission)&&require('./browser-plugins/ppixiv.cjs').matches(w.getURL())&&Array.from(browser?.views.values()||[]).some(v=>v.webContents===w)));
  browserSession.webRequest.onBeforeSendHeaders({urls:['https://i.pximg.net/*','https://i-cf.pximg.net/*']},(details,callback)=>{
    const headers={...details.requestHeaders};for(const key of Object.keys(headers))if(key.toLowerCase()==='referer')delete headers[key];
    headers.Referer='https://www.pixiv.net/';callback({requestHeaders:headers});
  });
  browserSession.on('will-download',(event,item,w)=>{
    const own=Array.from(browser?.views.values()||[]).some(v=>v.webContents===w),name=path.basename(item.getFilename()).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');
    const media=/\.(?:png|jpe?g|gif|webp|avif|bmp|mp4|webm|mkv|mov|m4v|avi|ogv|mp3|wav|ogg|opus|m4a|flac|aac|zip|cbz|cbr|7z|rar|tar|gz|bz2|xz|pdf|psd|clip|txt)$/i.test(name);
    if(!own||!media){event.preventDefault();toast('Queue the gallery URL to manage its files in FileFapper.');return;}
    // In particular, ppixiv's image, manga ZIP and ugoira buttons save blobs.
    // Let Electron show its normal Save As dialog instead of cancelling them.
    item.setSaveDialogOptions({title:'Save browser media',defaultPath:path.join(state.prefs.downloadDir||app.getPath('downloads'),name)});
    item.once('done',(_,status)=>{if(status==='completed')toast('Browser file saved: '+name);else if(status!=='cancelled')toast('The browser download did not finish. Try the gallery queue.');});
  });
  }
  if(browserSession.isEdge)browserSession.setInitialCookies(vault);
  else{const restoredCookies=await installBrowserCookies(vault);if(restoredCookies.browserRejected)cookieStatus={count:vault.length,...restoredCookies,note:'Some saved cookies could not be restored to the built-in browser. Import a fresh export for the affected site.',updatedAt:new Date().toISOString()};}
  browserSession.cookies.on('changed',(_,cookie,__,removed)=>rememberBrowserCookie(cookie,removed));
  if(browserSession.isEdge)browserSession.on('initial-cookie-status',result=>{cookieStatus={...result,note:result.browserRejected?'Some saved cookies were not accepted by '+browserSession.engine+'. Import a fresh export for the affected site.':'Saved cookies restored to '+browserSession.engine+'.',updatedAt:new Date().toISOString()};changed();});
  protocol.handle('dfmedia',request=>{
    return require('./media-protocol.cjs').serve(request,state.tasks);
  });
  win=new BrowserWindow({width:1580,height:1000,minWidth:1120,minHeight:760,show:false,frame:false,backgroundColor:'#f6f7f9',icon:path.join(__dirname,'..','assets','icon.ico'),webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true,webSecurity:true}});
  win.setAlwaysOnTop(state.prefs.alwaysOnTop);
  win.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  win.webContents.on('context-menu',async(_,params)=>{if(!params.isEditable&&!params.selectionText)return;const items=params.isEditable?editItems(params):[{role:'copy',label:'Copy selected text'},{role:'selectAll',label:'Select all'}];try{const field=await win.webContents.executeJavaScript(`document.elementFromPoint(${Math.round(params.x)},${Math.round(params.y)})?.closest('input,textarea')?.id||''`);if(field==='browser-url')items.push({type:'separator'},{label:'Paste and go / search',click:()=>{try{const url=addressUrl(clipboard.readText());openBrowser(url);send('show-browser',url);}catch(e){toast(e.message);}}});}catch{}win.webContents.focus();Menu.buildFromTemplate(items).popup({window:win,...(params.frame?{frame:params.frame}:{})});});

  win.webContents.on('will-navigate',(e,url)=>{if(url!==pathToFileURL(uiPath).href)e.preventDefault();});
  browser=new BrowserWorkspace({win,session:browserSession,state:state.browser,dataDir:dataDir(),send,fillLogin:(w,options)=>fillSavedLogin(w,options),persist:value=>{state.browser=value;scheduleSave();},runCollection:(payload,onEvent)=>{if(quitting)throw new Error('FileFapper is closing.');const child=runWorker({mode:'collect',...payload,cookies:scopedCookies(payload.url),userAgent:browserSession.getUserAgent(),delay:state.prefs.delay},onEvent);transient.add(child);child.once('exit',()=>transient.delete(child));return child;}});
  if(browserSession.isEdge)browserSession.setDownloadHandler(async event=>{
    const own=Array.from(browser?.views.values()||[]).some(v=>v.webContents===event.webContents);
    const name=path.basename(String(event.suggestedFileName||'')).replace(/[<>:"/\\|?*\x00-\x1f]/g,'_');
    if(!own||!name||quitting)return {canceled:true};
    return dialog.showSaveDialog(win,{title:'Save browser media',defaultPath:path.join(state.prefs.downloadDir||app.getPath('downloads'),name)});
  });
  if(browserSession.isEdge)browserSession.setPixivHandler(async(payload,context)=>{const pixiv=require('./browser-plugins/ppixiv.cjs'),w=context?.webContents;if(!browser?.prefs.ppixivPlugin||!w||!Array.from(browser.views.values()).some(v=>v.webContents===w)||!pixiv.matches(context.source)||!pixiv.matches(w.getURL())||payload?.method&&payload.method!=='GET'||!pixiv.allowedImage(payload?.url))return {error:'This download is outside the Pixiv media bridge.'};return fetchEdgePixivMedia(payload.url,w);});
  setupIPC();
  await win.loadFile(uiPath);
  win.once('ready-to-show',()=>{if((!testMode||process.env.DF_SHOW_UI)&&!win.isVisible())win.show();});
  // ready-to-show may have fired while loadFile was awaited.
  if((!testMode||process.env.DF_SHOW_UI)&&!win.isVisible())win.show();
  lastClipboard=clipboard.readText();
  clipboardTimer=setInterval(()=>{
    if(!state.prefs.clipboard)return;
    const value=clipboard.readText();if(value===lastClipboard)return;lastClipboard=value;
    const urls=core.parseUrls(value).filter(u=>core.siteFor(u,state.plugins.filter(p=>p.enabled!==false)));
    if(urls.length)send('clipboard-urls',urls);
  },1200);
  const timer=setInterval(()=>{if(Date.now()-lastTick>5000){lastTick=Date.now();for(const t of state.tasks)if(t.status==='waiting'&&t.retryAt<Date.now()){t.error='Cooldown ended. Press play to resume.';t.retryAt=0;}send('state',cleanSnapshot());}},1000);
  timer.unref();
  let closingAfterSync=false;
  win.on('move',()=>browser?.parentMoved());
  win.on('close',event=>{
    if(closingAfterSync)return;event.preventDefault();if(quitting)return;
    quitting=true;networkStarts.clear();clearInterval(clipboardTimer);clearTimeout(saver);clearTimeout(cookieSaver);
    for(const t of state.tasks){if(active.has(t.id)||['queued','resolving','downloading'].includes(t.status)){t.resumeAfterExit=true;t.status='paused';t.speed=0;}}
    for(const child of [...active.values(),...transient])child.kill();active.clear();
    (async()=>{let timer;try{if(browserSession.isEdge&&browserSession.runtime.started)await Promise.race([browserSession.cookies.poll(),new Promise(resolve=>{timer=setTimeout(resolve,2000);})]);}catch{}finally{clearTimeout(timer);}
      clearTimeout(cookieSaver);try{saveVault();}catch{}try{state.browser=browser.data();save();}catch{}
      browser.close();try{await browserSession.close?.();}catch{}closingAfterSync=true;if(!win.isDestroyed())win.close();
    })().catch(()=>{closingAfterSync=true;if(!win.isDestroyed())win.close();});
  });
  pump();
}).catch(e=>{console.error('FileFapper startup failed:',e.stack||e.message);if(!testMode)dialog.showErrorBox('FileFapper could not start',e.stack||e.message);app.quit();});
app.on('window-all-closed',()=>app.quit());
