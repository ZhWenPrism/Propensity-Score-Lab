import csv
import io
from _support import ServerCase, payload


class CSVRowWidthTest(ServerCase):
    def test_different_question_counts_keep_columns_aligned(self):
        short = payload()
        long = payload()
        long["answers"] = long["answers"] * 3
        for value in (short, long):
            self.assertEqual(self.request("/api/submit", value)[0], 200)
        status, body = self.request("/api/submissions.csv?key=example-key")
        self.assertEqual(status, 200)
        rows = list(csv.reader(io.StringIO(body.decode("utf-8-sig"))))
        self.assertEqual([len(row) for row in rows], [15, 15, 15])
        self.assertEqual(rows[1][-4:], ["", "", "", ""])
