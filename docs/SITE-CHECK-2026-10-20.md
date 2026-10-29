# Public reader audit — October 20, 2026

This is a bounded HTML/JSON/reader-manifest check of 19 related profiles. No gallery artwork or archives were downloaded; no personal credentials were used. Page counts below are extracted URL counts, not proof that every CDN file is reachable. The local downloader tests use non-explicit generated fixtures separately. Server responses can change after this check.

| Site | Result | Action / limit |
|---|---|---|
| HentaiHere | Supplied reader returned HTTP 200; 55 unique pages in its embedded chapter JSON. | New native reader adapter; reads all pages even when the URL is page 1. |
| HentaiEnvy | Supplied gallery and first reader returned HTTP 200; 8 manifest pages. | New full-reader manifest parser. |
| HentaiRox | Supplied gallery and first reader returned HTTP 200; 90 manifest pages. | Same parser; does not stop after the initial ten thumbnails. |
| HentaiZap | Supplied gallery and first reader returned HTTP 200; 197 manifest pages. | Same parser, retaining each file extension. |
| Hentai2Read | Supplied /reader/BOOK/ address returned the site's Page not found document (404); root/search returned an access check. | The address lacks a chapter ID. Full current Reader/Show JSON is supported by fixtures and the site's shipped reader schema; live valid-chapter extraction is unverified behind its access check. |
| 18comic.vip / JMComic | HTTP 403, Just a moment / Cloudflare access check. | No live gallery extraction verified. Challenge resources are allowed; collection and same-host downloads pause for user action. Browser clearance may not transfer to the downloader. |
| HentaiFox | Public gallery 175604 returned HTTP 200; existing manifest parser extracted 202 pages. | Existing format retained; direct /g/ID/PAGE/ links normalize to their gallery when the legacy reader is used. |
| HentaiEra | Public gallery 1752673 returned HTTP 200; existing manifest parser extracted 120 pages. | Existing format retained through the same wrapper. |
| IMHentai | Public gallery 1760000 returned HTTP 200; existing manifest parser extracted 26 pages. | Existing format retained through the same wrapper. |
| HentaiNexus | Public view/read 22273 returned readable HTML; existing reader decoder extracted 71 page URLs. | Current bundled extraction remains compatible with that sample. |
| HentaiHand | Public single-chapter comic API returned four page URLs and a null language value. | Fixed the null-language/category metadata crash in the native comic adapter. Multi-chapter responses are identified instead of silently truncating. |
| DoujinHentai | Public chapter HTML returned HTTP 200; native pageUrls parser extracted 22 URLs. | Existing chapter parser remains compatible with that sample. |
| WNACG | Public gallery index 397232 returned HTTP 200. | Index HTML inspected; full live viewer traversal/CDN downloads were not exercised. Synthetic multi-page and strip-repair tests remain separate. |
| Simply Hentai | Site and a current gallery route were located; gallery API returned HTTP 403. | Live extraction unverified because its API denied this client. |
| MyHentaiGallery | Public index exposes /a/ID links; current gallery request returned HTTP 403. | Updated address matching for /a/ID and /g/ID. Live extraction unverified behind access denial. |
| Comix | Root returned a Cloudflare access check (403). | Live extraction unverified. |
| Ikuhentai | Root returned a Cloudflare access check (403). | Live extraction unverified. |
| TMOHentai | Connection failed from this environment. | Live extraction unverified. |
| SakuHentai | Connection failed from this environment. | Live extraction unverified. |

Primary data sources were each site's own page/JSON responses and their shipped reader scripts, plus the pinned gallery-dl 1.32.17 extractor implementation used by FileFapper. No third-party claims of availability were used. The audit does not test every gallery, a private account, region, mirror or anti-bot decision.

The version remains **1.0.0-Alpha**, build **2026.10.20-readers-accounts**. CAPTCHA is not solved automatically. Signing in supplies only access the site grants to that account.

The Hentai2Read public `/search/suggest` JSON confirmed the reported book's [title page](https://hentai2read.com/original/70543-the-mage-girl-who-got-turned-into-a-maid). That page returned an access check in this environment. Open it in Browser, complete the check if accepted, then select its chapter; the incomplete reader URL does not identify one.
