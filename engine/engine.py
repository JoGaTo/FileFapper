"""FileFapper worker. One JSON request on stdin; JSON line events on stdout.

Site modules are deliberately isolated in this process, not security-sandboxed.
"""
from __future__ import annotations
import ast
import concurrent.futures as futures
import errno
import hashlib
import html
import importlib.util
import io
import json
import logging
import os
from pathlib import Path
import re
import shutil
import sys
import threading
import time
from urllib.parse import urljoin, urlparse, parse_qs, parse_qsl, urlencode, unquote
import requests
from bs4 import BeautifulSoup
from PIL import Image, ImageDraw, ImageFont
from upscaler import enlarge
from media_formats import kind_for, validate_file, file_hash, ugoira_preview
from site_access import WorkerError, AccessError, check_html, CHALLENGE_MESSAGE
from cookie_scope import scoped_session, protect_session, install_cookie

OUTPUT_LOCK = threading.Lock()

def emit(event, **data):
    with OUTPUT_LOCK:
        print(json.dumps({"event": event, **data}, ensure_ascii=False, default=str), flush=True)

class EHImageSourceError(WorkerError):
    """An image host failed; the site can supply another source for this page."""
    pass

class ImageTransferError(WorkerError):
    """Discard the failed partial file before retrying this image."""
    pass

class RetryableHTTPStatus(WorkerError):
    def __init__(self,status):
        self.status=status
        super().__init__(f'The server still refused this request (HTTP {status}) after bounded retries. Automatic cooldown is disabled; retry this task when ready.')

class RateLimited(WorkerError):
    def __init__(self, seconds=60):
        self.seconds = max(1, min(86400, int(seconds)))
        super().__init__(f"The server requested a cooldown ({self.seconds}s). Resume after the cooldown.")

def clean(value):
    if isinstance(value, dict):
        return {str(k): clean(v) for k, v in value.items() if not str(k).startswith('_') and not callable(v)}
    if isinstance(value, (list, tuple)):
        return [clean(v) for v in value]
    if isinstance(value, (str, int, float, bool)) or value is None:
        return value
    return str(value)

def safe_name(name):
    name = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', str(name)).strip(' .')[:100] or 'Gallery'
    if name.split('.')[0].upper() in {'CON','PRN','AUX','NUL',*(f'COM{i}' for i in range(1,10)),*(f'LPT{i}' for i in range(1,10))}:
        name = '_' + name
    return name

def should_bypass_rate_limits(req):
    if not isinstance(req, dict):
        return False
    flags = ('bypassRateLimits','bypassRateLimit','skipRateLimit','skipCooldown','disableCooldown','ignoreRateLimits')
    if any(req.get(flag) is True for flag in flags):
        return True
    options = req.get('options')
    if isinstance(options, dict):
        return any(options.get(flag) is True for flag in flags)
    return False

def fast_eh_resolution(req):
    options=req.get('options') if isinstance(req.get('options'),dict) else {}
    return req.get('siteId') in ('ehentai','exhentai') and (req.get('fastResolve') is True or options.get('fastResolve') is True)

def response_offset(response,offset):
    """Accept only the requested remaining byte range, never an unrelated slice."""
    if response.status_code==416 and offset:
        raise ImageTransferError('The saved partial file no longer matches the image. Retrying from the beginning.')
    if response.status_code!=206:
        return 0
    match=re.fullmatch(r'bytes (\d+)-(\d+)/(\d+)',response.headers.get('Content-Range',''))
    if not match:
        raise ImageTransferError('The image server returned an invalid partial range.')
    start,end,total=map(int,match.groups())
    if start!=offset or end<start or end+1!=total:
        raise ImageTransferError('The image server returned an inconsistent partial range.')
    length=response.headers.get('Content-Length')
    if length and (not length.isdigit() or int(length)!=end-start+1):
        raise ImageTransferError('The image server returned an inconsistent partial length.')
    return offset

def valid_http(url):
    u = urlparse(str(url))
    if u.scheme not in ('http','https') or not u.hostname or u.username or u.password:
        raise WorkerError('The script returned an invalid image URL. Use HTTP or HTTPS URLs.')
    return str(url)

