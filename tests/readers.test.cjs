'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto');
const {AccountVault,parseImport}=require('../app/accounts.cjs'),{challengeResource}=require('../app/challenge-resources.cjs'),core=require('../app/core.cjs');
const key=crypto.randomBytes(32),encryption={isEncryptionAvailable:()=>true,encryptString:text=>{const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',key,iv),data=Buffer.concat([cipher.update(text,'utf8'),cipher.final()]);return Buffer.concat([iv,cipher.getAuthTag(),data]);},decryptString:bytes=>{const decipher=crypto.createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(12,28));return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString();}};
function fixture(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'dandf-logins-'));try{return fn(new AccountVault(path.join(dir,'accounts.bin'),encryption).load(),dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('saved logins are encrypted, survive reload and expose metadata without passwords',()=>fixture((vault,dir)=>{
 const id=vault.save({url:'https://example.test/login',username:'fixture-user',password:'fixture-password'}),file=path.join(dir,'accounts.bin');
 assert(!fs.readFileSync(file).includes(Buffer.from('fixture-password')));assert(!JSON.stringify(vault.summary()).includes('fixture-password'));
 const loaded=new AccountVault(file,encryption).load();assert.equal(loaded.forUrl('https://example.test/reader').password,'fixture-password');assert.equal(loaded.summary()[0].id,id);
 vault.save({url:'https://example.test/login',username:'fixture-user',password:'updated-password'});assert.equal(vault.summary().length,1);assert.equal(vault.forUrl('https://example.test/').password,'updated-password');
}));
test('autofill never crosses origin, subdomain, HTTP, credential URLs or an ambiguous account',()=>fixture(vault=>{
 const id=vault.save({url:'https://example.test/login',username:'one',password:'sample'});
 for(const u of ['http://example.test/login','https://example.test.evil.test/login','https://www.example.test/login','https://example.test:8443/login','https://one:sample@example.test/login'])assert.equal(vault.forUrl(u),null,u);
 vault.toggle(id,false);assert.equal(vault.forUrl('https://example.test/',{automatic:true}),null);assert(vault.forUrl('https://example.test/',{id}));
 vault.toggle(id,true);vault.save({url:'https://example.test/',username:'two',password:'sample2'});assert.equal(vault.forUrl('https://example.test/',{automatic:true}),null);assert.equal(vault.forUrl('https://example.test/',{id}).username,'one');
}));
test('CSV and JSON imports handle quotes and update duplicates atomically',()=>fixture(vault=>{
 const csv='name,url,username,password\r\n"Site, sample",https://example.test/login,person,"one,""two"""\r\n';assert.equal(parseImport(csv)[0].password,'one,"two"');vault.import(csv);
 const id=vault.summary()[0].id;assert.equal(vault.import(JSON.stringify({accounts:[{url:'https://example.test/login',username:'person',password:'replacement'}]})),1);assert.equal(vault.summary()[0].id,id);assert.equal(vault.rows.length,1);
 const before=fs.readFileSync(vault.file);assert.throws(()=>vault.import('[{"url":"https://other.test","username":"person","password":"valid"},{"url":"http://bad.test","username":"person","password":"secret-not-in-error"}]'),e=>!e.message.includes('secret-not-in-error'));assert(fs.readFileSync(vault.file).equals(before));
 const bitwarden='name,login_uri,login_username,login_password\nDemo,https://other.test/login,sample,pass';assert.equal(parseImport(bitwarden)[0].origin,'https://other.test');
 assert.equal(parseImport('url,username,password\nhttps://other.test/login,sample,  spaced password  ')[0].password,'  spaced password  ');
}));
test('unavailable encryption fails without plaintext files or in-memory fallback',()=>fixture((vault,dir)=>{
 vault.encryption={isEncryptionAvailable:()=>false};assert.throws(()=>vault.save({url:'https://example.test',username:'user',password:'secret'}),/encryption is unavailable/);assert.equal(vault.summary().length,0);assert.equal(fs.existsSync(path.join(dir,'accounts.bin')),false);
}));
test('removing an account and failed decryption cannot silently recover its secret',()=>fixture(vault=>{
 const id=vault.save({url:'https://example.test',username:'user',password:'secret'});vault.remove(id);assert.deepEqual(new AccountVault(vault.file,encryption).load().summary(),[]);
 fs.writeFileSync(vault.file,'broken');const failed=new AccountVault(vault.file,encryption).load();assert.deepEqual(failed.summary(),[]);assert.match(failed.error,/could not be decrypted/);
}));
test('challenge resources remain available without broad adblock exemptions',()=>{
 assert(challengeResource('https://challenges.cloudflare.com/turnstile/v0/api.js'));assert(challengeResource('https://18comic.vip/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1'));
 for(const u of ['https://challenges.cloudflare.com.evil.test/ad.js','http://challenges.cloudflare.com/api.js','https://18comic.vip/ad.js','javascript:alert(1)'])assert.equal(challengeResource(u),false,u);
});
test('modern chapter and gallery reader profiles recognize all supported address formats',()=>{
 for(const [site,url] of [['hentaihere','https://hentaihere.com/reader/123-title/456/page-1'],['hentai2read','https://hentai2read.com/reader/123-title/456/page-2'],['hentaienvy','https://hentaienvy.com/g/12/1/'],['hentairox','https://hentairox.com/gallery/12/'],['hentaizap','https://hentaizap.com/view/12/']]){const p=core.siteFor(url);assert.equal(p.id,site);assert.equal(p.engine,'native');assert(new RegExp(p.path).test(new URL(url).pathname));}
});
