---
name: dispatch-77
description: Notes 68 slice 1 - metric direction (lowerBetter) is declared at least four separate times across two flag names, and three metrics contradict each other, one of them inside a single file. Adjudicate the contradictions with the owner, encode direction once, then build Top/Bottom Performers on top of it.
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #77 — direction is declared four times and disagrees with itself. Fix that before any leaderboard.

**Status:** ready to start, with **one owner decision inside it** (see Step 1). Slice 1 of Notes 68.
**Reads:** `memory/notes-68-entity-explorer.md`.

---

## Why this is the first slice

The owner asked for *"the ability to search all data and metrics for top performers and bottom
performers."* A leaderboard needs to know which direction is good — lower OEPE, higher sales. That
answer does not exist in one place, and where it does exist it disagrees.

## The measurement

`grep -rn "lowerBetter" src/ --include=*.js` (excluding tests) → **86 occurrences.** Direction is
**declared** in at least four independent metric tables, under **two different flag names**:

| Where | Shape | Metrics |
|---|---|---|
| `src/views/store-dash.js:2614-2641` | `lowerBetter` | ~23 |
| `src/views/analytics.js:300-327` | `lowerBetter` | ~10 |
| `src/views/analytics.js:7687-7702` | `lowerBetter` | ~16 target keys |
| `src/engine/one-pager-data.js:404-409` | `lowerBetter` | 4 |
| `src/views/store-dash.js:2223-2230` | ⚠️ **`higherBetter`** (the inverse flag) | several |

Consumed in more places again: `above-store-onepager.js` (`printBadge`/`badge`),
`analytics.js:1090/2297/7476`, `store-dash.js:1756/2832/2907`, `one-pager.js:346/390`,
`engine/smart-targets-model.js`, `utils/stats.js:53` (`bestQuartile`).

**Meanwhile `METRIC_SOURCES` (59 keys, `src/engine/metric-source.js`) — the registry that already
resolves every one of these metrics — encodes no direction at all.**

## 🔴 Three metrics contradict each other

| Metric | Declaration | Says |
|---|---|---|
| **Labor %** | `store-dash.js:2620` `lowerBetter:true` | lower is better |
| | `store-dash.js:2223` `higherBetter:false` | lower is better (agrees) |
| | `analytics.js:309` `lowerBetter:false` | **higher is better** |
| **R2P** | `analytics.js:306` `lowerBetter:true` | faster is better |
| | `store-dash.js:2229` label *"R2P (lower=better)"*, `higherBetter:false` | faster is better |
| | `store-dash.js:2617` `lowerBetter:false` | **slower is better** |
| **Discount %** | `store-dash.js:2632` `lowerBetter:true` | lower is better |
| | `store-dash.js:2230` `higherBetter:false` | lower is better (agrees) |
| | `analytics.js:324` `lowerBetter:false` | **higher is better** |

⚠️ **These are contradictions, NOT confirmed bugs. Do not "fix" them on this dispatch's say-so.**
Per the standing rule that a reviewer's root cause is a hypothesis until reproduced — including
this PM's — two of the three have a plausible innocent reading:

- ~~**Labor % in `analytics.js:309` may be deliberate.**~~ ✅ **RESOLVED — see OWNER RULING below.
  It is wrong.** Kept for the record of what was considered: its `action`/`note` fields argue labor
  is genuinely two-sided (*"too lean hurts service quality; too heavy compresses margin"*), which
  read as a plausible editorial stance rather than a typo. The owner overrode that reading.
- **Discount % is arguable** the same way — discounts drive traffic.
- **R2P is the hard one to defend.** `store-dash` contradicts *itself*, and the sibling entry's
  own label says *"lower=better"*. Still: reproduce what each site renders before changing either.

📌 **What is NOT in doubt:** whatever the right answers are, they cannot be right in two places at
once. Today two panels can color the same store's Labor % green and red simultaneously. Worth
checking whether they visibly do — that is a one-screenshot question and it belongs in the report.

## ✅ OWNER RULING — 2026-08-23 (supersedes the "may be deliberate" caveat above)

**Labor % is lower-better. At/below target is good; over target is bad.** Owner, verbatim:

> *"at the time, and for reasons of context, it may have been thought to be right. Regardless,
> labor has a target, for simplification, at/below is good and over is bad."*

