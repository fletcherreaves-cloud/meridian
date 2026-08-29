// scripts/lib/scheduled-pull-registry.mjs — GitHub-workflow/Supabase wiring for
// scripts/scheduled-pull-watchdog.mjs (dispatch #210).
//
// src/engine/stream-freshness.js's STREAMS array stays the single source of truth for
// WHICH streams are critical (and their cadence) — it is what At-A-Glance's own
// freshness checklist reads. But STREAMS is keyed by a browser-side `dsField` (a field
// on the app's in-memory `ds` object, populated by an App.js loader from a Supabase
// table with its own column names) — a GitHub Actions watchdog has no `ds` and needs to
// query Supabase directly, plus know which .yml workflow file to re-dispatch. Neither
// of those exists on a dsField, so this is a small, ADDITIVE mapping keyed by the same
// `key` field STREAMS already uses, rather than a second hand-maintained list of which
// streams matter (src/__tests__/scheduled-pull-registry.test.js asserts the two files'
// key sets are identical in both directions, so they can't drift apart the way #171's
// duplicated stream lists did).
//
// `dateCol` is the column read for "how fresh is this table" (DATE grain — all current
// streams are daily). `clampToToday` matters for exactly one stream today: LifeLenz also
// publishes a forward SCHEDULE, so an unclamped `order by date desc limit 1` would read a
// future-dated row as "fresh" straight through an outage — the same skew
// stream-freshness.js's own `_latestDateOf` already guards against for the app-side
// check (see that file's comment on schedRows).
export const PULL_REGISTRY = {
  dar:         { table: 'qsr_daily_activity_rollup', dateCol: 'dt',   workflowFile: 'qsrsoft-dar-pull.yml' },
  fob:         { table: 'qsr_fob',                   dateCol: 'date', workflowFile: 'qsrsoft-pull.yml' },
  glimpse:     { table: 'daily_glimpse_daily',       dateCol: 'date', workflowFile: 'qsrsoft-email-parse.yml' },
  cashSheet:   { table: 'cash_sheet_daily',          dateCol: 'date', workflowFile: 'qsrsoft-email-parse.yml' },
  salesLedger: { table: 'sales_ledger_daily',        dateCol: 'date', workflowFile: 'qsrsoft-email-parse.yml' },
  opsCash:     { table: 'qsr_cash_sheet',            dateCol: 'dt',   workflowFile: 'qsrsoft-ops-pull.yml' },
  opsLabor:    { table: 'qsr_labor_summary',         dateCol: 'dt',   workflowFile: 'qsrsoft-ops-pull.yml' },
  opsService:  { table: 'qsr_service_stats',         dateCol: 'dt',   workflowFile: 'qsrsoft-ops-pull.yml' },
  opsSalesMix: { table: 'qsr_sales_mix',             dateCol: 'dt',   workflowFile: 'qsrsoft-ops-pull.yml' },
  lifelenz:    { table: 'lifelenz_schedule',         dateCol: 'date', workflowFile: 'lifelenz-pull.yml', clampToToday: true },
};
