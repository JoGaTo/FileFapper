'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const library=require('../app/saved-tags.cjs'),core=require('../app/core.cjs'),extra=require('../app/extra-listings.cjs'),galleries=require('../app/gallery-lists.cjs'),scroll=require('../app/browser-plugins/infinite-scroll.cjs');
test('tag library preserves exclusions and rejects unrelated or executable origins',()=>{
 const rows=library.saved([{id:'one',site:'kurosearch',name:'Landscape',tags:'landscape -water rating:safe'},{id:'two',site:'kurosearch',tags:'landscape -water rating:safe'},{site:'r34react',tags:'sky -cloud'},{site:'evil',tags:'other'}]);
 assert.equal(rows.length,2);assert.equal(rows[0].tags,'landscape -water rating:safe');assert.deepEqual(library.saved(JSON.parse(JSON.stringify(rows))),rows);
 for(const url of ['https://kurosearch.com.evil.test/','javascript:alert(1)','https://name:secret@kurosearch.com/','https://kurozenzen.github.io/other'])assert.equal(library.siteId(url),null);
 assert.equal(library.siteId('https://kurozenzen.github.io/r34-react/#/'),'r34react');assert.equal(library.siteId('https://kurosearch.com/'),'kurosearch');
});
test('scrolling accepts 2000 pixels per second and bounds oversized saved values',()=>{
 assert.equal(scroll.settings({speed:2000}).speed,2000);assert.equal(scroll.settings({speed:99999}).speed,2000);assert.equal(scroll.settings({speed:-10}).speed,20);assert.equal(scroll.settings({speed:'bad'}).speed,90);
});
test('all ten added domains match without admitting lookalike hosts',()=>{
 for(const host of ['rule34ai.art','rule34.us','rule34.pw','cartoon18.com','177picyy.com','ho5ho.com','dabaitu-mh.cc','hentaidb.xyz','doujiva.com','kasei.cc']){
  assert(core.siteFor('https://'+host+'/').browserCapture);assert.equal(core.siteFor('https://'+host+'.evil.test/'),null);
 }
 assert.equal(extra.profile('https://rule34.us/index.php?r=posts/view&id=123').detail,true);assert.equal(galleries.listingKind('https://rule34.us/index.php?r=posts/index&q=landscape'),'extra');assert.equal(galleries.listingKind('https://rule34.us/index.php?r=posts/view&id=123'),null);
 assert.equal(galleries.listingKind('https://cartoon18.com/v/series'),'extra');assert.equal(galleries.listingKind('https://cartoon18.com/story/123/full'),null);
});

test('infinite scroll column preference is bounded and independent of original pages',()=>{
 assert.equal(scroll.settings({}).columns,4);for(let n=1;n<=5;n++)assert.equal(scroll.settings({columns:n}).columns,n);assert.equal(scroll.settings({columns:99}).columns,5);assert.equal(scroll.settings({columns:-4}).columns,1);
});
