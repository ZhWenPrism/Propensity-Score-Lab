from urllib.error import HTTPError
from urllib.request import Request
from _support import ServerCase, payload


class APICachePolicyTest(ServerCase):
    def test_api_success_and_errors_are_not_cached(self):
        self.assertEqual(self.request("/api/submit", payload())[0], 200)
        for path in ("/api/health", "/api/submissions.csv?key=example-key",
                     "/api/submissions.csv?key=wrong", "/api/missing"):
            with self.subTest(path=path):
                try:
                    response = self.client.open(Request(self.base + path), timeout=3)
                except HTTPError as error:
                    response = error
                with response:
                    self.assertEqual(response.headers.get("Cache-Control"), "no-store")
    def test_home_page_keeps_revalidation(self):
        with self.client.open(self.base + "/index.html", timeout=3) as response:
            self.assertEqual(response.headers.get("Cache-Control"), "no-cache")
