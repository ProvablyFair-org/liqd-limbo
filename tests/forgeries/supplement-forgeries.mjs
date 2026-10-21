// Structural forgeries against Step 25 — the 2026-09-26 target-decade SUPPLEMENT and the target-ceiling
// probe journals (evidence/E20). Each case edits a pinned file and, except `unpinned-edit`, RE-PINS it in
// src/config.ts in the same breath, as a forger would, so the semantic arm of Step 25 has to do the work.
//
//   result-forged-repinned    one settled round's served result moved in BOTH the dataset and the journal
//                             (so the journal-vs-dataset arm still agrees) — the recomputation must catch it
//   resume-erased-repinned    the journal's resume-check line deleted — the declared resume count must catch it
//   refusal-settled-repinned  a settled record at the refused 93,830.94x written into probe run 1 — the
//                             ceiling witness must catch it
//   above-ceiling-repinned    a 10,000x round relabelled 10,000.01x in dataset and journal — the live-ceiling
//                             target bound must catch it
//   unpinned-edit             the supplement dataset edited and NOT re-pinned — the Step 25 pin arm must catch it
//
// usage: node supplement-forgeries.mjs <sandboxRepo> <case>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const [repo, which] = process.argv.slice(2);
if (!repo || !which) { console.error('usage: supplement-forgeries.mjs <sandboxRepo> <case>'); process.exit(2); }

const cfgPath = path.join(repo, 'src/config.ts');
let cfg = fs.readFileSync(cfgPath, 'utf8');
const constOf = (name) => (cfg.match(new RegExp(`export const ${name} = '([^']+)'`)) || [])[1];
const DS = path.join(repo, constOf('SUPPLEMENT_DATA_PATH'));
const JR = path.join(repo, constOf('SUPPLEMENT_JOURNAL_PATH'));
const P1 = path.join(repo, constOf('CEILING_PROBE_DIR'), constOf('CEILING_PROBE_1_JOURNAL'));
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const repin = (name, file) => {
  const before = cfg;
  cfg = cfg.replace(new RegExp(`(export const ${name} = ')[0-9a-f]{64}(')`), `$1${sha(file)}$2`);
  if (cfg === before) { console.error(`re-pin of ${name} changed nothing — the case is vacuous`); process.exit(2); }
};
const readJournal = (p) => fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l));
const writeJournal = (p, evs) => fs.writeFileSync(p, evs.map((e) => JSON.stringify(e)).join('\n') + '\n');
const ds = JSON.parse(fs.readFileSync(DS, 'utf8'));
const journal = readJournal(JR);
/** Apply the same edit to a dataset row and to the journal's copy of it, so the two still agree. */
const editRound = (pick, edit) => {
  const b = ds.bets.find(pick);
  if (!b) { console.error('no round matches the case'); process.exit(2); }
  edit(b);
  const j = journal.find((e) => e.t === 'bet' && e.rec.id === b.id);
  edit(j.rec);
  fs.writeFileSync(DS, JSON.stringify(ds, null, 2));
  writeJournal(JR, journal);
  return b;
};

switch (which) {
  case 'result-forged-repinned': {
    const b = editRound((x) => x.epoch === 1 && x.nonce === 10, (r) => { r.result = Number((Number(r.result) + 0.01).toFixed(2)); });
    repin('SUPPLEMENT_DATASET_SHA256', DS); repin('SUPPLEMENT_JOURNAL_SHA256', JR);
    console.log(`round ${b.id} served result moved to ${b.result} in dataset and journal; both re-pinned`);
    break;
  }
  case 'resume-erased-repinned': {
    const kept = journal.filter((e) => e.t !== 'resume-check');
    if (kept.length === journal.length) { console.error('no resume-check to erase'); process.exit(2); }
    writeJournal(JR, kept);
    repin('SUPPLEMENT_JOURNAL_SHA256', JR);
    console.log(`${journal.length - kept.length} resume-check line(s) erased from the journal; re-pinned`);
    break;
  }
  case 'refusal-settled-repinned': {
    const p1 = readJournal(P1);
    const refusedTarget = Number((cfg.match(/export const CEILING_PROBE_REFUSED_TARGET = ([0-9_.]+);/) || [])[1].replace(/_/g, ''));
    const settled = p1.find((e) => e.t === 'bet');
    const intent = p1.find((e) => e.t === 'intent' && Number(e.body?.params?.target) === refusedTarget);
    if (!settled || !intent) { console.error('probe run 1 lacks the records this case needs'); process.exit(2); }
    const forged = JSON.parse(JSON.stringify(settled));
    forged.rec.params.target = refusedTarget;
    forged.rec.nonce = settled.rec.nonce + 1;
    forged.rec.idempotencyKey = intent.key;
    forged.rec.requestBody = intent.body;
    p1.splice(p1.indexOf(intent) + 1, 0, forged);
    writeJournal(P1, p1);
    repin('CEILING_PROBE_1_SHA256', P1);
    console.log(`a settled record at ${refusedTarget}x written into probe run 1 after its intent; re-pinned`);
    break;
  }
  case 'above-ceiling-repinned': {
    const b = editRound((x) => x.params?.target === 10000, (r) => {
      r.params.target = 10000.01;
      if (r.requestBody?.params) r.requestBody.params.target = 10000.01;
    });
    // keep the intent in step with the relabelled request body, so only the target arm can object
    const j = journal.find((e) => e.t === 'intent' && e.key === b.idempotencyKey);
    j.body.params.target = 10000.01;
    writeJournal(JR, journal);
    repin('SUPPLEMENT_DATASET_SHA256', DS); repin('SUPPLEMENT_JOURNAL_SHA256', JR);
    console.log(`round ${b.id} relabelled from 10000x to 10000.01x in dataset and journal; both re-pinned`);
    break;
  }
  case 'unpinned-edit': {
    const b = ds.bets[0];
    b.winningAmount = 0.2;
    fs.writeFileSync(DS, JSON.stringify(ds, null, 2));
    console.log(`round ${b.id} credited 0.2 in the supplement dataset; SUPPLEMENT_DATASET_SHA256 NOT re-pinned, by design`);
    break;
  }
  default:
    console.error(`unknown case ${which}`); process.exit(2);
}
fs.writeFileSync(cfgPath, cfg);
