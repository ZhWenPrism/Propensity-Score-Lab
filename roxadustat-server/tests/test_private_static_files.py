import os
from pathlib import Path
import unittest

from _support import ServerCase


class PrivateStaticFilesTest(ServerCase):
    def test_get_and_head_hide_data_files_inside_the_site(self):
        root = Path(self.app.SITE_DIR)
        self.app.DB = str(root / "submissions.db")
        self.app.KEY_FILE = str(root / "teacher_key")
        protected = [self.app.KEY_FILE] + [self.app.DB + suffix for suffix in ("", "-wal", "-shm", "-journal")]
        for file in map(Path, protected):
            file.write_bytes(b"private test fixture")
            for method in ("GET", "HEAD"):
                with self.subTest(file=file.name, method=method):
                    status, body = self.request("/" + file.name, method=method)
                    self.assertEqual(status, 404)
                    self.assertNotIn(b"private test fixture", body)
        self.assertEqual(self.request("/index.html"), (200, b"Example site"))

    @unittest.skipUnless(os.name == "nt", "Windows stream aliases")
    def test_windows_stream_alias_cannot_serve_private_data(self):
        key = Path(self.app.SITE_DIR) / "teacher_key"
        key.write_text("private test fixture", encoding="utf-8")
        self.app.KEY_FILE = str(key)
        self.assertEqual(self.request("/teacher_key%3A%3A%24DATA")[0], 404)

    def test_directory_index_cannot_serve_a_protected_file(self):
        self.app.KEY_FILE = str(Path(self.app.SITE_DIR) / "index.html")
        self.assertEqual(self.request("/")[0], 404)
