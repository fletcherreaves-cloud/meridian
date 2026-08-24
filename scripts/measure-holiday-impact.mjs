// ── Measure HOLIDAY event lift into the Event Impact Registry (Dispatch #108) ─────────────────────
// Sibling of measure-retail-impact.mjs, same measureEventLift/shrinkLifts pipeline, but the event
// calendar is rule-derived from HOLIDAY_MAP (src/utils/holidays.js) instead of RETAIL_EVENT_RULES —
// HOLIDAY_MAP already has exact per-year dates system-wide (2019-2028 as of this writing), so no new
// rule set is needed.
//
// "Open holidays" only: HOLIDAY_MAP flags Christmas Day (fullClosure), and Christmas Eve / New
// Year's Eve / Thanksgiving (partialClosure) — those days' sales are either near-zero (closure) or
// distorted by an early close that varies by store (partial closure), so they are NOT gradable
// "lift" days and are excluded from the event-day list entirely (same exclusion test
// measure-retail-impact.mjs already applies to its BASELINE — reused here to build the event list
// instead). The remaining 15 labels (New Year's Day, Valentine's, July 4th, Halloween, Easter,
// Holy Saturday, Mother's/Father's Day, Memorial/Labor Day, Columbus Day, Veterans Day, Black
// Friday, MLK Day, Presidents Day) all bucket into ONE 'holiday' event_type, matching the registry's
// single 🎉 Holiday row in EventImpactPanel — this is a coarse umbrella by design, not a per-holiday
// breakdown. (Black Friday's dates ALSO land in the dedicated 'black_friday' retail type from
// measure-retail-impact.mjs — no collision, different event_type keys, and the holiday bucket
// existing separately is intentional: it answers "how do holidays move this store overall," the
// retail type answers "how does Black Friday specifically move it.")
//
//   node scripts/measure-holiday-impact.mjs --dry
//   node scripts/measure-holiday-impact.mjs
//   node scripts/measure-holiday-impact.mjs --min-n 3
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from '@supabase/supabase-js';
import { measureEventLift, shrinkLifts } from '../src/engine/retail-events.js';
import { INV_ORG_COORDS } from '../src/constants.js';
import { HOLIDAY_MAP } from '../src/utils/holidays.js';
import { loadGcRows, upsertEventImpact, mergeSalesAndGcWrites } from './lib/event-impact-write.mjs';

const DRY = process.argv.includes('--dry');
const MIN_N = (() => { const i = process.argv.indexOf('--min-n'); return i >= 0 && process.argv[i + 1] ? +process.argv[i + 1] : 2; })();

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// ── sales + GC history (same sources as measure-retail-impact.mjs) ────────────────────────────────
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
console.log('');

// ── holiday closure/partial-closure exclusion set + the OPEN-holiday event-day list ────────────────
const closureDates = new Set(Object.entries(HOLIDAY_MAP).filter(([, v]) => v.fullClosure || v.partialClosure).map(([k]) => k));
const openHolidayDates = Object.entries(HOLIDAY_MAP).filter(([, v]) => !v.fullClosure && !v.partialClosure).map(([k]) => k)
  .filter(d => d <= maxDate); // a day still in the future can't grade anything
console.log(`${openHolidayDates.length} open-holiday dates in range (excluding ${closureDates.size} closure/partial-closure dates).\n`);

const stores = Object.keys(INV_ORG_COORDS);
const byLoc = {};
for (const loc of stores) byLoc[loc] = openHolidayDates;

const per = measureEventLift(sales, byLoc, { excludeDates: closureDates });
const { district, byLoc: shrunk } = shrinkLifts(per);
const gcPer = gc.length ? measureEventLift(gc, byLoc, { excludeDates: closureDates, valueKey: 'gc' }) : {};
const { district: gcDistrict, byLoc: gcShrunk } = shrinkLifts(gcPer);

const locs = new Set([...Object.keys(shrunk), ...Object.keys(gcShrunk)]);
if (!locs.size) { console.log('holiday: no gradable observations.'); process.exit(0); }
const pct = v => v == null ? '   —   ' : (v * 100).toFixed(2) + '%';
console.log('── holiday ─────────────────────────────────');
console.log(`   district mean sales lift ${pct(district)} across ${Object.keys(shrunk).length} stores` +
  (gc.length ? ` · GC lift ${pct(gcDistrict)} across ${Object.keys(gcShrunk).length} stores` : ''));
const writes = [];
for (const loc of [...locs].sort()) {
  const v = shrunk[loc], g = gcShrunk[loc];
  const ok = v && v.n >= MIN_N, gOk = g && g.n >= MIN_N;
  console.log(`   ${loc.padEnd(7)} sales n=${v ? String(v.n).padStart(2) : ' -'}  raw ${pct(v?.measured).padStart(8)}  → shrunk ${pct(v?.shrunk).padStart(8)}${v && !ok ? '   (skipped: n < ' + MIN_N + ')' : ''}` +
    (gc.length ? `   |   gc n=${g ? String(g.n).padStart(2) : ' -'}  raw ${pct(g?.measured).padStart(8)}  → shrunk ${pct(g?.shrunk).padStart(8)}${g && !gOk ? '   (skipped: n < ' + MIN_N + ')' : ''}` : ''));
  const row = mergeSalesAndGcWrites({
    loc, eventType: 'holiday', salesShrunk: shrunk, gcShrunk, minN: MIN_N,
    note: `measured ${new Date().toISOString().slice(0, 10)} · 15 open HOLIDAY_MAP dates, same-DOW ±28d median baseline, closure days excluded from baseline · K=10 shrink`,
  });
  if (row) writes.push(row);
}
console.log('');

await upsertEventImpact(sb, writes, { dry: DRY, label: 'event_impact rows (holiday)' });
if (!DRY) console.log('  They load into the forecast on next app start (and are editable/overridable in the 📈 Event Impact panel).');
