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
