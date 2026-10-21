// Structural forgeries against Step 25's reader of the cap re-probe (evidence/E21). The re-probe was run on
// qa.liqd.com on 2026-10-02 (capture/PROBE-2026-10-02.md) and its journal is pinned in src/config.ts
// (CAP_PROBE_JOURNAL / CAP_PROBE_SHA256); Step 25 PASSes on it. These cases break the pinned artifact WITHOUT
// re-pinning, so the "pinned but absent / off its pin → FAIL" branch is executed rather than asserted.
// (Until 2026-10-02 the pins were null and these cases set them to a forged journal; the branch is the same.)
//
//   pinned-absent    the pinned journal is deleted from evidence/E21-target-cap-probe/ — Step 25 must FAIL
//   pinned-off-pin   the pinned journal is edited after it was pinned — its meta line moved from
//                    "platform":"qa.liqd.com" to "platform":"liqd.com", every refusal left intact so only the
//                    pin can catch it — and NOT re-pinned — Step 25 must FAIL
//
// usage: node cap-probe-forgeries.mjs <sandboxRepo> <case>
import fs from 'node:fs';
import path from 'node:path';

const [repo, which] = process.argv.slice(2);
if (!repo || !which) { console.error('usage: cap-probe-forgeries.mjs <sandboxRepo> <case>'); process.exit(2); }
const cfg = fs.readFileSync(path.join(repo, 'src/config.ts'), 'utf8');
const dir = (cfg.match(/export const CAP_PROBE_DIR = '([^']+)'/) || [])[1];
const journal = (cfg.match(/export const CAP_PROBE_JOURNAL: string \| null = '([^']+)';/) || [])[1];
const digest = (cfg.match(/export const CAP_PROBE_SHA256: string \| null = '([0-9a-f]{64})';/) || [])[1];
if (!dir || !journal || !digest) { console.error('the cap-probe pins are not set in src/config.ts — the case is vacuous'); process.exit(2); }
const abs = path.join(repo, dir, journal);
if (!fs.existsSync(abs)) { console.error(`the pinned journal ${dir}/${journal} is already absent — the case is vacuous`); process.exit(2); }

switch (which) {
  case 'pinned-absent': {
    fs.rmSync(abs);
    console.log(`the pinned re-probe journal ${dir}/${journal} deleted; CAP_PROBE_JOURNAL / CAP_PROBE_SHA256 left as committed`);
    break;
  }
  case 'pinned-off-pin': {
    const before = fs.readFileSync(abs, 'utf8');
    const after = before.replace('"platform":"qa.liqd.com"', '"platform":"liqd.com"');
    if (after === before) { console.error('the meta line carries no "platform":"qa.liqd.com" — the case is vacuous'); process.exit(2); }
    fs.writeFileSync(abs, after);
    console.log(`${dir}/${journal}: meta platform qa.liqd.com → liqd.com, refusals untouched, CAP_PROBE_SHA256 NOT re-pinned`);
    break;
  }
  default:
    console.error(`unknown case ${which}`); process.exit(2);
}
