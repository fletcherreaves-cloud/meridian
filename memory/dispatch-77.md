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

- **Labor % in `analytics.js:309` may be deliberate.** Its own `action` and `note` fields argue
  labor is genuinely two-sided: *"too lean hurts service quality; too heavy compresses margin"* and
  *"Context and trend matter more than the number alone."* That is an editorial stance, not an
  obvious typo. **This is the owner's call, not the engineer's.**
- **Discount % is arguable** the same way — discounts drive traffic.
- **R2P is the hard one to defend.** `store-dash` contradicts *itself*, and the sibling entry's
  own label says *"lower=better"*. Still: reproduce what each site renders before changing either.

📌 **What is NOT in doubt:** whatever the right answers are, they cannot be right in two places at
once. Today two panels can color the same store's Labor % green and red simultaneously. Worth
checking whether they visibly do — that is a one-screenshot question and it belongs in the report.

## Step 1 — adjudicate (owner input required, do not skip)

Produce a table of every metric declared in more than one place with each declaration's direction,
flag name, and file:line. Mark the ones that disagree. **Take the three above to the owner and get
a ruling per metric** — including whether "two-sided" is a real third state the registry must
represent (`lowerBetter` / `higherBetter` / `neither`), which is the honest reading of that labor
note. Do not guess; do not let a leaderboard ship a ranking the owner disagrees with.

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
