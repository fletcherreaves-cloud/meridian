# Dispatch29 — Workstream G: labor allocation, wired

2026-08-19. `memory/dispatch-29.md` — the last of the seven workstreams. Unlike A–F, the
underlying finding was already proven (five owner-run probe rounds, G-1 through G-5, with
two boundary corrections) and a correct, tested engine (`src/engine/labor-standard.js`)
already existed — it just had **zero callers anywhere in `src/`** (grepped directly), the
same #366 failure mode ("a test that only imports the engine can't tell fixed from
fixed-but-never-wired-in") this session's dispatches have now found three times. The
engineer task was explicit and ordered: (1) wire the engine into an actual panel, (2)
extend TPPH to hour_slot grain alongside it, (3) leave person-level attribution unwired.

## What shipped

**A new "Labor Allocation" tab in the Scheduling hub** (`src/views/labor-allocation.js`,
lazy-loaded, `panel-registry.js`'s `labor-allocation` hub-tab id, `SCHED_TABS`). Self-loads
its own 90-day hourly window on mount (`loadDailyActivityRange` + `loadStoreLaborConfig`) —
deliberately NOT joined into App.js's global startup `ds` (27 stores × 90 days × 24
hour_slots ≈ 58k rows is real weight nobody should pay for on every login when most users
won't open this tab; the same reasoning `dt-speedofservice.js`'s `loadDtHistory` already
uses for the same table).

Three views, sharing the one engine:
- **District** — the proven district-wide table: cars/punched/needed/gap hours per daypart,
  scheduled-vs-guide and punched-vs-scheduled as SEPARATE columns (never blended — the whole
  point of the finding is that Breakfast/Lunch and Afternoon/Dinner fail on DIFFERENT legs),
  with a summary line stating the deficit/surplus/coverage ratio in restaurant language.
- **By Store** — the same breakdown per store, daypart-selectable, sorted worst-deficit
  first — the artifact a DO would actually use to find who to talk to.
- **Overnight** — classifies open-vs-closed FIRST (Query 5's own rule, already coded as
  `overnightOpenness()`), then shows the RIGHT number for each bucket: closed stores get
  `overnightExcessByStore()`'s verdict against the owner's close-down/pre-open standard,
  open stores get TPPH + sec/car. Mixing the two on one ratio is exactly what produced the
  retracted "Tishomingo/Elgin killer pair" finding — this panel cannot make that mistake
  because the gate happens before either number is even computed. Each row also shows the
  store's configured open time next to the data-driven open/closed classification, so the
  Ardmore-Cooper-vs-Freeport disagreement the dispatch names ("two real possibilities, not
  yet distinguished... a real panel should show both rather than silently picking one") is
  visible directly rather than resolved by a new, unbuilt second classifier — the two
  signals are both already in the data this panel loads; showing them side by side needed
  no new engine logic, just not hiding either one.

**Step 2 — TPPH extended to hour_slot/daypart grain** (`allocationByStoreDaypart`/
`allocationDistrict` in `labor-standard.js`, not a new function): both now also return
`tpph` and `secPerCar` per (loc, daypart) bucket, computed in the SAME hour_slot iteration
those functions already do — reusing the existing ratio-of-sums/completeness-guard
machinery rather than a parallel pass. `tpph` uses `dt_trans_cnt` (drive-thru), matching
these functions' own `cars` field — deliberately not the all-channel `transactions` field,
per the dispatch's explicit "pick one deliberately and label it." `secPerCar` sums
`dt_untilserve` (confirmed, via `graded-visits.js`'s own `secOf()`, to already be a
per-row SUM of milliseconds — no re-derivation needed) and divides by cars, matching every
other ratio in this file.

**A real, unrelated bug found while wiring this**: `loadDailyActivityRange()`
(`src/lib/supabase.js`) was missing `total_scheduled_hours` from its `select()` entirely —
the exact field `allocationByStoreDaypart`'s `scheduledVsGuide`/`punchedVsScheduled` legs
need. Every prior caller of this loader (there were none — that's the whole premise of this
dispatch) would have silently gotten `null` for both fields forever. Fixed as part of this
PR, not filed as a separate follow-up, since it would have made the very panel this dispatch
asked for wrong on day one.

## Step 2's "one line" framing didn't survive contact with the actual API shape

The dispatch's engineer task said to "add [hour_slot-grain TPPH] to `METRIC_SOURCES`... so
every panel picks it up in one line." Checked before doing that: `METRIC_SOURCES`
(`src/engine/metric-source.js`) and its `metricDaily`/`metricSeries`/`metricAvg` readers are
all keyed **per (loc, date)** — one value per store per day. Daypart-grain TPPH is a
genuinely different shape, one value per (loc, date-window, daypart) with no `date` axis at
all in the summary this panel needs. Extending the per-day resolver's contract to also
support a per-daypart grain is a real API change, not a one-line addition, and would affect
every one of `METRIC_SOURCES`' 20+ existing chains' assumptions about what a `metricDaily`
caller gets back. Chose instead to keep the two grains as two different, honestly-labeled
things: the daily `tpph` chain (`qsrActSummaryRows`, already auto-sourced, untouched) for
daily-grain panels, and this new `allocationByStoreDaypart`/`allocationDistrict` field for
daypart-grain ones — both real, tested, auto-first, neither one pretending to be the other.
Recorded here rather than silently doing something different from what was asked without
saying so.

## Verified

- 5 new/updated tests in `labor-standard.test.js`: `tpph`/`secPerCar` are ratio-of-sums (not
  average-of-rows) using the `dt_trans_cnt` denominator, `null` (not `NaN`/`0`) on an
  empty bucket, and `allocationDistrict` sums the raw legs across stores rather than
  re-deriving from each store's own already-computed rate (which would reintroduce
  rounding error — caught this in a first draft that multiplied `secPerCar * cars` back out
  instead of carrying the raw `untilserveMs` sum through, fixed before committing).
