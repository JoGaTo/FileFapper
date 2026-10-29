"""Import this file in D&F > Sites & scripts. Change the domain and selectors."""
from urllib.parse import urljoin
from bs4 import BeautifulSoup

MANIFEST = {
    'api': 1,
    'id': 'my_gallery_site',
    'name': 'My Gallery Site',
    'version': '1.0.0',
    'domains': ['gallery.example.com'],
}

def resolve(url, context):
    """Return one gallery. context.get provides site cookies and request pacing."""
    response = context.get(url)
    doc = BeautifulSoup(response.text, 'html.parser')
    heading = doc.select_one('h1')
    images = []
    for node in doc.select('.gallery-page img'):
        source = node.get('data-original') or node.get('data-src') or node.get('src')
        if source:
            images.append({'url': urljoin(url, source)})
    if not images:
        raise ValueError('No gallery pages found. Check the page selectors or your login.')
    return {
        'title': heading.get_text(' ', strip=True) if heading else 'My Gallery',
        'metadata': {'site': MANIFEST['name'], 'tags': []},
        'images': images,
    }

# Optional: edit decoded pixels before saving. D&F saves transformed files as PNG.
# def transform(image, image_metadata, context):
#     return image

# Optional: override the built-in first-page search for a supported site.
# def search(query, context):
#     return [{'title': 'Example gallery', 'url': 'https://gallery.example.com/gallery/1'}]
