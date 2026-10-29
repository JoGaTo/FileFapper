from pathlib import Path
from types import SimpleNamespace
from http.server import BaseHTTPRequestHandler,ThreadingHTTPServer
import io,json,os,subprocess,sys,tempfile,threading,unittest
import requests
from PIL import Image
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'engine'))
import engine
from reader_adapters import chapter_manifest,mirror_manifest,resolve
from site_access import AccessError,WorkerError,check_html

def mirror(base='https://cdn.example/pages',locked=False,total=2):
    pages=[{'page':2,'ext':'webp','width':24,'height':32},{'page':1,'ext':'png','width':24,'height':32}]
    return f'<title>Fixture reader</title><main id="readerApp" data-reader-id="10" data-reader-total="{total}" data-reader-image-base="{base}" data-reader-locked="{int(locked)}" data-reader-seo-title="Fixture"></main><script type="application/json" id="readerPagesJson">{json.dumps(pages)}</script><img src="https://ads.example/advert.jpg">'

class ReaderTests(unittest.TestCase):
    def test_new_here_chapter_uses_full_manifest_not_just_visible_image(self):
        data={'images':['https://cdn.example/0001.webp','https://cdn.example/0002.webp'],'book':{'title':'Fixture','id':123,'chapter':'Chapter 1'},'finishToken':'DO_NOT_EXPORT'}
        source='<script type="application/json" data-reader-data>'+json.dumps(data)+'</script><img data-reader-image src="https://cdn.example/0001.webp"><img src="advert.jpg">'
        result=chapter_manifest(source,'https://hentaihere.com/reader/123-fixture/456/page-2','hentaihere')
        self.assertEqual(len(result['images']),2);self.assertEqual(result['images'][0]['url'],data['images'][0]);self.assertNotIn('DO_NOT_EXPORT',json.dumps(result))
    def test_current_h2r_inertia_payload_uses_only_reader_props(self):
        page={'component':'Reader/Show','props':{'images':['https://cdn.example/1.png','https://cdn.example/2.png'],'book':{'title':'Fixture'},'chapter':{'label':'Chapter 2'},'related':[{'images':['advert.jpg']}], 'auth':{'token':'DO_NOT_EXPORT'}}}
        result=chapter_manifest('<script data-page="app" type="application/json">'+json.dumps(page)+'</script>','https://hentai2read.com/reader/123-fixture/456/page-1','hentai2read')
        self.assertEqual(len(result['images']),2);self.assertEqual(result['title'],'Fixture · Chapter 2');self.assertNotIn('DO_NOT_EXPORT',json.dumps(result))
    def test_mirror_pages_are_ordered_and_keep_individual_file_extensions(self):
        for site in ('hentaienvy','hentairox','hentaizap'):
            r=mirror_manifest(mirror(),'https://'+site+'.com/g/10/1/',site)
            self.assertEqual([i['url'] for i in r['images']],['https://cdn.example/pages/1.png','https://cdn.example/pages/2.webp'])
    def test_incomplete_mirror_and_duplicate_chapter_manifests_are_rejected(self):
        with self.assertRaises(WorkerError):mirror_manifest(mirror(total=90),'https://hentairox.com/g/10/1/','hentairox')
        source='<script data-reader-data>'+json.dumps({'images':['https://cdn.example/1.png']*2})+'</script>'
        with self.assertRaises(WorkerError):chapter_manifest(source,'https://hentaihere.com/reader/1/2','hentaihere')
    def test_locked_reader_does_not_reconstruct_restricted_files(self):
        with self.assertRaises(AccessError):mirror_manifest(mirror(locked=True),'https://hentaizap.com/g/10/1/','hentaizap')
    def test_follow_only_same_origin_matching_first_reader_link(self):
        calls=[]
        def fetch(url):
            calls.append(url);return SimpleNamespace(text='<a href="mailto:help@example.test">Contact</a><a href="https://evil.test/g/10/1/">Ad</a><a href="/g/999/1/">Recommendation</a><a href="/g/10/1/">Read</a>' if '/gallery/' in url else mirror())
        r=resolve({'siteId':'hentaienvy','url':'https://hentaienvy.com/gallery/10/'},SimpleNamespace(fetch=fetch),lambda *_:self.fail('Incorrect legacy fallback'))
        self.assertEqual(calls,['https://hentaienvy.com/gallery/10/','https://hentaienvy.com/g/10/1/']);self.assertEqual(len(r['images']),2)
    def test_legacy_chapter_layouts_keep_their_upstream_adapter(self):
        req={'siteId':'hentaihere','url':'https://hentaihere.com/m/S123/1/1/'}
        ctx=SimpleNamespace(fetch=lambda _:SimpleNamespace(text='<title>Legacy chapter</title>'))
        self.assertEqual(resolve(req,ctx,lambda r,c:'legacy'),'legacy')
    def test_related_legacy_readers_keep_gallery_extraction_for_direct_g_links(self):
        for site in ('hentaifox','hentaiera','imhentai'):
            ctx=SimpleNamespace(fetch=lambda _:SimpleNamespace(text='<title>Legacy reader</title><img id="image" src="/1.png">'))
            got=resolve({'siteId':site,'url':f'https://{site}.com/g/10/7/'},ctx,lambda req,_:req['url'])
            self.assertEqual(got,f'https://{site}.com/gallery/10/')
    def test_incomplete_new_reader_url_explains_missing_chapter_without_requests(self):
        with self.assertRaisesRegex(WorkerError,'missing a chapter ID'):
            resolve({'siteId':'hentai2read','url':'https://hentai2read.com/reader/123-fixture/'},None,None)
    def test_non_json_script_is_not_executed(self):
        with self.assertRaises(WorkerError):chapter_manifest('<script data-reader-data>{"images": ["https://cdn.example/a.png"]}; throw Error("do not execute")</script>','https://example.test','hentaihere')
    def test_hentaihand_allows_absent_language_and_sorts_api_pages(self):
        def fetch(url):
            value={'id':10,'title':'Fixture','language':None,'category':None,'tags':None} if not url.endswith('/images') else {'next_chapter':None,'images':[{'page':2,'source_url':'https://cdn.example/2.png'},{'page':1,'source_url':'https://cdn.example/1.png'}]}
            return SimpleNamespace(json=lambda:value)
        result=resolve({'siteId':'hentaihand','url':'https://hentaihand.com/en/comic/fixture'},SimpleNamespace(fetch=fetch),None)
        self.assertEqual([i['url'] for i in result['images']],['https://cdn.example/1.png','https://cdn.example/2.png']);self.assertIsNone(result['metadata']['language'])
    def test_hentaihand_does_not_silently_stop_at_first_chapter(self):
        ctx=SimpleNamespace(fetch=lambda _:SimpleNamespace(json=lambda:{'next_chapter':{'id':2},'images':[{'page':1,'source_url':'https://cdn.example/1.png'}]}))
        with self.assertRaisesRegex(WorkerError,'multiple chapters'):resolve({'siteId':'hentaihand','url':'https://hentaihand.com/en/comic/fixture'},ctx,None)
    def test_challenge_title_is_access_error_even_with_http_200(self):
        for title in ('Just a moment...', 'Fixture site CAPTCHA'):
            with self.assertRaises(AccessError) as caught:check_html('<title>'+title+'</title><p>Complete the access check.</p>')
            self.assertTrue(caught.exception.challenge)
    def test_hidden_login_modal_and_passive_cloudflare_script_are_not_a_challenge(self):
        check_html('<title>Fixture gallery</title><script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script><div hidden><input type="password"></div>'+mirror())
    def test_http_404_is_a_missing_page_and_not_a_cookie_error(self):
        r=requests.Response();r.status_code=404;r._content=b'Not found'
        with self.assertRaisesRegex(WorkerError,'HTTP 404'):engine.Context({'url':'https://example.test'}).check(r)

class ReaderWorkerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        data=io.BytesIO();Image.new('RGB',(24,32),'#7da2bc').save(data,format='PNG');cls.png=data.getvalue();cls.calls=[]
        class Handler(BaseHTTPRequestHandler):
            def log_message(self,*a):pass
            def do_GET(self):
                cls.calls.append(self.path)
                if self.path=='/gallery/10/':body=b'<a href="/g/10/1/">Read</a>';kind='text/html'
                elif self.path=='/g/10/1/':body=mirror(f'http://127.0.0.1:{cls.server.server_port}/images').replace('"ext": "webp"','"ext": "png"').encode();kind='text/html'
                elif self.path=='/gallery/11/':body=b'<title>Fixture site CAPTCHA</title><p>Complete the access check.</p>';kind='text/html'
                else:body=cls.png;kind='image/png'
                self.send_response(200);self.send_header('Content-Type',kind);self.send_header('Content-Length',str(len(body)));self.end_headers();self.wfile.write(body)
        cls.server=ThreadingHTTPServer(('127.0.0.1',0),Handler);threading.Thread(target=cls.server.serve_forever,daemon=True).start()
    @classmethod
    def tearDownClass(cls):cls.server.shutdown();cls.server.server_close()
    def run_worker(self,path):
        self.calls.clear()
        with tempfile.TemporaryDirectory() as folder:
            request={'id':'reader-test','url':f'http://127.0.0.1:{self.server.server_port}{path}','siteId':'hentaienvy','downloadDir':folder,'workers':1,'delay':.2}
            command=[os.environ['DF_ENGINE_EXE']] if os.environ.get('DF_ENGINE_EXE') else [sys.executable,str(ROOT/'engine/engine.py')]
            result=subprocess.run(command,input=json.dumps(request)+'\n',text=True,encoding='utf-8',capture_output=True,timeout=40)
            events=[json.loads(line) for line in result.stdout.splitlines() if line.startswith('{')]
            files=[Path(e['path']).read_bytes() for e in events if e['event']=='file']
        return result,events,files
    def test_real_worker_downloads_all_manifest_pages_in_order(self):
        p,events,files=self.run_worker('/gallery/10/');self.assertEqual(p.returncode,0,p.stdout);self.assertEqual(files,[self.png,self.png]);self.assertEqual(events[-1]['done'],2);self.assertIn('/images/2.png',self.calls)
    def test_worker_pauses_challenge_after_one_request_without_saving_a_gallery(self):
        p,events,files=self.run_worker('/gallery/11/');self.assertEqual(p.returncode,3,p.stdout);self.assertEqual(events[-1]['kind'],'access');self.assertTrue(events[-1]['challenge']);self.assertEqual(self.calls,['/gallery/11/']);self.assertEqual(files,[])

if __name__=='__main__':unittest.main()
