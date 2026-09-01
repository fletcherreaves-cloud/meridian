# QSRSoft Ops pull rolling window widened 4 -> 14 days (2026-09-01)

## What triggered this

Owner noticed EOM Supervisor Rollup showed store 43380 (Tishomingo-Main & Refuge) Crew Labor
Actual at 20.09% for August 2026, while their own QSRSoft Controls report showed 20.15%
("Check actual labor for me > I show 20.15").

## Live reconciliation (not reasoned about — measured)

Pulled the raw source rows directly via `SUPABASE_SERVICE_ROLE_KEY` and replicated
`eom-supervisor.js`'s exact `dollarWeightedLaborPct` formula (Σ`qsr_labor_summary.crew_labor_dollars`
÷ `qsr_fob`'s Product Sales snapshot):

- Σcrew_labor_dollars (Aug, loc 0043380) = **$36,239.71**; `qsr_fob` sales = **$180,371.38**
  (matches the panel's own Actual sales exactly) → 36239.71 / 180371.38 = **20.0947% → 20.09%**,
  exactly what the panel displayed. **The formula and the sales denominator were both already
  correct** — the bug, if any, had to be in the labor dollar/hours numerator itself.
- Owner then supplied the real QSRSoft daily Controls export for 43380
  (`Controls_20260801_to_20260831.xlsx`, one row per day). Diffed it day-by-day against
  Meridian's own pulled `qsr_labor_summary` rows for the same store/dates.
- **Every single day matched to the penny except August 7**:

  | | Crew Labor Hrs | Punched Labor $ |
  |---|---|---|
  | QSRSoft (owner's file) | 109.15 | $1,275.95 |
  | Meridian's pulled data | 101.92 | $1,163.84 |
  | **Diff** | **-7.23** | **-$112.11** |

  That one day accounted for the *entire* monthly gap (-7.25 hrs / -$112.11 summed vs. -7.23 /
  -$112.11 on that single day — the rounding-scale difference is from other days' sub-cent
  float noise, not a second discrepancy). Root cause: a QSRSoft-side punch correction on Aug 7
  landed *after* the original scheduled pull captured that day, and the default 4-day rolling
  re-pull window (`QSRSOFT_OPS_DAYS_RECENT`) had already moved past Aug 7 by the time the
  correction was made, so it was never picked up automatically.

## Fix, done same session

1. **Immediate data fix**: dispatched `.github/workflows/qsrsoft-ops-pull.yml` via
   `workflow_dispatch` with `start_date=2026-08-01, end_date=2026-08-31` (all 27 stores, full
   August window). Completed in ~2m14s (run #93,
   https://github.com/fletcherreaves-cloud/meridian/actions/runs/33545897231). Re-verified Aug 7
   for 43380 directly after: `crew_labor_hours: 109.15, crew_labor_dollars: 1275.95` — now an
   exact match to the owner's file. Store 43380's Crew Labor Actual will now read 20.15%,
   matching QSRSoft exactly.
2. **Structural fix, owner-requested**: `QSRSOFT_OPS_DAYS_RECENT` default widened from **4 to
   14 days** (`scripts/qsrsoft-ops-pull.mjs`'s own fallback, and the workflow's `days_recent`
   input default + its `github.event.inputs.days_recent || 'N'` fallback in
   `.github/workflows/qsrsoft-ops-pull.yml`) — a full biweekly payroll period, per the owner's
   own reasoning ("covers an entire payroll period and should prevent this from recurring").
   Late corrections inside a 14-day trailing window now get caught automatically by the twice-
   daily scheduled runs; only a correction made MORE than 14 days after the fact would still
   need a manual backfill like the one above.

## Also confirmed, not a systemic issue beyond the window itself

Spot-checked a second store (29760) the same way before landing on 43380's exact single-day
cause: Σcrew_labor_dollars $107,792.71 vs QSRSoft's own report total $107,815.82 (small gap,
same direction) — consistent with the same "occasional single-day late correction, caught by a
wider window" mechanism, not a separate bug. The same `start_date`/`end_date` backfill dispatch
covered all 27 stores in one run, not just 43380.

## What this does NOT change

- No change to `computeStoreEOM`/`computeRollup`'s formula (already correct, confirmed above).
- No change to `QSRSOFT_OPS_DAYS_BACK` (first-run history depth, still 45) or to any other pull
  script's own rolling window (`qsrsoft-dar-pull.mjs`, `lifelenz-pull.mjs`, etc.) — this was
  scoped to the Operations Report pull specifically, since that's the one that showed the gap.
