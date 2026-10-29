"""Current reader manifests. Parse data; never execute website JavaScript."""
import json
import re
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
from site_access import WorkerError, AccessError, check_html

MIRRORS = {'hentaienvy', 'hentairox', 'hentaizap', 'hentaifox', 'hentaiera', 'imhentai'}
READER_SITES = {'hentaihere', 'hentai2read', 'hentaihand', *MIRRORS}

def web_url(value, base):
    if not isinstance(value, str) or not value.strip():
        raise WorkerError('The reader contains an invalid page address. No files were saved.')
    result = urljoin(base, value)
    parsed = urlparse(result)
    if parsed.scheme not in ('https', 'http') or not parsed.hostname or parsed.username or parsed.password:
        raise WorkerError('The reader contains an invalid page address. No files were saved.')
    return result

def payload(node):
    if node is None:
        return None
    try:
        text = node.get('data-page') if node.name != 'script' else node.get_text()
        if len(text or '') > 8_000_000:
            raise ValueError()
        return json.loads(text)
    except (ValueError, TypeError):
        raise WorkerError('The site returned an unreadable reader manifest. Update the adapter or use Browser.') from None

def chapter_manifest(source, url, site):
    check_html(source)
    doc = BeautifulSoup(source, 'html.parser')
    data = payload(doc.select_one('script[data-reader-data]'))
    if data is None:
        app = payload(doc.select_one('script[data-page="app"],div[data-page]'))
        if isinstance(app, dict) and app.get('component') in ('Reader/Show', 'Reader'):
            data = app.get('props')
    if data is None:
        return None
    images = data.get('images') if isinstance(data, dict) else None
    if not isinstance(images, list) or not images or len(images) > 50000:
        raise WorkerError('The chapter did not expose a complete page list. Open its chapter reader in Browser.')
    pages = [{'url': web_url(image, url), '_http_headers': {'Referer': url}} for image in images]
    if len({p['url'] for p in pages}) != len(pages):
        raise WorkerError('The chapter returned duplicate pages. No incomplete gallery was saved.')
    book = data.get('book') or {}
    chapter = data.get('chapter') or {}
    chapter_label = chapter.get('label') if isinstance(chapter, dict) else chapter
    title = book.get('title') or (doc.title.get_text(' ', strip=True) if doc.title else site)
    if chapter_label and isinstance(chapter_label, str):
        title += ' · ' + chapter_label
    return {'title': title, 'images': pages, 'metadata': {'site': site, 'adapter': 'FileFapper reader manifest',
        'book_id': book.get('id'), 'chapter': chapter_label or book.get('chapter'), 'count': len(pages), 'source': url}}

def mirror_manifest(source, url, site):
    check_html(source)
    doc = BeautifulSoup(source, 'html.parser')
    reader = doc.select_one('#readerApp')
    if reader is None:
        return None
    if reader.get('data-reader-locked') == '1':
        raise AccessError('This gallery reader requires account access. Open it in Browser, sign in, then choose Sync & resume.')
    data = payload(doc.select_one('script#readerPagesJson[type="application/json"]'))
    try:
        total = int(reader.get('data-reader-total', '0'))
        if not isinstance(data, list) or not 1 <= total <= 50000 or len(data) != total:
            raise ValueError()
        numbers = [int(p['page']) for p in data]
        if len(set(numbers)) != total or set(numbers) != set(range(1, total + 1)):
            raise ValueError()
        base = web_url(reader.get('data-reader-image-base'), url).rstrip('/')
        base_parts = urlparse(base)
        if base_parts.query or base_parts.fragment:
            raise ValueError()
        pages = []
        for item in sorted(data, key=lambda p: int(p['page'])):
            ext = str(item.get('ext', '')).lower()
            if ext not in ('jpg', 'jpeg', 'png', 'webp', 'avif', 'gif'):
                raise ValueError()
            pages.append({'url': f"{base}/{int(item['page'])}.{ext}", 'extension': ext,
                'width': int(item.get('width') or 0), 'height': int(item.get('height') or 0),
                '_http_headers': {'Referer': url}})
    except (ValueError, TypeError, KeyError):
        raise WorkerError('The reader did not provide a complete, ordered gallery manifest. No thumbnail substitutes were saved.') from None
    return {'title': reader.get('data-reader-seo-title') or (doc.title.get_text(' ', strip=True) if doc.title else site),
        'images': pages, 'metadata': {'site': site, 'adapter': 'FileFapper reader manifest', 'count': total,
        'gallery_id': reader.get('data-reader-id'), 'source': url}}

