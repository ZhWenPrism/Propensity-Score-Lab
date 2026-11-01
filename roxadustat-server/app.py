"""Serve the 获益-风险评估沙盘 site and record homework submissions.

Standard library only (Python 3.6+). Static files come from BRA_SITE_DIR; submissions go to
SQLite in BRA_DATA_DIR. The teacher downloads them as CSV with the key stored in BRA_KEY_FILE:

    GET  /api/health
    POST /api/submit                       (JSON from homework.js)
    GET  /api/submissions.csv?key=<key>    (Excel-friendly UTF-8 CSV)

Environment: BRA_PORT (default 8080; or pass the port as the first argument), BRA_HOST (default 0.0.0.0;
127.0.0.1 when a reverse proxy sits in front), BRA_SITE_DIR, BRA_DATA_DIR, BRA_KEY_FILE.
"""
import csv
import hmac
import io
import json
import mimetypes
import os
import posixpath
import sqlite3
import sys
from datetime import datetime, timedelta
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import PureWindowsPath
from socketserver import ThreadingMixIn
from urllib.parse import parse_qs, unquote, urlsplit

HERE = os.path.dirname(os.path.abspath(__file__))
SITE_DIR = os.path.abspath(os.environ.get("BRA_SITE_DIR", os.path.join(HERE, "..", "demo")))
DATA_DIR = os.path.abspath(os.environ.get("BRA_DATA_DIR", os.path.join(HERE, "data")))
KEY_FILE = os.environ.get("BRA_KEY_FILE", os.path.join(DATA_DIR, "teacher_key"))
PORT = int(os.environ.get("BRA_PORT", "8080"))
HOST = os.environ.get("BRA_HOST", "0.0.0.0")
DB = os.path.join(DATA_DIR, "submissions.db")
MAX_BODY = 64 * 1024

AGENCIES = {"fda": "FDA", "ema": "EMA", "nmpa": "NMPA", "pmda": "PMDA"}
LAYERS = {"evidence": "证据不同", "method": "口径不同", "value": "价值不同"}
DECISIONS = {"approve": "批准", "conditional": "附条件批准 / 限定人群", "trial": "要求先做试验再说", "reject": "不批准"}
RISK_TOOLS = {"label": "说明书警告", "monitor": "Hb 监测与剂量规则", "restrict": "限定适用人群", "pass": "上市后安全性研究",
              "rems": "REMS / 额外风险管理", "trial": "批准前验证低剂量方案"}

mimetypes.add_type("image/webp", ".webp")
mimetypes.add_type("text/javascript", ".js")


def db():
    con = sqlite3.connect(DB, timeout=10)
    con.execute("CREATE TABLE IF NOT EXISTS submissions (id INTEGER PRIMARY KEY, created_at TEXT, name TEXT, agency TEXT, payload TEXT)")
    return con


