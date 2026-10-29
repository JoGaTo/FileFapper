"""FileFapper's native image readers. Never evaluate code returned by a site."""
import base64
import json
import re
from urllib.parse import urljoin, urlparse, parse_qs
from bs4 import BeautifulSoup

from expanded_readers import SITES as EXTRA_SITES, resolve as resolve_extra

NATIVE_SITES = EXTRA_SITES | {'comix','pixiv','doujinhentai','ikuhentai','toonkor','blacktoon',
                'danbooru','aibooru','tbib','gelbooru','rule34','r34app','kurosearch','r34react','yandere'}
SELECTORS = {
    'comix':'[data-page] img, .reader img, .chapter-page img',
    'doujinhentai':'#vertical-pages-container img, .single-page-mode img.manga-image',
    'ikuhentai':'.reading-content img',
    'toonkor':'#toon_img img, .toon-content img',
    'blacktoon':'#toon_content_imgs img',
    'gelbooru':'img#image', 'tbib':'img#image', 'rule34':'img#image', 'r34app':'img#image',
    'kurosearch':'img#image', 'r34react':'img#image', 'yandere':'img#image',
}

def http_url(value, base):
    if not value: return None
    url = urljoin(base, str(value or '').strip())
    p = urlparse(url)
    return url if p.scheme in ('http','https') and p.hostname and not p.username and not p.password else None

def parse_reader(site, html, url, image_host=''):
    """Parse ordered page nodes and data, without ever running site's scripts."""
    doc = BeautifulSoup(html, 'html.parser')
    images = []
    if site == 'toonkor':
        m = re.search(r'''\btoon_img\s*=\s*['"]([A-Za-z0-9+/=\s]+)['"]''', html)
        if m:
            try:
                decoded = base64.b64decode(m[1], validate=False).decode('utf-8')
                doc_pages = BeautifulSoup(decoded, 'html.parser')
                images += [x.get('src') for x in doc_pages.select('img[src]')]
            except (ValueError, UnicodeError):
                pass
    if site == 'doujinhentai':
        m = re.search(r'\b(?:const|let|var)\s+pageUrls\s*=\s*(\{[^;]+\})', html)
        if m:
            try:
                pages = json.loads(m[1])
                images += [pages[k] for k in sorted(pages, key=lambda k:int(k))]
            except (ValueError, TypeError):
                pass
    if site == 'comix':
        node = doc.select_one('script#initial-data')
        if node:
            try:
                def walk(value, depth=0):
                    if depth > 30: return
                    if isinstance(value, dict):
                        for k,v in value.items():
                            if k in ('images','pages') and isinstance(v,list):
                                for item in v:
                                    if isinstance(item,str): images.append(item)
                                    elif isinstance(item,dict): images.append(item.get('url') or item.get('src'))
                            elif isinstance(v,(list,dict)): walk(v,depth+1)
                    elif isinstance(value,list):
                        for item in value: walk(item,depth+1)
                walk(json.loads(node.string or node.get_text()))
            except ValueError:
                pass
    if not images:
        for node in doc.select(SELECTORS.get(site,'img#image')):
            value = next((node.get(a) for a in ('data-original','data-lazy-src','data-src','o_src','src') if node.get(a) and not node.get(a).startswith('data:')), None)
            if site == 'blacktoon' and value and not urlparse(value).netloc:
                value = urljoin(image_host.rstrip('/')+'/',value.lstrip('/')) if image_host else None
            if value: images.append(value)
    # Booru pages often offer a separate full-size file.
    if site in ('gelbooru','tbib','rule34','r34app','kurosearch','r34react','yandere'):
        media=doc.select_one('video source[src], video[src], audio source[src], audio[src]')
        if media: images=[media.get('src')]
        original = doc.select_one('a#highres, a#image-download-link, a[download]')
        if not original:
            original = next((a for a in doc.select('a[href]') if a.get_text(strip=True).lower() in ('original image','original','download original')), None)
        if original: images = [original.get('href')]
    unique = list(dict.fromkeys(u for value in images if (u:=http_url(value,url))))
    title_node = doc.select_one('h1') or doc.title
    return {'title':title_node.get_text(' ',strip=True) if title_node else site,
            'images':[{'url':u} for u in unique], 'metadata':{'site':site,'adapter':'FileFapper native','source':url}}

