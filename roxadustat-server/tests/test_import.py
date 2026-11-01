import os
import unittest
from unittest.mock import patch

from _support import load_server


class ImportTest(unittest.TestCase):
    def test_import_does_not_consume_host_program_arguments(self):
        with patch.dict(os.environ, {"BRA_PORT": "8090"}):
            module = load_server(["host-program", "--unrelated-option"])
        self.assertEqual(module.PORT, 8090)

