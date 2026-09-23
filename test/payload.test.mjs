// Payload tests in jsdom: the contract schema (ajv), the app's own
// validator, The War Room's own import pipeline, and the Card tab the
// payload came from. Also covers unticking, label editing, card dates,
// a card half under way, no key, and no new network requests.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { bootApp, visibleLines, click, change, waitFor, ROOT, FIX, ODDS_KEY, fixture } from './lib/boot.mjs';

let fails = 0, passes = 0;
const ok = (c, m) => { if (c) passes++; else { fails++; console.log('  FAIL ' + m); } };
const section = s => console.log('\n[' + s + ']');
const roles = JSON.parse(fixture('roles.json'));
const byId = Object.fromEntries(Object.entries(roles).map(([k, v]) => [v.id, k]));

const schema = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'warroom-import-1.0.schema.json'), 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: false }); addFormats(ajv);
const schemaOk = ajv.compile(schema);

const WAR_ROOM = path.resolve(ROOT, '..', 'war-room');
const hasWarRoom = fs.existsSync(path.join(WAR_ROOM, 'src', 'lib', 'import', 'pipeline.ts'));
function warRoom(payload, nowIso, seed) {
  const file = path.join(ROOT, 'test', 'out', 'wr-preview-input.json');
  fs.writeFileSync(file, JSON.stringify(payload));
  const tsx = path.join(WAR_ROOM, 'node_modules', 'tsx', 'dist', 'cli.mjs');
  const args = [tsx, path.join(ROOT, 'test', 'warroom-preview.mts'), file, nowIso];
  if (seed) args.push(path.join(FIX, 'ufc_fighter_tott.csv'));
  try { return JSON.parse(execFileSync(process.execPath, args, { cwd: WAR_ROOM, encoding: 'utf8' })); }
  catch (e) { return JSON.parse(e.stdout || '{"errors":["pipeline crashed"]}'); }
}

async function cardApp(opts = {}) {
  const app = await bootApp({ mode: 'live', ...opts });
  const w = app.window;
  click(w, w.document.getElementById('tabCard'));
  await waitFor(() => w.eval('WR_IDS!==null'), 20000);
  await new Promise(r => setTimeout(r, 30));
  return app;
}
const build = w => JSON.parse(w.eval('JSON.stringify(wrBuild())'));
const count = w => w.document.getElementById('wrCount').textContent.replace(/\s+/g, ' ').trim();

// ---------------------------------------------------------------- full card
section('full card, 2026-09-26, clock 2026-09-23 19:00 UTC');
const { window: w, errors, requests, opened } = await cardApp();
const B = build(w), P = B.payload, R = P.records;
console.log('  panel: ' + count(w));
ok(B.errors.length === 0, 'in-app validation passes: ' + B.errors.join('; '));
ok(schemaOk(P), 'schema (ajv, draft 2020-12) passes: ' + ajv.errorsText(schemaOk.errors));
ok(P.batch.source_app === 'corner_ufc' && P.batch.model_version === '2.2.0' && P.batch.model_name === 'Corner UFC', 'batch identity');
ok(/^corner_ufc-2026-UFC 2026-09-26-\d{8}T\d{6}Z$/.test(P.batch.source_batch_id), 'source_batch_id format ' + P.batch.source_batch_id);
ok(P.batch.generated_at === '2026-09-23T19:00:00Z', 'generated_at is the press time in UTC');
ok(JSON.stringify(P.batch.model_config.rating) === w.eval('JSON.stringify(P)') && JSON.stringify(P.batch.model_config.feature_coefficients) === w.eval('JSON.stringify(FB)'), 'model_config carries P and FB as they are');
ok(!B.json.includes(ODDS_KEY) && !/apiKey/i.test(B.json), 'no Odds API key anywhere in the payload');
ok(!/[\u2013\u2014]/.test(B.json), 'no em or en dashes in the payload');

