'use strict';

// WebView2 lives in a child window owned by a different process. Electron's
// focus flag can be stale, so ask the native host to release the child focus
// before focusing the app's renderer. Never activate a background window.
async function restoreContentFocus(win,runtime,requestedAt,now=Date.now){
 const usable=()=>!!win&&!win.isDestroyed()&&win.isVisible()&&!win.isMinimized()&&!win.webContents.isDestroyed();
 const fresh=()=>Number.isFinite(requestedAt)&&now()-requestedAt>=0&&now()-requestedAt<=350;
 if(!usable()||!fresh())return false;
 let foreground=win.isFocused();
 if(runtime?.started&&!runtime.closed){
  try{const result=await runtime.call('return-parent-focus',{},750);foreground=!!result?.foreground;}catch{return false;}
 }
 if(!foreground||!usable()||!fresh())return false;
 win.webContents.focus();return true;
}
module.exports={restoreContentFocus};
