// @ts-nocheck
export default {version:'5.445', date:'2026-09-15', changes:[
  'Performance Trends -- Store Detail: fixed a real data-accuracy bug the owner caught while ' +
  'cross-referencing Labor % store-by-store against a real QSRSoft export ("I don\'t think I ' +
  'have found a single store match"). Root cause: unlike Email Summary (fixed in v5.444 for the ' +
  'identical class of bug), Store Detail computed its 3 stacked periods straight off the `ds` ' +
  'prop -- whose default load window (App.js) is only ~60 days back. "Two Months Back" is a full ' +
  'calendar month that starts well outside that window on most days of the month, so it was ' +
  'silently truncated to whatever partial tail happened to still be in range (verified: for a ' +
  'session opened 2026-09-15, July 1-16 was missing entirely). Measured effect before the fix: ' +
  'per-store Labor % diffs up to 2.23 percentage points against the real QSRSoft Operations ' +
  'Report, on every one of 27 stores. Fixed the same way Email Summary was: Store Detail now ' +
  'fetches its own sufficiently-deep window on first entering that mode (loadQsrActSummary / ' +
  'loadOpsLaborSummary / loadQsrFob / loadOpsCashSheet, sized to the oldest stacked period, never ' +
  'less than the old 60-day default), overlaying (not merging into) the global `ds` arrays so ' +
  'every metric a Store Detail column can show (sales/gc/tpph/oepe/r2p/avgCheck/laborPct/fobPct/' +
  'cashOSPct/discPct) is computed from a real, complete month. Re-measured after the fix against ' +
  'the same real QSRSoft export: max per-store diff dropped to 0.047pp (the same small residual ' +
  'already reported to QSRSoft support separately), average diff 0.006pp across all 27 stores.',
  'Performance Trends -- Store Detail: added the 3 requested owner follow-ups. (1) CSV export and ' +
  'Print were already shipped for this view (v5.444) -- confirmed working, no change needed. ' +
  '(2) Every column header (Rank/Loc #/Location/metric value/Percentile) is now clickable to sort ' +
  'the displayed rows, independent of the underlying best-to-worst rank/percentile (which never ' +
  'recomputes). (3) Added a Loc # column (and to CSV/print exports) alongside the store name, so ' +
  'a row can be matched directly against a QSRSoft export without a name lookup.',
  '9 new/extended tests (src/__tests__/dispatch-trend-report-2026-09-14.test.js, 24->33 cases), ' +
  'including a regression test that fixtures `ds` with an absurd, clearly-wrong Two-Months-Back ' +
  'value and asserts the panel shows the CORRECT figure from its own fetch instead -- would fail ' +
  'if this bug were reintroduced. Full suite 514/514 files, 4935/4935 tests (1 pre-existing, ' +
  'unrelated date-boundary flake in eom-share-links-manage.test.js, confirmed failing identically ' +
  'with this change reverted). Build clean, eager payload 547.50 KB / 850 KB budget (flat).',
]};
