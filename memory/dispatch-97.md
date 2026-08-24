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

## Scope addition (owner, 2026-08-24, after this dispatch was already in progress)

Owner's actual requirement, stated directly: *"The weekly count... needs to be calculated very
much like the EOM count... For the count requirements, mirror what we do for EOM, which I believe
is 90 or 95% completion to show counted. The remainder are typically overlooked items and we need
to identify them and notify locations to go and count those so they reach 100%."*

Measured what EOM actually uses (`src/engine/eom-inventory.js`), since "I believe" deserves a real
check, not a guess in either direction:
- `CLASS_DONE_PCT = 0.98` — the per-class completion threshold (a class reads "done" at ≥98%).
- `BELIEVES_DONE_PCT = 0.90` — the overall store-level "believes done" threshold.

**Both are meaningfully higher than `count-cycle.js`'s `COVER_FRAC = 0.75`** (75%), which the weekly
engine currently uses for its own "covered" determination. `COVER_FRAC` was deliberately measured
against real weekly-session data (a bimodal 0-10%/80-100% split, documented in its own comment) —
it was never chosen to match EOM's threshold, because nobody had yet asked it to. Per the owner's
direction above, it now should, for the weekly-count completeness question specifically: **replace
`COVER_FRAC`'s role in the Food/Condiment/Paper "covered" check with `CLASS_DONE_PCT` (0.98)**, so a
store's weekly count is graded the same way its EOM count already is. Don't just import EOM's
constant and re-derive the comparison — reuse it (`import { CLASS_DONE_PCT } from './eom-inventory.js'`
or wherever it's cleanest without creating an import cycle) rather than hand-copying the number,
so the two never drift apart silently in the future.

**Also add the missing-items list.** EOM already has exactly this feature —
`diagnoseIncompleteCount()` (`eom-inventory.js`) returns a per-item, `$`-ranked "still uncounted"
list (`wrin`, `descr`, `cls`, `valueAtRisk`, `lastCounted`, `state: never|early|stale`), grouped
`byClass`, already surfaced in `eom-dashboard.js` (`incByClass`, ~line 1379-1382, "so a ≥90% class
can show exactly what's left, hover on the class chip + in the diagnosis/comms report"). The
weekly-count widget needs the equivalent: for a store below the 98% class threshold, name the
specific items still uncounted (not just a percentage), so a GM can be told precisely what to go
count to close the gap. `diagnoseIncompleteCount()` takes `onHandRows`/`period`/`asOf` and doesn't
appear inherently EOM-window-specific in its uncounted-detection logic (`isCounted`/`countedDate`
just compare against a `windowStart`) — check whether it can be called directly with the weekly
window's start date, or whether it needs a small window-parameter generalization, before writing a
second, parallel version of the same logic.

**This changes the fix's shape, not its direction** — still pointing the weekly-count widget at
`qsr_onhand`/the `count-cycle.js`-family logic instead of `qsr_raw_item_detail`, now explicitly
matching EOM's own completion bar and including EOM's already-built "what's left" mechanism rather
than a bare pass/fail. If threading `CLASS_DONE_PCT` through changes what today's dispatch #96 fix
already computes for Seminole/OKC/Tecumseh (their status was verified at `COVER_FRAC=0.75`), re-verify
against the new 0.98 bar and report both numbers — don't assume they hold.

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

---

## Resolution (2026-08-24)

**Shipped, including the owner's mid-fix scope addition above.** `count-cycle.js` and the Count
Cycle panel were not touched, `weekly-cadence.js`'s `itemVarianceWindows`/`windowsFor` mechanism is
byte-for-byte unchanged, and `qsr_raw_item_detail` was not widened — matching every item on the
"Do NOT" list.

### What actually shipped

`cadenceFromOnHand()` (new, `src/views/eom-dashboard.js`) replaces `cadenceByLoc`'s old
`analyzeCountCadence(rawByLoc[loc], …)` build. It calls `detectSessions()` — imported from
`count-cycle.js`, **not** `cycleCompliance()` — over `onHand` (`qsr_onhand`, already loaded in this
file for EOM completion; no new fetch). `detectSessions()` returns raw, un-thresholded per-session
item counts and per-store active-item `classTotals` (Condiment-fixed by dispatch #96); this
function does not touch or import `COVER_FRAC`, so Count Cycle's own 0.75 threshold is completely
untouched by this change, as the scope addition required.

The scope addition changed the fix's shape mid-flight, so the shipped mapping is not the one
originally sketched under "The fix" above:
- **Threshold:** each session is graded against `eom-inventory.js`'s own `CLASS_DONE_PCT` (0.98,
  imported, not hand-copied) on Food and Condiment independently — the same bar a store's EOM count
  is held to, per the owner's direction. A class with a zero active universe is vacuously covered
  (nothing to count), the same rule dispatch #96 already established for Count Cycle's own zero-
  universe case.
- **`lastWeekly`/`daysSinceWeekly`:** the most recent session (if any) that clears `CLASS_DONE_PCT`
  on both Food and Condiment. `null` when no session this period does.
- **The "current attempt" for the missing-item list is the store's BIGGEST Food+Condiment session
  this period, not merely its most-recently-touched date.** This needed a real fix mid-implementation:
  `qsr_onhand`'s `last_counted` is rolling-latest-state (`count-cycle.js`'s own documented
  limitation), so a store that ran a genuine ~150-item count on day D and then had 1-2 unrelated
  items re-touched (a routine spot recount, a late correction) on a LATER day would otherwise have
  that later day's 1-2-item non-event picked as "the current attempt" by pure recency — collapsing
  the missing-item list to "everything except those 1-2 items." Picking by session SIZE (ties to
  the more recent date), scoped to the current period, fixed this; live-verified against Seminole's
  real data below. Gated on `!lastWeekly` — a store with a more recent qualifying session has
  nothing left to notify regardless of what an earlier partial attempt looked like.
- **Missing-item list:** `diagnoseIncompleteCount()` (`eom-inventory.js`) generalized with a new
  optional `windowStart` override (2-line change: `windowStart` defaults to the EOM-period-derived
  value when omitted, exactly preserving every existing caller's behavior) so it can grade
  completion against the current attempt's own date instead of only EOM's last-3-days-of-month
  window. Called with `period` still set to the current calendar month (for the existing
  stale-vs-early item classification) and `windowStart` set to the attempt's date. Result filtered
  to `food`/`condiment` and surfaced in `CadenceMonitor`: an inline "N items left · $X" badge next
  to the status label, and the full $-ranked item list (per class) in the store's expanded row.

### Verified against a live `qsr_onhand` pull

Pulled all classes for `period=2026-08` (7,539 rows, all 27 stores) via Supabase REST with
`SUPABASE_SERVICE_ROLE_KEY` as a `Bearer` token, paginated, mapped through the identical row shape
`loadQsrOnHand` produces, and ran the actual shipped `detectSessions`/`CLASS_DONE_PCT`/
`diagnoseIncompleteCount` call chain against it, `asOf: 2026-08-24`.

**Seminole / OKC-I240 / Tecumseh — before (dispatch's own reproduction) vs. after:**

| store | before (on screen) | after — best session this period | after — status |
|---|---|---|---|
| Seminole (10915) | 8/12 · 12d ago · **Overdue**, graded against 29 Food items (0 Condiment) | **08-18: 116/122 Food (95.1%), 37/37 Condiment (100%)** | No full weekly yet — **3 Food items left** (Fried Apple Pie + 2 "(Deactivated)" SKUs, $0 on-hand) |
| OKC-I240/Sooner (20475) | 8/13 · 11d ago · **Overdue**, graded against 29 Food items (0 Condiment) | **08-20: 115/122 Food (94.3%), 37/37 Condiment (100%)** | No full weekly yet — **3 Food items left** ($31, two "(New)" milk SKUs + 1 "(Deactivated)") |
| Tecumseh (33704) | 8/14 · 10d ago · **Overdue**, graded against 34 Food items (0 Condiment) | **08-21: 117/119 Food (98.3%), 38/39 Condiment (97.4%)** | No full weekly yet — **2 Food + 1 Condiment item left** (the Condiment one is dispatch #96's own known "(Deactivated)" phantom, `last_counted` 2026-07-31) |

All three now grade against their REAL, comprehensive count instead of a fabricated narrow-subset
date — the original bug (a false 10-12-day-Overdue alarm) is gone. **None of the three clear the
new 98% bar outright**, so none read "On track" either; each reads "no full weekly yet" with a
small (2-3 item), specific, named remainder instead of either a false alarm or a false all-clear.
This is a genuine, measured result at the owner's requested threshold, not a shortfall in the fix —
see the district-wide number below and the follow-up note after it.

**District-wide, all 27 stores, same pull/asOf:** only **3 of 27 stores (10422, 11657, 13113)**
clear `CLASS_DONE_PCT` outright on their best session this period (2-4 days ago, correctly "On
track"). The other 24 — including the three named above — are typically **1-9 items short** of a
~155-160-item Food+Condiment universe (roughly 94-98% real coverage), each with its own specific
missing-item list now surfaced instead of a uniform status. This is exactly the pattern the owner
described — *"the remainder are typically overlooked items"* — now measured, not assumed: at 0.75
(Count Cycle's own threshold, untouched by this fix) most of these same 27 stores would read
comfortably compliant; at EOM's real 0.98 bar, real-world count sessions routinely fall a handful
of items short.

**Follow-up finding, not fixed here (no code change made, out of this dispatch's scope):** several
of the "missing" items across multiple stores — including Tecumseh's blocking Condiment item above
— are QSRSoft-marked `"(Deactivated)"` SKUs that dispatch #96 already measured at ~1.41% of
Condiment rows district-wide and deliberately left in the active universe (at `COVER_FRAC=0.75`,
that tail never changed a single store's outcome). At the new, much tighter 0.98 bar, a single such
stale/retired item CAN make a class permanently uncoverable for a store — Tecumseh's Condiment
(38/39) is a live example: the 39th item is a $0 phantom last touched 2026-07-31, before August's
count cycle even opened, and will presumably never be recounted. Flagging this for a possible
follow-up (e.g., excluding a `"(Deactivated)"`-marked, never-this-period item from the CLASS_DONE_PCT
denominator specifically) rather than acting on it unasked — this dispatch's scope was the
threshold + the missing-item mechanism, not re-opening `count-cycle.js`'s universe-membership rules
a second time in one day.

### `itemVarianceWindows` / drill-down — unchanged, verified

Rendered the actual `CadenceMonitor` component with a `rawByLoc` fixture carrying `qsr_raw_item_detail`-
shaped history and confirmed the click-to-expand "Biggest between-count variance windows" section
still names the item and its $ delta between count points, unaffected by the `cadenceByLoc` source
swap — this is a completeness/date logic swap only, not a touch to the variance-trace feature.

### Test/build results

- New file `src/__tests__/dispatch-97-cadence-onhand.test.js` — 3 tests, all rendering the actual
  `CadenceMonitor` consumer fed by the actual `cadenceFromOnHand()` builder (not an isolated engine
  function), per this repo's "would this verification still pass if reverted" standing rule.
  Confirmed load-bearing directly: temporarily reverted the threshold line to `0.75` and watched
  the below-98% fixture's assertions fail, then restored it.
- `npm test`: **2261/2261 passing, 218/218 files** (baseline before this change: 2258/2258 — net
  +3, all new, 0 regressions).
- `npm run build`: clean. Entry eager payload **521.51 KB gzip** (was 521.48 KB — +0.03 KB;
  budget 850 KB, headroom 328.49 KB). `eom-dashboard` chunk (lazy, not in the eager budget):
  64.14 → 64.48 KB gzip (+0.34 KB).

**Version:** v5.140 (`src/app/changelog/5.140.js`).
