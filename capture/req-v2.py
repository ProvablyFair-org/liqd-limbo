#!/usr/bin/env python3
# Chrome-TLS HTTP helper for the 2026-09-26 LIQD capture scripts (liqd-capture-core.mjs).
# Same transport as limbo/capture/req.py (curl_cffi impersonating Chrome, because qa.liqd.com's
# Cloudflare gate checks the TLS fingerprint), with the Referer and timeout passed in instead of
# being fixed to the limbo page.
#   Install:  pip3 install curl_cffi
#   Usage:    python3 req-v2.py <METHOD> <URL> <REFERER> [timeoutSeconds]   (JSON body on stdin)
#   The cookie is read from the environment (LIQD_COOKIE, set by `source set-cookie.sh`) and is
#   never printed. Output: "<status>\n<body>".
import sys, os
try:
    from curl_cffi import requests
except Exception:
    sys.stdout.write("0\n__NO_CURL_CFFI__ run: pip3 install curl_cffi")
    sys.exit(0)

method = sys.argv[1].upper()
url = sys.argv[2]
referer = sys.argv[3] if len(sys.argv) > 3 else "https://qa.liqd.com/"
timeout = int(sys.argv[4]) if len(sys.argv) > 4 else 25
body = sys.stdin.read()

headers = {
    "Accept": "application/json",
    "Origin": "https://qa.liqd.com",
    "Referer": referer,
    "Cookie": os.environ.get("LIQD_COOKIE", ""),
}
# Redirects are not followed: an expired Cloudflare Access token 302s to the SSO login, and
# following it would return that page as a 200 that looks like success.
kwargs = dict(headers=headers, impersonate="chrome", timeout=timeout, allow_redirects=False)
if method != "GET" and body:
    headers["Content-Type"] = "application/json"
    kwargs["data"] = body.encode()

try:
    r = requests.request(method, url, **kwargs)
except Exception as e:
    sys.stdout.write("0\n__REQ_ERR__ " + str(e)[:160])
    sys.exit(0)

sys.stdout.write(str(r.status_code) + "\n")
sys.stdout.write(r.text)
