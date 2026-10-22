// Runs the whole acceptance suite: before and after comparison, payload tests
// in jsdom, and the real browser handoff tests.
import { execFileSync } from 'node:child_process';
const steps = [
  ['snapshot after', ['test/snapshot.mjs', 'after']],
  ['compare to baseline', ['test/compare.mjs', 'test/baseline/before.json', 'test/out/after.json']],
  ['payload (jsdom)', ['test/payload.test.mjs']],
  ['second opinion (jsdom)', ['test/second-opinion.test.mjs']],
  ['handoff (Chromium)', ['test/handoff.test.mjs']],
];
let failed = 0;
for (const [name, args] of steps) {
  console.log(`\n===== ${name} =====`);
  try { execFileSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, TO_VERSION: process.env.TO_VERSION || '2.3.0' } }); }
  catch { failed++; console.log(`>>> ${name} FAILED`); }
}
console.log(failed ? `\n${failed} step(s) failed` : '\nALL STEPS PASSED');
process.exit(failed ? 1 : 0);
