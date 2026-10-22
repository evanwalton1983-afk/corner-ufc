// Boots Corner UFC headless in jsdom with a frozen clock, frozen copies of the
// four ufcstats files, and optionally a saved Odds API key, a frozen Odds API
// response for the MMA feed, and a seeded disagreement log. Every network
// request and every JS error is recorded.
process.env.TZ = 'America/New_York';
import { JSDOM, VirtualConsole } from 'jsdom';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require_ = createRequire(import.meta.url);
/* The page loads glicko2 from the CDN and openskill on demand. jsdom loads no
   external scripts, so the same pinned packages are put on the window here. */
const GLICKO_SRC = fs.readFileSync(require_.resolve('glicko2/glicko2.js'), 'utf8');
const OPENSKILL = await import('openskill');


const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, '..', '..');
export const APP_DIR = path.join(ROOT, 'deploy');
export const FIX = path.join(ROOT, 'test', 'fixtures');
export const NOW = Date.parse('2026-09-23T19:00:00Z');
export const APP_ORIGIN = 'https://corner-ufc.test';
export const ODDS_KEY = 'TEST-ODDS-KEY-do-not-export';
export const MINE = ['draftkings', 'fanduel', 'betmgm', 'williamhill_us', 'fanatics'];

const BASE = 'https://raw.githubusercontent.com/Greco1899/scrape_ufc_stats/main/';
const FEEDS = {};
for (const f of ['ufc_fight_results', 'ufc_fighter_tott', 'ufc_event_details', 'ufc_fight_stats'])
  FEEDS[BASE + f + '.csv'] = fs.readFileSync(path.join(FIX, f + '.csv'), 'utf8');
export const fixture = f => fs.readFileSync(path.join(FIX, f), 'utf8');
const hasFixture = f => fs.existsSync(path.join(FIX, f));

/* Modes:
   bare   no Odds API key: the Card tab asks for one
   live   key saved, frozen Odds API response, seeded disagreement log
   Pass storage (from a previous boot's dumpStorage) to boot on a saved cache,
   which takes the restored fit path instead of rebuilding. */
export const MODES = ['bare', 'live'];

export async function bootApp({ mode = 'bare', htmlFile = path.join(APP_DIR, 'index.html'), width = 1024, now = NOW, storage = null, setup } = {}) {
  const html = fs.readFileSync(htmlFile, 'utf8');
  const requests = [], errors = [], opened = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(String(e && (e.stack || e.message) || e)));
  vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

  const dom = new JSDOM(html, {
    url: APP_ORIGIN + '/index.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: vc,
    storageQuota: 200_000_000,
    beforeParse(w) {
      const RealDate = w.Date;
      class FakeDate extends RealDate {
        constructor(...a) { if (a.length === 0) super(now); else super(...a); }
        static now() { return now; }
      }
      w.Date = FakeDate;
      w.performance.now = () => 0;
      if (!process.env.NO_GLICKO) { w.eval(GLICKO_SRC); w.openskill = OPENSKILL; }
      Object.defineProperty(w, 'innerWidth', { value: width, configurable: true });
      w.addEventListener('error', ev => errors.push('window.error: ' + (ev.error && ev.error.stack || ev.message)));
      w.addEventListener('unhandledrejection', ev => errors.push('unhandledrejection: ' + (ev.reason && ev.reason.stack || ev.reason)));
      w.fetch = async (url) => {
        url = String(url);
        requests.push(url);
        const mk = (body, headers = {}) => ({
          ok: true, status: 200, text: async () => body, json: async () => JSON.parse(body),
          headers: { get: k => headers[k.toLowerCase()] ?? null },
        });
        if (FEEDS[url]) return mk(FEEDS[url]);
        if (url.startsWith('https://api.the-odds-api.com/v4/sports/mma_mixed_martial_arts/odds'))
          return mk(fixture('odds-api.json'), { 'x-requests-remaining': '480' });
        return { ok: false, status: 404, text: async () => '', json: async () => null, headers: { get: () => null } };
      };
      w.open = (url, target, feat) => { opened.push({ url: String(url), target, feat }); return null; };
      if (storage) for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
      if (mode === 'live') {
        w.localStorage.setItem('corner.odds', JSON.stringify({ key: ODDS_KEY, mine: MINE }));
        if (!storage && hasFixture('snaps.json')) w.localStorage.setItem('corner.snaps.v1', fixture('snaps.json'));
      }
      if (setup) setup(w);
    },
  });
  const w = dom.window;
  const ready = () => {
    const sub = w.document.getElementById('sub').textContent;
    if (!/fighters rated/.test(sub) && !w.document.querySelector('#matchBody .err')) return false;
    if (mode !== 'live') return true;
    try { return w.eval('PE_DATA!==null&&PE_DATA.at!=null'); } catch (e) { return false; }
  };
  await waitFor(ready, 120000, () => w.document.getElementById('matchBody').textContent.slice(0, 300));
  await new Promise(r => setTimeout(r, 100));
  return { dom, window: w, requests, errors, opened };
}

export function dumpStorage(w) {
  const o = {};
  for (let i = 0; i < w.localStorage.length; i++) { const k = w.localStorage.key(i); o[k] = w.localStorage.getItem(k); }
  return o;
}

export async function waitFor(fn, ms = 10000, why = () => '') {
  const t0 = Date.now();
  while (!fn()) {
    if (Date.now() - t0 > ms) throw new Error('timed out waiting: ' + why());
    await new Promise(r => setTimeout(r, 25));
  }
}

/* Everything a view displays, as lines of text in document order. Input and
   select values are included. Password inputs are skipped. Anything marked
   data-wr (the new War Room panel) is left out: it is new UI, and everything
   else must be unchanged by its arrival. data-so marks the second opinion
   rating in the same way. */
const BLOCK = new Set(['DIV', 'P', 'TR', 'TD', 'TH', 'H1', 'H2', 'H3', 'LABEL', 'BR', 'TABLE', 'TBODY', 'THEAD', 'SECTION', 'HEADER', 'FOOTER']);
export function visibleLines(root) {
  const out = [];
  let cur = '';
  const flush = () => { const s = cur.replace(/\s+/g, ' ').trim(); if (s) out.push(s); cur = ''; };
  const walk = n => {
    if (n.nodeType === 3) { cur += n.nodeValue; return; }
    if (n.nodeType !== 1) return;
    if (n.hasAttribute && (n.hasAttribute('data-wr') || n.hasAttribute('data-so'))) return;
    const tag = n.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE') return;
    if (tag === 'INPUT') { if (n.type === 'checkbox') cur += n.checked ? ' [x] ' : ' [ ] '; else if (n.type !== 'password') cur += ` [${n.value}] `; return; }
    if (tag === 'SELECT') { const o = n.options[n.selectedIndex]; cur += ` [${o ? o.textContent : ''}] `; return; }
    const blk = BLOCK.has(tag);
    if (blk) flush();
    for (const c of n.childNodes) walk(c);
    if (blk) flush();
    else if (tag === 'SPAN' || tag === 'B') cur += ' ';
  };
  walk(root);
  flush();
  return out;
}

/* Style widths carry the probability bars, so they are numbers on screen too. */
export function barWidths(root) {
  return [...root.querySelectorAll('[style*="width"]')].filter(e => !e.closest('[data-wr]') && !e.closest('[data-so]'))
    .map(e => (e.getAttribute('style').match(/width:\s*[\d.]+%/g) || []).join(' ')).filter(Boolean);
}

export const click = (w, el) => el && el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
export const change = (w, el) => el && el.dispatchEvent(new w.Event('change', { bubbles: true }));
