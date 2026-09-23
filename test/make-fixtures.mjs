// Builds the frozen Odds API response (test/fixtures/odds-api.json), the
// seeded disagreement log (test/fixtures/snaps.json) and a roles file naming
// which fight covers which case (test/fixtures/roles.json).
//
// Fighters are real, picked from the frozen ufcstats files by rule. Every
// price is MADE UP: it is Corner's own number shifted by a fixed offset, with
// a 4.5% vig, so no price in any fixture or sample is a real market price.
// Run once; the outputs are committed.
import fs from 'node:fs';
import path from 'node:path';
import { bootApp, FIX, NOW } from './lib/boot.mjs';

const { window: w } = await bootApp({ mode: 'bare' });
const J = s => JSON.parse(w.eval(`JSON.stringify(${s})`));
const DAY = 864e5;

// Every name with its record, for picking by rule.
const people = J(`NAMES.map(n=>{const a=M.get(n),m=FMETA.get(n);return{n,fights:a.n,div:a.div,last:+a.last,idle:Math.round((Date.now()-a.last)/864e5),parts:n.split(' ')}})`);
const tott = fs.readFileSync(path.join(FIX, 'ufc_fighter_tott.csv'), 'utf8').split('\n').slice(1).map(l => l.split(',')[0]);
const shared = new Set(tott.filter((n, i) => tott.indexOf(n) !== i));
const used = new Set();
const take = (why, f) => {
  const p = people.find(x => !used.has(x.n) && !shared.has(x.n) && f(x));
  if (!p) throw new Error('no fighter for ' + why);
  used.add(p.n); return p.n;
};
const est = div => x => x.div === div && x.fights >= 8 && x.idle < 250;

// Loose match: an Odds API style short first name that Corner can only match
// by last name plus first initial.
let loose = null;
for (const x of people) {
  if (used.has(x.n) || shared.has(x.n) || x.parts.length !== 2 || x.parts[0].length < 6 || x.idle > 300) continue;
  const api = x.parts[0].slice(0, 3) + ' ' + x.parts[1];
  if (w.eval(`fighterFor(${JSON.stringify(api)})`) === x.n) { loose = { api, n: x.n }; used.add(x.n); break; }
}
if (!loose) throw new Error('no loose-match fighter');
// Accent variant: exact once normalised, so no loose flag.
const accent = people.find(x => !used.has(x.n) && /^Jose /.test(x.n) && x.idle < 400);
if (!accent) throw new Error('no Jose');
used.add(accent.n);
const accentApi = accent.n.replace(/^Jose /, 'José ');
const sharedName = [...shared].find(n => people.some(x => x.n === n));
used.add(sharedName);

const F = [];   // [role, apiA, apiB, commenceIso, pricing]
const add = (role, a, b, when, pricing = 'full') => F.push({ role, a, b, when, pricing });
// Card 1: Saturday 2026-09-26, Eastern. The last fight starts 01:00 UTC on the 27th, which is still the 26th in New York.
add('main_priced', take('lw1', est('Lightweight')), take('lw2', est('Lightweight')), '2026-09-26T22:00:00Z');
add('thin_record', take('thin', x => x.fights >= 1 && x.fights <= 2 && x.idle < 300), take('mw', est('Middleweight')), '2026-09-26T22:00:00Z');
add('layoff', take('idle', x => x.idle > 420 && x.idle < 800 && x.fights >= 5 && x.div === 'Welterweight'), take('ww', est('Welterweight')), '2026-09-26T22:00:00Z');
add('weight_class_move', take('fw', est('Featherweight')), take('bw', est('Bantamweight')), '2026-09-26T23:00:00Z');
add('loose_name', loose.api, take('opp', est('Flyweight')), '2026-09-26T23:00:00Z');
add('accent_name', accentApi, take('opp2', x => x.fights >= 5 && x.idle < 300), '2026-09-26T23:00:00Z');
add('shared_name', sharedName, take('opp3', x => x.fights >= 4 && x.idle < 300 && x.div === people.find(p => p.n === sharedName).div), '2026-09-27T00:00:00Z');
add('other_books_only', take('hw1', est('Heavyweight')), take('hw2', est('Heavyweight')), '2026-09-27T00:00:00Z', 'betrivers');
add('dk_one_side', take('lhw1', est('Light Heavyweight')), take('lhw2', est('Light Heavyweight')), '2026-09-27T00:00:00Z', 'dk_one_side');
add('no_books', take('ws1', est("Women's Strawweight")), take('ws2', est("Women's Strawweight")), '2026-09-27T01:00:00Z', 'none');
add('unrated', 'Kaito Unrecorded', take('lw3', est('Lightweight')), '2026-09-27T01:00:00Z');
add('other_promotion', take('mw2', est('Middleweight')), take('mw3', est('Middleweight')), '2026-09-27T01:00:00Z');
// Card 2: Saturday 2026-10-03.
add('card2_a', take('fl1', est('Flyweight')), take('fl2', est('Flyweight')), '2026-10-03T23:00:00Z');
add('card2_b', take('wf1', est("Women's Flyweight")), take('wf2', est("Women's Flyweight")), '2026-10-03T23:00:00Z');
add('card2_c', take('bw2', est('Bantamweight')), take('bw3', est('Bantamweight')), '2026-10-04T00:00:00Z');
// Under way: started two hours ago, which the Card tab still shows.
add('under_way', take('lw4', est('Lightweight')), take('lw5', est('Lightweight')), '2026-09-23T17:00:00Z');
// Finished: started nine hours ago, past the Card tab's six hour window.
add('finished', take('ww2', est('Welterweight')), take('ww3', est('Welterweight')), '2026-09-23T10:00:00Z');

