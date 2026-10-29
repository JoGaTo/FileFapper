# Writing a FileFapper site script — API 1

FileFapper accepts a single UTF-8 Python .py file. Scripts run in the packaged Python worker. requests, BeautifulSoup 4, Pillow, gallery_dl, and the Python standard library are available. Additional third-party dependencies require rebuilding the worker; imports do not install packages automatically.

Start with examples/example_site.py. Import the file in Sites & scripts → Import Python script. FileFapper reads MANIFEST using ast.literal_eval before importing executable code. You review the domains and explicitly trust the file. Import another file with the same id to replace a registered version. Disable or remove it to return to the built-in adapter. The old source copy is retained in the local scripts folder so an update does not destroy your work.

Required literal manifest:

    MANIFEST = {
        'api': 1,
        'id': 'my_site',
        'name': 'My Site',
        'version': '1.0.0',
        'domains': ['gallery.example.com'],
    }

id uses lowercase a-z, 0-9, underscores, or hyphens. domains is a list of hosts without protocol, path, port, or wildcard. Subdomains of a declared domain also match. To update E-Hentai, declare e-hentai.org; for ExHentai add exhentai.org. Imported enabled scripts take precedence over built-in profiles. Give different scripts different ids.

Required entry point:

    def resolve(url, context):
        response = context.get(url)
        return {
            'title': 'A gallery title',
            'metadata': {'artist': 'Example', 'tags': ['sample']},
            'images': [
                'https://cdn.example.com/page1.jpg',
                {'url': 'https://cdn.example.com/page2.jpg'},
            ],
        }

Return one gallery with a nonempty images list. URLs must be HTTP/HTTPS. Relative URLs should be resolved with urllib.parse.urljoin(url, relative_url). The worker validates supported media files, assigns numbered filenames, writes gallery.json, and maintains the resume ledger. Return images in their reading order. A maximum of 50,000 files is allowed per task.

context.get(url, **kwargs) / context.fetch(url, **kwargs): a paced Requests GET with timeout, scoped login cookies, User-Agent and Referer. It raises an actionable exception for HTTP access denial or server cooldown. A 429/509 response stops work and reports Retry-After. Use it for page extraction. Do not disable TLS validation, remove pacing, conceal rate-limit responses, or add proxy/account rotation.

context.session: the Requests session, including cookies scoped to the source gallery’s domain. Cookies remain domain/path/secure scoped for CDN requests. context.request: read-only by convention; contains the task request (quality, workers, options, etc.). No separate password store is present. A plugin is trusted executable code and can read its process memory and the Windows account’s files.

Optional per-image keys:

    {
        'url': 'https://cdn.example.com/page.jpg',
        'extension': 'jpg',
        '_http_headers': {'Referer': 'https://gallery.example.com/read/1'},
        'segments': 10,
        'photo_id': '123456',
    }

extension is a supported media extension. In 1.0.0-Alpha video, audio, archive and document types listed in USER-GUIDE.md are also accepted. Unknown extensions are rejected. Repair/transform/enlargement applies to image items; media attachments stay intact. Headers apply to that image request. segments selects the built-in JM-compatible reverse-horizontal-strip restoration when repair is enabled. Leave it out for ordinary pages. JPEG originals are saved unchanged unless an image repair/transform is requested.

Optional transform function for other image layouts:

    def transform(image, image_metadata, context):
        # image is a loaded Pillow Image; return a Pillow Image.
        return image

It runs after JM strip restoration if segments is also specified. Transform output is saved losslessly as PNG. It can be called concurrently by multiple image workers: avoid mutable shared state, or protect it with a threading.Lock. A transform exception fails that page/task and preserves other completed files. No downloaded source image is marked complete until image validation and transformation succeed.

For tiles, use image.crop((left, top, right, bottom)) and result.paste(tile, (x, y)). Compute the tile order from the gallery’s public rendering metadata. If the algorithm changes, raise a clear error until it can be updated instead of saving unreadable pages.

Optional search override:

    def search(query, context):
        return [
            {'title': 'Result title',
             'url': 'https://gallery.example.com/gallery/1'},
        ]

This overrides the result parser when a plugin matches a site in the built-in Discover & search selector. A completely new site can already download gallery URLs; adding it to the built-in search dropdown currently requires editing app/sites.json and rebuilding. Unknown sites remain accessible through Browser. Search returns at most 100 displayed results.

Import/update workflow:

1. Copy and rename example_site.py outside the app folder.
2. Fill in your exact hosts and gallery selectors.
3. Use a non-sensitive gallery you can access to verify page order and metadata.
4. Import the .py file, review the host list, then choose Trust and import.
5. Add a gallery URL, fetch a preview, and inspect the first page.
6. Increment version, import again, and resume failed tasks when updating.

Development testing:

Run the engine with Python, write a JSON request followed by a newline to stdin, and read JSON event lines from stdout. The tests in tests/test_engine.py show a local HTTP fixture and a working script, including access cookies and cooldown behavior. mode: inspect parses the manifest without running it. mode: preview downloads only the first page and finishes paused in the UI. mode: download downloads the gallery.

Example request (use your own absolute output path and task id):

    {
        'mode': 'download',
        'id': 'local-test-001',
        'url': 'https://gallery.example.com/gallery/1',
        'siteId': 'my_site',
        'downloadDir': 'D:/Galleries',
        'plugin': 'D:/Scripts/my_site.py',
        'quality': 'resampled',
        'workers': 2,
        'delay': 0.6,
        'speedLimit': 0,
        'repair': True,
        'cookies': []
    }

Standard events: metadata, progress, file, complete, error. Metadata may arrive before the folder is ready. file includes index, path, name, bytes and repaired. error includes kind and message; rate_limit includes retryAfter seconds. A task is complete only after all requested pages have been saved successfully.

The worker is not a security sandbox. Plugin subprocesses cannot crash the UI directly, but a malicious Python script has your ordinary file/network permissions. The manifest validation and trust prompt do not certify a script. Keep credentials out of source files and metadata. Do not print cookie values. Plugin print output goes to stderr and is not displayed in the UI.


## Mixed media and ugoira in 1.0.0-Alpha

The legacy images list name remains compatible and now holds ordered media descriptors. Use an explicit extension when a URL has no filename:

    return {
        'title': 'Mixed media example',
        'images': [
            {'url': 'https://cdn.example.com/page.png'},
            {'url': 'https://cdn.example.com/file?id=123', 'extension': 'mp4'},
            {'url': 'https://cdn.example.com/recording.flac'},
            {'url': 'https://cdn.example.com/attachments.zip'},
        ],
    }

Do not return executable files or error pages. Archives are saved intact, never automatically extracted. Each media file counts as one progress item. Completed hashes/types are stored in the ledger. Native video/audio preview depends on Chromium's codecs; other files can be opened in Windows.

An ugoira descriptor provides the original ZIP URL and frame names/delays:

    {
        'url': 'https://i.pximg.net/example_ugoira.zip',
        'extension': 'zip',
        'ugoira': [
            {'file': '000000.jpg', 'delay': 60},
            {'file': '000001.jpg', 'delay': 120},
        ],
        '_http_headers': {'Referer': 'https://www.pixiv.net/artworks/123'},
    }

The worker keeps the ZIP, writes timing JSON and builds a looping lossless WebP with individual delays. Bare frame filenames only; members are read in memory without path extraction. The guide's conversion bounds apply. ZIP/timing survives conversion failure/limits.

Browser date collection is separate from resolve(). A download script returns one task's ordered files, not the browser's link review. A new site needing date collection requires a collector adapter as well as its download script. No date bounds means undated results must not be silently discarded.
