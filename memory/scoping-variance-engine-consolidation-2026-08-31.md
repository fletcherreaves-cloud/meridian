# Scoping: consolidate the EOM count/variance engines?

**Owner question (2026-08-31, away from Mac):** "do we need to scope out and see how many
duplicate engines we are using and settle on one... this same logic could easily apply to other
situations in the app that have multiple engines." Prompted by v5.282 (PR #987), which fixed the
same "netting" bug independently in three separate files.

**Status: scoping only. No code changed by this document.**

## The short answer

Not 4 duplicate engines doing the identical thing — a layered, overlapping set that grew by
dispatch over ~a month, three of which had genuinely diverged and disagreed with each other (the
bug just fixed). One of the four (`eom-count-sessions.js`) was already correct and can serve as
the reference model. Real consolidation is worth doing, but it's a dedicated medium-to-high-risk
dispatch of its own — this code computes numbers SAGE, the owner, and store coaching conversations
all rely on — not a quick refactor to bundle into something else.

## The four engines, what they actually do, who calls them

| File | Job | Grouping unit | Consumers |
|---|---|---|---|
| `eom-count-sessions.js` | "Progression" story: every count session an item had, session-over-session | day OR gap-based (caller's choice) | Change Monitor "Progression" tab, `count-accumulation` diagnosis finding, `fob-recount-analysis.js` |
| `eom-recount-detect.js` | Which counts are a genuine, deliberate RECOUNT (vs. normal area-by-area walkthrough), graded against the authoritative period variance via unit-cost anchoring | store-wide time-gap windows + a 4h per-item guard + back-office-source detection | `recount-swing` diagnosis finding |
| `eom-ledger-baseline.js` | Close-window (last ~3 days) session-vs-final chain, for the FOB "did the recount help or hurt" story | plain calendar day only, no window/gap splitting | Change Monitor "Baseline" tab, Recount Impact report (dispatch #227), At-A-Glance "Items Recounted" tile, **SAGE's `query_eom_recount_impact` tool** |
| `eom-variance-raw.js` | "What's the freshest known $ variance for this item as of some date" — a low-level primitive, not session-aware | single latest count day | `eom-change-monitor.js`'s locked-baseline snapshot system (the oldest of the four models) |

`eom-count-sessions.js` was **already netting correctly** (its own `netDolVar`) before today's fix
— it's the reference implementation the other three now match. So "Progression" was never wrong;
"Baseline" and the raw/recount-detect engines underneath it were.

## What's genuinely duplicated vs. justified specialization

**Genuinely duplicated:** all three of the fixed files independently answer the SAME question —
"given a set of count events on one day/window, what's the item's combined $ variance?" — with
three separately-written, separately-buggy answers. That's the real problem, and it's the part
worth merging.

**Arguably justified, but worth a design call:** `eom-recount-detect.js`'s window+gap+back-office
model is strictly *more sophisticated* than `eom-ledger-baseline.js`'s plain day-only model — it
can tell a genuine same-day recount (walk away, come back, re-verify) apart from an area-by-area
walkthrough that happens to span a 90-minute store-wide gap. `eom-ledger-baseline.js` doesn't do
this at all; it only recognizes a recount that lands on a *later calendar day*.

**This is a live, still-open correctness gap**, not just a maintenance nuisance: if a store does a
genuine same-day recount inside the EOM close window, `eom-ledger-baseline.js` (and therefore
Change Monitor's Baseline tab, the Recount Impact report, and SAGE) will silently net it into the
session baseline instead of grading it as a recount — the exact class of bug just fixed, in a
different shape. `eom-recount-detect.js` already solved this for the `recount-swing` diagnosis
finding. Nobody has connected the two.

## Recommended consolidation path (if greenlit)

1. Promote `eom-recount-detect.js`'s per-item window/session-grouping (`itemRecounts`'s internal
   binding logic, or a factored-out piece of it) as the **one canonical answer** to "which count
   events belong together, and what's their net."
2. Rewrite `eom-ledger-baseline.js`'s close-window layer as a **thin wrapper**: reuse
   `eom-recount-detect.js`'s window bindings, filtered to the close-window date range, instead of
   re-deriving its own day-only grouping. This is a strict correctness upgrade (closes the
   same-day-recount gap above), not just a refactor.
3. Retire `eom-variance-raw.js` — replace its callers' single "latest known variance" need with a
   query into the same underlying binding logic. It's the least sophisticated of the four and
   exists mainly because it predates the others.
4. `eom-count-sessions.js`'s Progression view has a real, intentional difference (day OR gap
   grouping, caller's choice, shaped for a "tell the whole story" UI rather than a graded
   recount) — **this one may be fine to leave separate**; that's an owner call once the shape of
   the unified engine is on the table, not something to force into the same code path just for
   symmetry.

## Effort / risk

**Medium-high.** The netting fix alone (three files, well-scoped, still needed careful hand-tracing
against every existing test to avoid silently changing a helped/hurt verdict) is a fraction of what
a full merge would touch. A consolidation pass would need to preserve `eom-recount-detect.js`'s
back-office detection, unit-cost anchoring, and the 4-hour walkthrough-vs-recount guard exactly,
while changing every caller's data shape. Recommend: **its own dispatch, its own PR, not bundled
with unrelated EOM work**, with the same real-data regression tests this fix used (live-pulled
store histories, not just synthetic fixtures) as the bar for "safe to ship."

## The broader question: other duplicate-engine clusters?

Scanned all 94 files in `src/engine/` for name-clustering that could hide the same pattern.

- **`swing-context.js` / `swing-detect.js` / `swing-feed.js`** — checked directly. Not a
  duplication risk: these are sequential pipeline stages of ONE feature (detect → alert/ack →
  enrich with news context), each explicitly referencing the one before it. No overlapping
  calculation.
- **`labor-basis.js`** — worth noting as a **positive precedent**, not a new risk: its own header
  documents fixing this *exact* class of bug already, for labor targets ("until this file existed
  every consumer picked [a target field] by reading the field name inline... produced six
  competing 'the labor target' numbers with no single owner"). The codebase has already done this
  kind of consolidation successfully once.
- **`eom-report-build.js` / `eom-digest.js` / `eom-district-summary.js`** and
  **`fob-crosscheck.js` / `fob-recount-analysis.js` / `fob-report.js`** — checked headers; these
  operate at genuinely different levels (per-store report text, org-chart rollup, district-scoped
  summary; external-AI reconciliation, recount-impact analysis, all-location hierarchical report).
  No obvious duplicated calculation.
- The remaining ~80 files were scanned by name only, not individually read.

**Recommendation:** don't spin up a blanket "audit all 94 engine files" project — that's
disproportionate to a *hypothetical* problem, and the two clusters checked above turned out to be
healthy architecture, not bugs. The pattern that actually causes damage (three files each
re-deriving "the same day's binding value") is already named in CLAUDE.md's standing rule ("check
whether a helper exists before writing one") — treat this as reinforcement of that existing habit
for anything shaped like "compute X for a period/session/group," not a new one-time sweep.

## Decision needed from the owner

1. Greenlight the variance-engine consolidation as its own dispatch (medium-high effort)? The
   *correctness* bug is already fixed (v5.282) — this would be a maintainability / future-bug-
   prevention investment, not an active fire, so it can wait for a normal priority slot.
2. Any other area of the app the owner has *already* noticed disagreeing with itself (the way
   Baseline vs. Progression did) that should jump the queue ahead of a general sweep?
