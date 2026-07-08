#!/usr/bin/env node
// scripts/qsrsoft-dar-pull.mjs
// QSRSoft Daily Activity Report — hourly intraday data for all stores
// API: https://api.reports.myqsrsoft.com/v1/reports/shift/daily-activity-raw
// One API call per day covers ALL 27 stores. No Playwright — uses QSRSOFT_TOKEN.
// Table: qsr_daily_activity (loc, dt, hour_slot) PK

import { createClient } from '@supabase/supabase-js';

const BASE_URL = 'https://api.reports.myqsrsoft.com/v1/reports/shift/daily-activity-raw';
const ORG_ID   = 'a546d4ef-684a-4f25-8bc0-6580af068875';

const STORE_NSNS = [
  3708, 5183, 5985, 6178, 6838, 6972,
  10034, 10422, 10915, 11657, 13113, 18213,
  20475, 24471, 29760, 31357, 32525, 33109,
  33222, 33704, 34222, 35064, 35242, 37566,
  38609, 43380, 43701,
];

const DAYS_BACK   = parseInt(process.env.QSRSOFT_DAR_DAYS_BACK   || '90', 10);
const DAYS_RECENT = parseInt(process.env.QSRSOFT_DAR_DAYS_RECENT || '7',  10);
const FORCE_FULL  = process.env.QSRSOFT_DAR_FORCE_FULL === '1';
const DEBUG       = process.env.QSRSOFT_DAR_DEBUG      === '1';

const SELECT_COLS = [
  'transactions', 'productSales', 'allNetSales',
  'dt_transactions', 'dt_allNetSales',
  'is_transactions', 'is_allNetSales',
  'transScrubbed', 'prodSalesScrubbed',
  'dt_trans_cnt', 'dt_untilserve', 'dt_untilstore', 'dt_untilrecall',
  'dt_heldtime', 'dt_carsheld',
  'fc_trans_cnt', 'fc_untilserve', 'fc_untilcloseDrawer',
  'mfy1_itemscount', 'mfy1_trans_cnt', 'mfy1_untilserve',
  'mfy2_itemscount', 'mfy2_trans_cnt', 'mfy2_untilserve',
  'bev_trans_cnt', 'bev_itemscount', 'bev_untilserve', 'bev_untilcloseDrawer',
  'actualPunchedHours', 'totalScheduledHours', 'totalNeededHours',
  'salariedManagerScheduledHours', 'actualPunchedDollars',
  'healthy_count', 'unhealthy_count',
  'projectedTransScrubbed', 'projectedDTTransScrubbed', 'projectedInStoreTranScrubbed',
  'projectedProdSalesScrubbed', 'projectedKVSItemsScrubbed',
  'totalTransactions', 'dtTransactions', 'salesDollars', 'sandwichCounts', 'inStoreProjTrans',
  'totalSalesMean', 'totalTransactionsMean', 'totalDriveThruTransactionsMean',
  'totalSandwichesMean', 'totalFryHashesMean', 'totalBeveragesMean',
].join(',');

function fmtDate(d) { return d.toISOString().slice(0, 10); }
function addDay(d, n) { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function n(v) { return v ?? 0; }

const supabase = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
);

async function getLatestDate() {
  const { data } = await supabase
    .from('qsr_daily_activity')
    .select('dt')
    .order('dt', { ascending: false })
    .limit(1)
    .single();
  return data?.dt ? new Date(data.dt + 'T12:00:00Z') : null;
}

