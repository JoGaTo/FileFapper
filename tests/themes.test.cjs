'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const core=require('../app/core.cjs'),themes=require('../app/theme-data.js');
test('all eighteen themes and seven approved templates survive old and new saved preferences',()=>{
  assert.equal(themes.list.length,18);assert.equal(new Set(themes.list.map(t=>t.id)).size,18);
  assert.equal(themes.artworkThemes.length,7);
  for(const id of ['fantasy_witch','mother_daughter','fantasy_club'])assert(themes.artworkThemes.some(t=>t.id===id),id);
  for(const t of themes.list){const p=core.preferences({theme:t.id});assert.equal(p.theme,t.id);assert.deepEqual(core.preferences(JSON.parse(JSON.stringify(p))),p);}
  const old=core.preferences({theme:'suketto',workers:7,downloadDir:'D:/saved',queueDetails:true});
  assert.equal(old.workers,7);assert.equal(old.downloadDir,'D:/saved');assert.equal(old.queueDetails,true);assert.equal(old.artworkFits.suketto,'medium');
  assert.equal(core.preferences().theme,'light');
  assert.equal(core.preferences({theme:'fantasy_ensemble'}).theme,'light','Preview-only castle IDs must not become installed themes');
});
test('artwork settings clamp imported values and keep framing separate per template',()=>{
  const p=core.preferences({theme:'fantasy_club',artworkQueueWidth:'more',artworkOpacity:999,artworkFits:{suketto:'full',asagi:'full',survival:'medium',worldtree:'file:///untrusted',fantasy_witch:'full',mother_daughter:'file:///untrusted',fantasy_club:'medium',light:'medium'}});
  assert.equal(p.artworkOpacity,100);assert.equal(p.artworkQueueWidth,'more');
  assert.deepEqual(p.artworkFits,{survival:'fill',asagi:'full',suketto:'full',worldtree:'fill',fantasy_witch:'full',mother_daughter:'fill',fantasy_club:'full'});
  assert.equal(p.theme,'fantasy_club');assert.deepEqual(core.preferences(JSON.parse(JSON.stringify(p))),p);
  const bad=core.preferences({artworkQueueWidth:'bad',artworkOpacity:'no',artworkFits:null});
  assert.equal(bad.artworkOpacity,90);assert.equal(bad.artworkQueueWidth,'less');assert.equal(bad.artworkFits.suketto,'medium');
  assert.equal(bad.artworkFits.fantasy_club,'full');
  assert.equal(core.preferences({artworkOpacity:-10}).artworkOpacity,35);
});
test('packaged template assets match the approved preview bytes',()=>{
  const folder=path.resolve(__dirname,'../assets/templates'),manifest=require('../assets/templates/manifest.json');
  assert.equal(manifest.artwork.length,7);
  for(const row of manifest.artwork){const bytes=fs.readFileSync(path.join(folder,row.file));assert.equal(bytes.length,row.bytes);assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),row.sha256);}
  for(const t of themes.artworkThemes)assert(fs.existsSync(path.resolve(__dirname,'../app',t.artwork)));
  assert.deepEqual(new Set(manifest.artwork.map(row=>row.file)),new Set(themes.artworkThemes.map(t=>path.basename(t.artwork))));
  assert.deepEqual(new Set(fs.readdirSync(folder).filter(file=>file.endsWith('.png'))),new Set(manifest.artwork.map(row=>row.file)),'Only the seven approved template bitmaps are shipped');
  const club=fs.readFileSync(path.join(folder,'fantasy-club.png'));
  assert.equal(club.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(club.readUInt32BE(16),1836);assert.equal(club.readUInt32BE(20),857);
  assert.equal(manifest.artwork.find(r=>r.file==='baseball-original-8k.png').sha256,'57e83592acd7877469992a18f8bff6e744c17fc9ccb4af53739394f769eec653');
});
