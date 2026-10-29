'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),{PassThrough,Writable}=require('node:stream');
const {EdgeSession,EdgeRuntime,cookieForCdp,cookieFromCdp,cookieMatches,pixivUrl,mediaUrl,nativeHandle}=require('../app/edge-runtime.cjs');
class FakeRuntime extends EventEmitter{
 constructor(){super();this.views=new Map();this.calls=[];this.started=false;this.identity={engine:'Microsoft Edge WebView2',version:'150.test'};this.jar=new Map();this.streams=new Map();this.evalResult=null;this.context=20;}
 async call(method,params={}){this.calls.push({method,params});this.started=true;if(method==='cdp')return this.cdp(params.tabId,params.method,params.args);return {};}
 async cdp(tabId,method,args={}){
  this.calls.push({method:'cdp:'+method,tabId,args});this.started=true;
  if(method==='Page.getFrameTree')return {frameTree:{frame:{id:'main-'+tabId,url:'https://fixture.test/'},childFrames:[{frame:{id:'child-'+tabId,url:'https://frame.test/'}}]}};
  if(method==='Page.createIsolatedWorld')return {executionContextId:++this.context};
  if(method==='Browser.getVersion')return {userAgent:'Mozilla/5.0 Chrome/150.0.1.2 Safari/537.36 Edg/150.0.1.2'};
  if(method==='Storage.getCookies')return {cookies:[...this.jar.values()]};
  if(method==='Network.setCookie'){
   const domain=args.domain||new URL(args.url).hostname,key=JSON.stringify([domain,args.path,args.name]);
   if(args.expires!==undefined&&args.expires<=Date.now()/1000)this.jar.delete(key);
   else this.jar.set(key,{...args,domain,expires:args.expires??-1,session:args.expires===undefined});
   return {success:true};
  }
  if(method==='Network.deleteCookies'){for(const [key,c]of this.jar)if(c.name===args.name&&cookieMatches(cookieFromCdp(c),{url:args.url}))this.jar.delete(key);return {};}
  if(method==='Runtime.evaluate')return {result:{value:typeof this.evalResult==='function'?this.evalResult(args):this.evalResult}};
  if(method==='Network.loadNetworkResource')return {resource:{success:true,httpStatusCode:200,headers:{'Content-Type':'text/plain'},stream:'fixture-stream'}};
  if(method==='IO.read')return this.streams.get(args.handle)?.shift()||{data:'',eof:true};
  return {};
 }
 async close(){this.closed=true;}
}
const session=()=>{const runtime=new FakeRuntime();return new EdgeSession({runtime,dataDir:'C:/isolated-fixture',qaMode:true});};
test('constructing the session and queuing startup cookies do not initialize Edge',async()=>{
 const s=session();s.setInitialCookies([{domain:'fixture.test',hostOnly:true,name:'session',value:'private',path:'/',secure:true,httpOnly:true,session:true}]);
 assert.equal(s.runtime.calls.length,0);await s.cookies.flushStore();assert.equal(s.runtime.calls.length,0);
 const status=await s.ensureInitialCookies();assert.deepEqual(status,{count:1,browserAccepted:1,browserRejected:0});
 const calls=s.runtime.calls.length;await s.ensureInitialCookies();assert.equal(s.runtime.calls.length,calls);assert(s.getUserAgent().includes('Edg/'));await s.close();
});
test('host-only cookies omit Domain; ordinary Domain cookies retain it and names never expose extra metadata',()=>{
 const base={url:'https://fixture.test/',name:'session',value:'secret',secure:true,httpOnly:true,sameSite:'no_restriction',hostOnly:true,session:true,storeId:'private'};
 const host=cookieForCdp(base);assert.equal(host.domain,undefined);assert.equal(host.sameSite,'None');assert(!('hostOnly'in host));assert(!('storeId'in host));
 assert.equal(cookieForCdp({...base,domain:'.fixture.test'}).domain,'.fixture.test');
 assert.throws(()=>cookieForCdp({...base,name:'__Host-session',domain:'.fixture.test'}),/__Host/);
 assert.throws(()=>cookieForCdp({...base,secure:false}),/Secure/);
});
test('cookie queries enforce exact host, subdomain, path boundary and Secure conditions',()=>{
 const host=cookieFromCdp({name:'a',value:'b',domain:'fixture.test',path:'/private',secure:true,httpOnly:true,expires:-1,session:true});
 assert(cookieMatches(host,{url:'https://fixture.test/private/a'}));assert(!cookieMatches(host,{url:'https://sub.fixture.test/private/a'}));assert(!cookieMatches(host,{url:'https://fixture.test/private-other'}));assert(!cookieMatches(host,{url:'http://fixture.test/private/a'}));
 const domain={...host,domain:'.fixture.test',hostOnly:false};assert(cookieMatches(domain,{url:'https://sub.fixture.test/private/a'}));assert(!cookieMatches(domain,{url:'https://fixture.test.evil/private/a'}));assert.equal(host.expirationDate,undefined);
});
test('initial cookie restoration removes only an opposite-scope duplicate',async()=>{
 const s=session();await s.cookies.set({url:'https://fixture.test/',domain:'.fixture.test',name:'same',value:'old',path:'/',secure:true});
 await s.cookies.set({url:'https://fixture.test/private',domain:'.fixture.test',name:'same',value:'keep',path:'/private',secure:true});
 s.setInitialCookies([{domain:'fixture.test',hostOnly:true,name:'same',value:'new',path:'/',secure:true,session:true}]);await s.ensureInitialCookies();
 const rows=await s.cookies.get({name:'same'});assert.equal(rows.length,2);assert(rows.some(c=>c.domain==='fixture.test'&&c.path==='/'&&c.value==='new'));assert(rows.some(c=>c.domain==='.fixture.test'&&c.path==='/private'));await s.close();
});
test('native views are lazy and page execution supports persistent per-frame isolated worlds',async()=>{
 const s=session(),v=s.createView({id:'tab'}),w=v.webContents;assert.equal(s.runtime.calls.length,0);v.setVisible(false);assert.equal(s.runtime.calls.length,0);
 s.runtime.evalResult=2;assert.equal(await w.executeJavaScript('1+1'),2);assert.equal(w.mainFrame.framesInSubtree.length,2);
 const child=w.mainFrame.framesInSubtree[1];await child.executeJavaScript('1+1');await child.executeJavaScript('1+1');
 assert.equal(s.runtime.calls.filter(c=>c.method==='cdp:Page.createIsolatedWorld').length,1);
 assert.equal(s.runtime.calls.filter(c=>c.method==='create').length,1);await s.close();
});
test('native navigation preserves HTTP failures and updates title/history/loading state',async()=>{
 const s=session(),w=s.createView({id:'tab'}).webContents,events=[];w.on('did-navigate',(_,url,status)=>events.push({url,status}));w.on('did-stop-loading',()=>events.push('stopped'));
 w.nativeEvent('navigation-starting',{url:'https://fixture.test/blocked',navigationId:1});assert(w.isLoading());assert.equal(w.generation,1);
 w.nativeEvent('history-changed',{canBack:true,canForward:false});w.nativeEvent('title-changed',{title:'Blocked'});
 w.nativeEvent('navigation-completed',{url:w.getURL(),httpStatus:403,success:false});await new Promise(r=>setImmediate(r));
 assert.equal(w.isLoading(),false);assert(w.navigationHistory.canGoBack());assert.equal(w.getTitle(),'Blocked');assert.equal(events[0].status,403);assert.equal(events[1],'stopped');await s.close();
});
test('the Pixiv bridge rejects lookalikes, non-GET, arbitrary media and stale navigation replies',async()=>{
 const s=session(),w=s.createView({id:'pixiv'}).webContents;w.url='https://www.pixiv.net/artworks/1';let calls=0;
 s.setPixivHandler(async()=>{calls++;return {bytes:[1,2]};});
 const e={tabId:'pixiv',source:w.url,message:{kind:'df-pixiv-fetch',id:'request',method:'GET',url:'https://i.pximg.net/image.png'}};
 for(const bad of [{...e,source:'https://www.pixiv.net.evil.test/'},{...e,message:{...e.message,url:'https://evil.test/a'}},{...e,message:{...e.message,method:'POST'}},{...e,message:{...e.message,url:'https://i.pximg.net:444/a'}}])await s.webMessage(bad);
 assert.equal(calls,0);await s.webMessage(e);assert.equal(calls,1);assert(s.runtime.calls.some(c=>c.method==='post-message'));
 let release;s.setPixivHandler(()=>new Promise(r=>{release=r;}));const pending=s.webMessage(e);w.generation++;release({bytes:[3]});await pending;
 assert.equal(s.runtime.calls.filter(c=>c.method==='post-message').length,1);await s.close();
});
test('same-origin manual pagination uses Edge and rejects opaque redirects',async()=>{
 const s=session(),w=s.createView({id:'tab'}).webContents;w.url='https://fixture.test/results';s.runtime.evalResult={status:200,headers:[['Content-Type','text/html']],bytes:[65,66]};
 const response=await s.fetch('https://fixture.test/results?page=2',{redirect:'manual',webContents:w});assert.equal(await response.text(),'AB');
 const expression=s.runtime.calls.find(c=>c.method==='cdp:Runtime.evaluate'&&c.args.expression.includes('fetch(')).args.expression;assert(expression.includes('credentials:"include"'));assert(expression.includes('redirect:"manual"'));
 s.runtime.evalResult={redirect:true};await assert.rejects(()=>s.fetch('https://fixture.test/next',{redirect:'manual',webContents:w}),/redirected/);await s.close();
});
test('CDP resource streams enforce byte limits and close their native handle',async()=>{
 const s=session();s.runtime.streams.set('fixture-stream',[{data:'YWJjZA==',base64Encoded:true,eof:false}]);
 const response=await s.fetch('https://fixture.test/media',{maxBytes:2});await assert.rejects(()=>response.text(),/size limit/);assert(s.runtime.calls.some(c=>c.method==='cdp:IO.close'));await s.close();
});
test('resource filtering calls a trusted native decision and fixture routing is gated',async()=>{
 const s=session();s.webRequest.onBeforeRequest({},(d,done)=>{assert.equal(d.resourceType,'script');done({cancel:true});done({cancel:false});});
 s.resourceRequest({tabId:'none',requestId:'r',url:'https://ads.test/a.js',type:'Script'});await new Promise(r=>setImmediate(r));
 assert.equal(s.runtime.calls.filter(c=>c.method==='resource-decision').length,1);assert.equal(s.runtime.calls.find(c=>c.method==='resource-decision').params.block,true);
 const prod=new EdgeSession({runtime:new FakeRuntime(),qaMode:false});await assert.rejects(()=>prod.setFixtures([]),/isolated/);assert.equal(prod.runtime.calls.length,0);await s.close();await prod.close();
});
test('native handles retain all 64 bits and bridge URL checks retain exact origins',()=>{
 const b=Buffer.alloc(8);b.writeBigUInt64LE(0x123456789abcdefn);assert.equal(nativeHandle({getNativeWindowHandle:()=>b}),'81985529216486895');
 assert(pixivUrl('https://www.pixiv.net/artworks/1'));assert(!pixivUrl('http://www.pixiv.net/'));assert(mediaUrl('https://i.pximg.net/a'));assert(!mediaUrl('https://i.pximg.net.evil/a'));
});
test('the JSON line transport starts once and carries asynchronous requests without website command access',async()=>{
 let spawned=0;const commands=[];
 const spawnImpl=()=>{spawned++;const child=new EventEmitter();child.stdout=new PassThrough();child.stderr=new PassThrough();child.exitCode=null;child.kill=()=>{child.exitCode=0;child.emit('exit',0);};
 child.stdin=new Writable({write(chunk,encoding,done){const m=JSON.parse(chunk.toString());commands.push(m);queueMicrotask(()=>{child.stdout.write(JSON.stringify({id:m.id,result:m.method==='init'?{engine:'Microsoft Edge WebView2',version:'150.test'}:{ok:true}})+'\n');if(m.method==='shutdown')child.kill();});done();}});return child;};
 const r=new EdgeRuntime({spawnImpl,dataDir:'C:/fixture',win:()=>({getNativeWindowHandle:()=>Buffer.alloc(8)})});await Promise.all([r.call('first'),r.call('second')]);assert.equal(spawned,1);assert.equal(commands[0].method,'init');assert.equal(r.identity.version,'150.test');assert.equal(commands[0].params.userDataDir,'C:\\fixture\\EdgeBrowser');await r.close();
});
test('native DNS errors, translation commands and stale navigation completions stay distinct',async()=>{
 const {nativeErrorCode}=require('../app/edge-runtime.cjs');assert.equal(nativeErrorCode('HostNameNotResolved'),-105);assert.equal(nativeErrorCode('OperationCanceled'),-3);
 const s=session(),w=s.createView({id:'tab'}).webContents,failed=[],translated=[];w.on('did-fail-load',(_,code)=>failed.push(code));w.on('request-translate',e=>translated.push(e.url));
 w.nativeEvent('navigation-starting',{url:'https://fixture.test/old',navigationId:1});w.nativeEvent('navigation-starting',{url:'https://fixture.test/new',navigationId:2});
 w.nativeEvent('navigation-completed',{url:'https://fixture.test/old',navigationId:1,httpStatus:200,success:true});assert(w.isLoading());assert.equal(w.getURL(),'https://fixture.test/new');
 w.nativeEvent('navigation-completed',{url:'https://fixture.test/new',navigationId:2,httpStatus:0,success:false,errorCode:'HostNameNotResolved'});await new Promise(r=>setImmediate(r));assert.deepEqual(failed,[-105]);
 w.nativeEvent('request-translate',{url:w.getURL()});assert.deepEqual(translated,[w.getURL()]);await s.close();
});
test('native fixture routing blocks unmatched requests and privileged QA inspection requires both gates',async()=>{
 const {getQaSession,createEdgeSession}=require('../app/edge-runtime.cjs'),previous=process.env.DF_DATA_DIR;delete process.env.DF_DATA_DIR;
 try{const nonQa=createEdgeSession({runtime:new FakeRuntime(),qaMode:false});assert.throws(()=>getQaSession(),/isolated/);await nonQa.close();
 process.env.DF_DATA_DIR='C:/isolated-profile';const qa=createEdgeSession({runtime:new FakeRuntime(),qaMode:true});assert.strictEqual(getQaSession(),qa);await qa.setFixtures([{hostname:'fixture.test',body:'ready'}]);assert.equal(qa.runtime.calls.find(c=>c.method==='set-fixtures').params.blockUnmatched,true);delete process.env.DF_DATA_DIR;assert.throws(()=>getQaSession(),/isolated/);await qa.close();}finally{if(previous===undefined)delete process.env.DF_DATA_DIR;else process.env.DF_DATA_DIR=previous;}
});

