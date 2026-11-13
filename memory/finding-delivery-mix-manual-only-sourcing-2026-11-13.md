# Delivery & Channel Mix — Channel Overview was manual-only sourced, DT% read nonsense

**Owner-reported 2026-11-13, with screenshots against the real QSRSoft Operations Report.**

## The symptom

"Delivery & Channel Mix" → Channel Overview tab showed the SAME "Drive-Thru % of total
sales" metric reading wildly different numbers depending only on the date-range toggle:

| Window | App showed |
|---|---|
| 7d | 0.00% (and every other channel 0.00% too, with a "columns not found" warning) |
| 14d | 5.96% |
| 28d | 38.24% |
| 60d | 54.42% |

The owner pulled the real QSRSoft Operations Report directly (store 3708, Nov 1–12 2026,
calendar basis): daily DT % of Total Sales ran 68.62%–77.05%, MTD total **72.97%**
($98,323.22 DT sales / $101,240.07 LY). His own words: "I am not concerned with the
differences in date pull, but DT % of sales is 55% - 75%."

## Root cause

`src/views/delivery-mix.js`'s `ChannelOverviewTab` read `ds.laborByLoc` directly — rows
sourced ONLY from a manual Operations Report Excel upload — for BOTH the channel $ numerators
and the total-sales denominator, filtered to `(r.sales||0)>0` for the selected window. This is
exactly the manual-only sourcing bug class CLAUDE.md's Dev Rules section names ("Reading
ds.laborRows/ctrlRows/opsRows directly for a metric value re-introduces the manual-only bug").
The file's own header comment even flagged this as a KNOWN, deliberately deferred gap from
dispatch #201 (merging Channel Intel into this panel) — "redesigning either panel's underlying
computation" was explicitly out of that dispatch's scope.

Two compounding problems:
1. **Wrong source for both legs.** Different windows happened to include different subsets of
   manual rows (gap-prone, forward-only), so the ratio was averaging over whichever rows
   existed, never the real sales base.
2. **A latent average-of-averages fallback** (`pctFallback`) that kicked in whenever the $
   columns were zero — averaging each row's stored `pctTotal` field directly instead of a true
   Σ$/Σ$ ratio.

## The fix (v5.76x)

`metric-source.js` already had the right auto-first chains built and unused by this panel:
`dtMixPct` (emailed Sales Ledger → manual Labor, with a real Σ$/Σ$ derive from
`opsSalesMixRows`/`qsr_sales_mix` as a third-level fallback) and `bfMixPct`/`mopMixPct`/
`kioskMixPct`/`delivMixPct` (same shape, no decomposed $ chain yet). `ChannelOverviewTab` now
calls `metricRate` for Drive-Thru (sum-ratio first, mean-of-daily fallback) and `metricAvg` for
the other four, per-store, then rolls up to a district total as a true dollar-weighted
Σ(store $)/Σ(store sales) — never a mean of per-store percentages. A channel with genuinely no
data anywhere now shows an honest "–" / "no data this window" instead of a misleading 0.00%,
and the warning banner text was corrected to describe the real multi-source chain instead of
only naming the manual Operations Report.

## Live verification (measured, not reasoned)

Queried `qsr_sales_mix` directly (service-role key) for loc `0003708`, Nov 1–12 2026:

```
2026-11-11: net_sales_amt=11071.62, net_sales_dthru_amt=8530.24  -> 77.05%
2026-11-12: net_sales_amt=11695.42, net_sales_dthru_amt=8608.70  -> 73.61%
SUM net_sales_amt (12 days):        134,753.70
SUM net_sales_dthru_amt (12 days):   98,323.22
Sum/Sum DT% = 72.97%
```

