'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {Readable}=require('node:stream');
const {isInside}=require('./core.cjs');
const types={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',avif:'image/avif',bmp:'image/bmp',mp4:'video/mp4',m4v:'video/mp4',mov:'video/quicktime',webm:'video/webm',mkv:'video/x-matroska',mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',ogg:'audio/ogg',opus:'audio/ogg',flac:'audio/flac',aac:'audio/aac'};
function serve(request,tasks){
 try{
  const u=new URL(request.url),task=tasks.find(t=>t.id===u.hostname),file=task?.files.find(f=>f.index===Number(u.pathname.slice(1))),target=u.searchParams.get('original')==='1'&&file?.originalPath?file.originalPath:u.searchParams.get('preview')==='1'&&file?.previewPath?file.previewPath:file?.path;
  if(!task?.folder||!target||!isInside(task.folder,target)||!fs.existsSync(target))return new Response('Missing file',{status:404});
  const size=fs.statSync(target).size,ext=path.extname(target).slice(1).toLowerCase();
  const headers={'Content-Type':types[ext]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
  let start=0,end=size-1,status=200;
  const range=request.headers?.get('range');
  if(range){const m=range.match(/^bytes=(\d*)-(\d*)$/);if(!m||(!m[1]&&!m[2]))return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});if(m[1]){start=Number(m[1]);if(m[2])end=Math.min(end,Number(m[2]));}else start=Math.max(0,size-Number(m[2]));if(start>=size||start>end)return new Response(null,{status:416,headers:{'Content-Range':`bytes */${size}`}});status=206;headers['Content-Range']=`bytes ${start}-${end}/${size}`;}
  headers['Content-Length']=String(Math.max(0,end-start+1));
  return new Response(request.method==='HEAD'||!size?null:Readable.toWeb(fs.createReadStream(target,{start,end})),{status,headers});
 }catch{return new Response('Invalid file',{status:400});}
}
module.exports={serve,types};
