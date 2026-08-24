---
name: dispatch-105
description: LifeLenz Bridge (src/features/lifelenz.js's LifeLenzBridgePanel) is a forward-only, single-store adjustment tool -- scans the next 14 days and suggests a % to manually type into LifeLenz, with no date-range control and no historical accuracy tracking. Owner wants it evolved toward a two-forecast (Meridian/MBI + LifeLenz) historical accuracy reconciliation, modeled on LifeLenz's own native Forecast Accuracy Analysis screen (Wednesday-start weekly view, Forecast/Actual/Variance table), plus a date-range selector on the existing tool regardless. Real constraint found before assuming the full vision is easy: Meridian's automated LifeLenz pull only captures scheduling/labor data, never LifeLenz's own forecast values -- those only exist in Meridian when someone manually uploads a Labor Analysis file for that specific day, so there's no historical LifeLenz-forecast archive to build an accuracy view from yet. Meridian's own forecast accuracy IS already tracked (forecast_snapshots) and is not blocked.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #105 — LifeLenz Bridge: date-range selector now; scope the dual-accuracy evolution

**Status:** Part 1 (date-range selector, Wednesday-start weekly grouping) is ready to build now.
Part 2 (dual MBI+LifeLenz historical accuracy) has a real, unresolved data-availability question
that needs an owner decision before implementation — see below. Don't block Part 1 on Part 2.

## ⚠️ CORRECTION (owner, 2026-08-24, after this dispatch was already in progress) — Part 2's
"blocked on missing data" premise was WRONG

The owner pushed back directly: *"Labor Analysis I though was on auto pull, please check."* Checked,
and the owner is right — **this dispatch's original data-availability claim below is false.**
`scripts/lifelenz-pull.mjs` already writes `fcst_sales`, `adj_fcst_sales`, `sales`, `sales_diff`,
`fcst_tcs`, `tcs`, `tcs_diff` into `lifelenz_schedule` **daily, automatically**, and
`loadLifeLenzSchedule()` (`src/lib/supabase.js`, ~line 563-592) already maps every one of those
fields into the app (`fcstSales`, `adjFcstSales`, `sales`, `salesDiff`, `fcstTCs`, `tcs`, `tcsDiff`),
**455 days back by default.** LifeLenz's own historical forecast-vs-actual data is already fully
auto-pulled and already loaded — **Part 2 is NOT blocked on a missing pull.**

**The real bug, found by checking why the app doesn't already use this:**
`computeLifeLenzAdjustment`'s `'direct'` sourcing (`src/features/lifelenz.js`, ~line 367-371) reads
`ds.laborRows` — the **manually-uploaded** Labor Analysis file — never `ds.lifelenzSchedule`, the
auto-pulled table sitting right next to it with equivalent (likely more complete/reliable) data. So
the tool falls back to `'pattern'` (a historical-bias **guess**) whenever nobody happened to manually
upload a file for that date, even on days where the real, auto-pulled `fcstSales` value already
exists. This is exactly the owner's separate ask below ("No guessing") — same root cause, same fix.

**Revised Part 1 scope — do this now, in the same pass as the date-range/weekly work:**
Repoint (or add as the first-priority source before falling back to manual) the `'direct'` sourcing
to read `fcstSales`/`sales` from `ds.lifelenzSchedule` (auto-pulled) first. Only fall back to
`ds.laborRows` (manual upload) or `'pattern'` (guess) when the auto-pulled table genuinely has no
row for that store/date. **"No guessing" (owner, verbatim): require the real auto-pulled number
when it exists — never silently prefer a guess over real data that's already sitting there.**

**Part 2 is now also unblocked and in scope** — with 455 days of real `fcst_sales`/`sales`/
`salesDiff` already available, a genuine LifeLenz-side historical accuracy view (paired with
Meridian's own already-tracked `forecast_snapshots`) can be built now, not deferred pending an API
investigation. Fold this into the same effort rather than treating it as a separate future dispatch.

**Confirmed name (owner, replacing the earlier "Forecast Reconciliation" proposal): "MBI vs
LifeLenz Accuracy."** Use this name for the merged section/panel in dispatch #106's Phase B, and for
this tool's own identity in the meantime if it needs one before the merge lands.

**Also add a real URL route** (owner: *"put in a url page while you are at it"*) — `lifelenz-bridge`
currently has no `route:true` in `panel-registry.js` (compare `fcst-accuracy`, which already does),
so it has no direct-linkable URL. Add `route:true` to its registry entry, matching the pattern
`fcst-accuracy`/`proj` already use, so this panel is directly navigable/bookmarkable like its
soon-to-be sibling in dispatch #106's merge.

---

## What exists today (for context — this is not a bug, it's current scope)

`LifeLenzBridgePanel` (`src/features/lifelenz.js`, ~line 449) is a **forward-only, single-store**
tool: `runLifeLenzBridgeScan()` scans the next 14 days from a store's last actual date and computes,
per day, Meridian's forecast vs. LifeLenz's own projection (`source: 'direct'` if read from a
manually-uploaded Labor Analysis file's Projected Sales column that day, else `'pattern'` — estimated
from historical day-of-week bias). Output is a suggested adjustment % for a GM to type into LifeLenz
manually. No date-range control exists (`daysForward=14` is hardcoded); no historical/backward view
exists at all.

## Owner's ask, in full

*"Date range selector would be nice. Weekly (Wednesday start date) makes sense as well. As much as
we already have here, we could easily morph into projection accuracy for both MBI and LifeLenz for
dates passed. That would be super helpful. I would like a proposed new name for this section based
on this as well."* — with two screenshots of **LifeLenz's own native Forecast Accuracy Analysis**
screen (Forecast Sales / Adjusted Sales / Actual Sales / System Forecast Variance columns,
Wednesday–Tuesday weekly view) provided as the reference model.

## Part 1 — date-range selector + Wednesday-start weekly view (build now)

Add a real date-range control to `LifeLenzBridgePanel`, replacing (or supplementing — owner's
existing single-store 14-day-forward workflow may still be wanted as a quick-glance default) the
hardcoded `daysForward=14`. Add a weekly grouping mode with **Wednesday as the week start**,
matching LifeLenz's own week convention shown in the reference screenshots (their own "W" toggle
groups Wed–Tue) — this is a real, existing convention in the source system, not an arbitrary choice.
`addD()`/date utilities already exist in this file (`src/utils/date.js` imports) — check for an
existing week-start helper before writing a new one; if none exists for a Wednesday anchor
specifically (most repo date helpers likely default to Sunday/Monday), add one rather than
hand-rolling the offset inline in the panel.

## Part 2 — dual MBI + LifeLenz historical accuracy (needs a data-availability decision first)

**What's already available, no new plumbing needed:** Meridian's own forecast accuracy is already
tracked via `forecast_snapshots`/`loadForecastSnapshots()` (`src/lib/supabase.js`, ~line 2600) — this
is the same table the Forecast Accuracy panel and SAGE's `query_forecast_snapshots` tool already use
(dispatch #92). Building "MBI accuracy for dates passed" is not blocked.

**What's NOT available, and needs an owner decision:** Meridian's automated LifeLenz integration
(`scripts/lifelenz-pull.mjs`, `lifelenz_schedule` table) pulls scheduling/labor data only —
confirmed by grep, no `projectedSales`/forecast field is captured by the automated pull anywhere.
LifeLenz's own forecast/projection values only ever land in Meridian when a GM manually uploads a
Labor Analysis file for that specific day (`computeLifeLenzAdjustment`'s `source:'direct'` path).
**There is currently no historical archive of LifeLenz's own past forecasts to compare against
actuals** — "for dates passed" can't be built for the LifeLenz side from data Meridian already has,
only from whatever days happened to have a manual upload.

Since LifeLenz's own UI clearly has this data (the reference screenshots are it), their API very
likely exposes a comparable endpoint — this is a real "go check" question, not a dead end:
- Investigate whether LifeLenz's API (same one `scripts/lifelenz-pull.mjs`/`lib/qsrsoft-auth.mjs`-
  style scripts already authenticate against) has a forecast-accuracy or projection-history endpoint
  that could be added as a new automated daily pull, following this repo's standing "adding a new
  automated pull" checklist (CLAUDE.md — watch it in `sync-failure-watch.yml`, per-stream freshness,
  Supabase table with `tenant_id`+RLS, manual fallback, two-path auth).
- If such an endpoint exists, this becomes a real new automated pull (its own dispatch, likely) that
  backfills historical LifeLenz forecast data and feeds it into a genuine two-forecast accuracy view.
- If no such endpoint exists or it's not accessible, the honest scope is: LifeLenz accuracy can only
  be shown for days where a manual upload already happened to capture it — say so plainly in the UI
  rather than presenting gappy coverage as if it were complete, and don't let this block shipping
  Meridian's own already-available accuracy view.

**Do not start building the dual-accuracy UI until this question is answered** — whether the
LifeLenz side is a real automated stream or a manual-only, gappy one changes the whole design (a
continuous historical chart vs. a sparse "here's what we captured" list).

## Proposed name

Given the scope shift from "suggest today's adjustment" toward "reconcile two forecasts against
reality over a real date range": **"Forecast Reconciliation"** — keeps the two-systems spirit
"Bridge" originally had, but names what it now actually does. Alternatives considered: "Dual
Forecast Accuracy," "MBI vs. LifeLenz Accuracy" — either is fine if the owner prefers a more literal
name; flagging "Forecast Reconciliation" as the recommendation, not a final decision.

## Verification bar

- Part 1: render the actual `LifeLenzBridgePanel` consumer, confirm a selected date range changes
  which days are scanned/shown, and confirm the Wednesday-start weekly grouping produces the same
  week boundaries LifeLenz's own reference screenshot uses (Wed through the following Tue).
- Part 2: not buildable/verifiable until the LifeLenz-API investigation above resolves what data is
  actually available.

## Do NOT

- **Do not build the dual MBI+LifeLenz historical accuracy UI before resolving the data-availability
  question above.** Building it on manual-upload-only data and presenting it as complete would be
  actively misleading.
- **Do not assume a new automated LifeLenz pull is trivial without checking the real API surface
  first** — this repo's own LifeLenz integration history (`memory/lifelenz-session.md`) already has
  documented dead ends for other LifeLenz endpoints; check that file before probing anything new.
- **Do not rename the panel/section without using the recommended or an owner-confirmed name** — a
  rename touches nav/panel-registry labels; don't ship it silently as part of an unrelated commit.

---

## Resolution (2026-08-24)

**Scope actually shipped: Part 1, AND Part 2, plus the correction's three folded-in items.** The
engineering session's original brief was Part 1 only, with Part 2 explicitly forbidden pending an
owner decision. That decision landed mid-session as the CORRECTION section above — verified real
(present in `git log` on the working branch, and independently re-checked against the live
`scripts/lifelenz-pull.mjs`/`src/lib/supabase.js` code before writing a line of Part 2 code, not
taken on trust) — so Part 2 was built in the same pass per the correction's explicit direction,
rather than deferred to a second dispatch.

**Part 1 — date-range control + Wednesday-start weekly grouping.**
`runLifeLenzBridgeScan(loc, ds, settings, userEvents, range)` takes an optional explicit
`{start, end}` (inclusive); omitted, it preserves the exact original default (`anchor+1..anchor+14`,
`anchor = ds.lastActual[loc] || now`) — the owner's existing quick-glance workflow is unchanged.
`LifeLenzBridgePanel` gained a shared "Custom Date Range" toggle + two date inputs (Single Store and
District mode both use it) and a "Weekly View (Wed start)" toggle. The Wednesday anchor is **not**
hardcoded anywhere new: `groupDaysByWeek` reuses the **already-existing**
`weekStartOf(date, wsd)` in `src/utils/date.js` (it already accepted an explicit week-start day —
no new date helper was needed, contrary to the dispatch's own guess that one probably would be), and
the panel reads `settings.weekStartDay` (DEF_SETTINGS default `3`) directly.

**Correction items folded into Part 1, as directed:**
- **No-guessing sourcing fix.** `computeLifeLenzAdjustment` now checks, in priority order:
  1. `ds.schedRows` (`fcstSales`, auto-pulled daily, no upload needed) — source `'auto'`.
  2. `ds.laborRows` (`projSales`, manually-uploaded Labor Analysis file) — source `'manual'`.
  3. Historical day-of-week bias — source `'pattern'`, the only actual guess, now the true last
     resort.
  One correction detail was wrong and caught before shipping: the correction's own text says the
  auto-pulled data lives at `ds.lifelenzSchedule`. Measured against the real loader
  (`loadLifeLenzSchedule()` in `src/lib/supabase.js`) and its call site in `App.js`'s `_stLifelenz`:
  the field it's actually stored under is **`ds.schedRows`**, not `ds.lifelenzSchedule` — that
  property doesn't exist anywhere in the app. Used the correct name. Row badges are now
  `AUTO` / `MANUAL` / `PATTERN` (previously a binary `DIRECT`/`PATTERN`).
- **Rename.** `panel-registry.js`'s `lifelenz-bridge` label is now the owner-confirmed
  **"MBI vs LifeLenz Accuracy"** (superseding the earlier "Forecast Reconciliation" proposal from
  this dispatch's first pass — that name is not in use anywhere). `LifeLenzBridgePanel`'s own
  title/subtitle updated to match.
- **Route.** `lifelenz-bridge` now carries `route:true`, wired in `App.js` exactly like
  `fcst-accuracy` — `goRoute('lifelenz-bridge')` on open, a new
  `routePanel==='lifelenz-bridge'` render gate using `RoutePanelShell`, and the old
  `showLifeLenzBridge` `useState` removed. Removing it surfaced one real, pre-existing bug this
  work happened to touch: a stray `setShowLifeLenzBridge(false)` call survived in the Escape-key
  sweep, which `src/__tests__/src-no-undef.test.js` caught as a live `no-undef` — that call would
  have thrown a `ReferenceError` on every Escape press, aborting every setter after it in that one
  sweep function, the exact failure class a comment two lines above it already documents from a
  past incident. Fixed in the same commit.

**Part 2 — MBI vs LifeLenz historical accuracy.** A new "📈 Accuracy" mode in
`LifeLenzBridgePanel`, backward-looking, with its own store selector and date-range inputs
(default: trailing 4 closed weeks). For each date in range:
- **LifeLenz side** — `ds.schedRows` (`fcstSales`/`sales`), a real recorded number, no recompute.
- **MBI side** — `forecast_snapshots` via the already-existing `loadForecastSnapshots()`.
  Deliberately **not** a live `forecastDay` replay over past dates: `forecastDay` reflects today's
  model/calibration, not what it would have predicted at the time, so replaying it over history
  would leak information a real forecast never had — `forecast_snapshots` is the leak-free record
  the correction pointed at, and it's what `analytics.js`'s `ForecastAccuracyPanel` already writes.
  When a store/date has no recorded snapshot, that side renders `—` rather than a live-computed
  substitute.
Rows group into Wednesday-start weeks (same `weekStartOf`), each with a per-week average
|variance %| for both systems, plus an overall verdict line ("MBI more accurate" /
"LifeLenz more accurate") when both sides have data. A date with only one side's data still
renders — never silently dropped.

**What's still exactly as scoped, not expanded further:** the actual visual **merge** of this panel
into dispatch #106's Phase B (a single combined section/nav entry) was **not** attempted here — the
correction's own wording ("this tool's own identity in the meantime if it needs one before the
merge lands") frames that merge as dispatch #106's job, not this one's. This session only renamed
and routed the existing panel.

**Verification bar — met, against the real consumer, not the engine functions in isolation**
(`src/__tests__/dispatch-105-lifelenz-bridge-daterange.test.js`):
- A selected custom date range changes which days are scanned/shown (asserts the old default
  window's figures are gone and the new range's figures are present).
- Weekly grouping produces **"Aug 19 – Aug 25"** / **"Aug 26 – Sep 1"** for a range spanning a real
  2026 Wednesday (Aug 19, 2026 is a Wednesday, checked directly against `Date`) — the exact
  boundary LifeLenz's own reference screenshot uses, not a Sun- or Mon-start guess.
- `settings.weekStartDay=0` (Sunday) produces Sunday-start boundaries for the identical date range
  instead — proving the anchor is read from settings, not hardcoded, per the task brief's explicit
  requirement.
- The auto-over-manual sourcing priority is exercised with one date carrying BOTH a `schedRows` and
  a `laborRows` entry; confirmed the test actually detects a regression (not just a tautology) by
  temporarily reverting the priority order, watching it fail, then restoring the fix.
- Accuracy mode's date range re-queries `forecast_snapshots` for the newly selected window.

Two pre-existing tests needed updating to match the deliberate rename/route change, not
regressions: `shell-nav-snapshot.test.js`'s frozen nav-label snapshot, and
`panel-registry.test.js`'s route-panel count ratchet (ten → eleven).

**Build/test state:** full suite 2316/2316, 0 regressions. `npm run build` clean. Entry chunk gzip
519.95 KB → 522.50 KB (+2.55 KB — `LifeLenzBridgePanel` is statically imported by `App.js`, not
`lazyPanel()`'d; that was already true before this change, not introduced by it). Eager total
521.81 KB → 524.36 KB gzip (budget 850 KB, headroom 325.64 KB). Full detail in the `v5.146`
changelog entry (`src/app/changelog/5.146.js`).
