# FileFapper

A Windows desktop gallery downloader with a Chromium Embedded Framework browser, a persistent task queue, cookie imports, and extensible Python site scripts.

Open **FileFapper.exe** or install the app with **FileFapper.msi**. The Windows package includes its Chromium Embedded Framework browser and downloader; no separate Python, Node.js, Chrome, Edge or WebView2 installation is required.

Light is the default. Eighteen themes are included, with seven approved character artwork templates: 戦姫サバイバルサガ, 対魔忍アサギ, 助っ人参上!!, 세계수를따먹다, 巨乳魔女, 母娘丼おっぱい特盛母乳汁だくで and 巨乳ファンタジー. Queue room, image framing and panel opacity save with preferences. The baseball pair uses its original 8K enlargement and defaults to the medium-full view. 巨乳ファンタジー uses the approved 1836 × 857 modern-club artwork and defaults to Show full image; the earlier castle review image is not installed.

## CEF browser update · October 29, 2026

The current release is **v1.0**, build **2026.10.29-filefapper-100-cef**. Website tabs use Chromium Embedded Framework through FileFapper's native browser helper. The application interface continues to use Electron. The browser supports **100 open tabs**, including restored and imported tab sessions; a session that would exceed 100 must replace the open tabs or be reduced first.

CEF browsing uses a separate FileFapper profile. On first use, FileFapper brings its saved encrypted cookie vault into that profile; it does not copy a personal browser profile, extensions, passwords or all data from the former website engine. Existing FileFapper preferences, tasks, saved accounts and encrypted vault remain in the same app profile; old Edge site storage and cache are not migrated. Existing valid cookies can retain a site session, while a site may still require sign-in. See [the CEF browser guide](docs/BROWSER-CEF-1.0.md) and [the user guide](docs/USER-GUIDE.md).

Existing site adapters, themes and artwork templates remain available. New downloads use a shared site/date folder and the queue supports 50 workers, request delay, Pause all and Stop all. The supplied verification report records the actual checks for this build; this document does not claim a successful authenticated JMComic download.

The **October 22 appearance build**, `2026.10.22-final-templates`, introduced the magical-academy pair, sunset-bridge pair and closer eleven-character club scene. All seven approved artwork templates and eighteen themes remain included in the current build. They share the existing queue, framing, opacity and session controls; preferences and framing are remembered separately for each template. The castle review image remains excluded.

The earlier 1.0.1-Alpha release retained the previous 1.5.0 functionality and added result-page collection for Hentai Foundry/FapReactor, mouse queue selection, Clear all, local AI enlargement with original comparisons, Browsing Data recovery, ppixiv media/control fixes and five more themes. Read the guide for workflows and limits.

Version 1.4.0 incorporates the October 19 source updates into a complete runtime package. Preferences → Downloads now has separate, saved switches for Faster E/Ex gallery resolution and Skip automatic download cooldowns. Both default to off. Fast resolution uses 50 ms between metadata requests, 150 ms retry steps and a 250 ms minimum source-refresh interval; the normal path retains its pacing. Cooldown skipping uses bounded download retries for 429/509 and reports a persistent refusal as Failed. It does not change browser/translation cooldown handling or grant account access. Image retries now verify payloads before committing them and reset invalid partial ranges. R34.app, Kurosearch and Rule34 React have separate profiles, browser buttons and rendered-page capture. Browser runtime/filter setup and the heavy ad-block dependency load only on first use.

Version 1.3.1 refreshes an E/ExHentai page's image source when an H@H connection fails, including SSL WRONG_VERSION_NUMBER, expired links and invalid images. Recovery is bounded to two refreshes per page and preserves the original/resampled selection. Existing completed files and saved logins are retained; close the older app, open this release and Resume affected tasks. E/Ex counts forced reloads against image hits; see the user guide for details.

Features:

- E/ExHentai category picker and multi-page gallery collection with review, filtering, deduplication, cancellation and batch continuation; Rule34 search listings can also become individual post tasks.