This matches the owner's own QSRSoft screenshot EXACTLY — both the daily values (77.05%,
73.61%, …) and the MTD total (72.97%, $98,323.22 DT sales). `sales_ledger_daily` (the emailed
stream, first in `dtMixPct`'s chain) was also confirmed fresh and correct through 2026-11-11;
`qsr_sales_mix` (the derive fallback) correctly fills the 1-2 most recent days the emailed
stream hasn't caught up to yet (11/12–11/13 at measurement time) — exactly the gap-filling
behavior the chain was designed for, now actually reachable from this panel.

## Scope note

`src/engine/channel-mix.js` / `src/views/channel-mix.js` (`ChannelMixPanel`, a separate Reports
Hub report) already sources correctly through `ds.salesLedgerRows` directly and was not
affected by this bug or this fix — a different file, a different nav entry, pre-existing and
unrelated to `delivery-mix.js`'s `DeliveryMixPanel`. Do not conflate the two when revisiting
channel-mix work.

Regression coverage:
`src/__tests__/dispatch-delivery-mix-autofirst-sourcing-2026-11-13.test.js` (4 tests) — proves
the panel no longer reads `ds.laborByLoc`, resolves DT% via the real Sum/Sum ratio (not a mean
of daily percentages), and shows an honest no-data state rather than 0.00%.

## Scoped pass elsewhere (owner request, 2026-11-13 — "make the fix applied here apply
elsewhere where data may be impacted")

Audited every other direct read of `ds.laborRows`/`ds.laborByLoc`/`ds.ctrlRows`/`ds.opsRows`/
`ds.fobRows` across `src/` for the same bug class (a displayed percentage/ratio sourced
manual-only when an auto-first `metric-source.js` chain already exists and isn't used).
Checked the highest-traffic, highest-risk candidates by hand:

- **at-a-glance.js CI/Drift computation** (`locRows(ds.laborByLoc, ds.laborRows, loc)`,
  lines ~2139/2181) — reads only `.sales`/`.date` to re-run `forecastDay` for calibration
  backtesting. `.sales` is already auto-supplemented at the pipeline level
  (`labor-supplement.js`'s `supplementLaborWithSched` blends in `qsrActSummaryRows` for the
  sales figure specifically — auto wins on any overlapping day, fills days with zero manual
  coverage). Not the bug class; this is the correct, already-established pattern.
- **labor-tools.js** (`LaborAnalyticsPanel`) — every rate metric (laborPct/tpph/otHrs/
  actVsNeed/avgRate/crewHrs/otCost/sales) already routes through `metricAvg`/`metricRate`/
  `metricSeries` per dispatches #68/#155/#175/#324. The remaining raw `ds.laborRows`/
  `ds.ctrlRows` reads are a manual-coverage-count diagnostic (`dowStats`'s `all`, explicitly
  commented as deliberate) and the store-inclusion gate (also explicit) — not metric values.
- **promo-roi.js** (`buildDailyRecords`) — sales/GC merge priority is glimpse → salesLedger →
  laborRows → qsrActSummary; discount merge is `opsCashRows` (auto-pulled `qsr_cash_sheet`)
  before `ctrlRows` (manual). Already auto-first, already documented (dispatch-111/113).
- **eom-supervisor.js** (`computeStoreEOM`) — manual FOB/Labor/Controls uploads are
  INTENTIONALLY preferred here (dispatch #52): EOM is a monthly submission workflow where the
  manual figure IS the authoritative one, with an explicit auto-first "backstop" fallback only
  when the manual submission is missing for the period. Correct by design, not the same bug
  shape (manual-preferred-on-purpose vs. delivery-mix's manual-only-with-no-fallback-at-all).
- **scheduling.js** (`OpportunityReport`) — builds a `dsShim` and explicitly treats
  `laborRows`/`ctrlRows` as "only a LAST-RESORT fill for a loc/date the cloud streams [don't
  cover]" (comment at line ~353). Already auto-first.
- **store-analytics.js:2145** — a raw `ds.laborRows` filter, but it's an auto-calibration
  trigger gate (counts new rows since last run), not a displayed metric.

**Conclusion: no other real instance of this bug class found.** The codebase has already
been through repeated, well-documented sweeps closing this exact pattern (dispatch #52, #64,
#68, #104, #155, #175, #309, #324, "data-integrity sweep signature #2") everywhere except
`delivery-mix.js`, which slipped through specifically because dispatch #201 (the Channel
Intel merge) explicitly deferred its sourcing fix at the time. No code changes made in this
pass — this is a documented clean bill, not a fix.
