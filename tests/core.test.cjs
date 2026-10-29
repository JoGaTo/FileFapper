const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const core=require('../app/core.cjs');
const cookies=require('../app/cookies.cjs');
test('URL parsing supports multiline, skips unsafe schemes and deduplicates',()=>{
  assert.deepEqual(core.parseUrls('https://nhentai.net/g/1/\nhttps://nhentai.net/g/1/\nhttps://e-hentai.org/g/2/abc/\nfile:///secret'),['https://nhentai.net/g/1/','https://e-hentai.org/g/2/abc/']);
  assert.equal(core.validUrl('javascript:alert(1)'),null);assert.equal(core.validUrl('https://user:pass@example.com/'),null);
});
test('site matching respects host boundaries and script precedence',()=>{
  assert.equal(core.siteFor('https://e-hentai.org/g/1/a/').id,'ehentai');
  assert.equal(core.siteFor('https://not-e-hentai.org/g/1/a/'),null);
  assert.equal(core.siteFor('https://sub.wnacg.com/photos-index-aid-1.html').id,'wnacg');
  assert.equal(core.siteFor('https://nhentai.net/g/1/',[{id:'override',domains:['nhentai.net']}]).id,'override');
  assert.equal(core.sites.length,50);
});
test('preferences validate numeric controls and theme',()=>{
  const p=core.preferences({theme:'invalid',workers:999,concurrentTasks:0,delay:-20,speedLimit:-2},'D:/Galleries');
  assert.equal(p.theme,'light');assert.equal(p.workers,50);assert.equal(core.preferences({workers:50}).workers,50);assert.equal(p.concurrentTasks,1);assert.equal(p.delay,.2);assert.equal(p.speedLimit,0);
});
test('retired profiles leave active choices while saved task identities remain readable',()=>{
  const fixture={id:'retired-fixture',name:'Retired fixture',domains:['retired-fixture.invalid'],retired:true};
  const before=core.activeSites().length;
  core.sites.push(fixture);
  try{
    const active=core.activeSites();assert.equal(active.length,before);assert(!active.some(s=>s.id===fixture.id));
    const url='https://retired-fixture.invalid/saved-item';assert.equal(core.siteFor(url).id,fixture.id);
    const row=core.makeTask(url,core.preferences());row.status='paused';assert.equal(core.restoreTasks([row])[0].siteId,fixture.id);
  }finally{core.sites.splice(core.sites.indexOf(fixture),1);}
});
test('Netscape cookie import preserves HttpOnly, secure, domains, tabs, session expiry',()=>{
  const c=core.parseCookies('# Netscape HTTP Cookie File\n#HttpOnly_.example.com\tTRUE\t/\tTRUE\t0\tauth\tvalue\twithtab');
  assert.equal(c.length,1);assert.equal(c[0].httpOnly,true);assert.equal(c[0].secure,true);assert.equal(c[0].value,'value\twithtab');assert.equal(c[0].expirationDate,undefined);
});
test('extension JSON accepts wrapped arrays and ignores expired cookies',()=>{
  const c=core.parseCookies(JSON.stringify({cookies:[{name:'x',value:'secret',domain:'.example.com',expirationDate:1},{name:'valid',value:'x',domain:'.example.com'}]}));
  assert.equal(c.length,1);assert.equal(c[0].name,'valid');assert.throws(()=>core.parseCookies('{"cookies":{}}'));assert.throws(()=>core.parseCookies('malformed'));
});
test('host-only cookies never leak to subdomains or lookalike sites',()=>{
  assert(core.domainMatches('example.com','.example.com'));assert(core.domainMatches('cdn.example.com','.example.com'));assert(!core.domainMatches('cdn.example.com','example.com'));assert(!core.domainMatches('evil-example.com','.example.com'));
});

test('extension host-only flags override domain punctuation without broadening scope',()=>{
  const rows=core.parseCookies(JSON.stringify([
    {domain:'Example.TEST',hostOnly:false,name:'domain-login',value:'fixture'},
    {domain:'.Example.TEST',hostOnly:true,name:'host-login',value:'fixture'}
  ]));
  assert.equal(rows[0].domain,'.example.test');assert.equal(rows[0].hostOnly,false);
  assert(core.domainMatches('www.example.test',rows[0].domain));
  assert.equal(rows[1].domain,'example.test');assert.equal(rows[1].hostOnly,true);
  assert(!core.domainMatches('www.example.test',rows[1].domain));
  assert(!core.domainMatches('example.test.evil.test',rows[0].domain));
});

test('Netscape include-subdomains column is preserved independently of leading dots',()=>{
  const rows=core.parseCookies('example.test\tTRUE\t/\tTRUE\t0\tshared\tfixture\n#HttpOnly_.example.test\tFALSE\t/private\tTRUE\t0\thost\tfixture');
  assert.equal(rows[0].domain,'.example.test');assert(core.domainMatches('www.example.test',rows[0].domain));
  assert.equal(rows[1].domain,'example.test');assert.equal(rows[1].hostOnly,true);assert.equal(rows[1].httpOnly,true);
  assert.equal(rows[1].path,'/private');assert(!core.domainMatches('www.example.test',rows[1].domain));
});

