import concurrent.futures
import base64
import errno
import hashlib
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import importlib.util
import io
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'engine'))
spec=importlib.util.spec_from_file_location('dfengine',ROOT/'engine/engine.py')
engine=importlib.util.module_from_spec(spec)
spec.loader.exec_module(engine)

def image_bytes():
    im=Image.new('RGB',(120,103))
    for y in range(im.height):
        for x in range(im.width):
            im.putpixel((x,y),(y*2,x*2,50))
    data=io.BytesIO();im.save(data,format='PNG');return data.getvalue()
PNG=image_bytes()
REQUESTS=[]

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):
        pass
    def do_GET(self):
        REQUESTS.append((self.path,self.headers.get('Range'),self.headers.get('Cookie')))
        if self.path=='/cooldown':
            self.send_response(429);self.send_header('Retry-After','7');self.end_headers();return
        if self.path=='/denied':
            self.send_response(403);self.end_headers();return
        if self.path=='/protected' and 'auth=ok' not in (self.headers.get('Cookie') or ''):
            self.send_response(401);self.end_headers();return
        content=None
        if self.path.startswith('/native/'):
            kind=self.path.split('/native/')[1].split('?')[0]
            if kind=='doujinhentai':content='<script>const pageUrls = {"1":"/image1.png"};</script>'
            elif kind=='ikuhentai':content='<div class="reading-content"><div><img data-lazy-src="/image1.png"></div></div>'
            elif kind=='toonkor':content="<script>var toon_img = '"+base64.b64encode(b'<img src="/image1.png">').decode()+"';</script>"
            elif kind=='comix':content='<script id="initial-data">{"queries":[{"data":{"images":[{"url":"/image1.png"}]}}]}</script>'
            elif kind=='blacktoon':content='<div id="toon_content_imgs"><img o_src="/image1.png"></div>'
            else:content='<img id="image" src="/image1.png"><a id="highres" href="/image1.png">Original</a>'
        elif self.path=='/data/config.js':
            content=f'var img_domain="http://127.0.0.1:{self.server.server_port}";'
        elif self.path=='/album/230000':
            content='<html><h1 id="book-name">JM local fixture</h1><a href="/photo/230000/">Read</a></html>'
        elif self.path=='/photo/230000/':
            content='<html><script>var scramble_id = 220980;</script><img id="album_photo_1" data-original="/image1.png"></html>'
        elif self.path=='/photos-index-aid-1.html':
            content='<html><h2>WN local fixture</h2><a href="/photos-view-id-1.html">Page 1</a><a href="/photos-index-page-2-aid-1.html">Next</a></html>'
        elif self.path=='/photos-index-page-2-aid-1.html':
            content='<html><a href="/photos-view-id-2.html">Page 2</a></html>'
        elif self.path in ('/photos-view-id-1.html','/photos-view-id-2.html'):
            content='<html><img id="picarea" src="/image1.png"></html>'
        elif self.path=='/search':
            content='<html><a href="/gallery/1"><img alt="First local gallery"></a><a href="/gallery/1">First local gallery</a><a href="/gallery/2">Second local gallery</a><a href="https://evil.example/gallery/3">Offsite</a></html>'
        if content is not None:
            data=content.encode();self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
        if self.path.startswith('/image'):
            data=PNG;offset=0
            if self.headers.get('Range'):
                offset=int(self.headers['Range'].split('=')[1].split('-')[0]);data=PNG[offset:]
            self.send_response(206 if offset else 200);self.send_header('Content-Type','image/png');self.send_header('Content-Length',str(len(data)))
            if offset:
                self.send_header('Content-Range',f'bytes {offset}-{len(PNG)-1}/{len(PNG)}')
            self.end_headers();self.wfile.write(data);return
        data=b'<html><title>Local fixture</title><h1>Fixture gallery</h1><div class="gallery-page"><img src="/image1.png"><img src="/image2.png"><img src="/image3.png"></div></html>'
        self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)

class EngineTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),Handler);cls.port=cls.server.server_port
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown();cls.server.server_close()
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name)
        self.plugin=self.root/'fixture.py'
        self.plugin.write_text((ROOT/'examples/example_site.py').read_text().replace("'gallery.example.com'","'127.0.0.1'"),encoding='utf-8')
        REQUESTS.clear()
    def tearDown(self):
        self.temp.cleanup()
    def run_worker(self,**overrides):
        req={'mode':'download','id':'fixture-task-001','url':f'http://127.0.0.1:{self.port}/gallery','siteId':'fixture','downloadDir':str(self.root/'downloads'),'plugin':str(self.plugin),'workers':2,'delay':.2,'repair':True,'quality':'resampled'}
        req.update(overrides)
        command=[os.environ['DF_ENGINE_EXE']] if os.environ.get('DF_ENGINE_EXE') else [sys.executable,str(ROOT/'engine/engine.py')]
        p=subprocess.run(command,input=json.dumps(req)+'\n',text=True,encoding='utf-8',capture_output=True,timeout=30)
        return p,[json.loads(line) for line in p.stdout.splitlines() if line.startswith('{')]
    def test_download_metadata_numbering_and_resume_hashes(self):
        p,events=self.run_worker();self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        files=[e for e in events if e['event']=='file'];self.assertEqual(len(files),3)
        folder=Path(next(e['folder'] for e in events if e['event']=='complete'))
        self.assertTrue((folder/'.filefapper/fixture-task-001/gallery.json').is_file());self.assertTrue((folder/'.filefapper/fixture-task-001/.dandf-task.json').is_file());self.assertEqual(len(list(folder.glob('*.png'))),3)
        hashes={f.name:hashlib.sha256(f.read_bytes()).hexdigest() for f in folder.glob('*.png')}
        REQUESTS.clear();p,events=self.run_worker(folder=str(folder));self.assertEqual(p.returncode,0,p.stdout)
        self.assertEqual(len([e for e in events if e['event']=='file' and e.get('restored')]),3)
        self.assertFalse(any(url.startswith('/image') for url,*_ in REQUESTS))
        damaged=Path(next(f['path'] for f in files if f['index']==2));damaged.write_bytes(b'bad file')
        REQUESTS.clear();p,events=self.run_worker(folder=str(folder));self.assertEqual(p.returncode,0,p.stdout)
        self.assertEqual(hashlib.sha256(damaged.read_bytes()).hexdigest(),hashes[damaged.name])
        self.assertEqual(len([e for e in events if e['event']=='file' and e.get('restored')]),2)
    def test_shared_folder_keeps_original_names_and_gallery_ids(self):
        url1=f'http://127.0.0.1:{self.port}/gallery/101'
        url2=f'http://127.0.0.1:{self.port}/gallery/202'
        p,first=self.run_worker(url=url1,id='gallery-task-101')
        self.assertEqual(p.returncode,0,p.stdout)
        p,second=self.run_worker(url=url2,id='gallery-task-202')
        self.assertEqual(p.returncode,0,p.stdout)
        folder=Path(first[-1]['folder'])
        self.assertEqual(folder,Path(second[-1]['folder']))
        first_files=[Path(e['path']) for e in first if e['event']=='file']
        second_files=[Path(e['path']) for e in second if e['event']=='file']
        self.assertEqual(len(list(folder.glob('*.png'))),6)
        self.assertTrue(all('_101-' in f.name for f in first_files))
        self.assertTrue(all('_202-' in f.name for f in second_files))
        self.assertTrue(any(f.name.startswith('image1_') for f in first_files))
        self.assertTrue(all(f.read_bytes()==PNG for f in first_files+second_files))
        p,resumed=self.run_worker(url=url1,id='gallery-task-101',folder=str(folder))
        self.assertEqual(p.returncode,0,p.stdout)
        self.assertEqual(len([e for e in resumed if e.get('restored')]),3)

    def test_original_filename_dots_and_id_in_slug_are_preserved(self):
        script=self.plugin.read_text(encoding='utf-8')
        script=script.replace("images.append({'url': urljoin(url, source)})", "images.append({'url': urljoin(url, source), 'filename': 'scan.page.final' if 'image1' in source else 'complete.name.png', 'extension': 'png'})")
        self.plugin.write_text(script,encoding='utf-8')
        p,events=self.run_worker(url=f'http://127.0.0.1:{self.port}/gallery/101-title')
        self.assertEqual(p.returncode,0,p.stdout)
        files=[e['name'] for e in events if e['event']=='file']
        self.assertTrue(any(name.startswith('scan.page.final_101-') for name in files))
        self.assertTrue(any(name.startswith('complete.name_101-') for name in files))

    def test_filesystem_without_hardlinks_uses_exclusive_creation(self):
        req={'mode':'preview','id':'fallback-task','url':'dfdemo://sample/9?sampleDelay=0.05','siteId':'fixture','downloadDir':str(self.root/'downloads'),'workers':1,'delay':.2}
        events=[]
        with patch.object(engine.os,'link',side_effect=OSError(errno.ENOTSUP,'hard links unsupported')),patch.object(engine,'emit',side_effect=lambda event,**data:events.append({'event':event,**data})):
            engine.download(req)
        output=Path(next(e['path'] for e in events if e['event']=='file'))
        with Image.open(output) as image:self.assertEqual(image.format,'JPEG')

    def test_preview_downloads_one_page(self):
        p,events=self.run_worker(mode='preview');self.assertEqual(p.returncode,0,p.stdout)
        self.assertEqual(len([e for e in events if e['event']=='file']),1);self.assertTrue(events[-1]['preview'])
    def test_enlargement_retains_source_bytes_and_has_expected_dimensions(self):
        for scale in (1.5,2):
            p,events=self.run_worker(upscale=scale,id='scale-'+str(scale));self.assertEqual(p.returncode,0,p.stdout)
            folder=Path(events[-1]['folder'])
            self.assertEqual(Path(next(e['originalPath'] for e in events if e['event']=='file' and e['index']==1)).read_bytes(),PNG)
            with Image.open(next(e['path'] for e in events if e['event']=='file' and e['index']==1)) as image:self.assertEqual(image.size,(round(120*scale),round(103*scale)))
            self.assertTrue(all(e['upscale']==scale for e in events if e['event']=='file'))
    def test_captured_reader_files_are_confined_to_capture_directory(self):
        capture_dir=self.root/'captures';capture_dir.mkdir();source=capture_dir/'page.png';source.write_bytes(PNG)
        url=f'http://127.0.0.1:{self.port}/chapter'
        capture={'url':url,'title':'Captured chapter','images':[{'localPath':str(source),'extension':'png'}]}
        p,events=self.run_worker(plugin=None,url=url,capture=capture,captureRoot=str(capture_dir));self.assertEqual(p.returncode,0,p.stdout)
        folder=Path(events[-1]['folder']);self.assertEqual(Path(next(e['path'] for e in events if e['event']=='file')).read_bytes(),PNG)
        outside=self.root/'private.png';outside.write_bytes(PNG);capture['images'][0]['localPath']=str(outside)
        p,events=self.run_worker(plugin=None,url=url,capture=capture,captureRoot=str(capture_dir),id='capture-invalid');self.assertNotEqual(p.returncode,0);self.assertIn('Invalid browser capture file',events[-1]['message'])
    def test_new_native_readers_run_through_the_download_pipeline(self):
        for site in ('comix','doujinhentai','ikuhentai','toonkor','blacktoon','gelbooru','rule34','yandere'):
            with self.subTest(site=site):
                url=f'http://127.0.0.1:{self.port}/native/{site}'+('?s=view&id=1' if site in ('gelbooru','rule34') else '')
                p,events=self.run_worker(plugin=None,url=url,siteId=site,id='native-'+site)
                self.assertEqual(p.returncode,0,p.stdout);self.assertEqual(events[-1]['done'],1)
                file=next(e['path'] for e in events if e['event']=='file');self.assertEqual(Path(file).read_bytes(),PNG)
    def test_restart_forces_all_pages_to_download_again(self):
        p,events=self.run_worker();folder=events[-1]['folder'];REQUESTS.clear()
        p,events=self.run_worker(folder=folder,force=True);self.assertEqual(p.returncode,0,p.stdout)
        self.assertEqual(len([r for r in REQUESTS if r[0].startswith('/image')]),3)
    def test_quality_change_does_not_reuse_other_quality_files(self):
        p,events=self.run_worker();folder=events[-1]['folder'];REQUESTS.clear()
        p,events=self.run_worker(folder=folder,quality='original');self.assertEqual(p.returncode,0,p.stdout)
        self.assertEqual(len([r for r in REQUESTS if r[0].startswith('/image')]),3)
        self.assertFalse(any(e.get('restored') for e in events))
    def test_native_chinese_parsers_and_repair_pipeline(self):
        p,e=self.run_worker(plugin=None,url=f'http://127.0.0.1:{self.port}/album/230000',siteId='jmcomic');self.assertEqual(p.returncode,0,p.stdout)
        files=[x for x in e if x['event']=='file'];self.assertEqual(len(files),1);self.assertTrue(files[0]['repaired']);self.assertTrue(files[0]['name'].endswith('.png'))
        p,e=self.run_worker(plugin=None,url=f'http://127.0.0.1:{self.port}/photos-index-aid-1.html',siteId='wnacg',id='wnacg-task');self.assertEqual(p.returncode,0,p.stdout)
        self.assertEqual(len([x for x in e if x['event']=='file']),2)
    def test_search_deduplicates_and_rejects_offsite_gallery_links(self):
        p,e=self.run_worker(mode='search',plugin=None,url=f'http://127.0.0.1:{self.port}/search',site={'name':'Local site','domains':['127.0.0.1'],'path':r'/gallery/\d+'})
        self.assertEqual(p.returncode,0,p.stdout);self.assertEqual(len(e[-1]['results']),2);self.assertEqual(e[-1]['results'][0]['title'],'First local gallery')
    def test_range_recovers_partial_page(self):
        folder=self.root/'partial';folder.mkdir();(folder/'0001.png.part').write_bytes(PNG[:100])
        (folder/'.dandf-task.json').write_text(json.dumps({'id':'range-task','url':f'http://127.0.0.1:{self.port}/gallery'}))
        # A transform-less plugin normally restarts partial files. This case tests
        # the native worker Range path using the local demo adapter replacement.
        original=engine.gallery_resolve
        engine.gallery_resolve=lambda req,ctx:{'title':'Range','images':[f'http://127.0.0.1:{self.port}/image1.png']}
        captured=[];emit=engine.emit;engine.emit=lambda event,**kw:captured.append({'event':event,**kw})
        try:
            engine.download({'id':'range-task','url':f'http://127.0.0.1:{self.port}/gallery','siteId':'fixture','folder':str(folder),'downloadDir':str(self.root),'workers':1,'delay':.2})
        finally:
            engine.gallery_resolve=original;engine.emit=emit
        self.assertEqual((folder/'0001.png').read_bytes(),PNG);self.assertTrue(any(r[1]=='bytes=100-' for r in REQUESTS))
    def test_existing_unowned_folder_is_never_overwritten(self):
        folder=self.root/'unowned';folder.mkdir();(folder/'gallery.json').write_text('original file')
        p,e=self.run_worker(folder=str(folder));self.assertEqual(p.returncode,1);self.assertIn('task marker',e[-1]['message']);self.assertEqual((folder/'gallery.json').read_text(),'original file')
    def test_cooldown_and_access_are_actionable(self):
        p,e=self.run_worker(url=f'http://127.0.0.1:{self.port}/cooldown');self.assertEqual(p.returncode,2);self.assertEqual(e[-1]['retryAfter'],7)
        p,e=self.run_worker(url=f'http://127.0.0.1:{self.port}/denied');self.assertEqual(p.returncode,3);self.assertEqual(e[-1]['kind'],'access')
    def test_cookie_scoping_and_authenticated_fixture(self):
        p,e=self.run_worker(url=f'http://127.0.0.1:{self.port}/protected');self.assertEqual(p.returncode,3)
        p,e=self.run_worker(url=f'http://127.0.0.1:{self.port}/protected',cookies=[{'domain':'127.0.0.1','name':'auth','value':'ok','path':'/'}]);self.assertEqual(p.returncode,0,p.stdout)
        ctx=engine.Context({'url':f'http://127.0.0.1:{self.port}/gallery','cookies':[{'domain':'other.example','name':'secret','value':'value'}]})
        ctx.get(f'http://127.0.0.1:{self.port}/gallery');self.assertFalse(REQUESTS[-1][2])
    def test_manifest_inspection_never_executes_script(self):
        file=self.root/'safe_to_inspect.py';file.write_text("MANIFEST={'api':1,'id':'test','domains':['example.com']}\nraise RuntimeError('must not run')")
        self.assertEqual(engine.inspect_plugin(file)['id'],'test')
        file.write_text("MANIFEST=dict(api=1,id='evil',domains=['example.com'])")
        with self.assertRaises(ValueError):engine.inspect_plugin(file)
    def test_repair_preserves_exact_rows_for_uneven_heights(self):
        for height in [100,103,117]:
            for n in [2,8,10,16]:
                original=Image.new('RGB',(7,height))
                for y in range(height):
                    for x in range(7):original.putpixel((x,y),(y,x,13))
                scrambled=Image.new('RGB',original.size);step,rem=divmod(height,n)
                for i in range(n):
                    src=step*i+(rem if i else 0);dst=height-step*(i+1)-rem;length=step+(rem if i==0 else 0)
                    scrambled.paste(original.crop((0,src,7,src+length)),(0,dst))
                self.assertEqual(engine.restore_jm(scrambled,n).tobytes(),original.tobytes())
        self.assertEqual(engine.jm_segments(220980,100000,'00001'),0);self.assertEqual(engine.jm_segments(220980,230000,'00001'),10)
    def test_builtins_match_installed_extractors(self):
        from gallery_dl import extractor
        urls={
          'ehentai':'https://e-hentai.org/g/12345/67890abcde/','exhentai':'https://exhentai.org/g/12345/67890abcde/',
          'nhentai':'https://nhentai.net/g/12345/','hitomi':'https://hitomi.la/galleries/12345.html',
          'hentaifox':'https://hentaifox.com/gallery/12345/','hentai2read':'https://hentai2read.com/example/1/',
          'hentaihere':'https://hentaihere.com/m/S123/1/1/','hentainexus':'https://hentainexus.com/view/12345',
          'imhentai':'https://imhentai.xxx/gallery/12345/','hentaiera':'https://hentaiera.com/gallery/12345/',
          'hentaienvy':'https://hentaienvy.com/gallery/12345/','hentairox':'https://hentairox.com/gallery/12345/',
          'hentaizap':'https://hentaizap.com/gallery/12345/','hentaihand':'https://hentaihand.com/en/comic/example',
          'simplyhentai':'https://www.simply-hentai.com/test/example','myhentaigallery':'https://myhentaigallery.com/gallery/show/12345',
          'tmohentai':'https://tmohentai.com/contents/12345a67b89c0','sakuhentai':'https://www.sakuhentai.net/example/'}
        for name,url in urls.items():
            with self.subTest(site=name):
                ex=extractor.find(url);self.assertIsNotNone(ex);self.assertIn(ex.subcategory,('gallery','chapter','manga','doujin'))
    def test_originals_fail_without_credentials_before_any_network_request(self):
        p,e=self.run_worker(plugin=None,url='https://e-hentai.org/g/12345/67890abcde/',siteId='ehentai',quality='original');self.assertEqual(p.returncode,3,p.stdout);self.assertIn('Original files require',e[-1]['message'])

if __name__=='__main__':
    unittest.main(verbosity=2)
