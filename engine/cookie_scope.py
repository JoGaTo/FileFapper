"""Preserve browser cookie scope through Requests preparation and redirects."""
from http.cookiejar import DefaultCookiePolicy
import time
import requests


def protect_session(session):
    """Requests merges into a fresh loose jar; reapply exact-host rules there."""
    if getattr(session, '_df_cookie_scope', False):
        return session
    original_prepare = session.prepare_request
    policy = DefaultCookiePolicy(strict_ns_domain=DefaultCookiePolicy.DomainStrictNonDomain)
    session.cookies.set_policy(policy)

    def prepare(request):
        prepared = original_prepare(request)
        prepared._cookies.set_policy(policy)
        # Keep explicitly supplied plugin/extractor headers. Normal jar headers
        # must be recomputed, since Requests initially uses its default policy.
        explicit = any(str(key).lower() == 'cookie' for headers in
                       (session.headers, request.headers or {}) for key in headers)
        if not explicit:
            prepared.headers.pop('Cookie', None)
            prepared.prepare_cookies(prepared._cookies)
        # PreparedRequest.copy() retains this jar policy on redirect hops.
        return prepared

    session.prepare_request = prepare
    session._df_cookie_scope = True
    return session


def scoped_session():
    return protect_session(requests.Session())


def install_cookie(jar, row):
    domain = str(row['domain']).strip().lower()
    host_only = row.get('hostOnly', not domain.startswith('.'))
    domain = domain.lstrip('.') if host_only else '.' + domain.lstrip('.')
    expires = None if row.get('session') else row.get('expirationDate')
    if expires is not None and expires <= time.time():
        return
    cookie = requests.cookies.create_cookie(
        name=row['name'], value=row['value'], domain=domain,
        path=row.get('path', '/'), secure=row.get('secure', False),
        expires=expires, rest={'HttpOnly': row.get('httpOnly', False),
                              'SameSite': row.get('sameSite', 'unspecified')})
    cookie.domain_specified = not host_only
    cookie.domain_initial_dot = not host_only
    jar.set_cookie(cookie)