test('legitimate __Host cookies reach Chromium without a Domain attribute or metadata keys',()=>{
  const row=core.parseCookies(JSON.stringify([{domain:'example.test',hostOnly:true,name:'__Host-session',value:'fixture',secure:true,httpOnly:true,path:'/',sameSite:'None',session:true,expirationDate:1,storeId:'fixture',id:5}]))[0];
  assert(row);assert.equal(row.expirationDate,undefined);assert.equal(row.sameSite,'no_restriction');
  const details=cookies.toElectronCookie(row);
  assert.equal(details.url,'https://example.test/');assert.equal(details.secure,true);assert.equal(details.path,'/');assert.equal(details.value,'fixture');
  for(const key of ['domain','hostOnly','session','expirationDate','storeId','id'])assert(!Object.hasOwn(details,key),key);
  assert.deepEqual(Object.keys(details).sort(),['url','name','value','path','secure','httpOnly','sameSite'].sort());
});

test('domain cookies explicitly retain their Domain attribute and exporter SameSite spellings',()=>{
  for(const value of ['none','NONE','no_restriction','No Restriction','no-restriction']){
    const row=cookies.normalizeCookie({domain:'example.test',hostOnly:false,name:'login',value:'fixture',secure:'TRUE',httpOnly:'FALSE',sameSite:value,expires:Date.now()/1000+3600});
    assert.equal(row.sameSite,'no_restriction');assert.equal(row.httpOnly,false);
    const details=cookies.toElectronCookie(row);assert.equal(details.domain,'.example.test');assert(details.expirationDate>Date.now()/1000);
  }
  for(const value of ['Lax','Strict','Unspecified'])assert.equal(cookies.normalizeCookie({domain:'example.test',name:'a',value:'b',sameSite:value}).sameSite,value.toLowerCase());
});

test('cookie prefix constraints fail safely instead of silently changing their meaning',()=>{
  const base={domain:'example.test',hostOnly:true,name:'__Host-session',value:'fixture-secret',secure:true,path:'/'};
  for(const patch of [{hostOnly:false},{secure:false},{path:'/private'}])assert.throws(()=>cookies.normalizeCookie({...base,...patch}),error=>!error.message.includes(base.value)&&/__Host-/.test(error.message));
  assert.throws(()=>cookies.normalizeCookie({...base,name:'__Secure-login',secure:false}),/__Secure-/);
  assert.throws(()=>cookies.toElectronCookie({domain:'example.test',name:'login',value:'fixture-secret',sameSite:'None',secure:false}),error=>!error.message.includes('fixture-secret')&&/Secure/.test(error.message));
});

test('cookie expiry and session semantics survive normalization and legacy imports',()=>{
  const source={domain:'example.test',name:'login',value:'fixture',expirationDate:99};
  assert.equal(cookies.normalizeCookie(source,{now:100}),null);
  assert.equal(cookies.normalizeCookie(source,{now:99}),null);
  assert.equal(cookies.normalizeCookie(source,{now:100,includeExpired:true}).expirationDate,99);
  assert.equal(cookies.normalizeCookie({...source,session:true},{now:100}).expirationDate,undefined);
  assert.equal(cookies.normalizeCookie({domain:'.example.test',name:'a',value:'fixture'}).hostOnly,false);
  assert.equal(cookies.normalizeCookie({domain:'example.test',name:'a',value:'fixture'}).hostOnly,true);
  const invalid=[];
  const rows=cookies.liveCookies([source,{domain:'bad/domain',name:'a',value:'fixture-secret'},{...source,expirationDate:200}],{now:100,skipInvalid:true,onInvalid:value=>invalid.push(value)});
  assert.equal(rows.length,1);assert.equal(invalid.length,1);assert(!JSON.stringify(invalid).includes('fixture-secret'));
  assert.throws(()=>cookies.liveCookies([{domain:'bad/domain',name:'a',value:'fixture'}]));
});

test('cookie keys canonicalize host punctuation and case without exposing values',()=>{
  const a={domain:'Example.TEST',hostOnly:true,path:'/',name:'session',value:'fixture-one'};
  const b={...a,domain:'.example.test',hostOnly:false,value:'fixture-two'};
  assert.equal(cookies.cookieKey(a),cookies.cookieKey(b));
  assert.notEqual(cookies.cookieKey(a),cookies.cookieKey({...a,path:'/private'}));
  assert.notEqual(cookies.cookieKey({...a,path:'/a|b',name:'c'}),cookies.cookieKey({...a,path:'/a',name:'b|c'}));
  assert(!cookies.cookieKey(a).includes(a.value));
});
test('restored running tasks pause and invalid sessions are rejected',()=>{
  const t=core.makeTask('https://nhentai.net/g/1/',core.preferences());t.status='downloading';t.speed=500;
  const r=core.restoreTasks([t])[0];assert.equal(r.status,'paused');assert.equal(r.speed,0);assert.equal(r.url,t.url);assert.throws(()=>core.restoreTasks([{url:'file:///a',status:'queued'}]));assert.throws(()=>core.restoreTasks({}));
});
test('server cooldown remains present in a restored session',()=>{
  const t=core.makeTask('https://nhentai.net/g/1/',core.preferences());t.status='waiting';t.retryAt=Date.now()+60000;
  const restored=core.restoreTasks([t])[0];assert.equal(restored.status,'waiting');assert.equal(restored.retryAt,t.retryAt);
});
test('task folder containment rejects a root, siblings, and traversal',()=>{
  const base=path.resolve('gallery');assert(!core.isInside(base,base));assert(core.isInside(base,path.join(base,'0001.jpg')));assert(!core.isInside(base,path.resolve('gallery-other','0001.jpg')));assert(!core.isInside(base,path.join(base,'..','secret')));
});
