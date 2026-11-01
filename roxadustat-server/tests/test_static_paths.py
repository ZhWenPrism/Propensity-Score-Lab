import os
from pathlib import Path
import unittest
from urllib.parse import quote

from _support import ServerCase


class StaticPathTest(ServerCase):
    def test_windows_backslash_traversal_is_not_served(self):
        for method in ("GET", "HEAD"):
            with self.subTest(method=method):
                status, body = self.request("/..%5csecret.txt", method=method)
                self.assertEqual(status, 404)
                self.assertNotIn(b"outside site", body)

    @unittest.skipUnless(os.name == "nt", "Windows drive paths")
    def test_windows_drive_paths_are_not_served(self):
        target = quote(str(Path(self.temp.name) / "secret.txt"), safe=":")
        self.assertEqual(self.request("/" + target)[0], 404)

    def test_normal_static_paths_remain_available(self):
        status, body = self.request("/index.html")
        self.assertEqual(status, 200)
        self.assertEqual(body, b"Example site")

