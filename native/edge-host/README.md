# D&F Edge browser host

The Electron application shell owns a private JSON-lines command pipe to this
.NET Framework helper. Website content cannot call that command pipe. The only
website-to-application message bridge accepts bounded GET requests from the
current HTTPS Pixiv top document to the two approved Pixiv image hosts.

Build with tools/build_edge_host.ps1. It uses the Windows Framework C# compiler
and the pinned, hash-verified official Microsoft WebView2 SDK package. The
installed Evergreen WebView2 runtime renders websites. A dedicated D&F profile
holds browser data; this helper does not open a personal Microsoft Edge profile.

Requests: { "id": 1, "method": "init", "params": { ... } }.
Replies: { "id": 1, "result": ... } or { "id": 1, "error": { "message": ... } }.
Events: { "event": "navigation-completed", "tabId": "...", "params": { ... } }.

init requires parentWindow as a decimal HWND string, an absolute userDataDir,
and optional qaMode. create makes a hidden native tab. Other private commands:
navigate, position, focus, goBack, goForward, reload, stop, close, cdp,
post-message, clear-data, resource-decision, and shutdown.

The parent owns cookie normalization, page-script evaluation, media replies and
ad-filter decisions. Resource requests receive a bounded 1.5-second deferral and
are allowed if the app's filter fails to answer. The native resource handler
sets Pixiv's fixed media Referer. Default page context menus and allowed media
downloads remain native; executable and unknown file downloads are cancelled.

Native permission requests are denied. Page navigation accepts HTTP, HTTPS and
about:blank only. New windows are handed to the application's tab manager.
Unexpected helper EOF or parent-window closure disposes all native controllers.

set-fixtures is available only after init with qaMode, only through trusted
application IPC. routes accepts objects with hostname (or *), optional exact url,
path, method, status, headers, and body or bodyBase64. blockUnmatched can prevent
all other HTTP(S) requests during tests. No website can configure fixtures.

Run DandF.EdgeHost.exe --self-test <fresh-profile-folder> to verify the installed
runtime on a blank local document. It reports actual runtime version, Edge user
agent and WebView2 page bridge identity without contacting production websites.

The SDK license and notices are copied next to the compiled helper. Source and
SDK package versions are pinned; the installed Evergreen runtime is serviced by
Microsoft. Full Edge and WebView2 use separate profiles, and a site accepting
full Edge does not guarantee acceptance of an embedded WebView2 session.

Each tab owns a native child HWND parented to the D&F window. WebView2 is parented to that child, rather than sharing the Electron top-level composition target. Position moves the child above the app compositor and uses controller-local (0,0) bounds. Hiding, closing and shutdown hide or destroy the child with the controller. surface-state is available only in an isolated QA profile to verify the HWND hierarchy, visibility and local bounds.

Position is idempotent: unchanged bounds and visibility do not call SetWindowPos, reassign controller bounds or toggle visibility. Parent movement can request a notification without forcing a redraw. QA surface-state exposes placement, size and visibility change counts to catch regression under repeated browser updates.

Allowed media downloads request a destination from the main app via the private download-requested event and download-choice command. The normal Electron-owned Windows Save As dialog selects or cancels the destination; the host completes its deferral with that result. Requests expire after two minutes and are canceled on shutdown. Web pages cannot issue download-choice commands.
