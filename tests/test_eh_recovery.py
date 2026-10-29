"""Real TLS-to-plain-HTTP failure, site reload, and resume tests. No gallery traffic."""
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
import unittest
from unittest.mock import patch
from urllib.parse import urlparse,parse_qs
from PIL import Image
import requests

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'engine'))
spec=importlib.util.spec_from_file_location('recovery_engine',ROOT/'engine/engine.py')
engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)
data=io.BytesIO();Image.new('RGB',(30,40),'#5688aa').save(data,format='PNG');PNG=data.getvalue()

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        u=urlparse(self.path);query=parse_qs(u.query)
        self.server.requests.append({'path':u.path,'query':query,'range':self.headers.get('Range'),'cookie':self.headers.get('Cookie')})
        if u.path.startswith('/s/'):
            if self.server.mode=='quota':
                self.send_response(429);self.send_header('Retry-After','9');self.end_headers();return
            if self.server.mode=='access':
                self.send_response(403);self.end_headers();return
            if self.server.mode=='limit-image':body='<img id="img" src="/g/509.gif">'
            elif self.server.mode=='no-original':body='<img id="img" src="/resampled.png">'
            else:body='<img id="img" src="/resampled.png"><a href="/fullimg.php?gid=1&amp;page=1&amp;key=fixture">Download original</a>'
            body+='<a onclick="return nl(\'next-code\')">Reload image</a>'
            payload=body.encode();self.send_response(200);self.send_header('Content-Type','text/html');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload);return
        if u.path=='/corrupt.png':payload=b'not an image'
        elif self.server.mode=='always-fail' and u.path=='/fullimg.php':
            self.send_response(503);self.end_headers();return
        else:payload=PNG
        self.send_response(200);self.send_header('Content-Type','image/png');self.send_header('Content-Length',str(len(payload)));self.end_headers();self.wfile.write(payload)

class EHRecoveryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),Handler);cls.server.requests=[];cls.server.mode='ok'
        cls.thread=threading.Thread(target=cls.server.serve_forever,daemon=True);cls.thread.start()
        cls.base=f'http://127.0.0.1:{cls.server.server_port}'
        cls.bad=f'https://127.0.0.1:{cls.server.server_port}/h/image/secret-token.png'
    @classmethod
    def tearDownClass(cls):cls.server.shutdown();cls.server.server_close()
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.root=Path(self.tmp.name);self.server.requests.clear();self.server.mode='ok'
        self.plugin=self.root/'local_eh.py'
        self.plugin.write_text('''MANIFEST={'api':1,'id':'local_eh','domains':['127.0.0.1']}
def resolve(url,ctx):
 return {'title':'TLS recovery fixture','images':[{'url':URL,'extension':'png','_eh_source':{'page_url':BASE+'/s/0123456789/1-1','nl':'old-code','original_link':True,'image_hash':None}}]}
'''.replace('URL',repr(self.bad)).replace('BASE',repr(self.base)),encoding='utf-8')
    def tearDown(self):self.tmp.cleanup()
    def run_worker(self,**overrides):
        req={'mode':'download','url':self.base+'/g/1/0123456789/','id':'tls-fixture','siteId':'exhentai','plugin':str(self.plugin),'quality':'original','workers':1,'delay':.2,'downloadDir':str(self.root/'downloads')}
        req.update(overrides);command=[os.environ['DF_ENGINE_EXE']] if os.environ.get('DF_ENGINE_EXE') else [sys.executable,str(ROOT/'engine/engine.py')]
        p=subprocess.run(command,input=json.dumps(req)+'\n',text=True,encoding='utf-8',capture_output=True,timeout=35)
        return p,[json.loads(s) for s in p.stdout.splitlines() if s.startswith('{')]
    def test_real_wrong_version_number_recovers_to_requested_original(self):
        # The first URL deliberately attempts TLS against a local plain-HTTP server.
        p,events=self.run_worker(cookies=[{'name':'auth','value':'fixture','domain':'127.0.0.1','path':'/'}])
        self.assertEqual(p.returncode,0,p.stdout+p.stderr);self.assertTrue(any(e['event']=='source-retry' for e in events))
        file=next(e for e in events if e['event']=='file');self.assertEqual(Path(file['path']).read_bytes(),PNG)
        self.assertTrue(any(r['path']=='/fullimg.php' for r in self.server.requests));self.assertFalse(any(r['path']=='/resampled.png' for r in self.server.requests))
        original=next(r for r in self.server.requests if r['path']=='/fullimg.php');self.assertEqual(original['query']['nl'],['next-code']);self.assertEqual(original['query']['gid'],['1']);self.assertEqual(original['query']['key'],['fixture'])
        reload=next(r for r in self.server.requests if r['path'].startswith('/s/'));self.assertNotIn('nl',reload['query']);self.assertIn('auth=fixture',reload['cookie'])
        self.assertEqual(json.loads((Path(file['path']).parent/'.filefapper'/'tls-fixture'/'gallery.json').read_text())['quality'],'original')
    def test_retry_exhaustion_is_bounded_and_hides_signed_urls(self):
        self.server.mode='always-fail';p,events=self.run_worker();self.assertEqual(p.returncode,1,p.stdout)
        self.assertEqual(len([r for r in self.server.requests if r['path'].startswith('/s/')]),2)
        originals=[r for r in self.server.requests if r['path']=='/fullimg.php'];self.assertEqual(len(originals),2);self.assertTrue(all(r['query']['nl']==['next-code'] for r in originals))
        message=events[-1]['message'];self.assertIn('Page 1',message);self.assertIn('completed pages are kept',message);self.assertNotIn('secret-token',message);self.assertNotIn('https://',message)
    def test_original_does_not_substitute_resampled_when_link_disappears(self):
        self.server.mode='no-original';p,events=self.run_worker();self.assertEqual(p.returncode,3,p.stdout)
        self.assertIn('original-file link',events[-1]['message']);self.assertFalse(any(r['path']=='/resampled.png' for r in self.server.requests))
    def test_resampled_choice_uses_resampled_reload_link(self):
        p,events=self.run_worker(quality='resampled');self.assertEqual(p.returncode,0,p.stdout)
        self.assertTrue(any(r['path']=='/resampled.png' for r in self.server.requests));self.assertFalse(any(r['path']=='/fullimg.php' for r in self.server.requests))
        reload=next(r for r in self.server.requests if r['path'].startswith('/s/'));self.assertEqual(reload['query']['nl'],['old-code'])
    def test_quota_stops_before_trying_another_image_host(self):
        self.server.mode='quota';p,events=self.run_worker();self.assertEqual(p.returncode,2,p.stdout);self.assertEqual(events[-1]['retryAfter'],9)
        self.assertEqual(len([r for r in self.server.requests if r['path'].startswith('/s/')]),1);self.assertFalse(any(r['path']=='/fullimg.php' for r in self.server.requests))
    def test_gallery_access_error_is_not_retried_as_a_peer_failure(self):
        self.server.mode='access';p,events=self.run_worker();self.assertEqual(p.returncode,3,p.stdout);self.assertEqual(len([r for r in self.server.requests if r['path'].startswith('/s/')]),1)
    def test_site_limit_placeholder_is_respected(self):
        self.server.mode='limit-image';p,events=self.run_worker();self.assertEqual(p.returncode,2,p.stdout);self.assertFalse(any(r['path']=='/g/509.gif' for r in self.server.requests))
    def test_partial_file_is_reset_when_switching_image_sources(self):
        folder=self.root/'partial';folder.mkdir();(folder/'.dandf-task.json').write_text(json.dumps({'id':'tls-fixture','url':self.base+'/g/1/0123456789/'}));(folder/'0001.png.part').write_bytes(b'old peer partial bytes')
        p,events=self.run_worker(folder=str(folder));self.assertEqual(p.returncode,0,p.stdout);self.assertEqual((folder/'0001.png').read_bytes(),PNG)
        self.assertTrue(all(not r['range'] for r in self.server.requests if r['path']=='/fullimg.php'))
    def test_resume_keeps_completed_files_without_reloading_them(self):
        p,events=self.run_worker();self.assertEqual(p.returncode,0,p.stdout);folder=events[-1]['folder'];self.server.requests.clear()
        p,events=self.run_worker(folder=folder);self.assertEqual(p.returncode,0,p.stdout);self.assertTrue(next(e for e in events if e['event']=='file')['restored']);self.assertEqual(self.server.requests,[])
    def test_corrupt_image_data_recovers(self):
        text=self.plugin.read_text().replace(repr(self.bad),repr(self.base+'/corrupt.png'));self.plugin.write_text(text)
        p,events=self.run_worker();self.assertEqual(p.returncode,0,p.stdout);self.assertTrue(any(e['event']=='source-retry' for e in events));self.assertEqual(Path(next(e['path'] for e in events if e['event']=='file')).read_bytes(),PNG)
    def test_reload_cannot_leave_gallery_origin_or_downgrade_https(self):
        req={'url':'https://exhentai.org/g/1/0123456789/','siteId':'exhentai','quality':'original'};ctx=engine.Context(req)
        item={'_eh_source':{'page_url':'https://other.example/s/0123456789/1-1'}}
        with self.assertRaises(engine.EHImageSourceError):engine.eh_refresh_source(req,ctx,item,requests.Session(),threading.Event())
        response=requests.Response();response.status_code=200;response.url='https://exhentai.org/s/0123456789/1-1';response._content=b'<img id="img" src="https://peer.hath.network/h/test"><a href="http://exhentai.org/fullimg.php">Original</a>'
        item={'_eh_source':{'page_url':response.url,'nl':'code','original_link':True}}
        with patch.object(ctx,'fetch',return_value=response),self.assertRaises(engine.EHImageSourceError):engine.eh_refresh_source(req,ctx,item,requests.Session(),threading.Event())
    def test_each_page_retains_its_own_reload_identity(self):
        class Extractor:root='https://exhentai.org';gallery_id=42
        req={'siteId':'exhentai','quality':'original'};shared={'url':'https://exhentai.org/fullimg.php?gid=42','image_token':'0123456789','num':1,'_nl':'one'}
        first=engine.eh_image_source(req,Extractor(),shared);shared.update(image_token='abcdef0123',num=2,_nl='two');second=engine.eh_image_source(req,Extractor(),shared)
        self.assertTrue(first['page_url'].endswith('/0123456789/42-1'));self.assertEqual(first['nl'],'one');self.assertTrue(second['page_url'].endswith('/abcdef0123/42-2'));self.assertEqual(second['nl'],'two')

if __name__=='__main__':unittest.main(verbosity=2)
