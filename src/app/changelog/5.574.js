// @ts-nocheck
export default {version:'5.574', date:'2026-10-16', changes:[
  'Reports redesign Phase 4 (owner request, completing the Phase 1-3 arc): the Custom Report ' +
  'Builder, under its own "Custom Reports" category in the Reports Hub (🧩). Owner\'s ask, ' +
  'verbatim: pick any metrics from the full catalog, side by side, over a date range and ' +
  'scope -- build a custom report and save it out. Built on the same ReportShell (Phase 2) and ' +
  'the same Phase 1 reconciled metric catalog (signal-registry.js\'s METRIC_CATEGORIES) every ' +
  'other report in the redesign already uses -- no second resolution path.',
  'The picker (engine/custom-report.js\'s customReportCatalog) offers every metric that supports ' +
  'a date-range report (granularity includes \'daily\' -- a monthly-only metric like salesVsLY ' +
  'has nothing to return through a range) and is forward-looking-filtered: a metric that sets a ' +
  '`perm` the caller lacks is hidden from the picker entirely (owner decision: must hide any ' +
  'payroll.view-gated metric, or a future tightly-scoped one, from a builder who lacks that ' +
  'permission). No metric in today\'s catalog sets `perm` yet, so this ships as a real, tested ' +
  'mechanism with nothing to hide today -- not a speculative stub.',
  'Saved definitions (supabase/schema-custom-reports.sql\'s custom_reports table) are shareable ' +
  'across roles per owner decision 2: a DO/Owner can build one and mark it shared, and a GM can ' +
  'load and run it -- but only its author can edit/delete it (RLS: select allows own-or-shared, ' +
  'write is owner-only). Sharing the DEFINITION (which metrics) never widens what DATA a viewer ' +
  'pulls -- every run still resolves live through metricValueForRange() against the viewer\'s own ' +
  'accessible_locs-scoped ds, same boundary every other panel already respects. The table holds ' +
  'no per-store rows at all, which is why -- unlike pay_events.sql -- it carries no my_locs() ' +
  'restrictive policy.',
  '⚠️ Needs manual action: supabase/schema-custom-reports.sql has NOT been applied -- this ' +
  'session has no direct Postgres connection, only the REST API, so it cannot run a DDL migration ' +
  'live. Run it once in the Supabase SQL editor before Save/Load/Share will persist anything; ' +
  'until then the panel fails soft (empty saved list, "Save failed" message), same "degrades, ' +
  'doesn\'t crash" contract every other not-yet-migrated table in this app already follows.',
  'Caught and fixed two real bugs in the same pass, before they shipped: a missing closing ' +
  'paren in the metric-picker JSX (would have failed the production build outright) and a ' +
  'mis-written `_label` helper that returned a React element instead of a function (would have ' +
  'thrown "is not a function" on every render) -- both found by writing the panel\'s own render ' +
  'test, not by code review alone.',
  '20 new tests (engine: catalog filtering incl. the perm-gating mechanism, row-building against ' +
  'real metricValueForRange, stale-key/no-data degradation; panel: pick/run/remove/export against ' +
  'real figures, save-failure surfacing with a mocked supabase client; catalog: the new category ' +
  'and its perm boundary) plus shell-nav-snapshot/panel-registry updated for the real nav entry. ' +
  'Full suite green (624/624 files, 5878/5878 tests), build clean, within budget (563.99 KB ' +
  'eager / 850 KB budget -- custom-report-builder.js lands in its own real lazy chunk, 7.69 KB / ' +
  '2.98 KB gzip, confirmed not in the eager preload list). Full writeup: ' +
  'memory/project-reports-redesign.md.',
]};
