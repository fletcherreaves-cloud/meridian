---
name: dispatch-86
description: True Sum/Sum for ratio metrics. rankPerformers averages daily ratios -- average-of-averages, the thing the standing rule forbids -- and 10 of its 16 metrics are ratios. Deferred from #580 with the owner's "just remember please." Half the work is already done: 5 of the 10 already declare their numerator and denominator in METRIC_SOURCES.derive.inputs. Additive API only; do NOT change metricAvg, it has 70 call sites.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #86 — ratio metrics are averaged, not Σ/Σ

**Reads first:** `memory/dispatch-77.md`'s two deferred sections (the `📌 DEFERRED from #580`
block at the end, and the tolerance-bands block — **that second one is NOT this dispatch**, it is
noted only so you don't fold it in). Then `src/engine/metric-source.js`'s ROLLUP CAVEAT comment at
**`:349-355`**, and the `⚠️ IT IS NOT SATISFIED ACROSS DAYS` block in
`src/engine/top-bottom-performers.js`.

⚠️ Both `dispatch-77.md` and `top-bottom-performers.js` cite that caveat as `:309-315`. **It is at
`:349-355`** — the file grew and the citations didn't. Fix both in this PR. That is the third
stale-reference find in two days (two CLAUDE.md rules on 2026-08-24); if you hit a fourth, say so
rather than just fixing it, because at that point it is a pattern worth a process change.

**Status:** ready to start. **No owner decision blocks Step 1 or 2.** Step 3 has three metrics
whose denominator is genuinely unknown — those are answered by MEASUREMENT, and only escalated if
measurement is ambiguous. Owner-approved as future work 2026-08-23: *"you're recommended fix is
good. We can address the rest later. Just remember please."*

---

## The measurement

`rankPerformers` (`src/engine/top-bottom-performers.js:73`) computes each store's `value` as the
plain mean of its daily values:

```js
const vals = Object.values(series).filter(v => v != null);
const value = n ? vals.reduce((a, b) => a + b, 0) / n : null;
```

For a **count** metric (`sales`, `gc`, `otHrs`) that is correct. For a **ratio** it is an
average-of-averages: a $2,100 Tuesday weighs exactly as much as a $9,400 Saturday. **10 of the 16
metrics in `PERFORMER_METRICS` are ratios** — `tpph`, `avgCheck`, `laborPct`, `cashOSPct`,
`tRedAPct`, `tRedBPct`, `discPct`, `compWaste`, `rawWaste`, `statVar`.

🔴 **The size of the gap was measured in this repo before the panel existed.**
`metric-source.js:349-355`: SPPH on store 5985 for 2026-08 is **$70.18/hr** as mean-of-daily
versus **$67.04/hr** as true Σ/Σ — a **4.5% gap**. That same comment already says the remedy out
loud: *"a consumer that needs a true weighted rollup should sum the parts itself rather than call
`metricAvg`."* The leaderboard **is** that consumer and does not do it.

Consequence today: on those 10 metrics the ranking can mis-order two close stores, and the figure
shown is a daily average rather than the period number a P&L would show. The panel currently
labels it honestly; that label is a mitigation, not the fix.

## ✅ Half of this is already built — measure before you scope

`METRIC_SOURCES` entries already carry a `derive: { inputs: [...], fn }` fallback, and for the
ratio metrics that have one, `inputs` is **already `[numerator, denominator]`** and `fn` is
already `num/den`. Measured 2026-08-24:

| metric | `derive.inputs` | status |
|---|---|---|
| `tpph` | `['gc','actHrs']` | ✅ parts declared |
| `laborPct` | `['laborDollar','sales']` | ✅ parts declared |
| `compWaste` | `['compWasteAmt','prodSalesAmt']` | ✅ parts declared |
| `rawWaste` | `['rawWasteAmt','prodSalesAmt']` | ✅ parts declared |
| `statVar` | `['statVarianceAmt','prodSalesAmt']` | ✅ parts declared |
| `avgCheck` | — | ❌ needs parts (`sales` ÷ `gc`, both already exist as chains) |
| `cashOSPct` | — | ❌ needs parts (`cashOSAmt` exists at `:198`; denominator TBD) |
| `discPct` | — | ❌ **numerator atom missing** — `discAmt` is parsed (`parsers/index.js:485`) but has no `METRIC_SOURCES` chain |
| `tRedAPct` | — | ❌ `tRedACnt` exists at `:242`; **denominator unknown** |
| `tRedBPct` | — | ❌ `tRedBCnt` exists at `:243`; **denominator unknown** |

⚠️ **Do not assume `derive.inputs` is a num/den contract.** Today it is only "inputs to `fn`", and
it happens to be num-then-den in those five. **The counter-example is one file away:**
`DERIVED_METRICS.avgRate` has *three* inputs (`['laborPct','sales','actHrs']`). Read each `fn` and
confirm before relying on the order. Removing that ambiguity is exactly what an explicit `parts:`
field is for.

**`DERIVED_METRICS` is a second map and holds ratios too** — `spph` (`['sales','actHrs']`),
`oppCostPct` (`['oppCostDollar','sales']`), `actVsSched`. The ROLLUP CAVEAT is attached to *that*
map, and SPPH — the metric the 4.5% gap was measured on — lives there, not in `METRIC_SOURCES`.
So `parts:` and `metricRollup()` must work across **both** maps, or the fix misses the one metric
that motivated it. Check how the two maps are merged before assuming a single lookup covers both.