test('closing a native tab suppresses pending placement errors while live placement errors remain visible',async()=>{
 const s=session(),errors=[];s.on('runtime-error',e=>errors.push(e.message));const view=s.createView({id:'closing'});
 await view.webContents.ensure();let rejectPlacement;const original=s.runtime.call.bind(s.runtime);
 s.runtime.call=(method,args)=>method==='position'?new Promise((_,reject)=>{rejectPlacement=reject;}):original(method,args);
 view.setVisible(true);for(let i=0;i<10&&!rejectPlacement;i++)await new Promise(resolve=>setImmediate(resolve));assert(rejectPlacement);
 await view.webContents.close();rejectPlacement(new Error('The Edge browser is closed.'));await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(errors,[]);
 const live=s.createView({id:'live'});await live.webContents.ensure();s.runtime.call=(method,args)=>method==='position'?Promise.reject(new Error('Fixture placement failed')):original(method,args);live.setVisible(true);
 for(let i=0;i<10&&!errors.length;i++)await new Promise(resolve=>setImmediate(resolve));assert.deepEqual(errors,['Fixture placement failed']);await s.close();
});


test('repeated unchanged bounds and visibility do not repaint the native view',async()=>{
 const s=session(),v=s.createView({id:'stable'}),b={x:15,y:25,width:700,height:500};v.setBounds(b);v.setVisible(true);await v.placementPromise;
 const placements=()=>s.runtime.calls.filter(c=>c.method==='position');assert.equal(placements().length,1);
 for(let i=0;i<100;i++){v.setBounds({...b});v.setVisible(true);}await v.position();assert.equal(placements().length,1);
 v.setBounds({...b,width:710});await v.placementPromise;assert.equal(placements().length,2);v.setVisible(false);await v.placementPromise;v.setVisible(false);assert.equal(placements().length,3);await s.close();
});
test('rapid changes before native startup apply only the latest bounds and hidden state',async()=>{
 const s=session(),v=s.createView({id:'coalesced'});v.setBounds({x:1,y:2,width:600,height:400});v.setVisible(true);
 for(let i=0;i<20;i++)v.setBounds({x:i,y:2,width:620+i,height:400});v.setVisible(false);await v.placementPromise;
 const calls=s.runtime.calls.filter(c=>c.method==='position');assert.equal(calls.length,1);assert.equal(calls[0].params.visible,false);assert.equal(calls[0].params.x,19);assert.equal(calls[0].params.width,639);await s.close();
});
test('placement commands stay serial and a later hide wins over an in-flight show',async()=>{
 const s=session(),v=s.createView({id:'serial'});await v.webContents.ensure();const original=s.runtime.call.bind(s.runtime),rows=[];let release,inflight=0,max=0;
 s.runtime.call=async(method,args)=>{if(method!=='position')return original(method,args);inflight++;max=Math.max(max,inflight);rows.push(args);try{if(rows.length===1)await new Promise(r=>{release=r;});return {};}finally{inflight--;}};
 v.setVisible(true);for(let i=0;i<20&&!release;i++)await new Promise(r=>setImmediate(r));assert(release);v.setBounds({x:3,y:4,width:500,height:350});v.setVisible(false);release();await v.placementPromise;
 assert.equal(max,1);assert.equal(rows.length,2);assert.equal(rows[1].visible,false);assert.equal(rows[1].width,500);await s.close();
});
test('a recreated native target reapplies unchanged geometry and parent moves notify once',async()=>{
 const s=session(),v=s.createView({id:'recreated'});v.setVisible(true);await v.placementPromise;const count=()=>s.runtime.calls.filter(c=>c.method==='position').length;assert.equal(count(),1);
 v.webContents.ready=null;v.setVisible(true);await v.placementPromise;assert.equal(count(),2);await v.position(true);assert.equal(count(),3);assert.equal(s.runtime.calls.filter(c=>c.method==='position').at(-1).params.notifyParentMoved,true);await s.close();
});


