import csv
import io

from _support import ServerCase, payload


class CSVHeadingsTest(ServerCase):
    def test_question_headings_use_the_same_escaping_as_rows(self):
        value = payload()
        identifiers = ["=1+1", "+1", "-1", "@SUM", "q1"]
        value["answers"] = [dict(value["answers"][0], id=key) for key in identifiers]
        self.assertEqual(self.request("/api/submit", value)[0], 200)
        status, body = self.request("/api/submissions.csv?key=example-key")
        self.assertEqual(status, 200)
        rows = list(csv.reader(io.StringIO(body.decode("utf-8-sig"))))
        for position, key in enumerate(identifiers):
            expected = ("'" if position < 4 else "") + key
            self.assertEqual(rows[0][9 + position * 2:11 + position * 2],
                             [expected + " 选择", expected + " 理由"])
        self.assertEqual(len(rows[0]), len(rows[1]))