So `analytics.js:309` (`lowerBetter:false`) **is wrong** and there is **no two-sided third state**
for labor. The `action`/`note` text there stays — the nuance it describes is real and worth keeping
as prose — but it does not change the metric's direction.

📌 **The owner's principle generalises: direction is simple and target-relative.** Applying it to
the other two contradictions (both have targets in `DEFAULT_TARGETS`):

| Metric | Target key | Resolution | Wrong site |
|---|---|---|---|
| Labor % | `tLabor` | **lower-better** (owner-ruled) | `analytics.js:309` |
| R2P | `tR2p` | **lower-better** (proposed) | `store-dash.js:2617` |
| Discount % | `tDiscCoupPct` | **lower-better** (owner-ruled 2026-08-23) | `analytics.js:324` |

✅ **Labor % and Discount % are both owner-ruled** (Discount confirmed 2026-08-23: *"discount -
lower is better"*). **R2P is this dispatch applying the same principle**, but independently
corroborated twice over: `metric-source.js:75-77` derives it as
`(fc_untilserve − fc_untilclosedrawer) ÷ fc_trans_cnt`, i.e. **seconds per transaction**, and the
sibling entry `store-dash.js:2229` is literally labelled *"R2P (lower=better)"*. Treat R2P as
settled unless the measurement in step 1 contradicts it.

⚠️ **Not every metric is lower-better.** Sales, guest count, TPPH, avg check and KVS-healthy are
at-or-**above**-target. The ruling settles the cost/speed family; the full step-1 table below is
still required for the rest.

## Step 1 — adjudicate the remainder

Produce a table of every metric declared in more than one place with each declaration's direction,
flag name, and file:line. Mark the ones that disagree. **Take any further disagreements to the
owner** — the three known ones are settled above. ❌ **A two-sided third state is NOT needed:** the
owner ruled for simple target-relative direction (*"for simplification"*), and the nuance that
motivated it belongs in tolerance bands (see below), not in the direction field. Do not guess; do
not let a leaderboard ship a ranking the owner disagrees with.

## Step 2 — encode it once

Add direction to **`METRIC_SOURCES`** in `src/engine/metric-source.js` — the registry that already
owns per-metric resolution, so direction lives beside the thing it describes. One field, three
states, explicit; no `higherBetter` inverse anywhere.

⚠️ **Guard it the way `METRIC_SOURCES` is already guarded.** `src/__tests__/metric-chains.test.js`
exists because that registry drifted from reality **four times in one day**. A direction field
nothing checks is the same rot as the inert `section:` fields (25 of 82 panels) and #52's 15
schema-drift columns. Minimum bar: a test asserting every metric a *ranking* can be built on has a
direction, and that no metric declares one direction in the registry and the opposite in a panel
table still carrying its own.

⚠️ **Migration is explicitly NOT required in this dispatch.** Four tables and ~86 sites is a
separate change. State plainly in the PR which tables were left alone and why. What must not happen
is a *fifth* declaration site.

## Step 3 — Top/Bottom Performers

Only now. Pick metric → scope (All / State / Org / Patch / Store, the standing pill hierarchy) →
window → ranked list, best and worst ends.

Reuses what exists — do not rebuild: `metricDaily`/`metricSeries`/`metricAvg` for auto-first
sourcing, `vs-ly.js` for comparison basis, `Bar` (`src/views/visit-readiness.js:121`) for the house
bar style.

🔴 **The hard part is honesty, not ranking.** Every one of these is already a standing rule and each
one silently corrupts a leaderboard:
- **Count-completeness.** Never rank a store with 3 days of data against one with 90. The DAR needs
  `count(hour_slot)` checked per `(loc,dt)` — a short day understates a denominator and inflates
  every ratio above it.
- **Dollar-weight aggregates; never average averages.** A patch's FOB% is Σ$/Σsales, not the mean of
  its stores' percentages.
- **Show `n` on every row.** Same discipline as dispatch #75's thin-cell floor.
- **Do not rank on a metric the registry marks two-sided** (if step 1 creates that state).

## Placement

New panel, `kind:'test-kitchen'`, and **give it its real `section:` from day one** per the standing
rule. Do NOT put it inside the Security panel: that is `perm:'security.view'`
(`src/app/panel-registry.js:148`), and a general analytics leaderboard must not inherit a
loss-prevention permission. The owner's "extend" answer is read as *reuse the SubjectRow pattern*,
not *live in that panel* — confirmed with him 2026-08-23.

## Verification bar

Revert-sensitive, and it must touch the **call site**, not just the engine: render the actual panel
and assert a ranking flips end-for-end between a lower-better and a higher-better metric. An engine-
only test passes with the panel's wiring deleted. Include a fixture where one store has a short
window and assert it is excluded or marked, not silently ranked.

## Do NOT

- ⚠️ Do not add a charting library. `chart.js@4.5.1` is declared, 6.3 MB installed, imported
  **nowhere**, and in **zero** built chunks — a dead dependency. Slice 1 is bars and a table.
  Whether to use it or delete it is a separate decision, deliberately deferred to the first slice
  that needs a real chart.
- ⚠️ Do not migrate the four existing tables (see Step 2).
- ⚠️ Do not build any person-scoped ranking. Attribution-confidence is unbuilt and register logins
  do not reliably match punch times — see `memory/notes-68-entity-explorer.md`.

---

## 📌 Deferred, owner-raised 2026-08-23 — tolerance bands (NOT this dispatch)

Owner, same message:

> *"Now, a different conversation could be had about using tolerance bands around the metrics at
> some point. Useful overall and plays into performance review system."*

**Filed as its own future item — deliberately kept out of #77** so the direction fix stays small.
One measurement worth carrying into that conversation, found while scoping this dispatch:

🔴 **A per-metric tolerance already exists and is completely dead.** `src/views/store-dash.js:2614-
2641` declares `tol:` on **24 of its metrics** (`tol:.02` on Labor, `tol:5` on R2P, `tol:.01`,
`tol:500`, `tol:.25`, …). `grep -rnE "\.tol\b" src/` finds **zero** reads of it anywhere in the
app — the only `.tol` hits are unrelated `ctx.params.tol` in `eom-diagnosis.js`.

So someone already authored two dozen tolerance values against real metrics and never wired them
up. When the tolerance-band conversation happens, **start by reading those**: prior art from
whoever set the targets, not a blank sheet. ⚠️ And verify them before trusting them — a field
nothing reads is a field nothing checks, the same rot as the inert `section:` fields (25 of 82
panels) and #52's 15 schema-drift columns. Dead declarations drift silently.

Natural home: alongside direction in `METRIC_SOURCES`, so target + direction + tolerance sit
together. That argues for doing tolerance *soon after* #77 while the registry work is fresh — but
it is still a separate change with its own owner conversation.

---

## Resolution (2026-08-23)

### Step 1 — adjudication

**All three named contradictions resolve as lower-better, owner-ruled, no two-sided third state.**
Labor % was already ruled in this doc. Discount % was upgraded from "proposed" to a full owner
ruling mid-dispatch: *"Discount % is owner-ruled lower-better as well (confirmed 2026-08-23) …
All three contradictions — Labor %, R2P, Discount % — resolve as lower-better."* R2P stays
independently corroborated by `metric-source.js` deriving it as seconds/transaction and by its own
sibling table's *"R2P (lower=better)"* label.

Fixed the three wrong sites, `action`/`note` prose left untouched per the dispatch's own
instruction:
- `analytics.js` `CORR_PREDICTORS`, `id:'labor'`: `lowerBetter:false` → `true`.
- `analytics.js` `CORR_PREDICTORS`, `id:'discPct'`: `lowerBetter:false` → `true`.
- `store-dash.js` `METRICS` (svc/labor/fob table), `id:'r2p'`: `lowerBetter:false` → `true`.

**A research sweep of the actual declaration sites found more than the dispatch named** —
consistent with "measure, don't reason," the full picture required reading every site rather than
trusting the dispatch's own count:

| Site | Shape | Notes |
|---|---|---|
| `store-dash.js` `METRICS` (:2614-2644, the `tol:`-bearing table) | `lowerBetter` | the 3 fixes above landed here |
| `store-dash.js` `RankingView`'s own local `METRICS` (:2215-2233) | `higherBetter` | **already correct** for all three metrics by inspection — not a 5th disagreement, a 5th *site*, already consistent |
| `analytics.js` `CORR_PREDICTORS` (:299-330) | `lowerBetter` | the 3 fixes above landed here too |
| `analytics.js` target table (:7686-7702) | `lowerBetter` | already agrees (`tDiscCoupPct:true` etc.) — not touched |
| `store-analytics.js` (:2430-2438) | `higherBetter` as `true`/`false`/**`'range'`**/**`'target'`** (non-boolean sentinels) | a third encoding style — "no fixed direction" / "target-relative", consumed by `getBest()` at :2440; not touched |
| `at-a-glance.js` (:1453-1470) | `higherBetter` | ad-hoc, already agrees; not touched |
| `bullseye-tile.js` (:79-97) | `higherBetter` | ad-hoc, already agrees; not touched |
| `above-store-onepager.js` `printOnePager()` | hardcoded `true`/`false` **literals per `printRow()` call**, not read off any table | a 6th, effectively-independent site — can drift silently but is currently consistent by inspection; not touched, consistent with "migration not required" |

**A genuine, previously-unnamed conflict, resolved without guessing: `park`.** Two of four sites
declare it lower-better; two (`store-dash.js`'s `higherBetter:null`, `store-analytics.js`'s
`'range'` sentinel) already say it has no fixed direction. This is not a coin-flip: **`park` was
already removed from readiness scoring** (`engine/pipeline.js`, #181, 2026-08-11) after a real
27-store quadrant measurement (park% × OEPE) found the district's heaviest parkers (Elgin 30.5%,
Ponce de Leon 33.6%) also beat the median on flow — refuting a single-axis "less parking is always
better" read (`engine/park-oepe-quadrant.js`). `direction` for `park` is left **unset**, not
guessed, and documented inline in `metric-source.js` citing that measurement.

**Owner-confirmed 2026-08-23** this is the right call, and explains *why* the quadrant finding and
the two no-fixed-direction sites agree: McDonald's official target is a **12-16% band**, not a
one-sided threshold. Verbatim: *"generally at or near target on either side is viewed as healthy.
Too low, not good — not moving cars at the DT present window, equates to slower service. Too much
can be viewed as operations issues with getting food ready or struggling to move cars (could be
staffing, lack of manager floor control, or any number of other issues)."* And on scope:
*"it has been covered before and I don't want to introduce yet another method"* — so park stays
excluded from Top/Bottom Performers rather than getting a bespoke band-aware ranking built here; a
range/target-relative treatment already exists (`store-analytics.js`'s `'range'` sentinel) for
whatever future work wants it. Comment in `metric-source.js` updated with the owner's exact words
so a future session doesn't have to re-derive why this one is different from a plain lower/higher
metric.

**One more left deliberately unset: `actVsNeed`.** A signed hour gap (actual − needed), not a
monotone quantity — the file's own existing comment says both overstaffed and understaffed are
worth seeing, and "closer to zero" isn't lower/higher. Its one declaring site (`store-dash.js`,
`lowerBetter:false`) isn't corroborated anywhere else, so it wasn't carried forward.

**Correction to this dispatch's own "Do NOT" section: the chart.js claim is false.** It states
"`chart.js@4.5.1` is declared, 6.3 MB installed, imported nowhere, and in zero built chunks — a
dead dependency." Verified (per the standing "a reviewer's root cause is a hypothesis until
reproduced" rule) and found **not dead**: `chart.js/auto` is imported in both
`src/views/store-dash.js:3` and `src/views/dt-speedofservice.js:3`, wired through a shared
`useChart(canvasRef, buildFn, deps)` hook, with 8 live `new Chart(...)`/`useChart(...)` call sites.
The dispatch's own suggested grep (`from 'chart.js'`) misses the `/auto` subpath the code actually
uses. **Chart.js was not touched.** Step 3 still didn't need it — bars + a table, per the dispatch.

### Step 2 — `direction` in `METRIC_SOURCES`

Added a `direction: 'lower' | 'higher'` field (omitted when undecided — a real two-state field, not
a third sentinel value) to exactly **16 of 59** `METRIC_SOURCES` keys — only the ones with a clear,
traceable correspondence to an already-declared table entry, so this doesn't invent a judgment call
the dispatch's own "do not guess" instruction forbids:

- `direction:'higher'` — `sales`, `gc`, `tpph`, `avgCheck`
- `direction:'lower'` — `oepe`, `kvst`, `r2p`, `laborPct`, `otHrs`, `cashOSPct`, `tRedAPct`,
  `tRedBPct`, `discPct`, `compWaste`, `rawWaste`, `statVar`

`park` and `actVsNeed` are deliberately excluded (above). Everything else (count/amount-only
fields, LifeLenz schedule chains, derived opportunity-cost/SPPH metrics, etc.) has no traceable
direction declaration anywhere in the app and was left alone rather than guessed.

Two new exported helpers: `metricDirection(key)` → `'lower'|'higher'|null`, and
`rankableMetricKeys()` → every key with a resolved direction. `null` means genuinely undecided, and
callers must treat it as **not rankable**, never a default guess.

**Guard test:** `src/__tests__/metric-direction.test.js`, mirroring `metric-chains.test.js`'s own
idiom (read real panel source text, collect every violation into one array, assert empty).
Confirmed revert-sensitive: reverting the 3 value fixes made exactly the predicted 2 tests fail,
with the exact predicted violation messages; restored and reconfirmed green.

Migration of the 4 pre-existing panel-side tables (~86 sites) is explicitly out of scope, per the
dispatch. No fifth (or ninth, counting the sites found above) declaration site was added — every
new consumer (Step 3) reads direction through `metricDirection()`, never a fresh literal.

### Step 3 — Top/Bottom Performers

New files:
- `src/engine/top-bottom-performers.js` — `rankPerformers(ds, {metricKey, locs, range})`, pure.
  Ranks **individual stores only** — never rolls multiple stores into one number — which satisfies
  "never average averages / dollar-weight aggregates" **by construction** rather than needing a
  generic weighted aggregator: there is no cross-store rollup anywhere in this file for that rule
  to apply to. Also exports `PERFORMER_METRICS`, the display/label list for exactly the 16
  rankable keys.
- `src/views/top-bottom-performers.js` — `TopBottomPerformers` panel: metric picker → scope
  (`LocationSelector`, `components/PanelControls.js`'s existing All→State→Patch→Store pill
  component, reused not rebuilt) → window preset → ranked list. Reuses `metricSeries` (auto-first
  sourcing) and `Bar` (`visit-readiness.js:121`, now exported for this reuse) for the house meter
  style, per the dispatch's explicit "reuse what exists."

**Count-completeness guard:** a store whose covered-day count `n` is under half the
best-covered store's `n` **in the same ranking** is separated into a distinct "Insufficient data"
list, never blended into the ranked competition — satisfies "never rank a store with 3 days against
one with 90" without silently dropping the store from view entirely. This floor is **structural,
not measured** — documented as such in the engine file's own comment, unlike
`visit-readiness.js`'s `CHANNEL_YEAR_MIN_N` (a break measured in a real distribution): there is no
equivalent distribution to measure for an arbitrary metric/scope/window combination, so a relative
floor is stated as a floor, not dressed up as a finding.

**`n` shown on every ranked row.** A metric the registry can't resolve a direction for is not
offered in the metric picker at all (`PERFORMER_METRICS` only lists rankable keys).

**Placement:** `kind:'test-kitchen'`, `section:'analytics'`, `perm:'analytics.district'` (the
`district-lens` precedent) — explicitly not `security.view`. Wired via `lazyPanel()` in `App.js`
(own dynamic import, own chunk — 6.11 kB / 2.45 kB gzip built). Per dispatch #61 (already landed
before this dispatch, confirmed by reading `shell.js` rather than trusting this doc's own earlier,
now-stale "promotion is two edits" warning above), Test Kitchen membership derives from
`kind:'test-kitchen'` automatically — no `navPBeta('id')` line to hand-add in `shell.js`.

