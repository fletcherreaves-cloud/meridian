#!/usr/bin/env node
// scripts/lifelenz-payroll-readiness-pull.mjs — LifeLenz Data Explorer "Payroll Readiness" pull.
// Fourth automated pull against the Data Explorer Lakehouse backend (see
// scripts/lifelenz-compliance-audit-pull.mjs for the trigger→poll→download mechanism this
// reuses verbatim).
//
// ⚠️ UNCONFIRMED AT A LEVEL BEYOND EVERY PRIOR DATA EXPLORER PULL — flagged explicitly, not
// hidden, per this repo's standing "measure, don't reason" rule:
//   1. The reportKey itself (`payroll_readiness_report`) is a NAMING-PATTERN GUESS, not a
//      confirmed string. memory/lifelenz-session.md's own words: "the other 4 tiles almost
//      certainly follow the same naming pattern, e.g. ... payroll_readiness_report ... --
//      UNCONFIRMED, would need to open each tile and capture its own GetReportMeta call to be
//      sure." Compliance Audit/Employee Performance both had their reportKey confirmed via a
//      live dispatch before any pull script was written for them (task #28/#30); this one has
//      not been. If the real key differs, `fetchReportMeta` below throws immediately and loudly
//      ("GetReportMeta returned null for reportKey=... — report may have been renamed/removed"
//      or similar) rather than silently pulling nothing.
//   2. The field member names in PROMOTED_MEMBERS below are copied from
//      memory/lifelenz-session.md's own representative (not exhaustive, not live-captured)
//      58-column description — a human paraphrase of what the report tile showed, not a
//      GetReportMeta dump. Same dynamic-discovery resilience as every sibling pull: the real
//      runtime GetReportMeta call drives the actual column list and label map; a wrong GUESS in
//      PROMOTED_MEMBERS just means that one field falls through to `raw` JSONB instead of its
//      own column — it does not break the pull.
// This script CANNOT be live-validated from an agent session with no LIFELENZ_TOKEN (checked:
// none present in this environment). Before trusting it for real use, either the owner triggers
// the new GitHub Action manually once this merges, or a future session with LIFELENZ_TOKEN runs
// a GetReportMeta discovery dispatch (same method task #30 used for Employee Performance) to
// confirm the real reportKey and column members. Same honesty standard the Recommendation
// Ledger's grading script already set for its own Phase-1 limitation.
//
// Grain: ONE ROW PER (loc, geid, pay_period_start) — unlike Employee Performance's synthesized
// rolling window, this report's own pay_periods_start_time is a REAL per-row column (the actual
// pay period an employee's figures belong to), so it is NOT synthesized here — same "real event
// id/date" shape as Compliance Audit's shift_date, not Employee Performance's windowed shape.
//
// Required env vars: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LIFELENZ_TOKEN
// Optional: LIFELENZ_PAYROLL_READINESS_WINDOW_DAYS (default 60 — wide enough to span 2-4 pay
// periods so a late-posting period still gets captured), LIFELENZ_DEBUG (1 = verbose)

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { logPartitionCoverage, checkFreshness } from './_pipeline-contract.mjs';

const BASE          = 'https://us01-connect.lifelenz.com';
const GRAPHQL_URL   = `${BASE}/manager/graphql`;
const BUSINESS_ID   = '01979dbf-a166-759b-8702-aba9915c578e';
const REPORT_KEY    = 'payroll_readiness_report';
const WINDOW_DAYS   = parseInt(process.env.LIFELENZ_PAYROLL_READINESS_WINDOW_DAYS || '60', 10);
const DEBUG         = process.env.LIFELENZ_DEBUG === '1';

const supabase = safeCreateClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const toISO  = d => d.toISOString().slice(0, 10);
const addDay = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const sleep  = ms => new Promise(r => setTimeout(r, ms));

// Identical header shape to every other Data Explorer pull.
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

// Same discovery + store filter as every other Data Explorer pull (kept in sync manually —
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

// The two fields every real row must carry — the per-employee-per-pay-period identity. Both are
// GUESSED member names (see this file's own header caveat), not yet confirmed real.
const GATE_MEMBERS = ['employees_geid', 'pay_periods_start_time'];

