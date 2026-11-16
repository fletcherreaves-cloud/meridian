# Finding: "3 Peaks × Labor Gap" TPPH blank — the whole section was reading a 4.5-month-stale manual upload

**Date:** 2026-11-16
**Trigger:** Owner report, live, screenshot of a real store's Shift Analysis tab — OEPE/R2P/KVS/
Parked/Sales all real in the "3 Peaks × Labor Gap" breakfast/lunch/dinner cards, TPPH "—" for
every daypart.

## Root cause (measured, not guessed)

The whole section (`store-analytics.js`'s `ShiftAnalysisTab`, `store-dash.js`'s `PeaksTab`) reads
`ds.peaksSvcRows`/`ds.peaksSalesRows` — the manual "3 Peaks" Excel upload, persisted to Supabase's
`peaks_rows` table.

Measured live against production (service-role read):

- **Last upload: 2026-06-30.** Both the Service and Sales sides of `peaks_rows` are 4.5 months
  stale as of this writing. Every number the section shows — not just TPPH — is from that date,
  not today; OEPE/R2P/KVS/Sales just happen to look plausible because they're non-zero.
- **`tpph` has NEVER been non-zero in `peaks_rows`, ever.** `content-range: */0` on
  `peaks_rows?is_svc=eq.false&tpph=gt.0` — not one row, before or after the 2026-11-05 header-alias
  fix (`parse3PeaksSales`'s `C.tpph:fc(h,'TPPH','Trans Per Person Hour')`,
  `src/__tests__/dispatch-3peaks-tpph-header-2026-11-05.test.js`). Nobody has re-uploaded a file
  since that fix landed, so it has never actually been exercised against a real workbook — it may
  or may not even be the right alias; that's still unverified.

This is the exact pattern CLAUDE.md's "Auto/emailed-first, freshest-wins" and "Manual sourcing is
always temporary" standing rules exist to prevent: a manual stream quietly became the permanent,
silent source for a section that reads as live.

## Fix (owner chose the full auto-pull replacement, not a re-upload nudge)

Built `src/engine/daypart-peaks.js` — derives the same OEPE/R2P/KVS/Park%/Sales/GC/AvgCheck/TPPH
per daypart from the already-pulled **hourly** `qsr_daily_activity` stream, which carries
`actual_punched_hours` per hour_slot (the one leg `peaks_rows` never had access to automatically —
the auto-pulled `qsr_peaks_sales` table has daypart transactions but no labor hours).

- `DAYPART_HOUR_SLOTS` maps breakfast/lunch/dinner to the exact hour_slots covering those windows
  (hour_slot = END of the hour block, per CLAUDE.md's qsr_daily_activity convention): breakfast
  7-9am → `['08:00','09:00']`, lunch 11am-2pm → `['12:00','13:00','14:00']`, dinner 5-7pm →
  `['18:00','19:00']`.
- `aggregateAutoPeaks(rows, loc, range)` sums the raw legs (dt_untilserve/dt_untilstore/
  dt_heldtime/dt_trans_cnt/dt_carsheld, fc_untilserve/fc_untilclosedrawer/fc_trans_cnt,
  mfy1/2_untilserve/mfy1/2_trans_cnt, product_sales, transactions, actual_punched_hours) across
  ALL matching hourly rows in the window FIRST, then takes one ratio per field — never averaging
  per-day ratios (same "sum the legs across the range" principle as `metric-source.js`'s
  `metricSumRatio`, CLAUDE.md's own standing guidance for rate metrics). Reuses the EXACT proven
  formulas already used elsewhere for the whole-day versions of these metrics (`oepeSeconds()`,
  the R2P/KVS/park formulas in `supabase.js`'s `_finalizeQsrAct`) — nothing reinvented.
- `src/lib/supabase.js`'s new `loadDaypartActivity(daysBack=60)` queries `qsr_daily_activity`
  filtered to ONLY the 7 relevant hour_slots via `.in('hour_slot', ALL_DAYPART_HOUR_SLOTS)` — not
  the full 24/day — so volume stays small (~7/24 of a normal hourly pull) despite spanning a
  multi-week window. No new Supabase table, no new pull script — purely a differently-filtered
  read of data already being pulled daily.
- `store-dash.js`'s new `autoFirstPeaks(ds, loc, wb, explicitRange)` wraps the existing
  `analyzePeaks` (untouched, same manual-only behavior, same existing tests): auto wins per
  daypart when it has real coverage (`count>0`), manual fills any daypart auto has no data for yet.
  Both `ShiftAnalysisTab` (store-analytics.js) and `PeaksTab` (store-dash.js) now call
  `autoFirstPeaks` instead of `analyzePeaks` directly; `hasPeaks` at both call sites now also
  checks `ds.daypartActivityRows` so the section doesn't silently disappear for a store with fresh
  auto data but no manual upload history at all.
- Wired into `App.js`'s T2 tiered loader (`_stDaypartActivity`), `ds.daypartActivityRows`.

## What this does NOT fix

The underlying `peaks_rows` manual stream itself is untouched and still 4.5 months stale — that's
fine now, since nothing reads it as primary anymore for stores with auto coverage. The 2026-11-05
TPPH header-alias fix remains unverified against a real workbook (nobody's uploaded since); if the
owner ever does re-upload a 3 Peaks file, that's the first real test of whether that alias was
right — but it's no longer load-bearing for anything in the app.

## Tests

- `src/__tests__/daypart-peaks.test.js` — `aggregateAutoPeaks` unit coverage: hour_slot→daypart
  mapping, sum-then-ratio math (not mean-of-ratios), filters by store/date range, real zero for
  no-data (never NaN/throws).
- `src/__tests__/dispatch-3peaks-autofirst-2026-11-16.test.js` — `autoFirstPeaks` merge logic
  (auto wins when present, manual fills gaps, full fallback when no auto data at all) AND a real
  render of `ShiftAnalysisTab` reproducing the exact live bug shape (stale manual `tpph:0` rows +
  fresh auto hourly data) — confirms a real TPPH number renders, plus a sanity-check render
  proving the fixture genuinely reproduces "—" without the auto data (so the fix-passing render
  test isn't a false positive).
