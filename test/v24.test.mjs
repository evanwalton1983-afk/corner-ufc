// 2.4 checks: debutants rated, weight classes, shared names, picker coverage,
// the pick, the refit's documented numbers, the second opinion's record, and
// the disagreement log backup. jsdom on the frozen data, as the other suites.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { bootApp, dumpStorage, visibleLines, click, ROOT } from './lib/boot.mjs';

let passes = 0, fails = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL ' + m); } };
const section = s => console.log('\n[' + s + ']');
const J = (w, x) => JSON.parse(w.eval(`JSON.stringify(${x})`));

const { window: w, errors } = await bootApp({ mode: 'live' });
const d = w.document, $ = id => d.getElementById(id);

section('1. debutants are rated');
click(w, $('tabCard')); await new Promise(r => setTimeout(r, 50));
const card = visibleLines($('card'));
ok(!card.some(l => /^Not rated/.test(l)), 'no "Not rated" fight left on the Card');
const ki = card.findIndex(l => /^Kaito Unrecorded vs Beneil Dariush/.test(l));
ok(ki >= 0 && /^Pick: /.test(card[ki + 1]) && /^Corner /.test(card[ki + 2]), 'the unknown name gets a pick and a forecast');
ok(card.slice(ki, ki + 5).some(l => /not in ufcstats under this name, so Corner rates a debut/.test(l)), 'and says why, with the spelling caveat');
const debut = J(w, `(()=>{const n=[...ATT.keys()].find(k=>!M.f.has(k)&&ATT.get(k).dob&&ATT.get(k).dob>new Date('1998-01-01'));return n;})()`);
ok(debut && J(w, `NAMESET.has(${JSON.stringify(debut)})`), 'a ufcstats profile with no UFC fight is in the picker: ' + debut);
w.eval(`comboA.set(${JSON.stringify(debut)});comboB.set('Joshua Van');onPick()`);
click(w, $('tabMatch'));
const v = visibleLines($('verdict'));
ok(v.some(l => /has 0 UFC fights on record/.test(l)) && v.some(l => /^\d+\.\d% \d+\.\d%$/.test(l)), 'a debut matchup forecasts, with the thin record warning');
ok(/No UFC fights on record, rated as a debut/.test(J(w, `nameNote(${JSON.stringify(debut)})`)), 'search row says it is a debut');

section('4. weight classes, shared names, picker coverage');
ok(J(w, 'DIVS').every(x => !/Interim|Catch|Open|Tournament|Title/.test(x)), 'divisions are classes only: ' + J(w, 'DIVS').join(', '));
for (const f of ['Tom Aspinall', 'Alex Pereira', 'Ciryl Gane']) ok(J(w, `FMETA.get(${JSON.stringify(f)}).div`) === 'Heavyweight' || J(w, `FMETA.get(${JSON.stringify(f)}).div`) === 'Light Heavyweight', f + ' is filed under his class, not "Interim": ' + J(w, `FMETA.get(${JSON.stringify(f)}).div`));
ok(J(w, `[...FMETA].filter(([k,m])=>m.div&&!CLASSES.some(c=>c[0]===m.div)).length`) === 0, 'nobody filed under Catch Weight');
ok(J(w, `divClass('UFC Interim Heavyweight Title Bout')`) === 'Heavyweight' && J(w, `divClass("Ultimate Fighter 28 Women's Featherweight Tournament")`) === "Women's Featherweight"
  && J(w, `divClass('Light Heavyweight Bout')`) === 'Light Heavyweight' && J(w, `divClass('Catch Weight Bout')`) === null, 'divClass maps labels to classes');
