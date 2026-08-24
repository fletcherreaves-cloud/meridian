// ── Measure retail/shopping event lift into the Event Impact Registry (Notes 56 #4) ──────────────
// The point of Event Lookup: prior-year ACTUALS grade these events, exactly the way the football
// seed did (memory/event-impact-registry.md). Reads `labor_rows` (sales history, backfilled to 2022),
// computes per-store lift vs the store's own same-DOW ±28-day median baseline, n-shrinks toward the
// district mean (K=10), and upserts `event_impact` rows keyed (loc, event_type) — the same rows
// forecastDay's `_evFactor` already consumes.
//
//   node scripts/measure-retail-impact.mjs --dry          # report only (start here)
//   node scripts/measure-retail-impact.mjs                # write measured lifts
//   node scripts/measure-retail-impact.mjs --min-n 3      # require n observations to write (default 2)
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (labor_rows + event_impact are RLS-scoped).
//
// GC lift (Dispatch #108, additive): also grades guest-count lift for the same 4 retail types, using
// the IDENTICAL median/±28-day/K=10-shrink methodology (measureEventLift's opts.valueKey:'gc') over
// qsr_daily_activity_rollup.transactions. GC's real backfill depth is 2024-01-01+ (measured), ~2.5
// years shorter than labor_rows' 2022-01-01+ sales floor — so a store can show sales lift with no GC
// lift for pre-2024 years alone; that's real data-coverage, not a bug (see mergeSalesAndGcWrites' the
// per-metric minN gate). Sales-lift computation/output below is BYTE-IDENTICAL to before this change.

import { createClient } from '@supabase/supabase-js';
import { expandRetailEvents, measureEventLift, shrinkLifts, RETAIL_EVENT_TYPES } from '../src/engine/retail-events.js';
import { INV_ORG_COORDS } from '../src/constants.js';
import { HOLIDAY_MAP } from '../src/utils/holidays.js';
import { loadGcRows, upsertEventImpact, mergeSalesAndGcWrites } from './lib/event-impact-write.mjs';

const DRY = process.argv.includes('--dry');
const MIN_N = (() => { const i = process.argv.indexOf('--min-n'); return i >= 0 && process.argv[i + 1] ? +process.argv[i + 1] : 2; })();

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// ── sales history ───────────────────────────────────────────────────────────────────────────────
const sales = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await sb.from('labor_rows').select('loc,report_date,sales').order('report_date').range(from, from + 999);
  if (error) { console.error('labor_rows read error:', error.message); process.exit(1); }
  if (!data || !data.length) break;
  for (const r of data) if (r.sales > 0) sales.push({ loc: r.loc, date: r.report_date, sales: +r.sales });
  if (data.length < 1000) break;
}
if (!sales.length) { console.error('No sales rows in labor_rows — nothing to measure.'); process.exit(1); }
const minDate = sales.reduce((a, r) => r.date < a ? r.date : a, sales[0].date);
const maxDate = sales.reduce((a, r) => r.date > a ? r.date : a, sales[0].date);
console.log(`labor_rows: ${sales.length} day-rows, ${minDate} → ${maxDate}\n`);

// ── GC (guest count) history — Dispatch #108 ───────────────────────────────────────────────────
const gc = await loadGcRows(sb);
const gcMinDate = gc.length ? gc.reduce((a, r) => r.date < a ? r.date : a, gc[0].date) : null;
const gcMaxDate = gc.length ? gc.reduce((a, r) => r.date > a ? r.date : a, gc[0].date) : null;
console.log(gc.length ? `qsr_daily_activity_rollup (GC): ${gc.length} day-rows, ${gcMinDate} → ${gcMaxDate}\n`
  : 'qsr_daily_activity_rollup (GC): no rows — GC lift will be skipped this run.\n');

// ── event days (historical only — a day still in the future can't grade anything) ────────────────
const stores = Object.entries(INV_ORG_COORDS).map(([loc, v]) => ({ loc, state: v.state || 'OK' }));
const years = []; for (let y = +minDate.slice(0, 4); y <= +maxDate.slice(0, 4); y++) years.push(y);
const events = expandRetailEvents(stores, { years }).filter(e => e.dateEnd <= maxDate);

// Baseline exclusions: holiday closures would otherwise drag a median baseline down and manufacture lift.
const excludeDates = new Set(Object.entries(HOLIDAY_MAP).filter(([, v]) => v.fullClosure || v.partialClosure).map(([k]) => k));

const enumerate = (a, b) => { const out = []; let d = new Date(a + 'T12:00:00'); const e = new Date(b + 'T12:00:00'); while (d <= e) { out.push(d.toISOString().slice(0, 10)); d = new Date(d.getTime() + 86400000); } return out; };

const writes = [];
for (const type of RETAIL_EVENT_TYPES) {
  const byLoc = {};
  for (const e of events.filter(e => e.type === type)) {
    (byLoc[e.loc] = byLoc[e.loc] || []).push(...enumerate(e.dateStart, e.dateEnd));
  }
  const per = measureEventLift(sales, byLoc, { excludeDates });
  const { district, byLoc: shrunk } = shrinkLifts(per);
  const gcPer = gc.length ? measureEventLift(gc, byLoc, { excludeDates, valueKey: 'gc' }) : {};
  const { district: gcDistrict, byLoc: gcShrunk } = shrinkLifts(gcPer);

  const locs = new Set([...Object.keys(shrunk), ...Object.keys(gcShrunk)]);
  if (!locs.size) { console.log(`${type}: no gradable observations.`); continue; }
  const pct = v => v == null ? '   —   ' : (v * 100).toFixed(2) + '%';
  console.log(`── ${type} ─────────────────────────────────`);
  console.log(`   district mean sales lift ${pct(district)} across ${Object.keys(shrunk).length} stores` +
    (gc.length ? ` · GC lift ${pct(gcDistrict)} across ${Object.keys(gcShrunk).length} stores` : ''));
  for (const loc of [...locs].sort()) {
    const v = shrunk[loc], g = gcShrunk[loc];
    const ok = v && v.n >= MIN_N;
    const gOk = g && g.n >= MIN_N;
    console.log(`   ${loc.padEnd(7)} sales n=${v ? String(v.n).padStart(2) : ' -'}  raw ${pct(v?.measured).padStart(8)}  → shrunk ${pct(v?.shrunk).padStart(8)}${v && !ok ? '   (skipped: n < ' + MIN_N + ')' : ''}` +
      (gc.length ? `   |   gc n=${g ? String(g.n).padStart(2) : ' -'}  raw ${pct(g?.measured).padStart(8)}  → shrunk ${pct(g?.shrunk).padStart(8)}${g && !gOk ? '   (skipped: n < ' + MIN_N + ')' : ''}` : ''));
    const row = mergeSalesAndGcWrites({
      loc, eventType: type, salesShrunk: shrunk, gcShrunk, minN: MIN_N,
      note: `measured ${new Date().toISOString().slice(0, 10)} · same-DOW ±28d median baseline · K=10 shrink`,
    });
    if (row) writes.push(row);
  }
  console.log('');
}

await upsertEventImpact(sb, writes, { dry: DRY, label: 'event_impact rows (retail/shopping)' });
if (!DRY) console.log('  They load into the forecast on next app start (and are editable/overridable in the 📈 Event Impact panel).');
