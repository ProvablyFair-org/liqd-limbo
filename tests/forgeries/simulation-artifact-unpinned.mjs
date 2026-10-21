// SIMULATION ARTIFACT FORGERIES THAT DO **NOT** RE-PIN — absence, unreadability, and a degenerate
// stub, none of which a static find/replace can express.
//
// WHY THESE EXIST. Until 2026-09-11 `SIMULATION_SHA256` and `SIMULATION_HTML_SHA256` were declared in
// src/config.ts and read by NO scored step, so the artifact the whole RTP-analysis chapter quotes
// could be emptied or deleted and this suite still returned 21/21 PROVABLY FAIR. That was not a
// suspicion — the framework's own batteries executed it against this package:
//
//   gate-vacuity M2   outputs/simulation-results.json replaced by
//                     {"pass1_fresh_seeds":{},"pass2_casino_seeds":{"seeds_tested":1},"pass1":{},"pass2":{}}
//                     → "SURVIVED ✗ — sim steps clean-pass an empty artifact (VACUOUS)"
//   gate-forgery F1–F6  empty / duplicated / shrunk / self-consistent-nonsense / contradictory /
//                     degenerate-series versions of the same file → all six "SURVIVED ✗ BLOCKER"
//   gate-forgery F11  the file simply DELETED → "SURVIVED: PROVABLY FAIR — Full Pass ✗ BLOCKER"
//
// Step 19 now recomputes both pins, requires both files to be present and the JSON one to parse and
// carry its declared shape, and binds the recorded sample depths to SIM_UNIFORMITY_DRAWS /
// SIM_SERIAL_DRAWS / SIM_EDGE_BETS in src/config.ts. These four cases are what make that an executed
// claim rather than a sentence.
//
// WHAT THEY DO NOT SHOW, said here so the registry cannot be read as claiming more than it proves:
// none of this establishes that the statistics inside the artifact were measured. A forger who edits
// the file and re-pins the constant in the same commit still passes — that is limitation L9 and the
// declared survivor in tests/mutation-survivors.json, and NOTHING here re-pins precisely so that the
// pin itself is what is under test.
//
// usage: node simulation-artifact-unpinned.mjs <sandboxRepo> <case>
import fs from 'node:fs';
import path from 'node:path';

const repo = process.argv[2];
const kase = process.argv[3];
if (!repo || !kase) { console.error('usage: simulation-artifact-unpinned.mjs <sandboxRepo> <case>'); process.exit(2); }

const SIM = path.join(repo, 'outputs/simulation-results.json');
const HTML = path.join(repo, 'outputs/rtp-convergence.html');

const mustExist = (p) => {
  if (!fs.existsSync(p)) { console.error(`case ${kase}: ${p} is already absent — the case is vacuous`); process.exit(2); }
};

switch (kase) {
  case 'absent':
    mustExist(SIM);
    fs.rmSync(SIM);
    console.log('outputs/simulation-results.json DELETED — the file every Pass-1 and Pass-2 figure in the report is quoted from');
    break;

  case 'absent-html':
    mustExist(HTML);
    fs.rmSync(HTML);
    console.log('outputs/rtp-convergence.html DELETED — the convergence chart, twin output of the same producer run');
    break;

  case 'malformed':
    mustExist(SIM);
    fs.writeFileSync(SIM, '{not JSON');
    console.log('outputs/simulation-results.json overwritten with the literal bytes `{not JSON` — present, non-empty, unreadable');
    break;

  case 'degenerate':
    mustExist(SIM);
    // Byte-for-byte the stub the framework's gate-vacuity M2 arm writes.
    fs.writeFileSync(SIM, '{"pass1_fresh_seeds":{},"pass2_casino_seeds":{"seeds_tested":1},"pass1":{},"pass2":{}}');
    console.log('outputs/simulation-results.json replaced by the gate-vacuity M2 stub — well-formed JSON, no statistics, no declared depths');
    break;

  default:
    console.error(`unknown case: ${kase}`);
    process.exit(2);
}