test('native media downloads use the app selector and send back only an absolute chosen destination',async()=>{
 const s=session(),v=s.createView({id:'media'});v.webContents.url='https://www.pixiv.net/artworks/123';let selected=0;s.setDownloadHandler(async e=>{selected++;assert.strictEqual(e.webContents,v.webContents);return {canceled:false,filePath:'C:/isolated-native-media/image.png'};});
 await s.downloadRequested({tabId:'media',downloadId:'chosen',suggestedFileName:'image.png'});let reply=s.runtime.calls.filter(c=>c.method==='download-choice').at(-1).params;assert.equal(reply.canceled,false);assert.equal(reply.filePath,'C:/isolated-native-media/image.png');
 await s.downloadRequested({tabId:'missing',downloadId:'unowned'});reply=s.runtime.calls.filter(c=>c.method==='download-choice').at(-1).params;assert.equal(reply.canceled,true);assert.equal(selected,1);await s.close();
});
test('canceled, failed and relative-path media selectors cannot write a native file',async()=>{
 const s=session(),v=s.createView({id:'media'});v.webContents.url='https://fixture.test/';for(const handler of [async()=>({canceled:true}),async()=>{throw new Error('Picker closed');},async()=>({filePath:'relative.png'})]){s.setDownloadHandler(handler);await s.downloadRequested({tabId:'media',downloadId:'cancel'});assert.equal(s.runtime.calls.filter(c=>c.method==='download-choice').at(-1).params.canceled,true);}await s.close();
});
test('only one native media picker is open at a time and extra requests are canceled',async()=>{
 const s=session(),v=s.createView({id:'media'});v.webContents.url='https://fixture.test/';let resolve,pickers=0;s.setDownloadHandler(()=>{pickers++;return new Promise(r=>{resolve=r;});});const first=s.downloadRequested({tabId:'media',downloadId:'first'});assert(resolve);await s.downloadRequested({tabId:'media',downloadId:'extra'});assert.equal(pickers,1);const extra=s.runtime.calls.find(c=>c.method==='download-choice'&&c.params.downloadId==='extra');assert(extra.params.canceled);resolve({canceled:true});await first;assert.equal(s.downloadChoosing,false);await s.close();
});
