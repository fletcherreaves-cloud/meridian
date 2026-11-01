#!/usr/bin/env node
// scripts/lifelenz-schedule-variance-pull.mjs — LifeLenz Data Explorer "Schedule Variance" pull.
//
// First automated pull against LifeLenz's NEW Data Explorer (distinct from the legacy
// admin.lifelenz.com "Download Reports" page scripts/lifelenz-pull.mjs already reads). The new
// Data Explorer runs on a "Lakehouse" backend with ASYNC report generation -- confirmed live,
// not guessed, via 7 owner-captured DevTools curls (2026-11-01, memory/lifelenz-session.md's
// "New Data Explorer" section has the full trail): trigger a report with
// `lakehouseReportDataCsvAsync(reportKey, filters, columns, ...)`, poll `asyncReports(ids)`
// until it resolves to a `url`, then GET that url for the CSV body. Same
// us01-connect.lifelenz.com host and X-Auth-Token credential as every other LifeLenz pull --
// only the request shape (GraphQL `manager/graphql`, not the REST schedules/report endpoints)
// is new.
//
// Schedule Variance is a shift-EDIT audit trail: who edited a published schedule, what value
// changed, when, and the resulting hours/cost impact. Column list is the EXACT confirmed
// `columns` the UI itself requests for this report (not guessed): locations_location_name,
// scheduled_shifts_scheduled_shift_id,
// employees_employee_name, original_value, updated_value, schedule_event_actors_employee_name,
// occurred_at, scheduled_hours_variance, cost_variance. This is NOT redundant with the existing
// lead-time-snapshot capture in lifelenz-pull.mjs (which tracks how far in advance a shift was
// published/edited relative to its start) -- Schedule Variance is a value-level before/after
// diff with the editor's name and the $ impact, a genuinely different axis.
//
// ⚠️ Two things this file cannot yet confirm without a live dispatch run:
//   1. The real AsyncReportStatusEnum values for "still generating" vs "done" vs "failed" --
//      pollAsyncReports() below is deliberately lenient (treats a populated `url` or `error` as
//      done regardless of the literal status string) rather than depending on exact enum text.
//   2. Whether the downloaded report URL wants the X-Auth-Token header or is a bare pre-signed
//      link -- downloadReport() tries with the header first, retries bare on a 401/403.
// Both are defensive-but-unverified; LIFELENZ_DEBUG=1 logs enough to diagnose either guess being
// wrong on the first real run.
//
// Also runs a READ-ONLY discovery pass (discoverReportMeta) against best-guess reportKey slugs
// for the other 4 Data Explorer tiles (Compliance Audit, Employee Performance, Payroll
// Readiness, Time Punch Activity Log) via `lakehouseReportMeta` -- logs their real column
// schema if a guess resolves, never fails the run if it doesn't. Informational only; nothing is
// built against those 4 yet (see memory/lifelenz-session.md).
//
// Required env vars: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LIFELENZ_TOKEN
// Optional: LIFELENZ_SCHEDULE_VARIANCE_WINDOW_DAYS (default 14), LIFELENZ_DEBUG (1 = verbose)

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { logPartitionCoverage, checkFreshness } from './_pipeline-contract.mjs';

const BASE          = 'https://us01-connect.lifelenz.com';
const GRAPHQL_URL   = `${BASE}/manager/graphql`;
const BUSINESS_ID   = '01979dbf-a166-759b-8702-aba9915c578e';
const REPORT_KEY    = 'schedule_variance_report';
const WINDOW_DAYS   = parseInt(process.env.LIFELENZ_SCHEDULE_VARIANCE_WINDOW_DAYS || '14', 10);
const DEBUG         = process.env.LIFELENZ_DEBUG === '1';

const supabase = safeCreateClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const toISO  = d => d.toISOString().slice(0, 10);
const addDay = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const sleep  = ms => new Promise(r => setTimeout(r, ms));

// Same header shape captured live off the real Data Explorer UI -- NOT apiHeaders() from
// lifelenz-pull.mjs/lifelenz-attendance-pull.mjs, which is for the OLD REST report host
// (X-Business-Id/X-Schedule-Id headers, businessId never in the body). These manager/graphql
// Lakehouse calls pass businessId as a GraphQL VARIABLE instead, and carry no schedule header.
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

