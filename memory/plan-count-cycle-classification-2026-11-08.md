---
name: plan-count-cycle-classification-2026-11-08
description: Design for splitting count-cycle IDENTIFICATION from COMPLIANCE (task #126). Owner-requested write-up, 2026-11-08, following the Holdenville EOM near-miss finding (task #120) — a real 233-item, 97%/97%/88%-coverage close-window count that today reads identically to a 3-item spot check because one binary flag (isEom) currently answers two different questions at once. Design-only — no code changed, left for the owner's review.
metadata:
  type: project
---

# Count-cycle classification — separating "which cycle was this" from "was it complete" (task #126)

## The actual bug, named precisely

`src/engine/count-cycle.js`'s `sessionQualities(date, covered, n)` collapses two independent
questions into one boolean per cycle type:

1. **Identification** — is this session clearly *attempting* a given cycle (Weekly / Mid-Month
   Paper / End-of-Month), based on WHEN it happened and WHICH classes it touched?
2. **Compliance** — did it reach the required coverage bar (`COVER_FRAC = 1`, i.e. 100% of the
   active item universe, owner-tightened 2026-10-11, zero tolerance except brand-new WRINs)?

Today, `isEom = eomWindow && has('Paper') && n>=50` — and `has('Paper')` means Paper hit the
**100%** `covered` bar, not merely "Paper was touched." So question 2 gates question 1: a session
that fails the compliance check vanishes from identification entirely and falls into the generic
`isPartial`/`isSpot` bucket, indistinguishable from a session that barely happened at all.

**Measured, real case (Holdenville, 2026-10-30):** 233 items counted — Food 118/120 (98%),
Condiment 31/32 (97%), Paper 84/96 (88%). A real, substantial, clearly-EOM-timed count. Every
class just missed 100%, so `covered = []`, `isEom = false`, and the session's label is "Partial"
— the exact same label a 1-item spot check gets. The owner's own words: *"even if we don't give
credit for the 100%... that doesn't take away from the fact that the count is still the count for
that period."* That's the bug stated as a product requirement: identification must survive a
compliance miss.

## The fix: two independent axes, not one gated flag

**Axis 1 — Cycle Attempt (identification).** Same timing + touched-class logic that already
exists, with the 100%-coverage requirement removed from the DECISION of which cycle this is:

- `attemptsEom = eomWindow && paperTouched && n >= 50` (same window/volume heuristic `isEom`
  already uses — only the swap from `has('Paper')` [100%] to a lower "touched in real volume"
  floor changes)
- `attemptsWeekly = !eomWindow && foodTouched && condimentTouched`
- `attemptsMidPaper = !eomWindow && paperTouched`

"Touched in real volume" needs its own floor (not just `>0`, which would let a single stray item
claim a cycle) — recommend reusing the existing `isPartial`/`isSpot` boundary (`n>=25`) per class
rather than inventing a third number, pending the owner's read on whether that number still fits
once it's doing double duty.

**Axis 2 — Compliance (unchanged, still strict).** `covered` stays exactly what it is today —
the 100% bar, `COVER_FRAC` untouched. This is the one thing this design does NOT touch: the
owner's 2026-10-11 tightening stands exactly as stated. What changes is that a session can now be
BOTH "this is the October EOM count" (Axis 1, true) AND "it was 88% compliant on Paper, not 100%"
(Axis 2, a number, not a vanish).

**The label changes from one word to a fact plus a number:**

| Today | Proposed |
|---|---|
| `Partial` | `End-of-Month — Food 98%, Condiment 97%, Paper 88%` |
| `Weekly` | `Weekly — Complete` (100% is still the common case, and still reads simply when it's hit) |
| `Spot check` | unchanged — a session that fails even Axis 1 (too small/wrong timing to be any
  real cycle attempt) stays exactly what it is today, a spot check, not every partial count
  magically becomes a "cycle" |

A session's `kind` for display becomes `{ cycle: 'eom'|'weekly'|'mid-paper'|'spot', coveragePct:
{Food, Condiment, Paper, 'Non-Product'}, compliant: boolean }` instead of one label string.
`sessionLabel()` keeps existing as a convenience formatter over this richer shape, for every call
site that just wants a string (unchanged behavior when a session IS 100% — the common, intended
case) — it just stops being the only thing a session exposes.

## What this does NOT change

- `COVER_FRAC` and the owner's 100% compliance bar — identical, same zero-tolerance-except-new-
  WRINs rule. A session that misses it is still non-compliant. This design adds a second, honest
  fact alongside that verdict; it is not a quiet softening of the bar itself.
- `cycleCompliance()`/`buildCycleVerdict()`'s existing pass/fail logic for "is this store overdue"
  — that logic is about ACTION ("count Food and Condiment this week"), and should keep reading
  off the strict compliance axis, not the looser attempt axis. You don't want a 60%-covered
  "attempt" to quiet a real overdue alert.

## Open questions for the owner (nothing built without these)

1. **Terminology.** "Cycle Attempt" / "Compliance" are working labels for this doc, not a
   proposed on-screen vocabulary — what should a GM actually see? ("Logged" vs "Compliant"?
   "Counted" vs "Complete"?)
2. **The volume floor for "touched in real volume."** Reusing the existing `n>=25` partial
   threshold is the cheap answer; worth a fresh look now that it's deciding "is this a real cycle
   attempt" rather than just "is this worth a label at all."
3. **Named missing items — how far to take it.** `detectSessions()` (the live-snapshot path) DOES
   have per-WRIN granularity today — it reads raw `qsr_onhand` rows, so "which exact items weren't
   counted" is computable for the CURRENT/most-recent period right now, no schema change. But the
   durable append-only log (`inv_count_sessions`, what `sessionsFromLog` reads — the thing that
   actually survives a recount overwriting the live snapshot, see this file's own header on why
   that log exists) only stores aggregated counts per class/date, not a WRIN list. So "named
   missing items" works today for THIS period's count, but a past, already-logged session can only
   ever show a percentage, never a named list — unless `inv_count_sessions` is widened to also
   persist a missing-WRIN list going forward (a real schema addition, Tier C, your call). Worth
   deciding: is percentage-only history acceptable, or does this matter enough to widen the log?
4. **Scope — EOM only, or Weekly/Mid-Month-Paper too?** The exact same conflation exists in
   `satisfiesWeekly`/`satisfiesMidPaper` (both also gated on 100% `covered`). This doc uses EOM as
   the worked example since that's the real case in hand, but the fix is the same shape for all
   three. Recommend doing all three at once rather than fixing EOM and leaving the other two with
   the identical bug, but flagging it since it triples the surface area of one pass.
5. **Downstream surfaces.** Count Cycle panel, EOM Dashboard's Cadence Monitor, and the Holdenville-
   style history view all currently read the single `kind` string / `isEom`/`satisfiesWeekly`
   booleans. This doc only covers the engine-level shape (`count-cycle.js`); the UI changes needed
   to actually show "97%/97%/88%" instead of "Partial" are a separate, following pass once the
   engine shape is agreed, not included here.

## Suggested phasing, if/when this moves to build

1. Add the Axis-1 attempt functions + per-class `coveragePct` to `sessionQualities`/
   `sessionsFromLog`/`detectSessions`, additive (old `isEom`/`satisfiesWeekly`/`kind` string stay
   working for every existing call site) — zero behavior change for any already-compliant session,
   only changes what a non-compliant-but-real session exposes.
2. Update `sessionLabel()` to the two-part format for display, behind the richer shape.
3. Wire the new fields into the Count Cycle panel / EOM Dashboard's history views (the actual
   "now the owner can see this" step).
4. Decide question 3 (named missing items / log-widening) as its own follow-on, since it's the
   one item here that's a real schema change rather than pure application logic.
