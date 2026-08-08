---
name: notes-60-queue
description: Notes 60 (2026-08-07) — large owner queue, mostly quick wins. Triaged into the two architectural spines (a shared panel design system, and one cycle-agnostic engine) plus concrete bugs, new capabilities, and naming. Several items need owner screenshots or collaboration.
metadata:
  type: project
---

# Notes 60 — triage

Owner's words: *"Most all are QW's but will make me feel better!! Please review and merge
into our bigger plan... some will need us working together plus I need to send you
screenshots."*

Nothing below is done. Items marked 📸 need an owner screenshot; 🤝 needs a working
session together.

---

## THE TWO SPINES

Most of this list is instances of two structural asks. Doing these two first makes a
dozen other items fall out cheaply, and doing them last means doing the dozen twice.

### Spine 1 — one copyable panel design, used everywhere

> *"We need to settle on a copyable design idea that flows throughout the whole app. No
> matter what data we are working with the look and feel and layout should match in
> consistency across every panel/function/modal. Open to a few pushbacks as there may
> genuinely be some one-offs."*

The owner has already named the model: **District View → Location tile.** *"It is kind of
its own dashboard. We need to migrate to this"* — explicitly wanting **Food Cost, FOB and
Inventory Control** rebuilt in that shape.

Three recurring sub-asks that belong to this spine and appear separately throughout the
notes — build them ONCE as shared controls:
1. **Standard date controls with range picking.** *"In several places we use static
   loopbacks (7/14/21/28, 30/60/90). I don't dislike them, but we might as well include a
   standard date picker with range ability."* Wanted specifically on Speed of Service,
   Promo/Discount ROI, and generally.
2. **Standard export options** (Speed of Service, Promo ROI, and by implication all).
3. **Standard location selector** — all / each / group. A `feedback-selector-ui-standard`
   memo already exists; this extends it.

⚠️ This is the single highest-leverage item in Notes 60. It also connects directly to the
parked **UI/UX Phase 3+** work (v2 sidebar, home screen) — same programme, and the panel
registry from v4.856 is the enabling piece already built.

### Spine 2 — one cycle-agnostic inventory engine

> *"The principles between the different count cycles are the same. The only thing that
> changes is what they look back to. We should be able to create a system where we just
> select the cycle and share/use the same resources for all the other stuff we are doing."*

This is exactly right and it is the correct abstraction. Daily / weekly / mid-month / EOM
differ only in **lookback anchor** and **which classes are required**. The pieces already
exist and are already cycle-aware in isolation:
- `src/engine/count-cycle.js` — session detection + per-cycle class rules (v4.865)
- `lastCountAnchor` in `variance-trace.js` — anchor selection (v4.875)
- `inv_count_sessions` — the history to look back across (v4.866)

The work is unifying them behind a single `cycle` selector rather than three near-copies.

---

## NEW CAPABILITIES

### Demographics per location 🆕
Capture per store: **income · employment · household data · cost of living · population ·
major employer(s)**. Almost certainly Census/ACS API (free, no key needed for basic) keyed
by the store's ZIP or county — the `locality.js` registry already holds town/state per
store and is the natural place to hang a ZIP/FIPS code.
Real value: a store's *addressable market* is context every existing metric lacks — it
would make "is this store underperforming, or is its trade area just smaller?" answerable.

### Register Audit engine 🆕
> *"Need to build an engine to fully utilize this rich dataset"* — searchable · smart
> detection · report-friendly · SAGE-integrated · Signals-integrated.
`audit_rows` already loads (and was one of the tables timing out before v4.871). This is a
whole workstream, not a quick win.

### Local News → event discovery
> *"You are already scanning a lot of sources, why not use it to scour for local events we
> may have otherwise missed. It would be a great natural home for that."*
Strong idea and cheap: `news-classify.js` already tags a `community` signal. Promoting
those into candidate **Calendar events** (owner-reviewed before they count) closes the loop
with the Calendar Manager ask below. Ties to the existing `attribute()` store mapping.

### Calendar Manager — smart insights
> *"Smart insights to events that warrant consideration for adjusting forecasts."*
Pairs with the above: news-discovered events → flagged as forecast-relevant → owner accepts
→ feeds the forecast. Also the natural consumer of the Demographics work.

---

## CONCRETE BUGS (investigable without the owner)

| # | Panel | Symptom |
|---|---|---|
| 1 | ~~**FOB Analysis**~~ | ✅ **DIAGNOSED 2026-08-07 — see below.** |
| 2 | **Smart Targets** | Stuck on *"Loading Sales History"* — waited 2+ min, nothing. |
| 3 | **Schedule Summary** | Week of 08/05 viewed on 08/07: **labor % of sales not populating**. |
| 4 | **Planning → Yearly** | YTD Actual and Targets both wrong. Owner suspects they're wired to the monthly-target import files, which only start **March/April** when uploads began — so Jan–Mar is a gap to fill. |
| 5 | **Morning Intelligence Brief** | A few locations show very high **sales divergence**. Check whether it compares a PARTIAL current day against a FULL-day projection. *(Note: this is the same class as the v4.869 swing-alarm partial-day bug — likely the same root cause in a different panel.)* |
| 6 | **District View → Forecast Table** | Missing Goal, OEPE, TPPH, Labor %. |
| 7 | **District View → Scorecards → Controls** | Missing a lot of data 📸 |
| 8 | **District View → Action Plan** | Missing TPPH. |
| 9 | **Dialed-In** | Missing **past-week trends on calibration** 📸 — owner calls this a priority. |
| 10 | **Forecast Accuracy** | *Scheduled Projection* column looks way high; owner ran a 6-week test. |
| 11 | **EOM Supervisor Summary** | Op Supplies must pull **actuals for the selected period**; check targets too. |
| 12 | **Labor Analysis** | Week start must be the system setting (**Wednesday**). ⚠️ Then **audit every week-view in the app** for the same error, and write a rule so it cannot recur. This is a bug CLASS, not one bug. |

