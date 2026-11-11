// The one export of the workshop's runners/_shared/check-core.mjs that the converter uses (convert/adapters/limbo.mjs
// imports `pkg` from it), here pointed at THIS package: pkg('limbo', 'src/rng.ts') loads this package's own src/rng.ts.
// Node 22 strips the types of src/*.ts on import; the two notices it prints for that are filtered, as in the workshop.
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const PACKAGE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const prior = process.listeners('warning'); process.removeAllListeners('warning');
process.on('warning', (w) => { if (w.code === 'MODULE_TYPELESS_PACKAGE_JSON' || /type stripping|Reparsing as ES module/i.test(w.message)) return; for (const l of prior) l(w); });
export const pkg = (_game, rel) => import(pathToFileURL(join(PACKAGE, rel)).href);
