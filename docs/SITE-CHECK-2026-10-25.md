# Session and site-access verification — October 25, 2026

Version **1.0.1-Alpha**, build **2026.10.25-session-recovery**.

The reported site was **JMComic at `18comic.vip`**. This update addresses reproducible cookie-import and access-detection faults inside FileFapper. It does not establish that every account, region, embedded browser or downloader connection will be accepted by that site.

## Public observation

A bounded, unauthenticated public check of `18comic.vip` on October 25 returned **HTTP 403**. No private credentials were submitted, no production CAPTCHA was solved, and no successful authenticated gallery download is claimed. Other production sites were not re-audited as part of this session-recovery check. Earlier observations remain dated in [the October 20 audit](SITE-CHECK-2026-10-20.md) and [the October 21 connection audit](SITE-CHECK-2026-10-21.md).

Cloudflare's current [supported-browser documentation](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/) gives embedded browsers limited support and says browser automation is unsupported for solving production challenges. It also identifies content-blocking extensions as a possible source of interference. FileFapper's exact-host compatibility option can pause its filters and page helpers, while ordinary browser verification remains the user's action. Clearance may still depend on a browser or connection and may not transfer to the downloader.

## Corrected local faults

| Area | Reproduced behavior before the fix | Current behavior |
|---|---|---|
| Extension cookie scope | Explicit `hostOnly` could be lost. A bare Domain cookie could fail to reach `www`, while a dotted host-only export could acquire subdomain scope. | Preserve the explicit flag and normalize domain punctuation accordingly. Omit Domain entirely when installing host-only cookies in Chromium. |
| Netscape cookies.txt | The include-subdomains TRUE/FALSE column was ignored. | Read that column and preserve the intended scope independently of leading-dot spelling. |
| Session and SameSite attributes | Exporter variants could be mishandled, and a stale expiry field could invalidate a session cookie. | Normalize supported SameSite spellings and retain session status, Secure and HttpOnly. Session status takes precedence over a carried expiry value. Invalid browser constraints remain errors. |
| Cookie prefixes | A valid `__Host-` import could fail when FileFapper supplied a Domain attribute. | Valid `__Host-` imports remain Secure, host-only and `/` scoped. Invalid `__Host-` or `__Secure-` constraints are reported rather than silently changed. |
| Import reporting | A saved-vault count could appear successful even when Chromium rejected its browser copy. | **Cookies & accounts → Saved cookie domains** shows stored, browser-accepted and browser-rejected counts, plus a value-free explanation when needed. |
| Replacing cookie scope | Chromium could retain host-only and Domain copies with the same canonical host, path and name after re-import. | Install the validated replacement, then expire only the stale opposite-scope copy. Other paths and child hosts stay intact. A rejected replacement preserves the current browser cookie. |
| Downloader cookie scope | Requests' default preparation could send an exact-host cookie to a subdomain. | Preserve the host-only flag in the worker and apply exact-host matching to prepared requests, redirects, extractor sessions and individual image sessions. Domain cookies keep their intended subdomain scope. |
| Readable JMComic chapters | A hidden passive verification widget or stale hidden challenge form could be mistaken for an active access check. | Recognize positive chapter-image/lazy-source evidence while still identifying real visible challenges, locked readers, sign-in pages and hard blocks. |
| Browser recovery | An earlier HTTP 401/403 could remain after the site loaded readable content. | Recheck the current page and recover only with positive readable-content evidence. Blank documents do not clear access errors; 404, cooldown and server-error states remain distinct. |

## Verification method and limits

Local unit and browser fixtures exercise cookie parsing, domain boundaries, prefix constraints, expiry/session handling, positive readable chapter evidence, hidden widgets, visible challenges, locked readers and retained HTTP failures. The browser recovery tests also reject a page that navigates during the check.

The Electron cookie-session integration test uses a fresh isolated profile, Windows-encrypted storage, synthetic `fake.test` cookie values and blocked HTTP(S) requests. It checks actual Chromium acceptance/rejection, both directions of host-only/Domain replacement, preservation of same-name cookies on unrelated paths and child hosts, no plaintext fixture values in the encrypted vault or public snapshots, and restoration after restarting the test app. No personal browser profile or production login is a fixture input.

These checks establish local behavior. They do not test an authenticated production session or prove successful site verification. Build verification reports record the source or packaged target separately.

## Updating an existing profile

Close older FileFapper windows, open this build, and re-import the site's original cookie export once. Old vault entries cannot recover explicit scope flags already discarded by older code. Keep the exported attributes intact and review the new stored/accepted/rejected summary.

Saving a password remembers sign-in form details; successful sign-in creates an active session. Open the exact host, complete any genuine site check in a regular browser if needed, and import its cookies. In FileFapper, choose **Sync & resume** only after the page is readable. If the embedded browser or downloader still receives an access refusal, the site has not granted that connection access. [The user guide](USER-GUIDE.md#cookie-and-access-recovery--october-25-2026) contains the full recovery sequence.

The eighteen themes and seven approved artwork templates remain included. The earlier castle review image remains excluded; this update does not change the approved artwork.
