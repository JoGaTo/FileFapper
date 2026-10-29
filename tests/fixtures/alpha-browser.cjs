function markup(u){
 const hf=u.hostname.includes('hentai-foundry'),reactor=u.hostname.includes('reactor'),tbib=u.hostname==='tbib.org';
 if(hf||reactor||tbib){const second=/\/page\/2$|\/sample\/2$/.test(u.pathname)||u.searchParams.get('pid')==='42',ids=second?[703,704]:[701,702];
  const link=id=>hf?'/pictures/user/Fixture/'+id+'/Sample':reactor?'/post/'+id:'/index.php?page=post&s=view&id='+id;
  const next=hf?u.pathname.replace(/\/page\/\d+$/,'')+'/page/2':reactor?u.pathname+'/2':'/index.php?page=post&s=list&pid=42';
  return '<!doctype html><title>Collection fixture</title>'+ids.map(id=>`<article class="thumb"><a href="${link(id)}"><img alt="Post ${id}"></a><time datetime="2026-10-20T09:00:00Z"></time></article>`).join('')+(second?'':`<ul class="pagination"><li class="next"><a href="${next}">Next &gt;</a></li></ul>`);
 }
 if(u.hostname==='www.pixiv.net'){
  if(u.pathname==='/ajax/illust/123')return {json:{error:false,body:{id:'123',title:'Non-explicit viewer fixture',description:'An abstract test pixel',illustType:0,illustId:'123',illustTitle:'Non-explicit viewer fixture',userId:'99',userName:'Fixture Artist',userAccount:'fixture',width:1,height:1,pageCount:1,xRestrict:0,aiType:0,restrict:0,sl:2,isOriginal:true,isBookmarkable:true,bookmarkData:null,bookmarkCount:0,likeCount:0,viewCount:0,commentCount:0,createDate:'2026-10-20T09:00:00Z',uploadDate:'2026-10-20T09:00:00Z',urls:{mini:'https://i.pximg.net/img-master/123_p0_master1200.jpg',thumb:'https://i.pximg.net/img-master/123_p0_master1200.jpg',small:'https://i.pximg.net/img-master/123_p0_master1200.jpg',regular:'https://i.pximg.net/img-master/123_p0_master1200.jpg',original:'https://i.pximg.net/img-original/123_p0.png'},tags:{authorId:'99',tags:[]},userIllusts:{},seriesNavData:null,request:null}}};
  if(u.pathname==='/ajax/illust/123/pages')return {json:{error:false,body:[{width:1,height:1,urls:{original:'https://i.pximg.net/img-original/123_p0.png',regular:'https://i.pximg.net/img-master/123_p0_master1200.jpg',small:'https://i.pximg.net/img-master/123_p0_master1200.jpg'}}]}};
  if(u.pathname==='/ajax/user/99')return {json:{error:false,body:{userId:'99',name:'Fixture Artist',imageBig:'https://i.pximg.net/fixture.png',image:'https://i.pximg.net/fixture.png',isFollowed:false,comment:'Fixture',background:null,following:0,mypixivCount:0,profile:{},workspace:{}}}};
  if(u.pathname.startsWith('/ajax/'))return {json:{error:false,body:{illusts:[],manga:[],thumbnails:{illust:[]},users:{},tags:[],works:{},illustIds:[],total:0}}};
  return '<!doctype html><html><head><meta id="meta-global-data" content="{&quot;token&quot;:&quot;fixture&quot;,&quot;mute&quot;:[],&quot;userData&quot;:{&quot;id&quot;:&quot;1&quot;,&quot;premium&quot;:false,&quot;xRestrict&quot;:0}}"><title>Pixiv viewer fixture</title></head><body>Viewer fixture</body></html>';
 }
 return '<!doctype html><title>Data fixture</title><p>Local browser test.</p>';
}
module.exports={markup};
