from contextlib import closing
import json

from _support import ServerCase, payload


class AnswerContentTest(ServerCase):
    def test_incomplete_answers_are_not_saved(self):
        changes = [
            {"layers": []}, {"layers": None},
            {"layers": ["evidence", "method"]},
            {"reason": ""}, {"reason": "  \t\r\n  "}, {"reason": None},
        ]
        for change in changes:
            with self.subTest(change=change):
                value = payload()
                value["answers"][0].update(change)
                status, body = self.request("/api/submit", value)
                self.assertEqual(status, 400)
                self.assertEqual(json.loads(body), {"ok": False, "error": "invalid"})
        with closing(self.app.db()) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM submissions").fetchone()[0], 0)

    def test_complete_answer_keeps_its_selected_layer_and_reason(self):
        value = payload()
        value["answers"][0].update(layers=["method"], reason="  Example reason  ")
        self.assertEqual(self.request("/api/submit", value)[0], 200)
        answer = self.app.validate(value)["answers"][0]
        self.assertEqual(answer["layers"], ["method"])
        self.assertEqual(answer["reason"], "Example reason")
