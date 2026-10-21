// LIQD Limbo — PAGE READ for LIMBO-09 (pin the operator's client bundle). Places NO bet.
// Paste into DevTools → Console on https://qa.liqd.com/originals/limbo (logged in, page fully loaded).
// It fetches every same-origin JavaScript file the page loaded, keeps the ones that contain the
// limbo constants the package ports (LIMBO_* exports, the 9.9e9 result numerator), and for each:
//   * saves the file BYTE FOR BYTE to ~/Downloads as liqd-limbo-client-<file>-2026-09-26.js.txt
//   * reports URL, byte length and SHA-256
// The report is also copied to the clipboard. Then in the terminal (from the package root):
//   mkdir -p evidence/client-bundle && mv ~/Downloads/liqd-limbo-client-*-2026-09-26.js.txt evidence/client-bundle/
//   pbpaste > evidence/client-bundle/bundle-read-2026-09-26.json
(async () => {
  const RE = /LIMBO_[A-Z_]{2,}|9900000000|9\.9e9|99e8/g;
  const urls = new Set([...document.querySelectorAll('script[src]')].map((s) => s.src));
  for (const e of performance.getEntriesByType('resource')) if (/\.js(\?|$)/.test(e.name)) urls.add(e.name);
  const hits = [];
  for (const u of urls) {
    if (new URL(u).origin !== location.origin) continue;
    try {
      const buf = await (await fetch(u, { credentials: 'same-origin' })).arrayBuffer();
      const text = new TextDecoder().decode(buf);
      const names = [...new Set(text.match(RE) ?? [])];
      if (!names.length) continue;
      const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((b) => b.toString(16).padStart(2, '0')).join('');
      const file = `liqd-limbo-client-${new URL(u).pathname.split('/').pop().replace(/[^A-Za-z0-9._-]/g, '_')}-2026-09-26.js.txt`;
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'text/plain' })); a.download = file; document.body.appendChild(a); a.click(); a.remove();
      hits.push({ url: u, savedAs: file, bytes: buf.byteLength, sha256, constantsFound: names });
    } catch (err) { hits.push({ url: u, error: String(err) }); }
  }
  const report = { version: 'limbo-bundle-read 2026-09-26', page: location.href, at: new Date().toISOString(), userAgent: navigator.userAgent, scannedScripts: urls.size, files: hits };
  copy(JSON.stringify(report, null, 2));
  console.log(`scanned ${urls.size} scripts; ${hits.length} contain the limbo constants — saved to Downloads, report copied to clipboard`, hits);
})();
