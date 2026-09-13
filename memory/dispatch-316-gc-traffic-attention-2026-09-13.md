# GH #316 — guest-count decline + traffic/sales divergence in Needs Attention (2026-09-13)

`src/engine/attention-feed.js` describes itself as fusing cross-domain signals into ONE ranked
feed. Sales was covered (`salesBehindLY`); guest counts — the metric the whole McValue 2.0 FBP
traffic story is about (traffic DiD −4.55pp OK / −5.49pp FL, `memory/project-mcvalue-2-fbp-
document.md`) — had zero detector, despite the inputs already being pulled and already used
elsewhere (`qsr_daily_activity`'s guest counts, reachable through `vs-ly.js`'s existing
`matchedVsLY(ds, [loc], range, 'gc')` — the SAME helper `salesLY` already calls with `kind:
'sales'`). This is exactly the gap the issue named: not a data problem, a missing detector over
data already in `ds`.

## Why a plain GC decline isn't the whole story

The issue's own framing: *"a store holding sales on fewer, larger transactions looks fine on a
sales detector and is not fine."* A store can post flat-to-rising sales while guest counts fall
sharply — the McValue signature — and salesBehindLY alone would show green. So this dispatch
ships two detectors, matching the issue's "suggested shape":

1. **`gcBehindLY`** — the direct guest-count analog of `salesBehindLY`. Same shape, same
   threshold pattern (`minGap`, 5%-of-LY escalation to `warn`). `dollars` stays `0` — a
   guest-count gap alone has no honest $ value without an assumed average check, and
   `finding-rules.js`'s own convention is 0-over-a-guess.
2. **`trafficDivergenceAlerts`** — the actual McValue signature: sales holding/rising (≥
   `-salesHoldPct`, default −1%) while GC falls past `gcDropPct` (default −3%, `crit` past
   `critGcDropPct` default −6%). This direction gets a defensible $ figure: lost guests (LY GC
   − current GC) × the store's OWN current average check (current sales ÷ current GC — both
   already matched-day quantities in the same row, no external assumption). The reverse case
   (GC up, sales down — an average-check/mix problem, not the McValue signature but flagged for
   visibility per the issue's "or the reverse") gets `dollars: 0`, since dollarizing a mix shift
   is a real guess, not a defensible figure.

## What changed

- **`src/engine/attention-feed.js`** — new `gcBehindLY(rows, storeName, {minGap})` and
  `trafficDivergenceAlerts(rows, storeName, {gcDropPct, salesHoldPct, critGcDropPct})`. Both
  wired into `buildAttentionFeed`'s params (`gcLY`, `trafficRows`) and `bySource`.
- **`src/views/attention-now.js`** — `useAttentionFeed` now computes:
  - `gcLYWindow`/`gcLYRolling`/`gcLY` — byte-identical pattern to the existing
    `salesLYWindow`/`salesLYRolling`/`salesLY`, just `kind: 'gc'` instead of `'sales'` (worst-of-
    two-windows via the already-generic `mergeWorstSalesLY`, which needed no change).
  - `trafficRows` — built from the SAME rolling-window matched-day sums already computed for
    `salesLYRolling`/`gcLYRolling` (joined by loc), not from `salesLY`/`gcLY`'s merged/worst-
    window picks. This matters: `mergeWorstSalesLY` can independently pick a different window
    (single-period vs. rolling-28-day) per side for the two single-metric detectors, which would
    misalign a divergence check comparing sales% against GC% on two different date spans. The
    divergence detector needs both legs measured over the identical window.

## What did NOT change

- `vs-ly.js` — `matchedVsLY`/`autoFirstDaily` already fully supported `kind: 'gc'`; nothing
  there needed touching. This dispatch is entirely new detectors + wiring, not a new data path.
- `mergeWorstSalesLY` — already generic over `{loc, cur, ly}`, reused verbatim for GC.

## Tests

- `src/__tests__/attention-feed.test.js` — 12 new cases: `gcBehindLY` threshold/severity/
  degradation (5 cases, mirroring `salesBehindLY`'s own test shape), `trafficDivergenceAlerts`
  sales-holds/GC-falls with the honest $ figure, crit escalation, the reverse case with
  `dollars:0`, no-fire when sales/GC move together, no-fire on a sub-threshold GC dip, and
  null/malformed-input degradation (6 cases), plus 2 `buildAttentionFeed` wiring tests and 1
  regression test confirming omitted `gcLY`/`trafficRows` changes nothing for existing callers.
- `src/__tests__/dispatch-316-gc-attention-wiring.test.js` — renders the ACTUAL
  `useAttentionFeed` hook (not just the engine functions, per the standing "would this
  verification still pass if reverted" rule, since the wiring lives in `attention-now.js`) with
  a real `ds.qsrActSummaryRows` fixture (20 days, sales +1% vs LY / GC −10% vs LY — the McValue
  signature); confirms "Traffic" and "traffic falling" render, and a store with no sales/GC data
  is unaffected.

All 14 new/extended assertions confirmed to fail against pre-fix code (`git stash` round-trip on
the 2 changed source files, tests left in place).

Full suite 509/509 files, 4860/4860 tests. Build clean, 542.19 KB / 850 KB eager-payload budget.

## Related

- #261 — the Needs Attention coverage table this gap came from (admission gate for demoting the
  At-A-Glance KPI grid). Sibling gap (#317, CSAT comment opportunities) closed earlier the same
  day.
