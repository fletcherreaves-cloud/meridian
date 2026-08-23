---
name: dispatch-79
description: A 2-3 hour autonomous work queue requiring ZERO owner input. Five items in priority order - per-panel ErrorBoundary, thin-cell floors for Daypart/Weekpart, node -v in CI, the Count Cycle all-27-crit investigation, and a backlog staleness sweep. Every item verified still-open before listing.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #79 — autonomous queue (owner away ~2-3 h, ZERO input needed)

**Status:** ready. **Nothing here needs the owner.** Work top to bottom; stop when he's back.
**Hard rule for this queue:** if an item turns out to need a decision, **skip it and move on** —
do not stall, do not guess. Note what you skipped and why.

📌 **Push discipline applies** (`memory/standard-deploy-budget.md`, now also `CLAUDE.md`): commit
locally as you go, **one push per PR**, and prefer **one PR per item** so a problem in one doesn't
block the rest. That is ~5 pushes across 3 hours, which is fine.

---

## ⚠️ Every item below was verified still-open on 2026-08-23 before being listed

Two candidates were **dropped** because a check showed the backlog was stale — worth knowing, and
worth repeating the check before trusting any other backlog line:
- `staff_assignments` "written but never read": **the table appears nowhere in `scripts/` or
  `src/` at all.** Not a dead write; not a thing.
- `eom_count_progress_log` "never read": **it IS read in `src/`.** The claim is false.

---

## A. Per-panel ErrorBoundary — one runtime error still blanks the whole app  ~45-60 min

**Measured:** `ErrorBoundary` (`src/features/session.js:11`) is applied in exactly **two** places,
both in `src/meridian.js:52-53` — the share view and the entire app. With **82 panels**, any
runtime error anywhere takes the whole page down.

🎯 **The insertion point already exists.** `lazyPanel()` (`src/app/App.js:70`) already wraps each
lazy panel in **its own `Suspense`** boundary, for exactly the analogous reason (see its comment:
without it, opening any lazy panel shows a 100vh "Loading…" screen). Add an `ErrorBoundary` the
same way, at the same place. This is the shape the file already argues for.

- Keep the global boundary — this is defence in depth, not a replacement.
- The per-panel fallback should name the panel and offer a way back, not a blank box.
- ⚠️ **Check what the existing `ErrorBoundary` renders before reusing it.** A full-page recovery UI
  inside one panel would look broken. It may need a compact variant.

**Verification bar:** render a panel that throws, assert the rest of the app still renders. A test
that only mounts the boundary in isolation cannot tell "wired in" from "not wired in".

## B. Thin-cell floors for Daypart and Weekpart  ~30 min

`src/views/visit-readiness.js:385` renders `block('Daypart', a.daypart)` and
`block('Weekpart', a.weekpart)` with **no thin-cell floor**. From the owner's own screenshot
(2026-08-23): **Dinner `0.00%` at n=2** and **Weekend at n=4** — confident-looking percentages on
almost nothing. Channel got `CHANNEL_YEAR_MIN_N` in #75; its siblings never did.

⚠️ **Do NOT reuse `CHANNEL_YEAR_MIN_N`'s value of 10.** That number was *measured* against the
channel×year cell distribution. Daypart and Weekpart have a different distribution, and copying a
measured constant into a context where it was not measured is exactly the kind of thing this repo
keeps having to undo. Either measure the break in the real daypart/weekpart distribution the same
way #75 did, **or** document plainly that it is a chosen floor rather than a finding — #77's
`THIN_RELATIVE_FLOOR` is a good precedent for the honest-floor version.

**Verification bar:** revert-sensitive, rendering the real panel; include an n=2 cell and assert it
is suppressed or marked rather than shown as a bare percentage.

## C. `node -v` in `ci.yml`  ~10 min

The matrix runs `node-version: [20, 22]` specifically to catch runtime divergence (dispatch #60,
the `hour12`/ICU incident). But **`ci.yml` never prints the version**, so a green "verify (20)" is
not evidence the suite ran on Node 20 — the log's own Node-20 deprecation warnings are about the
*actions'* runtime, not the toolchain. One `- run: node -v` step makes that leg self-evidencing.

Trivial, and it rides along with whatever else touches CI.

## D. Count Cycle: all 27 stores read `crit` / `weekly-overdue` simultaneously  ~45 min

Flagged and never chased, **corroborated by two independent sources on two different dates**:
`dispatch-20.md` §3 and `374-recipe-item-verification-2026-08-18.md`, the latter measuring
`{stores:27, ok:0, warn:0, crit:27, overdue:27}`. Engine is `src/engine/count-cycle.js`.

📌 **`dispatch-20.md`'s own advice is the whole method, and it is one query:** check several
**non-today** dates first. **Every date `crit` → a logic bug. Only today → a stale feed.** Do that
before forming any theory.

⚠️ Do not fix on a hypothesis. If the answer is "stale feed," that is a data finding to write up,
not a code change.

## E. Backlog staleness sweep  ~30 min, fills whatever time is left

`memory/backlog-master-2026-08-19.md` warns about itself: most statuses were inherited from source
files rather than verified against code, and **two of the four items spot-checked while writing
this dispatch were wrong**. That rate is worth a systematic pass.

Take the unchecked `[ ]` items in §4 (Correctness Bugs) and §14's correctness section, and for each
one either confirm it against current code or mark it resolved **with the file:line or commit that
settles it**. Cite evidence per item — an unannotated line is what created this problem.

⚠️ **Do not "fix" anything you find here.** This item produces a *status* update only. Anything
real that turns up gets written down for the owner, not built unattended.

---

## Stretch, only if everything above is done — SCOPE it, do not build it

**True Σ/Σ for ratio metrics** (`memory/dispatch-77.md`'s deferral). 10 of 16 Top/Bottom Performers
metrics are ratios averaged across days; the repo has measured the gap at 4.5%. It needs
`metricSeries` to return numerator and denominator rather than the finished ratio — which is a
**registry design change affecting every consumer of a ratio rollup**, not a panel tweak.

⚠️ **Write the design, do not implement it.** It overlaps `notes-57-metric-registry-plan` §4 and
deserves the owner's eyes before code lands.

## Explicitly OFF this queue — all need the owner

RGR backfill (needs his Propel session, dispatch #78) · the Mac-mini token test (PR #560) · the
v4.839 retail-event seed scripts (write to production, blocked on go-ahead) · menu restructure ·
home-screen redesign · scoring-system revisit · Items Recounted window · Original Food Cost panel ·
LifeLenz AOS · SAGE outbound web access · the 2026 PACE template weights.
