'use strict';
const {app,BrowserWindow}=require('electron');
app.whenReady().then(()=>{const win=new BrowserWindow({show:false,width:600,height:400});win.loadURL('data:text/html,<title>CEF test parent</title>');});
