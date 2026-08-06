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

import { createClient } from '@supabase/supabase-js';
import { expandRetailEvents, measureEventLift, shrinkLifts, RETAIL_EVENT_TYPES } from '../src/engine/retail-events.js';
import { INV_ORG_COORDS } from '../src/constants.js';
import { HOLIDAY_MAP } from '../src/utils/holidays.js';

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
  const locs = Object.keys(shrunk);
  if (!locs.length) { console.log(`${type}: no gradable observations.`); continue; }
  const pct = v => (v * 100).toFixed(2) + '%';
  console.log(`── ${type} ─────────────────────────────────`);
  console.log(`   district mean lift ${pct(district)} across ${locs.length} stores`);
  for (const loc of locs.sort()) {
    const v = shrunk[loc];
    const ok = v.n >= MIN_N;
    console.log(`   ${loc.padEnd(7)} n=${String(v.n).padStart(2)}  raw ${pct(v.measured).padStart(8)}  → shrunk ${pct(v.shrunk).padStart(8)}${ok ? '' : '   (skipped: n < ' + MIN_N + ')'}`);
    if (!ok) continue;
    writes.push({
      loc, event_type: type,
      home_impact: v.shrunk, away_impact: null,
      measured_home: v.measured, measured_away: null,
      n_home: v.n, n_away: null,
      source: 'measured', note: `measured ${new Date().toISOString().slice(0, 10)} · same-DOW ±28d median baseline · K=10 shrink`,
      updated_at: new Date().toISOString(),
    });
  }
  console.log('');
}

if (!writes.length) { console.log('Nothing meets the minimum-n bar — nothing to write.'); process.exit(0); }
if (DRY) { console.log(`[--dry] would upsert ${writes.length} event_impact rows.`); process.exit(0); }

const { error } = await sb.from('event_impact').upsert(writes, { onConflict: 'loc,event_type' });
if (error) { console.error('event_impact upsert error:', error.message); process.exit(1); }
console.log(`✓ Upserted ${writes.length} measured event_impact rows. They load into the forecast on next app start`);
console.log('  (and are editable/overridable in the 📈 Event Impact panel).');
