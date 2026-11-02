#!/usr/bin/env node
// scripts/lifelenz-employee-performance-pull.mjs — LifeLenz Data Explorer "Employee
// Performance" pull. Third automated pull against the Data Explorer Lakehouse backend (see
// scripts/lifelenz-compliance-audit-pull.mjs for the trigger→poll→download mechanism this
// reuses verbatim).
//
// Confirmed live (GitHub Actions run 41371639603, 2026-11-02, scripts/lifelenz-employee-
// performance-meta-probe.mjs): reportKey='employee_performance_report' is real, 30 columns
// (memory/lifelenz-session.md's existing ~29-field representative list undercounted by one —
// measure, don't trust the memory count). The real CSV capture also settled the one genuinely
// open design question: unlike Compliance Audit/Schedule Variance (both per-EVENT logs with a
// real id/date per row), this report has NO date column at all — every column is a COUNT or
// RATE aggregated across the ENTIRE requested date range for that employee (one row per
// employee per store, period-wide). So this table's grain and primary key are synthesized by
// the pull's own rolling window, exactly like lifelenz_attendance_summary's (loc, period_end)
// pattern — period_end advances by one day on each daily run, so re-running naturally produces
// a new trend point rather than clobbering history. See supabase/schema-lifelenz-employee-
// performance.sql's header for the full reasoning (including why no `raw` JSONB bucket is
// needed here, unlike Compliance Audit).
//
// Required env vars: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LIFELENZ_TOKEN
// Optional: LIFELENZ_EMPLOYEE_PERFORMANCE_WINDOW_DAYS (default 14), LIFELENZ_DEBUG (1 = verbose)

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { logPartitionCoverage, checkFreshness } from './_pipeline-contract.mjs';

const BASE          = 'https://us01-connect.lifelenz.com';
const GRAPHQL_URL   = `${BASE}/manager/graphql`;
const BUSINESS_ID   = '01979dbf-a166-759b-8702-aba9915c578e';
const REPORT_KEY    = 'employee_performance_report';
const WINDOW_DAYS   = parseInt(process.env.LIFELENZ_EMPLOYEE_PERFORMANCE_WINDOW_DAYS || '14', 10);
const DEBUG         = process.env.LIFELENZ_DEBUG === '1';

const supabase = safeCreateClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const toISO  = d => d.toISOString().slice(0, 10);
const addDay = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const sleep  = ms => new Promise(r => setTimeout(r, ms));

// Identical header shape to lifelenz-compliance-audit-pull.mjs/lifelenz-schedule-variance-pull.mjs.
function lakehouseHeaders(token) {
  return {
    'Content-Type':      'application/json',
    'Accept':            '*/*',
    'X-Auth-Token':       token,
    'X-Lifelenz-Device':  'webadmin',
    'X-Version':          '1.78.11',
    'Origin':             'https://admin.lifelenz.com',
    'Referer':            'https://admin.lifelenz.com/',
  };
}