async function fetchDay(token, date) {
  const params = new URLSearchParams({
    timeSegment:      'openClose',
    segmentBy:        'hour',
    segmentNames:     'open-close',
    segmentsSelected: 'open-close',
    nsd:              'd',
    nsn:              STORE_NSNS.join(','),
    orgId:            ORG_ID,
    enterpriseName:   'McDonalds',
    startDate:        date,
    endDate:          date,
    compType:         'trading',
    weekStart:        '3',
    timeInterval:     'hour',
    selectCols:       SELECT_COLS,
  });

  const url = `${BASE_URL}?${params}`;
  if (DEBUG) console.log(`[dar-pull] GET ${url.slice(0, 140)}...`);

  const resp = await fetch(url, {
    headers: {
      'X-Auth-Token': token,
      'Accept':       'application/json',
      'Origin':       'https://v3.myqsrsoft.com',
      'Referer':      'https://v3.myqsrsoft.com/',
      'User-Agent':   'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36',
    },
  });

  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${await resp.text()}`);
  const body = await resp.json();
  return Array.isArray(body) ? body : (Array.isArray(body?.result) ? body.result : []);
}

function mapRow(row, date) {
  return {
    loc:       String(row.nsn).padStart(7, '0'),
    dt:        date,
    hour_slot: row.endQtrHourTime,

    // Actual metrics (zero for future hours)
    transactions:        n(row.transactions),
    product_sales:       n(row.productSales ?? row.prodSalesScrubbed),
    net_sales:           n(row.allNetSales),
    dt_transactions:     n(row.dt_transactions),
    dt_sales:            n(row.dt_allNetSales),
    is_transactions:     n(row.is_transactions),
    is_sales:            n(row.is_allNetSales),
    trans_scrubbed:      n(row.transScrubbed),
    prod_sales_scrubbed: n(row.prodSalesScrubbed),

    // DT timing — raw µs sums; divide by dt_trans_cnt to get per-car avg
    dt_trans_cnt:   n(row.dt_trans_cnt),
    dt_untilserve:  n(row.dt_untilserve),
    dt_untilstore:  n(row.dt_untilstore),
    dt_untilrecall: n(row.dt_untilrecall),
    dt_heldtime:    n(row.dt_heldtime),
    dt_carsheld:    n(row.dt_carsheld),

    // Front counter timing
    fc_trans_cnt:        n(row.fc_trans_cnt),
    fc_untilserve:       n(row.fc_untilserve),
    fc_untilclosedrawer: n(row.fc_untilclosedrawer),

    // MFY lanes
    mfy1_itemscount: n(row.mfy1_itemscount),
    mfy1_trans_cnt:  n(row.mfy1_trans_cnt),
    mfy1_untilserve: n(row.mfy1_untilserve),
    mfy2_itemscount: n(row.mfy2_itemscount),
    mfy2_trans_cnt:  n(row.mfy2_trans_cnt),
    mfy2_untilserve: n(row.mfy2_untilserve),

    // Beverages
    bev_trans_cnt:        n(row.bev_trans_cnt),
    bev_itemscount:       n(row.bev_itemscount),
    bev_untilserve:       n(row.bev_untilserve),
    bev_untilclosedrawer: n(row.bev_untilclosedrawer),

    // Labor
    actual_punched_hours:             n(row.actualPunchedHours),
    total_scheduled_hours:            n(row.totalScheduledHours),
    total_needed_hours:               n(row.totalNeededHours),
    salaried_manager_scheduled_hours: n(row.salariedManagerScheduledHours),
    actual_punched_dollars:           n(row.actualPunchedDollars),

    // Order accuracy
    healthy_count:   n(row.healthy_count),
    unhealthy_count: n(row.unhealthy_count),

    // System projections (valid for all hours including future)
    proj_trans_scrubbed:      n(row.projectedTransScrubbed),
    proj_dt_trans_scrubbed:   n(row.projectedDTTransScrubbed),
    proj_is_trans_scrubbed:   n(row.projectedInStoreTransScrubbed),
    proj_prod_sales_scrubbed: n(row.projectedProdSalesScrubbed),
    proj_kvs_items_scrubbed:  n(row.projectedKVSItemsScrubbed),
    proj_total_transactions:  n(row.totalTransactions),
    proj_dt_transactions:     n(row.dtTransactions),
    proj_sales_dollars:       n(row.salesDollars),
    proj_sandwich_counts:     n(row.sandwichCounts),
    proj_is_transactions:     n(row.inStoreProjTrans),

    // Historical means (~5-week rolling, from system)
    mean_sales:           n(row.totalSalesMean),
    mean_transactions:    n(row.totalTransactionsMean),
    mean_dt_transactions: n(row.totalDriveThruTransactionsMean),
    mean_sandwiches:      n(row.totalSandwichesMean),
    mean_fry_hashes:      n(row.totalFryHashesMean),
    mean_beverages:       n(row.totalBeveragesMean),

    // Last year — same day, same time slot
    ly_transactions:   n(row['ly.transactions']),
    ly_product_sales:  n(row['ly.productSales']),
    ly_dt_transactions:n(row['ly.dt_transactions']),
    ly_dt_sales:       n(row['ly.dt_allNetSales']),
    ly_is_transactions:n(row['ly.is_transactions']),
    ly_sales_dollars:  n(row['ly.salesDollars']),
    ly_punched_hours:  n(row['ly.actualPunchedHours']),

    updated_at: new Date().toISOString(),
  };
}

async function upsertBatch(records) {
  if (!records.length) return 0;
  const BATCH = 500;
  let total = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { error } = await supabase
      .from('qsr_daily_activity')
      .upsert(batch, { onConflict: 'loc,dt,hour_slot' });
    if (error) throw error;
    total += batch.length;
  }
  return total;
}

async function main() {
  const token = process.env.QSRSOFT_TOKEN;
  if (!token) throw new Error('QSRSOFT_TOKEN not set');

  const today = new Date();
  let startDate, endDate;

  if (FORCE_FULL) {
    startDate = fmtDate(addDay(today, -DAYS_BACK));
    endDate   = fmtDate(today);
    console.log(`[dar-pull] force_full=1 — pulling ${DAYS_BACK} days (${startDate} → ${endDate})`);
  } else {
    const latest = await getLatestDate();
    if (!latest) {
      startDate = fmtDate(addDay(today, -DAYS_BACK));
      console.log(`[dar-pull] no existing data — pulling ${DAYS_BACK} days from ${startDate}`);
    } else {
      const daysSince   = Math.floor((today - latest) / 86400000);
      const daysToFetch = Math.min(Math.max(DAYS_RECENT, daysSince + DAYS_RECENT), DAYS_BACK);
      startDate = fmtDate(addDay(today, -daysToFetch));
      console.log(`[dar-pull] latest ${fmtDate(latest)} (${daysSince}d ago) — pulling ${daysToFetch} days`);
    }
    endDate = fmtDate(today);
  }

  const dates = [];
  for (let d = new Date(startDate + 'T12:00:00Z'); fmtDate(d) <= endDate; d = addDay(d, 1)) {
    dates.push(fmtDate(d));
  }

  console.log(`[dar-pull] ${dates.length} dates × ${STORE_NSNS.length} stores (~${dates.length * STORE_NSNS.length * 25} rows expected)`);
  let totalRows = 0;

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i];
    try {
      const rows = await fetchDay(token, date);
      if (!rows.length) { console.log(`[dar-pull]   ${date}: no data`); continue; }
      const records = rows.map(r => mapRow(r, date));
      const upserted = await upsertBatch(records);
      totalRows += upserted;
      console.log(`[dar-pull]   ${date}: ${rows.length} rows → ${upserted} upserted`);
    } catch (err) {
      console.error(`[dar-pull]   ${date} ERROR: ${err.message}`);
    }
    // 150ms between requests — polite to the API
    if (i < dates.length - 1) await new Promise(r => setTimeout(r, 150));
  }

  console.log(`[dar-pull] done. Total: ${totalRows} rows`);
}

main().catch(err => { console.error('[dar-pull] FATAL:', err); process.exit(1); });
