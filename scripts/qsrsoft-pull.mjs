#!/usr/bin/env node
// scripts/qsrsoft-pull.mjs — QSRSoft FOB (Food Over Base) daily/monthly sync
// Runs in GitHub Actions (or locally). Fetches all 27 stores in a single API call.
// Smart mode: queries Supabase for existing months, only fetches what's missing
// plus a safety window — typically 1-2 API calls per daily run.
//
// Required env vars:
//   VITE_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY  — service role key (bypasses RLS)
//   QSRSOFT_TOKEN              — X-Auth-Token from browser DevTools (expires ~monthly)
//
// Optional:
//   QSRSOFT_MONTHS_BACK  — max lookback for missing months (default: 12)
//   QSRSOFT_SAFETY_DAYS  — days into a new month to re-pull prev month for ABC corrections (default: 3)
//   QSRSOFT_DEBUG        — set to '1' for verbose logging
//
// Token refresh: when this script exits with 401, go to v3.myqsrsoft.com, open
// DevTools → Network → any request → copy the X-Auth-Token header value →
// update the QSRSOFT_TOKEN GitHub Secret.

import { createClient } from '@supabase/supabase-js';

const API_BASE    = 'https://api.reports.myqsrsoft.com';
const ORG_ID      = 'a546d4ef-684a-4f25-8bc0-6580af068875';
const ENTERPRISE  = 'McDonalds';
const MONTHS_BACK  = parseInt(process.env.QSRSOFT_MONTHS_BACK  || '12', 10);
const SAFETY_DAYS  = parseInt(process.env.QSRSOFT_SAFETY_DAYS  || '3',  10);
const DEBUG        = process.env.QSRSOFT_DEBUG === '1';

// All 27 store NSNs — confirmed from API response 2026-07-06
const STORE_NSNS = [
  3708, 5183, 5985, 6178, 6838, 6972,
  10034, 10422, 10915, 11657, 13113, 18213,
  20475, 24471, 29760, 31357, 32525, 33109,
  33222, 33704, 34222, 35064, 35242, 37566,
  38609, 43380, 43701,
];

// selectCols — use exact field names as they appear in the JSON response (no c-prefix)
const SELECT_COLS = [
  'prodSalesAmt', 'compWasteAmt', 'rawWasteAmt', 'condimentsAmt',
  'empMgrMealsAmt', 'discountCouponsAmt', 'statVarianceAmt', 'unexplainedAmt',
  'totalBaseFood',
  'pnlFoodCostBegin', 'pnlFoodCostPurchases', 'pnlFoodCostAdjustments',
  'pnlFoodCostTransfers', 'pnlFoodCostPromotions', 'pnlFoodCostEnd',
  'pnlPaperCostBegin', 'pnlPaperCostPurchases', 'pnlPaperCostAdjustments',
  'pnlPaperCostTransfers', 'pnlPaperCostPromotions', 'pnlPaperCostEnd',
].join(',');

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

// Query Supabase for year_months already in DB
async function getExistingMonths() {
  const { data, error } = await supabase
    .from('qsr_fob')
    .select('year_month');
  if (error) { console.warn('[db] could not read existing months:', error.message); return new Set(); }
  return new Set((data || []).map(r => r.year_month));
}

function buildMonthEntry(year, month) {
  const pad = n => String(n).padStart(2, '0');
  const now = new Date();
  const isCurrent = year === now.getFullYear() && month === now.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  const endDay  = isCurrent ? now.getDate() : lastDay;
  return {
    yearMonth: `${year}-${pad(month)}`,
    startDate: `${year}-${pad(month)}-01`,
    endDate:   `${year}-${pad(month)}-${pad(endDay)}`,
  };
}