def resolve(req, ctx, legacy):
    site, url = req['siteId'], req['url']
    path = urlparse(url).path
    if site == 'hentaihand':
        match = re.fullmatch(r'/(?:[a-z]{2}/)?comic/([\w-]+)/?', path)
        if not match:
            raise WorkerError('Open an individual HentaiHand comic address.')
        root = urlparse(url)._replace(path='', query='', fragment='').geturl().rstrip('/')
        api = root + '/api/comics/' + match[1]
        info = ctx.fetch(api).json()
        data = ctx.fetch(api + '/images').json()
        images = data.get('images') or []
        if not images:
            raise AccessError('HentaiHand returned no pages for this account. Open the comic in Browser, sign in if required, then sync its cookies.')
        if data.get('next_chapter'):
            raise WorkerError('This HentaiHand comic spans multiple chapters. Open an individual chapter in Browser; this adapter does not silently save only its first chapter.')
        pages = []
        for item in sorted(images, key=lambda i: int(i.get('page') or 0)):
            pages.append({'url':web_url(item.get('source_url'), url), '_http_headers':{'Referer':url}})
        category, language = info.get('category') or {}, info.get('language') or {}
        return {'title':info.get('title') or 'HentaiHand comic', 'images':pages, 'metadata':{'site':site,
            'gallery_id':info.get('id'), 'type':category.get('name'), 'language':language.get('name'),
            'tags':[t.get('slug') or t.get('name') for t in info.get('tags') or []],
            'date':info.get('uploaded_at'), 'count':len(pages), 'adapter':'FileFapper comic API'}}
    if site not in MIRRORS:
        if not path.startswith('/reader/'):
            # Older chapter addresses can redirect into the new reader.
            response = ctx.fetch(url)
            result = chapter_manifest(response.text, getattr(response, 'url', url), site)
            return result if result is not None else legacy(req, ctx)
        if not re.fullmatch(r'/reader/[^/]+/\d+(?:/page-\d+)?/?', path):
            raise WorkerError('This reader address is missing a chapter ID or points outside a chapter. Open the title in Browser, select a chapter, and queue its full /reader/title/CHAPTER/page-1 address. Signing in does not repair a missing page (HTTP 404).')
        result = chapter_manifest(ctx.fetch(url).text, url, site)
    else:
        match = re.fullmatch(r'/(?:gallery|view|g)/(\d+)(?:/\d+)?/?', path)
        if not match:
            raise WorkerError('Open an individual /gallery/ID/ or /g/ID/PAGE/ reader address.')
        source = ctx.fetch(url).text
        result = mirror_manifest(source, url, site)
        if result is None:
            doc = BeautifulSoup(source, 'html.parser')
            # Follow only an actual same-origin reader link for this gallery.
            target = None
            for a in doc.select('#js-thumbs-grid a[href],a[href]'):
                try:
                    candidate = web_url(a['href'], url)
                except WorkerError:
                    continue
                if candidate and urlparse(candidate).netloc == urlparse(url).netloc and re.fullmatch(r'/g/' + match[1] + r'/1/?', urlparse(candidate).path):
                    target = candidate
                    break
            if target:
                result = mirror_manifest(ctx.fetch(target).text, target, site)
            elif doc.select_one('input[type="password"]') and not doc.select_one('#js-thumbs-grid'):
                raise AccessError('This page requires account access. Sign in in Browser, then choose Sync & resume.')
            else:
                # Older gallery-dl layouts remain supported until migrated.
                result = None
            if result is None:
                parsed=urlparse(url)
                gallery=parsed._replace(path=f'/gallery/{match[1]}/',query='',fragment='').geturl()
                return legacy({**req,'url':gallery},ctx)
    if result is None:
        raise WorkerError('This chapter reader did not expose a page manifest. Open a chapter in Browser; its layout may need an adapter update.')
    return result
