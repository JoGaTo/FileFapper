# FileFapper v1.0 — User guide

## Start or update

Close older FileFapper windows and open **FileFapper.exe**, or install the app using **FileFapper.msi**. The sidebar must say **v1.0**; hover over it to check build **2026.10.29-filefapper-100-cef**.

The Windows package includes the downloader, application runtime and Chromium Embedded Framework (CEF). A separate Python, Node.js, Chrome, Edge or WebView2 installation is unnecessary.

Your normal **%APPDATA%\D&F** application profile retains preferences, tasks/order, gallery paths, saved accounts and the encrypted cookie vault. Existing gallery folders and manually paused tasks remain available. An older window keeps its old code until closed. The CEF website profile is separate from your personal browsers and the old FileFapper Edge profile. The encrypted FileFapper cookie vault is restored into CEF; browsing cache and site storage in the old Edge profile are not copied.

The v1.0 installer is registered separately from the older FileFapper Alpha installer. If you installed the alpha, both may appear in Windows installed apps. They use the same existing FileFapper profile, so close the older version before opening v1.0.

## CEF browser — v1.0

The Browser workspace uses the bundled **Chromium Embedded Framework** through FileFapper's native browser helper. It supports **100 open tabs**. Opening, importing and restoring tabs use the same limit. Saved sessions can contain 100 URLs; appending a session that would exceed the limit stops before adding any of it. Choose **Replace open tabs** or close unneeded tabs first. Restored tabs load as selected.

On the first use of CEF browsing, FileFapper imports valid cookies from its encrypted vault into its own CEF profile. Personal Edge sign-ins, extensions and password storage are not shared with FileFapper. Cookies and saved passwords serve different purposes: a saved password can fill the exact site's sign-in form, while a successful sign-in creates the active website session.

For **18comic.vip** or another site that works in your regular browser:

1. Open the exact site or chapter address in FileFapper Browser. Allow the browser to finish loading.
2. If sign-in is requested, use **Fill saved login** or sign in manually, then use the site's sign-in control. Complete any site verification yourself.
3. If the site is already signed in only in your regular browser, export its cookies as Netscape .txt or extension JSON. Use **Cookies & accounts → Import .txt or .json** or **Import pasted cookies**. Review the stored, browser-accepted and browser-rejected counts under **Saved cookie domains**.
4. Reload that same host in FileFapper. Once the chapter is readable, choose **Sync & resume**. That refreshes downloader cookies and retries tasks paused for access on the host. Use an individual gallery or chapter URL when adding a download.
5. If the page repeats a check, **Try site compatibility** pauses FileFapper's filters and page helpers for that host. **Restore site helpers** returns it to the usual behavior.

The owner reported that JMComic works in ordinary Edge, Firefox and Thorium. CEF is an embedded browser with FileFapper's own session, so changing the engine alone does not guarantee that the site will accept it or a downloader connection. See [CEF browser details](BROWSER-CEF-1.0.md) for profile, runtime and verification scope.

Existing galleries and themes remain available; new downloads use the site-and-date layout described below.

## Cookie and access recovery — October 25, 2026

The October 25 cookie fixes remain part of v1.0. They correct handling that could leave a site signed out in the built-in browser even after an import reported success. A saved username/password and a signed-in session are separate: saving a password remembers form details; the site's successful sign-in creates the session cookies used by the browser and downloader.

For the reported JMComic host, **18comic.vip**, use this sequence:

1. Close older FileFapper windows and open **v1.0**, build **2026.10.29-filefapper-100-cef**.
2. In your regular browser, confirm that the exact site address opens a readable chapter. Complete any genuine sign-in or verification yourself. If the embedded browser repeats a check, **Try site compatibility** can pause FileFapper's filters and automatic helpers for that exact host; **Open in regular browser** opens your usual browser.
3. Existing valid vault cookies migrate on first CEF use. If the site still needs a session, export fresh cookies from the browser where it works, preserving their original attributes, and choose **Import .txt or .json** or **Import pasted cookies** in **Cookies & accounts**. Re-import is also needed if an older build discarded scope flags, the site expired the session, or the import summary reports rejected entries.
4. Read the status under **Saved cookie domains**. It reports how many cookies were **stored**, **accepted by the built-in browser**, or **rejected by the browser**. A stored count alone does not confirm that the browser installed the cookies or that the site accepted the session. Re-export the original cookies if the status reports rejected attributes. Values stay hidden.
5. Reload the same host in FileFapper Browser. Once the page is readable, choose **Sync & resume** to refresh its downloader cookies and resume tasks paused for access on that host. If the browser still shows a check, sign-in page or access error, that action waits for a readable page. After importing cookies from a regular browser, a task's **Resume** control can also make an explicit new download attempt.
6. If the site still refuses the embedded browser or downloader, keep the task paused and use its error details to distinguish verification, sign-in, a missing page or a connection failure. A site may bind clearance to a browser or connection; importing cookies does not guarantee that clearance transfers.

