# FileFapper v1.0 — CEF browser

Website tabs use the bundled Chromium Embedded Framework (CEF) through FileFapper's native helper. Electron continues to draw the queue and the rest of the application. The Windows package contains the browser runtime; it does not require a separate Edge or Chrome installation.

FileFapper stores CEF data in its own CefBrowser folder inside the existing application profile. Its encrypted FileFapper cookie vault is restored to that profile on first use. Preferences, queued tasks, saved accounts and tab sessions remain in the existing application profile. The old EdgeBrowser folder is preserved; its cache, site storage and cookies that were never synchronized to FileFapper's vault do not automatically transfer. If a site needs a fresh session, sign in again or import a current cookies.txt or extension JSON export.

The browser retains the tab manager, request and cosmetic filtering, pop-up controls, translation, infinite scroll and ppixiv integration. Website downloads use FileFapper's Save As dialog. The Pixiv media bridge accepts only the top-level Pixiv page and approved Pixiv image hosts. Imported Python site scripts remain trusted local code.

The app limits open tabs to 100. Switching between existing tabs does not deliberately reload them. Browsing Data can clear history, cache, site storage or cookies; clearing cookies also removes the saved FileFapper cookie vault. The site-storage operation clears the recorded origins encountered by CEF, including storage from its open tabs.

CEF is an embedded browser with its own session. A site's verification, authentication or downloader connection can behave differently from a regular browser. The automated CEF checks use isolated profiles, local server responses and synthetic Pixiv fixtures; they do not prove that a live authenticated site or challenge will succeed. Use the site's normal sign-in and verification controls, and sync or import its cookies if needed.

The current Windows runtime uses CefSharp 154.0.340 and CEF 154.0.34 / Chromium 154.0.8037.98. Their licenses and Chromium component credits are included under assets/third-party/cef. CEF is bundled and updated when FileFapper is rebuilt.