## Step 1 — an explicit parts declaration

Add `parts: { num: '<metricKey>', den: '<metricKey>' }` to the five ratio metrics that already
have the inputs, seeding each from its verified `derive.inputs` pair. `parts` must name **other
`METRIC_SOURCES` keys**, so the numerator and denominator each get the same auto-first,
freshest-wins per-day sourcing the ratio itself gets — not a raw row read (standing rule: source
through the shared helpers, never filter raw rows).

Where `parts` and `derive` both exist they must agree. Assert that in a test rather than trusting
it: for each metric with both, `derive.fn(num, den)` must equal `num/den` on a fixture.

## Step 2 — an additive rollup API

Add to `metric-source.js`:

```js
// True Σnumerator / Σdenominator over the range, per loc. Returns null when the metric has no
// parts: declared -- the caller must fall back deliberately, never silently.
export function metricRollup(ds, locs, range, key)
```

🔴 **DO NOT change `metricAvg`.** It has **70 call sites across 13 files** (`sage.js`,
`store-dash.js`, `analytics.js`, `at-a-glance.js`, `morning-brief.js`, `eom-supervisor.js`,
`signals.js`, `attention-now.js`, `above-store-onepager.js`, `labor-tools.js`,
`one-pager-data.js`, `forecast.js`, `coaching-loop.js`). Changing its semantics silently moves
numbers on tiles nobody in this dispatch is looking at, and there is no way to verify that blast
radius in one PR. `metricAvg`'s docstring is also *correct as written* — it is the right
aggregate for a **rate** read per-day. This is a new, additive function for consumers that need a
period figure.

Days where either part is missing must be dropped from **both** sums, not just the one — a
denominator-only day silently deflates the ratio. Test that case explicitly.

## Step 3 — the three unknown denominators

`cashOSPct`, `tRedAPct`, `tRedBPct`, plus `discPct`'s missing `discAmt` chain.

**Answer these by measurement, not by reasoning about what the name implies.** For each, pull real
rows and check which denominator reproduces the stored percentage:

- reconstruct the ratio candidate-by-candidate (`÷ sales`, `÷ gc`, `÷ transactions`) against the
  `*Pct` value the source already carries, over a real multi-store multi-day window;
- the right denominator is the one that reproduces the stored `*Pct` to within rounding, on every
  store, not on average.

If two candidates both fit, or none does, **stop and ask the owner** — do not pick the plausible
one. A wrong denominator here is invisible: the number stays in a believable range and only the
ordering is wrong. That is precisely the failure this dispatch exists to remove, so shipping a
guessed one would be worse than leaving the metric on mean-of-daily with its honest label.

`discAmt` needs a `METRIC_SOURCES` chain added before `discPct` can get `parts` at all. It is
parsed today (`parsers/index.js:485`, `ctrlRows`) but never chained.

## Step 4 — migrate the leaderboard, and only the leaderboard

Switch `rankPerformers` to `metricRollup` **for metrics that have `parts`**, keeping mean-of-daily
for those that don't, and label the two cases differently in the UI so a reader can tell a period
figure from a daily average. Update the `⚠️ IT IS NOT SATISFIED ACROSS DAYS` comment block to say
what is now true — and if some metrics are still on mean-of-daily, say **which**, by name.

Other `metricAvg` consumers are explicitly **out of scope**. Note in the commit body which ones
would benefit, so a later dispatch has somewhere to start.

## Verification bar

Revert-sensitive, and it must touch the **call site**:

1. **The arithmetic actually differs.** A fixture with genuinely uneven daily volume where Σ/Σ and
   mean-of-daily give **different** answers, and the assertion pins the Σ/Σ one. A fixture with
   flat volume passes under both and proves nothing — the SPPH case ($70.18 vs $67.04) is the
   shape to copy.
2. **The ordering actually flips.** Two stores that rank one way under mean-of-daily and the other
   way under Σ/Σ, asserted through `rankPerformers`, not through `metricRollup` alone. An
   engine-only test passes with the panel's wiring deleted.
3. **Partial days are dropped from both sums**, asserted directly.
4. **`parts` and `derive` agree** for every metric declaring both.
5. **`metricAvg` is untouched** — assert its output is byte-identical on a fixture, so a later
   refactor can't quietly absorb it.

## Do NOT

- Do **not** change `metricAvg`, or "unify" it with `metricRollup`. See Step 2.
- Do **not** guess a denominator in Step 3. Measure, or ask.
- Do **not** widen this into the tolerance-bands work in `dispatch-77.md` — that one needs an
  owner conversation first and is deliberately separate.
- Do **not** migrate the other 70 `metricAvg` call sites. Name them in the commit body instead.
- Do **not** hand-verify that a `parts:` declaration is right. A field nothing reads is a field
  nothing checks — the same rot as the inert `section:` fields (25 of 82 panels), the 24 dead
  `tol:` values in `store-dash.js`, and #52's 15 schema-drift columns. Every `parts:` entry needs
  a test that exercises it.
