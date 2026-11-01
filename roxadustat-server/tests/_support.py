import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener

APP = Path(__file__).resolve().parents[1] / "app.py"


def load_server(argv=None):
    spec = importlib.util.spec_from_file_location("homework_server_test", APP)
    module = importlib.util.module_from_spec(spec)
    with patch.object(sys, "argv", ["server"] if argv is None else argv):
        spec.loader.exec_module(module)
    return module


def payload():
    return {"name": "Example", "agency": "fda",
            "answers": [{"id": "q1", "layers": ["evidence"], "reason": "Example"}]}


class ServerCase(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        root = Path(self.temp.name)
        self.app = load_server()
        self.app.SITE_DIR = str(root / "site")
        self.app.DATA_DIR = str(root)
        self.app.DB = str(root / "submissions.db")
        self.app.KEY_FILE = str(root / "teacher_key")
        Path(self.app.SITE_DIR).mkdir()
        (Path(self.app.SITE_DIR) / "index.html").write_text("Example site", encoding="utf-8")
        Path(self.app.KEY_FILE).write_text("example-key", encoding="utf-8")
        (root / "secret.txt").write_text("outside site", encoding="utf-8")
        self.app.Handler.log_message = lambda *args: None
        self.server = self.app.Server(("127.0.0.1", 0), self.app.Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.base = "http://127.0.0.1:" + str(self.server.server_port)
        self.client = build_opener(ProxyHandler({}))

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.temp.cleanup()

    def request(self, path, body=None, method=None):
        data = json.dumps(body).encode("utf-8") if body is not None else None
        request = Request(self.base + path, data=data, method=method,
                          headers={"Content-Type": "application/json"})
        try:
            with self.client.open(request, timeout=3) as response:
                return response.status, response.read()
        except HTTPError as error:
            return error.code, error.read()