def pixiv(req, ctx):
    url = req['url']; root='https://www.pixiv.net'
    ctx.session.headers['Referer']=root+'/'
    match=re.search(r'/(artworks|users)/(\d+)',url)
    if not match: raise ValueError('Use a Pixiv artwork or user URL.')
    kind,ident=match.groups()
    def body(endpoint):
        response=ctx.fetch(root+endpoint).json()
        if response.get('error'): raise ValueError('Pixiv: '+str(response.get('message') or 'Sign in and sync site cookies.'))
        return response.get('body') or {}
    ids=[ident]
    if kind=='users':
        profile=body(f'/ajax/user/{ident}/profile/all')
        ids=sorted(set((profile.get('illusts') or {}).keys())|set((profile.get('manga') or {}).keys()),key=int,reverse=True)[:int(req.get('maxPosts',50))]
    images=[]; posts=[]
    for illust in ids:
        info=body(f'/ajax/illust/{illust}')
        if info.get('illustType')==2:
            animation=body(f'/ajax/illust/{illust}/ugoira_meta')
            source=http_url(animation.get('originalSrc') or animation.get('src'),root)
            if not source or not animation.get('frames'):
                raise ValueError('Pixiv did not return its ugoira ZIP and frame timing. Check your cookies.')
            images.append({'url':source,'extension':'zip','mediaKind':'animation','ugoira':animation['frames'],
                           'artwork_id':illust,'_http_headers':{'Referer':f'{root}/artworks/{illust}'}})
            posts.append({'id':illust,'title':info.get('title'),'artist':info.get('userName'),'animation':'ugoira'})
            if req.get('mode')=='preview': break
            continue
        for page in body(f'/ajax/illust/{illust}/pages'):
            image_url=http_url(page.get('urls',{}).get('original'),root)
            if image_url: images.append({'url':image_url,'_http_headers':{'Referer':root+'/'}})
        posts.append({'id':illust,'title':info.get('title'),'artist':info.get('userName')})
        if req.get('mode')=='preview' and images: break
    title=posts[0]['title'] if len(ids)==1 and posts else f'Pixiv user {ident}'
    return {'title':title,'images':images,'metadata':{'site':'Pixiv','posts':posts,'animation':'Ugoira: original ZIP, timing JSON and animated WebP'}}

def resolve(req, ctx):
    site=req['siteId'];url=req['url'];cap=int(req.get('maxPosts',50))
    if site in EXTRA_SITES:return resolve_extra(req,ctx)
    if site in ('r34app','kurosearch','r34react'):
        parsed=urlparse(url);query=parse_qs(parsed.query)
        provider=re.match(r'/posts?/([^/]+)',parsed.path)
        board=next((query[key][0] for key in ('source','site','booru') if query.get(key)),None)
        if not board and provider and not provider[1].isdigit():board=provider[1]
        if site=='r34app' and board and board!='rule34.xxx':
            raise ValueError('Open this source in Browser and choose Queue rendered pages. Direct R34.app post links currently use Rule34 as their source.')
        if parsed.fragment:
            fragment=urlparse(parsed.fragment)
            query.update(parse_qs(fragment.query))
        ident=next((query.get(key,[''])[0] for key in ('id','post','postId') if query.get(key,[''])[0].isdigit()),None)
        if not ident:
            match=re.search(r'/(?:posts?|view)/(?:rule34\.xxx/)?(\d+)(?:/|$)',parsed.path+'/'+parsed.fragment)
            if match:ident=match[1]
        if not ident:
            raise ValueError('Open a post in this site’s Browser tab and choose Queue rendered pages, or paste its original Rule34 post link. Search pages can be collected with Queue galleries when post links are present.')
        original=f'https://rule34.xxx/index.php?page=post&s=view&id={ident}'
        result=resolve({**req,'siteId':'rule34','url':original},ctx)
        for image in result['images']:image['_http_headers']={'Referer':original}
        result['metadata'].update(frontend=site,frontend_url=url,source=original)
        return result
    if site=='pixiv': return pixiv(req,ctx)
    if site in ('danbooru','aibooru'):
        m=re.search(r'/(posts|pools)/(\d+)',url)
        if not m: raise ValueError('Use a Danbooru post or pool URL.')
        kind,ident=m.groups();root=f'{urlparse(url).scheme}://{urlparse(url).netloc}'
        info=ctx.fetch(f'{root}/{kind}/{ident}.json').json()
        posts=[info] if kind=='posts' else [ctx.fetch(f'{root}/posts/{i}.json').json() for i in info.get('post_ids',[])[:cap]]
        images=[{'url':p['file_url'],'extension':p.get('file_ext')} for p in posts if p.get('file_url')]
        return {'title':info.get('name') or f'Danbooru {ident}','images':images,'metadata':{'site':'Danbooru','id':ident,'posts':[p.get('id') for p in posts]}}
    if site in ('gelbooru','tbib','rule34'):
        qs=parse_qs(urlparse(url).query)
        if qs.get('s')!=['view'] or not qs.get('id',[''])[0].isdigit(): raise ValueError('Use an individual post URL with s=view and id=… .')
    html=ctx.fetch(url).text
    image_host=''
    if site=='blacktoon':
        root=f'{urlparse(url).scheme}://{urlparse(url).netloc}'
        config=ctx.fetch(root+'/data/config.js').text
        match=re.search(r'''(?:var\s+)?img_domain\s*=\s*['"]([^'"]+)['"]''',config)
        image_host=http_url(match[1],url) if match else ''
    result=parse_reader(site,html,url,image_host)
    if not result['images']:
        raise ValueError('No chapter pages found. Open an individual chapter in Browser, let its reader load, then choose “Queue rendered pages”. Sign in there if required.')
    return result