**Verification bar met:** `src/__tests__/top-bottom-performers-panel.test.js` renders the actual
`TopBottomPerformers` consumer (not `rankPerformers()` directly). Fixture: Store A high-sales/
high-labor%, Store B low-sales/low-labor%, Store C one day of data with a deliberately extreme
sales value that would rank #1 if it leaked into the list. Three tests: sales (higher-better) ranks
A before B; clicking the Labor % button (lower-better) flips the order to B before A — end-for-end,
confirmed revert-sensitive by injecting a direction-ignoring sort and watching exactly that one
test fail; and C never appears among ranked rows, only in the separate "Insufficient data" section.
Row assertions key off a `data-loc` attribute on each ranked row rather than raw `textContent`
ordering, after discovering the scope picker's own store pills (sorted numerically, metric-
independent) collide with a naive substring search and mask a real ordering bug.

### Ratchets updated (not drift)

Adding a real new panel moved two pre-existing census pins in `shell-nav-snapshot.test.js`:
Test Kitchen census 11→12, and the `analytics.district`/`analytics.store` `HIDDEN_WHEN_DENIED`
sets (Top/Bottom Performers added under district; `🏆` dropped from the store-denial set because
it's no longer uniquely owned by store-permissioned panels — Rankings/Record Days share it with
the new district-permissioned panel, so denying only `analytics.store` no longer removes every 🏆
node from the DOM). Both changes are commented in place with the reasoning.

