# Dispatch #161 — Route Performance Review FOB $ actual through the auto `qsr_fob` stream,
# not the manual `ds.fobRows` array

**Context (2026-08-27):** Follow-up flagged by dispatch #159's own PR body (v5.205, merged) and
separately spawned as a suggested task, owner-approved. `autoPopulateKPIs`'s `mo.foodOB` (the
review's FOB $ actual — `src/engine/review-engine.js`, ~line 1604-1607: `fr = fobM[m] =
byMonth(ds.fobRows)[m]`, then `sum(fr,'fobDollar')`) reads `ds.fobRows` directly — the MANUAL
Ops Report upload array — instead of the auto-pulled `qsr_fob` stream via `fobByRange()`
(`src/engine/one-pager-data.js`), which every FOB view elsewhere in the app (both One-Pagers,
fixed this session in v5.203) already correctly uses. Same "manual sourcing is always temporary"
bug class as v5.203's fix and dispatch #159's own finding, different mechanism (wrong source
entirely, not a load-order race).

## What already exists (read the code, don't re-derive)

- **`fobByRange(fobRows, range)`** (`src/engine/one-pager-data.js`, ~line 109) — the canonical
  FOB aggregator. Takes the auto-pulled `ds.qsrFobRows` shape (`prodSalesAmt`/`compWasteAmt`/etc,
  a cumulative-snapshot-diff model with the v5.195/v5.196 latest-pulled fallback — read the
  function's own extensive header comment on why this source settles once a month and needs that
  fallback). Returns `{loc: {prodSales, fob$, fobPct, lyProdSales, lyFob$, lyFobPct}}` for every
  loc present in the input rows — **NOT locs-filtered** (v5.203 fixed every caller that forgot to
  filter its result to the requested scope; this dispatch's own new call site must filter too,
  same pattern).
- **`ds.qsrFobRows`** — loaded app-wide in `App.js` already (confirmed by `above-store-onepager.js`'s
  own comment: "ds.qsrFobRows is loaded app-wide (App.js)"). Nothing new to wire up on the
  loading side — this is purely a sourcing-order change inside `autoPopulateKPIs`.
- **`ds.fobRows`** (the manual shape: `sales`/`fobPct`/`compWaste`, NO `*Amt` dollar fields —
  confirmed by `above-store-onepager.js`'s own comment on why passing `ds.fobRows` to
  `fobByRange` silently skips every row) — this is what `autoPopulateKPIs` currently reads, and
  is the WRONG shape for `fobByRange` even if swapped in naively. Do not just substitute
  `ds.qsrFobRows` for `ds.fobRows` inside the SAME `byMonth()`/`sum()` hand-rolled logic — route
  through `fobByRange()` itself, the way every other FOB consumer does.
- **CLAUDE.md's `MANUAL_ONLY_METRICS` standing rule**: "Ship a metric manually to prove it is
  worth having, then automate it... Prefer deriving from already-pulled atoms over adding a new
  manual upload." This dispatch is exactly that migration, for a metric (`mo.foodOB`) that has
  already been manual-only for a while.

## The reconciliation this dispatch's PR body flagged as the real remaining work

Per dispatch #159's own note: "the auto `qsr_fob` $ definition needs reconciling against
`fobRows`' own before it can safely replace it." Before wiring `autoPopulateKPIs` to
`fobByRange()`, **measure both sources against each other for at least one real store/month** —
pull a live `qsr_fob` row and a live manual Ops Report FOB $ figure for the same store/month
(this session's earlier uploaded reference files, or a fresh service-role Supabase query, both
work) and confirm the two dollar figures are reasonably close (a rounding-level gap, not a
different-metric-entirely gap). If they diverge meaningfully, STOP and report the discrepancy
rather than silently swapping the source — that would be a worse regression than the current
manual-only staleness.

## Scope

1. Measure the reconciliation above FIRST, before writing code. Report the numbers in the PR
   body regardless of outcome.
2. If reconciled: change `autoPopulateKPIs`'s FOB sourcing (`src/engine/review-engine.js`) to
   call `fobByRange(ds.qsrFobRows, monthRange(m))` (filtered to `[loc]`, matching v5.203's
   pattern) instead of hand-rolling `byMonth(ds.fobRows)`/`sum(fr,'fobDollar')`. Keep the manual
   `ds.fobRows` path as an explicit fallback ONLY when the auto source has nothing for that
   month (matching the auto-first, manual-last-resort pattern every other metric in this
   function already follows via `metricAvg`/`metricRate`) — don't silently drop manually-entered
   figures for months the auto stream genuinely doesn't cover.
3. Update `mo.foodOB`'s target-comparison logic if it currently assumes the manual field's units/
   shape differ from what `fobByRange` produces (check `fobPct` vs `fob$`/dollar-amount — this
   review field is a DOLLAR figure per the field name, confirm `fobByRange`'s `fob$` is the right
   value to use directly, not `fobPct × prodSales` or similar).
4. Tests: a reproduction of the reconciliation measurement as a fixture-based test (real-shaped
   `ds.qsrFobRows` vs `ds.fobRows` disagreeing, confirm the auto source wins when present), plus
   confirmation the manual fallback still works when `ds.qsrFobRows` has nothing for a month.

## Explicitly out of scope

- Any other metric in `autoPopulateKPIs` — this is the FOB field only.
- The One-Pager FOB fixes (v5.203, v5.204) — already shipped, don't re-touch.
- `MANUAL_ONLY_METRICS`'s formal list mechanism (if one exists in code beyond CLAUDE.md's prose
  rule) — check whether this needs an entry removed, but don't build new list-management tooling.

## Verification bar

- New/changed unit tests pass; full `npx vitest run --exclude "**/.claude/**"` suite passing at
  the same or higher count as `main`. `npm run build` clean, report before/after entry-chunk gzip.
- PR body must state the exact reconciliation measurement (both dollar figures, which
  store/month, how close) before describing the code change — if the two sources disagree
  meaningfully, the PR body should say so and the fix should NOT proceed past that point without
  flagging it clearly for the owner.
