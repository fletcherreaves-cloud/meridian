---
name: finding-liveops-lifelenz-dar-fallback-2026-11-21
description: "Signals' LiveOps DAR tab had been blank since 2026-11-16 because QSRSoft's own DAR pull was schedule-paused and nothing backfilled it, and LiveOps had no fallback. Fixed by converting LifeLenz DAR's hourly rows into the same shape, mapping only genuinely-equivalent fields and leaving everything LifeLenz doesn't track honestly null rather than fabricated."
metadata:
  node_type: memory
  type: finding
scope: tenant
sensitivity: open
---

# LiveOps DAR fallback to LifeLenz DAR (2026-11-21)

## How this surfaced

Found while shipping the egress Phase 1 pilot #2 (`memory/plan-egress-reduction-2026-11-20.md`
Section 11) — the owner asked whether that in-progress caching change could be why LiveOps looked
empty. It couldn't be (unshipped, and a different code path entirely), but chasing the real
question surfaced a genuine, separate, confirmed-live bug: `qsrsoft-dar-pull.yml`'s schedule has
been commented out since 2026-11-16 (QSRSoft Operator Security Notice compliance triage —
CLAUDE.md), and nothing has backfilled `qsr_daily_activity`/`qsr_daily_activity_rollup` since.
Measured live 2026-11-21: both tables' newest row is `2026-11-17`. `lifelenz_dar` (the vendor's
own stand-in pull, built for exactly this gap) is fresh through `2026-11-20`.

`metric-source.js`'s daily fallback chains (`sales`/`gc`/`oepe`/`kvst`/`r2p`/`laborPct`/`actHrs`)
already read `lifelenzDarDailyRows` as a fallback after `qsrActSummaryRows` — but Signals' LiveOps
tab is a completely separate, hourly-granularity code path (`App.js`'s `refreshDar()` +
`lib/supabase.js`'s `loadDailyActivity()`, both querying `qsr_daily_activity` directly) that was
never given the same treatment. Morning Brief's Today's Pace card and Curated Home share the same
`darRows` state, so they were affected too.

## The schema gap that made this more than a one-line fallback

Pulled a real `lifelenz_dar` row (store 3708, 2026-11-20) and compared field-by-field against what
`views/signals.js`'s `HourlyDetail`/`aggregateByStore` actually read from a `qsr_daily_activity`
row:

| Has a clean equivalent | LifeLenz field → QSRSoft concept |
|---|---|
| ✅ | `net_sales` → `product_sales` |
| ✅ | `transactions` → transaction count |
| ✅ | `actual_punch_hours` → `actual_punched_hours` |
| ✅ (already-finished, not a component) | `avg_dt_service_time`/`avg_fc_service_time`/`avg_mfy_service_time` → OEPE/R2P/KVS seconds |
| ✅ (already-finished) | `labour_percentage_of_sales` → labor % |
| ❌ nothing | needed/scheduled hours, KVS healthy/unhealthy counts, `mean_sales` (the anomaly-detector's baseline), `proj_sales_dollars` (Tracking-to-Plan's basis) |

QSRSoft's own LiveOps math (`oepeSeconds`, R2P, KVS, labor-cost%, TPPH) is built entirely around
RAW station components (`dt_untilserve`, `fc_trans_cnt`, `healthy_count`, etc.) that it re-derives
itself — not from a finished number. LifeLenz only ever gives the finished number, never the
components. Reverse-engineering fake components to reproduce a desired finished number would be
fabricating inputs, which this repo's standing rules (CLAUDE.md's "never fabricate",
`engine/lifelenz-dar-daily.js`'s own precedent of using LifeLenz "as-is... rather than holding
every field to the same real-vs-real bar") rule out. So the honest fix needed two parts:

1. **Data fetch** (`loadDailyActivity()`/`refreshDar()`): when QSRSoft has nothing for the date,
   pull `lifelenz_dar` instead, via the new `lifelenzDarToDailyActivityShape()` (`lib/supabase.js`).
2. **Rendering** (`HourlyDetail`'s per-row math, `aggregateByStore`'s per-store rollup): branch per
   row/store on where it came from — real QSRSoft data keeps re-deriving from raw components as
   before; LifeLenz-sourced data uses its own already-finished OEPE/R2P/KVS numbers directly
   (`_llOepeSec`/`_llR2pSec`/`_llKvsSec`, transaction-weighted at the store level, same methodology
   `aggregateLifelenzDarDaily()` already uses for the daily chains — not a second way to average
   the same data).

## What this does and doesn't honestly cover

**Populates with real numbers on a LifeLenz-sourced day:** Product Sales, OEPE, R2P, KVS, Labor %,
TPPH. TPPH and Labor % needed NO special branching at all — once `trans_scrubbed`/
`actual_punched_hours`/`prod_sales_scrubbed`/`actual_punched_dollars` are honestly mapped from
LifeLenz's real fields (the last one via an EXACT algebraic recovery, `netSales × laborPct`, not an
approximation), the existing QSRSoft formulas for those two columns just work correctly on the
honestly-mapped inputs — only OEPE/R2P/KVS needed explicit `_src==='lifelenz'` branches, since
those three have no raw components to derive from at all.

