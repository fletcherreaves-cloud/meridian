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
