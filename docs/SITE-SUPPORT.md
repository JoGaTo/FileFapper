# FileFapper v1.0 site support

FileFapper's current local catalog includes 50 active profiles. This release packages the current source catalog; it does not constitute a fresh live-site audit. An installed adapter is not a guarantee that every live gallery is reachable. Earlier verification used extractor matching, synthetic reader fixtures, local HTTP pages and the dated public metadata audit in SITE-CHECK-2026-10-20.md; personal account cookies and authenticated live galleries were not used. Layouts, mirrors and access rules can change.

| Site | Reader integration | Notes |
|---|---|---|
| E-Hentai | gallery-dl 1.32.17 | Resampled or authorized originals; account image points and server limits apply. |
| ExHentai | gallery-dl 1.32.17 | Authorized login required; resampled or original files. |
| nhentai | gallery-dl 1.32.17 | Gallery / chapter URLs; first-page HTML search. |
| Hitomi.la | gallery-dl 1.32.17 | Gallery / chapter URLs; interactive Browser search. |
| HentaiFox | FileFapper reader manifest + legacy gallery-dl | Gallery/view and direct /g/ID/PAGE/ addresses; full page manifest where available; legacy layouts retained. |
| Hentai2Read | FileFapper chapter manifest + legacy gallery-dl | Current /reader/BOOK/CHAPTER/page-1 addresses and older chapters; interactive Browser search. |
| HentaiHere | FileFapper chapter manifest + legacy gallery-dl | Current /reader/BOOK/CHAPTER/page-1 addresses and older chapters; interactive Browser search. |
| HentaiNexus | gallery-dl 1.32.17 | Gallery / chapter URLs; first-page HTML search. |
| IMHentai | FileFapper reader manifest + legacy gallery-dl | Gallery/view and direct /g/ID/PAGE/ addresses; full page manifest where available; legacy layouts retained. |
| HentaiEra | FileFapper reader manifest + legacy gallery-dl | Gallery/view and direct /g/ID/PAGE/ addresses; full page manifest where available; legacy layouts retained. |
| HentaiEnvy | FileFapper reader manifest + legacy gallery-dl | Gallery/view and direct /g/ID/PAGE/ addresses; full page manifest where available; legacy layouts retained. |
| HentaiRox | FileFapper reader manifest + legacy gallery-dl | Gallery/view and direct /g/ID/PAGE/ addresses; full page manifest where available; legacy layouts retained. |
| HentaiZap | FileFapper reader manifest + legacy gallery-dl | Gallery/view and direct /g/ID/PAGE/ addresses; full page manifest where available; legacy layouts retained. |
| HentaiHand | FileFapper comic API | Single-chapter comics; absent language/category handled; multi-chapter responses identified instead of truncated. |
| Simply Hentai | gallery-dl 1.32.17 | Gallery / chapter URLs; interactive Browser search. |
| My Hentai Gallery | gallery-dl 1.32.17 | Gallery / chapter URLs; interactive Browser search. |
| TMOHentai | Retired from active choices | DNS lookup failed on October 21; permanent closure unconfirmed. Existing saved task identities remain readable. |
| WNACG · 紳士漫畫 | FileFapper native | Native index/viewer HTML traversal. |
| JMComic · 禁漫天堂 | FileFapper native | Native album/photo parser and independently implemented strip repair. |
| SakuHentai | Retired from active choices | DNS service failed on October 21; permanent closure unconfirmed. Existing saved task identities remain readable. |
| Pawchive | gallery-dl 1.32.17 | gallery-dl post/user collection; image, video, audio, archive and supported document attachments; dated creator/Posts collection. |
| Comix | FileFapper native | Native embedded reader data plus browser-assisted rendered pages. JavaScript/encryption can require capture or an updated script. |
| Kemono | gallery-dl 1.32.17 | gallery-dl post/user collection; mixed media and dated collection; optional 1.5× / 2× enlargement. |
| Pixiv | FileFapper native | Artwork AJAX / original pages; bounded user collection; static originals and ugoira ZIP/timing/animated WebP; official ppixiv r257 browser viewer. Login may be required. |
| DoujinHentai | FileFapper native | Native pageUrls JSON and vertical reader nodes; individual chapters. Browser capture fallback. |
| Ikuhentai | FileFapper native | Native Madara reading-content / lazy images; individual chapters. Browser capture fallback. |
| Toonkor | FileFapper native | Native base64 page-list decoding; numbered toonkor domains supported. Browser capture fallback. |
| BlackToon | FileFapper native | Native reader nodes and image-host config; browser capture fallback. |
| Danbooru | FileFapper native | Native JSON individual posts and bounded pools, including media. Dated /posts collection. |
| Gelbooru | FileFapper native | Native post HTML / original link. Individual s=view&id=… URL. |
| Rule34 | FileFapper native | Native post HTML / original link. Individual s=view&id=… URL. |
| Yande.re | FileFapper native | Native post HTML / full-size link. Individual /post/show/ID URL. |
| R34.app | FileFapper native + capture | Recognized Rule34 source IDs; other boards use loaded browser media capture. |
| Kurosearch | FileFapper native + capture | Recognized Rule34 post IDs, search-list collection and loaded media capture. |
| Rule34 React | FileFapper native + capture | Scoped GitHub Pages project; Rule34 IDs and loaded media capture. |
| Hentai Foundry | gallery-dl 1.32.17 | Individual pictures plus browser collection from picture search, tags, categories and artist lists; cookies when needed. |
| The Big ImageBoard | FileFapper native | TBIB post HTML/original media; s=view&id=ID; dated search-list collection. |
| FapReactor | gallery-dl 1.32.17 | Reactor /post/ID parser; original media. Browser collection from search/tag/category/user results. |
| AIBooru | FileFapper native | AI art; Danbooru-style JSON posts and dated /posts collection. |
| Civitai | gallery-dl 1.32.17 | AI art image/post URLs; account/content visibility applies. Models/checkpoints excluded. |