---

### Bug #1 diagnosed — FOB Analysis stuck at May 2026

Measured, not guessed:

* `qsr_fob` (cloud) holds **2024-01-19 → 2026-08-07**, every month Mar–Aug fully populated
  with `prod_sales_amt > 0`. The data is fine.
* `fob_rows` (manual fallback) tells the real story:

  | month | rows | sales > 0 |
  |---|---|---|
  | 2026-05 | 27 | **27** |
  | 2026-06 | 27 | **0** |
  | 2026-07 | 27 | **0** |

The panel builds its month list from rows with `sales > 0`. So when the CLOUD read fails,
it falls back to manual — whose last month with sales is **exactly May 2026**.

**Primary cause, probably already fixed:** `qsr_fob` was one of the six tables returning
HTTP 500 from the per-login count-scan diagnostic removed in **v4.871**. `loadQsrFob` reads
13,160 rows across 14 pages (~19 MB); `fetchAll` returns `[]` if page 1 errors, which
silently produced pure-manual fallback. Since **v4.870** that failure now raises the DATA
INCOMPLETE banner naming `qsr_fob`, so a recurrence is visible. **Verify the panel now
shows June–August before doing anything else.**

**Secondary, independent, still open:** manual `fob_rows` for June and July have 27 rows
each but **zero sales**. That is an upload-side data problem, not a panel bug, and it
matters because manual is the fallback that has to work when cloud fails.

## PANEL WORK

- **Visit Readiness** 🤝 — owner: *"My monster, I own it. Don't hate it, don't love it."*
  Wants a rethink: the title promises data-rich support for visit readiness. Proposed
  direction is **diagnostic** — a ruleset that reads current state and tells a location how
  to get ready and STAY ready, announced or unannounced. Needs a design session.
- **Graded Visits** — more analysis; what correlations can be drawn.
- **Inventory Control** 🤝 — *"the beginnings of a masterpiece."* Too many pills at top;
  wants sub-menus or a horizontal list. **This is the pilot for Spine 1.** Also needs the
  daily/weekly/monthly framing from Spine 2.
- **Signals** — *"another potential masterpiece, just needs further refining."*
- **Promo/Discount ROI** — fine-tune purpose; add standard date/export/location controls.
- **Labor Analytics** — owner wants the same treatment adapted to **Food Cost, FOB and
  Inventory Counts**. (Overlaps Spine 1.)
- **End of Month** — migrate to auto-pulled data.
- **Event Impact Registry** — finish wiring to all other metrics.
- **Panel Manager** — revisit making **all** panels selectable. ⚡ The v4.856
  `panel-registry.js` makes this genuinely easy now — it already knows every panel and its
  `kind`.

---

## NAMING / SCOPE

- **Planning → Pace tab: RENAME.** McDonald's uses "PACE" internally with a completely
  different meaning. This is a real collision worth fixing before anyone else sees the app.
  Candidates: *Run Rate · To-Target · Trajectory · Month Pace → "On Track"*.
- **Needs Attention** — either broaden it to cover all current AND future data, or rename
  it to something honestly narrower.
- **Help → rename** (owner suggests *Workflow* or similar). "Help" should mean
  troubleshooting.
- **Troubleshooting** — build it, with **two modes: End User and Developer/Admin**.

---

## DOCS / SUPPORT CLUSTER

- **Knowledge Base (ours)** — expand to cover everything not yet documented; audit existing
  articles for accuracy.
- **Metric Lineage** — audit for completeness; extend to record **all data pulled, whether
  in use or not** (togglable). ⚠️ This is precisely the
  [[notes-57-metric-registry-plan]] ask — merge them, don't build twice.
- **Data Manager** — SMG/Voice one-liners clutter it (nest them?); review for completeness
  of all sources; **explain the app's data flow**.
- **Save/Restore Session** — nest elsewhere (rarely used), but first VERIFY they actually
  back up what's needed.
- **About** — ✅ **FIXED v4.884.** It always existed, but the Admin nav entry was labelled
  **"Changelog"**, which is why the owner could not find "About". Renamed; the panel shows
  version, build date, store/model/row counts *and* the changelog.
- **Version number on screen** — ✅ **DONE v4.884.** Now in the sidebar footer, read from
  the global `App.js` publishes so it cannot drift from the constant.

---

## SUGGESTED ORDER

1. **Spine 1 pilot on Inventory Control** — shared date/export/location controls + the
   District-View-tile layout. Everything else inherits it. 🤝
2. **The week-start bug class** (#12) — correctness, and it silently poisons any week view.
3. **The concrete bugs** #1–#11, cheapest first; several are likely one wiring fix each.
4. **Spine 2** — cycle-agnostic inventory engine.
5. **Naming** (PACE especially) — cheap, and gets more expensive the longer it waits.
6. **New capabilities** — Demographics, Register Audit engine, news→events.

Merge with: the parked **UI/UX Phase 3+** (same programme as Spine 1),
[[notes-57-metric-registry-plan]] (same as the Metric Lineage ask), and
[[docs-refresh-todo]].
