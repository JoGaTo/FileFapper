"""Collect dated post links, without downloading their attachments."""
from datetime import date, datetime, timezone
import re
from urllib.parse import urlparse, parse_qs, urlencode, quote

def day(value):
    if isinstance(value, (int, float)):
        return datetime.fromtimestamp(value / 1000 if value > 10**11 else value, timezone.utc).date().isoformat()
    match = re.match(r'^(\d{4}-\d{2}-\d{2})', str(value or ''))
    if not match:
        return ''
    try:
        return date.fromisoformat(match[1]).isoformat()
    except ValueError:
        return ''

def date_range(req):
    start, end = str(req.get('dateFrom') or ''), str(req.get('dateTo') or '')
    if (start and day(start) != start) or (end and day(end) != end):
        raise ValueError('Use valid dates in YYYY-MM-DD format.')
    if start and end and start > end:
        raise ValueError('The start date must be on or before the end date.')
    return start, end

def in_range(value, start, end):
    value = day(value)
    return not (start or end) or bool(value and (not start or value >= start) and (not end or value <= end))

def collect(req, ctx, emit):
    start, end = date_range(req)
    parsed = urlparse(req['url']); root = f'{parsed.scheme}://{parsed.netloc}'
    site = req['siteId']; query = parse_qs(parsed.query)
    creator = site in ('pawchive', 'kemono')
    if site not in ('danbooru', 'aibooru', 'pawchive', 'kemono'):
        raise ValueError('This site uses collection from the loaded browser page.')
    cap = max(1, min(5000, int(req.get('maxGalleries', 500))))
    pages = max(1, min(200, int(req.get('extraPages', 10)) + 1))
    offset = max(0, int(query.get('o', [0])[0] or 0))
    page = max(1, int(query.get('page', [1])[0] or 1))
    rows = []; seen = set(); visited = set(); undated = 0; scanned = 0; next_url = None
    match = re.fullmatch(r'/([^/]+)/user/([^/]+)/?', parsed.path)
    if creator:
        if match:
            service, user = match.groups()
            endpoint = f'/api/v1/{quote(service, safe="")}/user/{quote(user, safe="")}' + ('/posts' if site == 'kemono' else '')
        elif parsed.path.rstrip('/') == '/posts':
            endpoint = '/api/v1/posts'
        else:
            raise ValueError('Open a creator profile or the site’s Posts listing to collect by date.')
    for batch in range(pages):
        if creator:
            params = {k: query[k][0] for k in ('q', 'tag') if k in query}
            params['o'] = offset
            data = ctx.fetch(root + endpoint, params=params, headers={'Accept': 'text/css'}).json()
            posts = data if isinstance(data, list) else data.get('posts', data.get('results', []))
        else:
            params = {'tags': query.get('tags', [''])[0], 'page': page, 'limit': 200}
            posts = ctx.fetch(root + '/posts.json', params=params).json()
        if not isinstance(posts, list):
            raise ValueError('The site returned an unexpected post listing. Sign in and sync cookies if needed.')
        identities = tuple(str((p.get('post') or p).get('id')) for p in posts)
        if identities in visited or not posts:
            next_url = None
            break
        visited.add(identities)
        for wrapper in posts:
            post = wrapper.get('post') or wrapper
            ident = str(post.get('id') or '')
            published = day(post.get('published') or post.get('created_at') or post.get('added'))
            scanned += 1
            if not published:
                undated += 1
            if not ident or not in_range(published, start, end):
                continue
            if creator:
                service = str(post.get('service') or (match[1] if match else ''))
                user = str(post.get('user') or (match[2] if match else ''))
                if not service or not user:
                    continue
                url = f'{root}/{quote(service, safe="")}/user/{quote(user, safe="")}/post/{quote(ident, safe="")}'
            else:
                url = f'{root}/posts/{quote(ident, safe="")}'
            if url in seen:
                continue
            seen.add(url)
            rows.append({'url': url, 'title': str(post.get('title') or post.get('tag_string') or f'Post {ident}')[:500], 'date': published})
            if len(rows) >= cap:
                break
        # A partial batch must be revisited; the queue deduplicates previously selected links.
        limited = len(rows) >= cap
        next_query = {k: v[0] for k, v in query.items()}
        if creator:
            offset += 0 if limited else len(posts)
            next_query['o'] = offset
        else:
            page += 0 if limited else 1
            next_query['page'] = page
        next_url = parsed._replace(query=urlencode(next_query), fragment='').geturl()
        if len(posts) < (50 if creator else 200) and not limited:
            next_url = None
        emit('collection', rows=rows, pages=batch + 1, scanned=scanned, undated=undated, next=next_url, running=True)
        if limited or next_url is None:
            break
    emit('collection', rows=rows, pages=batch + 1, scanned=scanned, undated=undated, next=next_url, running=False,
         message=f'{len(rows)} dated post links ready. {scanned} posts checked.' + (f' {undated} posts have no usable date.' if undated else ''))
