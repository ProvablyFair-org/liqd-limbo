#!/usr/bin/env node
// Holds the documents to the files they describe, so a hash or a count stated in prose cannot drift:
//   evidence.md          every row's SHA-256 equals the file's (--write refreshes the column from disk)
//   exploit-testing.md   the registry sizes equal the three registry files; rows S5-1..S5-8 present
//   README.md, MANIFEST.md   the battery size they quote equals the registries; the dataset hash in README is the file's
//   SUMMARY.md           every linked file exists
//   README.md, MANIFEST.md, docs/ALGORITHM.md, evidence.md   the counts they quote from Steps 2, 5, 19 and 25 equal
//                        the scored record; two superseded wordings of those counts are rejected
// Dependency-free. Exit 0 when everything agrees, 1 otherwise.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WRITE = process.argv.includes('--write');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const sha = (rel) => createHash('sha256').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex');
const problems = [];

// evidence.md
let ev = read('evidence.md');
const rows = [...ev.matchAll(/^\| (E\d{2}) \| `([^`]+)` \| `([^`]*)` \|/gm)];
if (rows.length === 0) problems.push('evidence.md: no exhibit rows');
rows.forEach((m, i) => { if (m[1] !== `E${String(i + 1).padStart(2, '0')}`) problems.push(`evidence.md: exhibit ${m[1]} is out of sequence`); });
for (const [line, id, file, stated] of rows) {
  if (!fs.existsSync(path.join(ROOT, file))) { problems.push(`evidence.md ${id}: ${file} is missing`); continue; }
  const actual = sha(file);
  if (WRITE) ev = ev.replace(line, line.replace(`\`${stated}\` |`, `\`${actual}\` |`));
  else if (stated !== actual) problems.push(`evidence.md ${id}: states ${stated.slice(0, 16)}… for ${file}, the file is ${actual.slice(0, 16)}…`);
}
if (WRITE) fs.writeFileSync(path.join(ROOT, 'evidence.md'), ev);

// registries
const n = (rel) => JSON.parse(read(rel)).length;
const reg = { 'tests/mutations.json': n('tests/mutations.json'), 'tests/structural-forgeries.json': n('tests/structural-forgeries.json'), 'tests/mutation-survivors.json': n('tests/mutation-survivors.json') };
const total = Object.values(reg).reduce((a, b) => a + b, 0);
const ex = read('exploit-testing.md');
for (const [file, count] of Object.entries(reg)) {
  const m = new RegExp('^\\| `' + file.replace(/[.]/g, '\\.') + '` \\| (\\d+) \\|', 'm').exec(ex);
  if (!m) problems.push(`exploit-testing.md: no row for ${file}`);
  else if (Number(m[1]) !== count) problems.push(`exploit-testing.md: ${file} stated ${m[1]}, the registry holds ${count}`);
}
for (let i = 1; i <= 8; i++) if (!new RegExp(`^\\| S5-${i} \\|`, 'm').test(ex)) problems.push(`exploit-testing.md: row S5-${i} missing`);
if (!/^S5: fairness-integrity matrix\.$/m.test(ex)) problems.push('exploit-testing.md: the line "S5: fairness-integrity matrix." is missing');
const s5pass = [...ex.matchAll(/^\| S5-\d \| [^|]+ \| Pass \|/gm)].length;
for (const doc of ['exploit-testing.md', 'MANIFEST.md']) {
  const h = /All integrity checks held in the (\d+) tested categories\./.exec(read(doc));
  if (!h || Number(h[1]) !== s5pass) problems.push(`${doc}: the integrity-checks summary line does not state the ${s5pass} Pass rows of the S5 matrix`);
}
for (const doc of ['README.md', 'MANIFEST.md']) {
  const m = /(\d+) declared counterexamples/.exec(read(doc));
  if (!m) problems.push(`${doc}: the battery size is not stated`);
  else if (Number(m[1]) !== total) problems.push(`${doc}: states ${m[1]} declared counterexamples, the registries hold ${total}`);
}
const split = /(\d+) single-file mutations, (\d+) structural forgeries and other non-step kills, and (\d+) declared survivor/.exec(read('MANIFEST.md'));
if (!split || Number(split[1]) !== reg['tests/mutations.json'] || Number(split[2]) !== reg['tests/structural-forgeries.json'] || Number(split[3]) !== reg['tests/mutation-survivors.json']) problems.push('MANIFEST.md: the registry split does not equal the registries');