// Fields promoted to real columns on lifelenz_payroll_readiness — the ones named explicitly in
// memory/lifelenz-session.md's representative column description. Everything else the runtime
// GetReportMeta call discovers lands in `raw` JSONB, same "avoids guessing a 58-column schema"
// precedent lifelenz_compliance_audit already set. A wrong guess here just means that field
// falls through to `raw` instead of its own column — it does not break the pull (see header).
const PROMOTED_MEMBERS = {
  employees_geid:                       'geid',
  employees_employee_name:              'employee_name',
  pay_periods_start_time:               'pay_period_start',
  pay_periods_pay_period_status:        'pay_period_status',
  scheduled_shifts_scheduled_hours:     'scheduled_hours',
  worked_hours:                         'worked_hours',
  total_worked_hours:                   'total_worked_hours',
  hours_variance:                       'hours_variance',
  cost_variance:                        'cost_variance',
  total_earnings:                       'total_earnings',
  regular_earnings:                     'regular_earnings',
  overtime_earnings:                    'overtime_earnings',
  overtime_hours:                       'overtime_hours',
  double_earnings:                      'double_earnings',
  double_hours:                         'double_hours',
  time_off_earnings:                    'time_off_earnings',
  time_off_hours:                       'time_off_hours',
  additional_earnings:                  'additional_earnings',
  additional_hours:                     'additional_hours',
  misc_earnings:                        'misc_earnings',
  misc_hours:                           'misc_hours',
  compliance_earnings:                  'compliance_earnings',
  compliance_hours:                     'compliance_hours',
  differential_earnings:                'differential_earnings',
  differential_hours:                   'differential_hours',
  pay_period_posters_employee_name:     'poster_employee_name',
  pay_period_approvers_employee_name:   'approver_employee_name',
  scheduled_shifts_absent_reason_text:  'absent_reason_text',
  time_off_types_name:                  'time_off_type_name',
};

// Same fully-qualified-member-name trap every sibling pull hit: GetReportMeta's own
// columns[].member/.name come back prefixed "payroll_readiness_report.<field>", not bare.
function stripReportPrefix(m) {
  const prefix = REPORT_KEY + '.';
  return m && m.startsWith(prefix) ? m.slice(prefix.length) : m;
}

async function fetchReportMeta(token) {
  const data = await graphql(token, 'GetReportMeta', { businessId: BUSINESS_ID, reportKey: REPORT_KEY }, GET_REPORT_META_QUERY);
  const meta = data?.lakehouseReportMeta;
  if (!meta) throw new Error(`GetReportMeta returned null for reportKey=${REPORT_KEY} — report may be misnamed (this key was a naming-pattern guess, never confirmed — see this file's own header) or removed`);
  const columns = meta.columns || [];
  if (!columns.length) throw new Error('GetReportMeta returned zero columns');
  return columns.map(c => ({ ...c, member: stripReportPrefix(c.member), name: stripReportPrefix(c.name) }));
}

async function triggerReport(token, scheduleId, startDate, endDate, columnMembers) {
  const variables = {
    businessId: BUSINESS_ID, reportKey: REPORT_KEY,
    dateRangeStart: toISO(startDate), dateRangeEnd: toISO(endDate),
    sortOrder: [{ member: `${REPORT_KEY}.pay_periods_start_time`, direction: 'desc' }],
    groupBy: [`${REPORT_KEY}.locations_location_name`, `${REPORT_KEY}.employees_employee_name`],
    filters: [{ member: `${REPORT_KEY}.locations_location_id`, operator: 'equals', values: [scheduleId] }],
    columns: columnMembers,
  };
  const data = await graphql(token, 'GetReportDataCsvAsync', variables, GET_REPORT_DATA_CSV_ASYNC);
  const report = data?.lakehouseReportDataCsvAsync;
  if (!report?.id) throw new Error(`no report id in response: ${JSON.stringify(data).slice(0, 300)}`);
  return report;
}

// Identical batched-poll strategy to every other Data Explorer pull.
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

