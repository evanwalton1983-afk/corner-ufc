// Corner refit harness. Never deployed.
//
// Runs the model in deploy/index.html walk forward over the frozen ufcstats
// files in test/fixtures, using the app's own parser and model code, so the
// numbers here are the numbers the app produces. Every forecast is made before
// the fight it scores.
//
//   node tools/refit.mjs                  score the app as it is
//   node tools/refit.mjs --html <file>    score another version of the app
//   node tools/refit.mjs --fit            refit on fights before the split and
//                                         print values to paste into index.html
//   --split 2022-01-01   first day of the test window (default 2022-01-01)
//   --data <dir>         folder holding the four ufcstats CSV files
//   --decay 0.94         with --fit, fix the recency decay instead of trying a grid
//   --json               print the scores as JSON (used by test/v24.test.mjs)
//
// Fitting only ever sees fights before the split. Coordinate descent on walk
// forward log loss, the same method the 2.0 feature coefficients came from.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const flag = k => process.argv.includes(k);

export function loadApp(htmlFile = path.join(ROOT, 'deploy', 'index.html')) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  const a = html.indexOf('const MODEL_VERSION=');
  const b = html.indexOf('/* ============================================================\n   PRICE ENGINE');
  if (a < 0 || b < a) throw new Error('could not find the model code in ' + htmlFile);
  const opt = n => `${n}:typeof ${n}!=='undefined'?${n}:null`;
  const f = new Function(html.slice(a, b) + `\n;return {UFCModel,build,P,FB,FKEY,attOf,MODEL_VERSION,${opt('STAT_DECAY')},${opt('ALIAS')}};`);
  return f();
}

export function loadData(dir = path.join(ROOT, 'test', 'fixtures')) {
  const r = f => fs.readFileSync(path.join(dir, f + '.csv'), 'utf8');
  return { a: r('ufc_fight_results'), b: r('ufc_fighter_tott'), e: r('ufc_event_details'), s: r('ufc_fight_stats'), at: 0 };
}

/* One pass in date order, exactly as fit() in the app does it. */
export function walk(app, fights, { P = app.P, decay = app.STAT_DECAY ?? 1, until = Infinity } = {}) {
  const m = new app.UFCModel(P); m.decay = decay;
  const out = [];
  for (const g of fights) {
    if (+g.date >= until) break;
    const d = m.detail(g.f1, g.f2, g.date, g.div, app.attOf);
    out.push({ t: +g.date, y: g.y, p: d.p, n1: d.n1, n2: d.n2 });
    m.update(g, d);
  }
  return out;
}

export function score(rows) {
  let n = 0, ll = 0, br = 0, w = 0;
  for (const x of rows) {
    n++; ll -= Math.log(Math.max(1e-9, x.y === 1 ? x.p : 1 - x.p)); br += (x.p - x.y) ** 2;
    if ((x.p > .5) === (x.y === 1)) w++;
  }
  const pos = rows.filter(x => x.y === 1).map(x => x.p).sort((a, b) => a - b), neg = rows.filter(x => x.y === 0).map(x => x.p);
  let s = 0;
  for (const v of neg) {
    let lo = 0, hi = pos.length; while (lo < hi) { const md = (lo + hi) >> 1; pos[md] <= v ? lo = md + 1 : hi = md; }
    let eq = 0, i = lo - 1; while (i >= 0 && pos[i] === v) { eq++; i--; }
    s += (pos.length - lo) + 0.5 * eq;
  }
  return { fights: n, log_loss: +(ll / n).toFixed(5), winners_picked: +(100 * w / n).toFixed(2), auc: +(s / (pos.length * neg.length)).toFixed(4), brier: +(br / n).toFixed(5) };
}

