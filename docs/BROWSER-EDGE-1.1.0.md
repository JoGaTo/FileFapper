# FileFapper 1.2.7-Alpha — Edge browser

Build **2026.10.28-filefapper-127-focus**.

## Browser engine and runtime

Website tabs use **Microsoft Edge WebView2** through a native FileFapper helper. The Electron application shell continues to display the queue, preferences and other app pages.

The package carries the helper and its required supporting files. The browser engine comes from the installed **Microsoft Edge WebView2 Runtime**; a full personal Edge browser or its profile is not included. The runtime was present on the PC inspected for this release. Microsoft supplies and updates the Evergreen runtime as a shared Windows dependency. See [Microsoft's runtime distribution documentation](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/distribution).

On another PC, if FileFapper reports that the runtime is unavailable, install the Evergreen WebView2 Runtime from [Microsoft's download page](https://developer.microsoft.com/en-us/microsoft-edge/webview2/#download-section), then reopen FileFapper. Keep the files from an extracted FileFapper Windows ZIP together; moving only FileFapper.exe out of that folder omits its dependencies.

## One hundred tabs and saved sessions

The open-tab limit is **100** for new tabs, restored browser state and imported tab groups. The 100th tab is allowed; the 101st is refused without changing the existing tabs. A named session can keep up to 100 valid web addresses, and up to 50 named sessions can be retained.

Restoring a named session can append or replace. If appending would go over 100, close some tabs or choose **Replace open tabs**. Replacement can restore a full 100-tab session. Existing smaller saved sessions remain usable. Restored tabs load when selected, so keeping a saved address does not require opening every native page during startup.

## FileFapper's separate Edge profile

FileFapper creates its own persistent WebView2 website profile in its application data area. That profile holds FileFapper's website cookies, cache and site storage, using WebView2's user-data-folder model. It is separate from the user's ordinary Edge profile. [Microsoft explains WebView2 user data folders](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/user-data-folder).

On first Edge use, valid cookies saved in FileFapper's Windows-encrypted vault are imported into its Edge profile. This is a cookie migration, not a complete copy of the previous embedded browser's local storage or a personal Edge database. Personal Edge passwords, extensions and browsing data are not imported through that step. FileFapper's saved-account vault, task list and preferences remain separate app data.

A site may still ask for sign-in when a saved cookie expires or no longer identifies an accepted session. Saving a password fills a form; use the site's sign-in control to establish the session. A current browser cookie export can also be imported from **Cookies & accounts**. Preserve the export's original host/domain, Secure, HttpOnly, SameSite and expiry/session attributes, and review the browser acceptance summary.

## Practical session recovery

1. Open the exact host and an individual chapter or gallery in FileFapper Browser.
2. Sign in when requested. You can use **Fill saved login** for an account saved for that exact HTTPS site.
3. To use a session from a regular browser, export its site cookies and import the .txt or JSON file under **Cookies & accounts**. Reload the page in FileFapper.
4. Once the page is readable, choose **Sync & resume** to refresh downloader cookies and retry access-paused tasks for that host.
5. If filters or page helpers interfere, use **Try site compatibility** for that host. Browsing data can separately clear FileFapper's cache, history, site storage or cookies. Clearing browser cookies signs sites out; saved account passwords have their own controls.

The owner reported successful browsing of **18comic.vip** in ordinary Edge, Firefox and Thorium. This release changes FileFapper's embedded engine and profile handling; it does not establish a successful authenticated JMComic download. An embedded WebView2 session and a downloader connection may receive different access decisions from the regular browser.

## Existing library and appearance

The download engine and site adapters are unchanged by the browser switch. Existing tasks, gallery folders, saved preferences and account records remain part of the FileFapper profile. All **18 themes and seven approved artwork templates** remain available with queue room, framing, panel opacity and session controls. The uninstalled castle review alternative remains excluded.

## Verification scope for maintainers

Use the current release's **Verification report** to identify which native Edge checks were executed. A report should distinguish source tests, packaged app checks, offline fixtures and any live account verification. This guide does not supply test counts or claim that every browser feature has already passed native-engine testing.

Earlier browser tests that intercept Electron sessions or enumerate Electron website webContents observe the former website engine. Their historical reports do not certify WebView2. Electron-only fixture switches are for regression tooling, not a user-facing browser feature or a personal-profile migration method. Native Edge checks must exercise the actual helper/profile and preserve the application's trusted IPC boundary.

## Browser display correction

This build fixes pages that loaded while the welcome screen stayed visible. Each Edge tab now has its own native display surface inside FileFapper, above the application compositor. The surface follows browser-area resizing, tab changes and app dialogs. The loading indicator also starts while the browser profile and native surface are preparing. The release verification report distinguishes actual packaged-app checks from separate component tests.

## ppixiv and stable browser painting

The bundled ppixiv r257 viewer has a FileFapper compatibility adapter for Edge WebView2. It recognizes that FileFapper is not the upstream VVbrowser application, so its optional native fullscreen probe cannot interrupt viewer startup. Native application host objects remain disabled. The ready indicator requires constructed viewer screens. The original upstream userscript stays pinned and hash-verified.

Routine browser status updates no longer reposition, resize or show an already positioned panel. Pending placement requests are combined, unchanged requests are ignored in both the app and native host, and actual parent-window movement has a separate notification. This avoids repeated browser repainting while browsing or downloading in the background.

Media Save As dialogs are owned by the main FileFapper window. The browser helper defers the native download until the app returns a chosen destination or cancellation; one picker is offered at a time, and closing the app cancels outstanding requests.