// Builds a lowercased-label → member map from the REAL GetReportMeta columns, same mechanism
// every sibling pull uses — not a hand-typed guess of all ~58 fields' display labels.
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
// exact label match via the dynamic label map — same anti-false-positive discipline as every
// sibling pull (a metadata/title row with the right column count must not be mistaken for the
// header).
function parsePayrollReadinessCSV(text, metaColumns) {
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
    const otherIdx = {};
    headerCells.forEach((cell, i) => {
      const member = labelMap.get(cell.toLowerCase());
      if (member && !(member in PROMOTED_MEMBERS)) otherIdx[member] = i;
    });
    return { headerRowIdx: idx, promotedIdx, otherIdx };
  };

  let found = null;
  for (let i = 0; i < Math.min(lines.length, 10) && !found; i++) found = tryHeaderAt(i);
  if (!found) {
    console.warn('[parse] could not locate the header row in the first 10 lines — shape drifted (or the reportKey/member guesses in this file are simply wrong), not guessing further.');
    if (DEBUG) console.log('[parse] raw first 5 lines:', JSON.stringify(lines.slice(0, 5)));
    return [];
  }
  const { headerRowIdx, promotedIdx, otherIdx } = found;
  const get = (cells, key) => { const i = promotedIdx[key]; return (i != null && i >= 0) ? (cells[i] ?? null) : null; };
  const num = v => { if (v == null || v === '') return null; const n = parseFloat(v); return Number.isFinite(n) ? n : null; };

  const rows = [];
  for (let i = headerRowIdx + 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const geid = get(cells, 'geid');
    const payPeriodStart = get(cells, 'pay_period_start');
    if (!geid || !payPeriodStart) continue;

    const raw = {};
    for (const [member, idx] of Object.entries(otherIdx)) raw[member] = cells[idx] ?? null;

    rows.push({
      geid,
      employee_name: get(cells, 'employee_name'),
      pay_period_start: payPeriodStart,
      pay_period_status: get(cells, 'pay_period_status'),
      scheduled_hours: num(get(cells, 'scheduled_hours')),
      worked_hours: num(get(cells, 'worked_hours')),
      total_worked_hours: num(get(cells, 'total_worked_hours')),
      hours_variance: num(get(cells, 'hours_variance')),
      cost_variance: num(get(cells, 'cost_variance')),
      total_earnings: num(get(cells, 'total_earnings')),
      regular_earnings: num(get(cells, 'regular_earnings')),
      overtime_earnings: num(get(cells, 'overtime_earnings')),
      overtime_hours: num(get(cells, 'overtime_hours')),
      double_earnings: num(get(cells, 'double_earnings')),
      double_hours: num(get(cells, 'double_hours')),
      time_off_earnings: num(get(cells, 'time_off_earnings')),
      time_off_hours: num(get(cells, 'time_off_hours')),
      additional_earnings: num(get(cells, 'additional_earnings')),
      additional_hours: num(get(cells, 'additional_hours')),
      misc_earnings: num(get(cells, 'misc_earnings')),
      misc_hours: num(get(cells, 'misc_hours')),
      compliance_earnings: num(get(cells, 'compliance_earnings')),
      compliance_hours: num(get(cells, 'compliance_hours')),
      differential_earnings: num(get(cells, 'differential_earnings')),
      differential_hours: num(get(cells, 'differential_hours')),
      poster_employee_name: get(cells, 'poster_employee_name'),
      approver_employee_name: get(cells, 'approver_employee_name'),
      absent_reason_text: get(cells, 'absent_reason_text'),
      time_off_type_name: get(cells, 'time_off_type_name'),
      raw: Object.keys(raw).length ? raw : null,
    });
  }
  return rows;
}