class Context:
    def __init__(self, req):
        self.request = req
        self.session = scoped_session()
        self.session.headers.update({'User-Agent':req.get('userAgent') or 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/144.0.0.0 Safari/537.36', 'Referer':req.get('url','')})
        for c in req.get('cookies', []):
            install_cookie(self.session.cookies, c)
        self._lock = threading.Lock()
        self._next = 0
        self._eh_refresh_lock = threading.Lock()
        self._eh_last_refresh = 0
        self.bypass_rate_limits = should_bypass_rate_limits(req)
        self.fast_resolve = fast_eh_resolution(req)
        self.delay = .05 if self.fast_resolve else max(.2, float(req.get('delay', .6)))
        self.retry_delay = .15 if self.fast_resolve else 1
        self.options = req.get('options', {})

    def get(self, url, **kwargs):
        return self.fetch(url, **kwargs)

    def fetch(self, url, **kwargs):
        valid_http(url)
        with self._lock:
            now = time.monotonic()
            delay = max(0, self._next-now)
            self._next = max(now, self._next)+self.delay
        if delay:
            time.sleep(delay)
        response = self.session.get(url, timeout=(15,45), **kwargs)
        self.check(response)
        if not kwargs.get('stream') and ('html' in response.headers.get('Content-Type','').lower() or response.content[:30].lstrip().lower().startswith((b'<!doctype html', b'<html'))):
            check_html(response.text)
        return response

    def check(self,response):
        if response.headers.get('cf-mitigated','').lower()=='challenge':
            raise AccessError(CHALLENGE_MESSAGE, challenge=True)
        if response.status_code in (429,509):
            if self.bypass_rate_limits:
                raise RetryableHTTPStatus(response.status_code)
            try:
                seconds = int(response.headers.get('Retry-After','60'))
            except ValueError:
                from email.utils import parsedate_to_datetime
                try:
                    seconds = max(1, int(parsedate_to_datetime(response.headers['Retry-After']).timestamp()-time.time()))
                except Exception:
                    seconds = 60
            raise RateLimited(seconds)
        if response.status_code in (401,403):
            if getattr(response,'_content',False) is not False and response._content:
                check_html(response.text)
            raise AccessError('Access denied. Open this site in Browser, sign in or complete its challenge, then sync cookies and resume.')
        if response.status_code in (404,410):
            raise WorkerError(f'This address is missing or was removed (HTTP {response.status_code}). Open it in Browser and queue the current gallery or chapter link. Signing in cannot repair an address that no longer exists.')
        response.raise_for_status()

def inspect_plugin(filename):
    tree = ast.parse(Path(filename).read_text(encoding='utf-8-sig'))
    manifest = None
    for item in tree.body:
        if isinstance(item, ast.Assign) and any(isinstance(t, ast.Name) and t.id=='MANIFEST' for t in item.targets):
            manifest = ast.literal_eval(item.value)
    if not isinstance(manifest, dict) or manifest.get('api') != 1:
        raise WorkerError('Your script must declare a literal MANIFEST dictionary with api: 1.')
    if not re.fullmatch(r'[a-z0-9_-]{1,60}', str(manifest.get('id',''))):
        raise WorkerError('Script id must contain 1–60 lowercase letters, digits, underscores or hyphens.')
    domains = manifest.get('domains')
    if not isinstance(domains,list) or not domains or not all(isinstance(d,str) and re.fullmatch(r'[a-zA-Z0-9.-]+',d) for d in domains):
        raise WorkerError('MANIFEST.domains must list the exact hosts your script supports.')
    return {k:manifest[k] for k in ('id','name','version','domains','api') if k in manifest}

def load_plugin(filename):
    inspect_plugin(filename)
    spec = importlib.util.spec_from_file_location('df_site_plugin', filename)
    module = importlib.util.module_from_spec(spec)
    # Plugin prints belong on stderr; only structured events use stdout.
    from contextlib import redirect_stdout
    with redirect_stdout(sys.stderr):
        spec.loader.exec_module(module)
    return module

def restore_jm(image, segments):
    """Restore JM's reversed horizontal strips, retaining every remainder row."""
    n = int(segments)
    if not n:
        return image.copy()
    if n < 2 or n > 64 or n > image.height:
        raise WorkerError('Invalid strip count returned by the site adapter.')
    w,h = image.size
    step, remainder = divmod(h,n)
    result = Image.new(image.mode, image.size)
    for i in range(n):
        sy = h-step*(i+1)-remainder
        dy = step*i + (remainder if i else 0)
        height = step + (remainder if i==0 else 0)
        result.paste(image.crop((0,sy,w,sy+height)), (0,dy))
    return result

def jm_segments(scramble_id, photo_id, filename):
    aid = int(photo_id)
    if aid < int(scramble_id):
        return 0
    if aid < 268850:
        return 10
    divisor = 10 if aid < 421926 else 8
    return (ord(hashlib.md5(f'{aid}{filename}'.encode()).hexdigest()[-1]) % divisor)*2+2

def native_jm(url, ctx):
    page = ctx.fetch(url).text
    soup = BeautifulSoup(page,'html.parser')
    title = (soup.select_one('#book-name') or soup.title)
    title = title.get_text(' ',strip=True).split('|')[0] if title else 'JMComic'
    root = f'{urlparse(url).scheme}://{urlparse(url).netloc}'
    photo_urls = [url] if '/photo/' in urlparse(url).path else list(dict.fromkeys(urljoin(root,a['href']) for a in soup.select('a[href]') if re.search(r'/photo/\d+', a['href'])))
    if not photo_urls:
        match = re.search(r'/album/(\d+)', url)
        if match:
            photo_urls = [f'{root}/photo/{match[1]}/']
    images = []
    for photo_url in photo_urls:
        source = page if photo_url==url else ctx.fetch(photo_url).text
        doc = BeautifulSoup(source,'html.parser')
        sid = re.search(r'var\s+scramble_id\s*=\s*(\d+)',source)
        if not sid:
            raise WorkerError('JMComic did not expose its scramble id. Sign in, or update the site script; scrambled files were not saved.')
        aid = re.search(r'/photo/(\d+)',photo_url)[1]
        items = doc.select('img[id^="album_photo"], img[data-original*="/media/photos/"]')
        for item in items:
            src = item.get('data-original') or item.get('data-src') or item.get('src')
            if not src or 'blank' in src:
                continue
            src = urljoin(photo_url, html.unescape(src))
            stem = Path(urlparse(src).path).stem
            images.append({'url':src,'segments':jm_segments(sid[1],aid,stem),'photo_id':aid,'scramble_id':sid[1]})
    if not images:
        raise WorkerError('No readable pages were found. The JMComic layout may have changed; import an updated script.')
    return {'title':title, 'images':images,'metadata':{'site':'JMComic','repair':'automatic horizontal strip restoration'}}

def native_wnacg(url, ctx):
    root = f'{urlparse(url).scheme}://{urlparse(url).netloc}'
    pending = [url]
    visited, viewers = set(), []
    title = 'WNACG'
    while pending:
        page_url = pending.pop(0)
        if page_url in visited:
            continue
        visited.add(page_url)
        doc = BeautifulSoup(ctx.fetch(page_url).text,'html.parser')
        if len(visited)==1:
            node = doc.select_one('h2') or doc.title
            if node:
                title = node.get_text(' ',strip=True)
        for a in doc.select('a[href]'):
            href = urljoin(root,a['href'])
            if re.search(r'/photos-view-id-\d+\.html',href) and href not in viewers:
                viewers.append(href)
            if re.search(r'/photos-index-page-\d+-aid-\d+\.html',href) and href not in visited and href not in pending:
                pending.append(href)
        if len(visited)>200:
            raise WorkerError('The gallery has more than 200 index pages. Add a smaller gallery or update the adapter.')
    images = []
    for viewer in viewers:
        doc = BeautifulSoup(ctx.fetch(viewer).text,'html.parser')
        node = doc.select_one('#picarea') or doc.select_one('img[src*="/data/"]')
        if node and node.get('src'):
            images.append({'url':urljoin(viewer,node['src'])})
    if not images:
        raise WorkerError('No gallery images found. Open the site in Browser or import an updated WNACG script.')
    return {'title':title,'images':images,'metadata':{'site':'WNACG'}}

def eh_image_source(req, extr, item):
    """Capture each page's immutable reload identity before extractor data changes."""
    if req.get('siteId') not in ('ehentai','exhentai'):
        return None
    token=str(item.get('image_token') or '')
    try:
        gid=int(extr.gallery_id)
        num=int(item['num'])
    except (AttributeError,KeyError,TypeError,ValueError):
        return None
    if not re.fullmatch(r'[a-fA-F0-9]{10}',token) or min(gid,num)<1:
        return None
    image_url=item.get('url','')
    match=re.search(r'/h/([a-fA-F0-9]{40})-',urlparse(image_url).path)
    return {'page_url':f'{extr.root}/s/{token}/{gid}-{num}',
            'nl':str(item.get('_nl') or ''),
            'original_link':req.get('quality')=='original' and urlparse(image_url).path.startswith('/fullimg'),
            'image_hash':match[1].lower() if match else None}

def eh_refresh_source(req,ctx,item,session,stop):
    """Use the site's reload control, without sharing live extractor state across workers."""
    source=item['_eh_source']
    page_url=valid_http(source.get('page_url',''))
    page_origin=urlparse(page_url)
    gallery_origin=urlparse(req['url'])
    same_origin=(page_origin.scheme,page_origin.netloc)==(gallery_origin.scheme,gallery_origin.netloc)
    secure_upgrade=(gallery_origin.scheme=='http' and page_origin.scheme=='https' and page_origin.hostname==gallery_origin.hostname and gallery_origin.port in (None,80) and page_origin.port in (None,443))
    if not (same_origin or secure_upgrade):
        raise EHImageSourceError('The image reload page did not belong to this gallery site.')
    with ctx._eh_refresh_lock:
        interval=.25 if ctx.fast_resolve else 3
        if stop.is_set() or stop.wait(max(0,interval-(time.monotonic()-ctx._eh_last_refresh))):
            return None
        ctx._eh_last_refresh=time.monotonic()
        # For full originals, send nl only to fullimg below. Forcing both the
        # viewer and fullimg would charge two reloads for one recovery attempt.
        original_reload=req.get('quality')=='original' and source.get('original_link')
        params={'nl':source['nl']} if source.get('nl') and not original_reload else None
        with ctx.fetch(page_url,params=params) as response:
            final=urlparse(response.url)
            if (final.scheme,final.netloc)!=(page_origin.scheme,page_origin.netloc):
                raise AccessError('The image reload page redirected away from the gallery site. Check the gallery in Browser.')
            page=response.text
        doc=BeautifulSoup(page,'html.parser')
        text=doc.get_text(' ',strip=True)
        if re.search(r'exceeded (?:your |the )?image (?:viewing )?limit|image limit (?:has been )?(?:reached|exceeded)',text,re.I):
            if ctx.bypass_rate_limits:raise RetryableHTTPStatus(509)
            raise RateLimited(60)
        if doc.select_one('input[type="password"],#challenge-form,iframe[src*="challenges.cloudflare.com"]') or re.search(r'temporarily banned|not enough (?:GP|credits)|requires GP|insufficient (?:GP|credits)',text,re.I):
            raise AccessError('The site did not allow the requested image. Check your account access or image points in Browser, then resume.')
        node=doc.select_one('img#img')
        image_url=urljoin(page_url,node.get('src','')) if node else ''
        if re.search(r'/(?:g/)?509\.(?:gif|png)(?:\?|$)',image_url,re.I):
            if ctx.bypass_rate_limits:raise RetryableHTTPStatus(509)
            raise RateLimited(60)
        if not node or not image_url:
            raise EHImageSourceError('The image reload page did not provide a usable image link.')
        original=next((urljoin(page_url,a['href']) for a in doc.select('a[href]') if urlparse(urljoin(page_url,a['href'])).path.startswith('/fullimg')),None)
        if req.get('quality')=='original':
            if original:
                fresh=original
            elif source.get('original_link'):
                raise AccessError('The site no longer offers the requested original-file link. Open the gallery in Browser; a resampled file was not substituted.')
            else:
                # A small image may already be the original and have no fullimg link.
                match=re.search(r'/h/([a-fA-F0-9]{40})-',urlparse(image_url).path)
                if not source.get('image_hash') or not match or match[1].lower()!=source['image_hash']:
                    raise AccessError('The refreshed page did not confirm the same original image. Open the gallery in Browser before retrying.')
                fresh=image_url
        else:
            fresh=image_url
        reload_code=re.search(r'''\bnl\(\s*(['"])([^'"]+)\1\s*\)''',page)
        if reload_code:
            source['nl']=reload_code[2]
        if original and fresh==original and source.get('nl'):
            # fullimg may already have gid/page/key parameters. Preserve them and
            # use the site's reload token to avoid the same cached H@H selection.
            target=urlparse(fresh)
            query=[(k,v) for k,v in parse_qsl(target.query,keep_blank_values=True) if k!='nl']
            query.append(('nl',source['nl']))
            fresh=target._replace(query=urlencode(query),fragment='').geturl()
        fresh=valid_http(fresh)
        parsed=urlparse(fresh)
        if page_origin.scheme=='https' and parsed.scheme!='https':
            raise EHImageSourceError('The refreshed image source did not provide a secure connection.')
        if original and req.get('quality')=='original' and (parsed.scheme,parsed.netloc)!=(page_origin.scheme,page_origin.netloc):
            raise EHImageSourceError('The original-file link did not belong to this gallery site.')
        session.cookies.update(ctx.session.cookies)
        return fresh

def eh_failed_page(index,exc):
    if isinstance(exc,requests.exceptions.SSLError):
        reason='The image server could not establish a secure TLS connection.'
    elif isinstance(exc,requests.exceptions.Timeout):
        reason='The image server timed out.'
    else:
        reason='The image server did not return a usable image.'
    return WorkerError(f'Page {index}: {reason} Automatic image-source recovery could not finish this page. Resume to refresh its links; completed pages are kept.')

def gallery_resolve(req, ctx):
    from gallery_dl import config, extractor
    from gallery_dl.extractor.message import Message
    fast = ctx.fast_resolve
    config.clear()
    config.set(('extractor',),'retries',2)
    config.set(('extractor',),'timeout',30)
    config.set(('extractor',),'sleep-429',60)
    config.set(('extractor',),'user-agent',ctx.session.headers['User-Agent'])
    config.set(('extractor',),'sleep-request',.05 if fast else max(.5,ctx.delay))
    config.set(('extractor',),'sleep-retries',.15 if fast else None)
    for collection_site in ('pawchive','kemono'):
        config.set(('extractor',collection_site),'max-posts',max(1,min(500,int(req.get('maxPosts',50)))))
        config.set(('extractor',collection_site),'domain','auto')
        config.set(('extractor',collection_site),'original',True)
    config.set(('extractor','exhentai'),'original',req.get('quality')=='original')
    config.set(('extractor','exhentai'),'gp','stop')
    config.set(('extractor','exhentai'),'limits',False)
    config.set(('extractor','exhentai'),'fallback-retries',0)
    # FileFapper owns bounded per-page recovery; extractor generators are not shared.
    extr = extractor.find(req['url'])
    if extr is None:
        raise WorkerError('No extractor matches this URL. Paste a gallery/chapter URL or import a site script.')
    if req.get('siteId') in ('ehentai','exhentai'):
        names={c.name for c in ctx.session.cookies}
        if req.get('quality')=='original' and not {'ipb_member_id','ipb_pass_hash'}.issubset(names):
            raise AccessError('Original files require your E-Hentai/ExHentai login cookies: ipb_member_id and ipb_pass_hash. Import or sync cookies, then resume.')
        if req.get('siteId')=='exhentai' and not {'ipb_member_id','ipb_pass_hash'}.issubset(names):
            raise AccessError('ExHentai requires an authorized login. Import or sync its cookies before downloading.')
    collection = req.get('siteId') in ('pawchive','kemono')
    if not collection and extr.subcategory not in ('gallery','chapter','manga','doujin','image','post','pool'):
        raise WorkerError('This URL points to a search or collection. Use Search to choose individual galleries first.')
    extr.initialize()
    protect_session(extr.session)
    extr.session.cookies.update(ctx.session.cookies)
    original_request = extr.session.request
    def checked_request(*a, **kw):
        for attempt in range(3):
            response=original_request(*a,**kw)
            try:
                ctx.check(response)
                if not kw.get('stream') and 'html' in response.headers.get('Content-Type','').lower():
                    check_html(response.text)
                return response
            except RetryableHTTPStatus:
                response.close()
                if attempt==2:raise
                time.sleep(.25*(attempt+1))
    extr.session.request=checked_request
    ctx.session=extr.session
    result={'title':'Gallery','images':[],'metadata':{}}
    posts=[]
    try:
        for message in extr:
            if message[0]==Message.Directory:
                md=clean(message[2])
                if collection:
                    posts.append({'id':md.get('id'),'title':md.get('title'),'user':md.get('user')})
                    if len(posts)>1:
                        result['title']=f"{extr.category.title()} collection {urlparse(req['url']).path.split('/user/')[-1].split('/')[0]}"
                        continue
                result['metadata']=md
                result['total']=int(md.get('count') or md.get('filecount') or 0)
                result['title']=md.get('title') or md.get('name') or md.get('manga') or f"{extr.category} {md.get('gallery_id',md.get('gid','Gallery'))}"
                emit('metadata',title=result['title'],metadata=md,total=int(md.get('count') or md.get('filecount') or 0))
            elif message[0]==Message.Url:
                if not kind_for(message[2].get('extension') or Path(urlparse(message[1]).path).suffix):
                    continue
                # Copy metadata: many extractors reuse the same dictionary.
                item={**dict(message[2]), 'url':message[1]}
                if '_http_headers' in item: item['_http_headers']=dict(item['_http_headers'])
                if source:=eh_image_source(req,extr,item): item['_eh_source']=source
                result['images'].append(item)
                if req.get('mode')=='preview':
                    break
            elif message[0]==Message.Queue:
                raise WorkerError('This URL contains multiple chapters. Add an individual chapter URL.')
    finally:
        if getattr(extr,'finalize',None):
            extr.finalize(0)
    if not result['images']:
        raise WorkerError('The site returned no images. Check your cookies or update the site adapter.')
    if collection:
        result['metadata']['posts']=posts
        result['metadata']['max_posts']=req.get('maxPosts',50)
        result['total']=len(result['images'])
    return result

def demo_image(index):
    colors=[('#eee9dd','#50624f'),('#dce7ed','#4d6477'),('#f2e0d7','#956f59'),('#e5e1f1','#71628e')]
    bg,ink=colors[(index-1)%4]
    image=Image.new('RGB',(720,1020),bg)
    d=ImageDraw.Draw(image)
    try:
        big=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',48)
        small=ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf',22)
    except OSError:
        big=small=ImageFont.load_default()
    d.rounded_rectangle((65,60,655,960),24,outline=ink,width=2)
    d.text((105,105),'FileFapper / SAMPLE GALLERY',font=small,fill=ink)
    d.ellipse((190,270,530,610),fill=ink)
    d.rectangle((190,440,530,610),fill=bg)
    d.line((190,610,530,610),fill=ink,width=3)
    d.rounded_rectangle((255,390,465,710),14,outline=ink,width=3)
    d.text((108,775),['A little room','A quiet afternoon','The next chapter','Made for collecting'][(index-1)%4],font=big,fill=ink)
    d.text((110,855),f'FOR DISCOVERY     /     {index:02d} OF 12',font=small,fill=ink)
    return image

def download(req):
    ctx=Context(req)
    plugin=None
    if req['url'].startswith('dfdemo:'):
        title={'/afternoon':'A quiet afternoon','/next':'The next chapter'}.get(urlparse(req['url']).path,'A little room for discovery')
        result={'title':title,'images':[{'url':f'dfdemo://page/{i}'} for i in range(1,13)],'metadata':{'site':'Local sample','language':'English','tags':['design','sample'],'description':'Twelve locally generated, non-explicit sample pages. No network connection required.'}}
    elif req.get('capture'):
        capture=req['capture']
        if capture.get('url')!=req['url']:
            raise WorkerError('The browser capture belongs to another URL.')
        result={'title':str(capture.get('title') or 'Browser gallery'),'images':capture.get('images',[]),'metadata':{'site':req.get('siteId'),'adapter':'FileFapper browser reader','captured':capture.get('createdAt')}}
    elif req.get('plugin'):
        plugin=load_plugin(req['plugin'])
        from contextlib import redirect_stdout
        with redirect_stdout(sys.stderr):
            result=plugin.resolve(req['url'],ctx)
    elif req.get('siteId')=='jmcomic':
        result=native_jm(req['url'],ctx)
    elif req.get('siteId')=='wnacg':
        result=native_wnacg(req['url'],ctx)
    elif req.get('siteId') in ('hentaihere','hentai2read','hentaienvy','hentairox','hentaizap','hentaifox','hentaiera','imhentai','hentaihand'):
        from reader_adapters import resolve as resolve_reader
        result=resolve_reader(req,ctx,gallery_resolve)
    else:
        from native_adapters import NATIVE_SITES, resolve
        try:
            result=resolve(req,ctx) if req.get('siteId') in NATIVE_SITES else gallery_resolve(req,ctx)
        except ValueError as exc:
            raise WorkerError(str(exc)) from exc
    if not isinstance(result,dict) or not isinstance(result.get('images'),list) or not result['images']:
        raise WorkerError('resolve() must return a gallery dictionary with a nonempty images list.')
    images=[{'url':x} if isinstance(x,str) else dict(x) for x in result['images']]
    if len(images)>50000:
        raise WorkerError('This gallery exceeds the 50,000-page task limit.')
    root=Path(req['downloadDir']).resolve()
    task_id=str(req['id'])
    if not re.fullmatch(r'[A-Za-z0-9_][A-Za-z0-9_.-]{0,79}',task_id) or '..' in task_id:
        raise WorkerError('Invalid task identifier.')
    folder=Path(req['folder']).resolve() if req.get('folder') else root/f"{safe_name(req.get('siteName') or req.get('siteId') or (urlparse(req['url']).hostname or 'Site'))} - {time.strftime('%Y-%m-%d')}"
    legacy=bool(req.get('folder')) and (folder/'.dandf-task.json').is_file()
    storage=folder if legacy else folder/'.filefapper'/task_id
    if legacy or storage.exists():
        try:
            ownership=json.loads((storage/'.dandf-task.json').read_text(encoding='utf-8'))
        except (OSError,ValueError):
            raise WorkerError('This folder is missing its FileFapper task marker. No files were changed.')
        if ownership.get('id')!=task_id or ownership.get('url')!=req['url']:
            raise WorkerError('The existing gallery data belongs to a different task. No files were changed.')
    elif req.get('folder'):
        raise WorkerError('This folder is missing its FileFapper task marker. No files were changed.')
    folder.mkdir(parents=True,exist_ok=True)
    if not storage.resolve().is_relative_to(folder.resolve()):
        raise WorkerError('Invalid task data folder.')
    storage.mkdir(parents=True,exist_ok=True)
    total=max(len(images),int(result.get('total') or 0)) if req.get('mode')=='preview' else len(images)
    metadata={**clean(result.get('metadata',{})), 'title':str(result.get('title','Gallery')), 'source':req['url'],'quality':req.get('quality','resampled'),'page_count':total,'downloaded_at':time.strftime('%Y-%m-%dT%H:%M:%SZ',time.gmtime())}
    (storage/'gallery.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2),encoding='utf-8')
    (storage/'.dandf-task.json').write_text(json.dumps({'id':task_id,'url':req['url']}),encoding='utf-8')
    ledger_path=storage/'.dandf-files.json'
    try:
        ledger=json.loads(ledger_path.read_text(encoding='utf-8'))
    except (OSError,ValueError):
        ledger={}
    prior_ledger=dict(ledger)
    parsed=urlparse(req['url'])
    ids=parse_qs(parsed.query).get('id',[])
    parts=[p for p in parsed.path.split('/') if p]
    gallery_ident=ids[0] if ids else next((m.group(1) for p in reversed(parts) if (m:=re.match(r'^(\d+)(?:-|$)',p))),task_id[:12])
    gallery_ident=safe_name(gallery_ident)[:40]
    seen={}
    names=[]
    for i,item in enumerate(images,1):
        supplied=item.get('filename')
        url_name=unquote(urlparse(item.get('url','')).path.rsplit('/',1)[-1])
        name=str(supplied or url_name or item.get('name') or '').replace('\\','/').rsplit('/',1)[-1]
        ext=str(item.get('extension') or Path(url_name).suffix.lstrip('.')).lstrip('.')
        suffix='.'+ext if ext else ''
        # Extractors often supply filename as a stem (which may itself contain
        # dots) alongside a separate extension. Strip only that exact extension.
        stem=name[:-len(suffix)] if suffix and name.lower().endswith(suffix.lower()) else name
        stem=safe_name(stem or f'page-{i:04d}')[:80]
        key=stem.casefold()
        seen[key]=seen.get(key,0)+1
        names.append(stem if seen[key]==1 else f'{stem}-{seen[key]}')
    scale=float(req.get('upscale',1))
    if scale not in (1,1.5,2): scale=1
    method='lanczos' if req.get('upscaleMethod')=='lanczos' else 'waifu2x'
    denoise='gentle' if req.get('upscaleDenoise')=='gentle' else 'off'
    device='cpu' if req.get('upscaleDevice')=='cpu' else 'auto'
    fingerprint={'quality':req.get('quality','resampled'),'repair':req.get('repair',True),'upscale':scale}
    if scale>1:fingerprint.update(upscaleMethod=method,upscaleDenoise=denoise,upscaleDevice=device)
    if '__settings' in ledger: ledger['__settings'].setdefault('upscale',1)
    if req.get('force') or ledger.get('__settings')!=fingerprint:
        ledger={}
    ledger['__settings']=fingerprint
    emit('metadata',title=metadata['title'],metadata=metadata,total=total,folder=str(folder))
    state={'done':0,'bytes':0,'last':0,'received':0}
    lock=threading.RLock()
    started=time.monotonic()
    stop=threading.Event()
    limit=max(0,float(req.get('speedLimit',0)))*1024
    throttle_lock=threading.Lock()
    throttle={'next':0}
    def throttle_bytes(count):
        if not limit:
            return
        with throttle_lock:
            now=time.monotonic()
            wait=max(0,throttle['next']-now)
            throttle['next']=max(now,throttle['next'])+count/limit
        if wait:
            time.sleep(wait)
    def report(force=False):
        now=time.monotonic()
        if force or now-state['last']>.3:
            emit('progress',done=state['done'],total=total,bytes=state['bytes'],speed=int(state['received']/max(.2,now-started)))
            state['last']=now
    def get_one(index,item):
        if stop.is_set():
            return
        url=item.get('url','')
        old=ledger.get(str(index))
        if old and old.get('name')==Path(old.get('name','')).name:
            previous=folder/old['name']
            extras=old.get('companions',[])
            extras_valid=all(Path(f.get('name','')).name==f.get('name') and (folder/f['name']).is_file() and file_hash(folder/f['name'])==f.get('sha256') for f in extras)
            original_valid=not old.get('original') or ((folder/old['original']).resolve().is_relative_to(storage.resolve()) and (folder/old['original']).is_file() and file_hash(folder/old['original'])==old.get('originalSha256'))
            if original_valid and previous.is_file() and previous.stat().st_size==old.get('bytes') and file_hash(previous)==old.get('sha256') and extras_valid:
                with lock:
                    state['done']+=1
                    state['bytes']+=old['bytes']
                    emit('file',path=str(previous),name=previous.name,index=index,bytes=old['bytes'],restored=True,repaired=old.get('repaired',False),upscale=old.get('upscale',1),originalPath=str(folder/old['original']) if old.get('original') else '',enhancement=old.get('enhancement',''),mediaKind=old.get('mediaKind',kind_for(previous.suffix) or 'image'),previewPath=str(folder/old['preview']) if old.get('preview') else '',companions=extras,note=old.get('note',''))
                    report(True)
                return
        demo=url.startswith('dfdemo:') and req['url'].startswith('dfdemo:')
        ext=(str(item.get('extension') or Path(urlparse(url).path).suffix.lstrip('.')) or 'jpg').lower()
        media_kind='animation' if item.get('ugoira') else kind_for(ext)
        if media_kind is None:
            raise WorkerError(f'Unsupported attachment type: {ext}. No file was saved under a false image extension.')
        image_media=media_kind=='image'
        # Preserve animated GIF/WebP/ugoira sources; resizing is for still images.
        item_scale=scale if image_media and ext not in ('gif','webp') else 1
        repaired=bool(image_media and req.get('repair',True) and item.get('segments'))
        source_ext=ext
        if repaired or item_scale>1 or (image_media and plugin and hasattr(plugin,'transform')):
            ext='png'
        destination=folder/(f'{index:04d}.{ext}' if legacy else f'{names[index-1]}_{gallery_ident}-{task_id[:8]}.{ext}')
        temporary=destination.with_suffix(destination.suffix+'.part') if legacy else storage/f'{index:04d}.{ext}.part'
        if not legacy and item.get('ugoira'):
            recorded={entry.get('name'):entry for entry in prior_ledger.get(str(index),{}).get('companions',[])}
            for companion in (destination.with_suffix('.frames.json'),destination.with_suffix('.webp')):
                if companion.exists():
                    previous=recorded.get(companion.name,{})
                    if not previous.get('sha256') or file_hash(companion)!=previous['sha256']:
                        raise WorkerError('An animation companion file already exists and is not verified for this task. No files were overwritten.')
        if demo:
            sample_delay=max(.05,min(2,float(parse_qs(urlparse(req['url']).query).get('sampleDelay',[.18])[0])))
            time.sleep(sample_delay)
            im=demo_image(index)
            im.save(temporary,format='JPEG',quality=94)
        elif item.get('localPath'):
            capture_root=Path(req.get('captureRoot','')).resolve()
            source=Path(item['localPath']).resolve()
            if not req.get('captureRoot') or not source.is_relative_to(capture_root) or source.suffix.lower()!='.png':
                raise WorkerError('Invalid browser capture file.')
            temporary.write_bytes(source.read_bytes())
            with Image.open(temporary) as captured: captured.verify()
        else:
            valid_http(url)
            # Separate sessions prevent concurrent mutation of a Requests cookie jar.
            session=scoped_session()
            session.headers.update(ctx.session.headers)
            session.cookies.update(ctx.session.cookies)
            headers={'Referer':req['url'],**item.get('_http_headers',{})}
            eh_source=item.get('_eh_source') if req.get('siteId') in ('ehentai','exhentai') else None
            offset=temporary.stat().st_size if temporary.is_file() and not repaired and not plugin and not req.get('force') else 0
            if offset:
                headers['Range']=f'bytes={offset}-'
            last_error=None
            for attempt in range(3):
                try:
                    if stop.is_set():
                        return
                    with ctx._lock:
                        now=time.monotonic()
                        wait=max(0,ctx._next-now)
                        ctx._next=max(now,ctx._next)+ctx.delay
                    if wait:
                        time.sleep(wait)
                    with session.request(item.get('_http_method','GET'),url,headers=headers,data=item.get('_http_data'),stream=True,timeout=(15,45)) as response:
                        response_host=urlparse(response.url).hostname or ''
                        hath=response_host.endswith('.hath.network')
                        if eh_source and hath and response.status_code in (401,403,404,410):
                            raise EHImageSourceError('The H@H image source is no longer available.')
                        if response.status_code==416 and offset:
                            raise ImageTransferError('The partial image is no longer available. Retrying the full file.')
                        ctx.check(response)
                        if response.headers.get('Content-Type','').lower().startswith('text/html'):
                            if eh_source and hath:
                                raise EHImageSourceError('The H@H image source returned an error page.')
                            raise AccessError('The image server returned a web page. Open the gallery in Browser and check your login.')
                        if validate:=item.get('_http_validate'):
                            validated=validate(response)
                            if isinstance(validated,str):
                                raise WorkerError('The original-file server requires a refreshed link. Resume this task to refresh it.')
                            if not validated:
                                raise WorkerError('The original-file server returned an invalid image response.')
                        offset=response_offset(response,offset)
                        if not offset:headers.pop('Range',None)
                        received=0
                        with temporary.open('ab' if offset else 'wb') as stream:
                            for chunk in response.iter_content(65536):
                                if stop.is_set():
                                    return
                                if not chunk:
                                    continue
                                if eh_source and not offset and not received and (signature:=item.get('_http_signature')):
                                    if signature(chunk[:16]) is not True:
                                        raise EHImageSourceError('The image source returned invalid image data.')
                                stream.write(chunk)
                                received+=len(chunk)
                                throttle_bytes(len(chunk))
                                with lock:
                                    state['received']+=len(chunk)
                                    report()
                        expected_size=response.headers.get('Content-Length')
                        if expected_size and not response.headers.get('Content-Encoding') and (not expected_size.isdigit() or received!=int(expected_size)):
                            raise (EHImageSourceError if eh_source else ImageTransferError)('An image download ended early. Resume to retry it.')
                    try:
                        validate_file(temporary,source_ext)
                    except Exception as exc:
                        raise (EHImageSourceError if eh_source else ImageTransferError)(f'The server returned incomplete or invalid {media_kind} data: {exc}') from exc
                    last_error=None
                    break
                except (RateLimited,AccessError):
                    stop.set()
                    raise
                except (requests.RequestException,OSError,WorkerError) as exc:
                    last_error=exc
                    if isinstance(exc,(ImageTransferError,EHImageSourceError)):
                        temporary.unlink(missing_ok=True)
                        offset=0
                        headers.pop('Range',None)
                    if attempt<2:
                        if eh_source and isinstance(exc,(requests.RequestException,EHImageSourceError)):
                            emit('source-retry',index=index,attempt=attempt+1,message=f'Refreshing source for page {index}…')
                            # An alternate source must start at byte zero. Never join bytes
                            # from two clients or image representations into the same file.
                            temporary.unlink(missing_ok=True)
                            offset=0
                            headers.pop('Range',None)
                            try:
                                fresh=eh_refresh_source(req,ctx,item,session,stop)
                            except (RateLimited,AccessError):
                                stop.set()
                                raise
                            except (requests.RequestException,EHImageSourceError) as refresh_error:
                                last_error=refresh_error
                                break
                            if not fresh:
                                return
                            url=fresh
                            continue
                        time.sleep(ctx.retry_delay*(attempt+1))
                        offset=temporary.stat().st_size if temporary.is_file() and not repaired and not plugin else 0
                        if offset:
                            headers['Range']=f'bytes={offset}-'
                        else:
                            headers.pop('Range',None)
            if last_error:
                if eh_source and isinstance(last_error,(requests.RequestException,EHImageSourceError)):
                    raise eh_failed_page(index,last_error) from last_error
                raise last_error
            try:
                validate_file(temporary,source_ext)
                if repaired or (image_media and plugin and hasattr(plugin,'transform')):
                    with Image.open(temporary) as im:
                        im.load()
                        transformed=restore_jm(im,item.get('segments',0)) if repaired else im.copy()
                    if image_media and plugin and hasattr(plugin,'transform'):
                        from contextlib import redirect_stdout
                        with redirect_stdout(sys.stderr):
                            transformed=plugin.transform(transformed,clean(item),ctx)
                    transformed.save(temporary,format='PNG')
            except WorkerError:
                raise
            except Exception as exc:
                temporary.unlink(missing_ok=True)
                raise WorkerError(f'Page {index} was not a valid image or its repair failed: {exc}') from exc
        original_path='';enhancement=''
        if item_scale>1:
            originals=storage/'originals'
            originals.mkdir(exist_ok=True)
            original=originals/f'{index:04d}.{source_ext}'
            original.write_bytes(temporary.read_bytes())
            original_path=str(original)
            emit('source-retry',message=f'Enlarging page {index} with '+('waifu2x CUnet…' if method=='waifu2x' else 'Lanczos…'))
            try:enhancement=enlarge(original,temporary,item_scale,method,denoise,device)
            except (ValueError,RuntimeError,OSError) as exc:raise WorkerError(str(exc)) from exc
        if not legacy and destination.exists():
            owned=prior_ledger.get(str(index),{})
            if owned.get('name')!=destination.name or not owned.get('sha256'):
                raise WorkerError('A file with this name already exists and is not recorded for this task. No existing file was overwritten.')
            if file_hash(destination)!=owned['sha256']:
                conflicts=storage/'conflicts'
                conflicts.mkdir(exist_ok=True)
                with destination.open('rb') as source, (conflicts/f'{index:04d}-{time.time_ns()}-{destination.name}').open('xb') as saved:
                    shutil.copyfileobj(source,saved)
        if legacy or destination.exists():
            os.replace(temporary,destination)
        else:
            try:
                os.link(temporary,destination)
            except OSError as exc:
                if exc.errno not in (errno.EPERM,errno.EACCES,errno.ENOSYS,errno.EINVAL,errno.EXDEV,errno.ENOTSUP):
                    raise
                # Some removable or network filesystems do not support hard links.
                # Exclusive creation still prevents overwriting an existing file.
                created=False
                try:
                    with destination.open('xb') as output, temporary.open('rb') as source:
                        created=True
                        shutil.copyfileobj(source,output)
                        output.flush()
                        os.fsync(output.fileno())
                except BaseException:
                    if created:destination.unlink(missing_ok=True)
                    raise
            temporary.unlink()
        companions=[];preview_path='';media_note=''
        if item.get('ugoira'):
            timing=destination.with_suffix('.frames.json')
            timing.write_text(json.dumps({'format':'Pixiv ugoira','archive':destination.name,'frames':item['ugoira']},indent=2),encoding='utf-8')
            companion_paths=[timing]
            try:
                preview=destination.with_suffix('.webp')
                companion_paths=ugoira_preview(destination,item['ugoira'],preview)
                preview_path=str(preview)
            except (ValueError,OSError,KeyError) as exc:
                media_note='Original ugoira ZIP and timing saved. Playback conversion unavailable: '+str(exc)
            companions=[{'name':f.name,'bytes':f.stat().st_size,'sha256':file_hash(f)} for f in companion_paths]
        size=destination.stat().st_size
        with lock:
            ledger[str(index)]={'name':destination.name,'bytes':size,'sha256':file_hash(destination),'repaired':repaired,'upscale':item_scale,'original':Path(original_path).relative_to(folder).as_posix() if original_path else '','originalSha256':file_hash(original_path) if original_path else '','enhancement':enhancement,'mediaKind':media_kind,'preview':Path(preview_path).name if preview_path else '', 'companions':companions,'note':media_note}
            tmp=ledger_path.with_suffix('.tmp')
            tmp.write_text(json.dumps(ledger),encoding='utf-8')
            os.replace(tmp,ledger_path)
            state['done']+=1
            state['bytes']+=size
            if demo:
                state['received']+=size
            emit('file',path=str(destination),name=destination.name,index=index,bytes=size,repaired=repaired,upscale=item_scale,originalPath=original_path,enhancement=enhancement,mediaKind=media_kind,previewPath=preview_path,companions=companions,note=media_note)
            report(True)
    count=1 if req.get('mode')=='preview' else len(images)
    workers=max(1,min(50,int(req.get('workers',4))))
    errors=[]
    with futures.ThreadPoolExecutor(max_workers=workers) as pool:
        work=[pool.submit(get_one,i,images[i-1]) for i in range(1,count+1)]
        for future in futures.as_completed(work):
            try:
                future.result()
            except Exception as exc:
                stop.set()
                errors.append(exc)
                for other in work:
                    other.cancel()
    if errors:
        rate=next((e for e in errors if isinstance(e,RateLimited)),None)
        if rate:
            raise rate
        raise errors[0]
    emit('complete',preview=req.get('mode')=='preview',done=state['done'],total=total,folder=str(folder))

def search(req):
    ctx=Context(req)
    site=req['site']
    url=req['url']
    if req.get('plugin'):
        plugin=load_plugin(req['plugin'])
        if hasattr(plugin,'search'):
            from contextlib import redirect_stdout
            with redirect_stdout(sys.stderr):
                results=plugin.search(req.get('query',''),ctx)
            emit('results',results=clean(results))
            return
    # Bounded first-page search: never traverses a remote index indefinitely.
    response=ctx.fetch(url)
    doc=BeautifulSoup(response.text,'html.parser')
    pattern=re.compile(site['path'])
    found={}
    for a in doc.select('a[href]'):
        href=urljoin(url,a.get('href',''))
        parsed=urlparse(href)
        if parsed.hostname and any(parsed.hostname==d or parsed.hostname.endswith('.'+d) for d in site['domains']) and pattern.search(parsed.path):
            href=parsed._replace(query='',fragment='').geturl()
            title=a.get('title') or a.get_text(' ',strip=True)
            image=a.select_one('img')
            if not title and image:
                title=image.get('alt') or image.get('title') or ''
            if href not in found:
                found[href]={'url':href,'title':title or f"{site['name']} · {parsed.path.strip('/')}",'site':site['name']}
            elif title:
                found[href]['title']=title
        if len(found)>=100:
            break
    emit('results',results=list(found.values()))

def main():
    if hasattr(sys.stdout,'reconfigure'):
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    logging.basicConfig(stream=sys.stderr,level=logging.ERROR)
    try:
        req=json.loads(sys.stdin.readline())
        mode=req.get('mode','download')
        if mode=='inspect':
            emit('manifest',manifest=inspect_plugin(req['path']))
        elif mode=='diagnostics':
            from gallery_dl import version,extractor
            checks={}
            for row in req.get('checks',[]):
                ex=extractor.find(row['url'])
                checks[row['id']]=type(ex).__name__ if ex else None
            emit('diagnostics',engine=version.__version__,python=sys.version.split()[0],checks=checks)
        elif mode=='search':
            search(req)
        elif mode=='collect':
            from post_collection import collect
            collect(req,Context(req),emit)
        else:
            download(req)
    except RateLimited as exc:
        emit('error',message=str(exc),kind='rate_limit',retryAfter=exc.seconds)
        return 2
    except AccessError as exc:
        emit('error',message=str(exc),kind='access',challenge=exc.challenge)
        return 3
    except Exception as exc:
        message=str(exc) or type(exc).__name__
        # Cookies/tokens and raw response bodies never enter the UI log.
        emit('error',message=message[:600],kind='extractor')
        return 1
    return 0

if __name__=='__main__':
    raise SystemExit(main())
