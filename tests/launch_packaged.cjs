// Packaged Electron applications ignore the development -r loader switch used
// by Playwright. Attach to Chromium and Node's inspectors instead. Nothing is
// injected into production app code or exposed to remote website content.
const {spawn}=require('node:child_process');
const net=require('node:net');
const {chromium}=require('playwright');
async function launchPackaged(executablePath,{cwd,env}){
  // NSIS portable launchers can omit the child Electron stderr handles. Reserve
  // two local ports first so both portable and unpacked apps can be discovered.
  const reserve=()=>new Promise((resolve,reject)=>{const server=net.createServer();server.once('error',reject);server.listen(0,'127.0.0.1',()=>resolve({server,port:server.address().port}));});
  const slots=await Promise.all([reserve(),reserve()]);const [nodePort,chromePort]=slots.map(s=>s.port);
  await Promise.all(slots.map(s=>new Promise(resolve=>s.server.close(resolve))));
  const child=spawn(executablePath,[`--inspect=127.0.0.1:${nodePort}`,`--remote-debugging-port=${chromePort}`],{cwd,env,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let output='',nodeUrl,chromeUrl;
  const endpoints=new Promise((resolve,reject)=>{
    let checking=false;
    const timer=setTimeout(()=>{clearInterval(poll);reject(new Error('Packaged app did not open its inspectors: '+output.slice(-3000)));},120000);
    const poll=setInterval(async()=>{
      if(checking)return;checking=true;
      try{
        const [n,c]=await Promise.all([fetch(`http://127.0.0.1:${nodePort}/json/list`,{signal:AbortSignal.timeout(1500)}).then(r=>r.json()),fetch(`http://127.0.0.1:${chromePort}/json/version`,{signal:AbortSignal.timeout(1500)}).then(r=>r.json())]);
        const local=(u,port)=>{try{const p=new URL(u);return p.protocol==='ws:'&&p.hostname==='127.0.0.1'&&p.port===String(port);}catch{return false;}};
        if(local(n[0]?.webSocketDebuggerUrl,nodePort)&&local(c.webSocketDebuggerUrl,chromePort)){nodeUrl=n[0].webSocketDebuggerUrl;chromeUrl=c.webSocketDebuggerUrl;clearInterval(poll);clearTimeout(timer);resolve();}
      }catch{}finally{checking=false;}
    },200);
    child.on('error',reject);
    child.stderr.on('data',data=>{
      output+=data.toString();nodeUrl=output.match(/Debugger listening on (ws:\/\/[^\s]+)/)?.[1];chromeUrl=output.match(/DevTools listening on (ws:\/\/[^\s]+)/)?.[1];
      if(nodeUrl&&chromeUrl){clearInterval(poll);clearTimeout(timer);resolve();}
    });
    child.stdout.on('data',()=>{});
    child.once('exit',code=>{if(!nodeUrl||!chromeUrl){clearInterval(poll);clearTimeout(timer);reject(new Error('Packaged app exited: '+code+' '+output.slice(-3000)));}});
  });
  await endpoints;
  const socket=new WebSocket(nodeUrl),pending=new Map();let sequence=0;
  await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
  socket.addEventListener('message',event=>{const data=JSON.parse(event.data);if(data.id&&pending.has(data.id)){const entry=pending.get(data.id);pending.delete(data.id);clearTimeout(entry.timer);data.error?entry.reject(new Error(data.error.message)):entry.resolve(data.result);}});
  function evaluateExpression(expression){return new Promise((resolve,reject)=>{const id=++sequence;const timer=setTimeout(()=>{pending.delete(id);reject(new Error('Main-process evaluation timed out.'));},60000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method:'Runtime.evaluate',params:{expression,awaitPromise:true,returnByValue:true}}));});}
  const browser=await chromium.connectOverCDP(chromeUrl,{timeout:30000});
  const electronExpression="process.getBuiltinModule('module').createRequire(process.resourcesPath + '/app.asar/app/main.cjs')('electron')";
  return {
    firstWindow:async()=>{const ctx=browser.contexts()[0];let page=ctx.pages().find(p=>p.url().includes('index.html'));if(!page)page=await ctx.waitForEvent('page');return page;},
    evaluate:async(fn,arg)=>{const r=await evaluateExpression(`(${fn.toString()})(${electronExpression},${JSON.stringify(arg??null)})`);if(r.exceptionDetails)throw new Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result?.value;},
    close:async()=>{
      try{await evaluateExpression(`setImmediate(()=>${electronExpression}.app.quit());undefined`);}catch{}
      socket.close();await browser.close().catch(()=>{});
      if(child.exitCode===null)await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},10000);child.once('exit',()=>{clearTimeout(timer);resolve();});});
    }
  };
}
module.exports={launchPackaged};
