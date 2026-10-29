'use strict';
// Operations on a single task in a site/date folder. The ledger is the only
// authority for top-level files: never enumerate and remove the whole folder.
const fs=require('node:fs'),fsp=fs.promises,path=require('node:path'),crypto=require('node:crypto');
const within=(root,p)=>{const relative=path.relative(root,p);return relative!==''&&!relative.startsWith('..'+path.sep)&&relative!=='..'&&!path.isAbsolute(relative);};
const validId=id=>typeof id==='string'&&/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,79}$/.test(id)&&!id.includes('..');
const validName=name=>typeof name==='string'&&name!=='.'&&name!=='..'&&name.length>0&&path.basename(name)===name&&!/[\\/]/.test(name);
async function regularTree(root){
 const out=[];
 async function visit(dir){for(const entry of await fsp.readdir(dir,{withFileTypes:true})){
  const p=path.join(dir,entry.name);if(entry.isSymbolicLink())throw new Error('Task data contains a link; no files were moved or deleted.');
  if(entry.isDirectory())await visit(p);else if(entry.isFile())out.push(p);else throw new Error('Task data contains an unsupported file type.');
 }}
 await visit(root);return out;
}
async function digest(p){return new Promise((resolve,reject)=>{const hash=crypto.createHash('sha256'),stream=fs.createReadStream(p);stream.on('error',reject);stream.on('data',c=>hash.update(c));stream.on('end',()=>resolve(hash.digest('hex')));});}
async function inspect(task){
 if(!validId(task.id))throw new Error('Invalid task identifier.');
 const root=path.resolve(task.folder),side=path.join(root,'.filefapper',task.id),realRoot=await fsp.realpath(root),realSide=await fsp.realpath(side);
 if(!within(realRoot,realSide))throw new Error('Task data is outside the gallery folder.');
 const marker=JSON.parse(await fsp.readFile(path.join(side,'.dandf-task.json'),'utf8'));
 if(marker.id!==task.id||marker.url!==task.url)throw new Error('The gallery ownership marker does not match this task.');
 let ledger={};try{ledger=JSON.parse(await fsp.readFile(path.join(side,'.dandf-files.json'),'utf8'));}catch(e){if(e.code!=='ENOENT')throw new Error('The task file list is unreadable; no files were changed.');if((task.files||[]).length)throw new Error('The task file list is missing; no files were changed.');}
 const names=new Set();
 for(const [key,row] of Object.entries(ledger)){
  if(!/^\d+$/.test(key))continue;
  const candidates=[row.name,row.preview,...(Array.isArray(row.companions)?row.companions.map(c=>c.name):[])].filter(Boolean);
  for(const name of candidates){if(!validName(name))throw new Error('The task file list contains an invalid filename.');names.add(name);}
 }
 const files=[];
 for(const name of names){const file=path.join(root,name);let stat;try{stat=await fsp.lstat(file);}catch(e){if(e.code==='ENOENT')continue;throw e;}
  if(!stat.isFile()||stat.isSymbolicLink())throw new Error('A gallery file is not a regular file; no files were changed.');files.push(file);
 }
 const privateFiles=await regularTree(side);return {root,side,files,privateFiles};
}
async function move(task,parent){
 const info=await inspect(task),base=await fsp.realpath(parent),destination=path.resolve(base,path.basename(info.root));
 if(destination===info.root)return {destination,warnings:[]};
 if(within(info.root,destination))throw new Error('Choose a destination outside the source folder.');
 await fsp.mkdir(destination,{recursive:true});const realDestination=await fsp.realpath(destination);
 if(realDestination===await fsp.realpath(info.root)||within(await fsp.realpath(info.root),realDestination))throw new Error('Choose a destination outside the source folder.');
 const destParent=path.join(destination,'.filefapper'),destSide=path.join(destParent,task.id),created=[];let madeSide=false;
 if(fs.existsSync(destSide))throw new Error('This gallery already has task data in the destination. Nothing was moved.');
 for(const file of info.files)if(fs.existsSync(path.join(destination,path.basename(file))))throw new Error('A gallery filename already exists in the destination. Nothing was moved.');
 try{
  for(const file of info.files){const target=path.join(destination,path.basename(file));await fsp.copyFile(file,target,fs.constants.COPYFILE_EXCL);created.push(target);if(await digest(file)!==await digest(target))throw new Error('A copied gallery file did not verify.');}
  await fsp.mkdir(destParent,{recursive:true});
  if(!within(realDestination,await fsp.realpath(destParent)))throw new Error('The destination task-data folder is outside the chosen destination.');
  await fsp.mkdir(destSide);madeSide=true;
  for(const file of info.privateFiles){const target=path.join(destSide,path.relative(info.side,file));await fsp.mkdir(path.dirname(target),{recursive:true});await fsp.copyFile(file,target,fs.constants.COPYFILE_EXCL);created.push(target);if(await digest(file)!==await digest(target))throw new Error('Copied task data did not verify.');}
 }catch(e){
  for(const file of created.reverse())await fsp.unlink(file).catch(()=>{});
  // Only remove the new, verified task-data subtree, never the shared folder.
  if(madeSide&&within(realDestination,path.resolve(destSide))&&within(realDestination,await fsp.realpath(destSide).catch(()=>'')))await fsp.rm(destSide,{recursive:true,force:true}).catch(()=>{});
  throw e;
 }
 const warnings=[];
 for(const file of info.files){try{const target=path.join(destination,path.basename(file));if(await digest(file)!==await digest(target))throw new Error('source changed during move');await fsp.unlink(file);}catch(e){warnings.push(path.basename(file)+': '+e.message);}}
 // Preserve the source task data if any file could not be removed.
 if(!warnings.length){try{for(const file of info.privateFiles)if(await digest(file)!==await digest(path.join(destSide,path.relative(info.side,file))))throw new Error('source task data changed during move');const realSide=await fsp.realpath(info.side),realRoot=await fsp.realpath(info.root);if(!within(realRoot,realSide))throw new Error('Invalid task-data path.');await fsp.rm(realSide,{recursive:true});}catch(e){warnings.push('Task data: '+e.message);}}
 return {destination,warnings};
}
async function remove(task,trash){
 const info=await inspect(task);
 for(const file of info.files)await trash(file);
 // Recheck containment immediately before handing this task's subtree to the OS.
 if(!within(await fsp.realpath(info.root),await fsp.realpath(info.side)))throw new Error('Invalid task-data path.');
 await trash(info.side);
}
module.exports={inspect,move,remove,validName};