// Same discovery + store filter as lifelenz-pull.mjs's / lifelenz-attendance-pull.mjs's own
// getStoreSchedules() (kept in sync manually across all three -- not worth a shared module for
// one ~15-line block, per this repo's existing "small, pure, exported functions, not a
// framework" precedent for genuinely tiny shared pieces).
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

// columns/groupBy/sortOrder — the EXACT confirmed request shape the UI itself sends for this
// report (owner-captured, not guessed). Only the location filter value varies per store.
const COLUMNS = [
  'locations_location_name', 'scheduled_shifts_scheduled_shift_id', 'employees_employee_name',
  'original_value', 'updated_value', 'schedule_event_actors_employee_name', 'occurred_at',
  'scheduled_hours_variance', 'cost_variance',
];
const GROUP_BY = [`${REPORT_KEY}.locations_location_name`, `${REPORT_KEY}.scheduled_shifts_scheduled_shift_id`];
const SORT_ORDER = [
  { member: `${REPORT_KEY}.locations_location_name`, direction: 'asc' },
  { member: `${REPORT_KEY}.occurred_at`, direction: 'desc' },
];

async function triggerReport(token, scheduleId, startDate, endDate) {
  const variables = {
    businessId: BUSINESS_ID, reportKey: REPORT_KEY,
    dateRangeStart: toISO(startDate), dateRangeEnd: toISO(endDate),
    sortOrder: SORT_ORDER, groupBy: GROUP_BY,
    filters: [{ member: `${REPORT_KEY}.locations_location_id`, operator: 'equals', values: [scheduleId] }],
    columns: COLUMNS,
  };
  const data = await graphql(token, 'GetReportDataCsvAsync', variables, GET_REPORT_DATA_CSV_ASYNC);
  const report = data?.lakehouseReportDataCsvAsync;
  if (!report?.id) throw new Error(`no report id in response: ${JSON.stringify(data).slice(0, 300)}`);
  return report;
}

