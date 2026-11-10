import json
import socket
from urllib.parse import urlsplit

from _support import ServerCase, payload


class SubmissionEncodingTest(ServerCase):
    def test_invalid_text_returns_a_json_error_without_inserting_rows(self):
        for name in ({"unexpected": "object"}, "\ud800"):
            with self.subTest(name=name):
                value = dict(payload(), name=name)
                status, body = self.request("/api/submit", value)
                self.assertEqual(status, 400)
                self.assertEqual(json.loads(body), {"ok": False, "error": "invalid"})
        db = self.app.db()
        try:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM submissions").fetchone()[0], 0)
        finally:
            db.close()

    def test_incomplete_body_is_rejected_even_when_its_prefix_is_json(self):
        body = json.dumps(payload()).encode("utf-8")
        address = urlsplit(self.base)
        headers = (
            "POST /api/submit HTTP/1.0\r\n"
            f"Content-Length: {len(body) + 8}\r\n"
            "Content-Type: application/json\r\n\r\n"
        ).encode("ascii")
        with socket.create_connection((address.hostname, address.port), timeout=3) as client:
            client.sendall(headers + body)
            client.shutdown(socket.SHUT_WR)
            with client.makefile("rb") as response:
                status, raw = response.read().split(b"\r\n\r\n", 1)
        self.assertIn(b" 400 ", status.splitlines()[0])
        self.assertEqual(json.loads(raw), {"ok": False, "error": "invalid"})
