// THE PIN IS THE GUARD UNDER TEST — the one forgery in this battery that deliberately does NOT re-pin.
//
// Every other dataset forgery here re-pins DATASET_SHA256 in the same breath, because a forger would,
// and because otherwise the loader stops the run before a single step is scored and the entry proves
// nothing about the step it names. That discipline is only defensible if the pin is itself
// demonstrated somewhere — otherwise "we re-pin so the semantic guard does the work" quietly becomes
// "the pin has never been observed to do anything".
//
// This case edits one credit and leaves the pin alone. The expected outcome is not a failing step: it
// is the loader aborting with `ERROR: dataset SHA-256 mismatch` and exit code 1, with NO verdict and
// NO step lines printed. The registry entry declares that marker instead of a step number.
//
// usage: node dataset-unpinned-edit.mjs <sandboxRepo>
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const repo = process.argv[2];
if (!repo) { console.error('usage: dataset-unpinned-edit.mjs <sandboxRepo>'); process.exit(2); }

const dsPath = path.join(repo, 'data/limbo-master-6700bets.json');
const ds = JSON.parse(fs.readFileSync(dsPath, 'utf8'));

const b = ds.bets.find((x) => x.id === 'zFT06HYCJUcIINZ9CX3Nd');   // epoch 0 nonce 2, credited 0.107
if (!b) { console.error('bet zFT06HYCJUcIINZ9CX3Nd is not in the capture'); process.exit(2); }
const was = b.winningAmount;
b.winningAmount = 0.207;
b.winningAmountWallet = 0.207;

fs.writeFileSync(dsPath, JSON.stringify(ds, null, 2));

const cfgPath = path.join(repo, 'src/config.ts');
const pinned = (fs.readFileSync(cfgPath, 'utf8').match(/export const DATASET_SHA256 = '([0-9a-f]{64})'/) || [])[1];
const actual = crypto.createHash('sha256').update(fs.readFileSync(dsPath)).digest('hex');
if (pinned === actual) { console.error('the edit did not change the file — the case is vacuous'); process.exit(2); }

console.log(`bet zFT06HYCJUcIINZ9CX3Nd credited ${b.winningAmount} instead of ${was}; DATASET_SHA256 left at `
  + `${pinned.slice(0, 16)}… while the file now hashes to ${actual.slice(0, 16)}… — NOT re-pinned, by design`);