### Verification

`npx vitest run`: 2095/2095 passing. `npm run build`: clean; entry-chunk eager payload 517.17 KB
gzip (budget 850 KB, 332.83 KB headroom) — the new panel is fully lazy and does not touch the
entry chunk.

### What was deliberately NOT done

- No chart.js changes (the claim was false — see above).
- No migration of the 4 pre-existing direction tables / ~86 sites.
- No person-scoped ranking (attribution-confidence is unbuilt, per the dispatch).
- No tolerance-band work (filed above as a separate future item, untouched).

---

## 📌 DEFERRED from #580, owner-approved 2026-08-23 — ratio metrics are averaged, not Σ/Σ

Owner: *"you're recommended fix is good. We can address the rest later. Just remember please."*
Recorded here so "later" has something to find.

**What shipped in #580:** `rankPerformers` (`src/engine/top-bottom-performers.js`) computes each
store's `value` as the plain **mean of its daily values**. For count metrics (sales, gc, OT hours)
that is correct. For **ratios it is an average-of-averages** — the thing the standing rule forbids.

**10 of the 16 metrics the panel offers are ratios:** `tpph`, `avgCheck`, `laborPct`, `cashOSPct`,
`tRedAPct`, `tRedBPct`, `discPct`, `compWaste`, `rawWaste`, `statVar`.

