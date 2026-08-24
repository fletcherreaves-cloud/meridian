// ── Measure TAGGED event lift (Festival/Fair, LTO/Promo, Weather) — Dispatch #108 ─────────────────
// Unlike measure-retail-impact.mjs / measure-holiday-impact.mjs, these three types are NOT
// rule-derivable — a festival, an LTO, or a severe-weather day only exists in Meridian if someone
// already tagged it historically (Calendar Manager → org_events). This script measures against
// WHATEVER is already tagged, honestly reports sparse/absent coverage, and never invents a date.
//
//   event_type 'event'   (🎪 Festival / Fair)  — org_events rows with event_type = 'event'
//   event_type 'promo'   (🍔 LTO / Promo)       — org_events rows with event_type = 'promo'
//   event_type 'weather' (🌧 Weather)           — org_events rows whose event_type is the generic
//                         'weather' OR one of the specific EVENT_TYPES weather subtypes
//                         (winter_storm/snow/ice/tornado/t_storm/sev_weather/high_winds/flood/
//                         hurricane) — all pooled into ONE 'weather' event_impact row, matching the
//                         registry's single 🌧 Weather row (event-impact.js). This is a v1 choice
//                         flagged for owner confirmation in memory/dispatch-108.md's Resolution —
//                         NOT a new statistical rule, only a pooling of what a human already tagged.
//                         As of this writing (2026-08-24) production has ZERO org_events rows of any
//                         weather subtype, so this type prints "no tagged events" and writes nothing
//                         — that is the correct, honest v1 result, not a bug.
//
//   node scripts/measure-tagged-event-impact.mjs --dry
//   node scripts/measure-tagged-event-impact.mjs
//   node scripts/measure-tagged-event-impact.mjs --min-n 3
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from '@supabase/supabase-js';
import { measureEventLift, shrinkLifts } from '../src/engine/retail-events.js';
import { HOLIDAY_MAP } from '../src/utils/holidays.js';
import { loadGcRows, upsertEventImpact, mergeSalesAndGcWrites } from './lib/event-impact-write.mjs';

const DRY = process.argv.includes('--dry');
const MIN_N = (() => { const i = process.argv.indexOf('--min-n'); return i >= 0 && process.argv[i + 1] ? +process.argv[i + 1] : 2; })();

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// event_impact's type ↔ the org_events event_type(s) that feed it.
const WEATHER_SUBTYPES = ['winter_storm', 'snow', 'ice', 'tornado', 't_storm', 'sev_weather', 'high_winds', 'flood', 'hurricane', 'weather'];
const TYPE_SOURCES = { event: ['event'], promo: ['promo'], weather: WEATHER_SUBTYPES };

// ── sales + GC history ──────────────────────────────────────────────────────────────────────────
const sales = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('labor_rows').select('loc,report_date,sales').order('report_date').range(from, from + 999);
  if (error) { console.error('labor_rows read error:', error.message); process.exit(1); }
  if (!data || !data.length) break;
  for (const r of data) if (r.sales > 0) sales.push({ loc: r.loc, date: r.report_date, sales: +r.sales });
  if (data.length < 1000) break;
}
if (!sales.length) { console.error('No sales rows in labor_rows — nothing to measure.'); process.exit(1); }
const maxDate = sales.reduce((a, r) => r.date > a ? r.date : a, sales[0].date);
console.log(`labor_rows: ${sales.length} day-rows, up to ${maxDate}`);

const gc = await loadGcRows(sb);
console.log(gc.length ? `qsr_daily_activity_rollup (GC): ${gc.length} day-rows` : 'qsr_daily_activity_rollup (GC): no rows — GC lift skipped.');

// ── org_events: whatever's ALREADY tagged (never invented) ────────────────────────────────────────
const orgEvents = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('org_events').select('loc,date_start,date_end,event_type').range(from, from + 999);
  if (error) { console.error('org_events read error:', error.message); process.exit(1); }
  if (!data || !data.length) break;
  orgEvents.push(...data);
  if (data.length < 1000) break;
}
console.log(`org_events: ${orgEvents.length} total tagged rows.\n`);