Cookie imports now retain extension `hostOnly` flags and Netscape cookies.txt's include-subdomains column. A host-only cookie stays limited to its exact host; a Domain cookie retains its subdomain scope. SameSite spellings from common exports are normalized, session cookies ignore stale exporter expiry fields, and Secure/HttpOnly attributes are preserved. Valid `__Host-` cookies are installed without a Domain attribute and keep their required Secure flag and `/` path. Invalid prefix constraints are reported instead of silently changed. If the same host/path/name changes scope, FileFapper removes only the stale opposite-scope browser copy; other paths and child hosts remain intact.

Readable JMComic chapter images, including lazy-loaded sources, no longer become an access failure merely because a hidden passive verification widget remains in the page. A genuine visible challenge, sign-in page or server block still requires recovery. The browser can clear an earlier HTTP 401/403 after the site loads real readable content; an empty page cannot clear that error, and missing-page, cooldown and server errors keep their own status.

A bounded public check of `18comic.vip` returned HTTP 403 on October 25. The fixes were verified with local fixtures and isolated synthetic cookie sessions; that does not establish a successful production verification or authenticated download. Cloudflare lists [embedded browsers as having limited support](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/). See [October 25 verification notes](SITE-CHECK-2026-10-25.md) for the evidence and scope.

## Character templates — October 22, 2026

The **October 22 appearance build** was **1.0.1-Alpha**, build **2026.10.22-final-templates**. Its artwork remains included in the current v1.0 build. Seven approved character templates are installed alongside the ordinary themes, for eighteen themes in total. The October 22 appearance update did not change site adapters; the October 27 catalog now contains 50 active profiles.

Choose a theme in **Preferences → Appearance**, or use its sidebar dot. The seven character cards show their installed artwork:

- **対魔忍アサギ**: four fighters on a city street at night.
- **戦姫サバイバルサガ**: the colored horned duo on a forest island.
- **세계수를따먹다**: the generated fantasy trio in a blossom grove.
- **助っ人参上!!**: the original baseball pair enlarged to 6342 × 8192, with no generative redraw. Its default framing is **Medium full shot** (heads to around the knees).
- **巨乳魔女**: the approved pair inside a luxurious magical academy.
- **母娘丼おっぱい特盛母乳汁だくで**: the approved v2 pair on the Kyoto-inspired seaside bridge at sunset.
- **巨乳ファンタジー**: the eleven-character modern-club scene, with the closer foreground trio, connected arm poses, compact tiara and upper-left weapon removed. Its installed artwork is 1836 × 857 and defaults to **Show full image**. The earlier castle review image is not installed as a theme.

The artwork covers the workspace between the title bar and status bar. In Download queue, the artwork toolbar provides:

- **Queue room → Less / More / Full width**: give the queue about 42%, 76% or all available width. Narrow windows retain enough room for controls; opening Details can widen a small queue.
- **Framing → Fill workspace / Show full image**: Fill crops proportionally to cover the workspace; Show full image preserves every edge and can leave margins. The baseball template also has **Medium full shot**, with a soft extension filling the remaining width. Each character template remembers its own framing. Resizing the window adjusts the framing to the workspace independently of queue width.
- **Background**: darken or brighten only the artwork from 40% to 160%; 100% keeps its original brightness. Each special template remembers its own setting. Text and control brightness stay unchanged.
- **Control opacity**: adjust the remaining small control fills (saved range 35–100%; controls retain at least 80% backing). Large panel fills have been removed from the queue, headings, counters, toolbars, notices and site descriptions. Dark templates use a soft outer glow with a dark edge; the two light templates use a dark drop shadow around light text. Small labels and descriptions over the artwork use pure white and a heavier weight. Controls have stronger borders, compact padding and readable font sizes. The artwork remains visible through open task rows; hover and selection add a temporary tint. Inspector and dialog controls retain their working surfaces.
- **Artwork only / Show queue**: temporarily hide or restore the queue. Escape also restores it. Downloads continue. This viewing state resets when changing theme/page or reopening FileFapper so the queue stays accessible.

Queue width, control opacity and each template's framing save automatically and travel with Save session / Load session. Switching to an ordinary theme restores its normal full-width layout. Compact/full sidebar, task selection, filters, list/icon view, task menus and task previews work with every theme.

## Reader and saved-account update — October 20, 2026

These reader and saved-account changes were introduced in **1.0.0-Alpha** and remain included in the current release. Close every older FileFapper window before opening the new launcher.

- HentaiHere reads its new embedded chapter manifest, including all pages when the address displays only page 1. Hentai2Read supports its current reader data as well as older chapter extractors. A complete modern chapter address is `/reader/BOOK-ID-title/CHAPTER-ID/page-1`; a `/reader/BOOK-ID-title/` address is incomplete and returns a missing-page error. Open the title on the site, choose a chapter, and queue that chapter link. For the reported Hentai2Read book, its public search metadata points to https://hentai2read.com/original/70543-the-mage-girl-who-got-turned-into-a-maid . That title page still required a browser access check during verification.
- HentaiEnvy, HentaiRox and HentaiZap follow the gallery’s own first-reader link, then read the full ordered page manifest and each page’s file extension. Public galleries do not require a saved password simply because the old layout parser returned no images.
- HentaiFox, HentaiEra and IMHentai retain their existing gallery extraction and accept direct `/g/ID/PAGE/` addresses through the same reader wrapper. HentaiHand accepts a missing language/category value in its comic API. Multi-chapter HentaiHand responses are identified rather than silently saving only the first chapter. MyHentaiGallery’s current `/a/ID` and `/g/ID` address formats are recognized in search matching.
- Recognized access checks pause affected downloads and other queued/active tasks on that host. Other sites continue. FileFapper collection and infinite scrolling stop on a challenge page. Cloudflare challenge resources are allowed through ad blocking. **Sync & resume** is available after the page becomes readable; repeated checks offer **Open in regular browser** and cookie import.

