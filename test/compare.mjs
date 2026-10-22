// Compares two snapshots line by line. Corner displays its version in the
// footer ("Model 2.1.0, fitted ..."), so exactly one difference is expected:
// that version number, in that one line of each run. Every other displayed
// character, in every tab, run and cache state, must match.
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './lib/boot.mjs';

const [a, b] = [process.argv[2] || 'test/baseline/before.json', process.argv[3] || 'test/out/after.json']
  .map(f => JSON.parse(fs.readFileSync(path.resolve(ROOT, f), 'utf8')));
const FROM = process.env.FROM_VERSION || '2.1.0', TO = process.env.TO_VERSION || '2.3.0';
const nums = s => JSON.stringify(s).match(/-?\d+(\.\d+)?%?/g) || [];

let fail = 0, totalNums = 0, totalLines = 0, allowed = 0;
const rows = [];
for (const key of Object.keys(a)) {
  if (key.endsWith(':errors')) {
    rows.push([key, 'js errors', `${a[key].length} -> ${(b[key] || []).length}`, '', (b[key] || []).length ? 'ERRORS AFTER' : 'none']);
    if ((b[key] || []).length) fail++;
    continue;
  }
  for (const part of Object.keys(a[key])) {
    const xs = a[key][part], ys = ((b[key] || {})[part] || []).slice();
    // The one permitted change: the version in the footer line.
    if (part === 'header' && ys[2] && ys[2].startsWith(`Model ${TO}, `) && xs[2].startsWith(`Model ${FROM}, `)) {
      if (ys[2].slice(`Model ${TO}`.length) === xs[2].slice(`Model ${FROM}`.length)) { ys[2] = xs[2]; allowed++; }
    }
    const diffs = [];
    for (let i = 0; i < Math.max(xs.length, ys.length); i++) if (xs[i] !== ys[i]) diffs.push(i);
    const n = nums(xs).length; totalNums += n; totalLines += xs.length;
    rows.push([key, part, xs.length === ys.length ? String(xs.length) : `${xs.length} vs ${ys.length}`, n, diffs.length ? 'DIFFERENT at line ' + diffs.slice(0, 5).join(',') : 'identical']);
    if (diffs.length) {
      fail++;
      for (const i of diffs.slice(0, 3)) console.log(`  ${key} ${part} line ${i}:\n    before: ${xs[i]}\n    after:  ${ys[i]}`);
    }
  }
}
for (const key of Object.keys(b)) if (!(key in a)) { rows.push([key, '', '', '', 'MISSING BEFORE']); fail++; }
const verbose = process.argv.includes('--all');
const w = [22, 34, 8, 8];
console.log(['run', 'section', 'lines', 'numbers', 'result'].map((h, i) => h.padEnd(w[i] || 0)).join(' '));
// Summarise per run unless --all: 58 sections per run is a lot of rows.
if (verbose) for (const r of rows) console.log(r.map((c, i) => String(c).padEnd(w[i] || 0)).join(' '));
else {
  const by = {};
  for (const r of rows) {
    if (r[1] === 'js errors') { console.log(r.map((c, i) => String(c).padEnd(w[i] || 0)).join(' ')); continue; }
    const g = by[r[0]] || (by[r[0]] = { secs: 0, lines: 0, nums: 0, bad: [] });
    g.secs++; g.lines += +String(r[2]).split(' ')[0]; g.nums += r[3]; if (r[4] !== 'identical') g.bad.push(r[1]);
  }
  for (const [k, g] of Object.entries(by))
    console.log([k, `${g.secs} sections`, g.lines, g.nums, g.bad.length ? 'DIFFERENT: ' + g.bad.join(', ') : 'identical'].map((c, i) => String(c).padEnd(w[i] || 0)).join(' '));
}
console.log(`\n${totalLines} displayed lines holding ${totalNums} numbers compared, ${fail} section(s) different.`);
console.log(`Expected footer version change ${FROM} -> ${TO} seen in ${allowed} of ${Object.keys(a).filter(k => !k.endsWith(':errors')).length} runs.`);
process.exit(fail ? 1 : 0);