// README dataset hash
const ds = rows.find((r) => r[1] === 'E01');
if (ds && !read('README.md').includes(sha(ds[2]))) problems.push('README.md: the dataset SHA-256 it prints is not the dataset file\'s');

// Counts the documents quote from Steps 2, 5, 19 and 25: read from the scored record (outputs/verification-results.json,
// which npm run verify holds to this run field by field), never typed into the prose by hand.
{
  const rec = JSON.parse(read('outputs/verification-results.json'));
  const det = (n) => rec.steps.find((s) => s.step === n)?.detail ?? '';
  const W = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
  const w = (x) => W[Number(x)] ?? String(x);
  const fmt = (x) => Number(x).toLocaleString('en-US');
  const need = (doc, text, what) => { if (!read(doc).includes(text)) problems.push(`${doc}: does not state ${what} as Step ${what.split(' ')[0]} computes it: expected "${text}"`); };
  const s5 = /the guardless form \(first chunk mod range\) gives a different result on (\d+) of the (\d+) and the same result on (\d+) \(bet ([A-Za-z0-9_-]+)\)/.exec(det(5));
  if (!s5) problems.push('outputs/verification-results.json: Step 5 does not print the guardless-form census');
  else {
    const [, diff, n, same, id] = s5;
    if (Number(same) !== 1) problems.push(`check-docs: Step 5 now names ${same} rounds where the guardless form agrees; the prose below names one bet and must be rewritten`);
    need('MANIFEST.md', `an unguarded server gives a different result on ${diff} of the ${n}; on bet \`${id}\``, '5 rejection census');
    need('docs/ALGORITHM.md', `Without the rejection rule ${diff} of those ${n} rounds recompute to a`, '5 rejection census');
    need('docs/ALGORITHM.md', `on bet ${id} the rejected first chunk`, '5 rejection census exception');
    need('docs/ALGORITHM.md', `${fmt(n)} first-chunk rejections, all recompute; ${diff} differ without the rule`, '5 rejection census table row');
    need('exploit-testing.md', `${n} rejected-first-chunk rounds reproduce, ${diff} of them would differ without the rule`, '5 rejection census (S5-8)');
  }
  const s25u = /(\d+) are requests on (\d+) distinct draws \(seed, client seed, nonce\) the capture never played/.exec(det(25));
  const s25a = /of which (\d+) requests on (\d+) distinct draws have a raw value ABOVE the cap/.exec(det(25));
  const s25x = /and (\d+) a raw value of exactly 1000000/.exec(det(25));
  if (!s25u || !s25a || !s25x) problems.push('outputs/verification-results.json: Step 25 does not print the request and draw counts of the cap probes');
  else {
    const [, u, ud] = s25u, [, a, ad] = s25a, [, x] = s25x;
    need('MANIFEST.md', `sent ${w(u)} logged-out requests to the production verifier on ${w(ud)} draws the capture never played; on the ${w(a)} requests, on ${w(ad)} distinct draws,`, '25 cap probe counts');
    need('MANIFEST.md', `replies to ${w(u)} requests on ${w(ud)} unsettled draws, ${w(a)} of them (${w(ad)} distinct draws) with an uncapped value above the cap`, '25 cap probe counts (premises)');
    need('MANIFEST.md', `${u} verifier requests on ${ud} unsettled draws, ${a} of them (${ad} draws) above the cap`, '25 cap probe counts (results)');
    need('MANIFEST.md', `${a} requests (${ad} distinct draws) above the cap and ${x} at it`, '25 cap probe counts (conformance)');
    need('MANIFEST.md', `${a} requests on ${ad} distinct draws above the cap and ${x} at it (E07)`, '25 cap probe counts (L4)');
    need('README.md', `on ${w(a)} requests (${w(ad)} distinct draws) whose uncapped value is above it`, '25 cap probe counts');
    need('README.md', `(${a} requests, on ${ad} distinct draws, above the cap)`, '25 cap probe counts (table)');
    need('docs/ALGORITHM.md', `its replies to ${w(u)} requests on ${w(ud)} unsettled draws`, '25 cap probe counts');
    need('docs/ALGORITHM.md', `on ${w(a)} requests on ${w(ad)} unsettled draws`, '25 cap probe counts');
    need('docs/ALGORITHM.md', `VERIFIER ${a} requests on ${ad} draws above the cap, ${x} at it`, '25 cap probe counts (table)');
    need('evidence.md', `${w(u)} requests on ${w(ud)} unsettled draws at and around the 1,000,000× result cap (${w(a)} of them, on ${w(ad)} distinct draws, above it)`, '25 cap probe counts');
  }
  const s2 = /they come in that order on (\d+)\/(\d+) and out of order on (\d+); the commitment reply is a second or more earlier than the client-seed reply on (\d+) and in the same second on (\d+); the client-seed reply is a second or more earlier than the first bet's reply on (\d+)/.exec(det(2));
  if (!s2) problems.push('outputs/verification-results.json: Step 2 does not print the Date-header order');
  else {
    const [, ord, of, , cb, , sb] = s2;
    need('MANIFEST.md', `in that order on ${ord} of ${of} epochs (a second or more apart on ${cb} and ${sb} of them)`, '2 Date-header order (L6)');
    need('MANIFEST.md', `come in that order on ${ord} of ${of} epochs (Step 2)`, '2 Date-header order (premises)');
    need('MANIFEST.md', `come in that order on ${ord}/${of} epochs (L6)`, '2 Date-header order (results)');
    need('exploit-testing.md', `LIQD's Date headers keep that order on ${ord} of ${of} epochs`, '2 Date-header order (S5-4)');
  }
  const s19 = /(\d+)\/(\d+) reply bodies \(expected (\d+): seed pairs, rotations, place-bet and verifier replies\) have the byte length and SHA-256 the runner recorded/.exec(det(19));
  const s19r = /RERUN on the shipped exports: node \S+ exited 0, SELF-CHECK PASS; its output IS byte for byte/.test(det(19));
  if (!s19 || !s19r) problems.push('outputs/verification-results.json: Step 19 does not print the export re-hash count and a byte-identical converter rerun');
  else {
    need('MANIFEST.md', `${fmt(s19[1])} of ${fmt(s19[2])} reply bodies in them re-hash`, '19 export re-hash (L10)');
    need('evidence.md', `all ${fmt(s19[1])} recorded reply digests recompute`, '19 export re-hash');
  }
  // wordings that state those counts wrongly are rejected wherever the package could carry them
  const banned = [
    [/differs on each/, 'the rejection rule changes the result on every round'],
    [/different result on every one/, 'the rejection rule changes the result on every round'],
    [/every one of them changes under the guardless form/, 'the rejection rule changes the result on every round'],
    [/six logged-out requests to the production verifier, on nonces/, 'six probes show the cap'],
    [/on six unsettled nonces/, 'six unsettled nonces'],
    [/on four unsettled nonces/, 'four nonces'],
    [/on six probes/, 'six probes show the cap'],
    [/6 probes at the result cap/, 'six probes show the cap'],
  ];
  for (const doc of ['README.md', 'MANIFEST.md', 'docs/ALGORITHM.md', 'evidence.md', 'exploit-testing.md', 'tests/mutations.json',
    'tests/steps/determinism.ts', 'tests/steps/verifier.ts', 'tests/steps/standardization.ts', 'src/config.ts', 'src/profile-map.ts']) {
    for (const [re, what] of banned) if (re.test(read(doc))) problems.push(`${doc}: carries the corrected claim (${what}): /${re.source}/`);
  }
}

// SUMMARY links
for (const m of read('SUMMARY.md').matchAll(/\]\(([^)#]+)(#[^)]*)?\)/g)) if (!fs.existsSync(path.join(ROOT, m[1]))) problems.push(`SUMMARY.md: ${m[1]} does not exist`);

if (problems.length) { for (const p of problems) console.error(`  [check-docs] ${p}`); process.exit(1); }
console.log(`  [check-docs] ${WRITE ? 'wrote' : 'OK:'} ${rows.length} evidence hashes ${WRITE ? 'refreshed' : 'match disk'}; battery ${total} = ${Object.values(reg).join(' + ')} as stated; S5-1..S5-8 present; the Step 2, 5, 19 and 25 counts in the prose equal the scored record; SUMMARY links resolve`);
