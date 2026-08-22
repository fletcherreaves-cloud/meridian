// @ts-nocheck
export default {version:'5.107', date:'2026-08-22', changes:[
  'Dispatch #68 -- LaborAnalyticsPanel was dropping every store from its default view, '
  + "district-wide, right now. data-sourcing-standard.md's stale-exclusion list flagged this "
  + 'panel as suspicious right after #64 proved its sibling entry wrong -- checked before writing '
  + "anything up, not assumed from the doc. Half the doc's premise was itself stale: a prior "
  + 'dispatch (#324) had already migrated laborPct/tpph/otHrs/actVsNeed/actHrs/salaryMgrHrs/otCost '
  + "to metric-source.js's auto-first chains, but the STORE-INCLUSION GATE was never updated to "
  + "match -- it still checked raw manual laborRows/ctrlRows presence, dropping a store's row "
  + "entirely even when every metric it needs would have resolved from auto DAR/opsLaborRows "
  + "data.\n\n"
  + 'Measured live before implementing (service-role key, 28-day window, all 27 stores): manual '
  + 'labor_rows/ctrl_rows have been completely EMPTY district-wide (0/27 stores) for at least 28 '
  + 'days, while auto DAR + qsr_labor_summary cover all 27. The panel defaults to a 4-week '
  + 'trailing window. So this was not a theoretical edge case -- the old gate was dropping every '
  + 'single store from the default view, in production, today.\n\n'
  + "Fixed: locStats now includes a store if EITHER legacy manual rows exist OR any already-"
  + 'migrated metric actually resolved. totalSales now sums the auto-first sales daily series '
  + '(same period-total idiom the file already used for otCost) instead of raw manual rows only. '
  + "The top-level hasData guard (decides whether the WHOLE panel renders, or a dead-end \"No "
  + 'Labor Data Loaded\" screen) now also checks qsrActSummaryRows/opsLaborRows presence. Found '
  + 'and fixed a second, unrelated staleness bug in the same file while verifying the first: '
  + 'dowStats and trendData both carried a comment claiming actVsNeed "has no METRIC_SOURCES '
  + 'entry yet" -- false by the time either comment was written (verified against metric-source.js '
  + 'directly, not assumed) -- so both kept reading raw ds.laborRows for actVsNeed instead of the '
  + 'registered auto-first chain sitting right next to laborPct/tpph on the same lines. crewHrs '
  + 'genuinely has no auto source anywhere and correctly stays manual-only -- not every gap in '
  + 'this panel was the same bug.\n\n'
  + 'Revert-sensitive per the standing rule: a new test renders the ACTUAL LaborAnalyticsPanel '
  + 'consumer with a fixture matching the measured live state exactly (zero laborRows/ctrlRows, '
  + 'full auto coverage) -- an engine-level check of metric-source.js alone cannot tell "the chain '
  + 'resolves" from "the panel actually shows it." Stashed the fix and re-ran: the auto-only case '
  + 'failed exactly as expected (hit the dead-end screen), the true-empty and manual-only cases '
  + 'passed unchanged either way (their paths were never broken). Restored.\n\n'
  + 'Two structural ratchets needed their ceilings updated as a direct, expected, in-file-'
  + 'documented consequence of the fix, not a silent bump: R1 (raw metric-row reads) 162 -> 161 '
  + '(one dead ds.laborRows read removed), R3 (.getDay() count) 60 -> 62 (two new calls bucketing '
  + 'otHrs/actVsNeed by weekday, the same DOW-bucketing idiom the two adjacent, already-counted '
  + 'laborPct/tpph calls use -- not the week-start/business-day boundary math R3 exists to catch).'
  + '\n\n'
  + 'Out of scope, untouched: crewHrs (genuinely manual, correct); store-analytics.js\'s dowData '
  + '(the other unrechecked exclusion-list entry, not asked for this dispatch); weights, targets, '
  + 'bands. 2030/2030 tests (3 new), build clean, no entry-chunk change (labor-tools.js is lazy-'
  + 'loaded). Full writeup in memory/dispatch-68.md.',
]};
