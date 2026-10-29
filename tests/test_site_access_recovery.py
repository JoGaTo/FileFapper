"""Local HTML fixtures for access detection; no site requests or credentials."""
from pathlib import Path
import json
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'engine'))
from site_access import AccessError, check_html, classify_html


JM_IMAGE = '<img id="album_photo_1" data-original="https://cdn.example.test/media/photos/123/00001.jpg">'


class SiteAccessRecoveryTests(unittest.TestCase):
    def test_readable_jm_lazy_image_and_hidden_widgets_are_not_an_access_page(self):
        source = ('<title>Fixture chapter</title><main>' + JM_IMAGE + '</main>'
                  '<div hidden><form id="challenge-form"></form><input type="password">'
                  '<iframe src="https://challenges.cloudflare.com/widget"></iframe></div>')
        self.assertEqual(classify_html(source), {'kind': 'ok', 'readable': True})
        self.assertIsNone(check_html(source))

    def test_real_lazy_source_can_replace_a_loading_placeholder(self):
        status = classify_html('<title>Fixture chapter</title><img id="album_photo_2" src="/loading.gif" data-original="/media/photos/123/00002.webp">')
        self.assertTrue(status['readable'])

    def test_readable_jm_relative_source_is_supported(self):
        self.assertTrue(classify_html('<img id="album_photo_1" data-original="/image1.png">')['readable'])

    def test_hidden_reader_images_are_not_positive_readable_evidence(self):
        for attributes in ('hidden', 'inert', 'aria-hidden="true"', 'style="display: none !important"', 'style="visibility: hidden"'):
            with self.subTest(attributes=attributes):
                self.assertFalse(classify_html('<main ' + attributes + '>' + JM_IMAGE + '</main>')['readable'])

    def test_hidden_challenge_forms_do_not_block_an_otherwise_normal_document(self):
        for attributes in ('hidden', 'inert', 'aria-hidden="true"', 'style="display:none"', 'style="visibility:collapse"'):
            with self.subTest(attributes=attributes):
                check_html('<title>Fixture chapter</title>' + JM_IMAGE + '<aside ' + attributes + '><form id="challenge-form"></form></aside>')

    def test_placeholders_and_one_pixel_images_do_not_establish_reader_access(self):
        for attributes in ('src="/loading.gif"', 'data-original="/images/placeholder.png"',
                           'src="data:image/png;base64,AAAA"', 'src="about:blank"',
                           'src="javascript:void(0)"', 'src="/noimage.jpg"', 'src="/spinner.gif"',
                           'src="/login.html"', 'src="/real.jpg" width="1" height="1"'):
            with self.subTest(attributes=attributes):
                self.assertFalse(classify_html('<img id="album_photo_1" ' + attributes + '>')['readable'])
                with self.assertRaises(AccessError) as caught:
                    check_html('<title>Just a moment...</title><img id="album_photo_1" ' + attributes + '>')
                self.assertTrue(caught.exception.challenge)

    def test_real_challenge_title_cannot_be_masked_by_reader_content(self):
        for title in ('Just a moment...', 'Checking your browser', 'Fixture site CAPTCHA', 'Verify you are human'):
            with self.subTest(title=title), self.assertRaises(AccessError) as caught:
                check_html('<title>' + title + '</title>' + JM_IMAGE)
            self.assertTrue(caught.exception.challenge)

    def test_visible_challenge_forms_cannot_be_masked_by_reader_content(self):
        for marker in ('<main id="challenge-running">Verification</main>', '<form id="challenge-form"></form>',
                       '<form action="/cdn-cgi/challenge/verify"></form>', '<form action="/captcha/check"></form>'):
            with self.subTest(marker=marker), self.assertRaises(AccessError) as caught:
                check_html('<title>Fixture chapter</title>' + JM_IMAGE + marker)
            self.assertTrue(caught.exception.challenge)

    def test_server_block_title_is_denied_even_if_it_contains_a_reader_image(self):
        for title in ('Access denied', 'Sorry, you have been blocked', '403 Forbidden'):
            with self.subTest(title=title), self.assertRaises(AccessError) as caught:
                check_html('<title>' + title + '</title>' + JM_IMAGE)
            self.assertFalse(caught.exception.challenge)

    def test_signin_page_or_explicit_locked_reader_does_not_establish_access(self):
        for source in ('<title>Login — JMComic</title><input type="password">' + JM_IMAGE,
                       '<title>Fixture chapter</title><main id="readerApp" data-reader-locked="1">' + JM_IMAGE + '</main>'):
            with self.subTest(source=source), self.assertRaises(AccessError) as caught:
                check_html(source)
            self.assertFalse(caught.exception.challenge)
            self.assertFalse(classify_html(source)['readable'])

    def test_cloudflare_hard_block_is_not_a_pending_captcha(self):
        source = '<title>Attention required</title><div id="cf-error-details">Sorry, you have been blocked. Error code: 1020</div>'
        status = classify_html(source + JM_IMAGE)
        self.assertEqual(status['reason'], 'blocked')
        with self.assertRaises(AccessError) as caught:
            check_html(source + JM_IMAGE)
        self.assertFalse(caught.exception.challenge)

    def test_readable_chapter_is_not_blocked_by_ordinary_title_or_hidden_error_template(self):
        source = '<title>Forbidden city</title>' + JM_IMAGE + '<div hidden id="cf-error-details">Sorry, you have been blocked. Error code: 1020</div>'
        self.assertEqual(classify_html(source), {'kind': 'ok', 'readable': True})
        check_html(source)

    def test_existing_unlocked_manifest_and_reader_app_keep_readable_evidence(self):
        manifest = '<script data-reader-data>' + json.dumps({'images': ['https://cdn.example.test/001.jpg']}) + '</script>'
        app = '<main id="readerApp" data-reader-locked="0" data-reader-image-base="https://cdn.example.test/pages"></main>'
        for source in (manifest, app, '<div class="reading-content"><img src="/001.png"></div>'):
            with self.subTest(source=source):
                self.assertEqual(classify_html(source), {'kind': 'ok', 'readable': True})
                check_html(source)

    def test_empty_or_locked_manifest_is_not_positive_evidence(self):
        for source in ('<script data-reader-data>{}</script>', '<script data-reader-data>not json</script>',
                       '<main data-reader-locked="1">' + JM_IMAGE + '</main>',
                       '<div hidden><main id="readerApp" data-reader-locked="1">' + JM_IMAGE + '</main></div>'):
            with self.subTest(source=source):
                self.assertFalse(classify_html(source)['readable'])


if __name__ == '__main__':
    unittest.main()