// What the Card tab displays, fight by fight.
const cardLines = visibleLines(w.document.getElementById('card'));
const shown = [];
for (let i = 0; i < cardLines.length; i++) {
  const m = cardLines[i].match(/^(.+) vs (.+) (\w{3} \d+)$/);
  if (!m) continue;
  const g = (cardLines[i + 1] || '').match(/^Corner ([\d.]+%) ([\d.]+%) Market, no vig (\S+) (\S+) Best price (.+)$/);
  shown.push({ a: m[1], b: m[2], date: m[3], corner: g && [g[1], g[2]], best: g && g[5], foot: cardLines[i + 2] || '' });
}
const fights = [...new Set(R.map(r => r.event.source_event_id))];
const onDate = shown.filter(s => s.date === 'Sep 26' && s.corner);
ok(fights.length === onDate.length && R.length === 2 * onDate.length, `record count ${R.length} = 2 x ${onDate.length} rated Sep 26 fights on the Card`);
ok(/^11 fights ticked, 22 records, UFC 2026-09-26\. Left out: 1 not rated\.$/.test(count(w)), 'status line counts');

const pc = x => (100 * x).toFixed(1) + '%';
const amer = v => v == null ? 'n/a' : (v > 0 ? '+' : '') + v;
let mirrored = 0, displayMatch = 0, priceMatch = 0;
for (const id of fights) {
  const [a, b] = ['fighter_a', 'fighter_b'].map(s => R.find(r => r.event.source_event_id === id && r.selection.side === s));
  ok(a && b, id + ' has both fighters');
  if (!a || !b) continue;
  if (a.model.prob_win === b.model.prob_loss && a.model.prob_loss === b.model.prob_win) mirrored++;
  for (const r of [a, b]) {
    const m = r.model;
    ok(Math.abs(m.prob_win + m.prob_push + m.prob_loss - 1) <= 0.001 && m.prob_push === 0, r.record_id + ' sums to 1 with no push');
  }
  const role = byId[id], ev = JSON.parse(fixture('odds-api.json')).find(e => e.id === id);
  const s = shown.find(x => x.a === ev.home_team && x.b === ev.away_team);
  if (s && s.corner[0] === pc(a.model.prob_win) && s.corner[1] === pc(b.model.prob_win)) displayMatch++;
  else console.log('  display mismatch', role, s && s.corner, a.model.prob_win);
  const priceText = r => r.price ? amer(r.price.american_odds) + ' ' + r.price.sportsbook : 'n/a';
  if (s && s.best === priceText(a) + ' ' + priceText(b)) priceMatch++;
  else console.log('  price mismatch', role, s && s.best, priceText(a), priceText(b));
  // flags that mirror a Card pill
  ok(a.flags.includes('thin_record') === / thin record/.test(s.foot), role + ' thin_record matches the Card pill');
  ok(a.flags.includes('worth_researching') === /worth researching/.test(s.foot), role + ' worth_researching matches the Card pill');
  ok(JSON.stringify(a.flags.filter(f => f !== 'no_price_in_app')) === JSON.stringify(b.flags.filter(f => f !== 'no_price_in_app')), role + ' fight-level flags on both fighters');
}
ok(mirrored === fights.length, `both sides mirror on ${mirrored} of ${fights.length} fights`);
ok(displayMatch === fights.length, `Corner % matches the Card on ${displayMatch} of ${fights.length} fights`);
ok(priceMatch === fights.length, `best price and book match the Card on ${priceMatch} of ${fights.length} fights`);

// Names, ids, dates.
const tott = fs.readFileSync(path.join(FIX, 'ufc_fighter_tott.csv'), 'utf8').split('\n').slice(1)
  .map(l => [l.split(',')[0].trim(), (l.match(/fighter-details\/([0-9a-f]+)/) || [])[1]]);