### Remember a site login

1. Open **Cookies & accounts → Saved site logins**.
2. Enter the exact HTTPS site or sign-in address, username/email and password. Choose **Save encrypted login**. To update the password, save that same site and username again.
3. Choose **Open sign-in page**. FileFapper fills a recognizable sign-in form for that exact origin. Use the site’s **Sign in** button and complete any CAPTCHA or two-factor step. It does not submit passwords in the background.
4. Supported site cookies sync to the downloader automatically, including session-only cookies. The browser profile and encrypted cookie vault restore them when FileFapper reopens. Sites can still expire or revoke a login.

**Fill saved login** fills the current tab on demand. **Fill current tab** on a saved-account row selects that account when several exist for the same site. Automatic filling can be switched off per account; it is also skipped when more than one enabled account matches. A login saved for `https://site.example` is not filled into HTTP, another port, `www.site.example`, another subdomain, a lookalike host, a registration/password-change form, or a form that submits to a different origin. Save the exact address actually used by the site. Inputs already containing a password are left intact. Dynamically opened forms can use the manual Fill command.

Passwords are kept separately in `accounts.bin`, encrypted by Windows for your Windows account. Cookie values remain in encrypted `cookies.bin`. Passwords are not given to downloader workers or imported site scripts, returned in app snapshots, or included in task/tab/session exports. Remote pages have no general app/vault bridge. A site can read the form values filled into its own page as part of a normal sign-in. Removing a saved login removes that vault entry; remove its cookies too if you want to sign out.

### Import existing logins

Choose **Import logins .csv / .json** and select a local export. Chrome CSV (`url,username,password`) and Bitwarden CSV (`login_uri,login_username,login_password`) are supported, including quoted commas and quotes. Files may contain up to 200 valid HTTPS accounts and 2 MB. Imports are validated as a complete batch before saving; the same origin/username updates its existing entry. The selected file stays on your computer; imported entries are saved in the encrypted vault.

A JSON file can be an array or an object with an `accounts` array:

```json
{"accounts":[{"url":"https://site.example/login","username":"your-username","password":"your-password","autoFill":true}]}
```

### Recover from CAPTCHA / access checks

Open the failed task’s site in Browser and complete the site’s check. Once its page is readable, choose **Sync & resume** to copy current cookies and resume only tasks paused for access on that host. FileFapper does not repeatedly retry all galleries against the same unresolved check. A normal Resume click explicitly retries a task.

If 18comic or another site keeps challenging the embedded browser, choose **Open in regular browser**, complete the check there, and import that browser’s cookies using an extension export. Check the stored/accepted/rejected summary, then explicitly resume the task. Some checks bind clearance to a browser or connection and still reject Python/downloader requests. Saving a password cannot solve a CAPTCHA, repair a 404, create account access, or guarantee a site will accept the built-in browser. The app does not solve or bypass CAPTCHA checks. Follow the current **October 25 cookie and access recovery** steps above when updating from an older build.

See **SITE-CHECK-2026-10-20.md** for the public HTML/manifest audit of 19 related sites. Reachable manifests were checked without downloading artwork. Challenge-blocked or unreachable sites are explicitly unverified; no private user accounts were used.

## Earlier 1.0.1-Alpha additions retained in 1.1.0

This is the Alpha validation release. It keeps the existing FileFapper application name and local profile. The version was renamed from 1.5.0 at the owner's request; the earlier functionality is included.

- Hentai Foundry picture search/tag/category/artist lists and FapReactor search/tag/category/user lists now open **Queue galleries**. TBIB search lists and AIBooru /posts searches use the same review-and-queue flow. Set a page/result limit, collect, then add the chosen posts as separate tasks.
- Select queue tasks by Ctrl-click, Shift-click, visible-task Ctrl+A, or **Select** mode. In Select mode, click to toggle tasks or drag over several. Switch Select off to drag and reorder.
- **Clear all** asks before stopping downloads and removing every queue task. Downloaded files and folders remain on disk. Clear completed remains available separately.
- Kemono enlargement offers bundled offline **waifu2x CUnet**, optional gentle cleanup, and a CPU fallback. Original size remains the default. Preview can switch between Server original and Enlarged, with a 100% actual-pixel option.
- Browsing Data opens its controls immediately and handles unavailable cache size. Closing the panel while an operation finishes keeps it closed.
- Pixiv image requests receive the required reference header. ppixiv media saves open Save As, fullscreen is available, and FileFapper scrolling leaves ppixiv's viewer in control. Browser tools offers Reload ppixiv and Original Pixiv view.
- Opening Pixiv as the first browser page initializes its viewer correctly. Concurrent restored-tab/navigation setup installs one copy, so switching the plugin off removes that copy. The bulk-selection toolbar floats over the queue and does not move rows between clicks.
- Steampunk, Cyberpunk, 戦姫サバイバルサガ, 対魔忍アサギ and 助っ人参上!! joined the original themes in Alpha. The October 21 character update added 세계수를따먹다 and installed four approved artwork templates. The October 22 update adds 巨乳魔女, 母娘丼おっぱい特盛母乳汁だくで and the modern-club 巨乳ファンタジー, for eighteen themes and seven artwork templates in total.

