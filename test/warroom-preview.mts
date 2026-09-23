// Runs a payload through The War Room's own import pipeline (parse, validate,
// resolve) offline, with the same seeded registry its unit tests use.
// Usage (from C:/Projects/war-room so its deps resolve):
//   npx tsx ../corner-ufc/test/warroom-preview.mts <payload.json> <nowIso> [ufc_fighter_tott.csv]
// With the third argument, UFC fighters are first seeded from that ufcstats
// file (canonical name = ufcstats name), which is how The War Room will be
// seeded, so the run shows whether Corner's names resolve exactly.
import { readFileSync } from 'node:fs';
import { parseEnvelope } from '../../war-room/src/lib/import/parse.ts';
import { buildPreview } from '../../war-room/src/lib/import/pipeline.ts';
import { BUILTIN_PROFILES, profileFor } from '../../war-room/src/lib/import/profiles.ts';
import { emptyExisting, seededRegistry } from '../../war-room/tests/unit/helpers.ts';

const [file, nowIso, tott] = process.argv.slice(2);
const participants: Array<{ id: string; sport: string; kind: 'fighter'; canonical_name: string; short_name: null }> = [];
if (tott) {
  for (const line of readFileSync(tott, 'utf8').split('\n').slice(1)) {
    const name = line.split(',')[0].trim(), id = (line.match(/fighter-details\/([0-9a-f]+)/) || [])[1];
    if (name && id) participants.push({ id: 'ufc-' + id, sport: 'UFC', kind: 'fighter', canonical_name: name, short_name: null });
  }
}
const parsed = parseEnvelope(JSON.parse(readFileSync(file, 'utf8')));
if (!parsed.ok) { console.log(JSON.stringify({ parseErrors: parsed.errors })); process.exit(1); }
const profile = profileFor(BUILTIN_PROFILES, parsed.value.batch.source_app)!;
const p = await buildPreview({ input: parsed.value, profile, registry: seededRegistry({ participants }), now: new Date(nowIso),
  decisions: new Map(), existing: emptyExisting() });
const errors = p.rows.flatMap(r => r.errors.map(e => `${r.record?.record_id ?? r.index}: ${e.code} ${e.message}`));
const warn: Record<string, number> = {};
for (const r of p.rows) for (const w of r.warnings) warn[w.code] = (warn[w.code] ?? 0) + 1;
const status: Record<string, number> = {};
for (const r of p.rows) status[(r as { status?: string }).status ?? 'unknown'] = (status[(r as { status?: string }).status ?? 'unknown'] ?? 0) + 1;
console.log(JSON.stringify({ counts: p.counts, status, errors, warnings: warn, seededFighters: participants.length }));
process.exit(errors.length ? 1 : 0);
