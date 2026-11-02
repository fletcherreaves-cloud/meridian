#!/usr/bin/env node
// scripts/lifelenz-compliance-audit-pull.mjs — LifeLenz Data Explorer "Compliance Audit" pull.
//
// Second automated pull against LifeLenz's Data Explorer Lakehouse backend (see
// scripts/lifelenz-schedule-variance-pull.mjs for the first one + the full trigger→poll→download
// mechanism, confirmed live 2026-11-01, memory/lifelenz-session.md). Compliance Audit is a real
// labor-compliance-violation log -- meal/rest break violations, minor-labor-law issues, etc. --
// each with a DOLLAR PENALTY (cost_penalty) and HOUR PENALTY (hour_penalty), confirmed via a live
// GetReportMeta discovery dispatch (run 41349875190) to be a REAL report with 42 real columns
// (representative list captured in memory/lifelenz-session.md's "BUILT 2026-11-01" section).
// Nothing in Meridian tracked this before this build (no compliance-violation panel existed
// anywhere, per CLAUDE.md's panel list).
//
// Unlike Schedule Variance's pull (which hardcodes its 9-column `columns` request from a
// captured curl), this report has 42 columns and only a REPRESENTATIVE subset was captured by
// hand in memory -- not the full member list. So this script calls GetReportMeta(reportKey) ONCE
// at startup to get the real, complete column list + each column's human-readable `name`, and
// uses THAT (not a hardcoded guess) to build both the trigger's `columns` request and the CSV
// header→member mapping (buildLabelMap). This is more robust against the report schema changing
// AND avoids the wrong-guess-then-fix cycle Schedule Variance went through for its 8 columns --
// whatever the real header labels turn out to be, they come from the same live call that already
// told us the member names, not a second hand-typed guess.
//
// ⚠️ Unverified until a live dispatch (same caveats Schedule Variance started with):
//   1. groupBy/sortOrder below are a reasonable adaptation of the one real captured trigger
//      example for THIS report (memory: groupBy on locations_location_name +
//      employees_employee_name, limit:20, GetReportDataTreeAsync) -- adapted to
//      GetReportDataCsvAsync (no limit) for a full export, the same tree-view-to-CSV adaptation
//      Schedule Variance's own build used. sortOrder (by shift_date desc) is a sensible default,
//      not captured live.
//   2. Real DATA row content/CSV header shape -- expected to follow the SAME metadata-rows-then-
//      human-label-header convention Schedule Variance's CSV turned out to have, but not yet
//      measured for THIS report. The parser scans for the header dynamically (same discipline as
//      Schedule Variance) rather than assuming a fixed row index, and derives the label map from
//      the live GetReportMeta call rather than a hardcoded guess (see above).
// LIFELENZ_DEBUG=1 logs enough (real columns, raw header, raw first lines, per-store resolution)
// to diagnose either guess being wrong on the first real run.
//
// Required env vars: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, LIFELENZ_TOKEN
// Optional: LIFELENZ_COMPLIANCE_AUDIT_WINDOW_DAYS (default 14), LIFELENZ_DEBUG (1 = verbose)

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { makeOutcomeTracker } from './lib/pull-outcome.mjs';
import { logPartitionCoverage, checkFreshness } from './_pipeline-contract.mjs';

const BASE          = 'https://us01-connect.lifelenz.com';
const GRAPHQL_URL   = `${BASE}/manager/graphql`;
const BUSINESS_ID   = '01979dbf-a166-759b-8702-aba9915c578e';
const REPORT_KEY    = 'compliance_audit_report';
const WINDOW_DAYS   = parseInt(process.env.LIFELENZ_COMPLIANCE_AUDIT_WINDOW_DAYS || '14', 10);
const DEBUG         = process.env.LIFELENZ_DEBUG === '1';

const supabase = safeCreateClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

const toISO  = d => d.toISOString().slice(0, 10);
const addDay = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
const sleep  = ms => new Promise(r => setTimeout(r, ms));

