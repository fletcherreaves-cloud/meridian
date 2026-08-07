---
name: notes-58-queue
description: Notes 58 field queue (2026-08-07) — Inventory Control weekly-count rules, per-item variance charts, Items Recounted tile regression, and the owner's "absolute must" swing-detection alarm.
metadata:
  type: project
---

# Notes 58 — field queue (2026-08-07)

Owner's field notes. Items 1–3 are Inventory Control; item 4 is a new capability the
owner flagged as **an absolute must**.

---

## 1. Inventory Control — weekly count completeness rules

Business rules the owner stated, which the panel does not currently encode:

- **Every weekly count requires a full Food AND Condiment count.** So we should see
  **2 classes every week**, per store. Anything less is an incomplete week.
- **Paper counts are mandatory** on the **mid-month count**. That count **floats** —
  its day-of-week depends on when the individual store counts — so the check cannot be
  a fixed calendar date; it has to be "the mid-month count, whenever that store took it."
- **If a store misses the mid-month paper count, flag it** so a reminder goes out to
  complete it ASAP, or on the next weekly count **at the latest**.

Implication: completeness is a per-store, per-class, per-count-cycle assertion, not a
date check. Needs the count-class dimension (Food / Condiment / Paper) surfaced.

### ⚠️ INVESTIGATED 2026-08-07 — this rule CANNOT be built on the table now in use

`analyzeCountCadence` (`src/engine/weekly-cadence.js:33`) reads **`qsr_raw_item_detail`**,
whose `item_class` coverage for 2026-07 is — verified live — **`{F: 573, P: 122}`. Zero
Condiment rows, across all 27 stores.** Cause: `scripts/qsrsoft-variance-pull.mjs:313-337`
only writes the **top ~20 actionable WRINs by |$|, threshold ≥ $50**. Condiments are
low-dollar, so they are never selected. The engine therefore can never observe a condiment
count, and its "was this a full session" denominator (`n >= classTotals[c] * 0.6`) is
computed over a ≤20-item, dollar-biased sample rather than the real item universe.

**`qsr_onhand` is the right source** — verified live class distribution
**`{Food: 510, Paper: 305, Condiment: 140, Non-Product: 45}`**, with per-item
`last_counted` and `last_submitted` dates, written by `scripts/qsrsoft-onhand-pull.mjs`
(daily year-round, hourly in the last 3 days of the month).

Three further gaps found:
- **No mid-month concept exists anywhere.** `analyzeCountCadence` classifies sessions only
  as `'weekly'` or `'spot'`. Worse, the engine's own header comment
  (`weekly-cadence.js:3`) says "**BI-MONTHLY** Paper count" — which contradicts the
  owner's current rule and should be corrected when this is built.
- **Paper is excluded from cadence analysis entirely** — the default `classes` argument is
  `['food','condiment']` and the call site never overrides it.
- **`qsr_onhand` upserts on `(loc, period, wrin)`**, so `last_counted` is rolling latest
  state, not an event log — it answers "when did they last count Paper", never "the series
  of paper counts". `eom_count_progress_log` IS a daily per-class time series (right
  shape), but `computeCountProgress` measures against a window of the last 3 days of the
  month, so a real 08-05 weekly count reads 0%.

## 2. The new chart — loopback window is wrong

- Owner **likes the chart and does not want it removed**, though it isn't what they
  originally envisioned.
- **Fix:** the loopback must go back to the **last actual physical (submitted) count**,
  not a fixed window.
- **What the owner was actually after:** that same chart style **per counted item**, to
  see variance by item and detect when a specific item went wrong. That's the real
  feature request — the current chart is the aggregate version of it.

### INVESTIGATED 2026-08-07 — both halves are closer than expected

Chart is `VarianceTraceChart` (`src/views/eom-dashboard.js:316-365`), rendered in
Inventory Control → **Count Cycle**. Engine `src/engine/variance-trace.js`.

**The loopback:** the current window is not a fixed N days — it is the **entire selected
calendar month** (`fobDailyTrace` filters `d.slice(0,7) === period`,
`variance-trace.js:47`). And the "walk back to the last real count" logic **already
exists**: `biggestJumpDay` (`variance-trace.js:95-109`) walks backwards from the largest
day-over-day FOB delta to the nearest prior touchpoint — it just governs the shaded
highlight, not the chart's domain. The fix is to swap the period predicate for a
start-date predicate. ⚠️ Anchor it on **`qsr_onhand.last_counted`**, not on touchpoints
from `qsr_raw_item_detail`, which are biased to high-dollar Food/Paper items per the
Item 1 finding.

