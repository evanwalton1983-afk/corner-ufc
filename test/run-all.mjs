// Runs the whole acceptance suite: before and after comparison, payload tests
// in jsdom, and the real browser handoff tests.
import { execFileSync } from 'node:child_process';
const steps = [
  ['snapshot after', ['test/snapshot.mjs', 'after']],
  // 2.4 changed forecasts on purpose (see CHANGELOG.md), so the reference is now the 2.4.0
  // snapshot. test/baseline/before.json is the 2.1.0 app, kept for the record.
  ['compare to baseline', ['test/compare.mjs', 'test/baseline/2.4.0.json', 'test/out/after.json']],
  ['payload (jsdom)', ['test/payload.test.mjs']],
  ['second opinion (jsdom)', ['test/second-opinion.test.mjs']],
  ['2.4 changes (jsdom)', ['test/v24.test.mjs']],
  ['handoff (Chromium)', ['test/handoff.test.mjs']],
];
let failed = 0;
for (const [name, args] of steps) {
  console.log(`\n===== ${name} =====`);
  try { execFileSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, FROM_VERSION: process.env.FROM_VERSION || '2.4.0', TO_VERSION: process.env.TO_VERSION || '2.4.0' } }); }
  catch { failed++; console.log(`>>> ${name} FAILED`); }
}
console.log(failed ? `\n${failed} step(s) failed` : '\nALL STEPS PASSED');
process.exit(failed ? 1 : 0);
