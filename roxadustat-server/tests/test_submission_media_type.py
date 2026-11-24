from contextlib import closing
import http.client
import json
from urllib.parse import urlsplit

from _support import ServerCase, payload


class SubmissionMediaTypeTest(ServerCase):
    def post_with_type(self, content_type):
        address = urlsplit(self.base)
        connection = http.client.HTTPConnection(address.hostname, address.port, timeout=3)
        headers = {} if content_type is None else {"Content-Type": content_type}
        try:
            connection.request("POST", "/api/submit",
                               body=json.dumps(payload()).encode("utf-8"), headers=headers)
            response = connection.getresponse()
            return response.status, json.loads(response.read())
        finally:
            connection.close()

    def test_unsupported_media_types_are_rejected_without_saving(self):
        for content_type in (None, "text/plain", "application/x-www-form-urlencoded"):
            with self.subTest(content_type=content_type):
                status, body = self.post_with_type(content_type)
                self.assertEqual(status, 415)
                self.assertEqual(body, {"ok": False, "error": "media_type"})
        with closing(self.app.db()) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM submissions").fetchone()[0], 0)

    def test_json_with_optional_parameters_is_accepted(self):
        for content_type in ("application/json", "application/json; charset=utf-8"):
            with self.subTest(content_type=content_type):
                status, body = self.post_with_type(content_type)
                self.assertEqual(status, 200)
                self.assertTrue(body["ok"])
