"""Recovery and opt-in preferences, using only a local synthetic image server."""
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import importlib.util,io,json,os,subprocess,sys,tempfile,threading,unittest
from pathlib import Path
from urllib.parse import urlparse
from unittest.mock import patch
from PIL import Image
import requests

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'engine'))
spec=importlib.util.spec_from_file_location('updated_engine',ROOT/'engine/engine.py')
engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)
buf=io.BytesIO();Image.new('RGB',(40,50),'#394c6b').save(buf,format='PNG');PNG=buf.getvalue()
buf=io.BytesIO();Image.new('RGB',(40,50),'#394c6b').save(buf,format='JPEG');TRUNCATED_JPEG=buf.getvalue()[:-12]

class Handler(BaseHTTPRequestHandler):
    def log_message(self,*args):pass
    def do_GET(self):
        route=urlparse(self.path).path
        self.server.hits.append((route,self.headers.get('Range')))
        count=sum(1 for path,_ in self.server.hits if path==route)
        if route=='/gallery':
            data=b'<h1>Local recovery fixture</h1><div class="gallery-page"><img id="image" src="/image.png"></div>'
            self.send_response(200);self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data);return
        mode=self.server.mode
        if mode in ('429','509') and count==1 or mode=='always429':
            self.send_response(509 if mode=='509' else 429);self.send_header('Retry-After','60');self.end_headers();return
        if mode in ('500','502','503','504') and count==1:
            self.send_response(int(mode));self.send_header('Content-Type','text/html');self.end_headers();self.wfile.write(b'<p>Temporary failure</p>');return
        if mode=='forbidden':self.send_response(403);self.end_headers();return
        if mode=='range416' and self.headers.get('Range'):
            self.send_response(416);self.end_headers();return
        if mode=='bad-range' and self.headers.get('Range'):
            self.send_response(206);self.send_header('Content-Range',f'bytes 0-{len(PNG)-1}/{len(PNG)}');self.send_header('Content-Length',str(len(PNG)));self.end_headers();self.wfile.write(PNG);return
        payload=b'corrupt bytes' if mode=='corrupt' and count==1 or mode=='always-corrupt' else PNG
        if mode=='truncated-jpeg' and count==1:payload=TRUNCATED_JPEG
        offset=int(self.headers.get('Range','bytes=0-').split('=')[1].split('-')[0]) if mode=='valid-range' else 0
        data=payload[offset:]
        self.send_response(206 if offset else 200)
        if offset:self.send_header('Content-Range',f'bytes {offset}-{len(PNG)-1}/{len(PNG)}')
        self.send_header('Content-Type','image/png');self.send_header('Content-Length',str(len(data)));self.end_headers();self.wfile.write(data)

class DownloadUpdateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),Handler);cls.server.hits=[];cls.server.mode='ok'
        threading.Thread(target=cls.server.serve_forever,daemon=True).start();cls.base=f'http://127.0.0.1:{cls.server.server_port}'
    @classmethod
    def tearDownClass(cls):cls.server.shutdown();cls.server.server_close()
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.root=Path(self.temp.name);self.server.hits=[];self.server.mode='ok'
        self.plugin=self.root/'fixture.py'
        self.plugin.write_text("MANIFEST={'api':1,'id':'fixture','domains':['127.0.0.1']}\ndef resolve(url,ctx):\n    return {'title':'Recovery fixture','images':[{'url':url+'/image.png','extension':'png'}]}\n")
    def tearDown(self):self.temp.cleanup()
    def run_worker(self,**options):
        req={'id':'update-fixture','url':self.base,'siteId':'fixture','mode':'download','downloadDir':str(self.root/'downloads'),'plugin':str(self.plugin),'workers':1,'delay':.2}
        req.update(options)
        command=[os.environ['DF_ENGINE_EXE']] if os.environ.get('DF_ENGINE_EXE') else [sys.executable,str(ROOT/'engine/engine.py')]
        p=subprocess.run(command,input=json.dumps(req)+'\n',text=True,capture_output=True,encoding='utf-8',timeout=25)
        return p,[json.loads(line) for line in p.stdout.splitlines() if line.startswith('{')]
    def partial(self):
        # Native HTML extraction permits HTTP byte-range recovery without plugin transforms.
        folder=self.root/'partial';folder.mkdir();(folder/'.dandf-task.json').write_text(json.dumps({'id':'update-fixture','url':self.base+'/gallery'}))
        (folder/'0001.png.part').write_bytes(PNG[:12]);return folder
    def test_429_and_509_keep_conservative_default(self):
        for mode in ('429','509'):
            with self.subTest(mode=mode):
                self.server.mode=mode;self.server.hits=[]
                p,events=self.run_worker();self.assertEqual(p.returncode,2,p.stdout);self.assertEqual(events[-1]['kind'],'rate_limit');self.assertEqual(len(self.server.hits),1)
    def test_explicit_cooldown_skip_retries_transient_response(self):
        for mode in ('429','509'):
            with self.subTest(mode=mode):
                self.server.mode=mode;self.server.hits=[]
                p,events=self.run_worker(bypassRateLimits=True,force=True);self.assertEqual(p.returncode,0,p.stdout);self.assertEqual(len(self.server.hits),2)
                self.assertEqual(Path(next(e['path'] for e in events if e['event']=='file')).read_bytes(),PNG)
    def test_repeated_refusal_is_bounded_without_cooldown_or_bad_files(self):
        self.server.mode='always429';p,events=self.run_worker(bypassRateLimits=True)
        self.assertEqual(p.returncode,1,p.stdout);self.assertEqual(len(self.server.hits),3);self.assertNotEqual(events[-1]['kind'],'rate_limit');self.assertIn('429',events[-1]['message'])
        self.assertFalse(list((self.root/'downloads').rglob('0001.png')))
    def test_5xx_html_responses_are_retried(self):
        for mode in ('500','502','503','504'):
            with self.subTest(mode=mode):
                self.server.mode=mode;self.server.hits=[];p,events=self.run_worker(force=True)
                self.assertEqual(p.returncode,0,p.stdout);self.assertEqual(len(self.server.hits),2)
    def test_corrupt_payload_retries_from_zero(self):
        self.server.mode='corrupt';p,events=self.run_worker();self.assertEqual(p.returncode,0,p.stdout)
        self.assertEqual([header for _,header in self.server.hits],[None,None]);self.assertEqual(Path(next(e['path'] for e in events if e['event']=='file')).read_bytes(),PNG)
    def test_persistent_invalid_payload_leaves_no_stale_partial(self):
        self.server.mode='always-corrupt';p,events=self.run_worker();self.assertEqual(p.returncode,1,p.stdout);self.assertEqual(len(self.server.hits),3)
        self.assertFalse(list((self.root/'downloads').rglob('*.part')));self.assertFalse(list((self.root/'downloads').rglob('0001.png')))
    def test_truncated_jpeg_with_plausible_headers_is_not_committed(self):
        self.server.mode='truncated-jpeg';p,events=self.run_worker();self.assertEqual(p.returncode,0,p.stdout)
        self.assertEqual(len(self.server.hits),2);self.assertEqual(Path(next(e['path'] for e in events if e['event']=='file')).read_bytes(),PNG)
    def test_inconsistent_partial_range_resets_file(self):
        folder=self.partial();self.server.mode='bad-range'
        p,events=self.run_worker(plugin=None,siteId='yandere',url=self.base+'/gallery',folder=str(folder))
        self.assertEqual(p.returncode,0,p.stdout);self.assertEqual((folder/'0001.png').read_bytes(),PNG)
        self.assertEqual([header for route,header in self.server.hits if route=='/image.png'],['bytes=12-',None])
    def test_416_retries_without_stale_range(self):
        folder=self.partial();self.server.mode='range416'
        p,events=self.run_worker(plugin=None,siteId='yandere',url=self.base+'/gallery',folder=str(folder))
        self.assertEqual(p.returncode,0,p.stdout);self.assertEqual((folder/'0001.png').read_bytes(),PNG)
        self.assertEqual([header for route,header in self.server.hits if route=='/image.png'],['bytes=12-',None])
    def test_ignored_range_replaces_partial_instead_of_appending(self):
        folder=self.partial();p,events=self.run_worker(plugin=None,siteId='yandere',url=self.base+'/gallery',folder=str(folder))
        self.assertEqual(p.returncode,0,p.stdout);self.assertEqual((folder/'0001.png').read_bytes(),PNG)
    def test_fast_resolution_does_not_enable_cooldown_skip(self):
        req={'siteId':'exhentai','url':self.base,'fastResolve':True}
        fast=engine.Context(req);slow=engine.Context({**req,'fastResolve':False,'delay':.8})
        self.assertEqual(fast.delay,.05);self.assertEqual(fast.retry_delay,.15);self.assertEqual(slow.delay,.8);self.assertEqual(slow.retry_delay,1)
        response=requests.Response();response.status_code=429;response.headers['Retry-After']='7'
        with self.assertRaises(engine.RateLimited):fast.check(response)
        self.assertFalse(engine.should_bypass_rate_limits({'bypassRateLimits':'false'}));self.assertFalse(engine.should_bypass_rate_limits({'fastResolve':True}))
        self.assertTrue(engine.should_bypass_rate_limits({'options':{'skipCooldown':True}}))
    def test_authentication_cannot_be_skipped(self):
        self.server.mode='forbidden';p,events=self.run_worker(bypassRateLimits=True)
        self.assertEqual(p.returncode,3,p.stdout);self.assertEqual(len(self.server.hits),1)

if __name__=='__main__':unittest.main(verbosity=2)
