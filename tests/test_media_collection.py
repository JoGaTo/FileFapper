"""Non-explicit media and dated collection fixtures, including worker processes."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import io, json, os, subprocess, sys, tempfile, threading, unittest, zipfile
from pathlib import Path
from types import SimpleNamespace
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'engine'))
from media_formats import kind_for, validate_file, ugoira_preview
from native_adapters import resolve, parse_reader
from post_collection import collect, date_range, in_range

def picture(color):
    stream=io.BytesIO();Image.new('RGB',(24,24),color).save(stream,format='PNG');return stream.getvalue()

def animation_zip():
    stream=io.BytesIO()
    with zipfile.ZipFile(stream,'w') as z:
        z.writestr('000000.png',picture('red'));z.writestr('000001.png',picture('blue'))
    return stream.getvalue()

ZIP=animation_zip()
FRAMES=[{'file':'000000.png','delay':70},{'file':'000001.png','delay':130}]
MEDIA={'image.png':picture('white'),'movie.mp4':b'\x00\x00\x00\x18ftypisom\x00\x00\x00\x00isommp42',
       'sound.wav':b'RIFF'+(36).to_bytes(4,'little')+b'WAVEfmt '+b'\x00'*24,'bundle.zip':ZIP,'animation.zip':ZIP}

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args): pass
    def do_GET(self):
        from urllib.parse import urlparse,parse_qs
        u=urlparse(self.path);query=parse_qs(u.query);self.server.hits.append(self.path)
        if u.path.startswith('/media/'):
            content=MEDIA[u.path.split('/')[-1]];self.send_response(200);self.send_header('Content-Length',str(len(content)));self.end_headers();self.wfile.write(content);return
        if u.path=='/posts.json':
            content=[{'id':1,'created_at':'2026-10-01T20:00:00Z','tag_string':'first'},{'id':2,'created_at':'2026-10-02T00:01:00Z'},{'id':3,'created_at':'2026-10-03T00:00:00Z'},{'id':4}]
        elif '/api/v1/' in u.path:
            content=[{'id':'a','service':'patreon','user':'123','published':'2026-10-01T20:00:00Z','title':'First'},{'id':'b','service':'patreon','user':'123','published':'2026-10-02T21:00:00Z','title':'Second'},{'id':'c','service':'patreon','user':'123','title':'Undated'}] if query.get('o',['0'])[0]=='0' else []
        else:
            self.send_error(404);return
        data=json.dumps(content).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)

class MediaCollectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),Handler);cls.server.hits=[]
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start();cls.base=f'http://127.0.0.1:{cls.server.server_port}'
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close()
    def worker(self,req):
        command=[os.environ['DF_ENGINE_EXE']] if os.environ.get('DF_ENGINE_EXE') else [sys.executable,str(ROOT/'engine/engine.py')]
        result=subprocess.run(command,input=json.dumps(req)+'\n',text=True,encoding='utf-8',capture_output=True,timeout=60)
        events=[json.loads(line) for line in result.stdout.splitlines() if line.startswith('{')]
        self.assertEqual(result.returncode,0,events or result.stderr);return events
    def test_typed_media_does_not_include_executables(self):
        for ext,kind in [('mp4','video'),('webm','video'),('mp3','audio'),('flac','audio'),('7z','archive'),('zip','archive'),('gif','image')]:self.assertEqual(kind_for(ext),kind)
        self.assertIsNone(kind_for('exe'));self.assertIsNone(kind_for('html'))
    def test_invalid_media_payloads_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            p=Path(folder)/'invalid'
            for ext in ('mp4','wav','zip','png'):
                p.write_bytes(b'<html>Sign in</html>')
                with self.assertRaises(Exception):validate_file(p,ext)
            p.write_bytes(b'PK\x03\x04broken')
            with self.assertRaises(Exception):validate_file(p,'zip')
    def test_ugoira_frame_order_delays_and_original_archive(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'original.zip';source.write_bytes(ZIP);target=Path(folder)/'playback.webp'
            companions=ugoira_preview(source,FRAMES,target)
            self.assertEqual(source.read_bytes(),ZIP);self.assertEqual(len(companions),2)
            with Image.open(target) as im:
                self.assertEqual(im.n_frames,2);im.seek(0);im.load();self.assertEqual(im.info['duration'],70);im.seek(1);im.load();self.assertEqual(im.info['duration'],130)
            self.assertEqual(json.loads(target.with_suffix('.frames.json').read_text())['frames'],FRAMES)
    def test_ugoira_never_extracts_paths(self):
        with tempfile.TemporaryDirectory() as folder:
            source=Path(folder)/'original.zip';source.write_bytes(ZIP)
            for filename in ('../outside.png','C:\\outside.png','dir/file.png'):
                with self.assertRaises(ValueError):ugoira_preview(source,[{'file':filename,'delay':100}],Path(folder)/'out.webp')
    def test_pixiv_ugoira_metadata_uses_original_zip(self):
        responses={'/ajax/illust/9':{'body':{'illustType':2,'title':'Fixture'}},'/ajax/illust/9/ugoira_meta':{'body':{'src':'https://i.pximg.net/small.zip','originalSrc':'https://i.pximg.net/full.zip','frames':FRAMES}}}
        ctx=SimpleNamespace(session=SimpleNamespace(headers={}),fetch=lambda url:SimpleNamespace(json=lambda:responses[url.replace('https://www.pixiv.net','')]))
        item=resolve({'siteId':'pixiv','url':'https://www.pixiv.net/artworks/9'},ctx)['images'][0]
        self.assertEqual(item['url'],'https://i.pximg.net/full.zip');self.assertEqual(item['ugoira'],FRAMES)
    def test_booru_video_and_archive_original_links(self):
        for site in ('rule34','tbib','gelbooru','r34app'):
            self.assertTrue(parse_reader(site,'<video><source src="/file.webm"></video>','https://board.example/post')['images'][0]['url'].endswith('.webm'))
            self.assertTrue(parse_reader(site,'<a id="highres" href="/file.zip">Original</a>','https://board.example/post')['images'][0]['url'].endswith('.zip'))
    def test_danbooru_instance_keeps_aibooru_origin(self):
        called=[]
        ctx=SimpleNamespace(fetch=lambda url:(called.append(url) or SimpleNamespace(json=lambda:{'id':9,'file_url':'https://cdn.example/file.webm','file_ext':'webm'})))
        result=resolve({'siteId':'aibooru','url':'https://aibooru.online/posts/9'},ctx)
        self.assertEqual(called,['https://aibooru.online/posts/9.json']);self.assertEqual(result['images'][0]['extension'],'webm')
    def test_worker_downloads_mixed_media_with_real_extensions(self):
        with tempfile.TemporaryDirectory() as folder:
            images=[{'url':self.base+'/media/'+name,'extension':name.split('.')[-1]} for name in list(MEDIA)[:4]]
            req={'id':'mixed','url':self.base+'/gallery','siteId':'kemono','downloadDir':folder,'workers':3,'upscale':2,'delay':.2,'capture':{'url':self.base+'/gallery','images':images}}
            events=self.worker(req);files=[e for e in events if e['event']=='file']
            self.assertEqual({e['mediaKind'] for e in files},{'image','video','audio','archive'})
            for e in files:
                if e['mediaKind']!='image':self.assertIn(Path(e['path']).read_bytes(),MEDIA.values());self.assertEqual(e['upscale'],1)
            restored=self.worker(req);self.assertTrue(all(e['restored'] for e in restored if e['event']=='file'))
    def test_worker_ugoira_keeps_zip_and_playable_companions_on_resume(self):
        with tempfile.TemporaryDirectory() as folder:
            req={'id':'ugoira','url':self.base+'/gallery','siteId':'pixiv','downloadDir':folder,'delay':.2,'capture':{'url':self.base+'/gallery','images':[{'url':self.base+'/media/animation.zip','extension':'zip','ugoira':FRAMES}]}}
            result=self.worker(req);file=next(e for e in result if e['event']=='file')
            self.assertEqual(Path(file['path']).read_bytes(),ZIP);self.assertTrue(Path(file['previewPath']).is_file());self.assertEqual(len(file['companions']),2)
            self.assertEqual(next(e for e in self.worker(req) if e['event']=='file')['previewPath'],file['previewPath'])
    def test_dates_are_inclusive_and_validated(self):
        self.assertTrue(in_range('2026-10-02T23:59:59Z','2026-10-02','2026-10-02'));self.assertFalse(in_range('', '2026-10-01',''))
        for req in ({'dateFrom':'2026-02-30'},{'dateFrom':'2026-10-03','dateTo':'2026-10-01'}):
            with self.assertRaises(ValueError):date_range(req)
    def test_worker_collects_danbooru_by_date_without_media(self):
        before=len(self.server.hits);events=self.worker({'mode':'collect','siteId':'danbooru','url':self.base+'/posts?tags=sample','dateFrom':'2026-10-02','dateTo':'2026-10-02','extraPages':0})
        last=events[-1];self.assertEqual([r['url'].split('/')[-1] for r in last['rows']],['2']);self.assertEqual(last['undated'],1);self.assertEqual(len(self.server.hits)-before,1)
    def test_worker_collects_pawchive_and_kemono_creator_dates(self):
        for site in ('pawchive','kemono'):
            events=self.worker({'mode':'collect','siteId':site,'url':self.base+'/patreon/user/123?q=keep','dateFrom':'2026-10-02','dateTo':'2026-10-02','extraPages':0})
            self.assertEqual([r['url'].split('/')[-1] for r in events[-1]['rows']],['b']);self.assertEqual(events[-1]['undated'],1)
    def test_new_gallery_dl_profiles_match_individual_urls(self):
        from gallery_dl import extractor
        for url in ('https://www.hentai-foundry.com/pictures/user/fixture/12345/title','https://fapreactor.com/post/12345','https://civitai.com/images/12345','https://civitai.com/posts/12345'):
            self.assertIsNotNone(extractor.find(url),url)

if __name__=='__main__':unittest.main()
