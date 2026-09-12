// @ts-nocheck
export default {version:'5.432', date:'2026-09-12', changes:[
  'Signals/Trend Explorer/Scanner -- 32 manual-only metrics (OEPE, KVS, R2P, DT Park Rate, DT ' +
  'Mix %, Sales, Guest Count, Labor %, TPPH, Avg Wage Rate, OT Hours, and the full Controls / ' +
  'T-Reds / FOB waste family) now auto-first through the same metric-source.js resolver every ' +
  'other panel already trusts, instead of a single static manual-upload read. Closes dispatch ' +
  '#229: live-caught in a real session, "OEPE (sec)" for a store with a stale Ops-Report upload ' +
  'rendered an EMPTY series in Trend Explorer\'s date-scoped view while the identical metric\'s ' +
  'Scanner correlation (full-history sweep) read as healthy -- same quantity, contradictory ' +
  'results, in the same session. Manual data still wins when present; auto/emailed streams now ' +
  'fill the gap the moment an upload lapses, instead of the metric going blank district-wide.',
  'Also closes the FOB-family half of dispatch #229\'s original Task 3 -- turned out to already ' +
  'be unnecessary: metric-source.js already had qsrFobRows-backed chains for compWaste/' +
  'rawWaste/statVar/fobPct since dispatch #64. The dispatch doc\'s own claim that no cloud ' +
  'sibling existed was stale; routing signal-registry.js through the existing chain closed it ' +
  'with 4 more map entries, not new source wiring. Full writeup + what stayed deliberately out ' +
  'of scope (avgCheck\'s derive-priority quirk, a handful of genuinely manual-only fields): ' +
  'memory/dispatch-229-metric-registry-unification.md.',
  '4 new tests (dispatch-229-auto-first-metrics.test.js) + 32 mechanical chain-existence checks. ' +
  'The 3 behavior tests confirmed to fail against pre-fix code. 9 pre-existing Signals/Trend ' +
  'Explorer/Scanner/CSAT test files re-run green.',
  'Full suite 506/506 files, 4806/4806 tests, build clean, 541.85 KB / 850 KB eager-payload ' +
  'budget (541.49 -> 541.85 KB, +0.36 KB gzipped).',
]};
