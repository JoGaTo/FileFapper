'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),crypto=require('node:crypto');
const {EventEmitter}=require('node:events'),{Writable,PassThrough}=require('node:stream');
const {EdgeRuntime,EdgeSession}=require('../app/edge-runtime.cjs');
const {source,CHUNK_BYTES,MAX_BYTES,REQUEST_TIMEOUT_MS}=require('../app/edge-pixiv-bridge.cjs');
class RuntimeFixture extends EventEmitter{
 constructor(){super();this.views=new Map();this.calls=[];this.jar=[];this.started=false;this.identity={engine:'Microsoft Edge WebView2',version:'150.fixture'};this.options={};}
 async call(method,params={}){this.started=true;this.calls.push({method,params});return {};}
 async cdp(tabId,method,args={}){this.started=true;this.calls.push({method:'cdp:'+method,args,tabId});if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'frame',url:'about:blank'}}};if(method==='Storage.getCookies')return {cookies:this.jar};if(method==='Network.setCookie'){this.jar.push({...args,domain:args.domain||new URL(args.url).hostname,session:args.expires===undefined,expires:args.expires??-1});return {success:true};}if(method==='Runtime.evaluate')return {result:{value:'Mozilla/5.0 Chrome/150.2.3.4 Safari/537.36 Edg/150.2.3.4'}};if(method==='Browser.getVersion')throw new Error('Browser domain unavailable in this fixture');return {};}
 async close(){this.closed=true;}
}
const makeSession=()=>new EdgeSession({runtime:new RuntimeFixture(),dataDir:'C:/isolated-hardening',qaMode:true});
function pageBridge(){
 const posted=[],timers=new Map();let listener,sequence=0;
 const webview={addEventListener(type,fn){assert.equal(type,'message');listener=fn;},postMessage(value){posted.push(value);}};
 const window={chrome:{webview}};window.top=window;
 const box=vm.createContext({window,chrome:window.chrome,location:{protocol:'https:',hostname:'www.pixiv.net'},URL,Uint8Array,crypto:{randomUUID:()=>crypto.randomUUID()},atob:value=>Buffer.from(value,'base64').toString('binary'),setTimeout(fn,ms){const id=++sequence;timers.set(id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}});
 vm.runInContext(source,box);
 return {request:()=>window.__dfPixivNetwork.request({url:'https://i.pximg.net/media.png',method:'GET'}),receive:m=>listener({data:m}),posted,timers,window};
}
test('host-side Pixiv work caps four raw page messages, deduplicates IDs and retains the cap across navigation',async()=>{
 const s=makeSession(),w=s.createView({id:'tab'}).webContents;w.url='https://www.pixiv.net/artworks/1';const pending=[];
 s.setPixivHandler(()=>new Promise(resolve=>pending.push(resolve)));
 const event=id=>({tabId:'tab',source:w.getURL(),message:{kind:'df-pixiv-fetch',method:'GET',url:'https://i.pximg.net/image.png',id}});
 const four=[0,1,2,3].map(i=>s.webMessage(event('raw-'+i)));assert.equal(pending.length,4);
 await s.webMessage(event('raw-0'));assert.equal(pending.length,4);
 await s.webMessage(event('fifth'));assert.equal(pending.length,4);assert.equal(s.pixivActive.get('tab').size,4);
 w.generation++;await s.webMessage(event('after-navigation'));assert.equal(pending.length,4);
 pending[0]({bytes:new Uint8Array([1])});await four[0];assert.equal(s.pixivActive.get('tab').size,3);
 const fresh=s.webMessage(event('fresh'));assert.equal(pending.length,5);pending[4]({bytes:new Uint8Array([2])});await fresh;
 for(let i=1;i<4;i++)pending[i]({bytes:new Uint8Array([3])});await Promise.all(four);
 assert.equal(s.pixivActive.size,0);const replies=s.runtime.calls.filter(c=>c.method==='post-message').map(c=>c.params.message);
 assert.equal(replies.filter(m=>m.result?.error?.includes('Too many')).length,2);assert.equal(replies.filter(m=>m.result?.bytes).length,1);
 s.setPixivHandler(async()=>{throw new Error('fixture failure');});await s.webMessage(event('fails'));assert.equal(s.pixivActive.size,0);await s.close();
});
test('large native media uses bounded base64 chunks and the actual page bootstrap reconstructs exact bytes',async()=>{
 const s=makeSession(),w=s.createView({id:'tab'}).webContents;w.url='https://www.pixiv.net/artworks/1';
 const page=pageBridge(),bytes=Buffer.alloc(CHUNK_BYTES*3+71);for(let i=0;i<bytes.length;i++)bytes[i]=i%251;
 s.setPixivHandler(async()=>({bytes:new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength)}));
 const original=s.runtime.call.bind(s.runtime);s.runtime.call=async(method,params)=>{const result=await original(method,params);if(method==='post-message')page.receive(params.message);return result;};
 const resultPromise=page.request(),request=page.posted[0];await s.webMessage({tabId:'tab',source:w.getURL(),message:request});const result=await resultPromise;
 assert(result.bytes instanceof Uint8Array);assert(Buffer.from(result.bytes).equals(bytes));assert.equal(page.timers.size,0);
 const messages=s.runtime.calls.filter(c=>c.method==='post-message').map(c=>c.params.message);
 assert.equal(messages[0].kind,'df-pixiv-start');assert.equal(messages.at(-1).kind,'df-pixiv-complete');assert.equal(messages.filter(m=>m.kind==='df-pixiv-chunk').length,4);
 assert(messages.every(m=>Buffer.byteLength(JSON.stringify(m))<2*CHUNK_BYTES));assert.equal(s.pixivActive.size,0);await s.close();
});
test('host rejects oversized media without sending an oversized native RPC',async()=>{
 const s=makeSession(),w=s.createView({id:'tab'}).webContents;w.url='https://www.pixiv.net/artworks/1';
 s.setPixivHandler(async()=>({bytes:Buffer.alloc(MAX_BYTES+1)}));await s.webMessage({tabId:'tab',source:w.getURL(),message:{kind:'df-pixiv-fetch',id:'large',url:'https://i.pximg.net/a',method:'GET'}});
 const sent=s.runtime.calls.filter(c=>c.method==='post-message');assert.equal(sent.length,1);assert(sent[0].params.message.result.error);assert(Buffer.byteLength(JSON.stringify(sent[0]))<2000);assert.equal(s.pixivActive.size,0);await s.close();
});
test('page bootstrap rejects oversized, missing, duplicate or out-of-order chunks and premature completion',async()=>{
 for(const mode of ['oversized','out-of-order','short-data','duplicate-start','early-complete']){
  const page=pageBridge(),promise=page.request(),id=page.posted[0].id,start={kind:'df-pixiv-start',id,totalBytes:CHUNK_BYTES+1,chunkSize:CHUNK_BYTES,chunks:2};
  if(mode==='oversized')page.receive({...start,totalBytes:MAX_BYTES+1,chunks:Math.ceil((MAX_BYTES+1)/CHUNK_BYTES)});
  else{page.receive(start);if(mode==='out-of-order')page.receive({kind:'df-pixiv-chunk',id,index:1,base64:'AA=='});if(mode==='short-data')page.receive({kind:'df-pixiv-chunk',id,index:0,base64:'AA=='});if(mode==='duplicate-start')page.receive(start);if(mode==='early-complete')page.receive({kind:'df-pixiv-complete',id,totalBytes:start.totalBytes,chunks:2});}
  const result=await promise;assert(result.error,mode);assert.equal(result.bytes,undefined);assert.equal(page.timers.size,0,mode);
 }
});
test('page bootstrap keeps a bounded request timeout and accepts legacy small byte replies',async()=>{
 const timed=pageBridge(),promise=timed.request(),id=timed.posted[0].id;assert.equal([...timed.timers.values()][0].ms,REQUEST_TIMEOUT_MS);
 timed.receive({kind:'df-pixiv-start',id,totalBytes:CHUNK_BYTES+1,chunkSize:CHUNK_BYTES,chunks:2});[...timed.timers.values()][0].fn();assert((await promise).error.includes('timed out'));assert.equal(timed.timers.size,0);
 const small=pageBridge(),legacy=small.request();small.receive({kind:'df-pixiv-reply',id:small.posted[0].id,result:{bytes:[1,2,255]}});assert.deepEqual([...((await legacy).bytes)],[1,2,255]);assert.equal(small.timers.size,0);
});
test('failed native initialization kills its own helper, closes its reader, then permits a clean retry',async()=>{
 const children=[];let serial=0;
 const spawnImpl=()=>{const number=++serial,child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.exitCode=null;child.kills=0;child.kill=()=>{child.kills++;child.exitCode=0;child.emit('exit',0);return true;};
 child.stdin=new Writable({write(chunk,_encoding,done){const m=JSON.parse(chunk.toString());queueMicrotask(()=>{child.stdout.write(JSON.stringify(number===1&&m.method==='init'?{id:m.id,error:{message:'Fixture missing WebView2 runtime'}}:{id:m.id,result:{engine:'Microsoft Edge WebView2',version:'150.fixture'}})+'\n');if(m.method==='shutdown')child.kill();});done();}});children.push(child);return child;};
 const runtime=new EdgeRuntime({spawnImpl,dataDir:'C:/isolated-init',downloadDir:'C:/isolated-downloads'});
 await assert.rejects(()=>runtime.start(),/Fixture missing/);assert.equal(children[0].kills,1);assert(children[0].stdin.destroyed);assert.equal(runtime.child,null);assert.equal(runtime.lines,null);assert.equal(runtime.pending.size,0);
 await runtime.start();const current=runtime.child;children[0].emit('exit',0);children[0].emit('error',new Error('late old helper event'));assert.equal(runtime.child,current);assert(runtime.started);assert.equal(serial,2);await runtime.close();assert.equal(children[1].kills,1);
});
test('worker preparation remains deferred until requested, restores cookies and obtains actual Edge UA without Browser domain support',async()=>{
 const s=makeSession();s.setInitialCookies([{domain:'fixture.test',hostOnly:true,name:'login',value:'synthetic',path:'/',secure:true,session:true}]);s.setUserAgent('pretend old identity');
 assert.equal(s.runtime.calls.length,0);const prepared=await s.prepareForWorker();assert(prepared.userAgent.includes('Edg/150.2.3.4'));assert.equal(s.getUserAgent(),prepared.userAgent);assert.equal(prepared.initialCookies.browserAccepted,1);
 assert(s.runtime.calls.some(c=>c.method==='cdp:Storage.getCookies'));assert(s.runtime.calls.some(c=>c.method==='cdp:Runtime.evaluate'&&c.args.expression==='navigator.userAgent'));await s.close();
 const broken=makeSession();broken.runtime.cdp=async()=>({});await assert.rejects(()=>broken.prepareForWorker(),/identity could not be read/);await broken.close();
});
test('browser download folder is queued before startup, passed to init and updated for a live helper',async()=>{
 const s=makeSession();await s.setDownloadDir('C:/first-downloads');assert.equal(s.runtime.calls.length,0);assert.equal(s.runtime.options.downloadDir,'C:/first-downloads');
 await s.prepareForWorker();await s.setDownloadDir('C:/second-downloads');assert.equal(s.runtime.calls.find(c=>c.method==='configure-downloads').params.directory,'C:/second-downloads');await assert.rejects(()=>s.setDownloadDir('bad\0folder'),/valid/);await s.close();
 const commands=[];const spawnImpl=()=>{const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.exitCode=null;child.kill=()=>{child.exitCode=0;child.emit('exit',0);};child.stdin=new Writable({write(chunk,_e,done){const m=JSON.parse(chunk.toString());commands.push(m);queueMicrotask(()=>{child.stdout.write(JSON.stringify({id:m.id,result:{version:'150.fixture'}})+'\n');if(m.method==='shutdown')child.kill();});done();}});return child;};
 const runtime=new EdgeRuntime({spawnImpl,dataDir:'C:/profile',downloadDir:'C:/init-downloads'});await runtime.start();assert.equal(commands[0].params.downloadDir,'C:/init-downloads');await runtime.close();
});
test('the first native cookie poll captures server-created cookies while restoration baselines stay silent',async()=>{
 const s=makeSession(),changed=[];s.cookies.on('changed',(_event,cookie,_cause,removed)=>changed.push({name:cookie.name,removed}));s.runtime.jar=[{name:'server-login',value:'synthetic',domain:'fixture.test',path:'/',secure:true,httpOnly:true,session:true,expires:-1}];s.runtime.started=true;await s.cookies.poll();assert.deepEqual(changed,[{name:'server-login',removed:false}]);await s.cookies.poll();assert.equal(changed.length,1);await s.close();
});

