# Dispatch #167 — TPPH auto-target calc (Feature Request, live text below)

## The actual feature request (read live from Supabase `feature_requests`, 2026-08-27 —
## CLAUDE.md's "FR: TPPH auto-target calc" one-liner is a compressed pointer to this)

> **Title**: TPPH - Calculate TPPH targets automatically
> **Description**: TPPH is a measurement of how efficient the crew are. It stands for Total
> Transactions per Punched Hour. I want to calculate what TPPH should be when a location is
> scheduled correctly. Prime sources for information are LifeLenz data and Labor Analysis. Use
> projected hours and sales to calculate what TPPH should be. Build it out and include in
> projections smart target.
> **Status**: idea · **Created**: 2026-07-16

There's a second open FR in the same table worth noting for later (not this dispatch): "Projections
vs Actuals — add a date range picker for custom month selection." Out of scope here.

## Major finding — this is mostly already built, just not surfaced where the owner is asking for it

**Do not build a new derivation from scratch.** `src/engine/schedule-summary.js`'s `rollup()`
(line ~84) already computes exactly what this FR describes, and it's already correctly weighted:

```js
tpmh: schedHrs > 0 ? fcstGC / schedHrs : null,
```

Where (both already exported/defined in the same file):
- `fcstGC` = `r.fcstTCs`, LifeLenz's own forecast transaction count per day
  (`lifelenz_schedule.fcst_tcs`, populated by `scripts/lifelenz-pull.mjs`).
- `schedHrsOf(r) = schVLH + schFixHrs + schFloor` — scheduled Variable + Fixed + Floor hours.
  **Deliberately excludes `salMgrHrs`** (salaried manager), matching the already-standardized
  "Punched (all-hourly)" labor basis (`memory/project-labor-pct-punched-vs-crew.md` — "Crew Labor %
  silently includes salaried-manager $ where a store is configured that way"). This is the
  CORRECT basis for TPPH (Transactions **Punched** Hour) — do not swap it for total scheduled
  hours including managers.

District-level rollup (same file, ~line 169) is **already dollar/count-weighted correctly**
(`dGC / dSched`, ratio-of-aggregates) — never average-of-store-tpmh. This matters: CLAUDE.md's
standing rule is "never average averages," and this file already gets it right; don't regress it
when wiring the value elsewhere.

The raw field `tpmh` (LifeLenz's own literal `TPMH` column, pulled verbatim — see
`scripts/lifelenz-pull.mjs:572`, `src/lib/supabase.js`'s `loadLifeLenzSchedule()`) is a SEPARATE,
DIFFERENT thing — LifeLenz's own possibly-different formula/basis for their own report. **Do not
conflate the two.** `schedule-summary.js`'s locally-computed `tpmh` (fcstGC/schedHrs) is the one
that matches this FR's description ("use projected hours and sales to calculate what TPPH should
be") and is already reconciled/used correctly in this app (see the file's own comment at the top
about a prior bug where a different panel had "its own private reimplementation... that produced
numbers that disagreed with this file's own reconciled Schedule Summary band on the identical
rows" — i.e., this file's version is the one that's already been fought over and fixed).

**So the actual task is smaller than "build TPPH forecasting": surface an already-correct,
already-weighted computation in two places it currently isn't, per the FR's own two asks
("calculate" — already done here — and "include in projections smart target" — not done anywhere).**

## What to verify FIRST, before wiring anything (measure, don't assume)

1. **Does `schedule-summary.js`'s `tpmh` reliably populate for the CURRENT/near-future scheduled
   week** — the FR's real use case ("what TPPH should be when scheduled correctly," i.e. forward-
   looking, not just a historical report)? `loadLifeLenzSchedule()` fetches `daysFwd: 30`, so a
   published forward schedule should exist for most stores most of the time — confirm this against
   real data (which store/week combos have `fcstTCs`/`schVLH` etc. populated for dates ≥ today,
   which don't) rather than assuming coverage.
2. **Re-derive `tpmh` independently for a handful of real store-weeks** (LifeLenz row → `fcstTCs` /
   (`schVLH+schFixHrs+schFloor`)) and confirm it matches `schedule-summary.js`'s own computed value
   exactly — a sanity check before reusing it as a target source elsewhere, not a re-litigation of
   whether the formula is right (it already is, per the file's own history above).

## Task

### 1. Smart Targets (`src/features/smart-targets.js`)
The existing `tpph` entry in `SMART_METRICS` (`k:'tpph', src:'labor', field:'tpph', ...`) computes
a target purely from **trailing historical TPPH actuals** (trimmed mean of past 6/12/26/52-week
values + trend + peer comparison — the same generic engine every other metric uses). That is a
DIFFERENT, valid signal ("where has this store's efficiency actually been trending") from what
this FR wants ("what SHOULD it be, given the schedule"). **Keep both — add, don't replace**, same
posture as the sales-forecast precedent (CLAUDE.md: "Engineered models are PRESERVED intact, on
demand... standing owner directive to cautiously protect them").

Add a new, clearly-labeled "Scheduled" TPPH figure alongside the existing trailing-average-based
`proposedMonthly`/`proposedYearly` for the `tpph` metric — computed by reusing
`schedule-summary.js`'s `rollup()`/`schedHrsOf`/district logic (import and call it, do not
re-derive fcstGC/schedHrs math a second time in this file) for the relevant upcoming week(s).
Label it distinctly in `SmartTargetPanel` (e.g. "Scheduled target" vs the existing "Trend target")
so the owner can see both and understand they answer different questions — per this repo's
standing "role voice" rule, the UI should say in plain words what each number means, not just show
two unlabeled figures side by side.

### 2. Projections (`src/features/projections.js`, `ProjectionWorkflow` — registry id `proj`,
"📋 Projection Workspace")
This is a genuinely new integration point — grep confirms `computeSmartTargets` is currently only
imported by `App.js` to feed the standalone `SmartTargetPanel`; nothing in `projections.js` reads
it today. Wire the scheduled TPPH figure (same `schedule-summary.js` reuse as above) into the
Projection Workspace for the relevant week/period, matching however Projections already surfaces
other per-metric targets (read the file first to match its existing table/row conventions — don't
introduce a new visual pattern for one metric).

### 3. Verification
- Render-based tests against the REAL `SmartTargetPanel` and the REAL `ProjectionWorkflow`
  component (not the math in isolation) — per this repo's "verification must touch the call site"
  rule, since the actual ask is "surface this," and an engine-only test can't prove it's wired in.
- A reconciliation check: for a real store-week, the new Smart-Targets "Scheduled" TPPH figure and
  Schedule Summary's own displayed `tpmh` for the identical week must show the SAME number — two
  panels showing different values for what's supposed to be the same computation is exactly the
  bug class CLAUDE.md's "when two panels disagree on one number, diff the two computations" rule
  exists for; catch it before shipping, not after a bug report.
- Standard suite + build bar.

### Out of scope
- Do NOT touch the existing trailing-average TPPH Smart Target logic — additive only.
- Do NOT change `schedule-summary.js`'s `tpmh` formula or weighting — it's already correct;
  reuse it, don't fork it.
- The raw LifeLenz `tpmh` field (`lifelenz_schedule.tpmh`) — leave its 13 existing call sites
  alone; this dispatch is about `schedule-summary.js`'s locally-computed value, a different thing.
- The second open FR ("Projections vs Actuals" date range picker) — separate dispatch if wanted.
