'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {_electron:electron}=require('playwright'),{launchPackaged}=require('./launch_packaged.cjs');
const root=path.resolve(__dirname,'..'),qa=path.join(root,'..','qa-queue-concurrency-'+Date.now());
fs.mkdirSync(qa,{recursive:true});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{let app;try{
 const options={cwd:root,env:{...process.env,DF_DATA_DIR:qa,DF_SHOW_UI:'0',DF_BROWSER_ENGINE:'cef',DF_USE_BUNDLED:'1'}};app=process.env.DF_APP_EXE?await launchPackaged(process.env.DF_APP_EXE,options):await electron.launch({args:[root],...options,timeout:60000});
 const page=await app.firstWindow();await page.waitForSelector('#urls');const call=(name,...args)=>page.evaluate(({name,args})=>window.df.invoke(name,...args),{name,args});
 await call('set-prefs',{workers:50,delay:.7,autoStart:true,concurrentTasks:5,downloadDir:path.join(qa,'downloads')});
 let urls=Array.from({length:8},(_,i)=>'dfdemo://sample/'+(i+1)+'?sampleDelay=2').join('\n');let added=await call('add-urls',urls);assert.equal(added.added.length,8);
 let state;for(let i=0;i<100;i++){state=await call('get-state');if(state.tasks.filter(t=>['resolving','downloading'].includes(t.status)).length>=3)break;await wait(100);}
 assert(state.tasks.filter(t=>['resolving','downloading'].includes(t.status)).length>=3,'Expected simultaneous active downloads');assert(state.tasks.every(t=>t.workers===50));assert.equal(state.prefs.delay,.7);
 let start=Date.now();await call('queue-action','pause-all');state=await call('get-state');assert(state.tasks.every(t=>['paused','complete'].includes(t.status)),JSON.stringify(state.tasks.map(t=>({status:t.status,error:t.error}))));assert(Date.now()-start<5000,'Pause all took too long');
 await call('bulk-task-action',added.added.slice(0,3),'play');for(let i=0;i<50;i++){state=await call('get-state');if(state.tasks.filter(t=>['resolving','downloading'].includes(t.status)).length>=2)break;await wait(100);}
 await call('bulk-task-action',added.added.slice(0,3),'stop');state=await call('get-state');assert(state.tasks.filter(t=>added.added.slice(0,3).includes(t.id)).every(t=>['stopped','complete'].includes(t.status)));
 await call('queue-action','resume-all');await call('queue-action','stop-all');state=await call('get-state');assert(state.tasks.every(t=>['stopped','complete'].includes(t.status)));
 console.log('PASS simultaneous pause, bulk stop, global stop, 50 workers and saved delay in an isolated profile');
 }finally{await app?.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