const idsFor = n => [...new Set(tott.filter(x => x[0] === n).map(x => x[1]))];
let names = 0, idOk = 0;
for (const r of R) for (const p of r.event.participants) {
  names++;
  const ids = idsFor(p.name);
  ok(w.eval(`M.f.has(${JSON.stringify(p.name)})`), p.name + ' is a Corner (ufcstats) fighter key');
  if ((ids.length === 1 && p.source_id === ids[0]) || (ids.length > 1 && p.source_id === undefined)) idOk++;
  else console.log('  id problem', p.name, ids, p.source_id);
}
ok(idOk === names, `source_id is the ufcstats id, or absent for a shared name: ${idOk} of ${names}`);
const rec = role => R.filter(r => r.event.source_event_id === roles[role].id);
ok(rec('shared_name')[0].event.participants[0].source_id === undefined && rec('shared_name')[0].event.participants[0].name === roles.shared_name.a, 'shared name (' + roles.shared_name.a + ') has no source_id');
ok(rec('accent_name')[0].selection.label === 'Jose Daniel Medina' && !rec('accent_name')[0].flags.includes('name_matched_loosely'), 'Odds API "José" goes as ufcstats "Jose", exact match, no loose flag');
ok(rec('loose_name')[0].selection.label !== roles.loose_name.a && rec('loose_name')[0].flags.includes('name_matched_loosely'), `loose match "${roles.loose_name.a}" goes as "${rec('loose_name')[0].selection.label}" with name_matched_loosely`);
ok(R.filter(r => r.flags.includes('name_matched_loosely')).length === 2, 'name_matched_loosely only on the loose fight');
ok(R.every(r => r.event.start_time === '2026-09-26T00:00:00Z' && r.event.start_time_precision === 'date' && r.event.timezone === 'America/New_York'), 'every record: Eastern date 2026-09-26, precision date');
ok(rec('no_books').length === 2, 'a fight at 01:00 UTC on the 27th is on the 26th card');
ok(R.every(r => !r.event.bout && r.model.projection.assumed_division), 'no bout block; assumed division in projection');

// Flags and prices by case.
const has = (role, f, n = 2) => rec(role).filter(r => r.flags.includes(f)).length === n;
ok(has('thin_record', 'thin_record'), 'thin_record on the thin record fight');
ok(has('layoff', 'layoff'), 'layoff on the layoff fight');
ok(!has('main_priced', 'layoff', 1) && !has('main_priced', 'layoff'), 'no layoff on the active fight');
ok(has('weight_class_move', 'weight_class_move'), 'weight_class_move on the division move fight');
ok(!R.filter(r => r.event.source_event_id === roles.main_priced.id).some(r => r.flags.includes('weight_class_move')), 'no weight_class_move within one division');
ok(has('other_books_only', 'no_price_in_app') && rec('other_books_only').every(r => !r.price), 'priced only at a book you did not select: no price block, no_price_in_app');
ok(has('no_books', 'no_price_in_app') && rec('no_books').every(r => !r.price), 'no books at all: no price block, no_price_in_app');
ok(R.filter(r => r.flags.includes('no_price_in_app')).length === 4 && R.filter(r => r.price).length === 18, '18 priced records, 4 unpriced');
const one = rec('dk_one_side').find(r => r.selection.side === 'fighter_a');
ok(one.price.sportsbook === 'DK' && one.price.opposite_american_odds === null, 'book that posts one side: its price, opposite null');
ok(R.filter(r => r.price).every(r => r.price.captured_at === '2026-09-23T19:00:00Z'), 'captured_at is the pull time, absolute UTC');
ok(R.filter(r => r.price && r.price.opposite_american_odds != null).every(r => {
  const ev = JSON.parse(fixture('odds-api.json')).find(e => e.id === r.event.source_event_id);
  const key = { DK: 'draftkings', FD: 'fanduel', MGM: 'betmgm', CZR: 'williamhill_us', FAN: 'fanatics' }[r.price.sportsbook];
  const bk = ev.bookmakers.find(b => b.key === key), opp = r.selection.side === 'fighter_a' ? ev.away_team : ev.home_team;
  return bk.markets[0].outcomes.find(o => o.name === opp).price === r.price.opposite_american_odds;
}), 'opposite odds are the same book\'s price on the other fighter');
for (const role of ['unrated', 'under_way', 'finished', 'card2_a'])
  ok(rec(role).length === 0, role + ' is not in the Sep 26 payload');

