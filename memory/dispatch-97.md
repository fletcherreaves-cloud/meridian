---
name: dispatch-97
description: Inventory Control's "Weekly Count Cadence" widget (eom-dashboard.js's CadenceMonitor) is a SEPARATE, older engine from the Count Cycle panel dispatch #96 just fixed -- it reads qsr_raw_item_detail (a top-~20-items-by-dollar-value table) through weekly-cadence.js's analyzeCountCadence(), not qsr_onhand (the full item universe) through count-cycle.js's cycleCompliance(). Condiment is silently absent from this table district-wide (confirmed: zero Condiment rows for Seminole/OKC/Tecumseh, and the codebase's own prior comment already measured this district-wide), so the widget's "full Food + Condiment count weekly" claim is false in practice -- it only ever checks Food, against a narrow top-dollar subset that can fall just under its 60% threshold even when the store's real, full Food count (in qsr_onhand) was comprehensive. This produced the exact stale 8/12, 8/13, 8/14 dates the owner saw on screen, reproduced live down to the exact day and item counts.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #97 — Inventory Control's Weekly Count Cadence widget uses a different, Condiment-blind engine than Count Cycle

**Read first:** `memory/dispatch-96.md` (the Condiment fix that just shipped in the *Count Cycle*
panel — this dispatch is about a *different* panel showing a *different* bug that looks similar on
the surface). CLAUDE.md's standing rule: *"When two panels disagree on one number, diff the two
computations before debugging either."* That's exactly what found this.

**Status:** ready, root cause fully measured and reproduced live, down to the exact on-screen
numbers. This is a scoped fix, not an open investigation.

---

## What the owner saw

Inventory Control's **🗓 Weekly Count Cadence** table (`CadenceMonitor` in
`src/views/eom-dashboard.js`) flagged three stores Overdue after dispatch #96 shipped and after a
hard refresh — unchanged, because dispatch #96 never touched this code path:

| store | on-screen "Last full count" | status |
|---|---|---|
| Seminole-Milt Phillips (10915) | 8/12/2026 · 12d ago | Overdue · 12d |
| OKC-I240/Sooner (20475) | 8/13/2026 · 11d ago | Overdue · 11d |
| Tecumseh (33704) | 8/14/2026 · 10d ago | Overdue · 10d |

This is a **different panel from Count Cycle** (separate nav item, separate component) and, it
turns out, a **different engine and a different data source** — confirmed by grep, not assumed:
`eom-dashboard.js` imports `analyzeCountCadence`/`weeklyExceptions` from `../engine/weekly-cadence.js`
and feeds it `qsr_raw_item_detail` rows (via `loadQsrRawItemDetail`), while Count Cycle's panel
imports `cycleCompliance` from `../engine/count-cycle.js` and feeds it `qsr_onhand` rows (via
`loadQsrOnHand`) — the exact engine dispatch #96 fixed today. **Dispatch #96's fix cannot and does
not affect this widget at all.**

## Measured live: reproduces the exact on-screen numbers

Pulled `qsr_raw_item_detail` (period 2026-08) for these three stores and ran the real
`analyzeCountCadence()` against it:

| store | item_class distribution | Food items needed for "full" (60%) | last day that cleared it | matches screen |
|---|---|---|---|---|
| Seminole (10915) | **F:29, P:7 — zero `C`** | 18 of 29 | 08-12 (21 counted); 08-18 only got 17 | **8/12 · 12d ago** ✓ exact |
| OKC-I240 (20475) | **F:29, P:3 — zero `C`** | 18 of 29 | 08-13 (25 counted); 08-20 only got 17 | **8/13 · 11d ago** ✓ exact |
| Tecumseh (33704) | **F:34, P:3 — zero `C`** | 21 of 34 | 08-14 (21 counted); 08-21 only got 17 | **8/14 · 10d ago** ✓ exact |

The live-computed dates, day-counts, and days-ago all match the on-screen table exactly — this is
not a plausible theory, it's a reproduction.

## Root cause, two parts

1. **Condiment is silently absent from this table, district-wide — not wrongly gated, just never
   present.** All three stores show zero `item_class='C'` rows. This isn't specific to these
   three: `count-cycle.js`'s own header comment (written when it was built, citing this exact
   table) already measured it district-wide — *"The existing cadence engine (weekly-cadence.js)
   reads qsr_raw_item_detail, whose live class coverage for 2026-07 is {F: 573, P: 122} — ZERO
   Condiment rows across all 27 stores... written by the variance pull, which only keeps the top
   ~20 WRINs by \|$\| over a $50 threshold. Condiments are low-dollar so they are never selected."*
   `analyzeCountCadence()`'s own loop (`if (classTotals[c] && n >= classTotals[c] * fullFrac)`)
   silently skips any class whose `classTotals` is `0` — so Condiment never blocks or contributes
   to "full" session detection here. **The widget's own subtitle — "Every store runs a full Food +
   Condiment count weekly" — is not true of what it actually checks.** It only ever evaluates Food.
