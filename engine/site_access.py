"""Recognize access pages before treating them as an empty gallery."""
import re
import json
from urllib.parse import urlparse
from bs4 import BeautifulSoup

class WorkerError(Exception):
    pass

class AccessError(WorkerError):
    def __init__(self, message, challenge=False):
        self.challenge = challenge
        super().__init__(message)

CHALLENGE_MESSAGE = ('The site is showing a CAPTCHA or browser access check. '
    'Downloads for this site are paused. Open it in Browser, complete the check, '
    'then choose Sync & resume. If the check keeps repeating, use your regular '
    'browser and import its cookies; some checks do not accept embedded browsers or downloader connections.')

def _visible(node):
    # Server-side HTML has no computed layout. Honor explicit hiding/locking
    # attributes and inline styles without executing the site's JavaScript.
    for parent in (node, *node.parents):
        if not hasattr(parent, 'attrs'):
            continue
        if any(parent.has_attr(name) for name in ('hidden', 'inert')):
            return False
        if str(parent.get('aria-hidden', '')).lower() == 'true':
            return False
        style = str(parent.get('style', ''))
        if re.search(r'(?:^|;)\s*(?:display\s*:\s*none\b|visibility\s*:\s*(?:hidden|collapse)\b)', style, re.I):
            return False
    return True


def _unlocked(node):
    return not any(str(parent.get('data-reader-locked', '')).lower() in ('1', 'true')
                   for parent in (node, *node.parents) if hasattr(parent, 'attrs'))


def _source(value):
    if not isinstance(value, str) or not value.strip():
        return False
    value = value.strip()
    if value.startswith('#') or re.match(r'^(?:data|blob|javascript|about):', value, re.I):
        return False
    parsed = urlparse(value)
    if parsed.scheme and parsed.scheme.lower() not in ('http', 'https'):
        return False
    if parsed.username or parsed.password or not parsed.path.strip('/'):
        return False
    return not re.search(r'(?:^|[/_.-])(?:placeholder|spacer|blank|loading|loader|spinner|transparent|pixel|1x1|noimage)(?:[/_.-]|$)', parsed.path, re.I)


def _image(node):
    if not _visible(node) or not _unlocked(node):
        return False
    for dimension in ('width', 'height'):
        value = str(node.get(dimension, '')).strip()
        if value.isdigit() and int(value) <= 1:
            return False
    for name in ('data-original', 'data-full-url', 'data-lazy-src', 'data-src', 'src'):
        value = node.get(name)
        if _source(value):
            path = urlparse(value.strip()).path
            if '/media/photos/' in path or re.search(r'\.(?:jpe?g|png|gif|webp|avif|bmp)$', path, re.I):
                return True
    return False


def _readable_reader(doc):
    # The JM selectors are the same image nodes used by the download adapter.
    if any(_image(node) for node in doc.select('img[id^="album_photo"],img[data-original*="/media/photos/"],img[data-reader-image],.reading-content img')):
        return True
    for node in doc.select('script[data-reader-data]'):
        if not _visible(node) or not _unlocked(node):
            continue
        try:
            images = json.loads(node.get_text()).get('images')
            if isinstance(images, list) and any(_source(value) for value in images):
                return True
        except (ValueError, TypeError, AttributeError):
            pass
    for node in doc.select('#readerApp'):
        if _visible(node) and _unlocked(node) and _source(node.get('data-reader-image-base')):
            return True
    return False


def classify_html(source):
    """Return access/readable evidence; an image never overrides a real gate."""
    doc = BeautifulSoup(source[:2_000_000], 'html.parser')
    title = doc.title.get_text(' ', strip=True) if doc.title else ''
    challenge_title = re.search(r'\bcaptcha\b|^(?:just a moment|checking your browser|attention required|security verification|verify (?:you are|that you are) human)', title, re.I)
    challenge_form = any(_visible(node) for node in doc.select('#challenge-running,#challenge-form,form[action*="/cdn-cgi/challenge"],form[action*="captcha"]'))
    blocked_title = re.fullmatch(r'(?:access denied|(?:sorry[, ]+)?you have been blocked|403[ -]+forbidden|forbidden)[.! ]*(?:\s*[-|–—]\s*Cloudflare)?', title, re.I)
    blocked_body = any(_visible(node) and re.search(r'sorry,? you have been blocked|access denied|error (?:code[: ]*)?1020', node.get_text(' ', strip=True), re.I)
                       for node in doc.select('#cf-error-details'))
    if blocked_title or blocked_body:
        return {'kind': 'access', 'readable': False, 'reason': 'blocked', 'challenge': False, 'message': 'The site has blocked this connection. Open the site in your regular browser or contact the site for access.'}
    if challenge_title or challenge_form:
        return {'kind': 'access', 'readable': False, 'reason': 'verification', 'challenge': True, 'message': CHALLENGE_MESSAGE}
    locked = any(_visible(node) and str(node.get('data-reader-locked', '')).lower() in ('1', 'true') for node in doc.select('#readerApp'))
    signin = re.search(r'^(?:log[ -]?in|sign[ -]?in|member(?:\s+login)?)\b', title, re.I) and any(_visible(node) for node in doc.select('input[type="password"]'))
    if locked or signin:
        return {'kind': 'access', 'readable': False, 'reason': 'signin', 'challenge': False, 'message': 'This reader requires account access. Sign in in Browser, then choose Sync & resume.'}
    return {'kind': 'ok', 'readable': _readable_reader(doc)}


def check_html(source):
    status = classify_html(source)
    if status['kind'] == 'access':
        raise AccessError(status['message'], challenge=status.get('challenge', False))

