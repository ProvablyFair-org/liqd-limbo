#!/usr/bin/env python3
# Chrome-TLS HTTP helper for the limbo rig. Uses curl_cffi (bundled curl-impersonate)
# so Cloudflare's fingerprint gate on qa.liqd.com sees a real Chrome handshake.
#   Install:  pip3 install curl_cffi
# Usage (called by capture-limbo.reference.mjs):  python3 req.py <METHOD> <URL>   (body on stdin)
#   env LIQD_COOKIE = cookie header string.  Prints: "<status>\n<body>".
import sys, os
try:
    from curl_cffi import requests
except Exception:
    sys.stdout.write("0\n__NO_CURL_CFFI__ run: pip3 install curl_cffi")
    sys.exit(0)

method = sys.argv[1].upper()
url = sys.argv[2]
body = sys.stdin.read()
cookie = os.environ.get("LIQD_COOKIE", "")

headers = {
    "Accept": "application/json",
    "Origin": "https://qa.liqd.com",
    "Referer": "https://qa.liqd.com/originals/limbo",
    "Cookie": cookie,
}
# Don't follow redirects: an expired Cloudflare Access token 302s to the SSO login;
# following it would return that page as 200 and look like a false success.
kwargs = dict(headers=headers, impersonate="chrome", timeout=25, allow_redirects=False)
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