const BOOKS = [['draftkings', 'DraftKings'], ['fanduel', 'FanDuel'], ['betmgm', 'BetMGM'], ['williamhill_us', 'Caesars'],
  ['fanatics', 'Fanatics'], ['betrivers', 'BetRivers']];
// Market = Corner shifted by a fixed offset, so some gaps pass the 5 point line and some do not.
const OFFS = [-0.08, 0.02, 0.06, -0.03, 0.01, -0.06, 0.04, 0.0, -0.02, 0.07, 0.03, -0.05, 0.05, -0.01, 0.02, 0.0, 0.0];
const american = p => { const r = p >= 0.5 ? -100 * p / (1 - p) : 100 * (1 - p) / p; const v = Math.round(r / 5) * 5; return Math.abs(v) < 100 ? (v < 0 ? -100 : 100) : v; };
const events = F.map((f, i) => {
  const a = w.eval(`fighterFor(${JSON.stringify(f.a)})`), b = w.eval(`fighterFor(${JSON.stringify(f.b)})`);
  const when = Date.parse(f.when);
  const p = a && b ? w.eval(`M.detail(${JSON.stringify(a)},${JSON.stringify(b)},new Date(${when}),divFor(${JSON.stringify(a)},${JSON.stringify(b)}),attOf).p`) : 0.5;
  const mkt = Math.min(0.92, Math.max(0.08, p + OFFS[i]));
  const books = f.pricing === 'none' ? [] : BOOKS.filter(([k]) => f.pricing === 'betrivers' ? k === 'betrivers' : true);
  const bookmakers = books.map(([key, title], j) => {
    const pa = Math.min(0.95, Math.max(0.05, mkt + (j - 2.5) * 0.006));
    const outcomes = [{ name: f.a, price: american(pa + 0.0225) }, { name: f.b, price: american(1 - pa + 0.0225) }];
    // DraftKings posts only the first fighter, and at the best price, so the export has no same-book opposite.
    if (f.pricing === 'dk_one_side' && key === 'draftkings') { outcomes.pop(); outcomes[0].price = american(pa - 0.05); }
    const upd = new Date(NOW - (40 + 7 * j) * 60000).toISOString().replace('.000', '');
    return { key, title, last_update: upd, markets: [{ key: 'h2h', last_update: upd, outcomes }] };
  });
  return { id: 'evt' + String(i + 1).padStart(2, '0') + 'c0rn3r' + f.role.replace(/_/g, ''), sport_key: 'mma_mixed_martial_arts', sport_title: 'MMA',
    commence_time: f.when, home_team: f.a, away_team: f.b, bookmakers };
});
fs.writeFileSync(path.join(FIX, 'odds-api.json'), JSON.stringify(events, null, 1));
fs.writeFileSync(path.join(FIX, 'roles.json'), JSON.stringify(Object.fromEntries(F.map((f, i) => [f.role, { id: events[i].id, a: f.a, b: f.b, when: f.when }])), null, 1));

// Disagreement log: the 60 most recent fights in the walk forward log, with a
// made-up open and close, so the Card tab's test section shows its numbers.
const log = J('LOG.slice(-60)');
const snaps = {};
log.forEach((x, i) => {
  const dis = [0.05, -0.04, 0.03, -0.06, 0.025, 0.08][i % 6], mv = [0.01, -0.005, 0.02, 0.0, -0.01][i % 5];
  const nv0 = Math.min(0.95, Math.max(0.05, x.p - dis)), nv1 = Math.min(0.95, Math.max(0.05, nv0 + mv * Math.sign(dis)));
  snaps['past' + i] = { a: x.f1, b: x.f2, start: x.date,
    first: { t: x.date - 3 * DAY, p: x.p, nv: nv0 }, last: { t: x.date - 2 * 3600e3, p: x.p, nv: nv1 } };
});
fs.writeFileSync(path.join(FIX, 'snaps.json'), JSON.stringify(snaps));
console.log(F.map((f, i) => `${f.role.padEnd(18)} ${f.a} vs ${f.b} ${f.when} books=${events[i].bookmakers.length}`).join('\n'));
console.log('shared names in ufcstats:', [...shared].join(', '));
w.close();