🔴 **The gap is already measured in this repo, by someone else, before #580 existed.**
`src/engine/metric-source.js:309-315`: SPPH on store 5985 for 2026-08 is **$70.18/hr** as
mean-of-daily versus **$67.04/hr** as Σ/Σ — a **4.5%** gap. That same comment says outright:
*"a consumer that needs a true weighted rollup should sum the parts itself rather than call
metricAvg."* The Top/Bottom Performers panel **is** that consumer.

**What #580 fixed (the agreed minimal fix):** the file claimed the rule was *"satisfied BY
CONSTRUCTION… no aggregate to get wrong"* — true cross-store, false across-days. That claim was
corrected and scoped, and the displayed figure labelled as a daily average. ⚠️ The comment was the
more dangerous half: a confident guarantee stops the next reader from checking.

**What is still open:** true Σ/Σ for ratio metrics. Not bolted on because `metricSeries` returns
the ratio, **not its numerator and denominator** — so this needs either a parts-returning variant
or per-metric numerator/denominator declarations in `METRIC_SOURCES`. Real work, and it would
serve every consumer of a ratio rollup, not just this panel. Related and probably the same job:
`notes-57-metric-registry-plan` §4's numerator/denominator gap.

⚠️ **Until it lands, a leaderboard on any of those 10 metrics can mis-order two close stores**, and
the number shown is a daily average rather than the period figure a P&L would show.

