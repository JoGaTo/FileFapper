# FileFapper

**Find it. Queue it. Make it yours.**

FileFapper brings gallery downloading, site browsing and a manageable download queue together in one Windows app. Paste a link, collect a search page, or browse for your next favorite gallery without juggling a collection of separate tools.

**[Download FileFapper](https://github.com/JoGaTo/FileFapper/releases)** · [User guide](docs/USER-GUIDE.md) · [Site support](docs/SITE-SUPPORT.md) · [Write a site script](docs/SITE-SCRIPTS.md)

## Get started

1. Download **FileFapper.exe** (portable), the portable **ZIP**, or **FileFapper.msi** (installer) from the [releases page](https://github.com/JoGaTo/FileFapper/releases).
2. On Windows 10 or 11, 64-bit, run the portable app, extract the ZIP and run its `FileFapper.exe`, or install the MSI. FileFapper includes its browser and downloader; you do not need to install Python, Node.js, Chrome or Edge to use the release.
3. Paste a supported gallery, artwork, post or chapter URL into **Download queue**, choose your settings and select **Add downloads**. To collect a listing, open it in **Browser** and choose **Queue galleries**.

The Windows builds are unsigned. Follow [the guide](docs/USER-GUIDE.md) for account access, downloads, sessions and troubleshooting.

### Other installation methods

| Method | Availability |
| --- | --- |
| ZIP / MSI | Windows x64 release builds, when attached to the releases page. This is the only way to download and install this (for now...). Still working on x86 version.  |
| Android / IOS | Nothing of yet... |
| macOS / Linux | No supported release builds at present. If anyone is capable of taking this and converting to a workable Mac/Linux build please contact me. |

Use the Windows downloads above until these other distribution methods are built and published. Installing an unrelated package with a similar name will not install this app.

## Made for collecting

- **A queue you control.** Add multiple URLs, reorder and filter tasks, preview media, and pause, resume or stop work individually or in bulk. Manage up to 50 file workers per task, set request delay and adjust simultaneous tasks.
- **Collect more than one result.** Review supported search and category pages before adding individual galleries or posts. Some sites also support date ranges and continuation batches.
- **Choose your files.** Select original or resampled E-Hentai / ExHentai images when your account permits. Supported Pawchive and Kemono posts can include video, audio, archives and other attachments; Pixiv ugoira retains its original frames and timing.
- **Keep your place.** Tasks, preferences, tabs and saved searches persist locally. Export a session when you want a separate backup; cookies, passwords and keys are excluded.
- **Make it yours.** Pick from color themes and character artwork templates, adjust background brightness and queue space, or add a reviewed Python site script.

Downloads are organized in a shared site-and-date folder, with the gallery ID or task identifier added to filenames to avoid collisions. See [the user guide](docs/USER-GUIDE.md) for file actions, limits and details.

## A browser built into your workflow

FileFapper's website tabs run in **Chromium Embedded Framework (CEF)**; Electron provides the surrounding app interface. Browse with up to **100 tabs**, restore tab sessions, use site shortcuts, and send supported galleries or loaded reader pages to the queue.

Browser tools include configurable ad and tracker filtering, popup controls, in-page translation, infinite scroll, auto-scroll and browsing-data controls. The bundled **ppixiv** integration can enhance Pixiv browsing. Your FileFapper browser has its own profile: it does not automatically share your personal browser's extensions, passwords or full browsing data. You can sign in or import your own cookies where a site requires them.

Site access, verification and page layouts vary; embedded browsing and download requests can behave differently from a regular browser. [Browser details](docs/BROWSER-CEF-1.0.md) · [Cookies and access help](docs/USER-GUIDE.md#cookies-accounts-and-access)

## Built-in site profiles

The 50 profiles below are included in the app. A profile identifies a supported site or integration; it does **not** guarantee that every page, search, login or live site currently works. Some use browser-assisted capture or have limited URL support. See [site support](docs/SITE-SUPPORT.md) for working modes and known limitations. Links may lead to adult content.

<!-- SITE-CATALOG-START -->

### Galleries and readers

- [E-Hentai](https://e-hentai.org) _has a limitation of 4 or less workers_
- [ExHentai](https://exhentai.org) _has a limitation of 4 or less workers_
- [nhentai](https://nhentai.net)
- [Hitomi.la](https://hitomi.la)
- [HentaiFox](https://hentaifox.com)
- [Hentai2Read](https://hentai2read.com)
- [HentaiHere](https://hentaihere.com)
- [HentaiNexus](https://hentainexus.com)
- [IMHentai](https://imhentai.xxx)
- [HentaiEra](https://hentaiera.com)
- [HentaiEnvy](https://hentaienvy.com)
- [HentaiRox](https://hentairox.com)
- [HentaiZap](https://hentaizap.com)
- [HentaiHand](https://hentaihand.com)
- [Simply Hentai](https://www.simply-hentai.com)
- [My Hentai Gallery](https://myhentaigallery.com)
- [Hentaidad](https://hentaidad.com)
- [WNACG · 紳士漫畫](https://www.wnacg.com) _Chinese_
- [JMComic · 禁漫天堂](https://18comic.vip) _Chinese_
- [AnimeIDHentai](https://animeidhentai.com)
- [Comix](https://comix.to)
- [DoujinHentai](https://doujinhentai.net)
- [Ikuhentai](https://ikuhentai.net)  _may not work time to time_ - _Spanish_
- [Toonkor](https://toonkor0.org) #Korean#
- [BlackToon](https://blacktoon.me) #Korean#
- [Cartoon18 · 色漫網](https://cartoon18.com/)
- [177漫畫](https://177picyy.com/) #Chinese#
- [Ho5ho](https://ho5ho.com/)
- [大白兔漫畫](https://dabaitu-mh.cc/)
- [HentaiDB](https://hentaidb.xyz/)
- [Doujiva](https://doujiva.com/)
- [火星漫畫 · Kasei](https://kasei.cc/)  _may not work time to time_ - _Korean?_

### Creators and art

- [Pawchive](https://pawchive.pw)
- [Kemono](https://kemono.cr)
- [Pixiv](https://www.pixiv.net)
- [Hentai Foundry](https://www.hentai-foundry.com/)
- [FapReactor](https://fapreactor.com/) _Russian_
- [Civitai](https://civitai.com/images)

### Booru and Rule34

- [Danbooru](https://danbooru.donmai.us)
- [Gelbooru](https://gelbooru.com)
- [Rule34](https://rule34.xxx)
- [Yande.re](https://yande.re)
- [R34.app](https://r34.app/posts/rule34.xxx)
- [Kurosearch](https://kurosearch.com/)
- [Rule34 React](https://kurozenzen.github.io/r34-react/)
- [The Big ImageBoard](https://tbib.org/)
- [AIBooru](https://aibooru.online/)
- [Rule34 AI Art](https://rule34ai.art/)
- [Rule34.us](https://rule34.us/)
- [Rule34 Scroller](https://rule34.pw/)

<!-- SITE-CATALOG-END -->

## Build from source

The desktop release targets Windows x64. Building requires Windows 10/11, Node.js 24+, Python 3.14+, .NET SDK 8 or later and access to the required dependencies. From PowerShell in the source directory:

```powershell
.\build.ps1
```

The build script prepares dependencies, runs core checks and builds the worker, CEF helper and Windows app. To build an MSI from the resulting payload, run `node tools/build_msi.cjs`. For development, install dependencies first, then use `npm start`; `npm test` runs the JavaScript test suite. See [the CEF guide](docs/BROWSER-CEF-1.0.md) and the build script for runtime details.

## License and contributions

FileFapper is licensed under **GPL-2.0-only**. See [LICENSE](LICENSE) and [third-party notices](THIRD-PARTY-NOTICES.md) for bundled components and redistribution details. Site layouts and availability change; focused bug reports with the site, URL shape and error message are useful. Never include cookies, passwords or private account information in an issue.
