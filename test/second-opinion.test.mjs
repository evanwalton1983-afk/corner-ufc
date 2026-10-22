// Second opinion rating (2.3): the Glicko-2 replay, its win probability against
// the library's own predict, the badge and its Settings cutoffs, the OpenSkill
// toggle, the new export fields, and the app with the library missing.
import fs from 'node:fs';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { bootApp, dumpStorage, click, change, waitFor, ROOT } from './lib/boot.mjs';

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL ' + m); } };
const section = s => console.log('\n[' + s + ']');
const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'warroom-import-1.0.schema.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false }); addFormats(ajv);
const schemaOk = ajv.compile(schema);
const ev = (w, code) => JSON.parse(w.eval(`JSON.stringify(${code})`));
const $ = (w, id) => w.document.getElementById(id);
const soRows = w => [...w.document.querySelectorAll('#card .so-row')];
const glRows = w => soRows(w).filter(r => /Glicko-2/.test(r.textContent));

section('replay and probability');
const app = await bootApp({ mode: 'live' });
const w = app.window;
ok(ev(w, 'SO_GL!==null'), 'glicko ratings built');
ok(ev(w, 'REPLAY.rows.length') > 8000, 'whole history replayed: ' + ev(w, 'REPLAY.rows.length') + ' fights');
// Same number as the library's own predict, using both deviations.
const libVs = ev(w, `(()=>{const G=new glicko2.Glicko2({tau:0.5});
  const a=G.makePlayer(1700,80,0.06), b=G.makePlayer(1500,200,0.06);
  const through=SO_GL.through, keep=SO_GL.map;
  SO_GL.map=new Map([['A',{r:a.getRating(),rd:a.getRd(),vol:0.06}],['B',{r:b.getRating(),rd:b.getRd(),vol:0.06}]]);
  const mine=glPair('A','B',new Date(Date.UTC(Math.floor((through+1)/12),(through+1)%12,15))).p;
  SO_GL.map=keep; return [G.predict(a,b),mine]; })()`);
ok(Math.abs(libVs[0] - libVs[1]) < 1e-12, `matches library predict ${libVs[0]} vs ${libVs[1]}`);
// Idle fighters grow more uncertain: same fighter, later fight date.
const grow = ev(w, `(()=>{const f=[...SO_GL.map.keys()].find(k=>FMETA.has(k)&&M.get(k).n>=5);
  const t=new Date(+THROUGH+30*864e5), u=new Date(+THROUGH+5*365*864e5);
  return [glPair(f,f+'x',t).rdA, glPair(f,f+'x',u).rdA]; })()`);
ok(grow[1] > grow[0] + 15, `RD grows with idle months: ${grow[0].toFixed(0)} -> ${grow[1].toFixed(0)}`);
ok(ev(w, `Math.abs(glPair('Aaron Pico','Abus Magomedov',new Date()).p+glPair('Abus Magomedov','Aaron Pico',new Date()).p-1)<1e-9`), 'p(a)+p(b)=1');

