---
name: dispatch-86
description: ✅ SHIPPED 2026-08-24 as PR #628 — do NOT re-dispatch. Resolution is written into memory/dispatch-77.md, not this file. Original brief: True Sum/Sum for ratio metrics. rankPerformers averages daily ratios -- average-of-averages, the thing the standing rule forbids -- and 10 of its 16 metrics are ratios. Deferred from #580 with the owner's "just remember please." Half the work is already done: 5 of the 10 already declare their numerator and denominator in METRIC_SOURCES.derive.inputs. Additive API only; do NOT change metricAvg, it has 70 call sites.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #86 — ratio metrics are averaged, not Σ/Σ

> ## ✅ SHIPPED — do not re-dispatch this file
>
> Delivered 2026-08-24 as **PR #628** (`8582659` on `main`), and the engineer wrote the
> **Resolution into `memory/dispatch-77.md`**, not here — #86 was merged (#627) after the work
> had already started off #77's deferred section. Read #77's Resolution for what actually
> shipped; everything below this banner is the original brief, kept for the measurements and the
> reasoning, not as open work.
>
> What landed: `derive.kind:'ratio'` as a curated marker, `metricSumRatio()`, `rankPerformers`
> adopting Σ/Σ as a whole-ranking switch, and three new numerator/denominator chains
> (`netSalesAmt`, `discAmt`, `tRedAAmt`/`tRedBAmt`). `metricAvg` untouched, as instructed.
>
> **Step 3's escalation was not needed.** The three "unknown denominators" turned out to be
> knowable without a guess: `loadOpsCashSheet` already divided `discount_amt`,
> `treds_before_amt`, `treds_after_amt` and `cash_over_or_short` by `net_sales_amt` inline, so
> the new derives reuse the *identical* numerator and denominator and are equal to the stored
> percentages by construction — a stronger result than the "reproduce the stored %" bar this
> dispatch set.
>
> **One thing this dispatch did NOT anticipate, still open — see `## PM verification` at the
> bottom of this file: `avgCheck`'s new derive uses a different sales basis than the sources it
> backs up.**

**Reads first:** `memory/dispatch-77.md`'s two deferred sections (the `📌 DEFERRED from #580`
block at the end, and the tolerance-bands block — **that second one is NOT this dispatch**, it is
noted only so you don't fold it in). Then `src/engine/metric-source.js`'s **`⚠️ ROLLUP CAVEAT`**
comment (sits directly above `DERIVED_METRICS` — grep the phrase, do not trust a line number), and
the `⚠️ IT IS NOT SATISFIED ACROSS DAYS` block in `src/engine/top-bottom-performers.js`.

⚠️ **This paragraph originally chased that caveat's line number and lost.** It said the cite in
`dispatch-77.md` and `top-bottom-performers.js` was wrong at `:309-315` and the truth was
`:349-355`. Then #628 added ~10 lines above it and `:349-355` was wrong too, within hours of being
written. The lesson is not "fix the number again" — it is **cite an anchor, never a line number**
(see the rule now in CLAUDE.md). Both original cites are converted to the anchor form.

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
`metric-source.js`'s `⚠️ ROLLUP CAVEAT`: SPPH on store 5985 for 2026-08 is **$70.18/hr** as mean-of-daily
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

---

## PM verification (2026-08-24, post-merge of #628)

Verified against the merged tree at `8582659`, not the summary: suite **2189/2189**, build clean
(518.32 KB gzip eager, 850 KB budget). `metricAvg`'s body is byte-identical — the DO NOT held.
`rankPerformers`'s whole-ranking switch is implemented as specified: Σ/Σ is adopted only when
`sumRows.every(r => r != null)`, so a ranking never mixes bases.

**The three unknown denominators were resolved correctly, and better than this dispatch asked
for.** `supabase.js:2373-2384` already computed `discPct`/`tRedAPct`/`tRedBPct`/`cashOSPct` as
`<amt> ÷ net_sales_amt` inline; the new chains alias those exact raw columns, so the derives are
identical to the stored percentages by construction rather than merely reproducing them. No guess
was made and no escalation was needed.

### 🔎 A false alarm worth recording, because the instrument lied convincingly

Probing live Supabase with the anon key, `select=net_sales_amt` on `qsr_cash_sheet` returned
**`42703 column does not exist`** — which reads as "the entire Σ/Σ fix is built on a column that
isn't there." It is not. `qsr_cash_sheet` is `(loc, dt, metrics jsonb, updated_at)`
(`schema.sql:1536`) and `_loadOpsTable` spreads `...(r.metrics || {})` onto every row, so the
dollar fields are **JSONB keys**, not SQL columns. The probe was calibrated first (a real column
times out under RLS, a fake one returns 42703), which is what made the false reading credible.
**Calibrating the instrument is not the same as pointing it at the right layer** — worth
remembering the next time a live probe contradicts working code.

### ✅ CLOSED 2026-08-24 by measurement — not material. (Original finding below, kept for the reasoning.)

**Resolution first, so nobody re-opens it from the analysis that follows.** Measured with the
service-role key, owner-run: over a 60-day window, `avgCheck`'s precomputed sources cover **every**
store-day, so #628's derive is a true last-resort that **effectively never fires in production**.
No derive, no basis mixing, no ranking risk.

| source (chain order) | store-days with a non-zero `avg_check` |
|---|---|
| `daily_glimpse_daily` | **0** of 1,431 ⬅ dead column, see below |
| `cash_sheet_daily` | 1,350 |
| `sales_ledger_daily` | **1,431 of 1,431** |

