---
name: project-rolling-forecast-snapshots-2026-11-09
description: "Rolling Forecast — Commit & Drift: a daily, never-overwritten forecast capture log (forecast_rolling_captures), a thin 'this is the official plan' pointer (forecast_commits), and a live drift alert when a committed period swings off that plan. v1 scoped to daily + weekly."
metadata:
  node_type: memory
  type: project
scope: tenant
sensitivity: open
---

# Rolling Forecast — Commit & Drift (2026-11-09)

## What prompted this

Same session the owner was starting December projections and 2027 Yearly Targets, he circled
back to something flagged mid-conversation: *"let's revisit our live projections experiment... do
we re-run once a day and automatically update live forecasts and if so, do we keep a running log
of this to see its trends... Could be very meaningful if a location takes a big swing to get a
notification that it is significantly off track of forecast."* He also named the precedent
directly: *"Remember LifeLenz uses a similar approach to forecasting... I believe we started a
test a couple months back to gauge this."* That precedent is real and live —
`lifelenz_forecast_captures` (`memory/project-lifelenz-leadtime-capture-2026-09-11.md`), ~2 months
of real accumulated history as of this writing, same shape: append a snapshot every day, never
overwrite, the freshest row is the live number and the full set is a free revision history.

On the existing Week/Month **Lock** mechanism specifically, his own framing: *"Does the lock even
need to exist in this scenario? Should it change to an officially used tag of sorts? ... Simpler
is always better in ALL aspects. Just never lose the power behind it, just simplify the app
facing version."* Resolution reached in-session: the Lock doesn't need to disappear, but its
*meaning* changes — from "freeze a number" to "name which historical snapshot is the official
plan." Renamed **Commit** for the UI, not **Lock**. Scope: **daily + weekly only** for v1
(owner's own call — monthly/yearly/hourly later once this proves out). Alerting: **both in-app
and push**, his explicit answer when asked.

## 1. The data model — a capture log + a pointer, not a second copy of anything

`supabase/schema-forecast-rolling-captures.sql` (already applied live):

- **`forecast_rolling_captures`** — append-only. One row per `(loc, period_type, target_period,
  captured_date)`, written fresh every day a capture job runs, **never overwritten**. The
  freshest row for a given `(loc, period_type, target_period)` is the live forecast; the full set
  is a complete revision history for free, with zero extra mechanism — exactly the
  `lifelenz_forecast_captures` precedent, generalized to this app's own forecast engine.
- **`forecast_commits`** — a thin pointer. Names which `captured_date` row is "the plan" for a
  `(loc, period_type, target_period)`. Re-committing moves the pointer; it does not duplicate the
  number. Unique per `(tenant_id, loc, period_type, target_period)` — exactly one active commit
  per period, upserted.
- **`forecast_commit_history`** — append-only log of every commit/re-commit, `committed_value`
  denormalized onto the row so "what did we commit to, and when did that change" reads without a
  join once a pointed-at capture eventually rolls off whatever window a caller loads. Same
  principle as the capture table itself, applied one level up.

**Table-naming note, for anyone who goes looking:** the obvious name, `forecast_snapshots`,
already exists as a different, long-established table (the per-day actual-vs-forecast MAPE
grading table SAGE's `query_forecast_snapshots` tool and 5+ changelog entries already depend on).
Caught before any damage (a failed `ALTER` against the wrong table's shape, verified the old
table's 9-column structure was intact, renamed to `forecast_rolling_captures`) — recorded here so
a future session doesn't propose that name again.

## 2. Drift — reusing the existing tolerance convention, not inventing a new one

`src/engine/forecast-drift.js`, pure, no IO:

- `computeDrift(liveValue, committedValue, tolerancePct=5)` — `tolerancePct` is
  `settings.tolerance||5`, the SAME pass/miss tolerance `forecastDay()`'s own `varPct`/`pass`
  computation already uses everywhere in this app (`src/engine/forecast.js`). Reusing it rather
  than inventing a second, unrelated "how far off is acceptable" number.
  - **on-track**: `|delta%| ≤ tolerance`
  - **watching**: `tolerance < |delta%| ≤ 2×tolerance` (`DRIFT_WATCH_MULTIPLIER`)
  - **alert**: `|delta%| > 2×tolerance` — this is the tier that pushes a notification, not
    `watching`. A forecast that moved but is still within 2x the normal tolerance is meant to be
    *seen* on the Week/Day card, not *interrupt* anyone.
  - Returns `null` with no commit yet (`committedValue` falsy/0 — a 0 commit has no meaningful
    percentage base) or a non-finite live value — the caller shows "not yet committed," never a
    misleading `0%`/`Infinity`.
- `freshestCapture(captures)` / `committedCapture(captures, committedCapturedDate)` — pure lookups
  over one period's own capture history (max `capturedDate`; exact match), shared by the capture
  job's own drift check and the UI's read of the same small, date-filtered slice.

## 3. The daily job

`scripts/forecast-rolling-capture.mjs` (GitHub Action `.github/workflows/forecast-rolling-
capture.yml`, daily `13:00 UTC` — after the other data-refresh pulls, on an otherwise-unclaimed
hour). A pure COMPUTE job (no QSRSoft/LifeLenz auth), built by reusing
`forecast-week-precompute.mjs`'s own already-proven `ds`-building recipe verbatim (same
`labor_rows`/`qsr_daily_activity_rollup`/`org_events`/`event_impact` loaders, same model-
assignment `localStorage` shim) — so a future change to that logic reaches this job
automatically instead of a second copy silently drifting from what the browser computes.

- **Daily**: today → +60 days, one `forecastDay()` call per store/day.
- **Weekly**: today's week → +12 weeks. **No separate `forecastWeek()` exists anywhere in the
  engine** (confirmed by grep) — every other weekly view in this app already sums 7 daily
  forecasts, so this job does the same. `target_period` is that week's **Monday**, matching the
  schema's own comment — deliberately independent of `settings.weekStartDay`, since a capture
  row's identity shouldn't depend on whoever's UI setting was live the day it was written.
- Right after writing a day's captures, the job drift-checks every ACTIVE `forecast_commits`
  pointer (both period types) against that fresh read, and fires an `app_notifications` row —
  same producer pattern `movers-alert-run.mjs` already proved (dedupe via `resolve_key`, insert,
  `deliverAppNotification()`) — **only at the `alert` tier**, push + in-app (`severity:'warn'`
  already defaults to both per `buildAppNotification()`'s delivery table).
- **Live-validated against production, not just unit-tested** (CLAUDE.md's "measure it, don't
  reason about it" rule): ran the script directly against the real Supabase project during this
  build. It wrote **2,044 real capture rows** (1,708 daily + 336 weekly, 28 stores), confirmed by
  a direct read-back (`content-range`/count match). Separately verified the `forecast_commits` +
  `forecast_commit_history` upsert/insert shapes against the live, applied schema with a synthetic
  test commit, then deleted it — real writes, real read-backs, cleaned up afterward.

## 4. UI — additive, not a replacement of the existing Lock

**Deliberate judgment call: the old Week/Month Lock (`locked_projections`) is untouched in this
pass.** Before writing any UI code, traced where it actually lives — and the original plan's
assumption (that it was a simple per-user `user_settings` blob, easy to relabel) was wrong. It's
stored via `saveOrgConfig`/`loadOrgConfig('locked_projections')` — a shared, **org-wide** config,
moved there specifically to fix a documented cross-user data-fork bug (#113). It's also threaded
through `App.js` (two separate load paths), `forecast.js`, `features/session.js`'s localStorage
export key list, AND five-plus dedicated Knowledge Base/test files. Migrating or replacing that in
the same pass that introduces a brand-new pointer system is exactly the kind of "seemed cool and
useful" scope creep the owner explicitly asked to be protected from this session. **Recommendation
for a later, separate pass:** once Commit & Drift has run for a few weeks and proven itself, revisit
whether Lock should be retired in favor of Commit outright (same semantic, one less concept) —
but that's a deliberate, reversible-decision follow-up, not bundled here.

What shipped instead, in `src/features/projections.js`, as a new rail card sibling to Week/Month/
Year (district-wide, same aggregate-status shape `lockStatus` already uses):

- **🔖 Commit & Drift card** — dot colored by the single worst-drifted ACTIVE commit across every
  store and period type; one-line status (`on track`/`watching`/`OFF PLAN`).
- **Commit & Drift panel** (`DriftPanel`, via the shared `ModalShell` — not a hand-rolled
  backdrop, per the panel contract) — a live table of every active commit (store, Day/Week, the
  period, live $, committed $, Δ%, tier), covering **both daily and weekly** in the same view
  (the "read-only Day surface" the directive asked for, folded into this one screen rather than a
  second standalone one). One write action: **"🔖 Commit this week"** points every store at its
  own freshest already-captured weekly forecast — never fabricates a number; a store the capture
  job hasn't reached yet for that period is silently skipped (self-heals the next time the job
  runs).
- **"View forecast history" is a deliberate v1 stub.** The full per-day revision log already
  exists (every row in `forecast_rolling_captures`), but a dedicated browsing UI over it is
  separate, later work — explicitly allowed as a scope cut by the directive rather than blocking
  this pass on it.

**At A Glance re-pointed, not duplicated** (owner's own call, same session, delegated: *"our
changes to projection lock will change the AAG tile for that. You can decide its fate!"*). The
Action Checklist's `auto_locks` item and the Forecast Accuracy tile's "N/Total" stat
(`src/views/at-a-glance.js`) now read `forecast_commits` (`period_type:'weekly'`,
`target_period`=this week's Monday) instead of the old `lockedProjections` blob — same slot, same
checklist shape, same stat row, **label text changed Lock→Commit, nothing else.** A new
`weeklyCommittedLocs` array is loaded once at `App.js` startup (`_stWeeklyCommits`, alongside the
existing `lockedProjections` cloud hydration) and threaded down as a new prop. `lockedProjections`
itself is **not removed** — two other reads of it in `at-a-glance.js` (the AI-narrative summary
payload, and one further down the file) were out of the coordinator's explicit scope for this
pass and were left alone on purpose, per the instruction *"not asking you to chase every consumer
right now, just this one AAG surface."*

## 5. Scope cuts, explicit

- **Monthly/yearly/hourly are not captured** — only daily + weekly, per the owner's own
  "start with daily+weekly, expand later" answer. The schema's `period_type` check constraint
  only allows those two values today anyway.
- **No per-store, UI-driven single-period commit action** beyond "commit this week for every
  store" — a true one-store-one-period commit button (and a true forecast-history browser) are
  natural v2 follow-ups once this is in daily use.
- **The old Lock is untouched** (see §4) — tracked as a deliberate, separate decision, not an
  oversight.