// Smart month selection:
//   - Current month: always pull (MTD changes every day)
//   - Previous month: pull for first SAFETY_DAYS of new month (ABC corrections still arriving)
//   - Older months: only pull if missing from DB
//   - Looks back up to MONTHS_BACK months for gaps
async function monthsToFetch() {
  const now      = new Date();
  const today    = now.getDate();
  const existing = await getExistingMonths();
  const months   = [];
  const reasons  = [];

  for (let i = MONTHS_BACK; i >= 0; i--) {
    const d     = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const year  = d.getFullYear();
    const month = d.getMonth() + 1;
    const entry = buildMonthEntry(year, month);

    const isCurrent      = i === 0;
    const isPrevious     = i === 1;
    const inSafetyWindow = isPrevious && today <= SAFETY_DAYS;
    const isMissing      = !existing.has(entry.yearMonth);

    if (isCurrent || inSafetyWindow || isMissing) {
      months.push(entry);
      const why = isCurrent ? 'current MTD' : inSafetyWindow ? `safety (day ${today}/${SAFETY_DAYS})` : 'missing';
      reasons.push(`${entry.yearMonth} [${why}]`);
    }
  }

  console.log(`[qsrsoft-pull] ${existing.size > 0 ? existing.size + ' months in DB' : 'no existing data'}`);
  console.log(`[qsrsoft-pull] pulling ${months.length} month(s): ${reasons.join(', ')}`);
  return months;
}