---

## Resolution (2026-08-24) — the deferred numerator/denominator gap

Picked up from the standing queue (dispatch #85's handoff pointed here). Closes the gap deferred
above with owner approval 2026-08-23, for exactly the 10 named ratio metrics — migrating every
other `metricAvg` call site in the app is explicitly NOT part of this pass (see below).

### The mechanism: `derive.kind:'ratio'`, not a new declaration site

`engine/metric-source.js` already had `derive: {inputs:[a,b], fn}` on several metrics for their
single-day fallback. The insight that made this a small, disciplined change rather than a new
parallel structure: **5 of the 10 named ratios (tpph, laborPct, compWaste, rawWaste, statVar)
already had a derive whose two inputs genuinely ARE [numerator, denominator]** — the missing piece
was never the declaration, it was a rollup function that reads it. Marked those five (plus `spph`,
the ROLLUP CAVEAT comment's own worked example, and `avgCheck`, which got a brand-new derive
`sales/gc`) with `kind:'ratio'`. `oppCostPct` is also a literal division (`dollars/sales`) but was
**deliberately left unmarked** — its own comment flags the sales denominator as an unconfirmed
assumption, and this fix should not extend trust to a formula that hasn't been confirmed.

`kind:'ratio'` is a curated marker, not "any 2-input derive" — `oppCostDollar`'s `gap*rate` is a
PRODUCT and `actVsSched`'s `act-sched` is a DIFFERENCE; neither is summable as parts, and the
guard test (`metric-sum-ratio.test.js`) pins that both are excluded.

### Three chains that did not exist before

The other 5 named ratios (cashOSPct, tRedAPct, tRedBPct, discPct) had no derive at all — only a
precomputed field. Their real numerator ($ amount) and denominator (net sales) legs exist in the
data but were never exposed as independent `METRIC_SOURCES` chains:

- **`netSalesAmt`** — opsCashRows-only. This is deliberately **not** the general `sales` key,
  which resolves DAR product sales — a *different basis*. Conflating the two already cost real
  debugging time on `laborPct` (this same file's own reconciliation comment, 89.8% match, 10.2%
  day-specific mismatch pool never fully explained). `netSalesAmt` sums the SAME `net_sales_amt`
  column `loadOpsCashSheet`'s own inline discPct/tRedAPct/tRedBPct/cashOSPct math already divides
  by (supabase.js), just camelCase-aliased so `metricSumRatio` can read it like every other chain.
- **`discAmt`** — opsCashRows (new alias) then ctrlRows (already had it, `parseCtrlData`).
- **`tRedAAmt` / `tRedBAmt`** — opsCashRows-only. ctrlRows carries T-Red *counts* and the *pct*
  for this upload but no dollar amount, so there is no manual fallback for these two yet — a real,
  documented gap, not an oversight.
- `cashOSAmt` already existed as a chain and needed no change; reused directly.

Each of the four percent metrics (cashOSPct, tRedAPct, tRedBPct, discPct) got a new
`derive: {inputs:[amtKey, 'netSalesAmt'], fn: (a,s)=>a/s, kind:'ratio'}` — the exact net-sales-
weighted formula `loadOpsCashSheet` already uses inline, now also available as an independently
resolvable numerator/denominator pair for the rollup.

### `metricSumRatio(ds, locs, range, key)`

Returns `{value, n}` — the true Σnumerator/Σdenominator — or `null` if the metric isn't
ratio-capable, or if no day in range resolves both legs. A day counts only when **both** legs
resolve for it (mirrors `metricSeriesWithSource`'s own derive() contract: a partial input set
contributes nothing rather than a wrong number), so a day covered only by a manual upload missing
one leg (e.g. Controls has no net-sales-$ column) is silently excluded from the sum, not guessed.

`rollupCapableMetricKeys()` returns the 11 keys now marked (`avgCheck, cashOSPct, compWaste,
discPct, laborPct, rawWaste, spph, statVar, tRedAPct, tRedBPct, tpph`) — the panel only offers 10
of these (spph isn't in `PERFORMER_METRICS`, no ranking direction assigned to it).

### `rankPerformers`: a whole-ranking switch, never per-store

The obvious-looking design — compute Σ/Σ per store, fall back to mean-of-daily for any individual
store that can't resolve it — was considered and rejected. It would let one store's row show a
true period total next to another store's row showing a daily average, in the SAME ranked list.
That is **worse** than being uniformly approximate: the two numbers would no longer even be the
same kind of thing, and a leaderboard reader has no way to know which basis a given row used.

The actual rule: compute Σ/Σ for every store that has any daily coverage at all. If **all** of them
resolve, use Σ/Σ for the entire ranking (`rollup:'sum'`). If even one doesn't, the entire ranking
falls back to mean-of-daily (`rollup:'mean'`) — consistent within one call, never mixed. In
practice this means: any scope/window where the underlying auto-pulled streams (opsLaborRows,
opsCashRows) cover every included store gets the correct figure; a scope that includes a store on
manual-only fallback gets the honest, previously-shipped approximation instead, with the panel's
disclaimer text saying which one it's showing.

`src/views/top-bottom-performers.js`'s footer disclaimer now reads `result.rollup` and shows
either *"the true period total (Σ ÷ Σ)"* or the original *"the daily average… not the period
total"* copy — never a bare number with no stated basis.

### Verification

- `metric-sum-ratio.test.js` (10 tests) — direct `metricSumRatio` tests, including the exact
  uneven-volume pattern that motivated this work (a light day + a heavy day with different daily
  ratios): mean-of-daily and Σ/Σ diverge by >0.1 on the fixture, matching the SPPH-style gap this
  file's own comment already measured. Also covers the `netSalesAmt`-only-from-opsCashRows case
  (a ctrlRows-only day is correctly excluded, not paired with a wrong denominator) and confirms
  `rollupCapableMetricKeys()` excludes the product/difference derives.
- `rank-performers-sum-ratio.test.js` (3 tests) — a fixture where mean-of-daily and Σ/Σ **disagree
  about which store wins** (Store A: light day 0.10 + heavy day 0.28 → mean 0.19 but Σ/Σ 0.264;
  Store B: flat 0.20 both ways). `rankPerformers` reports `rollup:'sum'` and ranks B first — the
  *opposite* of what mean-of-daily said. **Confirmed revert-sensitive**: temporarily disabled the
  sum-adoption branch and re-ran — both this test and the panel's new disclaimer test failed
  exactly as predicted, then restored and reconfirmed green.
- `top-bottom-performers-panel.test.js` — added one render test asserting the disclaimer text
  actually switches to the Σ/Σ wording when the panel's real consumer resolves both legs, touching
  the call site per the standing "would this still pass if reverted" bar. The 4 pre-existing tests
  in this file pass **unmodified** — their fixture only supplies a precomputed `laborPct` field
  with no `opsLaborRows`/`opsCashRows` legs, so it correctly still falls back to `rollup:'mean'`,
  proving the new code path is additive rather than a rewrite of the old one.
- `golden-dataset.test.js`'s `avgCheck` snapshot changed from `null` to a real derived value.
  Measured before accepting: the fixture's `avg_check` field is `0` for this window (rejected
  under `mode:'pos'` — a real avg check is never legitimately 0), and `avgCheck` had no derive
  fallback before this change, so `null` was the previously-correct "nothing resolved" answer.
  With `derive:{inputs:['sales','gc']}` added, it now correctly fills from two already-resolving
  legs — the intended improvement, not a regression. Snapshot updated after confirming this.
- Full suite: 2189/2189. Build clean, eager payload 518.33 KB gzip (850 KB budget) — engine-only
  change, no new eager imports.

### What was deliberately NOT done

- **No migration of other `metricAvg` call sites.** Every OTHER panel in the app that calls
  `metricAvg` on one of these 10 metrics (Labor Analytics, EOM Supervisor, At A Glance, etc.)
  still gets mean-of-daily. `metricSumRatio` exists and is exported for any future consumer that
  needs it; wiring each one in is real, separate work, one call site at a time — exactly what the
  dispatch's own deferred note anticipated ("it would serve every consumer of a ratio rollup, not
  just this panel").
- **`oppCostPct` not marked ratio-capable**, despite being a literal division — its denominator is
  flagged elsewhere as an unconfirmed assumption; extending Σ/Σ trust to it would be guessing.
- **No new manual-upload fallback for T-Red $ amounts.** `tRedAAmt`/`tRedBAmt` are opsCashRows-only
  because ctrlRows (Controls Excel) has no dollar field for T-Reds in this upload, only counts and
  the pct. A store on manual-only Controls for T-Reds gets `rollup:'mean'` for the whole ranking
  when included — the honest, previously-shipped number, not a wrong Σ/Σ.
- **The notes-57-metric-registry-plan §4 connection is real but this is not that project.** §4
  envisions numerator/denominator as a first-class registry dimension serving period reports,
  formatting, and more, app-wide. This dispatch closes the specific, bounded instance dispatch
  #77/#580 measured and deferred — the leaderboard's own 10 metrics — using the same underlying
  mechanism (`derive.inputs` as num/den), so a future §4 pass can build on `kind:'ratio'` rather
  than starting over.
