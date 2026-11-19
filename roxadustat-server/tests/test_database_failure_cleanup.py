import io
import json
import sqlite3
import unittest
from unittest.mock import MagicMock, patch
from _support import load_server, payload


class DatabaseFailureCleanupTest(unittest.TestCase):
    def test_failed_schema_creation_closes_the_connection(self):
        app = load_server()
        con = MagicMock()
        con.execute.side_effect = sqlite3.OperationalError("schema failed")
        with patch.object(app.sqlite3, "connect", return_value=con):
            with self.assertRaisesRegex(sqlite3.OperationalError, "schema failed"):
                app.db()
        con.close.assert_called_once()

    def test_failed_export_query_closes_the_connection(self):
        app = load_server()
        con = MagicMock()
        con.execute.side_effect = sqlite3.OperationalError("query failed")
        with patch.object(app, "db", return_value=con):
            with self.assertRaisesRegex(sqlite3.OperationalError, "query failed"):
                app.export_csv()
        con.close.assert_called_once()

    def test_failed_submission_insert_closes_the_connection(self):
        app = load_server()
        body = json.dumps(payload()).encode("utf-8")
        handler = object.__new__(app.Handler)
        handler.path = "/api/submit"
        handler.headers = {"Content-Length": str(len(body))}
        handler.rfile = io.BytesIO(body)
        con = MagicMock()
        con.execute.side_effect = sqlite3.OperationalError("insert failed")
        with patch.object(app, "db", return_value=con):
            with self.assertRaisesRegex(sqlite3.OperationalError, "insert failed"):
                handler.do_POST()
        con.close.assert_called_once()