// Fix v2 (2026-11-04, same day as the first fix, superseding it -- the first fix was wrong about
// WHY it failed, found by actually reading a live run's full log, not reasoning about it):
//
// The first fix (row-by-row fallback on bulk-upsert failure) was built on an untested guess --
// that in-batch key collisions were rare, so falling back to one-row-at-a-time upserts would be
// both correct and cheap. Live evidence from the re-run proved both assumptions wrong:
//   1. EVERY 500-row chunk, for EVERY store, hit "ON CONFLICT DO UPDATE command cannot affect
//      row a second time" -- not an occasional collision, a SYSTEMATIC one. This report's rows
//      really do repeat (geid,pay_period_start) keys constantly, strong confirmation (not just
//      the row-count inference the first fix reasoned from) that this table's PK may not be the
//      report's true unique key -- still an open question for the owner, see below, not resolved
//      here.
//   2. The row-by-row fallback's own collision counter (`rows.length - saved`) could NEVER
//      actually fire: a single-row upsert always "succeeds" even when it's silently overwriting
//      a sibling row from the same batch that was upserted moments earlier under the same key --
//      there's no SQL-level conflict when only one row is being written at a time. So the "loud
//      collision logging" the first fix promised was dead code; it ran and genuinely found
//      nothing to report, store after store, because the counting method could not detect what
//      it was measuring.
//   3. Row-by-row upserts are also far too slow at this data volume -- roughly 50s per 500-row
//      chunk (one HTTP round trip per row). At 1453-2297 rows/store this pull needs ~3-5 minutes
//      PER STORE; the whole-run live log shows only 6 of 28 stores finished before the job's own
//      20-minute timeout killed it mid-run.
//
// Real fix: DE-DUPLICATE IN MEMORY before any upsert, keeping the LAST row seen per
// (geid,pay_period_start) -- the exact same last-write-wins semantics Supabase's bulk upsert
// already uses, just applied cheaply (one pass over an array) instead of discovered expensively
// (one failed bulk statement, then hundreds of individual round trips). This restores full bulk-
// upsert speed (no more row-by-row fallback needed in the normal case) AND, because dedup counts
// collisions by comparing keys directly rather than inferring them from upsert success/failure,
// it can actually produce the accurate collision count/rate the first fix only promised.
async function upsertRows(loc, rows) {
  if (!rows.length) return 0;
  const byKey = new Map();
  for (const r of rows) {
    const key = r.geid + '|' + r.pay_period_start;
    byKey.set(key, r); // later rows overwrite earlier ones under the same key -- last wins
  }
  const deduped = [...byKey.values()];
  const collisions = rows.length - deduped.length;
  if (collisions > 0) {
    const pct = Math.round((collisions / rows.length) * 100);
    console.warn(`[lifelenz-payroll-readiness-pull] ${loc}: ${collisions}/${rows.length} row(s) (${pct}%) shared a (geid,pay_period_start) key with another row in the same pull and were collapsed, keeping the last one seen -- if this is a large share (it has been, every chunk/every store, in production so far), the report's real grain is probably finer than this table's primary key assumes and needs live row-level inspection before trusting totals here. Not resolved here -- DDL is never an agent's own action, and guessing which extra column to add to the key without inspecting real conflicting rows would be exactly the kind of unvalidated guess this file's header already warns against.`);
  }

  const payload = deduped.map(r => ({
    tenant_id: '00000000-0000-0000-0000-000000000001',
    loc, updated_at: new Date().toISOString(), ...r,
  }));
  const CHUNK = 500;
  let saved = 0;
  for (let i = 0; i < payload.length; i += CHUNK) {
    const slice = payload.slice(i, i + CHUNK);
    const { error } = await supabase.from('lifelenz_payroll_readiness').upsert(slice, { onConflict: 'loc,geid,pay_period_start' });
    if (!error) { saved += slice.length; continue; }
    // Dedup guarantees no two rows in this payload share a key, so this should not recur -- if
    // it does, it's a genuinely different error (network, schema, etc.), not the key collision
    // this function was built to fix. Falling back to row-by-row here is still correct (isolates
    // whichever row is the real problem instead of losing the whole chunk) but is not expected
    // to run in the normal case, unlike before.
    console.warn(`[supabase] bulk upsert error for ${loc} (chunk ${i}-${i + slice.length}), unexpected after dedup:`, error.message, '-- falling back to row-by-row');
    for (const row of slice) {
      const { error: rowError } = await supabase.from('lifelenz_payroll_readiness').upsert([row], { onConflict: 'loc,geid,pay_period_start' });
      if (rowError) { console.warn(`[supabase] row upsert error for ${loc}/${row.geid}/${row.pay_period_start}:`, rowError.message); continue; }
      saved++;
    }
  }
  return saved;
}

async function getLatestPayPeriodStart() {
  const { data, error } = await supabase
    .from('lifelenz_payroll_readiness')
    .select('pay_period_start')
    .order('pay_period_start', { ascending: false })
    .limit(1);
  if (error) { console.warn('[freshness] could not read latest pay_period_start:', error.message); return null; }
  return data?.[0]?.pay_period_start ? new Date(data[0].pay_period_start + 'T00:00:00') : null;
}

