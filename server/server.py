#!/usr/bin/env python3
"""ServerMon API. Serves what collect.py wrote. Standard library only.

    GET /health                 no auth, for container healthchecks
    GET /api/status             latest snapshot
    GET /api/history?days=30    per-disk SMART history  {disk_id: [{t, realloc, pending, temp_c, ...}]}

Auth: "Authorization: Bearer <SERVERMON_TOKEN>" on /api/*.
Put it behind Tailscale/WireGuard or a TLS reverse proxy; do not expose plain HTTP to the internet.
"""
import hmac
import json
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

DATA_DIR = os.environ.get("SERVERMON_DATA", os.path.join(os.path.dirname(os.path.abspath(__file__)), "data"))
TOKEN = os.environ.get("SERVERMON_TOKEN", "")
PORT = int(os.environ.get("SERVERMON_PORT", "8787"))
STALE_AFTER = int(os.environ.get("SERVERMON_STALE_SECONDS", "900"))


def read_history(days):
    cutoff = time.time() - days * 86400
    out = {}
    try:
        with open(os.path.join(DATA_DIR, "history.jsonl")) as f:
            for line in f:
                try:
                    r = json.loads(line)
                except ValueError:
                    continue
                if r.get("t", 0) >= cutoff:
                    out.setdefault(r["id"], []).append({k: v for k, v in r.items() if k != "id"})
    except OSError:
        pass
    # keep payloads small: at most ~300 points per disk
    for k, rows in out.items():
        if len(rows) > 300:
            step = len(rows) / 300
            out[k] = [rows[int(i * step)] for i in range(300)] + [rows[-1]]
    return out


class Handler(BaseHTTPRequestHandler):
    server_version = "ServerMon"

    def log_message(self, fmt, *args):
        sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

    def _send(self, code, obj):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _authed(self):
        if not TOKEN:
            return False
        got = self.headers.get("Authorization", "")
        return hmac.compare_digest(got.encode(), f"Bearer {TOKEN}".encode())

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/health":
            return self._send(200, {"ok": True})
        if not url.path.startswith("/api/"):
            return self._send(404, {"error": "not found"})
        if not self._authed():
            return self._send(401, {"error": "unauthorized"})
        if url.path == "/api/status":
            try:
                with open(os.path.join(DATA_DIR, "latest.json")) as f:
                    snap = json.load(f)
            except (OSError, ValueError):
                return self._send(503, {"error": "no data yet; collector has not run"})
            snap["stale"] = time.time() - snap.get("collected_at", 0) > STALE_AFTER
            snap["server_time"] = int(time.time())
            return self._send(200, snap)
        if url.path == "/api/history":
            try:
                days = max(1, min(365, int(parse_qs(url.query).get("days", ["30"])[0])))
            except ValueError:
                days = 30
            return self._send(200, read_history(days))
        return self._send(404, {"error": "not found"})


if __name__ == "__main__":
    if not TOKEN or len(TOKEN) < 16:
        sys.exit("Set SERVERMON_TOKEN to a random string of at least 16 characters "
                 "(e.g. `openssl rand -hex 24`).")
    print(f"ServerMon API on :{PORT}, data in {DATA_DIR}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