test('failed initial browser cookie restoration retains its rows and can retry after runtime recovery',async()=>{
 const s=makeSession(),call=s.runtime.call.bind(s.runtime);let failOnce=true;
 s.runtime.call=async(method,params)=>{if(method==='create'&&failOnce){failOnce=false;throw new Error('Fixture Edge startup failure');}return call(method,params);};
 s.setInitialCookies([{domain:'fixture.test',hostOnly:true,name:'retained-login',value:'synthetic',path:'/',secure:true,session:true}]);
 await assert.rejects(()=>s.ensureInitialCookies(),/startup failure/);assert.equal(s._initialPromise,null);assert.equal(s._initialRows.length,1);
 const result=await s.ensureInitialCookies();assert.equal(result.browserAccepted,1);assert.equal(result.browserRejected,0);assert.equal((await s.cookies.get({url:'https://fixture.test/'}))[0].name,'retained-login');await s.close();
});

test('a download folder changed during helper startup is applied when initialization finishes',async()=>{
 const commands=[];let releaseInit;
 const spawnImpl=()=>{const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.exitCode=null;child.kill=()=>{child.exitCode=0;child.emit('exit',0);};child.stdin=new Writable({write(chunk,_e,done){const m=JSON.parse(chunk.toString());commands.push(m);const reply=()=>child.stdout.write(JSON.stringify({id:m.id,result:{version:'150.fixture'}})+'\n');if(m.method==='init')releaseInit=reply;else queueMicrotask(()=>{reply();if(m.method==='shutdown')child.kill();});done();}});return child;};
 const runtime=new EdgeRuntime({spawnImpl,dataDir:'C:/profile',downloadDir:'C:/original-downloads'}),s=new EdgeSession({runtime,dataDir:'C:/profile'});
 const ready=runtime.start();assert.equal(commands[0].params.downloadDir,'C:/original-downloads');await s.setDownloadDir('C:/changed-during-init');releaseInit();await ready;
 assert.equal(commands.find(c=>c.method==='configure-downloads').params.directory,'C:/changed-during-init');await s.close();
});


test('navigation is loading while saved cookies and native surface startup are pending',async()=>{
 const s=new EdgeSession({runtime:new RuntimeFixture(),dataDir:'C:/fixture'});
 let release;const waiting=new Promise(resolve=>{release=resolve;});s.ensureInitialCookies=()=>waiting;
 const w=s.createView({id:'pending-navigation'}).webContents;const navigation=w.loadURL('https://fixture.test/');
 assert.equal(w.isLoading(),true);release();await navigation;await s.close();
});