**Per-item:** the data is **already computed and already on screen as text**.
`itemVarianceWindows` (`weekly-cadence.js:82-94`) returns `{points:[{dt,tm,variance}],
windows, biggest}` and is called per item at `eom-dashboard.js:382`, but only the single
biggest window renders, as a text line. Two real constraints: (a) only ~26 items per store
per period exist in `qsr_raw_item_detail` because of the ≥$50 top-20 filter, so "per
counted item" across the full ~250-item universe needs that pull widened; (b) the
aggregate chart plots a dense cumulative MTD curve while a per-item chart plots ~2-6
discrete count events — same visual style, different mark spec (visible markers + date
labels, not an area fill). `VarianceTraceChart` is hard-bound to the FOB shape in ~5
places and needs a `yOf`/format prop to generalise.

## 3. Items Recounted tile — DIAGNOSED 2026-08-07

**The data was never missing.** Verified against the live DB: period `2026-07` holds
**695 rows across 27 stores — 54 items recounted, $7,584 helped / $3,904 hurt, $3,680 net
recovered.** The tile was showing "No ledger detail" anyway.

Tile is `ItemsRecountedTile`, `src/views/analytics.js:6566+` (an At-A-Glance tile, not in
inventory.js). Source is fully **auto/cloud** — `qsr_raw_item_detail` + `qsr_variance_stat`,
written by the scheduled `qsrsoft-variance-pull` Action — so the manual-upload staleness
rule is NOT the cause.

Three compounding causes:

1. ✅ **FIXED v4.864 — a failed read was indistinguishable from an empty period.** Both set
   `diff = null` → "No ledger detail". `fetchAll` (`supabase.js:100`) swallows read errors,
   marks the array `_partial` non-enumerably, and returns what it got; the tile only
   checked `.length`. Now tracks `loadErr` separately, honours `_partial`, and renders a
   distinct "Could not load" state with a Retry button.
2. ✅ **FIXED v4.864 — one transient failure pinned the tile for the whole session.** The
   effect's deps were `[inWindow, period]`, neither of which changes during a session, so
   there was no path back to a successful read short of a full reload. Added a retry
   counter to the deps.
3. ⚠️ **NOT changed — the visibility gate.** `inWindow = day >= lastDay - 2 || day <= 7`
   (`analytics.js:6576`) with `if (!inWindow) return null`. **The tile renders nothing at
   all from the 8th to the 3rd-to-last day — roughly 21 days a month.** That is the
   original design (it's a close-window tile), but it is very likely part of what the owner
   experienced as "went blank". **Needs an owner decision:** widen the window, keep it but
   show a dormant state explaining when it returns, or leave as-is.

Still outstanding from the owner's ask: the tile should **also show weekly and daily count
stats**. Design invited, not yet proposed.

Minor: `analytics.js:6596` reads `r.caseSz` / `r.uom`, which `loadQsrRawItemDetail` never
returns. Harmless, but dead.

---

## 4. ⚠️ ABSOLUTE MUST — one-directional swing alarm

Owner's words: *"any metric, especially sales or guest counts, taking a massive
one-directional swing — especially if the wrong way — needs to light up the app. There
needs to be no reason it is not surfaced and made aware."*

Requirements as stated:

1. **Detect** a large one-directional swing in any metric, sales and guest counts first.
   The owner explicitly asked for help choosing **the factor** (the threshold / z-score /
   sustained-direction rule). This is the open design question, not the alarm plumbing.
2. **Impossible to miss.** Surface it prominently — the owner suggested requiring a
   **click acknowledgement** so it cannot be scrolled past.
3. **Preemptively compile a report** when it fires: pull other metrics and their trends
   to establish whether the cause is **operational or otherwise**.
4. **Use AI to scour** for anything missed that could explain a sudden swing.

**Live case to validate against: store 10422 = Atoka-Mississippi** — major hit to sales and guest counts over
the last few weeks, and the app did not make that unmissable.

⚠️ **Correction to the v4.861 commit body:** it renders the example alarm as
"Durant — sales down -20.8%". That store name was a placeholder passed into a console
preview and is WRONG. **10422 is Atoka-Mississippi**; Durant is 5985. All the numbers
(-20.8% sales, -22.4% guests, $38,711 vs LY, and the whole threshold calibration) are
correct and belong to 10422 — only the label was wrong. The committed tests key on the
loc number, not the name, so no code is affected.

### Why this connects to the notifications work

This is the strongest argument yet for the Notifications consolidation in the UI/UX
Phase 2 work (see [[notes-54-56-triage]] and the panel-registry commit). A swing alarm
has nowhere good to live today because "attention" is split across three panels:
`WhatNeedsAttentionPanel`, `AttentionPanel`, and `DistrictPriorityBrief`.

Note the existing engine is a partial fit and a good starting point:
`src/engine/attention-feed.js` already has severity levels, dollar-at-stake ranking, and
per-item `nav` routing — but **no swing/anomaly detector** and no acknowledgement state.
It also has a fully implemented, tested `slowDT` detector that is never wired up
(`buildAttentionFeed` is called without `dtRows`) — free capability already paid for.

Acknowledgement state needs somewhere to persist; `user_settings.notif_state`
(`{seenIds, dismissedIds}`) was the shape proposed in the UI/UX plan's Phase 5.