async function main() {
  const token = process.env.LIFELENZ_TOKEN;
  if (!token) { console.error('[auth] LIFELENZ_TOKEN required (no Playwright fallback in this pull — matches the other Data Explorer pulls\' precedent).'); process.exit(1); }

  const latestPayPeriodStart = await getLatestPayPeriodStart();
  // Pay periods post less often than a daily shift log, so a looser freshness window than the
  // other Data Explorer pulls (which warn/error at 30h/54h) — 10/16 days, roughly one missed
  // bi-weekly cycle before erroring.
  const fresh = checkFreshness(latestPayPeriodStart, { warnAfterHours: 240, errorAfterHours: 384, label: 'lifelenz-payroll-readiness-pull' });
  if (fresh.message) (fresh.status === 'error' ? console.error : console.warn)(fresh.message);

  const end = new Date();
  const start = addDay(end, -WINDOW_DAYS);
  console.log(`[lifelenz-payroll-readiness-pull] window: ${toISO(start)} → ${toISO(end)} (${WINDOW_DAYS}d)`);

  const metaColumns = await fetchReportMeta(token);
  console.log(`[meta] ${metaColumns.length} real columns for ${REPORT_KEY}`);
  if (DEBUG) console.log('[meta] columns:', JSON.stringify(metaColumns.map(c => ({ member: c.member, name: c.name }))));
  const columnMembers = metaColumns.map(c => c.member);

  const schedules = await getStoreSchedules(token);
  if (!schedules.length) { console.error('[schedules] no store schedules found.'); process.exit(1); }

  const tracker = makeOutcomeTracker('lifelenz-payroll-readiness-pull');
  const requestedUnits = schedules.map(s => s.name);
  const coveredSchedules = new Set();
  const allScheduleIds = schedules.map(s => s.id);

  const byReportId = new Map();
  const triggeredIds = [];
  for (const schedule of schedules) {
    const loc = locFromName(schedule.name);
    if (!loc) { tracker.fail(schedule.name, 'could not derive loc from schedule name'); continue; }
    try {
      const report = await triggerReport(token, schedule.id, start, end, columnMembers);
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
    console.error('[lifelenz-payroll-readiness-pull] ✗ no reports triggered — nothing to poll');
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
        const rows = parsePayrollReadinessCSV(csvText, metaColumns);
        if (!rows.length) { console.log(`  ${schedule.name} (loc ${loc}): no payroll rows in window`); coveredSchedules.add(schedule.id); continue; }
        totalParsed += rows.length;
        const saved = await upsertRows(loc, rows);
        totalSaved += saved;
        // Same outcome-tracker correctness fix every Data Explorer pull carries (dispatch
        // 2026-11-02): a store is only "covered" when it actually wrote something.
        if (saved === 0) {
          tracker.fail(schedule.name, `parsed ${rows.length} row(s) but saved 0 — upsert write failure`);
        } else {
          coveredSchedules.add(schedule.id);
          if (saved < rows.length) tracker.fail(schedule.name, `upsert saved only ${saved}/${rows.length} parsed row(s)`);
        }
        console.log(`  ${schedule.name} (loc ${loc}): ${rows.length} payroll row(s) parsed, ${saved} saved`);
      } catch (e) {
        console.warn(`  ${schedule.name} (loc ${loc}): ${e.message}`);
        tracker.fail(schedule.name, e.message);
      }
    }
    console.log(`[lifelenz-payroll-readiness-pull] ✓ ${totalSaved} row(s) saved across ${coveredSchedules.size}/${schedules.length} stores`);
  }

  logPartitionCoverage(coveredSchedules, allScheduleIds, { label: 'lifelenz-payroll-readiness-pull', kind: 'schedule' });
  const code = tracker.finalize({
    requestedUnits,
    totalSaved: totalParsed > 0 ? totalSaved : coveredSchedules.size,
    formatRerun: () => 're-run the whole workflow — no per-store rerun flag exists yet',
  });
  if (code) process.exit(code);
}

// Exported for src/__tests__/dispatch-lifelenz-payroll-readiness-2026-11-04.test.js.
export { parsePayrollReadinessCSV, buildLabelMap, locFromName, stripReportPrefix };
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('[lifelenz-payroll-readiness-pull] fatal error:', err);
    process.exit(1);
  });
}