- Real-browser verification (Playwright + dev server, same method as Dispatch27): opened
  the Scheduling hub, clicked into the new Labor Allocation tab, confirmed it renders (title,
  subtitle, District/By Store/Overnight tab bar, loading state) with no React crash, and that
  switching tabs while data is still loading (or never arrives — this sandboxed dev
  environment's browser can't reach Supabase, same limitation Dispatch27 already
  documented) doesn't crash either. Did **not** get a real-data render — that needs an
  environment with actual Supabase network access, which this session doesn't have from the
  browser side (server-side `curl`/service-role reads work per CLAUDE.md's own note; the
  in-browser `fetch` path does not, confirmed via `ERR_TUNNEL_CONNECTION_FAILED` on every
  Supabase call, consistent with the same finding from Dispatch27's remount-cost attempt).
- 1565/1565 tests pass (5 new). Build clean; entry-chunk budget unaffected (the new panel is
  its own lazy chunk, `labor-allocation-*.js`, not in the entry bundle).

## Scope discipline (per the dispatch's explicit constraints)

- Attribution stays at shift grain (store × daypart), never person — `rollupShiftsByEmployee()`
  is untouched, per constraint 1 and the dispatch's explicit "leave it unwired for this pass."
- No per-store/per-slot ranking or leaderboard — the By Store table sorts by gap hours for
  triage, but nothing is scored against peers; the Overnight table's "excess/night" is graded
  against the owner's OWN stated standard, not a district ranking.
- Did not build a formal schedule-vs-data-driven overnight classifier as new engine logic —
  the dispatch's own text calls the Ardmore-Cooper/Freeport disagreement "a named follow-up,
  not resolved here"; showing both existing signals in the UI satisfies "don't silently pick
  one" without inventing a decision procedure the dispatch didn't ask for.
- Quoted the corrected Breakfast deficit framing (surplus/deficit language, not raw −12,490)
  in the District tab's summary line, per the file's own "use 14,207, not 12,490" instruction
  — though the panel computes gapHrs live from whatever window is loaded (default 90 days,
  matching the analysis), so the exact number will drift with real data rather than being
  hardcoded; the STRUCTURE of the finding (deficit legs vs surplus legs, AM=execution vs
  PM=scheduling) is what's encoded, not a frozen number.

## Not done / open

- The pre-open-hours-in-Breakfast correction (the 1,716-hr adjustment,
  `preOpenLateNightFraction` already in the engine) is not yet folded into this panel's
  District/By Store Breakfast numbers — those tabs show the raw `allocationByStoreDaypart`
  gap, matching the file's own "raw" figure, not the "RE-MEASURED" corrected one. The
  correction logic exists (`overnightExcessByStore`'s per-day standard already models the
  pre-open crossing) but wiring it into the Breakfast daypart's OWN gap figure (rather than
  just the Overnight tab) is a genuinely separate join this pass didn't attempt — flagged
  rather than silently left inconsistent with the memory file's own instruction.
- Real-data verification (does the panel actually reproduce the proven district numbers
  when pointed at live Supabase data) could not be done from this session's browser — the
  engine itself already carries that proof (every number in `labor-standard.test.js` is
  copied verbatim from the owner-run analysis), but the WIRING (loader → engine → render)
  has only been exercised against a live network failure, not live data. Next session with
  real browser + Supabase access should confirm the rendered numbers match the analysis
  file's own table before treating this as fully verified end-to-end.
