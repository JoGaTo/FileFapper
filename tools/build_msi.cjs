'use strict';
const path=require('node:path'),{spawn}=require('node:child_process');
const project=path.resolve(__dirname,'..'),release=path.resolve(project,'..','release'),payload=path.join(release,'win-unpacked'),version=require(path.join(project,'package.json')).version;
const args=[path.join(project,'node_modules','electron-builder','out','cli','cli.js'),'--win','msi','--x64','--prepackaged',payload,'--publish','never',
 '--config.directories.output='+release,'--config.appId=local.filefapper','--config.msi.oneClick=false','--config.msi.perMachine=false',
 '--config.msi.runAfterFinish=false','--config.msi.shortcutName=FileFapper',
 '--config.artifactName=FileFapper-'+version+'-Windows-x64.msi'];
const child=spawn(process.execPath,args,{cwd:project,env:process.env,stdio:'inherit',windowsHide:true});child.on('error',e=>{console.error(e);process.exitCode=1;});child.on('exit',code=>{process.exitCode=code??1;});
