"""Offline request preparation and redirects; never contact real hosts."""
from pathlib import Path
import sys
import time
import unittest
import requests
from requests.adapters import BaseAdapter
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'engine'))
from cookie_scope import install_cookie, protect_session, scoped_session


class RedirectAdapter(BaseAdapter):
    def __init__(self):
        self.seen = []

    def send(self, request, **kwargs):
        self.seen.append(request)
        response = requests.Response()
        response.request, response.url = request, request.url
        response.status_code = 302 if len(self.seen) == 1 else 200
        response._content = b''
        if response.status_code == 302:
            response.headers['Location'] = 'https://child.fake.test/allowed/next'
        return response

    def close(self):
        pass


class CookieScopeTests(unittest.TestCase):
    def row(self, name, **extra):
        return dict(domain='fake.test', hostOnly=True, name=name, value='fixture',
                    path='/allowed', secure=True, session=True, **extra)

    def header(self, session, url):
        return session.prepare_request(requests.Request('GET', url)).headers.get('Cookie', '')

    def test_exact_host_and_domain_cookies_have_distinct_scope(self):
        session = scoped_session()
        install_cookie(session.cookies, self.row('host'))
        install_cookie(session.cookies, {**self.row('domain'), 'hostOnly': False})
        self.assertIn('host=', self.header(session, 'https://fake.test/allowed/p'))
        child = self.header(session, 'https://child.fake.test/allowed/p')
        self.assertNotIn('host=', child)
        self.assertIn('domain=', child)
        self.assertEqual(self.header(session, 'https://fake.test.evil.test/allowed/p'), '')
        self.assertEqual(self.header(session, 'https://fake.test/other/p'), '')
        self.assertEqual(self.header(session, 'http://fake.test/allowed/p'), '')

    def test_expired_cookies_stay_out_and_session_cookies_keep_session_status(self):
        session = scoped_session()
        install_cookie(session.cookies, {**self.row('expired'), 'session': False,
                                         'expirationDate': time.time() - 60})
        install_cookie(session.cookies, {**self.row('session'), 'expirationDate': 1})
        self.assertEqual(len(session.cookies), 1)
        cookie = next(iter(session.cookies))
        self.assertTrue(cookie.discard)
        self.assertFalse(cookie.domain_specified)
        self.assertIn('session=', self.header(session, 'https://fake.test/allowed/p'))

    def test_redirect_rebuild_cannot_restore_host_cookie_for_child_host(self):
        session = scoped_session()
        session.trust_env = False
        adapter = RedirectAdapter()
        session.mount('https://', adapter)
        install_cookie(session.cookies, self.row('host'))
        install_cookie(session.cookies, {**self.row('domain'), 'hostOnly': False})
        session.get('https://fake.test/allowed/start')
        self.assertEqual(len(adapter.seen), 2)
        self.assertIn('host=', adapter.seen[0].headers.get('Cookie', ''))
        self.assertNotIn('host=', adapter.seen[1].headers.get('Cookie', ''))
        self.assertIn('domain=', adapter.seen[1].headers.get('Cookie', ''))

    def test_extractor_sessions_and_per_image_cookie_copies_keep_scope(self):
        source = scoped_session()
        install_cookie(source.cookies, self.row('host'))
        extractor = protect_session(requests.Session())
        extractor.cookies.update(source.cookies)
        image = scoped_session()
        image.cookies.update(extractor.cookies)
        for session in (extractor, image):
            self.assertIn('host=', self.header(session, 'https://fake.test/allowed/p'))
            self.assertEqual(self.header(session, 'https://child.fake.test/allowed/p'), '')

    def test_server_created_host_only_cookies_and_explicit_headers_remain_supported(self):
        session = protect_session(requests.Session())
        cookie = requests.cookies.create_cookie(name='server', value='fixture', domain='fake.test')
        cookie.domain_specified = False
        session.cookies.set_cookie(cookie)
        self.assertIn('server=', self.header(session, 'https://fake.test/'))
        self.assertEqual(self.header(session, 'https://child.fake.test/'), '')
        request = requests.Request('GET', 'https://fake.test/', headers={'Cookie': 'explicit=fixture'})
        self.assertEqual(session.prepare_request(request).headers['Cookie'], 'explicit=fixture')
        self.assertIs(protect_session(session), session)


if __name__ == '__main__':
    unittest.main()