The chain is `glimpse → cash → salesLedger → labor`, all `mode:'pos'`, so glimpse's zeros are
rejected and `cash`/`salesLedger` answer every day between them. **The `$0.3154` gap measured
below is real but irrelevant to `avgCheck` as displayed**, because the value shown never comes from
the product-sales-based derive.

**What I got wrong, and how:** the finding below is structurally correct — the two bases genuinely
differ, and the same PR did decline to use `sales` elsewhere on those grounds. But it rested on an
unstated premise: *that the derive fills real days.* I never checked coverage, because I could not
— the anon key returned zero rows. The structural argument was sound and the conclusion was still
wrong, which is the exact shape CLAUDE.md's *measure it, don't reason about it* rule warns about.
**Do not act on the finding below.**

### 🟡 Low-severity, genuinely open: `daily_glimpse_daily.avg_check` is a dead column

Zero — not null, zero — across every store-day measured, confirmed two independent ways (an inner
join against the DAR averaged `0.00` over 1,350 store-days; the coverage count above found 0
non-zero of 1,431). Most likely the parser maps a field the emailed report does not actually carry.

**Impact is a dead column, not a wrong number.** `mode:'pos'` rejects the zeros correctly, and
**no consumer reads `glimpseRows.avgCheck` directly** — grepped; the only reference outside tests
and changelogs is `METRIC_SOURCES` itself. Downstream panels read `p.avgCheck` off computed period
objects and all guard with `> 0`.

**Leave the chain entry in place** — it costs nothing and picks the source up automatically if the
report ever starts carrying it. Worth one look at the parser mapping if anyone is in that file
anyway; not worth a dispatch on its own.

⚠️ Unrelated but noticed while grepping: `store-analytics.js` falls back to **hardcoded `9.50` /
`8.50`** when `avgCheck` is 0. Pre-existing, unrelated to any of this, and not touched — recorded
only so the next person to find those magic numbers knows they were seen and deliberately left.

### Original finding (superseded by the measurement above)

`avgCheck` gained `derive: { inputs: ['sales','gc'], kind:'ratio' }`. The `sales` key resolves
`qsrActSummaryRows.sales`, which is **`product_sales`** (`supabase.js:2025`). The four precomputed
sources it backs up (`glimpseRows`/`cashRows`/`salesLedgerRows`/`laborRows`) carry an avg check
computed on **all-net-sales** (`glimpseRows.avgCheck` ← `daily_glimpse_daily.avg_check`, alongside
`all_net_sales`). Product sales and all-net-sales are different bases.

Derives are gap-fill only (`if (into[dk] != null) continue`), so no single day is wrong — but
**across a period the series can mix the two bases**, day by day, depending on which days a
precomputed source covers. That is a smaller version of exactly the trap the same PR carefully
avoided for the controls metrics, where it declined to use `sales` on the stated grounds that it
is "DAR product sales, a DIFFERENT basis." The reasoning was right there and was not applied here.

Two things make it worth attention rather than a shrug:

1. **It is already live everywhere**, not just on the leaderboard. `golden-dataset.test.js`'s
   `metricAvg` snapshot moved `avgCheck` from `null` to `10.7456`, so every one of the ~70
   `metricAvg` call sites that reads `avgCheck` now gets a value where it previously got nothing.
2. **A basis wobble of a few percent on a ~$10.75 check is ~$0.30**, which is the order of
   magnitude that flips two close stores in a leaderboard — the precise failure this whole
   workstream exists to remove.

**Not fixed here, deliberately.** The clean fix is a net-sales numerator, which means widening
`netSalesAmt`'s chain beyond `opsCashRows` (`glimpseRows.allNetSales` is the obvious candidate) —
and that also changes the denominator coverage of the four controls derives. That is a design
call with a blast radius, not a 1am edit. **Options:** widen `netSalesAmt` and repoint
`avgCheck`; or leave the derive and document the basis mix in the code the way `compWaste`'s
secondary imperfection already is. Owner/engineer's call.

⚠️ Unmeasured: I could not size the actual product-sales-vs-net-sales gap from this environment
(anon key gets zero rows under RLS). The $0.30 figure above is an order-of-magnitude estimate from
a few-percent basis difference, **not a measurement** — measure it before deciding how urgent this
is.

### Fourth stale reference in two days

This dispatch asked the engineer to flag a fourth rather than silently fix it. Here it is:
`loadOpsCashSheet`'s header comment said *"T-Red % denominators are left for a reconciliation
pass"* — true when written, false since #37 added them on the same `net_sales_amt` denominator as
`discPct`. Corrected in the same commit as this note.

**That is five in two days** (two CLAUDE.md rules in #626; the `:309-315` caveat cite in #627;
`loadOpsCashSheet`'s T-Red header in #629; and then #627's own replacement cite `:349-355`, which
#628 invalidated within hours by adding ~10 lines above it). They share one shape: a claim that
was accurate when written, describing code a later change moved, with nothing tying the two
together.

**The fifth settles what the fix is, and it is not an audit.** A sweep would re-rot: there are
**589 `file:NNN` citations** in this repo (522 in `memory/`, 67 in `src/` comments), and correcting
them by hand produces new numbers that the next PR invalidates — exactly what happened between
#627 and #628. The answer is to stop citing line numbers at all: **cite an anchor** (a symbol name,
or a quoted unique phrase from the comment) which survives edits and is greppable. Rule added to
CLAUDE.md, and the active dispatch files converted, in dispatch #87. The ~500 historical cites are
left alone as archive.