// Identical header shape to lifelenz-schedule-variance-pull.mjs -- same manager/graphql
// Lakehouse host, same credential, same required X-Version.
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

// Same discovery + store filter as lifelenz-schedule-variance-pull.mjs's own (kept in sync
// manually across all LifeLenz pull scripts -- not worth a shared module for one ~15-line block,
// per this repo's existing "small, pure, exported functions, not a framework" precedent).
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

// The two fields every real violation row must carry -- both confirmed real column members
// (memory/lifelenz-session.md). Both must resolve by exact label match (via the live
// GetReportMeta-derived map) before a row is accepted as the header, same anti-false-positive
// discipline Schedule Variance's editedBy/occurredAt gate used.
const GATE_MEMBERS = ['compliance_warning_id', 'shift_date'];

// Fields promoted to real columns on lifelenz_compliance_audit (everything else lands in `raw`
// JSONB) -- the ones named explicitly in the live GetReportMeta discovery capture, i.e. the ones
// this report's own "good use" (a violation list with $ cost, who/what/when, dismissal status)
// actually needs queried/filtered/summed directly, not just carried along.
const PROMOTED_MEMBERS = {
  compliance_warning_id:     'compliance_warning_id',
  employees_employee_name:   'employee_name',
  employees_geid:            'geid',
  shift_date:                'shift_date',
  category:                  'category',
  title:                     'title',
  description:               'description',
  source:                    'source',
  cost_penalty:               'cost_penalty',
  hour_penalty:               'hour_penalty',
  warning_time:               'warning_time',
  is_dismissed:               'is_dismissed',
  dismissal_reason:           'dismissal_reason',
  dismissed_by:               'dismissed_by',
  dismissed_on:               'dismissed_on',
};

// Measured live 2026-11-02 (dispatch run 41366151365): GetReportMeta's own columns[].member (and
// .name, for most columns) come back FULLY QUALIFIED as "compliance_audit_report.<field>", not
// bare. Passing that straight through as the trigger's `columns` array fails every single store
// with "No exportable columns match the requested keys" -- the `columns` param wants BARE field
// names (same as Schedule Variance's own hardcoded COLUMNS list), while groupBy/filters/sortOrder
// want the qualified form. Stripping the prefix here, once, at the source, means every downstream
// consumer (buildLabelMap, the trigger's columnMembers, PROMOTED_MEMBERS/GATE_MEMBERS matching)
// works with bare names consistently, with no second place to remember this.
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
  return columns.map(c => ({ ...c, member: stripReportPrefix(c.member), name: stripReportPrefix(c.name) })); // [{name, member, shortTitle, ...}], now bare
}

async function triggerReport(token, scheduleId, startDate, endDate, columnMembers) {
  const variables = {
    businessId: BUSINESS_ID, reportKey: REPORT_KEY,
    dateRangeStart: toISO(startDate), dateRangeEnd: toISO(endDate),
    sortOrder: [{ member: `${REPORT_KEY}.shift_date`, direction: 'desc' }],
    groupBy: [`${REPORT_KEY}.locations_location_name`, `${REPORT_KEY}.employees_employee_name`],
    filters: [{ member: `${REPORT_KEY}.locations_location_id`, operator: 'equals', values: [scheduleId] }],
    columns: columnMembers,
  };
  const data = await graphql(token, 'GetReportDataCsvAsync', variables, GET_REPORT_DATA_CSV_ASYNC);
  const report = data?.lakehouseReportDataCsvAsync;
  if (!report?.id) throw new Error(`no report id in response: ${JSON.stringify(data).slice(0, 300)}`);
  return report;
}

// Identical batched-poll strategy to lifelenz-schedule-variance-pull.mjs -- see that file's own
// comment for the full reasoning (one AsyncReports(ids:[...]) call per round, lenient completion
// check since the real AsyncReportStatusEnum values aren't confirmed).
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

// Identical to lifelenz-schedule-variance-pull.mjs's downloadReport -- full lakehouseHeaders()
// first (the X-Version header the pre-signed url actually requires, confirmed live), auth-only
// as a second-attempt fallback.
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