- Single or multiline gallery URL entry, per-task original/resampled selection, image workers, simultaneous task limits, speed caps, and request pacing.
- Queue order by dragging or menu actions, task filters, first-page site search and saved/filterable result lists, multi-selection, list/icon views, and gallery previews.
- Resume, pause, stop, restart, remove from queue, gallery metadata, copy URL, open browser, open first file/folder, move folder, and confirmed Recycle Bin deletion.
- Netscape cookies.txt / extension JSON import with original host-only/domain scope and session attributes, encrypted cookie storage, a stored/accepted/rejected import summary, and cookie sync from the embedded browser’s current site.
- 50 current site profiles, including E-Hentai, ExHentai, Pawchive, Comix, Kemono, Pixiv, R34.app, Kurosearch, Rule34 React, multilingual readers, two Korean readers and four additional native image boards; native WNACG parsing and JMComic strip restoration.
- Imported Python scripts with a documented API and an example, including overrides for current site adapters.
- Native text-field right-click menus, address-bar web search, Kemono/Pixiv/Pawchive quick buttons, Infinite Scroll with Rule34/E/ExHentai rules, forced numbered pagination/Load more, persistent access diagnostics and configurable Auto-scroll.
- A CEF browser with up to 100 open tabs, bundled EasyList / EasyPrivacy ad blocking, per-site exceptions, custom rules, pop-up control, and browsing-data controls.
- FileFapper Page Translator (Microsoft no-key in-page translation / optional DeepL, Azure or LibreTranslate) and FileFapper Tab Sessions, included with source.
- Larger high-contrast text, a compact sidebar, and a full-height queue with optional task details.
- Optional 1.5× / 2× offline waifu2x CUnet enlargement for Kemono, with original files retained, a CPU fallback, and before/after preview. Lanczos resizing is also available.
- Automatic local saves and explicit session export/import, clipboard offers, always on top, and hide thumbnails.
- A local non-explicit sample gallery and offline/local-fixture verification.

Site integrations are not a live-service guarantee. The supplied support notes distinguish installed adapters, search modes, and actual verification. Original files require account access; quotas, access restrictions, and challenges are respected. The optional cooldown switch changes bounded downloader retry/wait behavior; server account/access restrictions still apply.

Read [the CEF browser guide](docs/BROWSER-CEF-1.0.md), [the user guide](docs/USER-GUIDE.md), [site support](docs/SITE-SUPPORT.md), [site scripts](docs/SITE-SCRIPTS.md), and [October 25 verification notes](docs/SITE-CHECK-2026-10-25.md). A new custom site can download through an imported script immediately. Adding a completely new site to the Search dropdown currently requires editing app/sites.json and rebuilding.

## Develop and build on Windows x64

Requirements: Node.js 24+, Python 3.14+, .NET SDK 8 or later, Windows 10/11 x64, and network access for dependencies. The CEF helper uses pinned CefSharp and CEF packages; native/cef-host/packages.lock.json records the NuGet dependency hashes. Keep the helper, Chromium runtime files and license notices together in the packaged Windows resources.

Run build.ps1 from PowerShell. It creates a project-local .venv, installs locked Python and Node dependencies, runs the core/engine tests, builds df-engine.exe and the CEF host, collects license notices, and packages the application into ../release/win-unpacked plus a single-file portable launcher in ../release/. To build the MSI from that payload, run `node tools/build_msi.cjs`. The builds are unsigned.

For UI development after dependency installation:

    npm start

For live CSS editing on this prepared checkout, run `npm run preview:css -- --sample`. Edit files in `app/` and save; the preview replaces only the affected stylesheet, preserving the current page and form values. F12 opens the preview's Inspect tools. `--devtools` opens them at launch. The separate `work/css-preview-profile` remembers preview themes and sample tasks; it does not use the normal profile. The command uses the existing bundled worker. JavaScript/HTML changes require closing and reopening the preview. The packaged EXE keeps its bundled CSS until rebuilt; loose source edits do not change an already built release.

The development app looks for .venv/Scripts/python.exe or DF_PYTHON. DF_DATA_DIR selects an isolated profile (also keeps test windows hidden). DF_USE_BUNDLED=1 tests the built worker in engine-dist. Do not set DF_DATA_DIR during ordinary use unless you intend to use that alternate profile.

Tests:

    npm test
    .venv/Scripts/python.exe -m unittest discover -s tests -p "test_*.py" -v
    node --test tests/tab-limit.test.cjs
    node tests/access-health-dom.cjs

The application and worker checks use isolated profiles and local fixtures. The four tab-limit cases cover 100-tab session fidelity, creation at the boundary, atomic append overflow and replacement. Use the v1.0 verification results for the CEF workflows actually executed against this build; no production account or live authenticated gallery download is implied by a local fixture result.

### Earlier Electron browser fixtures

The repository retains browser-ui.cjs, browser-enhancements.cjs, cookie-session-ui.cjs and other earlier UI workflows. They were written around Electron website partitions, protocol interception and webContents enumeration. Their old reports do not certify the CEF engine; use the CEF browser and ppixiv tests for the current native browser. The Electron-only regression switch belongs to QA. Test code must use fresh profiles and synthetic credentials.

The app interface is app/index.html, styles.css and renderer.js. main.cjs owns privileged operations and validates app IPC callers; the native CEF helper handles website views through a separate private control channel. Website content does not receive general application IPC or Node.js access. The worker protocol is newline-delimited JSON over stdin/stdout; engine source is engine/engine.py. Site scripts are trusted Python running in a subprocess with ordinary Windows account permissions.

