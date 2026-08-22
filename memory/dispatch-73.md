# Dispatch #73 — Visit Patterns' "overdue" amber fires on 87% of normal visits

**Status:** ready to start. Small, self-contained, well-evidenced.
**Reads:** `memory/finding-cfv-predictability-ceiling-2026-08-22.md` (the 217-visit dataset this
is measured from).

---

## The defect

`src/views/visit-readiness.js:328` colours a store's `daysSinceLast` **amber when it exceeds 60
days**:

```js
color: f.daysSinceLast != null && f.daysSinceLast > 60 ? '#f59e0b' : 'var(--text3)'
```

**Measured against 190 real CFV inter-visit intervals** (all 27 stores, 2023-01 → 2026-08, from
Propel's `getCfvHistory`):

| statistic | days |
|---|---|
| min | 33 |
| p10 | 57 |
| **median** | **138** |
| mean | 153 |
| p90 | 255 |
| max | 433 |

| threshold | intervals exceeding it |
|---|---|
| **> 60 d (shipped)** | **166 / 190 = 87.4%** |
| > 90 d | 75.3% |
| > 120 d | 58.4% |
| > 150 d | 44.2% |
| > 180 d | 33.7% |

**An alarm that fires on 87% of normal behaviour carries no information.** The median gap is
**138 days** against a 60-day threshold — off by more than 2×. A store perfectly on cadence shows
amber almost permanently.

📌 The 60 was never wrong-by-measurement; it was **never measured**. CLAUDE.md's standing rule is
explicit that thresholds come from data — *"the swing alarm's -10% comes from 676 measured
store-weeks, and the count-completeness 75% from a measured bimodal distribution, not from numbers
that felt right."* This is the counter-example.

## 🔴 The second half — one threshold cannot serve three instruments

`freq` is built inside `analyzeGradedVisits` (`src/engine/visit-readiness.js:502`) over `visits`,
which is filtered by `opts.type` — **and the panel's default is `'all'`** (`:477`,
`const type = opts.type || 'all'`; `VisitPatterns` initialises `useState('all')`).

So on load the gap series **mixes instruments whose expected cadences differ by 3×**:

| instrument | cadence | expected gap |
|---|---|---|
| CFV | 3/store/yr | ~121 d |
| EcoSure | 2/store/yr | ~182 d |
| RGR | ~1/store/yr | ~365 d |

A single number cannot be "overdue" for all three. **Even a correctly-measured CFV threshold would
misfire on RGR**, so re-pointing the constant is not sufficient on its own.

## What to do

1. **Make the threshold per-instrument and derive it**, rather than picking a new constant. The
   defensible form is a multiple of that type's own expected cadence — e.g. amber past ~1.5× the
   expected gap (CFV ≈ 180 d, EcoSure ≈ 270 d, RGR ≈ 550 d) — with the cadences as named constants,
   not inline numbers.
   ⚠️ **Do not hardcode 138.** That is this estate's observed median, not a target; the cadence is
   the thing with meaning, and the owner has confirmed CFV 3/yr and EcoSure 2/yr.
2. **When the type filter is `'all'`, either suppress the amber entirely or compute it per row from
   that row's own last-visit type.** Showing one colour across three cadences is the actual bug;
   a mixed view that simply doesn't claim "overdue" is honest and is the cheaper fix.
3. **Say what the colour means.** Right now amber is unlabelled — `"{n}d"` in orange. A reader
   cannot tell whether it means overdue, recent, or something else. One word fixes it.

## Do NOT

- ⚠️ **Do not flag new stores as overdue.** Ponce de Leon (43701) has 2 CFV visits, both 2026;
  Tishomingo (43380) has 5, first 2025-04-15. **Both are new** — their short histories are complete
  for their age, not thin. Any "overdue"/coverage surface must not present a store's age as a
  failure. (This corrected an earlier escalation of mine — see the Propel finding.)
- ⚠️ **Do not treat a long gap as a store problem at all.** Visit scheduling is McDonald's-side; the
  operator does not choose when a shopper turns up. The metric is *"when should we expect the next
  one"*, not *"this store is failing to be visited."* The label should reflect that.

## Verification bar

Revert-sensitive per the standing rule: a test that renders `VisitPatterns` with a fixture whose
gaps straddle the new threshold and asserts the colour, **not** a unit test of the threshold
constant. An engine-level assertion would pass with the panel still colouring on 60.

Include a fixture case with a **new store** (2 visits, both recent) and assert it is not flagged.
