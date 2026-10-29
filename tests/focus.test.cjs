'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {restoreContentFocus}=require('../app/focus.cjs');
function windowStub(focused=true){
 let calls=0;
 const w={isDestroyed:()=>false,isVisible:()=>true,isMinimized:()=>false,isFocused:()=>focused,
  webContents:{isDestroyed:()=>false,isFocused:()=>true,focus:()=>calls++}};
 return {w,calls:()=>calls};
}
test('a fresh text-field interaction restores actual content focus even when Chromium reports it focused',async()=>{
 const x=windowStub(true);assert.equal(await restoreContentFocus(x.w,null,1000,()=>1000),true);assert.equal(x.calls(),1);
});
test('foreground native browser child permits the app to regain text input',async()=>{
 const x=windowStub(false),calls=[];const r={started:true,closed:false,call:async(...args)=>{calls.push(args[0]);return {foreground:true};}};
 assert.equal(await restoreContentFocus(x.w,r,1000,()=>1005),true);assert.deepEqual(calls,['return-parent-focus']);assert.equal(x.calls(),1);
});
test('background, stale, hidden and failed requests never steal focus',async()=>{
 const x=windowStub(false),r={started:true,closed:false,call:async()=>({foreground:false})};
 assert.equal(await restoreContentFocus(x.w,r,1000,()=>1000),false);assert.equal(await restoreContentFocus(x.w,r,1000,()=>1400),false);
 r.call=async()=>{throw Error('offline');};assert.equal(await restoreContentFocus(x.w,r,1000,()=>1000),false);assert.equal(x.calls(),0);
 x.w.isVisible=()=>false;assert.equal(await restoreContentFocus(x.w,r,1000,()=>1000),false);
});
test('a delayed foreground answer cannot steal focus after the user moved away',async()=>{
 const x=windowStub(false);let now=1000;const r={started:true,closed:false,call:async()=>{now=1400;return {foreground:true};}};
 assert.equal(await restoreContentFocus(x.w,r,1000,()=>now),false);assert.equal(x.calls(),0);
});

test('a stale Electron focus flag cannot override the native foreground check',async()=>{
 const x=windowStub(true),r={started:true,closed:false,call:async()=>({foreground:false})};
 assert.equal(await restoreContentFocus(x.w,r,1000,()=>1000),false);assert.equal(x.calls(),0);
});
test('a failed native focus handoff does not trust a stale Electron focus flag',async()=>{
 const x=windowStub(true),r={started:true,closed:false,call:async()=>{throw Error('offline');}};
 assert.equal(await restoreContentFocus(x.w,r,1000,()=>1000),false);assert.equal(x.calls(),0);
});