section('Matchup and Card');
const pick = (a, b) => w.eval(`comboA.set(${JSON.stringify(a)});comboB.set(${JSON.stringify(b)});onPick()`);
click(w, $(w, 'tabMatch')); pick('Alexander Volkanovski', 'Adrian Yanez');
const mv = $(w, 'verdict').querySelector('[data-so]');
ok(mv && /Glicko-2/.test(mv.textContent) && /confidence/.test(mv.textContent), 'Matchup shows the second opinion with a badge');
ok(/Corner's forecast above is unchanged/.test(mv.textContent), 'Matchup says Corner is unchanged');
click(w, $(w, 'tabCard'));
ok(glRows(w).length >= 10, 'Card rows carry a Glicko-2 line: ' + glRows(w).length);
ok(glRows(w).every(r => /(High|Medium|Low) confidence/.test(r.textContent)), 'every Glicko-2 row has its badge');

section('Settings cutoffs');
click(w, $(w, 'tabSettings'));
ok(/Second opinion rating/.test($(w, 'settings').textContent), 'Settings tab renders');
const set = (id, v) => { const i = $(w, id); i.value = v; i.dispatchEvent(new w.Event('input', { bubbles: true })); };
set('soHi', '1000'); set('soLo', '2000');
click(w, $(w, 'tabCard'));
ok(glRows(w).every(r => /High confidence/.test(r.textContent)), 'wide cutoffs: all High');
click(w, $(w, 'tabSettings')); set('soHi', '1'); set('soLo', '2');
click(w, $(w, 'tabCard'));
ok(glRows(w).every(r => /Low confidence/.test(r.textContent)), 'tiny cutoffs: all Low');
click(w, $(w, 'tabSettings')); set('soHi', '300'); set('soLo', '200');
ok(/must be larger/.test($(w, 'soMsg').textContent), 'a bad pair is refused with a message');
ok(ev(w, 'SO_S.hi') === 1, 'a bad pair is not saved');
click(w, $(w, 'soReset'));
ok(ev(w, 'SO_S.hi') === 140 && ev(w, 'SO_S.lo') === 200, 'reset restores 140 and 200');

section('Send to War Room fields');
click(w, $(w, 'tabCard'));
await waitFor(() => w.eval('WR_IDS!==null'), 20000);
let B = JSON.parse(w.eval('JSON.stringify(wrBuild())')), P = B.payload;
ok(B.errors.length === 0, 'validates in app: ' + B.errors.join('; '));
ok(schemaOk(P), 'validates against the contract schema: ' + JSON.stringify((schemaOk.errors || []).slice(0, 2)));
const R = P.records;
ok(R.every(r => typeof r.model.projection.glicko2_prob_win === 'number' && ['high', 'medium', 'low'].includes(r.model.projection.glicko2_confidence)), 'every record has glicko2 probability and confidence');
let pairsOk = true;
for (let i = 0; i < R.length; i += 2) {
  const a = R[i].model.projection, b = R[i + 1].model.projection;
  if (Math.abs(a.glicko2_prob_win + b.glicko2_prob_win - 1) > 2e-6 || a.glicko2_confidence !== b.glicko2_confidence
    || a.glicko2_rd !== b.glicko2_opponent_rd || a.glicko2_opponent_rd !== b.glicko2_rd) pairsOk = false;
}
ok(pairsOk, 'two sides of a fight are mirror images');
ok(R.every(r => r.model.projection.openskill_prob_win === undefined), 'no openskill field while the toggle is off');
ok(R.every(r => Math.abs(r.model.prob_win + r.model.prob_loss - 1) < 1e-6), "Corner's prob_win still sums to 1");
ok(P.batch.model_config.second_opinion.glicko2.library === 'glicko2@1.2.2', 'model_config names the library and settings');
const withP = R.map(r => r.model.prob_win);

section('OpenSkill toggle');
click(w, $(w, 'tabSettings')); $(w, 'soOs').checked = true; change(w, $(w, 'soOs'));
await waitFor(() => w.eval("OS_STATE==='ready'"), 20000);
click(w, $(w, 'tabCard'));
ok(soRows(w).some(r => /OpenSkill/.test(r.textContent)), 'Card shows an OpenSkill line');
B = JSON.parse(w.eval('JSON.stringify(wrBuild())')); P = B.payload;
ok(B.errors.length === 0 && schemaOk(P), 'still valid with openskill on');
ok(P.records.every(r => typeof r.model.projection.openskill_prob_win === 'number'), 'openskill_prob_win on every record');
ok(P.records.map(r => r.model.prob_win).join() === withP.join(), "Corner's probabilities identical with openskill on");
ok(P.batch.model_config.second_opinion.openskill.library === 'openskill@5.0.1', 'model_config names openskill');
ok(app.errors.length === 0, 'no JS errors: ' + app.errors.join('; '));

section('restored cache');
const stor = dumpStorage(w);
const app2 = await bootApp({ mode: 'live', storage: stor });
ok(app2.window.eval('FIT_CACHED') === true, 'second boot restored the cached fit');
ok(JSON.stringify(ev(app2.window, '[...SO_GL.map].slice(0,40)')) === JSON.stringify(ev(w, '[...SO_GL.map].slice(0,40)')), 'same glicko ratings from the cached fight list');
ok(app2.errors.length === 0, 'no JS errors on restored boot');

section('library missing');
process.env.NO_GLICKO = '1';
const bare = await bootApp({ mode: 'live' });
const bw = bare.window;
ok(bw.eval('SO_GL') === null, 'no ratings without the library');
click(bw, bw.document.getElementById('tabCard'));
await waitFor(() => bw.eval('WR_IDS!==null'), 20000);
ok(bw.document.querySelectorAll('#card .so-row').length === 0, 'no second opinion rows');
const NB = JSON.parse(bw.eval('JSON.stringify(wrBuild())'));
ok(NB.errors.length === 0 && schemaOk(NB.payload), 'export still valid');
ok(NB.payload.records.every(r => r.model.projection.glicko2_prob_win === undefined), 'no glicko2 fields');
ok(NB.payload.records.map(r => r.model.prob_win).join() === withP.join(), "Corner's numbers are the same without the library");
click(bw, bw.document.getElementById('tabSettings'));
ok(/did not load/.test(bw.document.getElementById('settings').textContent), 'Settings says the library did not load');
ok(bare.errors.length === 0, 'no JS errors: ' + bare.errors.join('; '));
delete process.env.NO_GLICKO;

console.log(`\n${passes} checks passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
