'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),path=require('node:path');
const {profilePath}=require('../app/profile.cjs'),themes=require('../app/theme-data.js'),tags=require('../app/saved-tags.cjs');
test('FileFapper retains the existing profile and permits isolated preview profiles',()=>{
 const appData=path.resolve('fixture','AppData','Roaming');assert.equal(profilePath({appData}),path.join(appData,'D&F'));assert.equal(profilePath({appData,override:'fixture-preview'}),path.resolve('fixture-preview'));
});
test('background brightness is per template, bounded, and compatible with old sessions',()=>{
 const original=themes.artworkPreferences({});assert.equal(Object.keys(original.artworkBrightness).length,7);assert(Object.values(original.artworkBrightness).every(v=>v===100));
 const p=themes.artworkPreferences({artworkBrightness:{mother_daughter:60,suketto:140,asagi:999,worldtree:-1,survival:'bad'}});
 assert.equal(p.artworkBrightness.mother_daughter,60);assert.equal(p.artworkBrightness.suketto,140);assert.equal(p.artworkBrightness.asagi,160);assert.equal(p.artworkBrightness.worldtree,40);assert.equal(p.artworkBrightness.survival,100);assert.deepEqual(themes.artworkPreferences(JSON.parse(JSON.stringify(p))),p);
});
test('saved tag parsing separates chips and retains include, exclude and optional modifiers',()=>{
 assert.deepEqual(tags.parse('landscape; -water ~sky +forest'),[{name:'landscape',modifier:'+'},{name:'water',modifier:'-'},{name:'sky',modifier:'~'},{name:'forest',modifier:'+'}]);
 assert.deepEqual(tags.parse('-"long hair"'),[{name:'long_hair',modifier:'-'}]);assert.throws(()=>tags.parse('( sky ~ clouds )'),/grouped/);assert.throws(()=>tags.parse(''));assert.deepEqual(tags.parse('Sky -WATER'),[{name:'sky',modifier:'+'},{name:'water',modifier:'-'}]);
 const url=new URL(tags.kuroUrl(tags.parse('landscape -water ~sky'),{sort:{property:'score',direction:'desc'},filter:{rating:'safe',scoreComparator:'>=',scoreValue:10}}));
 assert.equal(url.origin,'https://kurosearch.com');assert.equal(url.pathname,'/share');assert.equal(url.searchParams.get('tags'),'+landscape;-water;~sky');assert.equal(url.searchParams.get('sort'),'score:desc');assert.equal(url.searchParams.get('filter'),'rating:safe;score>=10');
});
