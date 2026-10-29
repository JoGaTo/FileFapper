# Site connection audit — October 21, 2026

Bounded public DNS and initial HTML checks, with no private credentials, gallery artwork downloads or automated CAPTCHA solving. These observations describe this connection at the time of the audit; they do not prove availability for another network or account.

| Site | Observed response | What the update can address |
|---|---|---|
| IkuHentai (`ikuhentai.net`) | Windows and independent public DNS found addresses; HTTP 403 with “Attention Required” and a Cloudflare hard-block document. | Recognize a server block separately from an interactive CAPTCHA. Offer site compatibility and a regular-browser action. The site decides whether to permit access. |
| Comix (`comix.to`) | DNS resolves; HTTP 403 with `cf-mitigated: challenge` and an interactive access-check document. | Per-host compatibility reload disables ad/tracker filtering, cosmetic hiding and automatic page helpers for that exact host. Verification-cookie reset is available. A successful production verification is not claimed. |
| JMComic (`18comic.vip`) | DNS resolves; HTTP 403 with `cf-mitigated: challenge`. | Same recovery controls. No live authenticated extraction or successful CAPTCHA completion was verified. |
| TMOHentai (`tmohentai.com`, also `www`) | Windows lookup returned `ENOTFOUND`; independent public DNS returned no IPv4 address (`ENODATA`). | Present this as a domain/address problem and provide a Windows/Chromium connection check. No replacement domain has been authenticated. |
| SakuHentai (`sakuhentai.net` and `www`) | Windows lookup failed; independent public DNS returned `SERVFAIL`. | Explain DNS failure separately from cookies and verification. No verified replacement address is supplied. |

The local adapter's direct requests and the search service did not receive identical IkuHentai responses. The direct connection returned the block above; a search-service view showed a cached/readable homepage. Availability is client/network dependent, so this update does not label the site universally down.

The application continues to protect unrelated sites. Compatibility choices are saved per exact hostname, so `comix.to` and `comix.ws` have independent settings. Verification reset removes only `cf_clearance`, `__cf_bm` and `cf_chl_` / `__cf_chl_` cookie names for the current URL. It retains ordinary login cookies and the encrypted saved-password vault.

Cloudflare documents [limited support for embedded browsers](https://developers.cloudflare.com/cloudflare-challenges/reference/supported-browsers/) and [possible challenge loops](https://developers.cloudflare.com/cloudflare-challenges/troubleshooting/challenge-solve-issues/). Its checks can still reject an embedded browser or a downloader after cookies have been imported.

Version **1.0.0-Alpha**, build **2026.10.21-site-recovery**. Character template designs are supplied separately for review and have not been applied to this build.
