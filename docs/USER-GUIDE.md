# FileFapper v1.0 user guide

[Back to README](../README.md) · [Site support](SITE-SUPPORT.md) · [Site scripts](SITE-SCRIPTS.md)

## Install and open

FileFapper v1.0 supports Windows 10/11 x64. Download the portable **FileFapper.exe**, portable ZIP or installer **FileFapper.msi** from [GitHub Releases](https://github.com/JoGaTo/FileFapper/releases). Run the EXE directly, extract the ZIP and run the EXE inside, or open the MSI and follow the installer. The release bundles its browser and download engine; separate Chrome, Edge, Python and Node.js installations are unnecessary. The release is unsigned.

FileFapper stores settings and queue data in `%APPDATA%\D&F`. Its browser profile is separate from your regular browser. Existing DandF session files remain compatible. The app does not currently have published pip, Docker or Chocolatey packages, or supported macOS/Linux builds.

## Your first download

1. Open **Download queue**. Paste one gallery, chapter, artwork or post URL per line.
2. Choose original or resampled quality where applicable, and select the worker count and delay.
3. Select **Add downloads** or press **Ctrl+Enter**. Whether new tasks start immediately depends on your auto-start preference.
4. Select a task to see its details and preview. Use the status tabs, site filter or text filter to find tasks.

Use an individual work when possible; supported listing URLs can be reviewed through **Browser → Queue galleries**. Search and URL support varies by site; see [site support](SITE-SUPPORT.md).

New downloads use a shared folder named for the site and download date. Files keep their source names with a gallery ID and task suffix to prevent collisions; a task ID is used if a site ID cannot be identified. Per-task metadata lives in the shared folder's `.filefapper` directory. Existing downloads keep their previous layout.

## Manage the queue

Drag tasks to reorder them, or right-click for task actions. Checkboxes, Ctrl-click, Shift-click and **Select** mode allow multi-selection; Ctrl+A selects tasks in the current filtered view when a text field is not focused.

- **Pause / Resume:** stop and later continue a task, keeping finished files and usable partial transfers.
- **Stop:** stop work while keeping downloaded files. **Restart** starts that task again.
- **Pause all / Stop all:** act on the queue together; Stop all also stops paused tasks.
- **Remove from list:** remove the queue entry without deleting its files.
- Right-click for preview, copy link, show in browser, open first file or folder, move, metadata and delete. Moving or deleting requires an idle task. Deletion is confirmed and affects the chosen gallery's files, sending them to the Recycle Bin.

**Details** toggles the side panel to give the queue more space. List/icon view and thumbnail visibility are configurable. Preview playback depends on the media codecs available in Chromium; use **Open file** for formats that cannot play in the app. Archives are not automatically extracted or run.

## Browse and collect

The built-in **Browser** uses Chromium Embedded Framework and its own FileFapper profile. Enter an address, use a site shortcut or search from the address bar. Up to 100 tabs can be open. Existing tabs keep their page when selected; restored tabs load when selected. Use the numbered tab menu to find an open tab, `<` / `>` to move one tab and `<<` / `>>` to move five. Right-click tabs for actions including sorting and closing tabs to either side.

To collect a supported search or category page:

1. Open the results in Browser and let the page load.
2. Select **Queue galleries**, set the number of pages and maximum results, then **Collect results**.
3. Review, filter and select the entries before **Add downloads**. Use the continuation option for further batches where offered.

The scan is bounded to 200 total result pages, 5,000 matches per batch and 10,000 queue tasks. Only results accessible to the current session can be collected. Some sites expose only currently loaded results. Stop or close the review to cancel collection; links already found are retained for review.

For supported E/ExHentai, Danbooru/AIBooru, booru listings and Pawchive/Kemono creator listings, optional **Posted from** and **Posted through** fields filter the scanned results inclusively. Results without a usable date are excluded while a date filter is active. A small scan does not search a site's entire history.

### Reader capture

For supported sites with browser capture, open an individual chapter, sign in if needed, select a long-strip/all-pages reader and wait for the pages to load. Choose **Queue rendered pages**, then check the resulting count and preview. Capture is limited to 2,000 entries and 100 MB of canvas data; inaccessible, encrypted or virtualized pages may need an adapter update. Capture does not solve site verification challenges.

### Search and saved tags

**Discover & search** can show a filterable first page on supported HTML searches; other sites open in Browser. For **Kurosearch** and **R34 React**, Browser → **Saved tags** can read the current tags, save a named search and apply it later. Standard exclusions and optional tag modifiers are retained. Grouped expressions may need to be entered on the site itself.

## Cookies, accounts and access

Some sites require an account, an age confirmation or site verification. Complete these on the site. In **Cookies & accounts**, import a Netscape `cookies.txt` file or a compatible browser-extension JSON export, or paste its contents. Check the stored, browser-accepted and rejected counts. Alternatively sign in through FileFapper Browser and sync the current site's cookies to the downloader.

Saved account credentials use Windows encryption and are filled only for the saved HTTPS origin. Cookie and login secrets are excluded from session exports; downloaded files and site scripts are not included either. Treat cookie exports like passwords, and delete temporary exports securely when you no longer need them. Imported scripts are trusted code and can access cookies for their site.

If a page opens in your regular browser but not in FileFapper, try signing in inside FileFapper or importing fresh cookies for the exact host. If filters interfere, use the site's compatibility option and restore helpers afterward. You can try clearing only cached images and files under **Browser tools → Browsing data**, then restarting. Clearing cookies also clears the saved downloader cookie copies and signs you out. Site access and verification can still fail in an embedded browser or downloader.

### E-Hentai and ExHentai

Import cookies for the actual host; `ipb_member_id` and `ipb_pass_hash` are commonly needed, and ExHentai may also require `igneous`. Select **Original files** or **Resampled** before adding the task. Originals require account access and may consume image points; unavailable originals are reported rather than silently replaced.

In Browser, **E/Ex categories** lets you include any combination of ten categories and optionally enter a search. Select all for the broadest results your account can see. Collect and continue batches as needed. Site quotas and access restrictions still apply; the optional cooldown setting changes local retry behavior, not the site's rules.

## Speed, images and media

In Preferences or beside the queue address bar, set **workers** (1–50 per task), **active galleries** (1–5) and request **delay** (0.2–30 seconds). Higher concurrency does not override server limits or delay. A speed cap is also available.

For Kemono, Original is the default; optional 1.5× or 2× enlargement uses the local waifu2x model or Lanczos resizing. Originals are retained. Compare the original and enlarged previews: increasing pixel dimensions does not necessarily improve detail. JMComic strip restoration can be toggled in Preferences; it depends on the site's image format.

Pawchive and Kemono tasks can include accessible video, audio, archive and supported document attachments as well as images. Pixiv artwork and supported ugoira can retain original frames and timing, with an animated WebP preview when conversion succeeds. File availability and format depend on the source and your account.

## Browser tools

- **Ad blocking:** configure bundled ad/tracker lists, cosmetic filtering, popups and site exceptions; reload after changing cosmetic rules.
- **Translate:** in-page translation defaults to a no-key Microsoft text service; optional DeepL, Azure and LibreTranslate settings are available. Selected text is sent to the translation provider after you request translation. Images are not OCR-translated.
- **Scrolling:** infinite scroll attempts to append supported same-origin result pages; Force mode can use common pagination or Load more controls. Auto-scroll supports 20–2000 pixels per second. Supported appended booru results offer one to five columns. Not every site exposes a compatible next page.
- **ppixiv:** enable or disable the bundled Pixiv viewer in **Browser tools → Plugins**. Its on-page toolbar can be shown or hidden; sign in to Pixiv where required. The viewer and FileFapper downloads are separate features.
- **Tab sessions and browsing data:** save, restore, rename, import or export tab sets, and clear selected browser data. Tab sessions hold up to 100 URLs each; adding a session that exceeds the open-tab limit requires replacing or closing tabs.

Keyboard shortcuts include Ctrl+T (new tab), Ctrl+W (close tab), Ctrl+L (address bar) and Ctrl+Tab (next tab). FileFapper does not install your regular browser's extensions. See [CEF browser details](BROWSER-CEF-1.0.md).

## Appearance, backups and extensions

Choose a color theme or character template from the theme controls. Templates offer background brightness and framing options; queue space and panel opacity are adjustable. Preferences also include compact navigation, clipboard monitoring, always-on-top and thumbnail visibility.

Tasks, preferences and tabs save locally. **Save session** exports task and settings data as JSON; **Load session** previews it and imports tasks paused. Session exports exclude cookies, saved passwords, service keys, scripts and downloaded media. Copy your files separately when moving computers.

To add or update a site, review [the site-script API](SITE-SCRIPTS.md), then import a trusted Python script in **Sites & scripts**. Scripts run with your Windows account's normal permissions; they are not sandboxed.

## When something goes wrong

- Check that the URL points to an individual supported gallery, post or chapter, and consult [site support](SITE-SUPPORT.md).
- For access errors, sign in or refresh cookies for the exact site and finish any verification yourself.
- For incomplete browser capture, wait for the reader to load and compare the page count.
- If a site changes, check for a FileFapper update or use a reviewed site script. A working regular browser does not guarantee that a separate downloader request will work.
- When reporting a problem, include the site, URL shape and error, but never share cookies, passwords or private account information.
