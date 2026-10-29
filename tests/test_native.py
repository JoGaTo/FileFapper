import base64
import json
from pathlib import Path
import sys
import unittest
from types import SimpleNamespace
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'engine'))
from native_adapters import parse_reader, resolve

class NativeTests(unittest.TestCase):
    def test_frontend_post_links_resolve_the_source_and_keep_its_referrer(self):
        for site,url in [('r34app','https://r34.app/posts/rule34.xxx/123'),('kurosearch','https://kurosearch.com/post/123'),('r34react','https://kurozenzen.github.io/r34-react/#/post/123')]:
            calls=[]
            def fetch(target):
                calls.append(target);return SimpleNamespace(text='<h1>Fixture</h1><img id="image" src="https://cdn.example/full.png">')
            result=resolve({'siteId':site,'url':url},SimpleNamespace(fetch=fetch))
            expected='https://rule34.xxx/index.php?page=post&s=view&id=123'
            self.assertEqual(calls,[expected]);self.assertEqual(result['metadata']['frontend'],site)
            self.assertEqual(result['images'][0]['_http_headers']['Referer'],expected)
    def test_frontend_source_ids_are_not_mixed_between_boards(self):
        for url in ('https://r34.app/posts/e621.net/123','https://r34.app/posts/e621.net?id=123','https://r34.app/?source=e621.net&id=123'):
            with self.assertRaises(ValueError):resolve({'siteId':'r34app','url':url},None)
    def test_spanish_readers_extract_page_order_and_lazy_sources(self):
        r=parse_reader('doujinhentai','<title>Fixture</title><script>const pageUrls = {"2":"https:\\/\\/cdn.example/2.png","1":"https://cdn.example/1.png"};</script>','https://doujinhentai.net/chapter')
        self.assertEqual([x['url'] for x in r['images']],['https://cdn.example/1.png','https://cdn.example/2.png'])
        r=parse_reader('ikuhentai','<div class="reading-content"><div><img src="blank.gif" data-lazy-src="//cdn.example/1.png"><img data-src="//cdn.example/2.png"></div></div><img src="/advert.png">','https://ikuhentai.net/chapter')
        self.assertEqual(len(r['images']),2);self.assertEqual(r['images'][0]['url'],'https://cdn.example/1.png')
    def test_toonkor_decodes_page_data_without_executing_scripts(self):
        encoded=base64.b64encode(b'<img src="/pages/1.png"><img src="//cdn.example/2.jpg">').decode()
        r=parse_reader('toonkor',f'<script>var toon_img = \'{encoded}\';throw Error("never execute");</script>','https://toonkor0.org/chapter')
        self.assertEqual([x['url'] for x in r['images']],['https://toonkor0.org/pages/1.png','https://cdn.example/2.jpg'])
    def test_blacktoon_uses_configured_image_host(self):
        r=parse_reader('blacktoon','<div id="toon_content_imgs"><img o_src="/webtoon/1.png"></div>','https://blacktoon.me/chapter','https://img.example')
        self.assertEqual(r['images'][0]['url'],'https://img.example/webtoon/1.png')
    def test_comix_embedded_json_extracts_only_reader_pages(self):
        data={'queries':[{'data':{'images':[{'url':'https://cdn.example/1.png'},{'url':'https://cdn.example/2.png'}]}}]}
        r=parse_reader('comix','<script id="initial-data" type="application/json">'+json.dumps(data)+'</script><img src="ad.png">','https://comix.to/title/a/chapter')
        self.assertEqual(len(r['images']),2)
    def test_booru_adapters_prefer_original_and_reject_executable_urls(self):
        for site in ('gelbooru','rule34','r34app','kurosearch','r34react','yandere'):
            r=parse_reader(site,'<img id="image" src="/sample.png"><a id="highres" href="https://cdn.example/original.png">Original</a>','https://example.com/post')
            self.assertEqual(r['images'][0]['url'],'https://cdn.example/original.png')
            self.assertFalse(parse_reader(site,'<img id="image" src="javascript:alert(1)">','https://example.com/')['images'])
    def test_pixiv_pages_use_ajax_and_originals_with_referer(self):
        responses={
         'https://www.pixiv.net/ajax/illust/123':{'body':{'title':'Fixture','userName':'Artist','illustType':0}},
         'https://www.pixiv.net/ajax/illust/123/pages':{'body':[{'urls':{'original':'https://i.pximg.net/1.png'}},{'urls':{'original':'https://i.pximg.net/2.png'}}]}}
        ctx=SimpleNamespace(session=SimpleNamespace(headers={}),fetch=lambda u:SimpleNamespace(json=lambda:responses[u]))
        r=resolve({'siteId':'pixiv','url':'https://www.pixiv.net/en/artworks/123'},ctx)
        self.assertEqual(r['title'],'Fixture');self.assertEqual(len(r['images']),2);self.assertEqual(r['images'][0]['_http_headers']['Referer'],'https://www.pixiv.net/')
    def test_danbooru_pool_keeps_order_and_includes_video(self):
        responses={'https://danbooru.donmai.us/pools/9.json':{'name':'Fixture pool','post_ids':[1,2,3]}}
        for i,ext in [(1,'png'),(2,'webm'),(3,'jpg')]:responses[f'https://danbooru.donmai.us/posts/{i}.json']={'id':i,'file_url':f'https://cdn.example/{i}.{ext}','file_ext':ext}
        ctx=SimpleNamespace(fetch=lambda u:SimpleNamespace(json=lambda:responses[u]))
        r=resolve({'siteId':'danbooru','url':'https://danbooru.donmai.us/pools/9'},ctx)
        self.assertEqual([x['url'] for x in r['images']],['https://cdn.example/1.png','https://cdn.example/2.webm','https://cdn.example/3.jpg'])
    def test_gelbooru_search_url_cannot_be_queued_as_a_post(self):
        for site in ('gelbooru','rule34','r34app','kurosearch','r34react'):
            with self.assertRaises(ValueError):resolve({'siteId':site,'url':'https://example.com/index.php?page=post&s=list'},None)

if __name__=='__main__':unittest.main()
