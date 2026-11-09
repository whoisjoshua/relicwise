#!/usr/bin/env python3
"""
Local development server for relicwise: serves the static site AND the two proxy routes the
deployed Cloudflare Worker provides, so the whole app works locally with no setup.

    python3 tools/dev_server.py            # http://localhost:8000
    python3 tools/dev_server.py --port 9000

Routes (same as worker/index.js):
    GET /api/health
    GET /api/enka/<uid>           -> https://enka.network/api/hsr/uid/<uid>
    GET /api/gacha?<query>        -> HoYoverse warp history (getGachaLog / getLdGachaLog)
"""
import argparse
import http.server
import json
import os
import re
import socketserver
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
UA = "relicwise/1.0 (+https://github.com/whoisjoshua/relicwise)"
GACHA_HOSTS = {
    "hkrpg_global": "https://public-operation-hkrpg-sg.hoyoverse.com/common/gacha_record/api/",
    "hkrpg_cn": "https://public-operation-hkrpg.mihoyo.com/common/gacha_record/api/",
}
ENDPOINTS = {"getGachaLog", "getLdGachaLog"}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        # Always revalidate so edits show up on refresh
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, fmt, *args):
        msg = fmt % args
        msg = re.sub(r"authkey=[^&\s]+", "authkey=<redacted>", msg)  # never print warp auth keys
        print(f"  {self.address_string()} {msg}")

    def do_GET(self):
        path = urllib.parse.urlsplit(self.path)
        if path.path == "/api/health":
            return self.json(200, {"ok": True, "service": "relicwise-proxy", "mode": "dev"})
        m = re.fullmatch(r"/api/enka/(\d{9,10})", path.path)
        if m:
            return self.forward(f"https://enka.network/api/hsr/uid/{m.group(1)}")
        if path.path == "/api/gacha":
            q = urllib.parse.parse_qs(path.query, keep_blank_values=True)
            endpoint = (q.pop("endpoint", ["getGachaLog"]) or ["getGachaLog"])[0]
            base = GACHA_HOSTS.get((q.get("game_biz") or ["hkrpg_global"])[0])
            if endpoint not in ENDPOINTS or not base or not q.get("authkey"):
                return self.json(400, {"retcode": -1, "message": "bad request"})
            return self.forward(base + endpoint + "?" + urllib.parse.urlencode(q, doseq=True))
        if path.path.startswith("/api/"):
            return self.json(404, {"error": "not found"})
        return super().do_GET()

    def forward(self, url):
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
        try:
            with urllib.request.urlopen(req, timeout=25) as r:
                body, status = r.read(), r.status
        except urllib.error.HTTPError as e:
            body, status = e.read(), e.code
        except Exception as e:  # noqa: BLE001
            return self.json(502, {"error": f"upstream unreachable: {e.__class__.__name__}"})
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def json(self, status, obj):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


Handler.extensions_map.update({".js": "text/javascript", ".mjs": "text/javascript", ".json": "application/json",
                               ".svg": "image/svg+xml", ".ps1": "text/plain; charset=utf-8"})


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--host", default="127.0.0.1")
    args = ap.parse_args()
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer((args.host, args.port), Handler) as httpd:
        print(f"relicwise dev server on http://localhost:{args.port}  (Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