2. **Even for Food, the threshold is checked against the wrong universe.** `qsr_raw_item_detail`'s
   per-store Food set is small (29, 29, 34 items here) because it's filtered to the top-$ variance
   items, not the true active-item universe (`qsr_onhand` shows ~119-122 real active Food items for
   these same three stores per dispatch #96's own live pull). A real, comprehensive count that
   happens to touch 17 of this narrow top-$ subset falls just under the 60% (`fullFrac`) bar by one
   or two items — even though the same day's *real* count in `qsr_onhand` was comprehensive. This
   is a fragile threshold at that scale: missing 2 of 29 items (93% real coverage) can still read
   as "not a full count" if those 2 happen to be in the top-$ tracked subset.

## The fix

Retire the separate `qsr_raw_item_detail`-based cadence check in `CadenceMonitor` and point it at
the same engine Count Cycle now correctly uses — `cycleCompliance()`/`detectSessions()` over
`qsr_onhand` (`src/engine/count-cycle.js`, already fixed for Condiment by dispatch #96). Two
already-fixed, already-tested, already-verified engines answering the same question two different,
disagreeing ways is exactly the duplication CLAUDE.md's "check whether a helper exists" rule warns
about — don't maintain both.

Concretely:
- `eom-dashboard.js`'s `cadenceByLoc` (built from `analyzeCountCadence(rawByLoc[loc], ...)`) should
  be built from `count-cycle.js`'s `cycleCompliance()`/`detectSessions()` over `qsr_onhand` instead
  — `loadQsrOnHand` is already imported in this file for other purposes (EOM completion), so the
  data-loading path likely already exists; check what's already there before adding a new fetch.
- `CadenceMonitor`'s display fields (`c.daysSinceWeekly`, `c.lastWeekly`, `c.detectedWeekdayName`,
  `c.nWeekly`/`c.nSpot`, `c.sessions`) need a mapping from `count-cycle.js`'s actual return shape
  (`lastWeekly`, `daysSinceWeekly`, `sessions` are already close in name/shape per the earlier read
  of `count-cycle.js` — confirm the exact field names before wiring, don't guess).
- **Do not touch `weekly-cadence.js`'s `itemVarianceWindows`/`windowsFor` mechanism** — that's a
  genuinely different, still-valuable feature (bracketing WHEN a variance happened between count
  points) that legitimately needs `qsr_raw_item_detail`'s per-item history, which `qsr_onhand`
  doesn't carry. Only the "is this store's weekly count complete" determination (`analyzeCountCadence`'s
  `classTotals`/`fullFrac`/`lastWeekly` logic) should move to the `count-cycle.js` basis — the
  variance-window drill-down that opens when you click a store stays on `qsr_raw_item_detail`,
  unchanged.
- After the fix, re-verify these same three stores against live data — Seminole and OKC should
  read something close to Count Cycle's own already-computed 08-18/08-20 "ok" status (per
  dispatch #96's Resolution section), and Tecumseh should reflect whatever Count Cycle now
  correctly computes post-Condiment-fix (crit → ok per that same Resolution section).

## Verification bar

Re-run the fixed `CadenceMonitor` (or its underlying data-building logic) against the live
`qsr_onhand` pull for all 27 stores, `asOf: 2026-08-24`, and confirm:
- Seminole, OKC-I240/Sooner, and Tecumseh no longer read Overdue for a reason traceable to the
  narrow top-$ item subset or the always-empty Condiment class.
- The widget's status for every store matches (or is at least explainable against) what Count
  Cycle's `cycleCompliance()` computes for the same store/date, per CLAUDE.md's own "two panels
  disagree" diagnostic — if a real difference remains, name why (e.g. a legitimately different
  `asOf` or window), don't just declare parity without checking.
- `itemVarianceWindows`/the per-store drill-down (click-to-expand FOB variance trace) still works
  unchanged — this is a display-source swap for the compliance/date logic only, not a removal of
  the variance-window feature.
- Run the existing test suite plus new consumer-level coverage (render the actual `CadenceMonitor`
  or `EomDashboard` consumer, not the engine function in isolation, per this repo's "would this
  verification still pass if reverted" standing rule) and `npm run build` clean.

## Do NOT

- **Do not touch `count-cycle.js` or the Count Cycle panel** — already fixed today (dispatch #96),
  out of scope here.
- **Do not remove `weekly-cadence.js` entirely** — `itemVarianceWindows` (the between-count
  variance-bracketing feature) is real, separate, valuable functionality that stays. Only the
  "full weekly count" completion/date logic moves to the `count-cycle.js` basis.
- **Do not re-propose fixing `qsr_raw_item_detail` to include Condiment rows.** That table is
  correctly scoped to top-$ variance items by design (a different, legitimate purpose — variance
  diagnosis, not completeness checking) per count-cycle.js's own header comment. The fix is to stop
  using it for the completeness question, not to widen what it collects.
- **Do not guess `count-cycle.js`'s exact return-shape field names** — read the actual code
  (`cycleCompliance`'s return object, already read once during dispatch #96's investigation) before
  wiring the mapping.