**Stays honestly blank, not faked:** vs Mean (no `mean_sales` equivalent), DT Parked% (no
`dt_carsheld`/`dt_trans_cnt`), Punch/Need + Gap vs Need + Gap vs Sched (no needed/scheduled hours),
2nd Side Usage (no healthy/unhealthy counts). All of this falls out of the EXISTING `>0`-guarded
formulas automatically — simply never setting those fields on a LifeLenz-sourced row is enough;
`undefined > 0` is false, same as `0` would trigger, but without the lie that the figure is a
real, measured zero. A new disclaimer line in the expanded hourly table says this explicitly so a
GM reading dashes doesn't mistake them for a pull failure.

**A mixed day** (some real QSRSoft hours, some LifeLenz-fallback hours — possible once a future
backfill partially restores QSRSoft history) correctly prefers the real components whenever any
exist for that store, never the LifeLenz weighted average, per `aggregateByStore`'s own guard
(`s.dtTransCnt > 0 ? <real formula> : <LifeLenz weighted fallback>`).

## Verification

`lifelenzDarToDailyActivityShape`'s hour_slot conversion is the one genuinely fiddly piece (UTC
timestamp → QSRSoft's Central-time, 4am-4am-business-day, `h<4 → h+1+24` convention) — confirmed
DST-aware (tested both CST and CDT fixture timestamps) and confirmed the test actually catches a
regression by breaking the `h<4` branch and watching the post-midnight-wrap test fail with exactly
the wrong value a shipped bug would have produced. 15 tests total
(`src/__tests__/dispatch-liveops-lifelenz-dar-fallback-2026-11-21.test.js`), covering the field
mapping, the exact algebraic labor-dollar recovery, the "never fabricate" guarantees (every
non-equivalent field reads `undefined`, never 0), the store-level transaction-weighted rollup, and
the mixed-day real-wins-over-fallback guard. Full suite + build both clean.

## Scope not covered (deliberately)

- `features/morning-brief.js`'s `useBriefDarByLoc` hook has its OWN direct `qsr_daily_activity`
  query for historical (non-today) brief dates when the shared `darRows` state doesn't match the
  requested date — that path still has no LifeLenz fallback. Left alone: it benefits for TODAY via
  the shared-state fast path (same `darRows` this fix populates), and extending it to every
  historical date was explicitly out of scope for "fix the LiveOps DAR fallback gap."
- No attempt to unify `refreshDar()`'s and `loadDailyActivity()`'s still-duplicated (near-identical
  but not identical) `qsr_daily_activity` SELECT column lists — that duplication is pre-existing
  and already flagged in `refreshDar()`'s own comment (the #343-class drift risk); fixing it was a
  separate, larger refactor this pass didn't take on.
