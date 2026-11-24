from contextlib import closing
import json

from _support import ServerCase, payload


class SelectionCodesTest(ServerCase):
    def test_invalid_selection_codes_are_not_silently_discarded(self):
        changes = [
            {"answers": [{"id": "q1", "layers": ["unknown"], "reason": "Example"}]},
            {"answers": [{"id": "q1", "layers": ["evidence", "evidence"], "reason": "Example"}]},
            {"decision": {"ndd": "unknown"}},
            {"decision": {"dd": "unknown"}},
            {"decision": {"rm": ["unknown"]}},
            {"decision": {"rm": ["label", "label"]}},
        ]
        for change in changes:
            with self.subTest(change=change):
                value = dict(payload(), **change)
                status, body = self.request("/api/submit", value)
                self.assertEqual(status, 400)
                self.assertEqual(json.loads(body), {"ok": False, "error": "invalid"})
        with closing(self.app.db()) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM submissions").fetchone()[0], 0)

    def test_valid_optional_decisions_and_multiselect_are_preserved(self):
        value = dict(payload(), decision={"ndd": "approve", "dd": None,
                                        "rm": ["label", "monitor"]})
        self.assertEqual(self.request("/api/submit", value)[0], 200)
        self.assertEqual(self.app.validate(value)["decision"]["rm"], ["label", "monitor"])