## Included features

- Hentai Foundry, The Big ImageBoard (tbib.org), FapReactor, AIBooru and Civitai bring the built-in list to 50 sites. AIBooru and Civitai are the two added AI art aggregators.
- The official ppixiv r257 viewer is bundled for Pixiv and independently switchable in Browser tools → Plugins.
- Video, audio, archives and supported document attachments keep their formats. Pixiv ugoira retains its original ZIP and frame timing, with animated WebP playback.
- Queue galleries supports an inclusive posted date range for E/ExHentai, Danbooru/AIBooru, booru search lists and Pawchive/Kemono creator/Posts listings.
- Summer, Winter, Ruby, Sapphire and Kawaii join Light, Dark, Black and Brown. All themes use contrasting text and controls.
- Right-click menus cover tasks, selections, search/collection results, site cards, browser tabs, previews, scripts, sessions, website links/media and the workspace.

## Add and manage downloads

Paste one HTTP/HTTPS gallery, artwork, post or chapter URL per line in the queue address box. Choose quality and workers, then Add downloads or Ctrl+Enter. Supported search/listing URLs open in Browser for review. An unsupported host needs an imported site script.

The progress counter uses files: a video or archive counts as one item. The narrow summary strip combines Active, Queued and Completed. The queue fills the remaining window. Details shows an optional selected-gallery panel. Drag tasks or use right-click → Move up/down to change order. Use status tabs, the site selector and text filter to narrow the list. Checkboxes, Ctrl-click, Shift-click and Select mode provide bulk resume, pause, stop and removal. Ctrl+A selects tasks matching the current filters when a text field is not focused. Removing from the list keeps downloaded files.

Pause stops its worker and retains finished files and usable partial transfers. Resume resolves the gallery again and verifies completed-file hashes. Stop keeps files but leaves the task stopped. Restart downloads again. Changing quality or enlargement invalidates that task's completed-file settings so different source representations are not joined during resume.

Right-click a task for Preview, Resume/Pause, Stop, Restart, reorder, Copy link, Show in Browser, Open externally, Open first file, Open folder, Move folder, Metadata, Remove from list and Delete folder. Moving/deleting requires an idle task. New downloads use a shared site-name and date folder, with original source names plus the gallery ID and a task suffix. If the site has no recognizable ID, FileFapper uses the task ID. Each task keeps its metadata in .filefapper inside the shared folder. Move and Delete affect only the chosen gallery; Delete asks before sending its files to the Recycle Bin. Earlier gallery folders keep their original layout.

## Media and previews

Pawchive/Kemono post or creator tasks include accessible image, video, audio, archive and supported document attachments. Preferences → Maximum posts per creator task bounds creator downloads. R34.app, Kurosearch and Rule34 React resolve recognized Rule34 IDs to their original source. Their browser capture also recognizes loaded video/audio sources and download/archive links in reader areas.

Supported images: JPG/JPEG, PNG, WebP, GIF, AVIF, BMP. Video: MP4, WebM, MKV, MOV, M4V, AVI, OGV. Audio: MP3, M4A, AAC, WAV, OGG, Opus, FLAC. Archives: ZIP/CBZ, RAR/CBR, 7z, TAR, GZ, BZ2, XZ. Other supported attachments: PDF, PSD, CLIP and plain TXT. Unknown/executable attachment types are excluded by built-in collection extraction. A file is never silently renamed from video/archive to JPG.

Images are decoded before commit. Other media receive signature/header checks; ZIPs need a readable central directory. Lengths and partial ranges are checked. Completed files have SHA-256 hashes for resume. These are transfer checks, not malware scanning of attachment contents. Archives remain intact and are not automatically unpacked or executed.

Preview shows images/animations and native controls for supported video/audio playback and seeking. Archives/documents show file information and Open file. Right-click a preview for the current file, folder, source or metadata. Chromium's codecs determine which media play inside FileFapper; Open file uses your Windows application for other formats.

## Pixiv, ppixiv and ugoira

This build includes a CEF startup adapter and avoids redundant panel redraws. The viewer-ready status means its actual screens have been constructed; a partially created app object is not treated as a ready viewer.

Open Pixiv in Browser. The bundled official ppixiv viewer runs only on https://www.pixiv.net and https://pixiv.net. Its source/version is pinned in this release. Sign in when Pixiv requires it. ppixiv supplies endless result browsing, artwork/manga viewing, bookmarks/follows, zoom, animation seeking and its own artwork context menu. Its Pp/Pixiv control switches to the original site where supported.