ok(J(w, `M.f.has('Bruno Silva (Flyweight)')&&M.f.has('Bruno Silva (Middleweight)')&&!M.f.has('Bruno Silva')`), 'Bruno Silva split into the flyweight and the middleweight');
ok(J(w, `M.get('Bruno Silva (Flyweight)').n+M.get('Bruno Silva (Middleweight)').n`) === 22, 'their 22 fights shared between them');
ok(J(w, `ATT.get('Jean Silva').dob.getUTCFullYear()`) === 1996, 'Jean Silva is the featherweight born 1996, not the man born 1977');
ok(J(w, `ATT.get('Mike Davis').reach`) === 72, 'Mike Davis has his reach back');
ok(J(w, `fighterFor('Bruno Silva','Joshua Van')`) === 'Bruno Silva (Flyweight)' && J(w, `fighterFor('Bruno Silva','Chris Weidman')`) === 'Bruno Silva (Middleweight)', 'a book name for a shared name resolves by the opponent');
ok(J(w, 'NAMES.length') > 4000 && J(w, `NAMESET.has('Michael McDonald')&&NAMESET.has('Chris Weidman')`), 'every rated fighter can be picked, retired ones included: ' + J(w, 'NAMES.length'));
ok(J(w, `searchNames('').length`) === 60 && J(w, `searchNames('').every(n=>nameGroup(n)===0)`), 'empty search still lists active fighters');
const ss = J(w, `searchNames('silva')`);
ok(ss.length > 5 && J(w, `${JSON.stringify(ss)}.map(nameGroup)`).every((g, i, a) => !i || a[i - 1] <= g), 'search lists active fighters first');
ok(J(w, `searchNames('jose daniel')`).includes('Jose Daniel Medina') && J(w, `searchNames('josé')`).length > 0, 'search ignores accents');

section('1. the pick');
const rows = J(w, `cardRows().filter(r=>r.d).map(r=>({nvA:r.nvA,p:r.d.p,A:r.nameA,B:r.nameB}))`);
const picks = [...$('card').querySelectorAll('.cr-pick')].map(e => e.textContent.replace(/\s+/g, ' ').trim());
ok(picks.length === rows.length, `a pick on every rated fight: ${picks.length} of ${rows.length}`);
let right = 0;
rows.forEach((r, i) => {
  const who = r.nvA != null ? (r.nvA >= .5 ? r.A : r.B) : (r.p >= .5 ? r.A : r.B);
  const src = r.nvA != null ? 'in the betting market' : 'from Corner';
  if (picks[i].startsWith(`Pick: ${who}, `) && picks[i].includes(src)) right++;
  else console.log('   ', picks[i], '| expected', who, src);
});
ok(right === rows.length, 'market favorite when priced, Corner otherwise');
ok(picks.some(p => /Corner agrees/.test(p)) && picks.some(p => /Corner picks /.test(p)), 'agreement and disagreement both shown');
ok(/Corner agrees with the market on \d+ of \d+ priced fights/.test(visibleLines($('card'))[0]), 'Card opens with the summary');
const order = [...$('cardView').children].map(e => e.id);
ok(order.indexOf('card') < order.indexOf('wrPanel') && order.indexOf('wrPanel') < order.indexOf('cardTools'), 'fights first, then War Room, then prices and the test: ' + order.join(','));
ok($('cardTools').querySelector('#peKey') && /Is Corner seeing anything/.test($('cardTools').textContent), 'key form and the market test moved below');
w.eval(`comboA.set('Alexander Hernandez');comboB.set('Arman Tsarukyan');onPick()`);
const mp = visibleLines($('verdict'));
ok(/^Pick: Arman Tsarukyan , [\d.]+%, strong favorite in the betting market\./.test(mp[0]) && /Market price from the card/.test(mp[1]), 'Matchup pick uses the market for a fight on the card: ' + mp[0]);
w.eval(`comboA.set('Alexandre Pantoja');comboB.set('Joshua Van');onPick()`);
ok(/^Pick: Joshua Van , [\d.]+%, \w[\w ]+, from Corner\.$/.test(visibleLines($('verdict'))[0]), 'Matchup pick from Corner otherwise: ' + visibleLines($('verdict'))[0]);

