from contextlib import closing
import http.client
import json
import socket
from urllib.parse import urlsplit

from _support import ServerCase, payload


class ContentLengthTest(ServerCase):
    def post_with_lengths(self, lengths):
        address = urlsplit(self.base)
        body = json.dumps(payload()).encode("utf-8")
        headers = ["POST /api/submit HTTP/1.0", "Content-Type: application/json"]
        headers.extend("Content-Length: " + value for value in lengths(len(body)))
        request = ("\r\n".join(headers) + "\r\n\r\n").encode("ascii") + body
        with socket.create_connection((address.hostname, address.port), timeout=3) as client:
            client.sendall(request)
            with http.client.HTTPResponse(client) as response:
                response.begin()
                return response.status, json.loads(response.read())

    def test_conflicting_lengths_are_rejected_without_inserting_rows(self):
        for lengths in (lambda n: [str(n), str(n + 1)],
                        lambda n: [str(n) + ", " + str(n + 1)]):
            with self.subTest(lengths=lengths):
                status, body = self.post_with_lengths(lengths)
                self.assertEqual(status, 400)
                self.assertEqual(body, {"ok": False, "error": "invalid"})
        with closing(self.app.db()) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM submissions").fetchone()[0], 0)

    def test_identical_lengths_are_accepted(self):
        for lengths in (lambda n: [str(n), str(n)],
                        lambda n: [str(n) + ", " + str(n)]):
            with self.subTest(lengths=lengths):
                status, body = self.post_with_lengths(lengths)
                self.assertEqual(status, 200)
                self.assertTrue(body["ok"])
