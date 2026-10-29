'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');

function loginUrl(value){
 let u;try{u=new URL(String(value));}catch{throw new Error('Enter the site’s complete HTTPS sign-in address.');}
 if(u.protocol!=='https:'||!u.hostname||u.username||u.password)throw new Error('Saved logins require an HTTPS site address without an embedded username or password.');
 if([...u.searchParams.keys()].some(k=>/^(?:password|passwd|pwd|pass)$/i.test(k)))throw new Error('Use the sign-in page address without a password in its query string.');
 u.hash='';return u.href;
}
function normalize(row,previous){
 const url=loginUrl(row?.loginUrl||row?.url||row?.origin),username=String(row?.username||'').trim(),password=row?.password;
 if(!username||username.length>512||typeof password!=='string'||!password||password.length>8192)throw new Error('Each saved login needs a username and password within the supported size limits.');
 return {id:previous?.id||crypto.randomUUID(),origin:new URL(url).origin,loginUrl:url,username,password,
  autoFill:row.autoFill!==false&&row.autoFill!=='false',createdAt:previous?.createdAt||new Date().toISOString()};
}
function csvRows(text){
 const rows=[];let cells=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else if(quoted||!cell)quoted=!quoted;else throw new Error('This CSV is not a supported password export.');}
  else if(c===','&&!quoted){cells.push(cell);cell='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;cells.push(cell);if(cells.some(Boolean))rows.push(cells);cells=[];cell='';}else cell+=c;}
 if(quoted)throw new Error('This CSV contains an unfinished quoted field.');
 cells.push(cell);if(cells.some(Boolean))rows.push(cells);return rows;
}
function parseImport(text){
 text=String(text).replace(/^\uFEFF/,'');if(text.length>2_000_000)throw new Error('Import at most 2 MB of logins at a time.');
 let rows;
 if(text.trimStart().startsWith('[')||text.trimStart().startsWith('{')){let data;try{data=JSON.parse(text);}catch{throw new Error('The login JSON could not be read.');}rows=Array.isArray(data)?data:data.accounts;}
 else{const data=csvRows(text),headers=(data.shift()||[]).map(s=>s.trim().toLowerCase()),col=names=>headers.findIndex(h=>names.includes(h)),url=col(['url','loginurl','website','origin','login_uri']),user=col(['username','login_username']),pass=col(['password','login_password']);
  if([url,user,pass].some(i=>i<0))throw new Error('CSV needs url, username and password columns. Chrome and Bitwarden CSV exports are supported.');
  rows=data.filter(r=>r[url]||r[user]||r[pass]).map(r=>({url:r[url],username:r[user],password:r[pass]}));}
 if(!Array.isArray(rows)||!rows.length||rows.length>200)throw new Error('Import a JSON account list or CSV with 1–200 site logins.');
 return rows.map(row=>normalize(row));
}
class AccountVault{
 constructor(file,encryption){this.file=file;this.encryption=encryption;this.rows=[];this.error='';}
 load(){try{if(fs.existsSync(this.file)){if(!this.encryption.isEncryptionAvailable())throw new Error();const raw=JSON.parse(this.encryption.decryptString(fs.readFileSync(this.file)));if(!Array.isArray(raw)||raw.length>200)throw new Error();this.rows=raw.map(r=>normalize(r,r));}}
  catch{this.rows=[];this.error='Saved logins could not be decrypted. Re-enter or import them on this Windows account.';}return this;}
 summary(){return this.rows.map(({password,...row})=>({...row}));}
 commit(rows){if(!this.encryption.isEncryptionAvailable())throw new Error('Windows encryption is unavailable. This login was not saved.');const bytes=this.encryption.encryptString(JSON.stringify(rows));fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',bytes);fs.renameSync(this.file+'.tmp',this.file);this.rows=rows;this.error='';}
 save(row){const url=loginUrl(row?.loginUrl||row?.url||row?.origin),previous=this.rows.find(r=>r.origin===new URL(url).origin&&r.username===String(row.username||'').trim()),saved=normalize(row,previous);
  const rows=this.rows.filter(r=>r.id!==saved.id);if(rows.length>=200)throw new Error('The login vault supports 200 accounts. Remove an unused account first.');rows.push(saved);this.commit(rows);return saved.id;}
 import(text){const incoming=parseImport(text),rows=this.rows.map(r=>({...r}));for(const row of incoming){const i=rows.findIndex(r=>r.origin===row.origin&&r.username===row.username);if(i>=0)rows[i]={...row,id:rows[i].id,createdAt:rows[i].createdAt};else rows.push(row);}if(rows.length>200)throw new Error('This import would exceed 200 saved accounts. Import just the sites you use.');this.commit(rows);return incoming.length;}
 remove(id){this.commit(this.rows.filter(r=>r.id!==id));}
 toggle(id,enabled){if(!this.rows.some(r=>r.id===id))throw new Error('That saved login no longer exists.');this.commit(this.rows.map(r=>r.id===id?{...r,autoFill:!!enabled}:r));}
 forUrl(url,{automatic=false,id}={}){let origin;try{origin=new URL(loginUrl(url)).origin;}catch{return null;}
  const rows=this.rows.filter(r=>r.origin===origin&&(!id||r.id===id)&&(!automatic||r.autoFill));return rows.length===1?{...rows[0]}:null;}
}
module.exports={AccountVault,loginUrl,parseImport};