Browser tools → Plugins → ppixiv for Pixiv toggles it and reloads existing Pixiv tabs. Reload ppixiv restarts the viewer; Original Pixiv view opens the usual website in the same signed-in tab. The status reports whether its viewer and media bridge started. Sign in to Pixiv when required. Images, manga ZIPs and ugoira saves from ppixiv open a Save As dialog. FileFapper does not append pages into ppixiv's own endless results. FileFapper preserves ppixiv's artwork menu; tabs and text fields retain FileFapper/native menus. The cross-origin media bridge permits HTTPS GETs only to i.pximg.net and i-cf.pximg.net, with a 128 MB per-request limit. Queue larger artwork/animation URLs in FileFapper. Optional ppixiv features requesting unrelated third-party servers are not enabled by that bridge.

For FileFapper's downloader, use /artworks/ID for one work or /users/ID for a bounded creator task. Sync/import Pixiv cookies when needed. Static works use original-image links. An ugoira work produces:

- 0001.zip — original frame archive;
- 0001.frames.json — frame filenames and individual delays;
- 0001.webp — looping animation for the built-in preview.

Frame order and timing are preserved. The ZIP and JSON stay available if playback conversion is too large or fails. Conversion supports up to 3,000 frames, 50 MB per frame and 240 million total decoded pixels. The worker writes animated WebP without external FFmpeg. ppixiv separately offers its upstream browser download features, including ugoira MKV.

## Collect results by date range

1. Open an E/ExHentai results page, Danbooru/AIBooru /posts search, Rule34/Gelbooru/TBIB search listing, or Pawchive/Kemono creator profile or /posts listing in Browser.
2. Choose Queue galleries. Set Posted from and Posted through. Either endpoint may be blank; both selected days are included.
3. Set Additional result pages and Maximum collected galleries, then Collect results. This applies the range to the starting page and additional pages. Review the dates, checked count and status.
4. Filter/select the results, then Add downloads. Each result becomes its own task. Previously queued URLs are skipped and the usual automatic-start setting applies.

Dates use the site's posted calendar date as displayed or returned in metadata, without conversion into your Windows time zone. Posts with no usable date are counted as undated and excluded while a range is set. Clearing both dates includes them again. Date and collection size preferences save locally and in session exports.

E/Ex reads gallery result-row/card dates and follows its next-gallery cursor. Booru lists can require a separate post-page request to obtain dates. Danbooru/AIBooru and Pawchive/Kemono use their post APIs without downloading attachments. Creator q/tag filters and Danbooru tags/page are retained. Existing browser cookies are synced before API collection.

The default is 10 additional pages and 500 matching galleries. Limits are 199 additional pages (200 total), 5,000 matches per batch and 10,000 queue tasks. A range filters the scanned batch; it does not search a whole site's history from one small batch. Use a site's own search/date controls to reach older work or continue batches. Danbooru's date: search tag can narrow the source search first.

Stop collecting, closing the review or navigating/closing the source tab cancels collection while keeping links found so far. Access failures and cooldowns are shown. Open next batch opens the continuation URL; choose Queue galleries there again. A partially scanned page is revisited, with already queued URLs deduplicated. A page with no date matches does not by itself end collection.

## E/ExHentai categories, cookies and originals

Browser → E/Ex categories shows all ten categories as inclusion checkboxes. Select any combination and an optional query; an empty query browses those categories without a text term. Open filtered results keeps other current filters and resets the cursor. Select all for the broadest results your account can see.

The site's f_cats parameter means EXCLUDED categories: 1022 includes Misc only, 1017 includes Doujinshi and Manga, 0 includes all ten. The picker calculates this. A complete category can exceed one batch; continue until available results end.

Cookies & accounts imports Netscape cookies.txt, common extension JSON exports or pasted exports. Browser → Sync cookies copies the current site's login into the downloader. E/Ex commonly needs ipb_member_id and ipb_pass_hash; ExHentai can also need igneous. Use cookies for the actual host. When updating from a build before **2026.10.25-session-recovery**, re-import the original cookie export once to restore scope attributes older builds discarded. Afterwards, re-import when the site expires them or the import summary reports an issue.

Original files require account access and may consume image points. Resampled uses the displayed version. Source recovery preserves this choice, with at most two image-source refreshes per page. Forced reloads can count against image hits. TLS verification stays enabled. Missing originals are reported instead of silently substituted with resampled images.

The two 1.4.0 opt-ins remain in Preferences → Downloads, both default off. Faster E/Ex gallery resolution uses 50 ms metadata spacing, 150 ms retry steps and a 250 ms minimum source-refresh interval. Skip automatic download cooldowns removes the downloader's 429/509 waiting path and uses bounded retries; persistent refusal ends as Failed. Browser/translation cooldowns and account access are separate. Resume an already waiting task after changing the switch.

The queue toolbar includes Pause all and Stop all. Both act on active and queued tasks together; Stop all also changes paused tasks to stopped. Files already saved remain available for resume.

## Workers, speed, enlargement and repair

Workers sets simultaneous file transfers within a task (1–50). Active galleries controls simultaneous tasks (1–5). Delay is the minimum interval between requests, in seconds (0.2–30); it can also be set beside the queue address bar. The per-task transfer cap offers further control. A higher worker count does not override server limits or the request delay.

