#!/usr/bin/env node
// scripts/qsrsoft-store-transition-probe.mjs — one-off, read-only investigative probe.
//
// Owner note (2026-10-17): "Holdenville did [a] transition 2979 -> 35064 [in] 2011
// (March-April) [and] in the first 12 months increased [$]500,000 in sales." Testing whether
// QSRSoft still has retrievable data for the OLD store number (2979, pre-transition) and
// confirming when the NEW number (35064) starts producing real data.
//
// Why a dedicated script rather than reusing qsrsoft-dar-pull.mjs/qsrsoft-ops-pull.mjs: both
// hard-code the current 27-store STORE_NSNS array (no per-call store override exists), so
// neither can ever query NSN 2979 — a retired number not in that list. This hits the exact
// same API endpoints those scripts use, with an explicit nsn param, for a short list of
// sample dates. Read-only: logs results, writes nothing to Supabase.
//
// Run via .github/workflows/qsrsoft-store-transition-probe.yml (workflow_dispatch).

import { getFreshToken } from './lib/qsrsoft-auth.mjs';

const BASE = 'https://api.reports.myqsrsoft.com';
const ORG_ID = 'a546d4ef-684a-4f25-8bc0-6580af068875';

const NSNS = (process.env.PROBE_NSNS || '2979,35064').split(',').map(s => s.trim()).filter(Boolean);
const DATES = (process.env.PROBE_DATES || [
  '2010-12-15', '2011-01-15', '2011-02-15', '2011-02-28',
  '2011-03-01', '2011-03-15', '2011-03-25', '2011-04-01',
  '2011-04-08', '2011-04-15', '2011-05-15', '2011-06-15', '2011-09-15',
].join(',')).split(',').map(s => s.trim()).filter(Boolean);

function headers(token) {
  return {
    'X-Auth-Token': token,
    'Accept': 'application/json',
    'Origin': 'https://v3.myqsrsoft.com',
    'Referer': 'https://v3.myqsrsoft.com/',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
  };
}

async function probeDar(token, nsn, date) {
  const params = new URLSearchParams({
    timeSegment: 'openClose', segmentBy: 'hour',
    segmentNames: 'open-close', segmentsSelected: 'open-close',
    nsd: 'd', nsn, orgId: ORG_ID,
    enterpriseName: 'McDonalds', startDate: date, endDate: date,
    compType: 'trading', weekStart: '3', timeInterval: 'hour',
    selectCols: 'transactions,productSales,allNetSales,totalTransactions,salesDollars',
  });
  const url = `${BASE}/v1/reports/shift/daily-activity-raw?${params}`;
  const resp = await fetch(url, { headers: headers(token) });
  if (!resp.ok) return { ok: false, status: resp.status, body: (await resp.text()).slice(0, 200) };
  const body = await resp.json();
  const rows = Array.isArray(body) ? body : (Array.isArray(body?.result) ? body.result : []);
  return { ok: true, status: resp.status, n: rows.length, sample: rows[0] || null };
}

async function probeOps(token, nsn, date, { key, path, catalogType, compType, selectCols }) {
  const params = new URLSearchParams({
    nsn, orgId: ORG_ID, enterpriseName: 'McDonalds',
    startDate: date, endDate: date, nsd: 'd', dsd: 's', weekStart: '3',
    daysOfWeek: '1,2,3,4,5,6,7',
    ...(catalogType ? { catalogType } : {}),
    ...(compType ? { compType } : {}),
    selectCols,
  });
  const url = `${BASE}${path}?${params}`;
  const resp = await fetch(url, { headers: headers(token) });
  if (!resp.ok) return { key, ok: false, status: resp.status, body: (await resp.text()).slice(0, 200) };
  const body = await resp.json();
  const rows = Array.isArray(body) ? body : (Array.isArray(body?.result) ? body.result : []);
  return { key, ok: true, status: resp.status, n: rows.length, sample: rows[0] || null };
}

const OPS_PROBES = [
  { key: 'cash', path: '/reporting/v2/cash/cash-sheet-extract', compType: 'calendar', selectCols: 'netSalesAmt,discountAmt' },
  { key: 'salesMix', path: '/reporting/v2/cash/cash-sheet', catalogType: 'cashSheet', compType: 'calendar', selectCols: 'netSalesAmt,productSalesAmt,grossSalesQty' },
];

async function main() {
  console.log(`[probe] NSNs: ${NSNS.join(', ')}`);
  console.log(`[probe] Dates: ${DATES.join(', ')}`);
  const token = await getFreshToken();
  console.log('[probe] token minted OK');

  for (const nsn of NSNS) {
    for (const date of DATES) {
      const dar = await probeDar(token, nsn, date);
      console.log(`[DAR] nsn=${nsn} ${date}: ${dar.ok ? `status ${dar.status}, ${dar.n} rows${dar.n ? ' -- sample: ' + JSON.stringify(dar.sample) : ''}` : `HTTP ${dar.status}: ${dar.body}`}`);

      for (const p of OPS_PROBES) {
        const r = await probeOps(token, nsn, date, p);
        console.log(`[OPS:${r.key}] nsn=${nsn} ${date}: ${r.ok ? `status ${r.status}, ${r.n} rows${r.n ? ' -- sample: ' + JSON.stringify(r.sample) : ''}` : `HTTP ${r.status}: ${r.body}`}`);
      }
    }
  }
  console.log('[probe] done');
}

main().catch(e => { console.error('[probe] FATAL:', e); process.exit(1); });
