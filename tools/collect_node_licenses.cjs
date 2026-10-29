// Retain runtime dependency attribution outside asar for easy inspection.
const fs=require('node:fs'),path=require('node:path');
const {createRequire}=require('node:module');
const root=path.resolve(__dirname,'..'),out=path.join(root,'assets','third-party');
fs.mkdirSync(out,{recursive:true});const seen=new Set(),notices=[];
function collect(name,from){
 const req=createRequire(path.join(from,'package.json'));let file;
 try{file=req.resolve(name+'/package.json');}catch{let start=path.dirname(req.resolve(name));while(!fs.existsSync(path.join(start,'package.json'))){const next=path.dirname(start);if(next===start)throw new Error('Could not locate license metadata: '+name);start=next;}file=path.join(start,'package.json');}
 const pkg=JSON.parse(fs.readFileSync(file,'utf8')),dir=path.dirname(file),id=pkg.name+'@'+pkg.version;if(seen.has(id))return;seen.add(id);
 const folder=path.join(out,pkg.name.replaceAll('/','-'));fs.mkdirSync(folder,{recursive:true});
 const licenseFiles=fs.readdirSync(dir).filter(n=>/^(license|copying|notice)/i.test(n)&&fs.statSync(path.join(dir,n)).isFile());
 for(const n of licenseFiles)fs.copyFileSync(path.join(dir,n),path.join(folder,n));
 notices.push({name:pkg.name,version:pkg.version,license:pkg.license||'',repository:typeof pkg.repository==='object'?pkg.repository.url:pkg.repository,licenseFiles});
 for(const dep of Object.keys(pkg.dependencies||{}))collect(dep,dir);
}
const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));for(const dep of Object.keys(pkg.dependencies||{}))collect(dep,root);
fs.writeFileSync(path.join(out,'runtime-dependencies.json'),JSON.stringify(notices,null,2)+'\n');
console.log(`Retained ${notices.length} runtime Node dependency notices.`);
