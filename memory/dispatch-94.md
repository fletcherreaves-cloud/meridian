---
name: dispatch-94
description: store-dash.js declares tol: on 24 metrics and nothing reads it -- the KPI table's actual color logic (statusCol/statusIcon) uses a hardcoded 5%/15%-relative-to-target band instead, which behaves very differently across metrics of different scale (5% of $30K sales vs 5% of an R2P seconds target are not comparable signals). Owner-decided scope: replace the relative band with tol as an absolute per-metric threshold, then roll the out-of-tolerance status up to a district-wide summary and into the Coaching engine's findings. Phase 1 (the core fix) ships alone; phases 2-3 are real follow-on scope, not bundled into one PR.
sensitivity: open
metadata:
  node_type: memory
  type: dispatch
---

# Dispatch #94 — wire up `tol:`, then roll it up district-wide and into Coaching

**Status:** ready, scope already decided by the owner (see below) — no further product decision
needed before Phase 1 starts.

---

## The gap, precisely located

`src/views/store-dash.js` declares `tol:` on 24 metrics (line ~2614–2644), e.g.:

```js
{id:'oepe', ..., tol:10,  ...}   // seconds
{id:'labor', ..., tol:.02, ...}  // 2 percentage points
{id:'sales', ..., tol:500, ...}  // dollars
```

**`grep -n "tol\b"` outside the declaration lines returns nothing** — confirmed, not assumed. The
24-metric KPI table these belong to (rendered starting ~line 2900) instead colors each row via
`statusCol`/`statusIcon` (~line 2833):

```js
const statusCol = (cur,off,m)=>{
  if(cur==null||off==null) return null;
  const gap = m.lowerBetter ? (cur-off)/off : (off-cur)/off;   // RELATIVE to target
  if(gap <= 0.05) return '#10b981';   // green
  if(gap <= 0.15) return '#f59e0b';   // yellow
  return '#ef4444';                   // red
};
```

Every metric gets the same 5%/15% relative bands regardless of what it measures. That's the wrong
comparison unit for at least some of these — 5% of a $30,000 sales target is a very different
signal than 5% of an R2P target measured in seconds — which is presumably why `tol` was declared
with real, metric-specific absolute values in the first place and then never wired in.

(Note: there is a second, separate, narrower color function — `metCol`, ~line 1756 — used at only
3 call sites for a different summary view. Not in scope here; don't touch it unless a later phase
specifically needs to.)

## Owner-decided scope (already settled, don't re-ask)

1. **Replace** the relative 5%/15% band with `tol`-based absolute thresholds — not add `tol` as a
   second, parallel indicator.
2. **Also roll up district-wide** — a summary showing how many stores are out of tolerance on
   which metrics.
3. **Also feed the Coaching engine** — an out-of-tolerance metric becomes a coaching finding.

## Phase 1 — replace `statusCol`/`statusIcon` with `tol`-based thresholds (ship this first, alone)

Change `statusCol` to compare `Math.abs(cur - off)` against `m.tol` instead of computing a
relative-to-target fraction. The existing function has two bands (green/yellow) before red; a
reasonable mapping that preserves that shape: green if `|cur-off| <= tol`, yellow if
`<= tol*3` (or whatever multiple reads sensibly against the real per-metric values — sanity-check
a handful, e.g. does a Labor % 2pp-wide green band feel right against real store data, does an
OEPE ±10s green band), red beyond. **Pick the multiplier by checking it against real data, not by
guessing a number that looks reasonable in the abstract** — this repo's own standing rule.

`statusIcon` derives from `statusCol`'s return value already, so it shouldn't need its own change
beyond following `statusCol`.

**Verification bar:** before/after screenshots (or a rendered-output test) on a handful of stores
showing the color for each of the 24 metrics changes where the two schemes disagree — e.g. find at
least one metric/store combination that was green under the old 5% relative band but is correctly
red under the new absolute `tol` (or vice versa), and confirm the new result is the more sensible
one given the metric's real-world scale. A test that only checks "the function runs" without
asserting a case where the two schemes produce different, and correctly different, answers doesn't
prove the fix did anything.

## Phase 2 — district-wide out-of-tolerance summary