// The War Room's own pipeline.
if (hasWarRoom) {
  const a = warRoom(P, '2026-09-23T19:05:00Z', false), b = warRoom(P, '2026-09-23T19:05:00Z', true);
  console.log('  War Room pipeline, registry as shipped:', JSON.stringify(a.counts), 'warnings', JSON.stringify(a.warnings));
  console.log('  War Room pipeline, fighters seeded from ufcstats:', JSON.stringify(b.counts));
  ok(a.errors && a.errors.length === 0, 'War Room pipeline: 0 errors ' + (a.errors || []).slice(0, 3).join('; '));
  ok(b.counts && b.counts.needs_match === 0 && b.counts.new === R.length, 'with a ufcstats seed every fighter name resolves exactly');
} else console.log('  (../war-room not checked out: pipeline check skipped)');

fs.mkdirSync(path.join(ROOT, 'test', 'out'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'test', 'out', 'sample-card.json'), B.json);

// Negative checks: the in-app validator and the schema both refuse.
section('bad payloads are refused');
const mut = [
  ['probabilities off', p => { p.records[0].model.prob_win = 0.9; }],
  ['price with no book', p => { const r = p.records.find(x => x.price); delete r.price.sportsbook; }],
  ['price with no captured_at', p => { const r = p.records.find(x => x.price); r.price.captured_at = '5 min ago'; }],
  ['no price and no flag', p => { const r = p.records.find(x => !x.price); r.flags = []; }],
  ['wrong role', p => { p.records[0].event.participants[0].role = 'home'; }],
  ['start_time not UTC', p => { p.records[0].event.start_time = '2026-09-26'; }],
  ['odds between -100 and +100', p => { p.records.find(x => x.price).price.american_odds = 50; }],
];
for (const [name, f] of mut) {
  const q = JSON.parse(B.json); f(q);
  const app = w.eval(`wrValidate(${JSON.stringify(q)})`).length > 0;
  const sch = !schemaOk(q);
  const wrp = hasWarRoom ? (() => { const x = warRoom(q, '2026-09-23T19:05:00Z'); return !!(x.parseErrors || (x.errors && x.errors.length)); })() : null;
  console.log(`  ${name.padEnd(28)} app ${app ? 'refuses' : 'ACCEPTS'}, schema ${sch ? 'refuses' : 'accepts'}${wrp === null ? '' : ', War Room ' + (wrp ? 'refuses' : 'accepts')}`);
  ok(app, 'in-app validator refuses: ' + name);
}
// The app shows validation errors and does not send.
w.eval(`WR_LAST=Object.assign({},wrBuild(),{errors:['test error']})`);
click(w, w.document.getElementById('wrSend'));
ok(opened.length === 0, 'a failing payload opens no tab');
ok(/Not sent/.test(w.document.getElementById('wrStatus').textContent), 'a failing payload shows its errors');
w.eval('WR_LAST=null');

// ---------------------------------------------------------------- untick and label
section('untick a fight from another promotion, edit the label');
const box = [...w.document.querySelectorAll('#wrFights input')].find(x => x.value === roles.other_promotion.id);
box.checked = false; change(w, box);
const B2 = build(w);
ok(B2.payload.records.length === 20 && !B2.payload.records.some(r => r.event.source_event_id === roles.other_promotion.id), 'unticked fight left out: 20 records');
ok(count(w) === '10 fights ticked, 20 records, UFC 2026-09-26. Left out: 1 unticked, 1 not rated.', 'status line counts ticked fights only: ' + count(w));
const lab = w.document.getElementById('wrLabel');
lab.focus(); lab.value = 'UFC Fight Night: Test'; lab.dispatchEvent(new w.Event('input', { bubbles: true })); lab.blur();
const B3 = build(w);
ok(B3.payload.records.every(r => r.grouping.label === 'UFC Fight Night: Test') && B3.payload.batch.source_batch_id.startsWith('corner_ufc-2026-UFC Fight Night: Test-'), 'edited label in every record and the batch id');
w.eval('renderCard()'); await new Promise(r => setTimeout(r, 30));
ok(lab.value === 'UFC Fight Night: Test' && !w.document.querySelector(`#wrFights input[value="${roles.other_promotion.id}"]`).checked, 'label and untick survive a Card re-render');
const sel = w.document.getElementById('wrDate');
ok([...sel.options].map(o => o.value).join() === '2026-09-26,2026-10-03', 'card dates offered: ' + [...sel.options].map(o => o.textContent).join(' | '));
sel.value = '2026-10-03'; change(w, sel);
const B4 = build(w);
ok(lab.value === 'UFC 2026-10-03' && B4.payload.records.length === 6 && B4.payload.records.every(r => r.event.start_time === '2026-10-03T00:00:00Z'), 'second card: default label, 6 records');
ok(B4.payload.records.some(r => r.event.source_event_id === roles.card2_c.id), 'a 00:00 UTC Oct 4 fight belongs to the Oct 3 card');
sel.value = '2026-09-26'; change(w, sel);
ok(lab.value === 'UFC Fight Night: Test', 'back on the first card, the edited label is still there');

