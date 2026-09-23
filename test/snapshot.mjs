// Usage: node test/snapshot.mjs <label> [path/to/index.html]
// Saves every line of text the app displays (every probability, rating,
// driver, certainty, calibration bin and price, plus the words around them)
// and every bar width, in each tab: Matchup for a set of pairings, Rankings
// for every division, Recent, and Card. It does this with no Odds API key and
// with the frozen Odds API response, each on a fresh cache (ratings rebuilt)
// and on the saved cache from that boot (ratings restored).
import fs from 'node:fs';
import path from 'node:path';
import { bootApp, dumpStorage, visibleLines, barWidths, click, change, MODES, ROOT, fixture } from './lib/boot.mjs';

const label = process.argv[2] || 'snap';
const htmlFile = process.argv[3] ? path.resolve(process.argv[3]) : undefined;
const roles = JSON.parse(fixture('roles.json'));

function snapshotAll(w) {
  const d = w.document, $ = id => d.getElementById(id), out = {};
  const lines = id => visibleLines($(id));
  out.header = [$('sub').textContent, $('foot1').textContent, $('foot2').textContent];

  // Matchup: every rated fixture pairing as the app maps it, then the same
  // pairings with the corners swapped, a later fight date, and a forced division.
  click(w, $('tabMatch'));
  const pairs = [];
  for (const r of Object.values(roles)) {
    const a = w.eval(`fighterFor(${JSON.stringify(r.a)})`), b = w.eval(`fighterFor(${JSON.stringify(r.b)})`);
    if (a && b && w.eval(`NAMES.includes(${JSON.stringify(a)})&&NAMES.includes(${JSON.stringify(b)})`)) pairs.push([a, b]);
  }
  const pick = (a, b) => w.eval(`comboA.set(${JSON.stringify(a)});comboB.set(${JSON.stringify(b)});onPick()`);
  pairs.forEach(([a, b], i) => {
    pick(a, b);
    out[`match:${i}`] = lines('matchView').concat(barWidths($('matchView')));
    click(w, $('swap'));
    out[`match:${i}:swapped`] = lines('verdict');
  });
  const fdate = $('fdate');
  fdate.value = '2027-03-14'; change(w, fdate);
  pairs.slice(0, 4).forEach(([a, b], i) => { pick(a, b); out[`match:${i}:2027-03-14`] = lines('verdict'); });
  const dv = $('dv');
  dv.value = 'Heavyweight'; change(w, dv);
  pairs.slice(0, 4).forEach(([a, b], i) => { pick(a, b); out[`match:${i}:heavyweight`] = lines('verdict'); });

  // Rankings, every division.
  click(w, $('tabRank'));
  const sel = $('rankDiv');
  for (const o of [...sel.options]) { sel.value = o.value; change(w, sel); out['rank:' + o.value] = lines('rankView'); }

  click(w, $('tabLog'));
  out.recent = lines('logView').concat(barWidths($('logView')));

  click(w, $('tabCard'));
  out.card = lines('cardView');
  click(w, $('tabMatch'));
  return out;
}

const out = {};
for (const mode of MODES) {
  let storage = null;
  for (const cache of ['fresh', 'restored']) {
    const { window: w, errors } = await bootApp({ mode, htmlFile, storage });
    const key = `${mode}:${cache}`;
    out[key] = snapshotAll(w);
    await new Promise(r => setTimeout(r, 50));
    out[key + ':errors'] = errors.slice();
    storage = dumpStorage(w);
    w.close();
  }
}
fs.mkdirSync(path.join(ROOT, 'test', 'out'), { recursive: true });
const file = path.join(ROOT, 'test', 'out', label + '.json');
fs.writeFileSync(file, JSON.stringify(out, null, 1));
const nums = s => (JSON.stringify(s).match(/-?\d+(\.\d+)?%?/g) || []).length;
for (const [k, v] of Object.entries(out))
  console.log(k.padEnd(24), Array.isArray(v) ? `${v.length} errors` : `${Object.keys(v).length} sections, ${Object.values(v).flat().length} lines, ${nums(v)} numbers`);
console.log('saved', path.relative(ROOT, file));
