// ── Measure WEATHER event lift into the Event Impact Registry ──────────────────────────────────────
// Phase 2 (3/3) of memory/project-events-calendar-redesign-2026-09-04.md, item 8. Sibling of
// measure-holiday-impact.mjs / measure-retail-impact.mjs, same measureEventLift/shrinkLifts
// pipeline (src/engine/retail-events.js) -- but unlike holidays/retail windows, weather has no
// fixed calendar and no one tags it: candidate event days are DERIVED from the weather
// observations themselves (design doc §2.4/§3.2c: "Weather is the easy win... derive candidate
// weather days from the observations, run them through the same matched-DOW baseline, populate
// event_impact['weather']" -- "without anyone tagging anything").
//
// Weather is never persisted to Supabase (fetchOpenMeteoWeather, src/constants.js, is called
// client-side into IndexedDB only -- confirmed by grep, no weather table exists). This script
// re-fetches the same public Open-Meteo archive API directly (no auth needed) by importing that
// exact function, so there is only one weather-fetch implementation in the repo, not two drifting
// copies.
//
// "Notable weather day" uses the SAME thresholds getWeatherNote (src/engine/forecast.js) already
// uses for its in-app 🌤 note -- not reimplemented from scratch, just inlined here since
// forecast.js pulls in `react` and other browser-oriented modules at import time and isn't
// Node-safe to import directly. If those thresholds ever change, update both spots.
//   tmax > 100°F        -- extreme heat
//   tmin < 20°F          -- severe cold
//   |tavg - month norm| >= 15°F  -- unusually warm/cold for the month
//   rain > 0.5"          -- heavy rain
//   wspd > 40 mph        -- high winds
// Per-STORE (not district-pooled like holidays): weather genuinely varies by location, and
// measureEventLift's eventDatesByLoc shape already grades each store only against its own
// candidate days and its own same-DOW baseline.
//
//   node scripts/measure-weather-impact.mjs --dry
//   node scripts/measure-weather-impact.mjs
//   node scripts/measure-weather-impact.mjs --min-n 3
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from '@supabase/supabase-js';
import { measureEventLift, shrinkLifts } from '../src/engine/retail-events.js';
import { INV_ORG_COORDS, fetchOpenMeteoWeather } from '../src/constants.js';
import { loadGcRows, upsertEventImpact, mergeSalesAndGcWrites } from './lib/event-impact-write.mjs';
import { deriveWeatherCandidates } from './lib/weather-candidates.mjs';

const DRY = process.argv.includes('--dry');
const MIN_N = (() => { const i = process.argv.indexOf('--min-n'); return i >= 0 && process.argv[i + 1] ? +process.argv[i + 1] : 2; })();

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!URL || !KEY) { console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }
const sb = createClient(URL, KEY, { auth: { persistSession: false } });

// ── sales + GC history (same sources as measure-holiday-impact.mjs) ────────────────────────────────
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
console.log(`labor_rows: ${sales.length} day-rows, ${minDate} .. ${maxDate}`);

const gc = await loadGcRows(sb);
console.log(gc.length ? `qsr_daily_activity_rollup (GC): ${gc.length} day-rows` : 'qsr_daily_activity_rollup (GC): no rows — GC lift skipped.');

// ── weather history, same public Open-Meteo call the app itself uses ───────────────────────────────
console.log(`\nFetching Open-Meteo weather for ${Object.keys(INV_ORG_COORDS).length} stores, ${minDate}..${maxDate} (~1 req/sec, this takes a few minutes)...`);
const weatherRows = await fetchOpenMeteoWeather(minDate, maxDate, (i, total, name) => {
  if (i === 1 || i % 5 === 0 || i === total) console.log(`  weather ${i}/${total}: ${name}`);
});
console.log(`weather: ${weatherRows.length} store-day rows fetched.\n`);
if (!weatherRows.length) { console.error('No weather rows fetched — nothing to measure.'); process.exit(1); }

// ── candidate weather days per store (scripts/lib/weather-candidates.mjs — thresholds mirror
//    getWeatherNote, src/engine/forecast.js; see that module's own header) ─────────────────────────
const candidatesByLoc = deriveWeatherCandidates(weatherRows);
const totalCandidates = Object.values(candidatesByLoc).reduce((a, arr) => a + arr.length, 0);
console.log(`${totalCandidates} candidate notable-weather day(s) across ${Object.keys(candidatesByLoc).length} store(s).\n`);
if (!totalCandidates) { console.log('No notable weather days found in range — nothing to measure.'); process.exit(0); }

const per = measureEventLift(sales, candidatesByLoc);
const { district, byLoc: shrunk } = shrinkLifts(per);
const gcPer = gc.length ? measureEventLift(gc, candidatesByLoc, { valueKey: 'gc' }) : {};
const { district: gcDistrict, byLoc: gcShrunk } = shrinkLifts(gcPer);

const locs = new Set([...Object.keys(shrunk), ...Object.keys(gcShrunk)]);
if (!locs.size) { console.log('weather: no gradable observations.'); process.exit(0); }
const pct = v => v == null ? '   —   ' : (v * 100).toFixed(2) + '%';
console.log('── weather ─────────────────────────────────');
console.log(`   district mean sales lift ${pct(district)} across ${Object.keys(shrunk).length} stores` +
  (gc.length ? ` · GC lift ${pct(gcDistrict)} across ${Object.keys(gcShrunk).length} stores` : ''));
const writes = [];
for (const loc of [...locs].sort()) {
  const v = shrunk[loc], g = gcShrunk[loc];
  const ok = v && v.n >= MIN_N, gOk = g && g.n >= MIN_N;
  console.log(`   ${loc.padEnd(7)} sales n=${v ? String(v.n).padStart(2) : ' -'}  raw ${pct(v?.measured).padStart(8)}  → shrunk ${pct(v?.shrunk).padStart(8)}${v && !ok ? '   (skipped: n < ' + MIN_N + ')' : ''}` +
    (gc.length ? `   |   gc n=${g ? String(g.n).padStart(2) : ' -'}  raw ${pct(g?.measured).padStart(8)}  → shrunk ${pct(g?.shrunk).padStart(8)}${g && !gOk ? '   (skipped: n < ' + MIN_N + ')' : ''}` : ''));
  const row = mergeSalesAndGcWrites({
    loc, eventType: 'weather', salesShrunk: shrunk, gcShrunk, minN: MIN_N,
    note: `measured ${new Date().toISOString().slice(0, 10)} · candidate days from Open-Meteo (extreme heat/cold, ±15°F monthly-norm deviation, heavy rain, high wind — same thresholds as getWeatherNote), same-DOW ±28d median baseline · K=10 shrink`,
  });
  if (row) writes.push(row);
}
console.log('');

await upsertEventImpact(sb, writes, { dry: DRY, label: 'event_impact rows (weather)' });
if (!DRY) console.log('  They load into the forecast on next app start (and are editable/overridable in the 📈 Event Impact panel).');