async function graphql(token, operationName, variables, query) {
  const resp = await fetch(`${GRAPHQL_URL}?${operationName}`, {
    method: 'POST',
    headers: lakehouseHeaders(token),
    body: JSON.stringify({ operationName, variables, query }),
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  const data = await resp.json();
  if (data?.errors) throw new Error(`GraphQL error: ${JSON.stringify(data.errors).slice(0, 300)}`);
  return data?.data;
}

// Same discovery + store filter as the other two Data Explorer pulls (kept in sync manually —
// not worth a shared module for one ~15-line block, per this repo's existing precedent).
async function getStoreSchedules(token) {
  const resp = await fetch(`${BASE}/api/admin/businesses/${BUSINESS_ID}/schedules`, {
    headers: {
      'X-Auth-Token': token, 'X-Business-Id': BUSINESS_ID, 'X-Lifelenz-Device': 'webadmin',
      'X-Version': '1.78.11', 'Accept': 'application/json',
    },
  });
  console.log('[schedules] discovery →', resp.status);
  if (!resp.ok) throw new Error(`schedules ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const data = await resp.json();
  const stores = (data?.data || [])
    .filter(s => s.attributes?.schedule_status === 'active')
    .filter(s => /\b\d{4,7}\b/.test(s.attributes?.schedule_name || s.attributes?.code || ''))
    .map(s => ({ id: s.id, name: s.attributes.schedule_name || s.attributes.code || s.id }));
  console.log(`[schedules] ${stores.length} store schedules after filter`);
  return stores;
}
function locFromName(name) {
  const m = String(name || '').match(/\b(\d{4,7})\b/);
  return m ? m[1].padStart(7, '0') : null;
}

const ASYNC_REPORT_FRAGMENT = `fragment asyncReportFields on AsyncReport {
  id businessId scheduleId status reportName requestingEmploymentId createdAt updatedAt
  enqueuedAt generatedAt expiresAt cancelledAt contentType params url error
}`;

const GET_REPORT_DATA_CSV_ASYNC = `query GetReportDataCsvAsync($businessId: ID!, $reportKey: String!, $dateRangeStart: ISO8601Date, $dateRangeEnd: ISO8601Date, $sortOrder: [LakehouseSortOrderInput!], $groupBy: [String!], $filters: [LakehouseFilterInput!], $columns: [String!], $groupLevel: Int) {
  lakehouseReportDataCsvAsync(
    businessId: $businessId
    reportKey: $reportKey
    dateRangeStart: $dateRangeStart
    dateRangeEnd: $dateRangeEnd
    sortOrder: $sortOrder
    groupBy: $groupBy
    filters: $filters
    columns: $columns
    groupLevel: $groupLevel
  ) {
    ...asyncReportFields
  }
}
${ASYNC_REPORT_FRAGMENT}`;

const ASYNC_REPORTS_QUERY = `query AsyncReports($businessId: ID!, $ids: [ID!]) {
  asyncReports(businessId: $businessId, ids: $ids) {
    nodes { ...asyncReportFields }
    totalCount
  }
}
${ASYNC_REPORT_FRAGMENT}`;

const GET_REPORT_META_QUERY = `query GetReportMeta($businessId: ID!, $reportKey: String!) {
  lakehouseReportMeta(businessId: $businessId, reportKey: $reportKey) {
    columns { name member shortTitle columnType memberType aggType configGroup groupable groupablePosition defaultVisible position defaultSortDirection defaultSortPosition restrictedUsages }
    dateRangePresets
    defaultDateRange
    entityFilters { member label query defaultMode allowAll multi }
    defaultFilters { values operator member }
    defaultGroupBy
    grandTotals
    timeZoneColumn
    configVersion
    disclaimer
  }
}`;

// The two fields every real row must carry — both confirmed real column members (live
// GetReportMeta discovery, run 41371639603). Unlike Compliance Audit's compliance_warning_id
// (a real per-violation id), this report has no natural per-row id, so geid + employee_name
// are the gate — same anti-false-positive discipline (a metadata/title row with the right
// column count must not be mistaken for the header).
const GATE_MEMBERS = ['employees_geid', 'employees_employee_name'];

// All 30 real columns promoted — see schema-lifelenz-employee-performance.sql's header for why
// no `raw` JSONB bucket is needed here (unlike Compliance Audit's 42-column report with a long
// tail of rarely-used fields).
const PROMOTED_MEMBERS = {
  employees_employee_name:              'employee_name',
  employees_geid:                       'geid',
  employees_employee_name_last_first:   'employee_name_last_first',
  employees_employee_id:                'lifelenz_employee_id',
  employees_current_status:             'employment_status',
  employees_employment_type_name:       'employment_type',
  employees_minor_age:                  'minor_age',
  employees_is_salaried:                'is_salaried',
  employees_is_manager:                 'is_manager',
  absent_count:                         'absent_count',
  late_count:                           'late_count',
  no_punch_count:                       'no_punch_count',
  attendance_rate:                      'attendance_rate',
  scheduled_count:                      'scheduled_count',
  worked_count:                         'worked_count',
  unscheduled_count:                    'unscheduled_count',
  drop_approved_count:                  'drop_approved_count',
  drop_rate:                            'drop_rate',
  pickup_request_count:                 'pickup_request_count',
  pickup_approved_count:                'pickup_approved_count',
  total_worked_hours:                   'total_worked_hours',
  disciplinary_action_count:            'disciplinary_action_count',
  commendation_count:                   'commendation_count',
  leave_days_requested:                 'leave_days_requested',
  leave_days_approved:                  'leave_days_approved',
  swap_manager_approved_count:          'swap_manager_approved_count',
  swap_rate:                            'swap_rate',
};

// Same fully-qualified-member-name trap Compliance Audit's build hit: GetReportMeta's own
// columns[].member/.name come back prefixed "employee_performance_report.<field>", not bare.
function stripReportPrefix(m) {
  const prefix = REPORT_KEY + '.';
  return m && m.startsWith(prefix) ? m.slice(prefix.length) : m;
}

async function fetchReportMeta(token) {
  const data = await graphql(token, 'GetReportMeta', { businessId: BUSINESS_ID, reportKey: REPORT_KEY }, GET_REPORT_META_QUERY);
  const meta = data?.lakehouseReportMeta;
  if (!meta) throw new Error(`GetReportMeta returned null for reportKey=${REPORT_KEY} — report may have been renamed/removed`);
  const columns = meta.columns || [];
  if (!columns.length) throw new Error('GetReportMeta returned zero columns');
  return columns.map(c => ({ ...c, member: stripReportPrefix(c.member), name: stripReportPrefix(c.name) }));
}

async function triggerReport(token, scheduleId, startDate, endDate, columnMembers) {
  const variables = {
    businessId: BUSINESS_ID, reportKey: REPORT_KEY,
    dateRangeStart: toISO(startDate), dateRangeEnd: toISO(endDate),
    sortOrder: [{ member: `${REPORT_KEY}.employees_employee_name`, direction: 'asc' }],
    groupBy: [`${REPORT_KEY}.locations_location_name`, `${REPORT_KEY}.employees_employee_name`],
    filters: [{ member: `${REPORT_KEY}.locations_location_id`, operator: 'equals', values: [scheduleId] }],
    columns: columnMembers,
  };
  const data = await graphql(token, 'GetReportDataCsvAsync', variables, GET_REPORT_DATA_CSV_ASYNC);
  const report = data?.lakehouseReportDataCsvAsync;
  if (!report?.id) throw new Error(`no report id in response: ${JSON.stringify(data).slice(0, 300)}`);
  return report;
}

// Identical batched-poll strategy to the other two Data Explorer pulls.
async function pollAsyncReports(token, ids, { maxAttempts = 15, intervalMs = 4000 } = {}) {
  const pending = new Set(ids);
  const resolved = new Map();
  for (let attempt = 0; attempt < maxAttempts && pending.size; attempt++) {
    if (attempt > 0) await sleep(intervalMs);
    let data;
    try {
      data = await graphql(token, 'AsyncReports', { businessId: BUSINESS_ID, ids: [...pending] }, ASYNC_REPORTS_QUERY);
    } catch (e) {
      console.warn(`[poll] attempt ${attempt + 1} failed: ${e.message} — retrying`);
      continue;
    }
    const nodes = data?.asyncReports?.nodes || [];
    for (const n of nodes) {
      if (n.url || n.error || n.cancelledAt) {
        resolved.set(n.id, n);
        pending.delete(n.id);
      }
    }
    if (DEBUG) console.log(`[poll] attempt ${attempt + 1}: ${resolved.size}/${ids.length} resolved, ${pending.size} still pending`);
  }
  return { resolved, stillPending: pending };
}

async function downloadReport(token, report) {
  if (report.error) throw new Error(`report generation error: ${report.error}`);
  if (!report.url) throw new Error(`report has no url (status=${report.status})`);
  let resp = await fetch(report.url, { headers: lakehouseHeaders(token) });
  if (!resp.ok) {
    if (DEBUG) console.log(`[download] full-header request got HTTP ${resp.status}, retrying with X-Auth-Token only`);
    resp = await fetch(report.url, { headers: { 'X-Auth-Token': token } });
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`download HTTP ${resp.status}${body ? ': ' + body.slice(0, 200) : ''}`);
  }
  return await resp.text();
}

function parseCsvLine(line) {
  const cells = [];
  let cur = '', inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQuotes = !inQuotes; }
    else if (c === ',' && !inQuotes) { cells.push(cur); cur = ''; }
    else { cur += c; }
  }
  cells.push(cur);
  return cells.map(c => c.trim().replace(/^"|"$/g, ''));
}

function buildLabelMap(metaColumns) {
  const map = new Map();
  for (const c of (metaColumns || [])) {
    if (!c?.member) continue;
    for (const label of [c.name, c.shortTitle, c.member]) {
      if (!label) continue;
      const key = String(label).toLowerCase();
      if (!map.has(key)) map.set(key, c.member);
    }
  }
  return map;
}

// Scans every line (not a fixed index) for the one whose cells resolve BOTH gate members by
// exact label match via the dynamic label map — same anti-false-positive discipline as
// Compliance Audit/Schedule Variance. periodStart/periodEnd are passed in from the caller's own
// request window (this report has no per-row date column to read them from).
function parseEmployeePerformanceCSV(text, metaColumns, periodStart, periodEnd) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const labelMap = buildLabelMap(metaColumns);

  const tryHeaderAt = (idx) => {
    const headerCells = parseCsvLine(lines[idx]).map(h => h.trim());
    const idxOfMember = member => headerCells.findIndex(h => labelMap.get(h.toLowerCase()) === member);
    const gateIdx = GATE_MEMBERS.map(idxOfMember);
    if (gateIdx.some(i => i < 0)) return null;
    const promotedIdx = {};
    for (const [member, key] of Object.entries(PROMOTED_MEMBERS)) promotedIdx[key] = idxOfMember(member);
    return { headerRowIdx: idx, promotedIdx };
  };

  let found = null;
  for (let i = 0; i < Math.min(lines.length, 10) && !found; i++) found = tryHeaderAt(i);
  if (!found) {
    console.warn('[parse] could not locate the header row in the first 10 lines — shape drifted, not guessing.');
    if (DEBUG) console.log('[parse] raw first 5 lines:', JSON.stringify(lines.slice(0, 5)));
    return [];
  }
  const { headerRowIdx, promotedIdx } = found;
  const get = (cells, key) => { const i = promotedIdx[key]; return (i != null && i >= 0) ? (cells[i] ?? null) : null; };
  const num = v => { if (v == null || v === '') return null; const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const int = v => { if (v == null || v === '') return null; const n = parseInt(v, 10); return Number.isFinite(n) ? n : null; };
  const bool = v => (v == null || v === '') ? null : /^(true|yes|1)$/i.test(String(v).trim());

  const rows = [];
  for (let i = headerRowIdx + 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const geid = get(cells, 'geid');
    const employeeName = get(cells, 'employee_name');
    if (!geid || !employeeName) continue;

    rows.push({
      geid,
      employee_name: employeeName,
      employee_name_last_first: get(cells, 'employee_name_last_first'),
      lifelenz_employee_id: get(cells, 'lifelenz_employee_id'),
      employment_status: get(cells, 'employment_status'),
      employment_type: get(cells, 'employment_type'),
      minor_age: int(get(cells, 'minor_age')),
      is_salaried: bool(get(cells, 'is_salaried')),
      is_manager: bool(get(cells, 'is_manager')),
      absent_count: int(get(cells, 'absent_count')),
      late_count: int(get(cells, 'late_count')),
      no_punch_count: int(get(cells, 'no_punch_count')),
      attendance_rate: num(get(cells, 'attendance_rate')),
      scheduled_count: int(get(cells, 'scheduled_count')),
      worked_count: int(get(cells, 'worked_count')),
      unscheduled_count: int(get(cells, 'unscheduled_count')),
      drop_approved_count: int(get(cells, 'drop_approved_count')),
      drop_rate: num(get(cells, 'drop_rate')),
      pickup_request_count: int(get(cells, 'pickup_request_count')),
      pickup_approved_count: int(get(cells, 'pickup_approved_count')),
      total_worked_hours: num(get(cells, 'total_worked_hours')),
      disciplinary_action_count: int(get(cells, 'disciplinary_action_count')),
      commendation_count: int(get(cells, 'commendation_count')),
      leave_days_requested: num(get(cells, 'leave_days_requested')),
      leave_days_approved: num(get(cells, 'leave_days_approved')),
      swap_manager_approved_count: int(get(cells, 'swap_manager_approved_count')),
      swap_rate: num(get(cells, 'swap_rate')),
      period_start: periodStart,
      period_end: periodEnd,
    });
  }
  return rows;
}

async function upsertRows(loc, rows) {
  if (!rows.length) return 0;
  const payload = rows.map(r => ({
    tenant_id: '00000000-0000-0000-0000-000000000001',
    loc, updated_at: new Date().toISOString(), ...r,
  }));
  const CHUNK = 500;
  let saved = 0;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const slice = payload.slice(i, i + CHUNK);
    const { error } = await supabase.from('lifelenz_employee_performance').upsert(slice, { onConflict: 'loc,geid,period_end' });
    if (error) { console.warn(`[supabase] upsert error for ${loc}:`, error.message); continue; }
    saved += slice.length;
  }
  return saved;
}

async function getLatestPeriodEnd() {
  const { data, error } = await supabase
    .from('lifelenz_employee_performance')
    .select('period_end')
    .order('period_end', { ascending: false })
    .limit(1);
  if (error) { console.warn('[freshness] could not read latest period_end:', error.message); return null; }
  return data?.[0]?.period_end ? new Date(data[0].period_end + 'T00:00:00') : null;
}

async function main() {
  const token = process.env.LIFELENZ_TOKEN;
  if (!token) { console.error('[auth] LIFELENZ_TOKEN required (no Playwright fallback in this pull — matches the other two Data Explorer pulls\' precedent).'); process.exit(1); }

  const latestPeriodEnd = await getLatestPeriodEnd();
  const fresh = checkFreshness(latestPeriodEnd, { warnAfterHours: 30, errorAfterHours: 54, label: 'lifelenz-employee-performance-pull' });
  if (fresh.message) (fresh.status === 'error' ? console.error : console.warn)(fresh.message);

  // periodEnd = yesterday, same reasoning as lifelenz-attendance-pull.mjs: "today" may be
  // partial, so a window ending today would understate the current, still-accumulating day.
  const periodEnd   = addDay(new Date(), -1);
  const periodStart = addDay(periodEnd, -(WINDOW_DAYS - 1));
  console.log(`[lifelenz-employee-performance-pull] window: ${toISO(periodStart)} → ${toISO(periodEnd)} (${WINDOW_DAYS}d)`);

  const metaColumns = await fetchReportMeta(token);
  console.log(`[meta] ${metaColumns.length} real columns for ${REPORT_KEY}`);
  if (DEBUG) console.log('[meta] columns:', JSON.stringify(metaColumns.map(c => ({ member: c.member, name: c.name }))));
  const columnMembers = metaColumns.map(c => c.member);

  const schedules = await getStoreSchedules(token);
  if (!schedules.length) { console.error('[schedules] no store schedules found.'); process.exit(1); }

  const tracker = makeOutcomeTracker('lifelenz-employee-performance-pull');
  const requestedUnits = schedules.map(s => s.name);
  const coveredSchedules = new Set();
  const allScheduleIds = schedules.map(s => s.id);

  const byReportId = new Map();
  const triggeredIds = [];
  for (const schedule of schedules) {
    const loc = locFromName(schedule.name);
    if (!loc) { tracker.fail(schedule.name, 'could not derive loc from schedule name'); continue; }
    try {
      const report = await triggerReport(token, schedule.id, periodStart, periodEnd, columnMembers);
      byReportId.set(report.id, { schedule, loc });
      triggeredIds.push(report.id);
      if (DEBUG) console.log(`  [trigger] ${schedule.name} (loc ${loc}) → report ${report.id}`);
    } catch (e) {
      console.warn(`  [trigger] ${schedule.name}: ${e.message}`);
      tracker.fail(schedule.name, e.message);
    }
  }

  let totalSaved = 0;
  let totalParsed = 0;
  if (!triggeredIds.length) {
    console.error('[lifelenz-employee-performance-pull] ✗ no reports triggered — nothing to poll');
  } else {
    console.log(`[poll] waiting on ${triggeredIds.length} triggered report(s)…`);
    const { resolved, stillPending } = await pollAsyncReports(token, triggeredIds);
    for (const reportId of stillPending) {
      const ctx = byReportId.get(reportId);
      tracker.fail(ctx?.schedule.name || reportId, 'report never resolved within poll budget');
    }

    for (const [reportId, report] of resolved) {
      const ctx = byReportId.get(reportId);
      if (!ctx) continue;
      const { schedule, loc } = ctx;
      try {
        const csvText = await downloadReport(token, report);
        const rows = parseEmployeePerformanceCSV(csvText, metaColumns, toISO(periodStart), toISO(periodEnd));
        if (!rows.length) { console.log(`  ${schedule.name} (loc ${loc}): no employee rows in window`); coveredSchedules.add(schedule.id); continue; }
        totalParsed += rows.length;
        const saved = await upsertRows(loc, rows);
        totalSaved += saved;
        // Same outcome-tracker correctness fix as the other two Data Explorer pulls (dispatch
        // 2026-11-02): a store is only "covered" when it actually wrote something — a
        // parsed-but-unsaved row (e.g. a table that hasn't been migrated to production yet) is
        // a real write failure and must show up as one, not be silently absorbed into coverage.
        if (saved === 0) {
          tracker.fail(schedule.name, `parsed ${rows.length} row(s) but saved 0 — upsert write failure`);
        } else {
          coveredSchedules.add(schedule.id);
          if (saved < rows.length) tracker.fail(schedule.name, `upsert saved only ${saved}/${rows.length} parsed row(s)`);
        }
        console.log(`  ${schedule.name} (loc ${loc}): ${rows.length} employee row(s) parsed, ${saved} saved`);
      } catch (e) {
        console.warn(`  ${schedule.name} (loc ${loc}): ${e.message}`);
        tracker.fail(schedule.name, e.message);
      }
    }
    console.log(`[lifelenz-employee-performance-pull] ✓ ${totalSaved} row(s) saved across ${coveredSchedules.size}/${schedules.length} stores`);
  }

  logPartitionCoverage(coveredSchedules, allScheduleIds, { label: 'lifelenz-employee-performance-pull', kind: 'schedule' });
  const code = tracker.finalize({
    requestedUnits,
    totalSaved: totalParsed > 0 ? totalSaved : coveredSchedules.size,
    formatRerun: () => 're-run the whole workflow — no per-store rerun flag exists yet',
  });
  if (code) process.exit(code);
}

// Exported for src/__tests__/lifelenz-employee-performance-pull.test.js.
export { parseEmployeePerformanceCSV, buildLabelMap, locFromName, stripReportPrefix };
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('[lifelenz-employee-performance-pull] fatal error:', err);
    process.exit(1);
  });
}