// Poll ALL triggered report ids in ONE batched AsyncReports(ids:[...]) call per round, rather
// than per-store polling loops -- the reports generate concurrently server-side, so this is a
// handful of round trips total regardless of store count, not N sequential trigger-wait-poll
// chains. Lenient completion check (see file header): a `url` or `error` present means done,
// independent of the literal `status` string, since the real enum values aren't confirmed yet.
async function pollAsyncReports(token, ids, { maxAttempts = 15, intervalMs = 4000 } = {}) {
  const pending = new Set(ids);
  const resolved = new Map(); // id -> report node
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
  let resp = await fetch(report.url, { headers: { 'X-Auth-Token': token } });
  if (resp.status === 401 || resp.status === 403) {
    if (DEBUG) console.log('[download] auth header rejected by report url, retrying bare');
    resp = await fetch(report.url);
  }
  if (!resp.ok) throw new Error(`download HTTP ${resp.status}`);
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

// We requested an explicit `columns` list in a known order, so the header row should name those
// columns verbatim (by `member` or `shortTitle` -- unconfirmed which). Matches by exact member
// name first; any column that doesn't match falls back to its POSITIONAL slot in our own
// COLUMNS request (the server returning columns in the order we asked for is the most likely
// failure-safe assumption if the header text itself turns out to differ from `member`).
function parseScheduleVarianceCSV(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headerCells = parseCsvLine(lines[0]).map(h => h.trim());
  const idxOf = colName => {
    const exact = headerCells.findIndex(h => h.toLowerCase() === colName.toLowerCase());
    if (exact >= 0) return exact;
    const fallback = COLUMNS.indexOf(colName);
    return fallback >= 0 && fallback < headerCells.length ? fallback : -1;
  };
  const C = {
    employeeName: idxOf('employees_employee_name'),
    originalValue: idxOf('original_value'),
    updatedValue: idxOf('updated_value'),
    editedBy: idxOf('schedule_event_actors_employee_name'),
    occurredAt: idxOf('occurred_at'),
    hoursVariance: idxOf('scheduled_hours_variance'),
    costVariance: idxOf('cost_variance'),
    shiftId: idxOf('scheduled_shifts_scheduled_shift_id'),
  };
  if (C.editedBy < 0 || C.occurredAt < 0) {
    console.warn('[parse] could not locate edited_by/occurred_at columns — header shape drifted, not guessing. Header was:', JSON.stringify(headerCells));
    return [];
  }
  const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const rows = [];
  const seqByGroup = new Map();
  for (let i = 1; i < lines.length; i++) {
    const r = parseCsvLine(lines[i]);
    const editedBy = r[C.editedBy];
    const occurredAt = r[C.occurredAt];
    if (!editedBy || !occurredAt) continue;
    const groupKey = `${editedBy}|${occurredAt}`;
    const seq = seqByGroup.get(groupKey) || 0;
    seqByGroup.set(groupKey, seq + 1);
    rows.push({
      scheduled_shift_id: C.shiftId >= 0 ? (r[C.shiftId] || null) : null,
      employee_name: C.employeeName >= 0 ? (r[C.employeeName] || null) : null,
      original_value: C.originalValue >= 0 ? (r[C.originalValue] || null) : null,
      updated_value: C.updatedValue >= 0 ? (r[C.updatedValue] || null) : null,
      edited_by: editedBy,
      occurred_at: occurredAt,
      hours_variance: C.hoursVariance >= 0 ? num(r[C.hoursVariance]) : null,
      cost_variance: C.costVariance >= 0 ? num(r[C.costVariance]) : null,
      seq,
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
    const { error } = await supabase.from('lifelenz_schedule_variance').upsert(slice, { onConflict: 'loc,edited_by,occurred_at,seq' });
    if (error) { console.warn(`[supabase] upsert error for ${loc}:`, error.message); continue; }
    saved += slice.length;
  }
  return saved;
}

async function getLatestOccurredAt() {
  const { data, error } = await supabase
    .from('lifelenz_schedule_variance')
    .select('occurred_at')
    .order('occurred_at', { ascending: false })
    .limit(1);
  if (error) { console.warn('[freshness] could not read latest occurred_at:', error.message); return null; }
  return data?.[0]?.occurred_at ? new Date(data[0].occurred_at) : null;
}

// Informational discovery pass for the other 4 Data Explorer tiles -- best-guess reportKey
// slugs (compliance_audit_report is confirmed to EXIST as a report, per the owner's own
// GetReportMeta curl, but its real column list was never captured in the response, only the
// request shape; the other 3 slugs are unconfirmed guesses). Never throws, never affects the
// run's exit code -- this is purely so the next build has real schema in the job log instead of
// another guess.
const DISCOVERY_REPORT_KEYS = [
  'compliance_audit_report', 'employee_performance_report',
  'payroll_readiness_report', 'time_punch_activity_report',
];
async function discoverReportMeta(token) {
  for (const key of DISCOVERY_REPORT_KEYS) {
    try {
      const data = await graphql(token, 'GetReportMeta', { businessId: BUSINESS_ID, reportKey: key }, GET_REPORT_META_QUERY);
      const meta = data?.lakehouseReportMeta;
      if (meta) {
        console.log(`[discover] ${key} → REAL report. columns: ${JSON.stringify((meta.columns || []).map(c => c.member))}`);
        console.log(`[discover] ${key} → entityFilters: ${JSON.stringify((meta.entityFilters || []).map(f => f.member))}`);
      } else {
        console.log(`[discover] ${key} → null (no such reportKey, or needs a different slug)`);
      }
    } catch (e) {
      console.log(`[discover] ${key} → ${e.message}`);
    }
  }
}

async function main() {
  const token = process.env.LIFELENZ_TOKEN;
  if (!token) { console.error('[auth] LIFELENZ_TOKEN required (no Playwright fallback in this pull yet — matches lifelenz-attendance-pull.mjs precedent).'); process.exit(1); }

  const latestOccurredAt = await getLatestOccurredAt();
  const fresh = checkFreshness(latestOccurredAt, { warnAfterHours: 30, errorAfterHours: 54, label: 'lifelenz-schedule-variance-pull' });
  if (fresh.message) (fresh.status === 'error' ? console.error : console.warn)(fresh.message);

  const end = new Date();
  const start = addDay(end, -WINDOW_DAYS);
  console.log(`[lifelenz-schedule-variance-pull] window: ${toISO(start)} → ${toISO(end)} (${WINDOW_DAYS}d)`);

  // Discovery pass first — informational, never fails the run.
  await discoverReportMeta(token);

  const schedules = await getStoreSchedules(token);
  if (!schedules.length) { console.error('[schedules] no store schedules found.'); process.exit(1); }

  const tracker = makeOutcomeTracker('lifelenz-schedule-variance-pull');
  const requestedUnits = schedules.map(s => s.name);
  const coveredSchedules = new Set();
  const allScheduleIds = schedules.map(s => s.id);

  // 1. Trigger every store's report. 2. Batch-poll all of them together.
  const byReportId = new Map(); // reportId -> {schedule, loc}
  const triggeredIds = [];
  for (const schedule of schedules) {
    const loc = locFromName(schedule.name);
    if (!loc) { tracker.fail(schedule.name, 'could not derive loc from schedule name'); continue; }
    try {
      const report = await triggerReport(token, schedule.id, start, end);
      byReportId.set(report.id, { schedule, loc });
      triggeredIds.push(report.id);
      if (DEBUG) console.log(`  [trigger] ${schedule.name} (loc ${loc}) → report ${report.id}`);
    } catch (e) {
      console.warn(`  [trigger] ${schedule.name}: ${e.message}`);
      tracker.fail(schedule.name, e.message);
    }
  }

  if (!triggeredIds.length) {
    console.error('[lifelenz-schedule-variance-pull] ✗ no reports triggered — nothing to poll');
  } else {
    console.log(`[poll] waiting on ${triggeredIds.length} triggered report(s)…`);
    const { resolved, stillPending } = await pollAsyncReports(token, triggeredIds);
    for (const reportId of stillPending) {
      const ctx = byReportId.get(reportId);
      tracker.fail(ctx?.schedule.name || reportId, 'report never resolved within poll budget');
    }

    let totalSaved = 0;
    for (const [reportId, report] of resolved) {
      const ctx = byReportId.get(reportId);
      if (!ctx) continue;
      const { schedule, loc } = ctx;
      try {
        const csvText = await downloadReport(token, report);
        const rows = parseScheduleVarianceCSV(csvText);
        if (!rows.length) { console.log(`  ${schedule.name} (loc ${loc}): no edits in window`); coveredSchedules.add(schedule.id); continue; }
        const saved = await upsertRows(loc, rows);
        totalSaved += saved;
        coveredSchedules.add(schedule.id);
        console.log(`  ${schedule.name} (loc ${loc}): ${rows.length} edit(s) parsed, ${saved} saved`);
      } catch (e) {
        console.warn(`  ${schedule.name} (loc ${loc}): ${e.message}`);
        tracker.fail(schedule.name, e.message);
      }
    }
    console.log(`[lifelenz-schedule-variance-pull] ✓ ${totalSaved} row(s) saved across ${coveredSchedules.size}/${schedules.length} stores`);
  }

  logPartitionCoverage(coveredSchedules, allScheduleIds, { label: 'lifelenz-schedule-variance-pull', kind: 'schedule' });
  const code = tracker.finalize({
    requestedUnits,
    totalSaved: coveredSchedules.size, // partition coverage is the meaningful denominator here — a store can legitimately have 0 edits and still count as covered
    formatRerun: () => 're-run the whole workflow — no per-store rerun flag exists yet',
  });
  if (code) process.exit(code);
}

// Exported for src/__tests__/lifelenz-schedule-variance-pull.test.js — real behavioral tests of
// the CSV parser against the confirmed column shape, guarded the same way
// lifelenz-attendance-pull.mjs is so importing this module's pure functions doesn't also fire
// off a live LifeLenz pull.
export { parseScheduleVarianceCSV, locFromName };
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('[lifelenz-schedule-variance-pull] fatal error:', err);
    process.exit(1);
  });
}
