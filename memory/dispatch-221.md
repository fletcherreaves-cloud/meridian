# Dispatch #221 — KVS Time gets the same Σ/Σ ratio fix OEPE/R2P already got (dispatch #153)

## Context — the exact gap #153 named, live-confirmed still open

`top-bottom-performers.js`'s own header comment (dispatch #77, 2026-08-24) lists the metrics that
were NOT yet Sum/Sum-capable: *"oepe/kvst/r2p are ratios computed upstream (by the DAR loader,
supabase.js) with no numerator/denominator exposed as separate metric-source chains yet — real,
larger follow-on work."* Dispatch #153 (2026-08-27) did that follow-on work for **oepe and r2p
only** — exposed their raw numerator/denominator legs as their own `METRIC_SOURCES` chains
(`oepeNumSec`/`dtTransCnt`, `r2pNumSec`/`fcTransCnt`) and marked each metric `derive:{kind:'ratio'}`
so `metricSumRatio`/`metricRate` (`src/engine/metric-source.js`) compute the true
Σnumerator÷Σdenominator period figure instead of `metricAvg`'s mean-of-daily-ratios (which blends
a still-in-progress business day into a period average at full weight — the completeness artifact
CLAUDE.md's DAR/`hour_slot` section documents). **KVS Time was left out of #153 with no comment
explaining why**, and it is not a hard case — verified live today (2026-08-30), not assumed:

- The raw numerator/denominator legs KVS Time needs already exist on `qsrActSummaryRows`, computed
  the exact same way OEPE's are: `src/lib/supabase.js` sums `mfy1_untilserve+mfy2_untilserve` into
  `_mfyTime` and `mfy1_trans_cnt+mfy2_trans_cnt` into `_mfyCnt` per `(loc,dt)` (lines ~2492/2619/
  2664-2665), then `kvst: r._mfyCnt>0 ? r._mfyTime/r._mfyCnt/1000 : null` (line 2458) — structurally
  identical to `_dtTotal`/`_dtCars` → `oepe`. No new pull, no new schema, the data is already there.
- `METRIC_SOURCES.kvst` (`src/engine/metric-source.js:141`) has no `derive` at all today — just
  `srcs`. It is genuinely absent from `rollupCapableMetricKeys()` (confirmed: grepped every
  `kind: 'ratio'` site in the file, `kvst` isn't among them), so `metricSumRatio(ds,locs,range,
  'kvst')` returns `null` unconditionally and `metricRate(...,'kvst')` silently falls back to
  `metricAvg` every time — the exact pre-#153 behavior OEPE/R2P used to have.
- **This isn't a hunch — it's already half-fixed in the same file next to itself.**
  `src/views/store-dash.js:2270-2279`: `tpph`/`oepe` use `metricRate`, with a comment explaining
  *why* (`DR_PRESETS` includes a `'today'` preset — a still-open business day is a real,
  user-reachable selection here) — and the very next line, `kvst: metricAvg(ds,loc,DR,'kvst')`,
  uses the old mean-of-daily accessor with no comment at all. Same file, same panel, same reasoning
  applies, just never done. `src/engine/one-pager-data.js:205-206` (`metricRate` for oepe/r2p) vs.
  `:207`/`:320` (`metricAvg` for kvst) is the identical pattern. `src/engine/review-engine.js:1612`
  is a third live `metricAvg(...,'kvst')` call.

## Task 1 — expose KVS Time's raw legs, mark it `kind:'ratio'` (`src/engine/metric-source.js`)

Right next to `oepeNumSec`/`dtTransCnt` (around line 114-127), add the KVS equivalents, sourced
from the SAME `_mfyTime`/`_mfyCnt` fields `supabase.js` already computes (don't add a new loader
field, don't recompute from `mfy1_*`/`mfy2_*` a second time — reuse the already-summed columns,
same discipline as the OEPE/R2P chains):
```
kvstNumSec:  { mode: 'any', srcs: [['qsrActSummaryRows', '_mfyTime']] },  // already ms, /1000 in derive
kvstTransCnt:{ mode: 'any', srcs: [['qsrActSummaryRows', '_mfyCnt']] },
```
Check the exact field name `supabase.js` exposes on the mapped row for `_mfyTime`/`_mfyCnt` before
wiring the `srcs` path — the OEPE precedent (`dtUntilServeUs` etc.) reads `_dtTotal` etc. directly
off `qsrActSummaryRows`, confirm the KVS fields are exposed the same way on that same row shape
(they're computed in the same reducer, per the Context section above, but verify the property name
survives onto the row `metricSeries` actually reads, don't assume it does just because `_dtTotal`
does).

Then add `derive` to the existing `kvst` entry (line ~141), same shape as `oepe`/`r2p`:
```
kvst: { mode: 'pos', direction: 'lower', srcs: [...unchanged...],
        derive: { inputs: ['kvstNumSec', 'kvstTransCnt'], fn: (num, cnt) => (cnt > 0 ? num / cnt / 1000 : null), kind: 'ratio' } },
