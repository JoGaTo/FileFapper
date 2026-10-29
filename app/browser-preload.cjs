'use strict';
const {contextBridge,ipcRenderer}=require('electron');
if(window.top===window&&location.protocol==='https:'&&['www.pixiv.net','pixiv.net'].includes(location.hostname)){
 contextBridge.exposeInMainWorld('__dfPixivNetwork',Object.freeze({request:async request=>ipcRenderer.invoke('ppixiv-fetch',{url:String(request?.url||''),method:'GET'})}));
}
