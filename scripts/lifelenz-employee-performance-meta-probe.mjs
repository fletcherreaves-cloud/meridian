#!/usr/bin/env node
// scripts/lifelenz-employee-performance-meta-probe.mjs — discovery-only probe for the
// "Employee Performance" Data Explorer report, ahead of building its real pull script.
//
// memory/lifelenz-session.md's "BUILT 2026-11-01" section already confirmed reportKey=
// 'employee_performance_report' is real (via the SAME live GetReportMeta discovery dispatch
// that nailed down Compliance Audit/Payroll Readiness/Time Punch Activity) and captured a
// REPRESENTATIVE ~29-field subset by hand. That subset is enough to know the report is a real
// per-employee attendance/performance scorecard, but NOT enough to know (a) the exact full
// member list GetReportMeta returns today (schemas can drift, and the representative list was
// never claimed complete), or (b) the actual ROW GRAIN — one row per employee per report
// window, or one row per employee per day (shift_date-style, like compliance_audit_report) —
// which decides this table's real primary key. Guessing the grain wrong produces a schema that
// either silently collapses distinct days into one upsert or needlessly fragments a period
// aggregate across dates that don't exist in the data.
//
// So: GetReportMeta first (full column dump, no guessing), then — gated behind
// LIFELENZ_EP_FULL_CAPTURE=1 — a single real trigger→poll→download against ONE store for the
// requested window, with the ENTIRE raw CSV text printed so the real header/row shape is read
// from the log, not inferred. Read-only: no Supabase writes, no table created or touched.
//
// Required env: LIFELENZ_TOKEN
// Optional env: LIFELENZ_EP_FULL_CAPTURE (1 = also trigger/poll/download one store),
//               LIFELENZ_EP_STORE (schedule-name substring; default: first active store),
//               LIFELENZ_EP_WINDOW_DAYS (default 14)

const BASE        = 'https://us01-connect.lifelenz.com';
const GRAPHQL_URL = `${BASE}/manager/graphql`;
const BUSINESS_ID = '01979dbf-a166-759b-8702-aba9915c578e';
const REPORT_KEY  = 'employee_performance_report';

const toISO  = d => d.toISOString().slice(0, 10);
const addDay = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const sleep  = ms => new Promise(r => setTimeout(r, ms));

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
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  if (data?.errors) throw new Error(`GraphQL error: ${JSON.stringify(data.errors).slice(0, 500)}`);
  return data?.data;
}

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
  return meta;
}

async function getStoreSchedules(token, wantSubstr) {
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
  if (!stores.length) throw new Error('no active store schedules found');
  const pick = wantSubstr ? stores.find(s => s.name.includes(wantSubstr)) : null;
  return pick || stores[0];
}

async function pollOne(token, id, { maxAttempts = 15, intervalMs = 4000 } = {}) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (attempt > 0) await sleep(intervalMs);
    const data = await graphql(token, 'AsyncReports', { businessId: BUSINESS_ID, ids: [id] }, ASYNC_REPORTS_QUERY);
    const node = (data?.asyncReports?.nodes || [])[0];
    if (node && (node.url || node.error || node.cancelledAt)) return node;
    console.log(`[poll] attempt ${attempt + 1}: status=${node?.status || 'unknown'}, not yet resolved`);
  }
  throw new Error('report never resolved within poll budget');
}

async function main() {
  const token = process.env.LIFELENZ_TOKEN;
  if (!token) throw new Error('LIFELENZ_TOKEN env var required');

  const meta = await fetchReportMeta(token);
  const columns = (meta.columns || []).map(c => ({ ...c, member: stripReportPrefix(c.member), name: stripReportPrefix(c.name) }));
  console.log(`\n[meta] reportKey=${REPORT_KEY} → ${columns.length} real column(s)`);
  console.log('[meta] defaultDateRange:', meta.defaultDateRange, '| defaultGroupBy:', JSON.stringify(meta.defaultGroupBy), '| grandTotals:', meta.grandTotals, '| timeZoneColumn:', meta.timeZoneColumn);
  console.log('[meta] entityFilters:', JSON.stringify(meta.entityFilters));
  console.log('[meta] FULL column list (member | name | shortTitle | columnType | memberType | aggType | groupable | defaultVisible):');
  for (const c of columns) {
    console.log(`  ${c.member} | ${c.name} | ${c.shortTitle} | ${c.columnType} | ${c.memberType} | ${c.aggType} | ${c.groupable} | ${c.defaultVisible}`);
  }

  if (process.env.LIFELENZ_EP_FULL_CAPTURE !== '1') {
    console.log('\n[probe] LIFELENZ_EP_FULL_CAPTURE not set — skipping real trigger/poll/download. Set it to 1 to also capture one real CSV.');
    return;
  }

  const windowDays = parseInt(process.env.LIFELENZ_EP_WINDOW_DAYS || '14', 10);
  const end = new Date();
  const start = addDay(end, -windowDays);
  const store = await getStoreSchedules(token, process.env.LIFELENZ_EP_STORE || null);
  console.log(`\n[probe] using store schedule: ${store.name} (${store.id}), window ${toISO(start)} → ${toISO(end)}`);

  const columnMembers = columns.map(c => c.member);
  const variables = {
    businessId: BUSINESS_ID, reportKey: REPORT_KEY,
    dateRangeStart: toISO(start), dateRangeEnd: toISO(end),
    sortOrder: [{ member: `${REPORT_KEY}.employees_employee_name`, direction: 'asc' }],
    groupBy: [`${REPORT_KEY}.locations_location_name`, `${REPORT_KEY}.employees_employee_name`],
    filters: [{ member: `${REPORT_KEY}.locations_location_id`, operator: 'equals', values: [store.id] }],
    columns: columnMembers,
  };
  console.log('[probe] triggering GetReportDataCsvAsync…');
  const triggerData = await graphql(token, 'GetReportDataCsvAsync', variables, GET_REPORT_DATA_CSV_ASYNC);
  const report = triggerData?.lakehouseReportDataCsvAsync;
  if (!report?.id) throw new Error(`no report id in response: ${JSON.stringify(triggerData).slice(0, 300)}`);
  console.log(`[probe] triggered report ${report.id}, polling…`);

  const resolved = await pollOne(token, report.id);
  if (resolved.error) throw new Error(`report generation error: ${resolved.error}`);
  if (!resolved.url) throw new Error(`report has no url (status=${resolved.status})`);

  let resp = await fetch(resolved.url, { headers: lakehouseHeaders(token) });
  if (!resp.ok) resp = await fetch(resolved.url, { headers: { 'X-Auth-Token': token } });
  if (!resp.ok) throw new Error(`download HTTP ${resp.status}: ${(await resp.text()).slice(0, 200)}`);
  const csvText = await resp.text();

  console.log(`\n[probe] ── full CSV capture for ${store.name} (${toISO(start)}→${toISO(end)}) ──────────────────────`);
  console.log(csvText);
}

main().catch(e => { console.error('[probe] fatal:', e.message); process.exit(1); });