## License

GPL-2.0-only. See LICENSE and THIRD-PARTY-NOTICES.md. The corresponding gallery-dl source is included in vendor/ with its upstream license. Retain all runtime license notices when redistributing the packaged app.

### October 20 reader/account maintenance build

That build was version 1.0.1-Alpha, build `2026.10.20-readers-accounts`. New chapter/gallery manifests, encrypted local saved logins, automatic cookie persistence, same-host access pauses, challenge recovery and the dated 19-site audit are documented in docs/USER-GUIDE.md and docs/SITE-CHECK-2026-10-20.md. Run `npm test`, Python unittest discovery, and tests/readers-ui.cjs for account, origin-isolation, browser persistence and queue recovery fixtures. Production passwords are never fixture inputs or source files.


### October 21 site recovery update

Version **1.0.1-Alpha**, build **2026.10.21-site-recovery**. Added exact-host compatibility controls, verification-cookie reset, hard-block recognition, and separate DNS diagnostics. See docs/SITE-CHECK-2026-10-21.md for the bounded public audit and limits. Character template artwork remains in a separate preview set pending review.


### Inactive profile cleanup · October 21, 2026

Build **2026.10.21-profile-cleanup** removes TMOHentai and SakuHentai from active choices while preserving their saved-task identities. No replacement providers have been selected. Eight new character-background concepts are supplied separately for review.

## Workspace release refresh · October 21, 2026

Version **1.0.1-Alpha**, build **2026.10.21-workspace-refresh**. The portable package, visible sidebar version, dependency lock metadata, build output and current distribution guides now agree. The current app source and bundled worker are packaged together. The eight day/night character compositions remain separate review previews; this release retains the existing installed themes.

## Session recovery update · October 25, 2026

Version **1.0.1-Alpha**, build **2026.10.25-session-recovery**. Cookie imports now preserve extension `hostOnly`, Netscape include-subdomains, session expiry and SameSite attributes; valid `__Host-` cookies enter Chromium without a Domain attribute. A scope change replaces the opposite Chromium copy only for the same host, path and name, preserving other paths and child hosts. Cookies & accounts shows stored, browser-accepted and browser-rejected counts without exposing values.

JMComic's readable lazy-image chapters can coexist with a hidden passive verification widget. The browser and worker now distinguish that content from a real challenge, sign-in page or hard block. An earlier browser HTTP 401/403 can recover only with positive readable-content evidence; blank pages and unrelated HTTP failures remain errors. Local fixtures cover these behaviors. A bounded public check of `18comic.vip` still returned HTTP 403 on October 25; no successful production CAPTCHA completion or authenticated gallery download is claimed. Cloudflare documents [limited embedded-browser support](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/).

The October 27 open artwork layout removes large template panel fills, adds glow on dark templates and drop shadow on light templates, strengthens control borders and compacts spacing. The remaining small control fills retain an opacity setting. Ordinary color themes keep their existing layout.

## FileFapper appearance and compatibility

The app is now **FileFapper**, with a blushing panda icon. Existing DandF session files and the `%APPDATA%\D&F` profile remain compatible. Every artwork template has a saved **Background** brightness slider (40–160%). Light-template dropdowns and browser navigation icons now have contrasting text and solid surfaces; site-open buttons have colored backing. Saved Kurosearch and R34 React searches restore individual selected chips, including exclusions and optional tags, and start the search.

## 1.2.5-Alpha browser workspace

Compact readable tabs, a native all-tabs dropdown and additional Rule34, booru and HentaiDB shortcuts are included. Selecting a loaded tab preserves its document; shortcuts reuse a matching open address. The sidebar reads **DOWNLOAD & LOAD 'UP'**. See the user guide for first-selection loading and session compatibility.

1.2.5-Alpha adds a 100-tab limit, tab strip arrows, sorting and close-side menus, a ppixiv toolbar toggle, and one-to-five columns on supported appended booru results.

## 1.2.6-Alpha browser fixes

AIBooru results appended by infinite scrolling are initialized through the site blacklist, so they remain visible when allowed and respect blocked tags. Recent interaction with a FileFapper text field requests keyboard focus without activating the app from the background. Invalid server responses receive clearer recovery guidance. If a site opens in another browser but fails only in FileFapper, try Browser tools > Browsing data > Cached images and files, leave cookies and storage unchecked, clear the selected cache, and restart FileFapper.

## 1.2.7-Alpha keyboard focus

After using a website, the browser helper returns keyboard focus to FileFapper when you click one of its text fields. The handoff checks that FileFapper is the foreground window before changing focus. The actual Windows input test covered the browser address bar and queue filter using an isolated profile.