export function report(rows, split) {
  const y25 = Date.UTC(2025, 0, 1);
  return {
    train: score(rows.filter(x => x.t < split)),
    test: score(rows.filter(x => x.t >= split)),
    since_2025: score(rows.filter(x => x.t >= y25)),
    test_both_4_plus: score(rows.filter(x => x.t >= split && Math.min(x.n1, x.n2) >= 4)),
    test_with_a_debut: score(rows.filter(x => x.t >= split && Math.min(x.n1, x.n2) === 0)),
  };
}

function fitAll(app, fights, split, decays) {
  const FB0 = { ...app.FB };
  const keys = [...app.FKEY, 'b_age', 'age_peak'];
  let best = null;
  for (const decay of decays) {
    for (const k of app.FKEY) app.FB[k] = FB0[k];
    const th = { ...FB0, b_age: app.P.b_age, age_peak: app.P.age_peak };
    const loss = () => {
      for (const k of app.FKEY) app.FB[k] = th[k];
      return score(walk(app, fights, { P: { ...app.P, b_age: th.b_age, age_peak: th.age_peak }, decay, until: split })).log_loss;
    };
    let cur = loss();
    for (const frac of [0.3, 0.15, 0.07, 0.03, 0.015]) {
      for (const k of keys) {
        const step = Math.max(Math.abs(th[k]) * frac, 0.02 * frac);
        for (const dir of [1, -1]) {
          let moved = false;
          for (;;) { const old = th[k]; th[k] = old + dir * step; const l = loss(); if (l < cur - 1e-7) { cur = l; moved = true; } else { th[k] = old; break; } }
          if (moved) break;
        }
      }
    }
    console.error(`  decay ${decay}: training log loss ${cur}`);
    if (!best || cur < best.loss) best = { loss: cur, decay, th: { ...th } };
  }
  for (const k of app.FKEY) app.FB[k] = FB0[k];
  return best;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const split = Date.parse(arg('--split', '2022-01-01') + 'T00:00:00Z');
  const app = loadApp(arg('--html') ? path.resolve(arg('--html')) : undefined);
  const fights = app.build(loadData(arg('--data') ? path.resolve(arg('--data')) : undefined));
  const asIs = report(walk(app, fights), split);
  if (flag('--json') && !flag('--fit')) { console.log(JSON.stringify({ model_version: app.MODEL_VERSION, fights: fights.length, ...asIs })); process.exit(0); }
  console.log(`Corner ${app.MODEL_VERSION}: ${fights.length} decided fights, test window from ${new Date(split).toISOString().slice(0, 10)}`);
  const show = (name, r) => console.log(`  ${name.padEnd(20)} ${String(r.fights).padStart(5)} fights  log loss ${r.log_loss}  winners ${r.winners_picked}%  AUC ${r.auc}  Brier ${r.brier}`);
  for (const [k, v] of Object.entries(asIs)) show(k, v);
  if (flag('--fit')) {
    const decays = arg('--decay') ? [+arg('--decay')] : [1, 0.97, 0.94, 0.9];
    const t0 = Date.now();
    const best = fitAll(app, fights, split, decays);
    for (const k of app.FKEY) app.FB[k] = best.th[k];
    const P2 = { ...app.P, b_age: best.th.b_age, age_peak: best.th.age_peak };
    const after = report(walk(app, fights, { P: P2, decay: best.decay }), split);
    console.log(`\nRefit in ${((Date.now() - t0) / 1000).toFixed(0)} s, on fights before the split only:`);
    for (const [k, v] of Object.entries(after)) show(k, v);
    const r4 = x => +x.toFixed(4), r6 = x => +x.toFixed(6);
    console.log('\nPaste into deploy/index.html:');
    console.log(`  P.b_age=${r4(best.th.b_age)}, P.age_peak=${r4(best.th.age_peak)}`);
    console.log(`  const STAT_DECAY=${best.decay};`);
    console.log('  const FB={' + app.FKEY.map(k => `${k}:${r6(best.th[k])}`).join(', ') + '};');
  }
}