Native reader adapters are in engine/native_adapters.py and engine/engine.py. Browser-assisted capture is in app/browser.cjs. Native parsers are implemented code, not just site bookmarks. Reader fixture tests cover the documented selectors/data formats; they do not prove live service availability.

For a changed mirror or layout, import a reviewed Python site script using the included script API. Toonkor mirrors change frequently; matching is restricted to toonkor followed by digits on .org, .com or .net. Other new mirror names need a script/registry update.

All 12 added profiles use interactive Browser search. A search template may only take you to a starting page; use the site’s search box if it does not accept the supplied query. Existing supported HTML searches retain their filterable result lists.

Rendered capture uses the currently open reader and your existing browser session. It does not solve access challenges. Choose a long-strip reader and compare the captured page count with the chapter. The image/canvas capture limit is 2,000 pages / 100 MB of canvas data per capture. Encrypted, virtualized or unreadable cross-origin canvases may need site-specific updates.

E/Ex originals require valid account access. HTTP 429/509 creates a site-wide download cooldown by default. Preferences can explicitly skip that local cooldown path and use bounded retries; a persistent refusal still fails. Browser and translation cooldowns are unchanged. HTTP 401/403 requires user action. There is no account/IP rotation or quota reset. HTML challenge pages are rejected rather than saved as images.

## Frontend profiles added in 1.0.1-Alpha

R34.app, Kurosearch and Rule34 React have distinct entries in Sites, Search and the browser quick buttons. They are JavaScript frontends rather than identical copies of Rule34's HTML layout. Open a post in Browser and use Queue rendered pages to capture the currently displayed images; compare the captured count with the post and use its full-size viewer. Recognized direct post IDs can resolve the corresponding original Rule34 page. Queue galleries collects source-post links exposed in a loaded listing and deduplicates their underlying Rule34 identities across frontends. A frontend without exposed post links requires using its displayed post/capture controls. Only the /r34-react project on kurozenzen.github.io is recognized, so unrelated projects are not treated as this site.

R34.app may show a browser access challenge; this release does not solve it. Direct R34.app links naming a different board are not treated as Rule34 IDs. Its other sources can be captured in the displayed browser post. Static image/GIF downloading and rendered capture are supported; video conversion and private frontend APIs are not implemented. No private credentials or live explicit images were used for fixture verification.