// Send in jsdom: opens the receiver, nothing else.
section('send and network');
w.eval("localStorage.removeItem('corner.warroom.url')");
click(w, w.document.getElementById('wrSend'));
ok(opened.length === 1 && opened[0].url === 'https://lighthearted-kringle-dafe7e.netlify.app/import/receive' && opened[0].target === '_blank', 'Send opens the default receiver in a new tab');
ok(/blocked the new tab/.test(w.document.getElementById('wrStatus').textContent), 'a blocked tab shows the fallbacks message');
const before = await bootApp({ mode: 'live', htmlFile: path.join(ROOT, 'test', 'out', 'original-2.1.0.html') });
click(before.window, before.window.document.getElementById('tabCard'));
await new Promise(r => setTimeout(r, 100));
const hosts = rq => [...new Set(rq.map(u => new URL(u).origin + new URL(u).pathname))].sort();
ok(JSON.stringify(hosts(requests)) === JSON.stringify(hosts(before.requests)), 'same requests as the 2.1.0 app: ' + hosts(requests).join(', '));
before.window.close();
ok(errors.length === 0, 'no JS errors: ' + errors.join(' | '));
w.close();

// ---------------------------------------------------------------- mid card
section('card half under way (clock 2026-09-26 23:30 UTC)');
{
  const { window: w2, errors: e2 } = await cardApp({ now: Date.parse('2026-09-26T23:30:00Z') });
  const Bm = build(w2);
  ok(Bm.errors.length === 0 && schemaOk(Bm.payload), 'valid');
  const late = Object.values(roles).filter(r => r.when >= '2026-09-27T00:00:00Z' && r.when < '2026-09-28' && !/Unrecorded/.test(r.a)).map(r => r.id).sort();
  ok(JSON.stringify([...new Set(Bm.payload.records.map(r => r.event.source_event_id))].sort()) === JSON.stringify(late), 'only the fights not yet started are sent: ' + late.length);
  ok(count(w2) === '5 fights ticked, 10 records, UFC 2026-09-26. Left out: 1 not rated, 6 already under way.', 'status: ' + count(w2));
  if (hasWarRoom) { const x = warRoom(Bm.payload, '2026-09-26T23:35:00Z'); ok(x.errors.length === 0, 'War Room pipeline accepts it: ' + JSON.stringify(x.warnings)); }
  ok(e2.length === 0, 'no JS errors');
  w2.close();
}

// ---------------------------------------------------------------- no key
section('no Odds API key');
{
  const { window: w3, errors: e3 } = await bootApp({ mode: 'bare' });
  click(w3, w3.document.getElementById('tabCard'));
  await new Promise(r => setTimeout(r, 50));
  ok(count(w3) === 'Add an Odds API key below. The card comes from the price pull.', 'says why: ' + count(w3));
  ok(['wrSend', 'wrCopy', 'wrDownload'].every(id => w3.document.getElementById(id).disabled), 'buttons disabled');
  ok(e3.length === 0, 'no JS errors');
  w3.close();
}

// ---------------------------------------------------------------- dashes
section('dashes');
for (const f of ['deploy/index.html', 'deploy/sw.js'])
  ok(!/[\u2013\u2014]/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')), 'no em or en dashes in ' + f);

console.log(`\n${passes} passed, ${fails} failed`);
process.exit(fails ? 1 : 0);
