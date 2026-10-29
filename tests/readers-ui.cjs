'use strict';
const {_electron:electron}=require('playwright'),{launchPackaged}=require('./launch_packaged.cjs');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),qa=path.resolve(process.env.DF_READERS_QA||path.join(root,'..','qa-readers-'+Date.now()));fs.mkdirSync(qa,{recursive:true});
const checks=[],errors=[],requests=[];let app,unlocked=false,base;
const png=new (require('@resvg/resvg-js').Resvg)('<svg xmlns="http://www.w3.org/2000/svg" width="24" height="32"><rect width="24" height="32" fill="#7da2bc"/></svg>').render().asPng();
const invoke=(p,name,...args)=>p.evaluate(({name,args})=>window.df.invoke(name,...args),{name,args}),delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,timeout=30000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await delay(100);}throw new Error(label);}
const record=text=>{checks.push(text);console.log('PASS '+text);};
function login(action='/session',extra='',title='Sign in'){return `<title>${title}</title><body style="font:20px sans-serif;padding:35px"><h1>${title}</h1><form method="post" action="${action}"><input name="username" autocomplete="username" aria-label="Username"><input name="password" type="password" autocomplete="current-password" aria-label="Password" ${extra}><button>Sign in</button></form></body>`;}
function mirror(id){return `<title>Reader fixture</title><main id="readerApp" data-reader-id="${id}" data-reader-total="2" data-reader-image-base="${base}/images" data-reader-locked="0" data-reader-seo-title="Local fixture"><script type="application/json" id="readerPagesJson">[{"page":1,"ext":"png"},{"page":2,"ext":"png"}]</script></main>`;}
async function browserPage(code){return app.evaluate(({webContents},source)=>{const w=webContents.getAllWebContents().find(w=>/^https?:/.test(w.getURL()));return w?w.executeJavaScript(source):null;},code);}
async function launch(){
 const options={cwd:root,env:{...process.env,DF_DATA_DIR:qa,DF_PYTHON:process.env.DF_APP_EXE?'C:\\DandF-no-external-runtime\\python.exe':path.resolve(root,'..','build-venv','Scripts','python.exe')}};
 app=process.env.DF_APP_EXE?await launchPackaged(process.env.DF_APP_EXE,options):await electron.launch({args:[root],...options,timeout:30000});
 const p=await app.firstWindow();p.on('pageerror',e=>errors.push(e.message));await p.waitForSelector('#urls');
 await app.evaluate(async({session,net},base)=>{const ses=session.fromPartition('persist:dandf-browser');await ses.protocol.handle('https',request=>net.fetch(base+'/web?url='+encodeURIComponent(request.url)));},base);
 return p;
}
async function navigate(p,url){await invoke(p,'browser-navigate',url);await until(async()=>{const state=await invoke(p,'browser-state');return state.url===url&&!state.loading;},'Browser page did not settle: '+url);await delay(150);}
(async()=>{
 const server=http.createServer((req,res)=>{
  const u=new URL(req.url,'http://fixture');requests.push(u.pathname);res.setHeader('Content-Type','text/html');
  if(u.pathname==='/web'){
   const target=new URL(u.searchParams.get('url'));
   if(target.hostname==='challenges.cloudflare.com'){res.setHeader('Content-Type','application/javascript');return res.end('window.dfChallengeResourceLoaded=true;');}
   if(target.hostname==='18comic.vip')return res.end('<title>Just a moment...</title><div id="challenge-running">Local challenge fixture</div><script src="https://challenges.cloudflare.com/turnstile/v0/api.js"></script>');
   if(target.pathname==='/unsafe')return res.end(login('https://evil.test/session'));
   if(target.pathname==='/register')return res.end(login('/signup','autocomplete="new-password"','Create account'));
   if(target.pathname==='/entered')return res.end(login('/session','value="user-typed-password"'));
   if(target.pathname==='/modal')return res.end('<title>Fixture account</title><button onclick="document.body.innerHTML='+JSON.stringify(login()).replace(/&/g,'&amp;').replace(/"/g,'&quot;')+'">Open sign in</button>');
   if(target.pathname==='/login')return res.end(login());
   return res.end('<title>Readable site fixture</title><h1>Ready</h1>');
  }
  if(u.pathname.startsWith('/images/')){res.setHeader('Content-Type','image/png');return res.end(png);}
  const match=u.pathname.match(/^\/gallery\/(\d+)\/?$/);
  if(match){if(match[1]==='11'&&!unlocked)return res.end('<title>Just a moment...</title><div id="challenge-form"></div>');return res.end(`<a href="/g/${match[1]}/1/">Read</a>`);}
  if(/^\/g\/\d+\/1\/$/.test(u.pathname))return res.end(mirror(u.pathname.split('/')[2]));
  res.end('<title>Site ready</title><h1>Local fixture</h1>');
 });await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
 try{
  const core=require('../app/core.cjs'),prefs=core.preferences({autoStart:false,concurrentTasks:1,workers:1},path.join(qa,'downloads'));
  const tasks=[11,12].map(i=>({...core.makeTask(base+'/gallery/'+i+'/',prefs),siteId:'hentaienvy',site:'Reader fixture',status:'paused'}));
  tasks.push({...core.makeTask(base.replace('127.0.0.1','localhost')+'/gallery/13/',prefs),siteId:'hentaienvy',site:'Other host fixture',status:'paused'});
  if(!fs.existsSync(path.join(qa,'state.json')))fs.writeFileSync(path.join(qa,'state.json'),JSON.stringify({prefs,tasks}));
  let p=await launch();assert.equal((await invoke(p,'browser-state')).runtimeReady,false);record('Login support preserves deferred browser startup');
  await p.locator('[data-page=cookies]').first().click();await p.locator('#account-url').fill('https://hentaihere.com/login');await p.locator('#account-username').fill('fixture-person');await p.locator('#account-password').fill('fixture-password-private');await p.locator('#account-form button[type=submit]').click();await p.waitForSelector('[data-account-row]');assert.equal(await p.locator('#account-password').inputValue(),'');
  const initial=await invoke(p,'get-state');assert(!JSON.stringify(initial).includes('fixture-password-private'));assert(!fs.readFileSync(path.join(qa,'accounts.bin')).includes(Buffer.from('fixture-password-private')));record('Account form saves through Windows encryption, clears its password and returns metadata only');
  await navigate(p,'https://hentaihere.com/login');await until(()=>browserPage("document.querySelector('[name=password]').value==='fixture-password-private'"),'Automatic sign-in filling failed');assert.equal(await browserPage("document.querySelector('[name=username]').value"),'fixture-person');assert.equal(await browserPage('typeof window.df'),'undefined');assert.equal(requests.filter(p=>p==='/session').length,0);record('Exact-site HTTPS form fills without submitting or exposing application IPC to the site');
  await navigate(p,'https://hentaihere.com/unsafe');assert.equal(await browserPage("document.querySelector('[name=password]').value"),'');let result=await invoke(p,'browser-fill-login');assert.equal(result.filled,false);assert.match(result.message,/another origin/);record('Cross-origin form destinations do not receive saved credentials');
  await navigate(p,'https://hentaihere.com/register');assert.equal(await browserPage("document.querySelector('[name=password]').value"),'');record('Account creation forms remain unfilled');
  await navigate(p,'https://hentaihere.com/entered');assert.equal(await browserPage("document.querySelector('[name=password]').value"),'user-typed-password');record('Existing password entries are preserved');
  await navigate(p,'https://hentaihere.com.evil.test/login');assert.equal(await browserPage("document.querySelector('[name=password]').value"),'');record('Lookalike domains cannot trigger account autofill');
  const account=(await invoke(p,'get-state')).accountSummary[0];await invoke(p,'accounts-action','autofill',account.id,false);await navigate(p,'https://hentaihere.com/login');assert.equal(await browserPage("document.querySelector('[name=password]').value"),'');result=await invoke(p,'browser-fill-login');assert.equal(result.filled,true);record('Automatic filling can be disabled while manual Fill saved login continues to work');
  await invoke(p,'accounts-action','autofill',account.id,true);
  await browserPage("document.title='Signed in';document.body.innerHTML='<h1>Ready</h1>'");assert.equal((await invoke(p,'access-resume')).resumed,0);record('Sync and resume rechecks AJAX sign-ins without requiring a page navigation');
  await app.evaluate(async({session})=>session.fromPartition('persist:dandf-browser').cookies.set({url:'https://hentaihere.com/',name:'fixture-session',value:'session-private',secure:true,httpOnly:true}));await until(async()=>!!(await invoke(p,'get-state')).cookieSummary.find(c=>c.domain==='hentaihere.com'),'Browser cookie did not sync automatically');await until(async()=>fs.existsSync(path.join(qa,'cookies.bin')),'Encrypted cookies were not saved');record('Session-only sign-in cookies sync to the encrypted downloader vault automatically');
  const exported=path.join(qa,'session-export.json');await app.evaluate(({dialog},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});},exported);await invoke(p,'session-export');for(const secret of ['fixture-password-private','session-private'])assert(!fs.readFileSync(exported,'utf8').includes(secret));record('Session exports exclude saved passwords and cookie values');
  const csv=path.join(qa,'logins.csv');fs.writeFileSync(csv,'name,url,username,password\nLocal,https://other.test/login,imported,imported-secret  ');await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});},csv);assert.equal((await invoke(p,'accounts-import')).count,1);assert.equal((await invoke(p,'get-state')).accountSummary.length,2);await navigate(p,'https://other.test/login');await until(()=>browserPage("document.querySelector('[name=password]').value==='imported-secret  '"),'Imported password whitespace was changed');record('Local Chrome-style CSV import encrypts site logins and preserves password whitespace');
  await p.locator('[data-page=cookies]').first().click();await p.screenshot({path:path.join(qa,'saved-logins.png'),fullPage:true});
  await navigate(p,'https://hentaihere.com/ready');await app.close();app=null;p=await launch();const restored=await invoke(p,'get-state');assert.equal(restored.accountSummary.length,2);assert(restored.cookieSummary.find(c=>c.domain==='hentaihere.com'));const cookies=await app.evaluate(async({session})=>session.fromPartition('persist:dandf-browser').cookies.get({url:'https://hentaihere.com/'}));assert(cookies.some(c=>c.name==='fixture-session'&&c.value==='session-private'));assert(!fs.readFileSync(path.join(qa,'state.json'),'utf8').includes('fixture-password-private'));record('Account vault and session-only cookies survive closing and reopening the application');
  await invoke(p,'browser-settings',{adblock:{custom:'||challenges.cloudflare.com^'},scrolling:{enabled:true,force:true}});await navigate(p,'https://18comic.vip/');await until(async()=>!!(await invoke(p,'browser-state')).page.challenge,'Challenge was not identified');assert.equal(await browserPage('window.dfChallengeResourceLoaded'),true);assert.equal((await invoke(p,'browser-state')).scrolling.enabled,false);await assert.rejects(()=>invoke(p,'access-resume'),/still shows/);record('Challenge scripts load despite ad filters; challenge pages stop scrolling and reject premature resume');
  for(let i=0;i<2;i++){await invoke(p,'browser-action','reload');await delay(500);}
  await until(async()=>(await invoke(p,'browser-state')).page.repeats>=3,'Repeated challenge was not recognized');await p.evaluate(()=>setPage('browser'));await p.waitForSelector('[data-browser=external]');await p.screenshot({path:path.join(qa,'access-recovery.png')});record('Repeated checks offer regular-browser and cookie-import recovery actions');
  requests.length=0;await invoke(p,'queue-action','resume-all');await until(async()=>{const s=await invoke(p,'get-state');return s.tasks[0].errorKind==='access'&&s.tasks[1].status==='paused'&&s.tasks[2].status==='complete';},'Challenge queue did not pause and allow another host to finish');assert.equal(requests.filter(p=>p==='/gallery/11/').length,1);assert.equal(requests.filter(p=>p==='/gallery/12/').length,0);record('A single challenge request pauses other tasks for that host while unrelated downloads continue');
  unlocked=true;await navigate(p,base+'/ready');const resumed=await invoke(p,'access-resume');assert.equal(resumed.resumed,2);await until(async()=>(await invoke(p,'get-state')).tasks.every(t=>t.status==='complete'),'Recovered reader tasks did not finish');assert.equal((await invoke(p,'get-state')).tasks.reduce((n,t)=>n+t.files.length,0),6);record('Sync & resume restarts affected tasks after access succeeds and downloads their complete manifests');
  await invoke(p,'browser-data','clear',{cookies:true});const cleared=await invoke(p,'get-state');assert.equal(cleared.cookieSummary.length,0);assert.equal(cleared.accountSummary.length,2);const remaining=await app.evaluate(async({session})=>session.fromPartition('persist:dandf-browser').cookies.get({url:'https://hentaihere.com/'}));assert.equal(remaining.length,0);record('Clearing cookies removes browser and downloader copies while retaining the separately saved accounts');
  assert.deepEqual(errors,[]);record('No application renderer errors during account, browser and recovery workflows');
 }finally{if(app)await app.close();server.close();fs.writeFileSync(path.join(qa,'readers-report.json'),JSON.stringify({passed:checks.length===19&&!errors.length,checks,errors},null,2));}
})().catch(e=>{console.error(e);process.exitCode=1;});