Primary frontend references: [R34.app](https://r34.app/), [Kurosearch source](https://github.com/kurozenzen/kurosearch), and [Rule34 React source](https://github.com/kurozenzen/r34-react). The frontend adapters are independently written; their source is not bundled.

Version 1.3.1 captures each E/Ex image page's identity and reload token. Failed TLS connections (including WRONG_VERSION_NUMBER), expired H@H peer links and corrupt image responses can request a fresh source, up to twice per page. Each gallery serializes its refresh requests with at least three seconds between them. Original/resampled selection is retained; original-file query parameters and reload tokens are preserved. Access denial, insufficient GP and server cooldowns stop recovery. Failed partial bytes are discarded when changing sources, and completed-file hashes remain compatible with earlier releases. Certificate verification stays on; no HTTPS-to-HTTP conversion is used. Forced reloads consume image hits as described in the user guide. Verification uses a local server that produces a real TLS protocol mismatch; it does not establish that every live H@H peer is reachable.

Website tabs use Chromium Embedded Framework through a native helper and a separate FileFapper profile. Website content has no Node integration or general application IPC; its constrained Pixiv media bridge is limited to the approved page origin and image hosts. Personal Chrome or Edge extensions are not loaded. FileFapper’s authored browser plugins, official ppixiv integration and Ghostery-based filtering are bundled; FileFapper routes native CEF requests and cosmetic filters through its browser adapter. Electron remains the application interface. See [the CEF browser guide](BROWSER-CEF-1.0.md) for runtime, profile and verification details.

Primary implementation references:
• gallery-dl upstream: https://codeberg.org/mikf/gallery-dl
• gallery-dl configuration: https://gdl-org.github.io/docs/configuration.html
• gallery-dl cookie documentation: https://github.com/mikf/gallery-dl#cookies
• Microsoft Edge WebView2 runtime distribution: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution
• Microsoft Edge WebView2 profile data: https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder
• JM format reference: https://github.com/hect0x7/JMComic-Crawler-Python/blob/master/src/jmcomic/jm_toolkit.py

The JM strip mapping is implemented independently in FileFapper and tested with synthetic pixel rows, including heights that are not divisible by the strip count. No third-party JM crawler code is bundled.


Additional primary format references (independently implemented, no extension source copied):
- https://github.com/keiyoushi/extensions-source/tree/main/src/en/comix
- https://github.com/keiyoushi/extensions-source/tree/main/src/es/doujinhentai
- https://github.com/keiyoushi/extensions-source/tree/main/src/es/ikuhentai
- https://github.com/keiyoushi/extensions-source/tree/main/src/ko/toonkor
- https://github.com/keiyoushi/extensions-source/tree/main/src/ko/blacktoon
- https://danbooru.donmai.us/wiki_pages/help:api
- https://github.com/ghostery/adblocker/tree/master/packages/adblocker-electron
- https://docs.libretranslate.com/api/operations/translate/
- https://easylist.to/

FileFapper 1.2 browser additions: the default page translator uses Microsoft's public no-key text endpoint in the current tab. Its request format was checked against the primary TWP implementation at https://github.com/FilipePS/Traduzir-paginas-web/blob/master/src/background/translationService.js ; FileFapper's provider/DOM code is independently written and no extension source is bundled. DeepL and Azure keyed modes follow their official APIs: https://developers.deepl.com/api-reference/translate/request-translation and https://learn.microsoft.com/en-us/azure/ai-services/translator/text-translation/reference/v3/translate . The public no-key service has no availability guarantee; errors and rate limits are shown.

Infinite Scroll detects normal pagination on the current origin and appends sanitized HTML content. Auto-scroll can trigger sites' native lazy-loading behavior. These are browsing features; JavaScript-only/private APIs and virtualized readers may not support generic linked-page appending. Browser tools exposes the controls and status reports a site-dependent limitation instead of claiming complete pagination support.

## Browser pagination in v1.0

Rule34 results have a dedicated thumbnail/offset rule. E/ExHentai listings support server-issued next-gallery cursors, table rows, thumbnail cards and older table pagers. Force mode additionally handles common numeric page/offset links and native Load more buttons. The exact reported search URL formats were exercised with local non-explicit fixtures, including filters and duplicate results. Existing signed-in browser cookies are retained. An unauthenticated external probe returning a CAPTCHA or empty ExHentai response does not establish a fault with a user’s saved authenticated session. Live authenticated ExHentai scrolling was not verified with personal cookies. Some searches contain only one results page, in which case there is no next page to append.

## Category searches and collection batches

E/ExHentai result pages and Rule34 search listings can be reviewed and collected into separate gallery/post tasks. E/Ex categories are chosen through inclusion checkboxes; the app builds the site’s exclusion mask. Collection follows same-origin result links with browser cookies, retains search filters, removes duplicate gallery identities and stops at configured page/gallery limits or a server error. It reads gallery links without downloading full gallery images. Reviews are temporary; added tasks are saved normally. Up to 200 result pages and 5,000 galleries can be collected in one batch; the queue holds 10,000 tasks. Open next batch continues from the remaining results. This does not broaden a site account’s visible results or imply that an entire category fits in one batch.


## 1.0.1-Alpha media, dates and ppixiv

Mixed-media downloads retain extensions and original source bytes. Images are decoded; audio/video/archive/document types receive format checks. ZIP directory and transfer length/range checks avoid accepting interrupted downloads. Arbitrary archives are never automatically expanded or run. Chromium codec support determines in-app playback; Windows Open file is available. Supported types and conversion limits are in USER-GUIDE.md.

Date collection supports inclusive bounds on E/Ex result-row posted dates, Danbooru/AIBooru /posts API dates, Pawchive/Kemono creator/Posts API dates, and booru post dates obtained from loaded/fetched HTML. Undated posts are counted and excluded with an active range. The range filters the scanned batch, bounded to 200 result pages and 5,000 matches; use continuation/site search to reach older work. No empty date-match page alone ends a scan. Unknown dates are not invented.

The unmodified official ppixiv r257 userscript is bundled at app/browser-plugins/ppixiv/ppixiv-main.user.js. FileFapper verifies SHA-256 37791646521c80a0de71447fcb5fed79f4c0c420d00d91260e6b2217065b23ac before unwrapping its application string for document-start injection. Only https://www.pixiv.net and https://pixiv.net run it. It is independently switchable; reload tabs after changing it. Startup and Pixiv-origin isolation are covered by fixtures; personal authenticated Pixiv sessions were not used.

Its small isolated preload exposes only a media bridge. The main process verifies the sending view/frame and permits HTTPS GET only to i.pximg.net and i-cf.pximg.net, rejecting other hosts, credentials, ports, redirects and responses over 128 MB. It exposes no general file/app IPC. FileFapper preserves ppixiv's own artwork right-click menu. Its optional requests to unrelated third-party services are outside this bridge. For large files use the FileFapper queue.

Primary references for the new integrations:
- https://github.com/ppixiv/ppixiv and https://ppixiv.org/install
- https://ppixiv.org/builds/r257/ppixiv-main.user.js
- https://github.com/mikf/gallery-dl/blob/master/gallery_dl/extractor/hentaifoundry.py
- https://github.com/mikf/gallery-dl/blob/master/gallery_dl/extractor/reactor.py
- https://github.com/mikf/gallery-dl/blob/master/gallery_dl/extractor/danbooru.py
- https://github.com/mikf/gallery-dl/blob/master/gallery_dl/extractor/civitai.py
- https://github.com/mikf/gallery-dl/blob/master/gallery_dl/extractor/pawchive.py
- https://github.com/mikf/gallery-dl/blob/master/gallery_dl/extractor/kemono.py

## Alpha collection and browser verification

Hentai Foundry search/tag/category/artist picture lists, FapReactor search/tag/category/user lists and TBIB post searches collect same-site post links with bounded pagination. AIBooru /posts searches use its native JSON collector. Review the list before queueing. The collector preserves result filters between pages, rejects links leaving the source site, stops on repeated pages, and keeps partial results on cancellation or access failure. A tag/category page must actually display accessible posts; it cannot create missing or private results.

Date ranges include both endpoint dates. Reactor JSON-LD datePublished is recognized when a date lookup is needed. A site without usable dates contributes to the undated count and is excluded when a date filter is set. Clearing the dates includes undated posts.

ppixiv is pinned to official r257. Alpha fixes browser-side cancellation of its media saves, Pixiv image reference headers, fullscreen permissions and scrolling interference. It adds a viewer status and reload/original-site controls. Automated tests use a non-explicit local Pixiv API/artwork fixture with the actual upstream viewer; personal logins and private content are not included in the test data. Site behavior and account access still require user validation.

The optional bundled waifu2x CUnet upscaler is a local model, separate from a site's own image resolution. Original size stays available and originals are retained. Model output quality depends on the source; compare at actual pixel size.

## Reader/account maintenance build — October 20, 2026

See [the dated site audit](SITE-CHECK-2026-10-20.md). The three reported gallery failures were caused by a new reader manifest, not a missing login. HentaiHere exposes its full chapter as JSON; Hentai2Read uses Reader/Show page props. The supplied Hentai2Read address lacks the chapter ID and genuinely returns 404. Password/cookie import cannot repair that address.

Saved site logins use Windows encryption and fill an exact-origin HTTPS sign-in form locally. No passwords enter gallery-dl, site scripts, task exports or diagnostic logs. Sign-in cookies sync automatically for open supported sites and restore on restart. CAPTCHA/OTP remains a user step. FileFapper pauses same-host work after an access error and offers Browser → Sync & resume, regular-browser opening and cookie import. A Cloudflare challenge may continue rejecting embedded WebView2 or downloader requests even with fresh cookies; no CAPTCHA bypass is implemented.


## October 27 additions

See USER-GUIDE.md → Added sites and saved tags for exact URL forms and verification scope. Added rule34ai.art, rule34.us, rule34.pw, cartoon18.com, 177picyy.com, ho5ho.com, dabaitu-mh.cc, hentaidb.xyz, doujiva.com and kasei.cc.

Seven direct public HTML parsers exposed full-size media. Retrying in actual Edge confirmed Kasei and HentaiDB both load; HentaiDB’s comic reader provided a complete 82-page manifest, while the Kasei frontend source confirmed its chapter API and capture selectors. Direct Python HTTP access failed for Kasei and returned 403 for a HentaiDB comic, so these transport results are distinguished from browser availability. Kasei’s numeric-ID API is covered by fixtures; public-token chapter URLs use browser capture. 大白兔 remains provisional because HTTPS failed. No full authenticated download is claimed for these newly added profiles.
