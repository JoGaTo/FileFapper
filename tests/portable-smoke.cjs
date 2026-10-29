const {spawn}=require('node:child_process');
const {chromium}=require('playwright');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const qa=path.resolve(process.env.DF_PORTABLE_QA||path.join(root,'..','portable-smoke-'+Date.now()));
if(fs.existsSync(path.join(qa,'state.json')))throw new Error('Choose a fresh DF_PORTABLE_QA directory; existing profiles are never overwritten.');
fs.mkdirSync(qa,{recursive:true});
const executable=process.env.DF_PORTABLE_EXE||path.join(root,'release',`DandF-${require('../package.json').version}-Windows-x64.exe`);
(async()=>{
  const child=spawn(executable,['--remote-debugging-port=0'],{cwd:root,windowsHide:true,stdio:'ignore',env:{...process.env,DF_DATA_DIR:qa,DF_PYTHON:path.join(qa,'python-not-installed.exe')}});
  let browser;
  try{
    const portFile=path.join(qa,'DevToolsActivePort');let port;
    for(let i=0;i<120;i++){if(fs.existsSync(portFile)){port=Number(fs.readFileSync(portFile,'utf8').split('\n')[0]);if(port)break;}await new Promise(r=>setTimeout(r,500));}
    if(!port)throw new Error('The portable launcher did not open the app within 60 seconds.');
    browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);
    const ctx=browser.contexts()[0];let page=ctx.pages().find(p=>p.url().includes('index.html'))||await ctx.waitForEvent('page');
    await page.waitForSelector('#task-list .empty-state');
    await page.evaluate(async folder=>{await window.df.invoke('set-prefs',{downloadDir:folder,workers:2});await window.df.invoke('add-urls','dfdemo://sample/design');},path.join(qa,'galleries'));
    await page.waitForSelector('.status-label.complete',{timeout:30000});
    const snapshot=await page.evaluate(()=>window.df.invoke('get-state'));assert.equal(snapshot.tasks[0].done,12);assert.equal(snapshot.tasks[0].files.length,12);assert.equal(snapshot.engine.bundled,true);
    const diagnostics=await page.evaluate(()=>window.df.invoke('diagnostics'));assert.equal(diagnostics.engine,'1.32.17');
    await page.screenshot({path:path.join(qa,'portable.png')});
    const report={passed:true,executable,pages:12,bundledRuntime:true,engine:diagnostics.engine,python:diagnostics.python,externalPythonPath:'intentionally nonexistent',qaDir:qa};
    fs.writeFileSync(path.join(qa,'portable-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
    await page.evaluate(()=>window.df.invoke('window-control','close')).catch(()=>{});
  }finally{
    if(browser)await browser.close().catch(()=>{});
    if(child.exitCode===null)await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},15000);child.once('exit',()=>{clearTimeout(timer);resolve();});});
  }
})().catch(e=>{console.error(e);process.exitCode=1;});