```
(`/1000` only if `_mfyTime` is genuinely still milliseconds at this point — OEPE's `oepeNumSec`
chain already divides by 1000 once, upstream of the ratio; decide whether KVS's raw leg should
carry the same pre-scaling `oepeNumSec` uses, or divide once in the ratio `fn` — pick ONE place,
state which, and make sure `kvstNumSec` alone isn't double- or zero-scaled relative to how
`_mfyTime`/`_mfyCnt` already produce `kvst` in `supabase.js` line ~2458's existing formula — that
line is your ground truth for the correct scaling, reproduce its arithmetic exactly, don't
re-derive it from first principles).

`srcs` stays unchanged and still wins when present (manual Ops/Glimpse values are real precomputed
figures, not to be second-guessed) — `derive` is the same-shape fallback + the Sum/Sum basis,
exactly the existing oepe/r2p pattern into which this is a straight extension, not a redesign.

## Task 2 — migrate the confirmed `metricAvg(...,'kvst')` call sites to `metricRate`

Same rationale as #155's oepe/r2p/tpph migration (a range that can include the current, still-open
business day is user-reachable at these call sites, so mean-of-daily silently inflates/deflates
against a real in-progress day):
- `src/views/store-dash.js:2279`
- `src/engine/one-pager-data.js:207` and `:320`
- `src/engine/review-engine.js:1612`

`src/features/morning-brief.js:234`'s `kvstNorm` computes a PEAKS-filtered local average with its
own fallback shape (`avg(peaks.filter(r=>r.kvst>0),'kvst') ?? metricAvg(...)`) — different from a
plain period figure. Look at it and make a call: migrate its `metricAvg` fallback leg to
`metricRate` (consistent, low-risk — only the fallback branch changes) or leave it alone because
the peaks-filtered primary path already answers a different question and mixing accessors there
would be confusing. State which you did and why; don't silently skip mentioning it either way.

`src/views/record-day.js:191`'s `kvsSeries = metricSeries(...)` is a raw per-day series for
charting, not an aggregate — out of scope, leave unchanged (metricSeries has no mean-vs-sum
question, it returns the daily values as-is).

## Verification

- Unit tests mirroring `src/__tests__/metric-sum-ratio.test.js`'s existing oepe/r2p cases, added
  for kvst: a period with only complete days (Sum/Sum ≈ mean-of-daily, sanity check); a period
  including a synthetic in-progress day with a low `_mfyCnt`/`_mfyTime` (Sum/Sum correctly
  down-weights it, mean-of-daily doesn't); a day missing one leg (excluded from the sum, not
  guessed) — same shape as that file's existing OEPE/R2P fixtures, reused pattern not reinvented.
- `rollupCapableMetricKeys()` includes `'kvst'` after this change — add it to whatever test already
  pins that function's expected set (check `metric-sum-ratio.test.js` or wherever `rollupCapableMetricKeys`
  is asserted today).
- A live measurement, same method dispatch #153 used for R2P (service-role Supabase REST, a real
  store, comparing an in-progress day's `_mfyCnt` against its own-day KVS reading vs. the rest of a
  multi-day window) — reproduce the SAME class of artifact for KVS Time that #153 found for R2P, or
  state plainly if today's data doesn't happen to show an in-progress day at pull time (don't force
  a finding that isn't there; the unit tests are the real correctness guarantee either way).
- Regression test at each migrated call site (`store-dash.js`, `one-pager-data.js`,
  `review-engine.js`) proving the real consumer now calls `metricRate` for kvst, per this repo's
  "would this verification still pass if the change were reverted" rule — `dispatch-155-metric-rate-call-sites.test.js`
  is the exact precedent to extend or mirror, don't just unit-test the engine in isolation.
- Standard suite + build. Version bump (re-check `origin/main`'s current highest changelog version
  fresh immediately before committing).

## Out of scope

- `park`/`kvsHealthy` and any other `mode:'any'` metric without a numerator/denominator pair — this
  dispatch is KVS **Time** (seconds) only, the literal gap #153 left behind.
- Any change to `oepe`/`r2p`'s already-shipped chains — reuse their exact pattern, don't touch them.
- `morning-brief.js`'s peaks-filtering logic itself — only its `metricAvg` fallback leg (if you
  judge it in scope per Task 2's own instruction) is on the table, not the peaks selection itself.
- A new metric-source key for KVS 2nd-side "healthy" usage rate (`kvsHealthy`) — separate metric,
  separate (already-fixed, #150/#178) history, not touched here.
