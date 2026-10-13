#!/usr/bin/env node
// Throwaway, read-only probe: which employmentStatus values does QSRSoft's employee-roster
// endpoint actually accept, and do any of them surface terminated employees? NO Supabase
// write -- logs only. Deleted after this one diagnostic run.
import { getFreshToken } from './lib/qsrsoft-auth.mjs';

const API_BASE   = 'https://api.reports.myqsrsoft.com';
const ORG_ID     = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const ENTERPRISE = 'McDonalds';
const STORE_NSNS = [3708, 5183, 5985, 6178, 6838, 6972, 10034, 10422, 10915, 11657, 13113, 18213,
  20475, 24471, 29760, 31357, 32525, 33109, 33222, 33704, 34222, 35064, 35242, 37566, 38609, 43380, 43701]
  .map(String);
const SELECT_COLS = ['homeLocation', 'geid', 'employmentStatus', 'terminationEntryDate', 'terminationReason', 'storeEndDate'];

function buildUrl({ employmentStatus, first, last }) {
  const params = new URLSearchParams({
    catalogType: 'employeeRoster', nsd: 'd', nsn: STORE_NSNS.join(','),
    orgId: ORG_ID, enterpriseName: ENTERPRISE, startDate: first, endDate: last,
    weekStart: '3', locationType: 'home', employmentStatus, selectCols: SELECT_COLS.join(','),
  });
  return `${API_BASE}/reporting/v2/people/employee-roster?${params}`;
}

function extractRows(body) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.result)) return body.result;
  if (Array.isArray(body?.result?.resp)) return body.result.resp;
  if (Array.isArray(body?.resp)) return body.resp;
  return [];
}

async function tryValue(token, employmentStatus, first, last) {
  const url = buildUrl({ employmentStatus, first, last });
  const resp = await fetch(url, {
    headers: {
      'X-Auth-Token': token, 'Accept': 'application/json',
      'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/',
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    },
  });
  if (!resp.ok) {
    const text = await resp.text();
    console.log(`[probe] employmentStatus='${employmentStatus}' (${first}..${last}) -> HTTP ${resp.status}: ${text.slice(0, 300)}`);
    return;
  }
  const body = await resp.json();
  const rows = extractRows(body);
  const statuses = {};
  for (const r of rows) statuses[r.employmentStatus] = (statuses[r.employmentStatus] || 0) + 1;
  console.log(`[probe] employmentStatus='${employmentStatus}' (${first}..${last}) -> HTTP 200, ${rows.length} rows, status distribution: ${JSON.stringify(statuses)}`);
  const nonActive = rows.filter(r => r.employmentStatus && r.employmentStatus !== 'Active');
  if (nonActive.length) console.log('  sample non-active row:', JSON.stringify(nonActive[0]));
}

async function main() {
  const token = await getFreshToken();
  console.log('[auth] token minted OK');

  // Test a spread of calendar months (further back = more chance someone left in that window)
  // and a spread of plausible employmentStatus values, including the one currently used.
  const periods = [
    { first: '2026-01-01', last: '2026-01-31' },
    { first: '2026-06-01', last: '2026-06-30' },
    { first: '2026-10-01', last: '2026-10-13' },
  ];
  const statusValues = ['active', 'terminated', 'inactive', 'all', 'Terminated', ''];

  for (const p of periods) {
    for (const sv of statusValues) {
      try { await tryValue(token, sv, p.first, p.last); }
      catch (e) { console.log(`[probe] employmentStatus='${sv}' (${p.first}..${p.last}) -> EXCEPTION: ${e.message}`); }
      await new Promise(r => setTimeout(r, 200));
    }
  }
}

// Extra check: across ALL non-active rows in one wide pull, how often is terminationEntryDate
// a real date vs the 0000-00-00 sentinel, vs storeEndDate?
async function checkTerminationDateShape(token) {
  const url = buildUrl({ employmentStatus: 'all', first: '2026-01-01', last: '2026-10-13' });
  const resp = await fetch(url, {
    headers: { 'X-Auth-Token': token, 'Accept': 'application/json', 'Origin': 'https://v3.myqsrsoft.com', 'Referer': 'https://v3.myqsrsoft.com/' },
  });
  const body = await resp.json();
  const rows = extractRows(body);
  const nonActive = rows.filter(r => r.employmentStatus !== 'Active');
  const realTerminationEntryDate = nonActive.filter(r => r.terminationEntryDate && r.terminationEntryDate !== '0000-00-00');
  const realStoreEndDate = nonActive.filter(r => r.storeEndDate && r.storeEndDate !== '0000-00-00');
  console.log(`\n[probe] WIDE RANGE (2026-01-01..2026-10-13), employmentStatus=all: ${rows.length} total, ${nonActive.length} non-active`);
  console.log(`  non-active rows with a REAL terminationEntryDate: ${realTerminationEntryDate.length} / ${nonActive.length}`);
  console.log(`  non-active rows with a REAL storeEndDate: ${realStoreEndDate.length} / ${nonActive.length}`);
  console.log('  sample 3 non-active rows:', JSON.stringify(nonActive.slice(0, 3)));
}

const _token = await getFreshToken();
console.log('[auth] token minted OK (wide check)');
await checkTerminationDateShape(_token);
