'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {hosts,hostOf,networkPage,verificationCookie}=require('../app/site-connection.cjs');
test('site compatibility stores exact hosts and rejects URLs, wildcards and malformed names',()=>{
 assert.deepEqual(hosts([' COMIX.TO ','comix.to','18comic.vip','*.example.test','https://other.test','bad..test','-bad.test','good-site.test']),['comix.to','18comic.vip','good-site.test']);
 assert.equal(hostOf('https://comix.to/reader?id=2'),'comix.to');
 assert.equal(hostOf('https://user:password@comix.to/'),'');assert.equal(hostOf('file:///local/file'),'');
 assert.equal(hosts(Array.from({length:110},(_,i)=>`site${i}.test`)).length,100);
});
test('missing DNS records receive separate recovery instructions from TLS and connection errors',()=>{
 const p=networkPage(-105,'ERR_NAME_NOT_RESOLVED','https://tmohentai.com/');assert.equal(p.reason,'dns');assert.equal(p.host,'tmohentai.com');assert.match(p.message,/Cookies and CAPTCHA verification cannot repair/);
 assert.equal(networkPage(0,'net::ERR_DNS_SERVER_FAILED','https://www.sakuhentai.net').reason,'dns');
 assert.equal(networkPage(-200,'ERR_CERT_COMMON_NAME_INVALID','https://example.test').reason,'connection');
 assert.equal(networkPage(-102,'ERR_CONNECTION_REFUSED','https://example.test').reason,'connection');
 const invalid=networkPage(-107,'ERR_SSL_PROTOCOL_ERROR','https://example.test');assert.equal(invalid.reason,'invalid-response');assert.match(invalid.message,/network filter/);assert.equal(networkPage(-320,'ErrorHttpInvalidServerResponse','https://example.test').reason,'invalid-response');
});
test('verification reset matches Cloudflare cookies without touching saved login sessions',()=>{
 for(const n of ['cf_clearance','__cf_bm','cf_chl_2','__cf_chl_tk'])assert(verificationCookie(n),n);
 for(const n of ['session','auth_token','ipb_pass_hash','igneous','not_cf_clearance','cf_clearance_login'])assert.equal(verificationCookie(n),false,n);
});