Once Phase 1 is merged and correct: add a summary (Analytics or At-A-Glance, following this
repo's existing tile conventions — e.g. `SageRunsTile` in `analytics.js`, `DEF_SECS[0]`) showing
count of stores currently out of tolerance, broken out by metric or by store, using the same
`tol`-based comparison Phase 1 ships. Don't re-derive the threshold logic — import/reuse whatever
Phase 1 exposes rather than recomputing it a second time (this repo's own "check whether a helper
exists" rule — two copies of a tolerance check would drift exactly the way the org-map/week-anchor
duplicates already have).

## Phase 3 — feed the Coaching engine

`src/engine/coaching.js`'s `GMCoachingBrief` reads `findings` (typed crit/watch/ok strings) off the
already-built `store` object — it does not compute findings itself, it's a synthesis/prompt layer
over what `buildBrief` (wherever that lives in the pipeline) already produced. An out-of-tolerance
metric should become a new finding entry in that same pipeline, not a separate code path bolted
onto `coaching.js` directly. Follow the existing finding shape/severity convention (crit/watch/ok)
rather than inventing a new one.

## Sequencing

**Phase 1 must ship and be independently verified before Phase 2 or 3 start.** Both later phases
depend on Phase 1's threshold logic being correct — building a rollup or a coaching finding on top
of a still-wrong comparison just propagates the bug further. If it's cleaner to split this into
three separate PRs across sessions rather than one large one, do that; don't let phases 2–3's
scope block or delay shipping phase 1's fix.

## Do NOT

- Do not touch `metCol` (the other, narrower color function) — different call sites, not in scope.
- Do not add `tol` as a second indicator alongside the existing relative-band coloring — the owner
  explicitly chose replace, not add.
- Do not invent a new finding-severity scheme for Phase 3 — match `buildBrief`'s existing
  crit/watch/ok convention.
- Do not guess the yellow-band multiplier without checking it against real per-store data first.

## Resolution (Phase 1, shipped)

**Shipped:** `statusCol` in `UnifiedTargetsPanel` (`src/views/store-dash.js`) now compares
`Math.abs(cur-off)` against `m.tol`: green if `<= tol`, yellow if `<= tol*2`, red beyond.
`statusIcon` needed no change (derives from `statusCol`'s return value already, as expected).
`metCol` was not touched. `tol` was not added as a second/parallel indicator — it replaced the
old relative-band comparison at the same call site.

### Multiplier chosen: **2×**, picked from real data, not guessed

Pulled live district data via `SUPABASE_SERVICE_ROLE_KEY` (the 2026-08-24 key rotation is
resolved — service-role reads worked cleanly against `daily_glimpse_daily`, `sales_ledger_daily`,
and `qsr_fob`; see the corrected "true state" paragraph elsewhere in this file). Computed
last-28-day store averages for OEPE, Labor %, Avg Check, and five tight-tolerance FOB metrics
(Comp Waste %, Raw Waste %, Condiment %, Emp Meal %, Stat Var %) across all 27 stores, compared
each against its real `DEFAULT_TARGETS` official target, and tabulated the green/yellow/red split
the *old* 5%/15%-relative scheme produced vs. what a `tol`-based scheme produces at multipliers
2×/3×/4×/5× (n=216 metric/store pairs across the 8 metrics):

| scheme | Green | Yellow | Red |
|---|---|---|---|
| old (5%/15% relative) | 105 (49%) | 45 (21%) | **66 (31%)** |
| new, mult=2 | 163 (75%) | 38 (18%) | 15 (7%) |
| new, mult=3 | 163 (75%) | 47 (22%) | 6 (3%) |
| new, mult=4 or 5 | 163 (75%) | 52 (24%) | 1 (0.5%) |

The old scheme's 31%-red is the bug made visible: the four tight-tolerance FOB metrics alone
carried 54 of its 66 reds (Comp Waste 14/27, Raw Waste 15/27, Emp Meal 12/27, Stat Var 13/27 —
ordinary noise around a target measured in tenths of a percentage point, reading as "off track"),
while $-scale Avg Check never went red even once (0/27) because $0.25 is a small relative
fraction of a ~$11 check. That's exactly the cross-scale miscalibration the dispatch describes.

Multiplier 2× was chosen because it's the only candidate that keeps a real, non-degenerate red
band: 3×/4×/5× collapse red to near-zero (3–6 stores total, one metric — OEPE — carrying almost
all of it), which stops the color from communicating anything actionable. 2× keeps meaningful
separation on every metric tested (e.g. OEPE 6G/10Y/11R, Comp Waste 24G/2Y/1R, Stat Var
21G/5Y/1R) without ever going degenerate in either direction (never all-green, never all-red).

### Verification bar — a concrete disagreement, confirmed more sensible

Comp Waste %, store `10915`: real last-28-day current **0.281%** vs. real official target
**0.200%** (`tCompWaste`). Old scheme: relative gap `(0.00281-0.002)/0.002 = 40.5%` → past the
15% band → **red ("Off Track")**. New scheme: absolute gap `0.081` percentage points, tol is `0.1`
percentage points (`tol:.001`) → within tol → **green ("On Target")**. The new read is the
sensible one: a store missing a target that's itself only ~0.2% of sales by eight-hundredths of a
percentage point is noise, not a red flag — the old scheme was flagging normal day-to-day
variance as "off track" purely because the target itself is small.

This case (same shape, self-computed against the real `DEFAULT_TARGETS` so it can't drift stale)
is asserted in `src/__tests__/dispatch-94-statuscol-tol.test.js`, which renders the actual
`UnifiedTargetsPanel` consumer (not `statusCol` in isolation) and checks the rendered "Comp Waste
%" row reads "On Target" — satisfying this repo's "would this verification still pass if
reverted" bar, since reverting either the threshold math or the table's wiring to it fails the
render assertion.

`npm test` (2236 tests, 214 files) and `npm run build` both pass clean; entry-chunk size
unaffected (no new imports).

**Phase 2 (district-wide rollup) and Phase 3 (Coaching-engine findings) are unstarted** — separate
follow-on dispatches, per the sequencing above.
