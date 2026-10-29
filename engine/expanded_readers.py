"""Additional readers: parse scoped content and manifests, never execute site JS."""
import json
import re
from urllib.parse import urljoin, urlparse, parse_qs
from bs4 import BeautifulSoup
from site_access import WorkerError, check_html

SITES = {'rule34ai','rule34us','rule34pw','cartoon18','177picyy','ho5ho','dabaitu','hentaidb','doujiva','kasei'}
SELECTORS = {
    'rule34ai': '.entry-content img, .entry-content video source, .entry-content video[src]',
    'rule34us': '.content_push img[src*="/images/"], .content_push video source, .content_push video[src], img#image',
    'rule34pw': '#player source, #player[src], img.op-player__media, .op-player img',
    'cartoon18': '.cartoon-image img',
    '177picyy': '.single-content img',
    'ho5ho': '.reading-content .page-break img, .reading-content img.wp-manga-chapter-img',
    'dabaitu': '#chapter-content img, .chapter-content img, .reading-content img',
    'hentaidb': '.rd-stage img.rd-img, #reader img, .reader-pages img, .comic-reader img, video source, video[src]',
    'doujiva': '[data-page-number] img, .reader-pages img',
    'kasei': '.scroll-page img, img.h-page-img',
}

def web(value, base):
    if not isinstance(value,str) or not value.strip(): return None
    u=urljoin(base,value.strip());p=urlparse(u)
    return u if p.scheme in ('https','http') and p.hostname and not p.username and not p.password else None

def flight_pages(doc, url):
    """Decode Next flight string literals as JSON data, without evaluating JS."""
    pages=[]
    decoder=json.JSONDecoder()
    for script in doc.select('script'):
        raw=script.get_text()
        if 'self.__next_f.push' not in raw: continue
        for m in re.finditer(r'self\.__next_f\.push\(\s*\[\s*1\s*,\s*',raw):
            try: text,_=decoder.raw_decode(raw[m.end():])
            except ValueError: continue
            if not isinstance(text,str): continue
            for found in re.finditer(r'"pages"\s*:\s*',text):
                try: rows,_=decoder.raw_decode(text[found.end():])
                except ValueError: continue
                if not isinstance(rows,list) or not rows: continue
                if len(rows)>50000: raise WorkerError('This chapter exceeds the page limit.')
                if not all(isinstance(r,dict) and isinstance(r.get('number'),int) and web(r.get('imageUrl'),url) for r in rows):continue
                numbers=[r['number'] for r in rows]
                if sorted(numbers)!=list(range(1,len(rows)+1)):raise WorkerError('The chapter manifest has missing or duplicate pages.')
                candidates=[{'url':web(r['imageUrl'],url)} for r in sorted(rows,key=lambda r:r['number'])]
                if pages and pages!=candidates:raise WorkerError('Conflicting chapter manifests. Open one chapter reader.')
                pages=candidates
    return pages

def parse(site, source, url):
    check_html(source)
    doc=BeautifulSoup(source,'html.parser')
    # Keep recommended posts outside the current WordPress article out of scope.
    if site=='rule34ai':
        ident=urlparse(url).path.strip('/').split('/')[0]
        scope=doc.select_one('article#post-'+ident) or doc.select_one('article.post')
    else:scope=doc
    images=flight_pages(doc,url) if site=='doujiva' else []
    if site=='hentaidb':
        match=re.search(r'window\.CXR\s*=\s*',source)
        if match:
            try: manifest,_=json.JSONDecoder().raw_decode(source[match.end():])
            except ValueError:raise WorkerError('HentaiDB returned an unreadable chapter manifest.') from None
            pages=manifest.get('pages') if isinstance(manifest,dict) else None
            if not isinstance(pages,list) or not 1<=len(pages)<=50000 or not all(web(v,url) for v in pages):
                raise WorkerError('HentaiDB did not expose a complete chapter manifest.')
            images=[{'url':web(v,url)} for v in pages]
            if len({i['url'] for i in images})!=len(images):raise WorkerError('HentaiDB returned duplicate chapter pages.')
    if not images and scope:
        for n in scope.select(SELECTORS[site]):
            value=next((n.get(a) for a in ('data-original','data-lazy-src','data-src','src') if n.get(a) and not n.get(a).startswith('data:')),None)
            u=web(value,url)
            if u and not re.search(r'/thumbnails?/|/timthumb\.php|/imgdef/|/covers?/',urlparse(u).path,re.I):images.append({'url':u})
    images=list({r['url']:r for r in images}.values())
    title=doc.select_one('h1') or doc.title
    return {'title':title.get_text(' ',strip=True) if title else site,'images':images,'metadata':{'site':site,'adapter':'FileFapper scoped reader','source':url,'count':len(images)}},doc

def same_site(value, base):
    a,b=urlparse(value),urlparse(base)
    return a.hostname==b.hostname and a.scheme in ('http','https') and not a.username and not a.password

