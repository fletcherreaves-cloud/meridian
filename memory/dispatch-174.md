# Dispatch #174 — Performance Review auto-fill: Sales actual (`salesVsTgt`) still manual-only, silently blank past July

## Owner report (verbatim, 2026-08-27, follow-up to the same symptom dispatch #159 was supposed to fix)

> "performance reviews are still only populating through June when I auto populate"

## This is a REAL, DIFFERENT bug from #159/#161 — not a regression of either

Both prior fixes are confirmed still working (read the live code before drafting this, not
assumed): #159 fixed the load-order race gating the Auto-fill button; #161 switched `mo.foodOB`
(Food Cost actual) to the auto `qsr_fob` stream. Neither touched `mo.salesVsTgt` — the Sales
actual figure — which was never part of either dispatch's scope.

**Root cause, measured live** (`SUPABASE_SERVICE_ROLE_KEY`, this session's environment):
`src/engine/review-engine.js`'s `autoPopulateKPIs()` sets `mo.salesVsTgt` (~line 1568-1570) from
`sum(lr, 'sales')`, where `lr = laborM[m]` (~line 1559) is built by hand-filtering
**`ds.laborRows` — the MANUAL upload stream — and nothing else.** No auto-first fallback at all,
unlike `oepe`/`r2p`/`kvs`/`laborPct` three lines below, which already route through
`metric-source.js`'s `metricRate`/`metricAvg` (auto-first, dispatch #109 item #3) — or `foodOB`,
which dispatch #161 already switched to `fobByRange()` over the auto `qsr_fob` stream.

**Confirmed live**: `labor_rows` (the manual table `ds.laborRows` reads)'s most recent row is
`report_date: 2026-07-23` — nearly 5 weeks stale as of this dispatch (2026-08-27), and July itself
is only partially covered (uploads apparently stopped mid-month). Since `mo.salesVsTgt` has zero
auto/cloud fallback, it goes silently blank for any month without a manual upload — which, per the
CLAUDE.md standing rule on this exact failure class ("manual sourcing is always temporary... a
metric with only manual sourcing" is the thing `MANUAL_ONLY_METRICS` exists to catch and must stay
empty), is precisely the bug pattern this project has fixed repeatedly for other metrics. This is
very likely why the owner sees reviews "only populating through June" — June is the last fully-
covered month; July is partial; August (and beyond) has nothing.

**A second, compounding effect, also confirmed by reading the code**: `mo.foodOBTgt` (~line 1716)
is DERIVED from `mo.salesVsTgt` (`officialTgts.tFOBTarget * mo.salesVsTgt`) — so this same bug also
silently blanks the FOB dollar TARGET for any month where `mo.salesVsTgt` is unset, even though
dispatch #161 already fixed the FOB *actual* itself. Fixing `salesVsTgt` fixes both.

## The fix — same pattern already established three lines below, not a new mechanism

`metric-source.js` already has a fully-registered, auto-first `sales` chain (confirmed reading it):
```js
sales: { mode: 'pos', direction: 'higher', srcs: [['qsrActSummaryRows', 'sales'], ['qsrActSummaryRows', 'allNetSales'], ['laborRows', 'sales']] },
```
`ds.laborRows` is ALREADY the last-resort fallback in this chain — so switching `salesVsTgt` to use
it changes nothing for a store/month that only ever had manual data; it only ADDS the auto/cloud
path ahead of it, which is exactly the fix shape.

`metricSeries(ds, loc, range, 'sales')` returns `{dateKey: value}` for the month (auto-first per
day) — sum its values for the monthly total, the same `Object.values(metricSeries(...)).reduce(...)`
pattern already used elsewhere in this codebase (e.g. `src/views/sage.js`, `src/views/
store-analytics.js`) — reuse that, don't invent a new aggregation helper.

## Task

1. In `autoPopulateKPIs()`, replace `mo.salesVsTgt`'s source: instead of `sum(lr,'sales')` (manual
   `ds.laborRows` only), sum `metricSeries(ds, loc, range, 'sales')`'s values over the month
   (`range` is already computed just above, reused by oepe/r2p/kvs/laborPct — do not recompute
   it). Keep the manual `lr`-based sum as an explicit fallback AFTER the auto result, only when the
   auto path returns nothing for that month — same precedence direction as every other metric this
   function already fixed (#161's `foodOB` is the closest precedent: auto first, gated on the auto
   source actually having real data for that month, manual only as a last resort).
2. Verify `mo.foodOBTgt`'s derivation (~line 1716) is unaffected in shape — it should just start
   working again for months where `salesVsTgt` now resolves via the auto path, no code change
   needed there beyond `salesVsTgt` itself resolving correctly.
3. Check whether the (already-established-dead, per the existing code comment) `salesTgt`/
   `laborTgt` manual-only TARGET fallback (~line 1699-1706, `lr`-based) is affected by this change
   at all — it shouldn't be, since it's a different, still-unused field, but confirm rather than
   assume.
4. Do NOT touch `oepe`/`r2p`/`kvs`/`labor`/`foodOB`/`opSupplies`/people-metrics — none of those are
   implicated; this dispatch is `salesVsTgt` only.

## Verification

- A render-based or direct-function test proving `autoPopulateKPIs` populates `mo.salesVsTgt` for
  a month where `ds.laborRows` has NO manual row but an auto/cloud source
  (`ds.qsrActSummaryRows`) does — the actual regression case, built the same way dispatch #159's
  own tests constructed a `ds` shaped like each side of a real race/gap.
- A test confirming the manual-fallback path still works unchanged when only `ds.laborRows` has
  data (no auto source) — this must not regress for a store/month that's genuinely manual-only.
- A test confirming `mo.foodOBTgt` resolves correctly once `salesVsTgt` does, for a month that was
  previously blank under the bug.
- Standard suite + build bar.
