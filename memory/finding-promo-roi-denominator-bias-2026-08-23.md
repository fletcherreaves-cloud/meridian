---
name: finding-promo-roi-denominator-bias-2026-08-23
description: The Promo/Discount ROI matched-day engine splits days on promo_pct (promo divided by SALES), so sales is the denominator of the splitting variable. Low-sales days are sorted into "promo-heavy" mechanically, then compared on sales. Proven by simulation to report 27/27 stores negative at ZERO true effect, and to attenuate a known +10% effect to +5.9%. Affects the panel, SAGE's query_promo_roi, and both levers.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# Promo/Discount ROI is biased by construction — it selects on the outcome

**Found 2026-08-23.** SAGE surfaced the symptom on two consecutive runs; the cause was found by
simulating the engine against data with a *known* answer.

---

## The symptom, reported twice, identically

Asked *"which five stores should I visit next week"*, SAGE flagged the promo screen unprompted
on both runs rather than using it:

> Run 1: *"The promo/discount ROI screen is unusable. It returned **negative** sales lift for all
> 27 stores (−6.7% to −58.7%) and an empty discount lever. A universal negative result across every
> store means the … classification is [broken]"*
>
> Run 2: *"Promo ROI is unusable this run. Every one of 27 stores returned negative lift and mostly
> `n/a` verdicts — that's a broken screen, not a finding. Excluded from this analysis."*

Reproducible across runs, and SAGE's own read — *"a universal negative across every store is a
classification bug, not a finding"* — was correct.

## The defect

`matchedLift()` (`src/engine/promo-roi.js:59`) splits each store's days at its **median intensity**,
and intensity defaults to **`promoPct`** (`:60`), i.e. **promo dollars ÷ sales**:

```js
const intensityField = opts.intensityField || 'promoPct';
const med = median(rows.map(r => r[intensityField]));
(r[intensityField] > med ? c.heavy : c.light).push(r);
```

Then it compares `mean(heavy.sales)` against `mean(light.sales)` and calls the difference *lift*.

**Sales is the denominator of the splitting variable.** So for any fixed promo spend, a low-sales
day has a mechanically high `promo_pct` and lands in "heavy"; a high-sales day lands in "light".
The buckets are therefore *sorted by sales* before sales is ever compared. This is **selection on
the outcome**, and it drives the measured lift negative regardless of the true effect.

## Measurement 1 — zero true effect ⇒ 27/27 stores negative

`memory/data/promo-roi-bias-sim-zero-effect.mjs`. 27 stores × 120 days. Promo dollars held
**constant** every single day, sales driven only by day-of-week plus ±25% promo-independent noise.
**The true promo effect is exactly zero by construction.** Run against the real engine:

| | |
|---|---|
| stores scored | 27 |
| **negative lift** | **27 / 27** |
| lift range | **−25.2% … −19.9%** |
| district | −$1,360/day "extra" sales, verdict `n/a` |

That is SAGE's reported signature: every store negative, verdicts `n/a`. The real range
(−6.7% … −58.7%) is wider because real sales noise is larger than the simulated ±25% — more noise
in the denominator means a stronger sorting effect, which is exactly the direction this mechanism
predicts.

## Measurement 2 — a KNOWN +10% effect is attenuated to +5.9%

`memory/data/promo-roi-bias-sim-known-effect.mjs`. Same shape, but promo is assigned to days
**independently of sales** (a coin flip), spend is $400 on promo days vs $100 otherwise, and promo
days genuinely sell **10% more**.

| split on | mean measured lift | true | negative | stores scored |
|---|---|---|---|---|
| **`promoPct`** (current) | **+5.86%** | +10.00% | 2/27 | 27 |
| **`promoAmt`** (fix) | **+9.70%** | +10.00% | 0/27 | 16 |

The percentage split **loses 41% of a real effect**. The dollar split recovers it essentially
unbiased.

## The fix

**Split on absolute give-away dollars, not on give-away as a share of sales.** `promoAmt` /
`discAmt` are independent of the outcome; `promoPct` / `discPct` are not.

⚠️ **Both levers are affected**, not just promo — `computePromoDiscountRoi` (`:145-146`) passes
`intensityField:'promoPct'` and `intensityField:'discPct'`, and `discPct` is `disc_amt ÷ sales`
with the identical structure.

⚠️ **Three surfaces consume this**, and all three are wrong today:
1. `src/views/promo-roi.js:77` — the Promo/Discount ROI panel
2. `supabase/functions/sage-chat/index.ts:453` — SAGE's `query_promo_roi` tool (a hand-port of the
   same algorithm; `matchedLift` at `:231` splits identically, so fixing only the client engine
   leaves SAGE broken)
3. `src/engine/promo-roi.js:59` — the shared engine both derive from

### Known trade-off, do not treat as a regression

The dollar split scored **16 of 27** stores versus 27 for the percentage split, because a
median split on lumpier dollar values leaves more day-of-week cells below `minPerCell`. Fewer
stores with a *trustworthy* number beats 27 stores with a biased one, but the drop is real and
should be surfaced in the panel ("n stores had insufficient matched days") rather than silently
shrinking the table.

### What this does NOT establish

- It does **not** say promos are actually paying. The true sign is unknown — the current screen
  simply cannot measure it. Do not invert the conclusion.
- It does **not** validate `minDays=24` / `minPerCell=2`. Those were not tested here.
- The `n/a` verdicts have a second, independent cause worth checking separately: `verdict` is
  `n/a` whenever `extraSpend <= 0`, so if heavy and light days carry similar give-away dollars the
  screen returns `n/a` even with a clean split.

## Why the discount lever came back empty — a different problem

