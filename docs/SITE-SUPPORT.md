# FileFapper v1.0 site support

[Back to README](../README.md) · [User guide](USER-GUIDE.md) · [Site scripts](SITE-SCRIPTS.md)

FileFapper includes **50 active site profiles**. The catalog below is generated from the app's site registry. A listed profile means the integration is included; it is not a promise that every URL, account, mirror or live site works today. Sites can change their layouts, domains and access rules. Some links lead to adult content.

The **Integration** column describes the registered primary engine: *Native* uses FileFapper's adapter; *gallery-dl* uses its bundled extractor. **Browser capture** means the registry also advertises capture of supported rendered pages; it does not guarantee every page is capturable. A site-search shortcut may open a site for interactive searching rather than return results directly in FileFapper.

<!-- SITE-CATALOG-START -->

### Galleries and readers

| Site | Integration | Browser capture |
| --- | --- | --- |
| [E-Hentai](https://e-hentai.org) | gallery-dl | — |
| [ExHentai](https://exhentai.org) | gallery-dl | — |
| [nhentai](https://nhentai.net) | gallery-dl | — |
| [Hitomi.la](https://hitomi.la) | gallery-dl | — |
| [HentaiFox](https://hentaifox.com) | Native | — |
| [Hentai2Read](https://hentai2read.com) | Native | Available on supported pages |
| [HentaiHere](https://hentaihere.com) | Native | Available on supported pages |
| [HentaiNexus](https://hentainexus.com) | gallery-dl | — |
| [IMHentai](https://imhentai.xxx) | Native | — |
| [HentaiEra](https://hentaiera.com) | Native | — |
| [HentaiEnvy](https://hentaienvy.com) | Native | — |
| [HentaiRox](https://hentairox.com) | Native | — |
| [HentaiZap](https://hentaizap.com) | Native | — |
| [HentaiHand](https://hentaihand.com) | Native | — |
| [Simply Hentai](https://www.simply-hentai.com) | gallery-dl | — |
| [My Hentai Gallery](https://myhentaigallery.com) | gallery-dl | — |
| [Hentaidad](https://hentaidad.com) | gallery-dl | — |
| [WNACG · 紳士漫畫](https://www.wnacg.com) | Native | — |
| [JMComic · 禁漫天堂](https://18comic.vip) | Native | — |
| [AnimeIDHentai](https://animeidhentai.com) | gallery-dl | — |
| [Comix](https://comix.to) | Native | Available on supported pages |
| [DoujinHentai](https://doujinhentai.net) | Native | Available on supported pages |
| [Ikuhentai](https://ikuhentai.net) | Native | Available on supported pages |
| [Toonkor](https://toonkor0.org) | Native | Available on supported pages |
| [BlackToon](https://blacktoon.me) | Native | Available on supported pages |
| [Cartoon18 · 色漫網](https://cartoon18.com/) | Native | Available on supported pages |
| [177漫畫](https://177picyy.com/) | Native | Available on supported pages |
| [Ho5ho](https://ho5ho.com/) | Native | Available on supported pages |
| [大白兔漫畫](https://dabaitu-mh.cc/) | Native | Available on supported pages |
| [HentaiDB](https://hentaidb.xyz/) | Native | Available on supported pages |
| [Doujiva](https://doujiva.com/) | Native | Available on supported pages |
| [火星漫畫 · Kasei](https://kasei.cc/) | Native | Available on supported pages |

### Creators and art

| Site | Integration | Browser capture |
| --- | --- | --- |
| [Pawchive](https://pawchive.pw) | gallery-dl | — |
| [Kemono](https://kemono.cr) | gallery-dl | — |
| [Pixiv](https://www.pixiv.net) | Native | — |
| [Hentai Foundry](https://www.hentai-foundry.com/) | gallery-dl | — |
| [FapReactor](https://fapreactor.com/) | gallery-dl | — |
| [Civitai](https://civitai.com/images) | gallery-dl | — |

### Booru and Rule34

| Site | Integration | Browser capture |
| --- | --- | --- |
| [Danbooru](https://danbooru.donmai.us) | Native | — |
| [Gelbooru](https://gelbooru.com) | Native | — |
| [Rule34](https://rule34.xxx) | Native | — |
| [Yande.re](https://yande.re) | Native | — |
| [R34.app](https://r34.app/posts/rule34.xxx) | Native | Available on supported pages |
| [Kurosearch](https://kurosearch.com/) | Native | Available on supported pages |
| [Rule34 React](https://kurozenzen.github.io/r34-react/) | Native | Available on supported pages |
| [The Big ImageBoard](https://tbib.org/) | Native | — |
| [AIBooru](https://aibooru.online/) | Native | — |
| [Rule34 AI Art](https://rule34ai.art/) | Native | Available on supported pages |
| [Rule34.us](https://rule34.us/) | Native | Available on supported pages |
| [Rule34 Scroller](https://rule34.pw/) | Native | Available on supported pages |

<!-- SITE-CATALOG-END -->

## Choosing the right address

- **E-Hentai / ExHentai:** gallery URLs and supported result pages. Originals require appropriate account access; use the category picker to include one or more categories. The server's quotas and verification still apply.
- **HentaiHere / Hentai2Read:** use a complete reader/chapter URL with the chapter identifier. A book-only reader path may not identify a chapter.
- **HentaiFox, IMHentai, HentaiEra, HentaiEnvy, HentaiRox and HentaiZap:** use a gallery or individual reader page. Reader layouts can change.
- **HentaiHand, Comix, DoujinHentai, Ikuhentai, Toonkor and BlackToon:** use an individual chapter. For supported readers, load all pages in Browser and try **Queue rendered pages** if direct extraction fails. Toonkor mirrors change; supported host matching is limited.
- **Pawchive / Kemono:** supported posts and bounded creator collections can include images, video, audio, archives and other supported attachments. Availability follows the source and account access.
- **Pixiv:** use `/artworks/ID` or a bounded `/users/ID` collection. Original artwork and ugoira handling are available; sign-in may be required. The separate ppixiv viewer is included in Browser.
- **Danbooru / AIBooru:** individual `/posts/ID` URLs and supported `/posts` result collection. Danbooru pools are also supported.
- **Gelbooru / Rule34.xxx / TBIB:** use individual `page=post&s=view&id=...` posts or supported search-list collection. **Yande.re** accepts individual `/post/show/ID` posts.
- **R34.app / Kurosearch / Rule34 React:** recognized Rule34 post IDs may resolve to the original source; the browser can also capture supported loaded media. Other boards and dynamic listings may require capture. Saved tag searches are available for Kurosearch and Rule34 React.
- **Hentai Foundry / FapReactor:** individual pictures or posts, plus supported search, tag, category and artist/user listing collection through Browser.
- **Civitai:** supported image/post URLs through gallery-dl; model and checkpoint downloads are outside this profile.
- **Rule34.us / Rule34.pw / Rule34 AI Art:** use individual post URLs. Search and rendered capture depend on the current site layout.
- **Cartoon18:** use `/story/ID/full` for a chapter; a series page can be used to collect chapter links where supported.
- **177漫畫:** individual gallery reader URLs can collect linked numbered pages, within the reader limit.
- **Ho5ho / Doujiva:** open an individual gallery or chapter; collection depends on the site's current reader manifest.
- **HentaiDB:** comic detail or `/comics/SLUG/read` pages use the chapter reader. If direct access fails but the reader loads, try rendered-page capture. External streaming players are not supported.
- **Kasei:** numeric `/comic/ID/read/NUMBER` chapters use the chapter API. For public-token addresses, open the scroll reader and try **Queue rendered pages**. Browser and downloader connections can behave differently.
- **大白兔漫畫:** provisional reader/capture profile; HTTPS was unavailable during earlier verification, so current reader support remains uncertain.

## Search, collection and dates

Some profiles offer FileFapper search results; others open the site's own interactive search. A search template or a listed site does not mean every category, search page or pagination method is supported. On compatible results pages, **Queue galleries** collects links for review before creating individual tasks. The scan is bounded to 200 total pages and 5,000 matches per batch; continuation may be needed.

Inclusive posted-date filtering is available on supported E/ExHentai, Danbooru/AIBooru, booru results and Pawchive/Kemono creator listings. Results with unknown dates are counted and excluded when a date filter is active. The filter applies only to the pages scanned.

## Access and troubleshooting

1. Verify that the exact gallery, chapter or post opens for your account in FileFapper Browser. Complete any login or verification requested by the site.
2. Sync the site's cookies or import a current Netscape `cookies.txt` / compatible JSON export for the same host. Cookies may expire and do not guarantee access.
3. If the site opens but direct extraction fails, try **Queue rendered pages** where capture is supported, and compare the number of pages with the reader.
4. If a site works in another browser but not in FileFapper, try clearing only cached images and files, then restart; review access errors before entering credentials. A website's browser response and its downloader response can differ.
5. A changed reader may require an updated FileFapper release or a reviewed [custom site script](SITE-SCRIPTS.md). Scripts are trusted local Python code, not sandboxed.

CEF browser checks and adapter fixtures use isolated local test data; they do not establish successful authenticated downloads or challenge completion on every live site. No CAPTCHA bypass or account/quota reset is provided.
