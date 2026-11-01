import json

from _support import ServerCase, payload


class SubmissionTest(ServerCase):
    def test_invalid_enum_types_return_json_errors(self):
        cases = [
            {"agency": []},
            {"answers": [{"layers": 1}]},
            {"answers": [{"layers": [{}]}]},
            {"decision": {"ndd": []}},
            {"decision": {"dd": {}}},
            {"decision": {"rm": 1}},
            {"decision": {"rm": [{}]}},
        ]
        for change in cases:
            with self.subTest(change=change):
                value = payload()
                value.update(change)
                status, body = self.request("/api/submit", value)
                self.assertEqual(status, 400)
                self.assertEqual(json.loads(body), {"ok": False, "error": "invalid"})

    def test_valid_submission_is_saved(self):
        status, body = self.request("/api/submit", payload())
        self.assertEqual(status, 200)
        self.assertTrue(json.loads(body)["ok"])