def teacher_key():
    try:
        with open(KEY_FILE, encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


def clean(text, limit):
    return " ".join(str(text or "").split())[:limit]


def enum_list(values, choices):
    if values is None:
        return []
    if not isinstance(values, list) or any(not isinstance(value, str) for value in values):
        raise ValueError("bad selection list")
    return [value for value in values if value in choices]


def enum_choice(value, choices):
    if value is not None and not isinstance(value, str):
        raise ValueError("bad selection")
    return value if value in choices else None


def validate(data):
    """Return a sanitised submission or raise ValueError."""
    if not isinstance(data, dict):
        raise ValueError("bad payload")
    name = clean(data.get("name"), 40)
    agency = data.get("agency")
    answers = data.get("answers")
    if not name or not isinstance(agency, str) or agency not in AGENCIES or not isinstance(answers, list) or not 1 <= len(answers) <= 12:
        raise ValueError("missing fields")
    out_answers = []
    for a in answers:
        if not isinstance(a, dict):
            raise ValueError("bad answer")
        layers = enum_list(a.get("layers"), LAYERS)
        out_answers.append({"id": clean(a.get("id"), 12), "layers": layers, "reason": clean(a.get("reason"), 400)})
    d = data.get("decision") if isinstance(data.get("decision"), dict) else {}
    decision = {
        "ndd": enum_choice(d.get("ndd"), DECISIONS),
        "dd": enum_choice(d.get("dd"), DECISIONS),
        "rm": enum_list(d.get("rm"), RISK_TOOLS),
        "reason": clean(d.get("reason"), 400),
    }
    p = data.get("primary") if isinstance(data.get("primary"), dict) else {}
    return {"name": name, "agency": agency, "answers": out_answers, "decision": decision,
            "primary": {"ndd": clean(p.get("ndd"), 80), "dd": clean(p.get("dd"), 80)},
            "client_time": clean(data.get("client_time"), 40)}


def safe_cell(value):
    text = str(value)
    return "'" + text if text[:1] in ("=", "+", "-", "@") else text


def export_csv():
    con = db()
    rows = con.execute("SELECT created_at, payload FROM submissions ORDER BY id").fetchall()
    con.close()
    n_q = max([len(json.loads(p)["answers"]) for _, p in rows] or [0])
    head = ["提交时间（北京时间）", "姓名", "扮演机构", "NDD 结论", "DD 结论", "风险管理", "结论理由", "NDD 主要分析", "DD 主要依据"]
    for i in range(n_q):
        head += ["第 %d 题选择" % (i + 1), "第 %d 题理由" % (i + 1)]
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(head)
    for created, payload in rows:
        p = json.loads(payload)
        d = p["decision"]
        when = (datetime.strptime(created, "%Y-%m-%dT%H:%M:%SZ") + timedelta(hours=8)).strftime("%Y-%m-%d %H:%M:%S")
        row = [when, p["name"], AGENCIES[p["agency"]], DECISIONS.get(d.get("ndd"), ""), DECISIONS.get(d.get("dd"), ""),
               "、".join(RISK_TOOLS[k] for k in d.get("rm", [])), d.get("reason", ""), p["primary"].get("ndd", ""), p["primary"].get("dd", "")]
        for a in p["answers"]:
            row += ["、".join(LAYERS[k] for k in a["layers"]), a["reason"]]
        w.writerow([safe_cell(c) for c in row])
    return ("﻿" + buf.getvalue()).encode("utf-8")


class Handler(SimpleHTTPRequestHandler):
    server_version = "BRA"

    def translate_path(self, path):
        path = posixpath.normpath(unquote(urlsplit(path).path))
        parts = [p for p in path.split("/") if p and p not in (".", "..")]
        if any("\\" in part or PureWindowsPath(part).drive for part in parts):
            raise ValueError("invalid static path")
        root = os.path.realpath(SITE_DIR)
        resolved = os.path.realpath(os.path.join(root, *parts))
        if os.path.commonpath([root, resolved]) != root:
            raise ValueError("static path leaves the site directory")
        return resolved

    def send_head(self):
        try:
            self.translate_path(self.path)
        except ValueError:
            self.send_error(404, "Not found")
            return None
        return SimpleHTTPRequestHandler.send_head(self)

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.log_date_time_string(), urlsplit(self.path).path))

    def end_headers(self):
        if urlsplit(self.path).path in ("/", "/index.html"):
            self.send_header("Cache-Control", "no-cache")
        SimpleHTTPRequestHandler.end_headers(self)

    def send_json(self, status, obj):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlsplit(self.path)
        if url.path == "/api/health":
            return self.send_json(200, {"ok": True})
        if url.path == "/api/submissions.csv":
            key, given = teacher_key(), (parse_qs(url.query).get("key") or [""])[0]
            if not key or not hmac.compare_digest(key, given):
                return self.send_json(403, {"ok": False, "error": "forbidden"})
            body = export_csv()
            self.send_response(200)
            self.send_header("Content-Type", "text/csv; charset=utf-8")
            self.send_header("Content-Disposition", "attachment; filename=\"homework.csv\"")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return None
        if url.path.startswith("/api/"):
            return self.send_json(404, {"ok": False})
        return SimpleHTTPRequestHandler.do_GET(self)

    def do_POST(self):
        if urlsplit(self.path).path != "/api/submit":
            return self.send_json(404, {"ok": False})
        try:
            length = int(self.headers.get("Content-Length") or 0)
        except ValueError:
            length = 0
        if not 0 < length <= MAX_BODY:
            return self.send_json(413, {"ok": False, "error": "size"})
        try:
            sub = validate(json.loads(self.rfile.read(length).decode("utf-8")))
        except (ValueError, UnicodeDecodeError):
            return self.send_json(400, {"ok": False, "error": "invalid"})
        created = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
        con = db()
        with con:
            cur = con.execute("INSERT INTO submissions (created_at, name, agency, payload) VALUES (?, ?, ?, ?)",
                              (created, sub["name"], sub["agency"], json.dumps(sub, ensure_ascii=False)))
        con.close()
        return self.send_json(200, {"ok": True, "id": cur.lastrowid})


class Server(ThreadingMixIn, HTTPServer):
    daemon_threads = True


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    port = int(argv[0]) if argv else PORT
    os.makedirs(DATA_DIR, exist_ok=True)
    db().close()
    if not os.path.isfile(os.path.join(SITE_DIR, "index.html")):
        sys.exit("site not found: %s" % SITE_DIR)
    print("serving %s on %s:%d; data in %s" % (SITE_DIR, HOST, port, DATA_DIR), flush=True)
    Server((HOST, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