Kemono image size offers Original, 1.5× and 2× for new tasks and an idle-task Details override. Original size is the default and is the best choice when the source is already detailed. The default enlargement method is the bundled waifu2x CUnet model, trained for illustrations. It runs locally, using a compatible Vulkan GPU first and falling back to CPU; CPU only can also be selected. No images are uploaded and no service key is needed. The first model run may take longer while the graphics driver prepares it.

Keep Image cleanup Off to preserve texture. Gentle cleanup can help compression noise but may smooth small details. The model makes a 2× image; a 1.5× result is reduced from that model output. Lanczos remains available as a simple resizing option. Enlargement can alter lines or texture and cannot recover guaranteed ground-truth detail. Use the Preview's Server original / Enlarged buttons and 100% view to compare. A larger file is not necessarily a better image.

Processed files are lossless PNGs. Source bytes remain in originals/ and their hashes are checked on resume. Changing the method, cleanup, device or scale refreshes that task's processed files. Video/audio/archives and animated GIF/WebP stay intact. Enlarged still images over 160 megapixels or 32,768 pixels on either side are rejected. If the model fails, the task explains the error and keeps the source; choose Original size to continue.

JMComic's native adapter reverses horizontal strips from photo/scramble metadata before saving restored PNGs, preserving remainder rows. Turn off repair only for unmodified server images. A site algorithm change may need an updated script. WNACG has native gallery traversal.

## Search, new sites and rendered capture

Discover & search reads the first HTML results page for supported simple searches. Filter/check and Queue selected; the last 20 result lists save locally. Interactive search opens Browser. Choose an individual result or collect a supported listing.

Hentai Foundry accepts individual /pictures/user/ARTIST/ID URLs and picture search, tag, category and artist results. FapReactor accepts /post/ID plus search, tag/category and user result pages. TBIB accepts /index.php?page=post&s=view&id=ID and page=post&s=list&tags=... searches. AIBooru accepts /posts/ID and /posts?tags=... search results through native JSON. Paste a result URL or open it in Browser, choose Queue galleries, set the batch bounds, Collect results, review and Add downloads. Result pages become individual post tasks; they do not silently start an unbounded site download. Civitai accepts supported /images/ID and /posts/ID links through gallery-dl. Account/content visibility applies. Civitai model/checkpoint downloads are outside these profiles. SITE-SUPPORT.md covers all 50 sites.

Comix, DoujinHentai, Ikuhentai, Toonkor and BlackToon have native readers and capture fallback. Open an individual chapter, sign in if necessary, choose long-strip/all-pages mode and wait. Queue rendered pages scrolls and collects loaded images/readable canvases. R34 frontend capture also accepts reader media/download URLs. Compare counts with the chapter. Capture is bounded to 2,000 entries / 100 MB of canvas data. Tainted/virtualized/encrypted canvases may need a script update. Cached canvases belong to this PC; transfer downloaded media when moving computers.

## Right-click and keyboard controls

Text fields: Undo, Redo, Cut, Copy, Paste, Delete, Select all. Browser address adds Paste and go / search; bare hosts and search words are accepted (DuckDuckGo).

Tasks/selections: gallery/file actions, ordering and bulk resume/pause/stop/remove. Search/collection results and site cards: copy/open/queue and select/deselect where applicable. Tabs: new, duplicate, copy address, close, close others, close tabs to the right. Previews: current file/folder, source, metadata. Script cards and session rows: management actions. Blank workspace: task/view/workspace preferences and guide. Selected text retains Copy. Shift+F10 or Menu opens a context menu; arrows/Home/End navigate custom menus; Escape dismisses.

Website menus include links/new tabs, image copy, media address/Save as, video/audio play/pause/mute/loop, navigation and translation. ppixiv retains its artwork menu. Website Save as uses FileFapper's save dialog and CEF download handling.

## Added sites and saved tags — October 27 update

The built-in catalog now contains 50 profiles. Added: Rule34 AI Art (rule34ai.art), Rule34.us, Rule34 Scroller (rule34.pw), Cartoon18, 177漫畫 (177picyy.com), Ho5ho, 大白兔漫畫 (dabaitu-mh.cc), HentaiDB, Doujiva and Kasei (kasei.cc).

- **Rule34 AI Art**: individual numeric post URLs; scoped article images and direct video sources.
- **Rule34.us**: individual `index.php?r=posts/view&id=ID` posts. Search uses `r=posts/index&q=...`.
- **Rule34.pw**: `/post/ID` images or direct videos. Search tags use the site’s path syntax.
- **Cartoon18**: `/story/ID/full` chapters. A `/v/ID` series page offers chapter collection with Queue galleries; it is not saved as a gallery of cover images.
- **177漫畫**: `/html/YEAR/MONTH/ID.html` galleries, including all linked numbered reader pages. Pasting a later page starts collection at page one. The reader stops with an error if a page is unavailable or the 200 reader-page bound is reached.
- **Ho5ho**: an individual gallery or its `/server-N/` chapter reader; gallery pages can lead to their first reader server.
- **Doujiva**: individual manga/chapter pages with a complete numbered chapter manifest. The adapter decodes data without executing downloaded scripts.
- **HentaiDB**: comic detail URLs or `/comics/SLUG/read`; gallery pages lead to their own reader and the complete `window.CXR` page manifest is decoded without executing scripts. The Edge reader loaded successfully and its 82-page manifest was inspected. A separate direct HTTP request returned 403, so worker access can differ from the browser. If it does, load the reader and choose Queue rendered pages. External streaming players/HLS are not supported.
- **Kasei / 火星漫畫**: loads successfully in Edge. Numeric `/comic/ID/read/NUMBER` chapter URLs use the site’s chapter API. The public frontend’s reader code confirmed its API route and `image_url` page fields; this route has fixture coverage, not a live account download claim. For public-token addresses, open the chapter’s scroll reader and use Queue rendered pages; `.scroll-page` / `.h-page-img` pages are captured. A separate Python HTTPS request failed, so browser access and worker access can differ.
- **大白兔**: provisional reader profile with scoped image selectors and Browser capture. Its domain failed HTTPS during verification; the current reader structure could not be confirmed.

