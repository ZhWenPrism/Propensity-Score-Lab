from urllib.error import HTTPError
from urllib.request import Request

from _support import ServerCase, payload


class APIHeadTest(ServerCase):
    def response(self, path, method):
        try:
            response = self.client.open(Request(self.base + path, method=method), timeout=3)
        except HTTPError as error:
            response = error
        with response:
            return response.status, response.read(), response.headers

    def test_head_matches_get_status_headers_and_authentication(self):
        self.assertEqual(self.request("/api/submit", payload())[0], 200)
        for path in ("/api/health", "/api/submissions.csv?key=example-key",
                     "/api/submissions.csv?key=wrong", "/api/missing", "/index.html"):
            with self.subTest(path=path):
                status, body, headers = self.response(path, "GET")
                head_status, head_body, head_headers = self.response(path, "HEAD")
                self.assertEqual(head_status, status)
                self.assertEqual(head_body, b"")
                for name in ("Content-Type", "Content-Length", "Cache-Control",
                             "Content-Disposition"):
                    self.assertEqual(head_headers.get(name), headers.get(name))
                self.assertEqual(int(head_headers["Content-Length"]), len(body))