Unrelated to the bias. SAGE's discount lever reads **`ctrl_rows`**, which is a **manual upload**
table. Per the standing auto-first rule, a stalled manual upload is never a data floor — the fix is
to source the discount lever from an auto stream, not to ask for another spreadsheet. Filed here so
the two symptoms are not conflated: the empty lever is a *sourcing* problem, the negative lift is
an *algorithm* problem, and fixing either one alone leaves the screen wrong.

## Reproducing

```
node memory/data/promo-roi-bias-sim-zero-effect.mjs
node memory/data/promo-roi-bias-sim-known-effect.mjs
```

Both use a seeded PRNG and import the real `matchedLift` from `src/engine/promo-roi.js`, so they
re-measure the shipped engine rather than a copy of it. If the engine is fixed, measurement 1's
"27/27 negative" must collapse toward zero — that is the regression bar.

---

## Resolution (2026-08-23)

Fixed at all three named surfaces, exactly the one-field change this finding specified.

### The fix

`src/engine/promo-roi.js`'s `computePromoDiscountRoi()` — the two `intensityField` values changed
from `'promoPct'`/`'discPct'` to `'promoAmt'`/`'discAmt'`. `src/views/promo-roi.js:77` needed **no
edit** — it calls `computePromoDiscountRoi()` without overriding `intensityField`, so it inherits
the fix. `supabase/functions/sage-chat/index.ts`'s hand-ported `matchedLift`/`query_promo_roi` got
the matching edit at its two `int:` assignments (`r.promo_pct` → `r.promo_amt`, `r.disc_pct` →
`r.disc_amt`) — this is a genuinely separate implementation (Deno can't import the client engine
directly), so fixing only the shared engine would have left SAGE giving a different, still-wrong
answer on the same data.

### Measuring the fix, not assuming it

Ran the finding's own committed regression bar against the ACTUAL production entry point
(`computePromoDiscountRoi`), not just the raw `matchedLift` calls the two `memory/data/*.mjs`
scripts make directly — a real gap, since those scripts hardcode `intensityField` and therefore
never exercise `computePromoDiscountRoi`'s own default:

- **Zero-effect construction** (promo dollars held exactly constant): a dollar-based split cannot
  score ANY store here — every day ties at the median, so the strict `>` comparison sends every
  row to "light" and none to "heavy," and the store never reaches `minPerCell`. This is the
  *correct*, honest outcome for this specific synthetic edge case (no real dollar variation exists
  to split on) — not a new bug, and not something the finding's "must collapse toward zero" language
  anticipated, since it was written imagining the percentage split's failure mode, not the dollar
  split's very different one on a constant-spend input. Real promo spend is never perfectly
  constant, so this doesn't affect production data — confirmed by the known-effect measurement
  below, which uses real (coin-flip-assigned) variation and scores real stores.
- **Known +10% effect construction** (seed 7, promo assigned independently of sales, same as
  `memory/data/promo-roi-bias-sim-known-effect.mjs`), run through `computePromoDiscountRoi`
  directly: **mean lift 9.70%** against a true 10.00% (vs the old default's measured 5.86% —
  reproduced first, to confirm the bias is real before trusting the fix), **0/16 stores negative**,
  **16 of 27 candidate stores scored** — matching the finding's own Measurement 2 numbers exactly,
  now reached through the real call site instead of a direct `matchedLift` override.

### The "known trade-off" is now surfaced, not just documented

Added `nCandidates` to `matchedLift()`'s return value (every loc with at least one valid intensity
record, before the `minDays`/`minPerCell` trim) so a caller can show "scored N of M" instead of a
table that silently shrinks. `src/views/promo-roi.js` now renders that note per lever when the
scored count is below the candidate count, and states the dollar-vs-percentage methodology in its
existing footer — both were explicit "should be surfaced, not hidden" asks in this finding.

### Verification

`src/__tests__/promo-roi.test.js` gained a new `describe` block porting this finding's exact
regression bar into the suite (seed 7, same construction as `promo-roi-bias-sim-known-effect.mjs`),
asserted against `computePromoDiscountRoi` — the shipped default — not a direct `matchedLift`
override:
1. The percentage split still attenuates the known effect to ~5.9% (proves the mechanism is real
   and the simulation is faithful).
2. `computePromoDiscountRoi`'s default recovers ~9.7% essentially unbiased, 0 negative stores.
3. The store-count trade-off is real (16 of 27 `nCandidates`) but not a collapse (still > 10).

Confirmed revert-sensitive: temporarily reverted the engine's `intensityField` back to
`'promoPct'` and watched tests 2 and 3 fail with the exact predicted biased numbers (5.86% mean
lift, 27 of 27 scored), then restored the fix and confirmed all 9 tests in the file pass. Full
suite 2135/2135, build clean, no entry-chunk impact.

### Explicitly not done this pass (per the finding's own scoping)

- **The empty discount-lever symptom** — unrelated to this bias; `ctrl_rows` is a manual-upload
  table, a sourcing problem per the standing auto-first rule, not an algorithm fix. Still open.
- **`minDays=24`/`minPerCell=2` were not re-validated** — the finding explicitly said its
  measurements don't establish those thresholds are right, only that the split field was wrong.
- **The `n/a`-verdict-whenever-`extraSpend<=0` behavior** was not investigated — flagged by the
  finding as a second, independent thing worth checking separately.
- **No live-data before/after comparison was run** — this session has no way to pull the live
  `daily_glimpse_daily`/`ctrl_rows` data the real panel and SAGE tool read; the fix is verified
  against the finding's own seeded simulations (which import and exercise the real, unmodified
  engine) rather than against production rows.
