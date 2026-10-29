'use strict';
// Shared by saved-preference validation and the renderer's theme picker.
(function(root){
  const list = [
    {id:'light',name:'Light',colors:['#f6f7f9','#ffffff','#e4e5ed']},
    {id:'dark',name:'Dark',colors:['#1b1e27','#282c38','#41475b']},
    {id:'black',name:'Black',colors:['#08090b','#17171b','#303038']},
    {id:'brown',name:'Brown',colors:['#f2ece3','#fffaf3','#dbcdba']},
    {id:'summer',name:'Summer',symbol:'☀ ',colors:['#fff6e2','#fffdf6','#abc7a7']},
    {id:'winter',name:'Winter',symbol:'❄ ',colors:['#edf5ff','#ffffff','#a5bfdc']},
    {id:'ruby',name:'Ruby',symbol:'◆ ',colors:['#1f1018','#301c28','#8f526c']},
    {id:'sapphire',name:'Sapphire',symbol:'✦ ',colors:['#101b30','#1b2b49','#4e7aa8']},
    {id:'kawaii',name:'Kawaii anime',symbol:'♡ ',colors:['#fff0f7','#fffcff','#deb2cf']},
    {id:'steampunk',name:'Steampunk',colors:['#211a15','#33281f','#d0a766']},
    {id:'cyberpunk',name:'Cyberpunk',colors:['#111123','#20203b','#57e9ed']},
    {id:'survival',name:'戦姫サバイバルサガ/Senki Survival',colors:['#132b25','#203d34','#a9d8b4'],artwork:'../assets/templates/survival-island.png',description:'Colored manga · Horned duo on an island',defaultFit:'fill'},
    {id:'asagi',name:'対魔忍アサギ/Taimanin',colors:['#17172c','#282741','#ac9de6'],artwork:'../assets/templates/asagi-city-night.png',description:'Colored manga · Four fighters in the city at night',defaultFit:'fill'},
    {id:'suketto',textEffect:'shadow',name:'助っ人参上!!/Suketto Sanjou !!',colors:['#fff3e8','#fffaf5','#df8d95'],artwork:'../assets/templates/baseball-original-8k.png',description:'Original artwork enlarged · Baseball pair',defaultFit:'medium'},
    {id:'worldtree',name:'세계수를따먹다/Potential Husband of The World Tree',colors:['#201b30','#30283f','#e5ba8e'],artwork:'../assets/templates/worldtree-manga.png',description:'Colored manga · Fantasy trio in a blossom grove',defaultFit:'fill'},
    {id:'fantasy_witch',name:'巨乳魔女/Kyonyuu Majo',colors:['#1b162c','#2c233d','#f6d69c'],artwork:'../assets/templates/fantasy-witch-academy.png',description:'Colored manga · Magical academy pair',defaultFit:'fill'},
    {id:'mother_daughter',textEffect:'shadow',name:'母娘丼おっぱい特盛母乳汁だくで/Oyakodon: Oppai Tokumori',colors:['#fff0df','#fffaf2','#9e3b62'],artwork:'../assets/templates/mother-daughter-sunset.png',description:'Colored manga · Sunset bridge pair',defaultFit:'fill'},
    {id:'fantasy_club',name:'巨乳ファンタジー/Kyonyuu Fantasy',colors:['#11172b','#202940','#9ce6ed'],artwork:'../assets/templates/fantasy-club.png',description:'Colored manga · Eleven characters in a modern club',defaultFit:'full'}
  ];
  const artworkThemes = list.filter(t=>t.artwork);
  function validFit(theme,value){return value==='full'||value==='fill'||theme.id==='suketto'&&value==='medium'?value:theme.defaultFit;}
  function artworkPreferences(p={}){
    const fits=p.artworkFits&&typeof p.artworkFits==='object'?p.artworkFits:{};
    const opacity=Number(p.artworkOpacity);
    return {
      artworkQueueWidth:['less','more','full'].includes(p.artworkQueueWidth)?p.artworkQueueWidth:'less',
      artworkOpacity:Number.isFinite(opacity)?Math.round(Math.max(35,Math.min(100,opacity))):90,
      artworkBrightness:Object.fromEntries(artworkThemes.map(t=>{const value=Number(p.artworkBrightness?.[t.id]);return [t.id,Number.isFinite(value)?Math.round(Math.max(40,Math.min(160,value))):100];})),
      artworkFits:Object.fromEntries(artworkThemes.map(t=>[t.id,validFit(t,fits[t.id])]))
    };
  }
  const api={list,artworkThemes,validFit,artworkPreferences};
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.DFThemes=api;
})(globalThis);
