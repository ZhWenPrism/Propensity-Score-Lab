from pathlib import Path

from _support import ServerCase


class TeacherAuthTest(ServerCase):
    def test_non_ascii_invalid_key_is_forbidden(self):
        self.assertEqual(self.request("/api/submissions.csv?key=%C3%A9")[0], 403)

    def test_non_ascii_configured_key_is_supported(self):
        Path(self.app.KEY_FILE).write_text("é", encoding="utf-8")
        self.assertEqual(self.request("/api/submissions.csv?key=%C3%A9")[0], 200)

    def test_correct_ascii_key_is_supported(self):
        self.assertEqual(self.request("/api/submissions.csv?key=example-key")[0], 200)