async function fetchFOB(token, startDate, endDate) {
  const params = new URLSearchParams({
    catalogType:    'actualFoodOverBase',
    nsd:            'd',
    nsn:            STORE_NSNS.join(','),
    orgId:          ORG_ID,
    enterpriseName: ENTERPRISE,
    startDate,
    endDate,
    dsd:            'd',
    compType:       'calendar',
    daysOfWeek:     '1,2,3,4,5,6,7',
    weekStart:      '3',
    selectCols:     SELECT_COLS,
  });

  const url = `${API_BASE}/reporting/v2/food/actual-food-over-base?${params}`;
  if (DEBUG) console.log('[fob] GET', url.slice(0, 100) + '…');

  const resp = await fetch(url, {
    headers: {
      'X-Auth-Token':    token,
      'Accept':          'application/json',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Origin':          'https://v3.myqsrsoft.com',
      'Referer':         'https://v3.myqsrsoft.com/',
      'User-Agent':      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    },
  });

  console.log('[fob]', startDate, '→', endDate, ':', resp.status);

  if (resp.status === 401 || resp.status === 403) {
    throw new Error(`AUTH_FAILED:${resp.status}`);
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status}: ${body.slice(0, 200)}`);
  }

  const data = await resp.json();
  return data.result || [];
}

function mapRow(item) {
  const loc = String(item.storeNum).padStart(7, '0');
  const ly  = k => item[`ly.${k}`] ?? null;
  return {
    loc,
    year_month:                   item.date,
    prod_sales_amt:               item.prodSalesAmt ?? null,
    comp_waste_amt:               item.compWasteAmt ?? null,
    raw_waste_amt:                item.rawWasteAmt  ?? null,
    condiments_amt:               item.condimentsAmt ?? null,
    emp_mgr_meals_amt:            item.empMgrMealsAmt ?? null,
    discount_coupons_amt:         item.discountCouponsAmt ?? null,
    stat_variance_amt:            item.statVarianceAmt ?? null,
    unexplained_amt:              item.unexplainedAmt ?? null,
    total_base_food:              item.totalBaseFood ?? null,
    pnl_food_cost_begin:          item.pnlFoodCostBegin ?? null,
    pnl_food_cost_purchases:      item.pnlFoodCostPurchases ?? null,
    pnl_food_cost_adjustments:    item.pnlFoodCostAdjustments ?? null,
    pnl_food_cost_transfers:      item.pnlFoodCostTransfers ?? null,
    pnl_food_cost_promotions:     item.pnlFoodCostPromotions ?? null,
    pnl_food_cost_end:            item.pnlFoodCostEnd ?? null,
    pnl_paper_cost_begin:         item.pnlPaperCostBegin ?? null,
    pnl_paper_cost_purchases:     item.pnlPaperCostPurchases ?? null,
    pnl_paper_cost_adjustments:   item.pnlPaperCostAdjustments ?? null,
    pnl_paper_cost_transfers:     item.pnlPaperCostTransfers ?? null,
    pnl_paper_cost_promotions:    item.pnlPaperCostPromotions ?? null,
    pnl_paper_cost_end:           item.pnlPaperCostEnd ?? null,
    // Last year
    ly_prod_sales_amt:            ly('prodSalesAmt'),
    ly_comp_waste_amt:            ly('compWasteAmt'),
    ly_raw_waste_amt:             ly('rawWasteAmt'),
    ly_condiments_amt:            ly('condimentsAmt'),
    ly_emp_mgr_meals_amt:         ly('empMgrMealsAmt'),
    ly_discount_coupons_amt:      ly('discountCouponsAmt'),
    ly_stat_variance_amt:         ly('statVarianceAmt'),
    ly_unexplained_amt:           ly('unexplainedAmt'),
    ly_total_base_food:           ly('totalBaseFood'),
    ly_pnl_food_cost_begin:       ly('pnlFoodCostBegin'),
    ly_pnl_food_cost_purchases:   ly('pnlFoodCostPurchases'),
    ly_pnl_food_cost_adjustments: ly('pnlFoodCostAdjustments'),
    ly_pnl_food_cost_transfers:   ly('pnlFoodCostTransfers'),
    ly_pnl_food_cost_promotions:  ly('pnlFoodCostPromotions'),
    ly_pnl_food_cost_end:         ly('pnlFoodCostEnd'),
    ly_pnl_paper_cost_begin:      ly('pnlPaperCostBegin'),
    ly_pnl_paper_cost_purchases:  ly('pnlPaperCostPurchases'),
    ly_pnl_paper_cost_adjustments:ly('pnlPaperCostAdjustments'),
    ly_pnl_paper_cost_transfers:  ly('pnlPaperCostTransfers'),
    ly_pnl_paper_cost_promotions: ly('pnlPaperCostPromotions'),
    ly_pnl_paper_cost_end:        ly('pnlPaperCostEnd'),
    updated_at:                   new Date().toISOString(),
  };
}

async function upsertRows(rows) {
  if (!rows.length) return 0;
  const { error } = await supabase
    .from('qsr_fob')
    .upsert(rows, { onConflict: 'loc,year_month' });
  if (error) { console.warn('[supabase] upsert error:', error.message); return 0; }
  return rows.length;
}

async function main() {
  const token = process.env.QSRSOFT_TOKEN;
  if (!token) {
    console.error('[qsrsoft-pull] QSRSOFT_TOKEN env var is required.');
    console.error('  Get it: v3.myqsrsoft.com → DevTools → Network → any request → X-Auth-Token header → GitHub Secret');
    process.exit(1);
  }

  const months = await monthsToFetch();
  if (!months.length) {
    console.log(`[qsrsoft-pull] ✓ all months up to date — nothing to pull`);
    return;
  }
  console.log(`[qsrsoft-pull] ${months.length} month(s) × ${STORE_NSNS.length} stores`);

  let totalSaved = 0;

  for (const { yearMonth, startDate, endDate } of months) {
    try {
      const items = await fetchFOB(token, startDate, endDate);
      if (!items.length) { console.log(`  ${yearMonth}: no data`); continue; }

      if (DEBUG) {
        items.forEach(r => console.log(`    ${r.storeNum}: sales $${r.prodSalesAmt?.toLocaleString()} | baseFood $${r.totalBaseFood?.toLocaleString()}`));
      }

      const rows  = items.map(mapRow);
      const saved = await upsertRows(rows);
      totalSaved += saved;
      console.log(`  ${yearMonth}: ${saved}/${items.length} stores saved`);
    } catch (e) {
      if (e.message.startsWith('AUTH_FAILED')) {
        console.error('\n[qsrsoft-pull] ✗ Auth rejected — QSRSOFT_TOKEN has expired.');
        console.error('  1. Go to v3.myqsrsoft.com in your browser (stay logged in)');
        console.error('  2. DevTools → Network → any request → copy X-Auth-Token value');
        console.error('  3. GitHub repo → Settings → Secrets → update QSRSOFT_TOKEN');
        process.exit(1);
      }
      console.warn(`  ${yearMonth}: error — ${e.message}`);
    }
  }

  console.log(`[qsrsoft-pull] ✓ done — ${totalSaved} store-months saved to Supabase`);
}

main().catch(err => {
  console.error('[qsrsoft-pull] fatal:', err);
  process.exit(1);
});
