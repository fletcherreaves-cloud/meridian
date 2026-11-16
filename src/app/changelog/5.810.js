// @ts-nocheck
export default {version:'5.810', date:'2026-11-16', changes:[
  '**labor_analysis_daily / labor_exceptions_daily wired into ds.laborRows / ds.exceptionRows** ' +
  '— owner request: "go ahead and wire it in its own careful pass." App.js now merges both ' +
  'emailed-report tables in at startup, additively by (loc, date) — an existing row (manual ' +
  'upload, or the thin labor_rows table merged just above it) always wins on a day already ' +
  'covered; the new tables only fill genuinely uncovered days. The merge step itself ' +
  '(mergeFreshRowsByLocDate) is pulled out as one shared, directly tested function instead of ' +
  'duplicated inline logic. This activates two previously-dormant consumers for real once data ' +
  'flows through: insights.js\'s exception-vs-OT-hours correlation signal and the coverage ' +
  'checks that depend on ds.exceptionRows having rows at all.',
  '**Real bug caught and fixed before it shipped further: the write-side email-parse script\'s ' +
  'camelCase-to-snake_case column mapper split consecutive capital letters apart** (mopGC → ' +
  'mop_g_c, actualGC → actual_g_c, 9 fields total) instead of matching labor_analysis_daily\'s ' +
  'real columns (mop_gc, actual_gc, …) — meaning every upsert carrying one of those fields has ' +
  'been failing outright with a Postgres "column does not exist" error since labor_analysis_daily ' +
  'went live earlier today (v5.804), silently (upsertRows logs it and continues). Caught by a new ' +
  'test that checks the real mapping against the actual schema DDL, not by assuming the write ' +
  'and read sides agreeing with each other meant either was right. Fixed in both ' +
  'scripts/qsrsoft-email-parse.mjs and the new read-side loader with the same corrected ' +
  'lowercase-before-uppercase transform plus one explicit override (salesVsLYPct, an acronym ' +
  'case no generic transform resolves). The script\'s main() is now guarded behind the standard ' +
  'import.meta.url check (matching other pull scripts) so its pure mapping functions are ' +
  'unit-testable without running the real pull.',
]};