section('5. second opinion record');
const st = J(w, 'SO_GL.stats');
ok(st.agree.n + st.disagree.n === 2435 && st.disagree.n > 500, `every fight since 2022 counted: agree ${st.agree.n}, disagree ${st.disagree.n}`);
ok(st.agree.right / st.agree.n > st.disagree.right / st.disagree.n && st.disagree.right / st.disagree.n > .5, 'Corner is right more often when they agree, and still more often than not when they do not');
const disagreeText = J(w, 'soRecord(false)');
ok(/^Picks the other fighter\. Since 2022, when the two disagreed, Corner picked the winner in \d+% of [\d,]+ fights\. Treat it as a reason to look closer/.test(disagreeText), disagreeText);
ok(!/<b>/.test(disagreeText), 'no bold warning');

section('6. disagreement log backup');
click(w, $('tabSettings'));
ok(/Disagreement log backup/.test($('settings').textContent) && $('bkExport') && $('bkImport'), 'Settings has Export and Import');
const before = J(w, 'Object.keys(SNAPS).length');
const exp = J(w, 'JSON.parse(JSON.stringify(SNAPS))');
ok(JSON.stringify(J(w, `snapsMerge(${JSON.stringify(exp)})`)) === '{"added":0,"updated":0,"skipped":0}', 'importing what is already here changes nothing');
const k0 = Object.keys(exp)[0], extra = { ...exp };
extra['evt-new'] = { ...exp[k0], first: { ...exp[k0].first }, last: { ...exp[k0].last } };
extra[k0] = { ...exp[k0], first: { ...exp[k0].first, t: exp[k0].first.t - 3600e3 } };
extra.junk = { a: 1 };
const res = J(w, `snapsMerge(${JSON.stringify(extra)})`);
ok(res.added === 1 && res.updated === 1 && res.skipped === 1 && J(w, 'Object.keys(SNAPS).length') === before + 1, 'merge adds new fights, keeps the earlier open, skips junk: ' + JSON.stringify(res));
ok(J(w, `SNAPS[${JSON.stringify(k0)}].first.t`) === exp[k0].first.t - 3600e3, 'earlier open kept');
ok(errors.length === 0, 'no JS errors: ' + errors.join(' | '));

section('restored cache gives the same answers');
const storage = dumpStorage(w);
const pairsNow = J(w, `[['Tom Aspinall','Ciryl Gane'],['Bruno Silva (Flyweight)','Joshua Van'],[${JSON.stringify(debut)},'Joshua Van']].map(([a,b])=>M.detail(a,b,new Date(),divFor(a,b),attOf).p)`);
w.close();
const again = await bootApp({ mode: 'live', storage });
ok(again.window.eval('FIT_CACHED') === true, 'second boot restored the fit');
ok(JSON.stringify(J(again.window, `[['Tom Aspinall','Ciryl Gane'],['Bruno Silva (Flyweight)','Joshua Van'],[${JSON.stringify(debut)},'Joshua Van']].map(([a,b])=>M.detail(a,b,new Date(),divFor(a,b),attOf).p)`)) === JSON.stringify(pairsNow), 'same forecasts, split names and debutants after a restore');
ok(J(again.window, 'ALIAS.size') === 7 && J(again.window, 'NAMES.length') > 4000, 'aliases and the full picker list survive the cache');
ok(again.errors.length === 0, 'no JS errors on restore');
again.window.close();

section('3. the refit, as documented');
const r = JSON.parse(execFileSync(process.execPath, [path.join(ROOT, 'tools', 'refit.mjs'), '--json'], { encoding: 'utf8' }));
ok(r.model_version === '2.4.0' && r.fights === 8742, 'harness scores 2.4.0 on 8,742 fights');
ok(r.test.fights === 2435 && r.test.winners_picked === 62.79 && r.test.log_loss === 0.64201 && r.test.auc === 0.6791, 'since 2022: 62.79% winners, log loss .64201, AUC .6791, as in the notes: ' + JSON.stringify(r.test));
ok(r.test_with_a_debut.winners_picked === 58.15, 'with a debutant: 58.15% winners');

section('dashes');
for (const f of ['deploy/index.html', 'deploy/sw.js', 'tools/refit.mjs', 'README.md', 'CHANGELOG.md', 'test/v24.test.mjs'])
  ok(!/[\u2013\u2014]/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), 'no em or en dashes in ' + f);

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
