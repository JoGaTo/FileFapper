import json
from pathlib import Path
from types import SimpleNamespace
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'engine'))
from expanded_readers import parse, resolve
from site_access import WorkerError

class ExpandedReaders(unittest.TestCase):
    def test_scoped_full_media_excludes_covers_recommendations_and_scripts(self):
        cases=[('rule34ai','https://rule34ai.art/123/','<article id="post-123"><div class="entry-content"><img data-src="/full.png"><noscript><img src="/full.png"></noscript></div></article><article id="post-234"><div class="entry-content"><img src="/recommendation.jpg"></div></article>'),
        ('rule34us','https://rule34.us/index.php?r=posts/view&id=12','<div class="content_push"><img src="/images/full.png"></div>'),
        ('rule34pw','https://rule34.pw/post/123','<video id="player"><source src="/full.mp4"></video>'),
        ('cartoon18','https://www.cartoon18.com/story/12/full','<div class="cartoon-image"><img data-src="/full.avif"></div>'),
        ('ho5ho','https://www.ho5ho.com/comic/test/server-1/','<div class="reading-content"><div class="page-break"><img data-src="/full.jpg"></div></div>')]
        for site,url,body in cases:
            with self.subTest(site=site):
                result,_=parse(site,body+'<img src="/thumbnails/cover.jpg"><script>throw Error()</script>',url)
                self.assertEqual(len(result['images']),1)
                self.assertIn('full.',result['images'][0]['url'])

    def test_177_reader_starts_from_first_page_and_collects_ordered_unique_pages(self):
        base='https://www.177picyy.com/html/2026/10/123.html'
        docs={base:'<div class="single-content"><img data-lazy-src="/1.jpg"></div><div class="page-links"><a href="'+base+'/2/">2</a></div>',
              base+'/2/':'<div class="single-content"><img src="/2.jpg"></div><div class="page-links"><a href="'+base+'">1</a></div>'}
        result=resolve({'siteId':'177picyy','url':base+'/2/'},SimpleNamespace(fetch=lambda u:SimpleNamespace(text=docs[u])))
        self.assertEqual([x['url'].split('/')[-1] for x in result['images']],['1.jpg','2.jpg'])
        self.assertEqual(result['metadata']['reader_pages'],2)

    def test_doujiva_flight_data_is_decoded_and_sorted_without_script_execution(self):
        pages=[{'number':2,'imageUrl':'/2.webp'},{'number':1,'imageUrl':'/1.webp'}]
        def source(rows):return '<script>self.__next_f.push([1,'+json.dumps('a:["$","widget",null,{"pages":'+json.dumps(rows)+'}]')+'])</script>'
        result,_=parse('doujiva',source(pages),'https://doujiva.com/manga/test-123')
        self.assertEqual([i['url'] for i in result['images']],['https://doujiva.com/1.webp','https://doujiva.com/2.webp'])
        pages[1]['number']=2
        with self.assertRaises(WorkerError):parse('doujiva',source(pages),'https://doujiva.com/manga/test-123')

    def test_search_pages_and_series_are_not_saved_as_galleries(self):
        for site,url in [('rule34us','https://rule34.us/index.php?r=posts/index'),('rule34pw','https://rule34.pw/tag'),('rule34ai','https://rule34ai.art/?s=test'),('cartoon18','https://cartoon18.com/v/abc')]:
            with self.subTest(site=site),self.assertRaises(WorkerError):resolve({'siteId':site,'url':url},SimpleNamespace(fetch=lambda u:SimpleNamespace(text='<h1>Series</h1>')))

    def test_unverified_readers_fail_clearly_instead_of_downloading_thumbnails(self):
        for site in ['dabaitu','kasei','hentaidb']:
            with self.subTest(site=site),self.assertRaisesRegex(WorkerError,'Queue rendered pages'):
                resolve({'siteId':site,'url':'https://example.com/gallery/123'},SimpleNamespace(fetch=lambda u:SimpleNamespace(text='<img src="/thumb.jpg">')))

    def test_hentaidb_manifest_takes_all_pages_instead_of_only_the_visible_one(self):
        source='<img class="rd-img" src="/cm/book/001.webp"><script>window.CXR='+json.dumps({'pages':['/cm/book/001.webp','/cm/book/002.webp']})+';</script>'
        result,_=parse('hentaidb',source,'https://hentaidb.xyz/comics/book/read')
        self.assertEqual([r['url'] for r in result['images']],['https://hentaidb.xyz/cm/book/001.webp','https://hentaidb.xyz/cm/book/002.webp'])
        with self.assertRaises(WorkerError):parse('hentaidb','<script>window.CXR={"pages":["javascript:bad"]}</script>','https://hentaidb.xyz/comics/book/read')

    def test_kasei_numeric_chapter_api_keeps_order_and_source_referrer(self):
        calls=[]
        def fetch(url):
            calls.append(url)
            return SimpleNamespace(json=lambda:{'chapter':{'title':'Chapter one'},'pages':[{'image_url':'https://cdn.example/01.jpg'},{'image_url':'https://cdn.example/02.jpg'}]})
        url='https://kasei.cc/comic/123/read/1'
        result=resolve({'siteId':'kasei','url':url},SimpleNamespace(fetch=fetch))
        self.assertEqual(calls,['https://kasei.cc/api/v1/comics/123/chapters/1'])
        self.assertEqual(len(result['images']),2)
        self.assertTrue(all(i['_http_headers']['Referer']==url for i in result['images']))

if __name__=='__main__':unittest.main()