For the verified page formats, Queue galleries can review links on search/category result pages before adding individual tasks. Dynamic results must finish loading first; a site without accessible pagination may only expose the loaded batch. Date collection uses available posted dates; undated entries are excluded when a date range is set. On layouts that do not expose a complete reader, open one chapter and choose **Queue rendered pages**, then check its preview and page count. Capture is limited to the loaded reader; it does not collect hidden chapters or bypass sign-in/verification.

**Browser → Saved tags** stores up to 200 searches for **Kurosearch** and **R34 React**. Open that site’s search page, choose **Read current tags**, give the entry a name and save. You can also type tags directly. Exclusions such as `-water` are kept exactly. **Edit** updates an existing entry; **Remove** deletes it. **Apply search** restores separate selected tag chips and starts the site search. R34 React adds and verifies each chip individually. Kurosearch uses its official share-search route and keeps its current sort/filter settings. Standard `tag`, `-excluded` and `~optional` modifiers are supported, up to 80 tags per application; use underscores or quotes for a tag containing spaces. Grouped boolean expressions must be entered on the site itself. It refuses to write to a different site. Entries save with the local profile and full FileFapper session exports; tab-only exports contain URLs, not this library.

Auto-scroll now supports **20–2000 pixels per second**, under Browser tools → Scrolling. The speed moves the page; the separate request-delay and page-limit controls still apply.

## Browser, protection, translation and scrolling

Ctrl+T opens a tab, Ctrl+W closes, Ctrl+L focuses the address bar, Ctrl+Tab cycles tabs. Up to 100 tabs share FileFapper's CEF profile. Expand increases browsing space. Last open tabs restore by default and load when selected. Browser/filter runtime initializes on first use; ppixiv's bundle is read only when first needed on Pixiv.

Shield / Browser tools → Ad blocking controls bundled EasyList ads, EasyPrivacy trackers, cosmetic hiding and pop-ups. Allow/protect the site, add custom Adblock Plus rules or explicitly update lists. Reload pages after cosmetic changes. Extensions from your personal Chrome or Edge profiles are not installed in FileFapper.

Translate defaults to Microsoft's no-key in-page text service. It retains the current session, handles long/dynamically inserted text and accessible frames. Restore text stops and restores originals. Optional providers: DeepL Free/Pro, Azure Translator and your LibreTranslate service. Keys are encrypted separately and excluded from exports. Text is sent only after Translate; editable inputs/passwords/code and translate=no content are excluded. Artwork is not OCR-translated. The no-key service is best effort; errors/cooldowns pause it. Google public-page proxy remains a legacy option.

Infinite scroll appends linked same-origin results. Force mode can use numbered pagination, offsets or Load more controls. Rule34/E/Ex have dedicated rules retaining filters. It stops at repeated/end/access pages. Auto-scroll moves at a configurable speed, pausing when hidden or a dialog opens. Browser tools → Scrolling sets defaults, speed (20–2000 pixels/second), delay (1–15 seconds) and extra-page limit. E/Ex requests wait at least three seconds. Sites without an accessible loading mechanism can need a dedicated update. Pixiv uses ppixiv's endless browsing.

## Sessions, data and preferences

Tab sessions saves up to 50 named sets of 100 URLs. Restore appends/replaces tabs; rename/delete/import/export are available and cookies are excluded. Browsing data separately clears cache, history, site storage and browser cookies. Clearing cookies signs out and removes saved downloader cookie copies too. Saved account passwords remain until removed in Cookies & accounts.

Preferences, tasks/order, progress and recent searches autosave in %APPDATA%\D&F. Save session exports preferences/tasks/paths/results plus browser settings/tabs/history/sessions as JSON. It excludes cookie values, saved passwords, keys, scripts and media. Load session previews the count and pauses work before replacing the queue; imported tasks start paused. Moving PCs requires separate gallery copies, cookie imports and reviewed script installation. Damaged state is backed up before a fresh queue starts.

Light is default. Preferences or sidebar dots select all eighteen themes. Artwork layout choices, compact navigation, clipboard URL offers, always on top, thumbnails and list/icon view persist. Clipboard monitoring offers URLs and waits for Add to queue.

## Site scripts and troubleshooting

SITE-SCRIPTS.md and examples/example_site.py document the Python API, including mixed media and ugoira. Import a reviewed script in Sites & scripts; the manifest/host list is shown before trusting it. Enabled imports override built-ins. Scripts run with your Windows account's normal file/network permissions in a separate worker process; this is not a security sandbox.

