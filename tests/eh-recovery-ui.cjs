// Exercises the real worker and queue with an intentionally broken local TLS
// image source. All pages, cookies and image bytes are non-explicit fixtures.
const {_electron:electron}=require('playwright');
const {launchPackaged}=require('./launch_packaged.cjs');
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const qa=path.resolve(process.env.DF_EH_QA||path.join(root,'..','qa-eh-recovery-'+Date.now()));
fs.mkdirSync(qa,{recursive:true});
const image=fs.readFileSync(path.join(root,'assets','icon.png'));
const requests=[],rendererErrors=[];
let mode='ok',tlsFailures=0,holdReload=true,releaseReload;
async function invoke(page,name,...args){return page.evaluate(({name,args})=>window.df.invoke(name,...args),{name,args});}
async function launch(){
  const options={cwd:root,env:{...process.env,DF_DATA_DIR:qa,DF_PYTHON:process.env.DF_PYTHON||path.resolve(root,'..','build-venv','Scripts','python.exe')}};
  return process.env.DF_APP_EXE?launchPackaged(process.env.DF_APP_EXE,options):electron.launch({args:[root],...options,timeout:30000});
}
(async()=>{
  const server=http.createServer((req,res)=>{
    const u=new URL(req.url,'http://fixture');
    requests.push({path:u.pathname,query:Object.fromEntries(u.searchParams),cookie:req.headers.cookie,range:req.headers.range});
    if(u.pathname.startsWith('/s/')){
      const [gid,num]=u.pathname.split('/').at(-1).split('-');
      const respond=()=>{res.writeHead(200,{'Content-Type':'text/html'});res.end(`<img id="img" src="/resampled.png"><a href="/fullimg.php?gid=${gid}&amp;page=${num}&amp;key=fixture">Original</a><a onclick="return nl('next-code')">Reload</a>`);};
      if(holdReload)releaseReload=respond;else setTimeout(respond,100);
    }else if(u.pathname==='/fullimg.php'&&mode==='fail'){
      res.writeHead(503);res.end();
    }else{
      res.writeHead(200,{'Content-Type':'image/png','Content-Length':image.length});res.end(image);
    }
  });
  server.on('clientError',(error,socket)=>{tlsFailures++;socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`,bad=base.replace('http:','https:')+'/h/private-signed-token.png';
  const plugin=path.join(qa,'eh_fixture.py');
  fs.writeFileSync(plugin,`MANIFEST={'api':1,'id':'exhentai','name':'Local H@H recovery fixture','version':'1.0','domains':['127.0.0.1']}
def resolve(url,context):
    gid=int(url.rstrip('/').split('/')[-2])
    num=1 if gid==1 else 2
    failed={'url':${JSON.stringify(bad)},'extension':'png','_eh_source':{'page_url':${JSON.stringify(base)}+'/s/0123456789/'+str(gid)+'-'+str(num),'nl':'old-code','original_link':True}}
    images=[failed] if gid==1 else [{'url':${JSON.stringify(base)}+'/initial.png','extension':'png'},failed]
    return {'title':'H@H connection recovery' if gid==1 else 'Resume keeps completed pages','images':images,'metadata':{'fixture':True}}
`);
  let app;
  try{
    app=await launch();let page=await app.firstWindow();page.on('pageerror',e=>rendererErrors.push(e.message));
    await page.waitForSelector('#task-list .empty-state');
    await invoke(page,'set-prefs',{downloadDir:path.join(qa,'galleries'),workers:1,quality:'original',autoStart:false,delay:.2});
    await page.locator('[data-page="cookies"]').first().click();
    await page.locator('#cookie-text').fill(JSON.stringify([{domain:'127.0.0.1',name:'auth',value:'fixture',path:'/'}]));
    await page.locator('#cookies-paste').click();
    await page.waitForSelector('[data-cookie-remove="127.0.0.1"]');
    await app.evaluate(({dialog},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1});},plugin);
    await page.locator('[data-page="sites"]').first().click();
    await page.locator('[data-action="plugin-import"]').click();await page.waitForSelector('.plugin-row');
    await page.locator('[data-page="queue"]').first().click();
    await invoke(page,'add-urls',base+'/g/1/0123456789/');
    let snapshot=await invoke(page,'get-state'),task=snapshot.tasks[0];assert.equal(task.siteId,'exhentai');
    await invoke(page,'task-action',task.id,'play');
    await page.locator(`[data-task-row="${task.id}"] [role="status"]`).filter({hasText:'Refreshing source for page 1'}).waitFor({timeout:30000});
    await page.screenshot({path:path.join(qa,'refreshing-source.png')});
    // Hold only this fixture response until the recovery note is captured.
    // It prevents a fast successful request from racing the screenshot.
    assert.equal(typeof releaseReload,'function');holdReload=false;releaseReload();releaseReload=null;
    await page.locator(`[data-task-row="${task.id}"] .status-label.complete`).waitFor({timeout:30000});
    snapshot=await invoke(page,'get-state');task=snapshot.tasks.find(t=>t.id===task.id);
    assert.equal(task.done,1);assert.equal(task.transferNote,'');assert.equal(task.quality,'original');assert(fs.readFileSync(task.files[0].path).equals(image));
    assert(tlsFailures>0);assert(requests.some(r=>r.path.startsWith('/s/')&&r.cookie?.includes('auth=fixture')));
    assert(requests.some(r=>r.path==='/fullimg.php'&&r.query.nl==='next-code'&&r.query.key==='fixture'));
    assert(!requests.some(r=>r.path==='/resampled.png'));
    requests.length=0;mode='fail';
    await invoke(page,'add-urls',base+'/g/2/0123456789/');snapshot=await invoke(page,'get-state');
    let second=snapshot.tasks.find(t=>t.url.includes('/g/2/'));await invoke(page,'task-action',second.id,'play');
    await page.locator(`[data-task-row="${second.id}"] .status-label.error`).waitFor({timeout:30000});
    snapshot=await invoke(page,'get-state');second=snapshot.tasks.find(t=>t.id===second.id);
    assert.equal(second.done,1);assert.equal(second.files.length,1);assert(second.error.includes('Page 2'));assert(second.error.includes('completed pages are kept'));assert(!second.error.includes('https://'));assert(!second.error.includes('private-signed-token'));
    assert.equal(requests.filter(r=>r.path.startsWith('/s/')).length,2);assert.equal(requests.filter(r=>r.path==='/fullimg.php').length,2);
    await page.screenshot({path:path.join(qa,'recovery-exhausted.png')});
    const completed=second.files[0].path,mtime=fs.statSync(completed).mtimeMs;
    requests.length=0;mode='ok';await invoke(page,'task-action',second.id,'play');
    await page.locator(`[data-task-row="${second.id}"] .status-label.complete`).waitFor({timeout:30000});
    snapshot=await invoke(page,'get-state');second=snapshot.tasks.find(t=>t.id===second.id);
    assert.equal(second.done,2);assert.equal(second.files.length,2);assert.equal(fs.statSync(completed).mtimeMs,mtime);
    assert(!requests.some(r=>r.path==='/initial.png'));assert(fs.readFileSync(second.files[1].path).equals(image));
    await app.close();app=null;app=await launch();page=await app.firstWindow();await page.waitForSelector('.status-label.complete');
    snapshot=await invoke(page,'get-state');assert.equal(snapshot.tasks.length,2);assert(snapshot.tasks.every(t=>t.status==='complete'));assert(snapshot.cookieSummary.some(c=>c.domain==='127.0.0.1'));assert.deepEqual(rendererErrors,[]);
    const report={passed:true,checks:['Real broken TLS source reaches the site reload flow','Queue shows and clears the page-specific recovery message','Original bytes and query parameters retained without a resampled request','Saved scoped cookie used for reload','Recovery stops after two source refreshes with a readable page error','Resume keeps a completed page and downloads only the failed page','Queue, completed files and cookies survive restart'],tlsFailures,rendererErrors,qaDir:qa};
    fs.writeFileSync(path.join(qa,'eh-recovery-report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{if(app)await app.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
