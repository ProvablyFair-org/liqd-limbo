// EVIDENCE ARTIFACT FORGERIES — absence and unreadability, which a find/replace cannot express.
//
// Framework gate-forgery F11: three of four LIQD repos once passed with an artifact of record simply
// DELETED, because the check read `existsSync` and fell through to "absent — this run writes it".
// Client QA 2026-09-10 (D2) added the second half: an artifact containing the literal bytes `{not
// JSON` passed all 21 steps of the sibling dice suite, because the JSON.parse throw was swallowed and
// the unreadable file was then classified as merely stale.
//
// Limbo's Step 19 separates ABSENT, PARSE ERROR and SCHEMA ERROR and fails on every one. These cases
// are what make that separation an executed claim. Neither file is hash-pinned — deliberately; a hash
// proves only that a file we wrote ourselves has not changed since we pinned it — so nothing here
// re-pins, and nothing needs to.
//
// usage: node evidence-artifact-forgeries.mjs <sandboxRepo> <case>
import fs from 'node:fs';
import path from 'node:path';

const repo = process.argv[2];
const kase = process.argv[3];
if (!repo || !kase) { console.error('usage: evidence-artifact-forgeries.mjs <sandboxRepo> <case>'); process.exit(2); }

const E13 = path.join(repo, 'evidence/E13-limbo-boundary-probes.json');
const E15 = path.join(repo, 'evidence/E15-limbo-max-exposure.json');

const mustExist = (p) => {
  if (!fs.existsSync(p)) { console.error(`case ${kase}: ${p} is already absent — the case is vacuous`); process.exit(2); }
};

switch (kase) {
  case 'absent-e13':
    mustExist(E13);
    fs.rmSync(E13);
    console.log('evidence/E13-limbo-boundary-probes.json DELETED — the witness the >= win rule rests on is gone');
    break;

  case 'malformed-e13':
    mustExist(E13);
    fs.writeFileSync(E13, '{not JSON');
    console.log('evidence/E13-limbo-boundary-probes.json overwritten with the literal bytes `{not JSON` — '
      + 'present, non-empty, and unreadable');
    break;

  case 'schema-e13': {
    mustExist(E13);
    const e13 = JSON.parse(fs.readFileSync(E13, 'utf8'));
    delete e13.justAbove;
    fs.writeFileSync(E13, JSON.stringify(e13, null, 2));
    console.log('evidence/E13: the justAbove probe removed — valid JSON, one half of the discriminating pair missing');
    break;
  }

  case 'absent-e15':
    mustExist(E15);
    fs.rmSync(E15);
    console.log('evidence/E15-limbo-max-exposure.json DELETED — the exposure ceiling in src/config.ts becomes '
      + 'an unwitnessed constant');
    break;

  default:
    console.error(`unknown case: ${kase}`);
    process.exit(2);
}
