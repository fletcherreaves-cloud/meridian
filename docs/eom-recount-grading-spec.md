# Recount "Helped or Hurt" — Grading Spec (draft for approval)

**Status:** proposal · **Owner sign-off needed before code** · Author: Claude Code, 2026-08-01

This pins down the ONE question we keep circling: *when a store recounts an item, did the recount help or hurt?* Everything else in the Change Monitor (detecting that a recount happened, when, by whom) is solid and stays. This is only about the **grade**.

---

## 1. What we already know for certain (banked — do not re-derive)

- **`difference` = variance (units) × unit cost.** Proven on Durant McNuggets (constant 0.4227 ratio). It is the item's variance in **dollars at that count**, NOT a per-submission delta.
- **Intermediate area entries are partial-variance artifacts.** During an area-by-area walkthrough only the **binding (last) entry** is the item's real variance for that count.
- **Variance reconciles point-to-point:** `Variance = Expected Usage − Actual Usage`, where `Actual Usage = Begin + Purchases ± Transfers − Waste − Ending count`. So variance moves **+1 unit for every +1 unit of ending inventory counted** (more found → less usage → variance up toward zero). Proven to the unit on Durant.
- **`officialVar`** (QSRSoft Variance Stat) is the authoritative period number, and it already reflects the **final binding on-hand**.
- **Detection is trustworthy:** store-window model + `countSource` (non-MobileApp = confirmed back-office recount) + period-specific (only the EOM-binding count's recount matters).

## 2. Why grading kept wobbling

We graded on the **per-count `difference` snapshots** (variance-at-that-count). Those don't tie to the authoritative number — SWEETENER's EOM count snapshot reads **+$66** while its official period variance is **−$632**. Both are "true," but they answer different questions, and we were scoring off the noisy one. We also grew **two** grading systems (progression view vs baseline-diff) that use different math and can disagree. That divergence is the churn.

## 3. The single definition (proposed)

> **A recount HELPED if it moved the item's booked period variance closer to zero than the pre-recount count would have; it HURT if further; it's NEUTRAL if the move is below the materiality floor.**
> Grade **only** the recount(s) on the **EOM-binding count day**. Earlier-day recounts are informational.

**Measured on ONE authoritative basis** — not the raw per-entry `difference`. Because only the **ending on-hand** differs between the pre-recount count and the recount, and variance is linear in ending inventory, we can compute both cleanly from `officialVar`:

```
cost              = unit cost  (from loose_unit_cost, or |difference| / |variance|)
var_after   (kept) = officialVar                                   // binding = the recount's on-hand
var_before  (what the original count would have booked)
                  = officialVar + (onHand_before − onHand_after) × cost
helped  if |var_after| < |var_before| − floor
hurt    if |var_after| > |var_before| + floor
neutral otherwise
```

This **anchors the grade to the real period number**, isolates the recount's contribution (the on-hand delta), and gives both views the same answer.

### Worked example
Original EOM count books on-hand 20 (would imply var_before −$180). Manager recounts, finds 28 (the true shelf), officialVar posts at −$118, cost $8.50/unit.
- `var_before = −118 + (20 − 28)×8.50 = −118 − 68 = −$186`
- `|−118| < |−186|` → **helped by $68** (the recount found real inventory the first count missed, cutting the booked loss).

If instead the recount had *dropped* the count (found 14, a worse count), var_after would sit further from zero than var_before → **hurt**.

## 4. Honest limitations (say these plainly in the UI)

1. **Needs `officialVar` posted.** If the Variance Stat hasn't landed for the period, we can't anchor — we fall back to **direction only** ("recount raised/lowered the booked count by $X; grade pending variance post"). We never invent a grade.
2. **"Truth" is the reconciled period number, not a physical audit.** "Helped" means *moved the booked variance toward the reconciled figure*, which is our best available truth. A recount that moves toward zero is *usually* right (recounts typically reveal missed inventory), but a recount could also move toward zero by padding. So **grade × integrity signal are separate**: a "helped" grade with a same-manager, too-fast, offsetting-batch timing flag is still escalated by the forensics layer. Helping ≠ automatically honest.
3. **Multi-area recounts:** compare binding-to-binding (last entry of the original window vs last entry of the recount window), never intermediate area rows.

## 5. Implementation (one function, both views)

- Add `gradeRecount({ officialVar, onHandBefore, onHandAfter, cost, floor })` → `{ verdict, deltaDollars, basis: 'anchored' | 'direction-only' }` in `eom-recount-detect.js`.
- `itemRecounts` calls it for each EOM-day recount instead of the current `|prev.difference| − |e.difference|`.
- The **progression view** and the **baseline-diff view** both read this verdict — kill the divergence.
- Reuse the existing **$25 materiality floor**.
- Keep every detection field (window, countSource, confidence, ↻) exactly as-is.

## 6. Decisions I need from you

1. **Anchor to `officialVar`** as the truth basis (§3), with direction-only fallback when it hasn't posted? *(my recommendation: yes)*
2. **Materiality floor for grading recounts** — reuse $25, or a different number for item-level recount grades?
3. **"Helped toward zero" framing** — is "closer to the reconciled period variance = helped" the right business meaning, or do you want "helped = moved toward the *physically true* on-hand" (which we can only approximate)? *(they're the same in practice; this is about how we word it to a GM.)*
4. **Keep grade and integrity separate** (a "helped" item can still be flagged for padding-timing)? *(my recommendation: yes)*

Approve these four and I implement once, unify both views, and we stop re-touching it.