// Builds a lowercased-label → member map from the REAL GetReportMeta columns (their `name`/
// `shortTitle`), rather than a hand-typed guess for all 42 fields. Falls back to the raw member
// name itself so a CSV that (for whatever reason) uses member names instead of display labels
// still resolves. Earlier label in the [name, shortTitle, member] preference order wins ties.
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
// exact label match via the dynamic label map -- same anti-false-positive discipline as Schedule
// Variance (a metadata/title row with the right column count must not be mistaken for the
// header). Promoted fields resolve to their own named output key; everything else that resolves
// to a real member lands in `raw`.
function parseComplianceAuditCSV(text, metaColumns) {
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
    console.warn('[parse] could not locate the header row in the first 10 lines — shape drifted, not guessing.');
    if (DEBUG) console.log('[parse] raw first 5 lines:', JSON.stringify(lines.slice(0, 5)));
    return [];
  }
  const { headerRowIdx, promotedIdx, otherIdx } = found;
  const get = (cells, key) => { const i = promotedIdx[key]; return (i != null && i >= 0) ? (cells[i] ?? null) : null; };
  const num = v => { if (v == null || v === '') return null; const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
  const bool = v => (v == null || v === '') ? null : /^(true|yes|1)$/i.test(String(v).trim());

  const rows = [];
  const seqByGroup = new Map();
  for (let i = headerRowIdx + 1; i < lines.length; i++) {
    const cells = parseCsvLine(lines[i]);
    const complianceWarningId = get(cells, 'compliance_warning_id');
    const shiftDate = get(cells, 'shift_date');
    if (!complianceWarningId || !shiftDate) continue;
    const seq = seqByGroup.get(complianceWarningId) || 0;
    seqByGroup.set(complianceWarningId, seq + 1);

    const raw = {};
    for (const [member, idx] of Object.entries(otherIdx)) raw[member] = cells[idx] ?? null;

    rows.push({
      compliance_warning_id: complianceWarningId,
      employee_name: get(cells, 'employee_name'),
      geid: get(cells, 'geid'),
      shift_date: shiftDate,
      category: get(cells, 'category'),
      title: get(cells, 'title'),
      description: get(cells, 'description'),
      source: get(cells, 'source'),
      cost_penalty: num(get(cells, 'cost_penalty')),
      hour_penalty: num(get(cells, 'hour_penalty')),
      warning_time: get(cells, 'warning_time'),
      is_dismissed: bool(get(cells, 'is_dismissed')),
      dismissal_reason: get(cells, 'dismissal_reason'),
      dismissed_by: get(cells, 'dismissed_by'),
      dismissed_on: get(cells, 'dismissed_on'),
      raw: Object.keys(raw).length ? raw : null,
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
    const { error } = await supabase.from('lifelenz_compliance_audit').upsert(slice, { onConflict: 'loc,compliance_warning_id,seq' });
    if (error) { console.warn(`[supabase] upsert error for ${loc}:`, error.message); continue; }
    saved += slice.length;
  }
  return saved;
}

async function getLatestShiftDate() {
  const { data, error } = await supabase
    .from('lifelenz_compliance_audit')
    .select('shift_date')
    .order('shift_date', { ascending: false })
    .limit(1);
  if (error) { console.warn('[freshness] could not read latest shift_date:', error.message); return null; }
  return data?.[0]?.shift_date ? new Date(data[0].shift_date) : null;
}

async function main() {
  const token = process.env.LIFELENZ_TOKEN;
  if (!token) { console.error('[auth] LIFELENZ_TOKEN required (no Playwright fallback in this pull — matches lifelenz-schedule-variance-pull.mjs/lifelenz-attendance-pull.mjs precedent).'); process.exit(1); }

  const latestShiftDate = await getLatestShiftDate();
  const fresh = checkFreshness(latestShiftDate, { warnAfterHours: 30, errorAfterHours: 54, label: 'lifelenz-compliance-audit-pull' });
  if (fresh.message) (fresh.status === 'error' ? console.error : console.warn)(fresh.message);

  const end = new Date();
  const start = addDay(end, -WINDOW_DAYS);
  console.log(`[lifelenz-compliance-audit-pull] window: ${toISO(start)} → ${toISO(end)} (${WINDOW_DAYS}d)`);

  const metaColumns = await fetchReportMeta(token);
  console.log(`[meta] ${metaColumns.length} real columns for ${REPORT_KEY}`);
  if (DEBUG) console.log('[meta] columns:', JSON.stringify(metaColumns.map(c => ({ member: c.member, name: c.name }))));
  const columnMembers = metaColumns.map(c => c.member);

  const schedules = await getStoreSchedules(token);
  if (!schedules.length) { console.error('[schedules] no store schedules found.'); process.exit(1); }

  const tracker = makeOutcomeTracker('lifelenz-compliance-audit-pull');
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
    console.error('[lifelenz-compliance-audit-pull] ✗ no reports triggered — nothing to poll');
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
        const rows = parseComplianceAuditCSV(csvText, metaColumns);
        if (!rows.length) { console.log(`  ${schedule.name} (loc ${loc}): no violations in window`); coveredSchedules.add(schedule.id); continue; }
        totalParsed += rows.length;
        const saved = await upsertRows(loc, rows);
        totalSaved += saved;
        // Measured live 2026-11-02 (dispatch run 41366962908): the table hadn't been applied to
        // production Supabase yet, so EVERY upsert failed -- but coveredSchedules.add() fired
        // unconditionally here regardless of whether the write actually succeeded, so the run
        // printed "28/28 schedule(s) had at least one row upserted" and exited 0 despite saving
        // ZERO real rows anywhere. A store is only "covered" when it actually wrote something; a
        // parsed-but-unsaved row is a real write failure and must show up as one (both in the
        // per-unit failure list AND in whether the run as a whole succeeds), not get silently
        // absorbed into "coverage."
        if (saved === 0) {
          tracker.fail(schedule.name, `parsed ${rows.length} row(s) but saved 0 — upsert write failure`);
        } else {
          coveredSchedules.add(schedule.id);
          if (saved < rows.length) tracker.fail(schedule.name, `upsert saved only ${saved}/${rows.length} parsed row(s)`);
        }
        console.log(`  ${schedule.name} (loc ${loc}): ${rows.length} violation(s) parsed, ${saved} saved`);
      } catch (e) {
        console.warn(`  ${schedule.name} (loc ${loc}): ${e.message}`);
        tracker.fail(schedule.name, e.message);
      }
    }
    console.log(`[lifelenz-compliance-audit-pull] ✓ ${totalSaved} row(s) saved across ${coveredSchedules.size}/${schedules.length} stores`);
  }

  logPartitionCoverage(coveredSchedules, allScheduleIds, { label: 'lifelenz-compliance-audit-pull', kind: 'schedule' });
  const code = tracker.finalize({
    requestedUnits,
    // totalParsed>0 means real rows existed to save -- use the REAL saved count so a genuine
    // write failure (table missing, RLS misconfigured, etc.) correctly trips finalize()'s
    // zero-rows-saved guard instead of being masked by coverage. Only fall back to
    // coveredSchedules.size (partition coverage) when totalParsed is itself 0 -- a window with
    // truly no violations anywhere is a legitimate empty result, not a failure, and summing a
    // real zero in that case would false-positive.
    totalSaved: totalParsed > 0 ? totalSaved : coveredSchedules.size,
    formatRerun: () => 're-run the whole workflow — no per-store rerun flag exists yet',
  });
  if (code) process.exit(code);
}

// Exported for src/__tests__/lifelenz-compliance-audit-pull.test.js — real behavioral tests of
// the dynamic label-map builder + CSV parser, guarded the same way
// lifelenz-schedule-variance-pull.mjs is so importing this module's pure functions doesn't also
// fire off a live LifeLenz pull.
export { parseComplianceAuditCSV, buildLabelMap, locFromName, stripReportPrefix };
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('[lifelenz-compliance-audit-pull] fatal error:', err);
    process.exit(1);
  });
}