def resolve(req, ctx):
    site,url=req['siteId'],req['url'];p=urlparse(url)
    if site=='kasei':
        match=re.fullmatch(r'/comic/(\d+)/read/(\d+)/?',p.path)
        if not match:raise WorkerError('Open a Kasei chapter /comic/ID/read/NUMBER. For public token addresses, load its scroll reader in Browser and choose Queue rendered pages.')
        root=p._replace(path='',query='',fragment='').geturl()
        data=ctx.fetch(f'{root}/api/v1/comics/{match[1]}/chapters/{match[2]}').json()
        pages=data.get('pages') if isinstance(data,dict) else None
        if not isinstance(pages,list) or not 1<=len(pages)<=50000 or not all(isinstance(i,dict) and web(i.get('image_url'),url) for i in pages):
            raise WorkerError('Kasei did not return chapter pages for this account. Open its scroll reader in Browser and choose Queue rendered pages.')
        images=[{'url':web(i['image_url'],url),'_http_headers':{'Referer':url}} for i in pages]
        if len({i['url'] for i in images})!=len(images):raise WorkerError('Kasei returned duplicate chapter pages.')
        return {'title':(data.get('chapter') or {}).get('title') or f'Kasei {match[1]} · {match[2]}','images':images,'metadata':{'site':site,'adapter':'FileFapper Kasei chapter API','source':url,'count':len(images)}}
    # Never treat search results or a series cover as the gallery's page list.
    if site=='rule34us' and (parse_qs(p.query).get('r')!=['posts/view'] or not parse_qs(p.query).get('id',[''])[0].isdigit()):
        raise WorkerError('Open an individual Rule34.us post (r=posts/view&id=…).')
    if site=='rule34pw' and not re.fullmatch(r'/post/\d+/?',p.path):raise WorkerError('Open an individual Rule34.pw /post/ID address.')
    if site=='rule34ai' and not re.fullmatch(r'/\d+/?',p.path):raise WorkerError('Open an individual Rule34 AI Art post.')
    source=ctx.fetch(url).text
    result,doc=parse(site,source,url)
    if site=='hentaidb' and re.fullmatch(r'/comics/[^/]+/?',p.path):
        expected=p.path.rstrip('/')+'/read'
        reader=next((web(a.get('href'),url) for a in doc.select('a[href]') if (u:=web(a.get('href'),url)) and same_site(u,url) and urlparse(u).path==expected),None)
        if reader:url=reader;result,doc=parse(site,ctx.fetch(reader).text,reader)
    if site=='cartoon18' and re.fullmatch(r'/v/[\w-]+/?',p.path):
        raise WorkerError('This is a Cartoon18 series. Open a chapter ending in /story/ID/full, then queue that URL.')
    if site=='ho5ho' and not result['images']:
        links=[web(a.get('href'),url) for a in doc.select('a[href]')]
        readers=list(dict.fromkeys(u for u in links if u and same_site(u,url) and urlparse(u).path.startswith(p.path.rstrip('/')+'/') and re.search(r'/server-\d+/?$',urlparse(u).path)))
        if readers:
            url=readers[0];result,doc=parse(site,ctx.fetch(url).text,url)
    if site=='177picyy' and result['images']:
        root=re.sub(r'\.html/\d+/?$','.html',p.path)
        base=p._replace(path=root,query='',fragment='').geturl()
        # Resolve every numbered reader page, including when pasted halfway in.
        pending={base};seen=set();all_images=[]
        while pending:
            current=min(pending,key=lambda u:int(re.search(r'\.html/(\d+)',u)[1]) if re.search(r'\.html/(\d+)',u) else 1);pending.remove(current)
            if current in seen:continue
            if len(seen)>=200:raise WorkerError('Gallery exceeds 200 reader pages; no partial gallery was saved.')
            seen.add(current)
            part,page=parse(site,source if current==req['url'] else ctx.fetch(current).text,current)
            if not part['images']:raise WorkerError('A numbered reader page returned no full-size images. Retry after opening it in Browser.')
            if all_images and not any(i['url'] not in {x['url'] for x in all_images} for i in part['images']):raise WorkerError('A numbered reader page repeated earlier images. No incomplete gallery was saved.')
            all_images.extend(part['images'])
            for a in page.select('.page-links a[href], .entry-content a[href]'):
                target=web(a.get('href'),current)
                if target and same_site(target,base) and re.fullmatch(re.escape(root)+r'(?:/\d+/?)?',urlparse(target).path) and target not in seen:pending.add(target)
        result['images']=list({i['url']:i for i in all_images}.values());result['metadata']['reader_pages']=len(seen)
    if not result['images']:
        raise WorkerError('No complete full-size reader was exposed. Open an individual chapter/post in Browser and use Queue rendered pages after it loads. This site may require sign-in or an updated reader adapter.')
    for item in result['images']:item['_http_headers']={'Referer':url}
    result['metadata']['count']=len(result['images'])
    return result
