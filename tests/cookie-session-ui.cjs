'use strict';
const {_electron:electron}=require('playwright');
const {launchPackaged}=require('./launch_packaged.cjs');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const qa=path.resolve(process.env.DF_COOKIES_QA||path.join(root,'..','qa-cookie-recovery-source'));
for(const file of ['state.json','cookies.bin','Partitions'])if(fs.existsSync(path.join(qa,file)))throw new Error('Choose a fresh DF_COOKIES_QA test directory; existing profiles are never overwritten.');
fs.mkdirSync(qa,{recursive:true});
const checks=[],rendererErrors=[],scopeSwitch=[];
const secrets=[];
let app,p;
const invoke=(name,...args)=>p.evaluate(({name,args})=>window.df.invoke(name,...args),{name,args});
const record=text=>{checks.push(text);console.log('PASS '+text);};
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(fn,message){for(let i=0;i<100;i++){if(await fn())return;await delay(75);}throw new Error(message);}
async function launch(){
  const options={cwd:root,env:{...process.env,DF_DATA_DIR:qa,DF_PYTHON:'C:\\DandF-cookie-test-no-python\\python.exe'}};
  app=process.env.DF_APP_EXE?await launchPackaged(process.env.DF_APP_EXE,options):await electron.launch({args:[root],...options,timeout:30000});
  p=await app.firstWindow();p.on('pageerror',error=>rendererErrors.push(error.message));await p.waitForSelector('#urls');
  await app.evaluate(({session})=>{
    const browser=session.fromPartition('persist:dandf-browser');
    browser.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(_,done)=>done({cancel:true}));
  });
}
async function browserCookies(url='https://fake.test/'){
  return app.evaluate(async({session},url)=>session.fromPartition('persist:dandf-browser').cookies.get(url?{url}:{}),url);
}
async function importRow(row){
  if(typeof row.value==='string')secrets.push(row.value);
  return invoke('cookies-import-text',JSON.stringify([row]));
}
function accepted(result){assert.equal(result.count,1);assert.equal(result.browserAccepted,1);assert.equal(result.browserRejected,0);}
const row=(name,extra={})=>({domain:'fake.test',hostOnly:true,name,value:'synthetic-private-'+name,path:'/',secure:true,httpOnly:true,session:true,sameSite:'Lax',...extra});
const safeScope=cookie=>({domain:cookie.domain,path:cookie.path,hostOnly:cookie.hostOnly,secure:cookie.secure});
async function switched(hostOnly){
  accepted(await importRow(row('scope-switch',{domain:hostOnly?'.fake.test':'fake.test',hostOnly,value:hostOnly?'synthetic-private-switch-host':'synthetic-private-switch-domain'})));
  const found=(await browserCookies()).filter(cookie=>cookie.name==='scope-switch');
  const diagnostic={requestedHostOnly:hostOnly,count:found.length,scopes:found.map(safeScope)};
  scopeSwitch.push(diagnostic);
  fs.writeFileSync(path.join(qa,'cookie-scope-diagnostic.json'),JSON.stringify({scopeSwitch},null,2));
  return found;
}
(async()=>{
  try{
    await launch();
    assert(await app.evaluate(({safeStorage})=>safeStorage.isEncryptionAvailable()),'Cookie recovery checks require Windows credential encryption.');
    assert.equal((await invoke('get-state')).tasks.length,0);record('Cookie tests use a fresh empty profile with Windows encryption and offline synthetic hosts');

    accepted(await importRow(row('domain-login',{hostOnly:false,domain:'fake.test'})));
    const shared=(await browserCookies('https://www.fake.test/')).find(cookie=>cookie.name==='domain-login');
    assert(shared,'An explicit domain cookie did not reach its www hostname.');assert.equal(shared.domain,'.fake.test');assert.equal(shared.hostOnly,false);
    assert.equal((await browserCookies('https://fake.test.evil.test/')).some(cookie=>cookie.name==='domain-login'),false);
    record('Extension domain cookies without leading dots reach legitimate subdomains and exclude lookalike hosts');

    accepted(await importRow(row('host-login',{domain:'.fake.test',hostOnly:true})));
    const only=(await browserCookies()).find(cookie=>cookie.name==='host-login');
    assert(only);assert.equal(only.domain,'fake.test');assert.equal(only.hostOnly,true);
    assert.equal((await browserCookies('https://www.fake.test/')).some(cookie=>cookie.name==='host-login'),false);
    record('Explicit host-only imports remain host-only in Chromium even when the exported domain had a dot');

    accepted(await importRow(row('__Host-fixture',{sameSite:'None',expirationDate:1})));
    const prefixed=(await browserCookies()).find(cookie=>cookie.name==='__Host-fixture');
    assert(prefixed,'The valid __Host- cookie was rejected by Chromium.');assert.equal(prefixed.hostOnly,true);assert.equal(prefixed.secure,true);assert.equal(prefixed.path,'/');assert.equal(prefixed.httpOnly,true);assert.equal(prefixed.sameSite,'no_restriction');
    assert.equal(prefixed.session,true);assert.equal(prefixed.expirationDate,undefined);
    record('Valid Secure host-only __Host cookies and SameSite=None import successfully; session status overrides stale exporter expiry');

    const rejectedSecret='synthetic-private-browser-rejected';
    const rejected=await importRow(row('browser-rejected',{sameSite:'None',secure:false,value:rejectedSecret}));
    assert.equal(rejected.count,1);assert.equal(rejected.browserAccepted,0);assert.equal(rejected.browserRejected,1);
    assert.equal(typeof rejected.note,'string');assert(rejected.note.length>0);assert(!JSON.stringify(rejected).includes(rejectedSecret));
    assert.equal((await browserCookies()).some(cookie=>cookie.name==='browser-rejected'),false);
    record('Browser-rejected attributes are reported separately without exposing the cookie value');

    accepted(await importRow(row('scope-switch',{path:'/unrelated'})));
    accepted(await importRow(row('scope-switch',{domain:'child.fake.test'})));
    await switched(false);const hostSwitch=await switched(true);const domainSwitch=await switched(false);
    assert.equal(hostSwitch.length,1,'Domain-to-host-only replacement left duplicate browser entries; see cookie-scope-diagnostic.json');
    assert.equal(hostSwitch[0].hostOnly,true);
    assert.equal(domainSwitch.length,1,'Host-only-to-domain replacement left duplicate browser entries; see cookie-scope-diagnostic.json');
    assert.equal(domainSwitch[0].hostOnly,false);
    const unrelated=(await browserCookies(null)).filter(cookie=>cookie.name==='scope-switch');
    assert.equal(unrelated.filter(cookie=>cookie.domain==='fake.test'&&cookie.path==='/unrelated'&&cookie.hostOnly).length,1,'Scope cleanup changed an unrelated path.');
    assert.equal(unrelated.filter(cookie=>cookie.domain==='child.fake.test'&&cookie.path==='/'&&cookie.hostOnly).length,1,'Scope cleanup changed an unrelated child host.');
    record('Replacing the same canonical domain/path/name updates scope without duplicating cookies or changing unrelated paths and child hosts');

    const retainedSecret='synthetic-private-preserved-valid';
    accepted(await importRow(row('retain-on-reject',{value:retainedSecret})));
    const invalidReplacement=await importRow(row('retain-on-reject',{sameSite:'None',secure:false,value:'synthetic-private-invalid-replacement'}));
    assert.equal(invalidReplacement.browserAccepted,0);assert.equal(invalidReplacement.browserRejected,1);
    assert.equal((await browserCookies()).find(cookie=>cookie.name==='retain-on-reject')?.value,retainedSecret,'A rejected replacement removed the working browser cookie.');
    record('A browser-rejected replacement keeps the current working browser cookie');

    await until(()=>fs.existsSync(path.join(qa,'cookies.bin')),'The cookie vault was not saved.');
    const vaultBytes=fs.readFileSync(path.join(qa,'cookies.bin'));
    for(const secret of secrets)assert(!vaultBytes.includes(Buffer.from(secret)),'The saved cookie vault contains a plaintext fixture value.');
    const snapshot=await invoke('get-state');for(const secret of secrets)assert(!JSON.stringify(snapshot).includes(secret),'A public snapshot exposed a fixture cookie value.');
    await app.close();app=null;await launch();
    const restored=await browserCookies();
    for(const name of ['domain-login','host-login','__Host-fixture','scope-switch'])assert.equal(restored.filter(cookie=>cookie.name===name).length,1,'A cookie was lost or duplicated after restart: '+name);
    assert.equal(restored.find(cookie=>cookie.name==='host-login').hostOnly,true);
    assert.equal(restored.find(cookie=>cookie.name==='__Host-fixture').hostOnly,true);
    assert.equal(restored.find(cookie=>cookie.name==='__Host-fixture').session,true);
    assert.equal(restored.find(cookie=>cookie.name==='scope-switch').hostOnly,false);
    assert.equal((await browserCookies('https://www.fake.test/')).some(cookie=>['host-login','__Host-fixture'].includes(cookie.name)),false);
    assert.equal(restored.some(cookie=>cookie.name==='browser-rejected'),false);
    record('Encrypted vault restart restores valid session cookies with their original host-only and domain scopes');

    assert.deepEqual(rendererErrors,[]);record('No renderer errors during import, rejection reporting, scope replacement or restart');
    fs.writeFileSync(path.join(qa,'cookie-session-report.json'),JSON.stringify({passed:true,packaged:!!process.env.DF_APP_EXE,qa,checks,scopeSwitch,rendererErrors,externalRequests:'Browser HTTP(S) requests blocked; only synthetic cookie APIs were used.'},null,2));
    console.log(JSON.stringify({passed:true,checks:checks.length,qa}));
  }catch(error){
    fs.writeFileSync(path.join(qa,'failure.txt'),error.stack);
    fs.writeFileSync(path.join(qa,'cookie-session-report.json'),JSON.stringify({passed:false,packaged:!!process.env.DF_APP_EXE,qa,checks,scopeSwitch,rendererErrors,error:error.message},null,2));
    throw error;
  }finally{await app?.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
