// No-bet connectivity check: GET the shared provably-fair /active endpoint through the same
// Chrome-TLS transport the capture uses. Places NO bet and spends nothing. Its only job is to
// prove the cookie, the User-Agent and the curl_cffi transport all work together BEFORE the
// probe spends money — a Cloudflare rejection and an expired cookie look identical from the
// capture's error path, and neither is worth discovering six bets in.
import { execFile } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
if (!process.env.LIQD_COOKIE) { console.log('\n❌ LIQD_COOKIE not set — source the set-cookie script first.\n'); process.exit(1); }
execFile(process.env.LIQD_PYTHON || 'python3',
  [join(HERE, 'req.py'), 'GET', 'https://qa.liqd.com/api/v1/fast-games/provably-fair/active'],
  { env: process.env, maxBuffer: 1 << 24 },
  (err, stdout) => {
    if (err) { console.log(`\n❌ transport failed: ${err.message}\n`); process.exit(1); }
    const nl = stdout.indexOf('\n');
    const status = stdout.slice(0, nl).trim(), body = stdout.slice(nl + 1);
    if (body.includes('__NO_CURL_CFFI__')) { console.log('\n❌ curl_cffi missing — run: pip3 install curl_cffi\n'); process.exit(1); }
    console.log(`\n  HTTP ${status}`);
    if (status !== '200') { console.log(`  ${body.slice(0, 300)}\n\n❌ not authenticated — re-copy the cURL and re-source set-cookie.sh\n`); process.exit(1); }
    let d; try { d = JSON.parse(body); d = d.data ?? d; } catch { console.log(`  non-JSON: ${body.slice(0,200)}\n`); process.exit(1); }
    console.log(`  activeServerSeedHash : ${d.activeServerSeedHash ?? d.hashedServerSeed}`);
    console.log(`  nextServerSeedHash   : ${d.nextServerSeedHash ?? d.nextHashedServerSeed}`);
    console.log(`  clientSeed           : ${d.activeClientSeed ?? d.clientSeed}`);
    console.log(`  nonce                : ${d.nonce}`);
    console.log('\n✅ transport + auth OK, nothing wagered. Next:  npm run probe\n');
  });