Check engine verifies the packaged worker. Errors stay attached to tasks. Resume refreshes expiring links and retains verified files. Updated scripts can repair changed sites without a full rebuild. Availability, account visibility and regional access still determine results. Verification notes distinguish fixtures from live authenticated downloads. Keep password/cookie exports, accounts.bin and cookies.bin private; session files can still identify gallery URLs, titles and paths.


## Site compatibility and connection recovery — October 21, 2026

When a site repeats verification, choose **Try site compatibility** in its Browser alert. FileFapper remembers this exact host and reloads it with ad/tracker filters, cosmetic hiding, automatic saved-login filling, translation and scrolling helpers paused. Other sites keep their protection. Ads may appear on this host. Choose **Restore site helpers** to return it to normal; this reloads the page again. Manual sign-in and cookie syncing remain available.

**Reset verification cookies** removes only the current site's Cloudflare verification cookies and reloads the page. It keeps other cookie names (including ordinary session cookies), other sites' verification cookies and saved passwords. It does not guarantee that the site's next check will accept the connection.

A **server block** is shown separately from an interactive CAPTCHA. IkuHentai returned a server block in this audit; Comix and JMComic returned interactive checks. If compatibility does not help, use **Open in regular browser**. Cloudflare gives embedded browsers limited support, and browser clearance may not transfer to downloader requests. Complete checks yourself; FileFapper does not solve or bypass them.

For **DNS / address not found** errors, use **Check connection**. It checks whether Windows can resolve the site's address without changing DNS or network settings. Missing or failing domain records cannot be repaired by importing cookies. Retry when the domain returns, or use a replacement address only if confirmed by the site.

The seven approved character templates are installed in Appearance. Earlier review variants, including the uninstalled castle version, remain available separately in the image library.


## Inactive profile cleanup — October 21, 2026

The earlier cleanup removed two unreachable profiles from active choices. The current local catalog contains 50 active entries; October 27 checks and their scope are described above. Saved sessions retain their stored task data.

## FileFapper name and legacy sessions

FileFapper replaces the D&F name and uses a blushing panda icon. It retains the existing `%APPDATA%\D&F` profile, gallery ownership markers and version-1 session format. Existing DandF session JSON files still load through **Load session**; new exports use FileFapper filenames. No queue or account migration is required.

Light artwork templates now use dark dropdown text, including the opened option list. Browser Back, Forward and Reload buttons have solid backing, and every artwork template gives **Open site in Browser** a colored button.

## Compact tabs and shortcuts — 1.2.5-Alpha

Selecting a loaded tab reuses its page. Re-selecting the active tab does not navigate, reload or recreate its view. Restored tabs still load on first selection, and Reload remains available explicitly.

The compact tab strip keeps 15px labels and a close button. The numbered down-arrow beside New tab opens a native menu containing every open tab, including tabs outside the visible strip. The active tab is checked. Choose a title in this menu to switch to it; the 50-tab limit is unchanged.

Browser shortcuts now include Rule34.xxx, R34.app, Kurosearch, R34 React, rule34ai.art, Rule34.us, Rule34.pw, Danbooru, Gelbooru, TBIB, AIBooru and HentaiDB, alongside the existing gallery sites. A shortcut reuses an already-open matching address and its current page state. Otherwise it opens a new tab. The address bar navigates the current tab as usual.

The sidebar slogan is **DOWNLOAD & LOAD 'UP'**. Existing DandF/FileFapper session files and the saved profile remain compatible.

## Browser and tab controls - 1.2.5-Alpha

FileFapper supports up to 100 open tabs, and can save up to 50 named tab sessions with up to 100 URLs each. Existing session files continue to load. The active tab title is underlined. The < and > controls move the tab strip one tab; << and >> move it five. The numbered menu still lists all open tabs.

Right-click a tab or the browser workspace to sort by title, domain or most recently accessed, or close tabs on either side. Sort order keeps the selected tab and its current page. On supported native browser pages, the browser context menu also contains these commands; ppixiv keeps its own page context menu.

When ppixiv is active, Hide ppixiv bar and Show ppixiv bar control ppixiv's own search and image-viewer toolbars. The setting is remembered.

Browser tools > Scrolling includes an Image columns on added booru pages setting from one to five. It affects FileFapper-appended image results on supported Rule34 and booru pages; the original page is untouched. Sites with their own loading controls manage their own layout.


## AIBooru and connection troubleshooting - 1.2.6-Alpha

AIBooru posts added by infinite scroll use the site's blacklist. If the site has not initialized that filter, FileFapper shows an error and leaves the next page unopened so filtered posts are not exposed.

If HTTPS works in a regular browser but fails in FileFapper, first retry after restarting FileFapper. If it still fails, open Browser tools > Browsing data, select only Cached images and files, leave cookies, site storage and history unchecked, and clear the selected data. Restart FileFapper and try again. This does not prove whether the cause is the browser profile, site or network. Review any network security warning separately; do not enter credentials on an insecure connection.

## Text input after browsing - v1.0

Click a FileFapper text field to type after using a website. The browser gives keyboard focus back to the app while its window is active. Close older FileFapper windows before opening the updated build so that only one version uses the saved profile.