const enumerate = (a, b) => { const out = []; let d = new Date(a + 'T12:00:00'); const e = new Date((b || a) + 'T12:00:00'); while (d <= e) { out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86400000); } return out; };
const closureDates = new Set(Object.entries(HOLIDAY_MAP).filter(([, v]) => v.fullClosure || v.partialClosure).map(([k]) => k));

const writes = [];
for (const [impactType, sourceTypes] of Object.entries(TYPE_SOURCES)) {
  const rows = orgEvents.filter(e => sourceTypes.includes(e.event_type) && e.date_end <= maxDate);
  console.log(`── ${impactType} ${'(' + (impactType === 'event' ? 'Festival/Fair' : impactType === 'promo' ? 'LTO/Promo' : 'Weather — subtypes: ' + WEATHER_SUBTYPES.join(',')) + ')'} ─────────────────────────────────`);
  if (!rows.length) {
    console.log(`   no tagged ${impactType} events found in org_events (gradable through ${maxDate}) — 0 rows measured.`);
    console.log('   This is an honest "not yet tagged" result, not a bug — see memory/dispatch-108.md.\n');
    continue;
  }
  const distinctLocs = new Set(rows.map(r => r.loc)).size;
  console.log(`   ${rows.length} tagged rows across ${distinctLocs} stores (gradable, i.e. date_end ≤ ${maxDate}).`);

  const byLoc = {};
  for (const e of rows) (byLoc[e.loc] = byLoc[e.loc] || []).push(...enumerate(e.date_start, e.date_end));

  const per = measureEventLift(sales, byLoc, { excludeDates: closureDates });
  const { district, byLoc: shrunk } = shrinkLifts(per);
  const gcPer = gc.length ? measureEventLift(gc, byLoc, { excludeDates: closureDates, valueKey: 'gc' }) : {};
  const { district: gcDistrict, byLoc: gcShrunk } = shrinkLifts(gcPer);

  const locs = new Set([...Object.keys(shrunk), ...Object.keys(gcShrunk)]);
  if (!locs.size) { console.log('   tagged but no day was gradable (too thin a same-DOW baseline everywhere) — 0 rows measured.\n'); continue; }
  const pct = v => v == null ? '   —   ' : (v * 100).toFixed(2) + '%';
  console.log(`   district mean sales lift ${pct(district)} across ${Object.keys(shrunk).length} stores` +
    (gc.length ? ` · GC lift ${pct(gcDistrict)} across ${Object.keys(gcShrunk).length} stores` : ''));
  for (const loc of [...locs].sort()) {
    const v = shrunk[loc], g = gcShrunk[loc];
    const ok = v && v.n >= MIN_N, gOk = g && g.n >= MIN_N;
    console.log(`   ${loc.padEnd(7)} sales n=${v ? String(v.n).padStart(2) : ' -'}  raw ${pct(v?.measured).padStart(8)}  → shrunk ${pct(v?.shrunk).padStart(8)}${v && !ok ? '   (skipped: n < ' + MIN_N + ')' : ''}` +
      (gc.length ? `   |   gc n=${g ? String(g.n).padStart(2) : ' -'}  raw ${pct(g?.measured).padStart(8)}  → shrunk ${pct(g?.shrunk).padStart(8)}${g && !gOk ? '   (skipped: n < ' + MIN_N + ')' : ''}` : ''));
    const row = mergeSalesAndGcWrites({
      loc, eventType: impactType, salesShrunk: shrunk, gcShrunk, minN: MIN_N,
      note: `measured ${new Date().toISOString().slice(0, 10)} · from org_events-tagged ${sourceTypes.join('/')} dates · same-DOW ±28d median baseline · K=10 shrink`,
    });
    if (row) writes.push(row);
  }
  console.log('');
}

const { written } = await upsertEventImpact(sb, writes, { dry: DRY, label: 'event_impact rows (event/promo/weather)' });
if (!DRY && written) console.log('  They load into the forecast on next app start (and are editable/overridable in the 📈 Event Impact panel).');
