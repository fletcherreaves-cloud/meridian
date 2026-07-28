#!/usr/bin/env node
// scripts/qsrsoft-explore.mjs — one-shot field discovery for QSRSoft API
// Hits the FOB endpoint WITHOUT selectCols so the API returns all available fields.
// Run locally: QSRSOFT_TOKEN=xxx node scripts/qsrsoft-explore.mjs
//
// Also tries likely Op Supplies field names in a second call.

const API_BASE   = 'https://api.reports.myqsrsoft.com';
const ORG_ID     = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const ENTERPRISE = 'McDonalds';
const TEST_NSN   = 3708; // single store for a quick test
const TEST_DATE  = '2026-06-30'; // end of last complete month (MTD final)

const token = process.env.QSRSOFT_TOKEN;
if (!token) { console.error('QSRSOFT_TOKEN not set'); process.exit(1); }

const headers = {
  'X-Auth-Token': token,
  'Accept': 'application/json',
  'Origin': 'https://v3.myqsrsoft.com',
  'Referer': 'https://v3.myqsrsoft.com/',
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
};

async function fetchFOB(extraParams = {}) {
  const params = new URLSearchParams({
    catalogType: 'actualFoodOverBase',
    nsd: 'd', nsn: TEST_NSN, orgId: ORG_ID, enterpriseName: ENTERPRISE,
    startDate: TEST_DATE, endDate: TEST_DATE,
    dsd: 'd', compType: 'calendar', daysOfWeek: '1,2,3,4,5,6,7', weekStart: '3',
    ...extraParams,
  });
  const url = `${API_BASE}/reporting/v2/food/actual-food-over-base?${params}`;
  console.log('\n[fetch]', url.slice(0, 120) + '...\n');
  const resp = await fetch(url, { headers });
  console.log('[status]', resp.status);
  if (!resp.ok) { console.error(await resp.text()); return null; }
  const data = await resp.json();
  return data.result || [];
}

async function main() {
  // ── Pass 1: no selectCols — get all available fields ──────────────────────
  console.log('=== PASS 1: all fields (no selectCols) ===');
  const rows1 = await fetchFOB();
  if (rows1 && rows1.length) {
    const item = rows1[0];
    const keys = Object.keys(item).sort();
    console.log(`\nAll fields returned (${keys.length} total):`);
    keys.forEach(k => console.log(`  ${k}: ${JSON.stringify(item[k])}`));

    // Highlight anything that looks like Op Supplies
    console.log('\n--- Fields containing "supply", "supplies", "op", "clean", "other" ---');
    keys.filter(k => /supply|supplies|opSup|clean|other|misc|oper/i.test(k))
        .forEach(k => console.log(`  *** ${k}: ${JSON.stringify(item[k])}`));
  } else {
    console.log('No rows returned for', TEST_DATE, '— try a different date');
  }

  // ── Pass 2: try probable Op Supplies field names explicitly ───────────────
  console.log('\n=== PASS 2: probe likely Op Supplies field names ===');
  const probeCols = [
    'pnlOpSupplyCostBegin','pnlOpSupplyCostPurchases','pnlOpSupplyCostAdjustments',
    'pnlOpSupplyCostTransfers','pnlOpSupplyCostPromotions','pnlOpSupplyCostEnd',
    'opSuppliesAmt','opSupplyAmt','opSupplyCost','opSuppliesCost',
    'pnlSupplyCostBegin','pnlSupplyCostPurchases','pnlSupplyCostEnd',
    'suppliesAmt','supplyCost','otherCost','miscCost',
  ].join(',');

  const rows2 = await fetchFOB({ selectCols: probeCols });
  if (rows2 && rows2.length) {
    const item = rows2[0];
    const nonNull = Object.entries(item).filter(([,v]) => v != null && v !== 0);
    if (nonNull.length) {
      console.log('\nNon-null fields returned:');
      nonNull.forEach(([k,v]) => console.log(`  ${k}: ${v}`));
    } else {
      console.log('\nAll probed fields returned null/0 — Op Supplies not in this endpoint');
    }
  }

  // ── Pass 3: try a different catalog type ──────────────────────────────────
  console.log('\n=== PASS 3: probe catalogType variations ===');
  const altCatalogs = ['pnlSummary','operatingSupplies','supplies','allCosts','totalCosts'];
  for (const ct of altCatalogs) {
    const params = new URLSearchParams({
      catalogType: ct,
      nsd: 'd', nsn: TEST_NSN, orgId: ORG_ID, enterpriseName: ENTERPRISE,
      startDate: TEST_DATE, endDate: TEST_DATE,
      dsd: 'd', compType: 'calendar', daysOfWeek: '1,2,3,4,5,6,7', weekStart: '3',
    });
    const url = `${API_BASE}/reporting/v2/food/actual-food-over-base?${params}`;
    const resp = await fetch(url, { headers });
    console.log(`  catalogType=${ct} → ${resp.status}`);
    if (resp.ok) {
      const d = await resp.json();
      const r = (d.result || [])[0];
      if (r) {
        const keys = Object.keys(r).filter(k => /supply|supplies|opSup|clean/i.test(k));
        if (keys.length) console.log('    supply-related fields:', keys);
        else console.log('    (no supply fields, but returned data — worth inspecting)');
      }
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
