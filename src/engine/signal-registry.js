// @ts-nocheck
// Signal Registry — metric definitions + extraction engine + custom signal computation

// ── Metric Categories ─────────────────────────────────────────────────────────
// source: ds array key; field: row field name; granularity: which modes work;
// better: 'higher'|'lower'|null; aggregate: 'avg'(default)|'sum' for monthly roll-up

export const METRIC_CATEGORIES = [
  {
    key: 'service', label: 'Service', color: '#60a5fa',
    metrics: [
      { key: 'oepe',        label: 'OEPE (sec)',                source: 'opsRows',    field: 'oepe',           granularity: ['daily','monthly'], better: 'lower',  unit: 'sec' },
      { key: 'kvst',        label: 'KVS Time (sec)',             source: 'opsRows',    field: 'kvst',           granularity: ['daily','monthly'], better: 'lower',  unit: 'sec', altField: 'kvsu' },
      { key: 'r2p',         label: 'R2P Front Counter (sec)',    source: 'opsRows',    field: 'r2p',            granularity: ['daily','monthly'], better: 'lower',  unit: 'sec' },
      { key: 'parkPct',     label: 'DT Park Rate (%)',           source: 'opsRows',    field: 'park',           granularity: ['daily','monthly'], better: 'lower',  unit: 'pct' },
      { key: 'dtMixPct',    label: 'DT Mix % of Sales',         source: 'laborRows',  field: 'dtPctTotal',     granularity: ['daily','monthly'], better: null,     unit: 'pct' },
    ],
  },
  {
    key: 'sales', label: 'Sales', color: '#f5bc00',
    metrics: [
      { key: 'sales',       label: 'Daily Sales ($)',            source: 'laborRows',  field: 'sales',          granularity: ['daily','monthly'], better: 'higher', unit: '$' },
      { key: 'gc',          label: 'Guest Count',                source: 'laborRows',  field: 'gc',             granularity: ['daily','monthly'], better: 'higher', unit: 'guests' },
      { key: 'avgCheck',    label: 'Avg Check ($)',              source: 'laborRows',  field: 'avgCheck',       granularity: ['daily','monthly'], better: 'higher', unit: '$' },
      { key: 'salesVsLY',   label: 'Sales vs LY (%)',           source: 'fobRows',    field: 'salesVsLY',      granularity: ['monthly'],        better: 'higher', unit: 'pct' },
    ],
  },
  {
    key: 'labor', label: 'Labor', color: '#a78bfa',
    metrics: [
      { key: 'laborPct',    label: 'Labor % of Sales',          source: 'laborRows',  field: 'laborPct',       granularity: ['daily','monthly'], better: 'lower',  unit: 'pct' },
      { key: 'tpph',        label: 'TPPH (Trans/Person-Hr)',    source: 'laborRows',  field: 'tpph',           granularity: ['daily','monthly'], better: 'higher', unit: 'trans' },
      { key: 'avgRate',     label: 'Avg Wage Rate ($/hr)',      source: 'laborRows',  field: 'avgRate',        granularity: ['daily','monthly'], better: null,     unit: '$/hr' },
      { key: 'otHrs',       label: 'OT Hours',                  source: 'laborRows',  field: 'otHrs',          granularity: ['daily','monthly'], better: 'lower',  unit: 'hrs', aggregate: 'sum' },
      { key: 'schedGap',    label: 'Schedule Gap vs Ideal (hrs)',source: 'schedRows',  field: 'schVsIdealDiff', granularity: ['daily','monthly'], better: null,     unit: 'hrs' },
    ],
  },
  {
    key: 'food_cost', label: 'Food Cost', color: '#f87171',
    metrics: [
      { key: 'fobPct',      label: 'FOB % (Food Over Base)',    source: 'fobRows',    field: 'fobPct',         granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
      { key: 'baseFoodPct', label: 'Base Food %',               source: 'fobRows',    field: 'baseFoodPct',    granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
      { key: 'compWaste',   label: 'Comp Waste %',              source: 'fobRows',    field: 'compWaste',      granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
      { key: 'rawWaste',    label: 'Raw Waste %',               source: 'fobRows',    field: 'rawWaste',       granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
      { key: 'condiment',   label: 'Condiment %',               source: 'fobRows',    field: 'condiment',      granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
      { key: 'empMeal',     label: 'Emp Meal %',                source: 'fobRows',    field: 'empMeal',        granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
      { key: 'statVar',     label: 'Stat Variance %',           source: 'fobRows',    field: 'statVar',        granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
      { key: 'unexplained', label: 'Unexplained Diff %',        source: 'fobRows',    field: 'unexplained',    granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
      { key: 'discCoupon',  label: 'Disc Coupon %',             source: 'fobRows',    field: 'discCoupon',     granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
      { key: 'pLFoodPct',   label: 'P&L Food Cost %',          source: 'fobRows',    field: 'pLFoodPct',      granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
      { key: 'pLPaperPct',  label: 'P&L Paper Cost %',         source: 'fobRows',    field: 'pLPaperPct',     granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
    ],
  },
  {
    key: 'controls', label: 'Controls', color: '#fb923c',
    metrics: [
      { key: 'discPct',     label: 'Discount %',                source: 'ctrlRows',   field: 'discPct',        granularity: ['daily','monthly'], better: 'lower',  unit: 'pct' },
      { key: 'discCnt',     label: 'Discount (count)',           source: 'ctrlRows',   field: 'discCnt',        granularity: ['daily','monthly'], better: 'lower',  unit: 'count', aggregate: 'sum' },
      { key: 'discAmt',     label: 'Discount ($)',               source: 'ctrlRows',   field: 'discAmt',        granularity: ['daily','monthly'], better: 'lower',  unit: '$',    aggregate: 'sum' },
      { key: 'promoPct',    label: 'Promo %',                   source: 'ctrlRows',   field: 'promoPct',       granularity: ['daily','monthly'], better: 'lower',  unit: 'pct' },
      { key: 'promoCnt',    label: 'Promo (count)',              source: 'ctrlRows',   field: 'promoCnt',       granularity: ['daily','monthly'], better: 'lower',  unit: 'count', aggregate: 'sum' },
      { key: 'promoAmt',    label: 'Promo ($)',                  source: 'ctrlRows',   field: 'promoAmt',       granularity: ['daily','monthly'], better: 'lower',  unit: '$',    aggregate: 'sum' },
      { key: 'cashOSPct',   label: 'Cash Over/Short %',         source: 'ctrlRows',   field: 'cashOSPct',      granularity: ['daily','monthly'], better: 'lower',  unit: 'pct' },
      { key: 'cashOSAmt',   label: 'Cash Over/Short ($)',       source: 'ctrlRows',   field: 'cashOSAmt',      granularity: ['daily','monthly'], better: 'lower',  unit: '$',    aggregate: 'sum' },
      { key: 'drawerOpens', label: 'Drawer Opens (count)',       source: 'ctrlRows',   field: 'drawerOpens',    granularity: ['daily','monthly'], better: 'lower',  unit: 'count', aggregate: 'sum' },
      { key: 'posOverCnt',  label: 'POS Override (count)',       source: 'ctrlRows',   field: 'posOverCnt',     granularity: ['daily','monthly'], better: 'lower',  unit: 'count', aggregate: 'sum' },
      { key: 'posOverAmt',  label: 'POS Override ($)',           source: 'ctrlRows',   field: 'posOverAmt',     granularity: ['daily','monthly'], better: 'lower',  unit: '$',    aggregate: 'sum' },
      { key: 'manualRefAmt',label: 'Manual Refund ($)',          source: 'ctrlRows',   field: 'manualRefAmt',   granularity: ['daily','monthly'], better: 'lower',  unit: '$',    aggregate: 'sum' },
      { key: 'cashRefCnt',  label: 'Cash Refund (count)',        source: 'ctrlRows',   field: 'cashRefCnt',     granularity: ['daily','monthly'], better: 'lower',  unit: 'count', aggregate: 'sum' },
      { key: 'cashRefAmt',  label: 'Cash Refund ($)',            source: 'ctrlRows',   field: 'cashRefAmt',     granularity: ['daily','monthly'], better: 'lower',  unit: '$',    aggregate: 'sum' },
      { key: 'cashlessRefCnt',label:'Cashless Refund (count)',   source: 'ctrlRows',   field: 'cashlessRefCnt', granularity: ['daily','monthly'], better: 'lower',  unit: 'count', aggregate: 'sum' },
      { key: 'cashlessRefAmt',label:'Cashless Refund ($)',       source: 'ctrlRows',   field: 'cashlessRefAmt', granularity: ['daily','monthly'], better: 'lower',  unit: '$',    aggregate: 'sum' },
      { key: 'tRedBPct',    label: 'T-Reds Before Total %',     source: 'ctrlRows',   field: 'tRedBPct',       granularity: ['daily','monthly'], better: 'lower',  unit: 'pct' },
      { key: 'tRedBCnt',    label: 'T-Reds Before Total (count)',source: 'ctrlRows',  field: 'tRedBCnt',       granularity: ['daily','monthly'], better: 'lower',  unit: 'count', aggregate: 'sum' },
      { key: 'tRedAPct',    label: 'T-Reds After Total %',      source: 'ctrlRows',   field: 'tRedAPct',       granularity: ['daily','monthly'], better: 'lower',  unit: 'pct' },
      { key: 'tRedACnt',    label: 'T-Reds After Total (count)', source: 'ctrlRows',   field: 'tRedACnt',       granularity: ['daily','monthly'], better: 'lower',  unit: 'count', aggregate: 'sum' },
    ],
  },
  {
    key: 'customer', label: 'Customer (SMG)', color: '#34d399',
    metrics: [
      { key: 'osat5',       label: 'OSAT 5★ %',                source: 'smgFullscale', field: 'osat5',        granularity: ['monthly'],        better: 'higher', unit: 'pct' },
      { key: 'osatTop2',    label: 'OSAT Top-2 Box %',         source: 'smgFullscale', field: 'osatTop2',     granularity: ['monthly'],        better: 'higher', unit: 'pct' },
      { key: 'osatB2B',     label: 'B2B % (No Problem)',       source: 'smgFullscale', field: 'osatB2B',      granularity: ['monthly'],        better: 'higher', unit: 'pct' },
      { key: 'accuracyB2B', label: 'Accuracy B2B %',           source: 'smgFullscale', field: 'accuracyB2B',  granularity: ['monthly'],        better: 'higher', unit: 'pct' },
      { key: 'dtProblem',   label: 'DT Problem %',             source: 'smgFullscale', field: 'dtProblem',    granularity: ['monthly'],        better: 'lower',  unit: 'pct' },
      { key: 'overallProblem',label:'Overall Problem %',        source: 'smgFullscale', field: 'overallProblem',granularity: ['monthly'],       better: 'lower',  unit: 'pct' },
      // VOICE Performance report (monthly point-in-time) — richer outcomes the
      // FullScale export doesn't carry: DT vs In-Restaurant satisfaction split
      // and product-quality B2B rates. Source ds.smgVoicePerf, report_type=monthly.
      { key: 'vpDtSat',     label: 'DT Satisfaction % (VOICE)', source: 'smgVoicePerf', field: 'dt_sat',        granularity: ['monthly'],        better: 'higher', unit: 'pct' },
      { key: 'vpIrSat',     label: 'In-Restaurant Sat % (VOICE)',source:'smgVoicePerf', field: 'ir_sat',        granularity: ['monthly'],        better: 'higher', unit: 'pct' },
      { key: 'vpQualityB2B',label: 'Overall Quality B2B % (VOICE)',source:'smgVoicePerf',field:'quality_b2b',  granularity: ['monthly'],        better: 'higher', unit: 'pct' },
      { key: 'vpFriesB2B',  label: 'Fries Quality B2B % (VOICE)',source:'smgVoicePerf', field: 'fries_b2b',     granularity: ['monthly'],        better: 'higher', unit: 'pct' },
      { key: 'vpSnackB2B',  label: 'Snack Wrap B2B % (VOICE)', source: 'smgVoicePerf', field: 'snack_wrap_b2b', granularity: ['monthly'],        better: 'higher', unit: 'pct' },
    ],
  },
  // ── Cloud / auto-emailed streams ────────────────────────────────────────────
  // These read from the daily-synced Supabase tables (fresh on every device),
  // not manual uploads. Prefixed keys keep them distinct from the manual metrics
  // above so existing saved signals are untouched. See memory/project-data-redundancy.md.
  {
    key: 'glimpse', label: 'Daily Glimpse (Cloud)', color: '#38bdf8',
    metrics: [
      { key: 'glSales',      label: 'Net Sales $ · cloud',       source: 'glimpseRows', field: 'allNetSales',    granularity: ['daily','monthly'], better: 'higher', unit: '$' },
      { key: 'glGC',         label: 'Guest Count · cloud',       source: 'glimpseRows', field: 'gc',             granularity: ['daily','monthly'], better: 'higher', unit: 'guests' },
      { key: 'glLaborPct',   label: 'Labor % · cloud',           source: 'glimpseRows', field: 'laborPct',       granularity: ['daily','monthly'], better: 'lower',  unit: 'pct' },
      { key: 'glPromoPct',   label: 'Promo % · cloud',           source: 'glimpseRows', field: 'promoPct',       granularity: ['daily','monthly'], better: 'lower',  unit: 'pct' },
      { key: 'glPromoAmt',   label: 'Promo $ · cloud',           source: 'glimpseRows', field: 'promoAmt',       granularity: ['daily','monthly'], better: 'lower',  unit: '$', aggregate: 'sum' },
      { key: 'glPosOverCnt', label: 'POS Override count · cloud', source: 'glimpseRows', field: 'posOverCnt',     granularity: ['daily','monthly'], better: 'lower',  unit: 'count', aggregate: 'sum' },
      { key: 'glPosOverAmt', label: 'POS Override $ · cloud',    source: 'glimpseRows', field: 'posOverAmt',     granularity: ['daily','monthly'], better: 'lower',  unit: '$', aggregate: 'sum' },
      { key: 'glCashOSPct',  label: 'Cash Over/Short % · cloud', source: 'glimpseRows', field: 'cashOSPct',      granularity: ['daily','monthly'], better: 'lower',  unit: 'pct' },
      { key: 'glTRedVoid',   label: 'T-Red Voids (count) · cloud',source: 'glimpseRows', field: 'tRedVoidCnt',   granularity: ['daily','monthly'], better: 'lower',  unit: 'count', aggregate: 'sum' },
      { key: 'glTRedDel',    label: 'T-Red Deletes (count) · cloud',source: 'glimpseRows',field:'tRedDeletedCnt',granularity: ['daily','monthly'], better: 'lower',  unit: 'count', aggregate: 'sum' },
      { key: 'glOepe',       label: 'OEPE (sec) · cloud',        source: 'glimpseRows', field: 'oepe',           granularity: ['daily','monthly'], better: 'lower',  unit: 'sec' },
      { key: 'glKvst',       label: 'KVS Time (sec) · cloud',    source: 'glimpseRows', field: 'kvst',           granularity: ['daily','monthly'], better: 'lower',  unit: 'sec' },
      { key: 'glParkedPct',  label: 'DT Park Rate % · cloud',    source: 'glimpseRows', field: 'parkedPct',      granularity: ['daily','monthly'], better: 'lower',  unit: 'pct' },
      { key: 'glDigitalPct', label: 'Digital % of Sales · cloud', source: 'glimpseRows', field: 'digitalPctSales',granularity: ['daily','monthly'], better: null,    unit: 'pct' },
      { key: 'glAppPct',     label: 'App % of Sales · cloud',    source: 'glimpseRows', field: 'appPctSales',    granularity: ['daily','monthly'], better: null,     unit: 'pct' },
    ],
  },
  {
    key: 'cash', label: 'Cash Sheet (Cloud)', color: '#22d3ee',
    metrics: [
      { key: 'csCashRefCnt', label: 'Cash Refund (count) · cloud',source: 'cashRows',  field: 'cashRefCnt',     granularity: ['daily','monthly'], better: 'lower',  unit: 'count', aggregate: 'sum' },
      { key: 'csCashRefAmt', label: 'Cash Refund $ · cloud',     source: 'cashRows',   field: 'cashRefAmt',     granularity: ['daily','monthly'], better: 'lower',  unit: '$', aggregate: 'sum' },
      { key: 'csCashlessRefCnt',label:'Cashless Refund (count) · cloud',source:'cashRows',field:'cashlessRefCnt',granularity:['daily','monthly'], better: 'lower',  unit: 'count', aggregate: 'sum' },
      { key: 'csCashlessRefAmt',label:'Cashless Refund $ · cloud',source:'cashRows',   field: 'cashlessRefAmt', granularity: ['daily','monthly'], better: 'lower',  unit: '$', aggregate: 'sum' },
      { key: 'cs3poSales',   label: '3PO Sales $ · cloud',       source: 'cashRows',   field: 'total3poSales',  granularity: ['daily','monthly'], better: null,     unit: '$', aggregate: 'sum' },
      { key: 'csCashOSPct',  label: 'Cash Over/Short % · cloud', source: 'cashRows',   field: 'cashOSPct',      granularity: ['daily','monthly'], better: 'lower',  unit: 'pct' },
      { key: 'csPosOverAmt', label: 'POS Override $ · cloud',    source: 'cashRows',   field: 'posOverAmt',     granularity: ['daily','monthly'], better: 'lower',  unit: '$', aggregate: 'sum' },
    ],
  },
  {
    key: 'ledger', label: 'Sales Ledger (Cloud)', color: '#818cf8',
    metrics: [
      { key: 'slSales',      label: 'Net Sales $ · cloud',       source: 'salesLedgerRows', field: 'allNetSales', granularity: ['daily','monthly'], better: 'higher', unit: '$' },
      { key: 'slSalesVsLY',  label: 'Sales vs LY % · cloud',     source: 'salesLedgerRows', field: 'salesVsLYPct',granularity: ['daily','monthly'], better: 'higher', unit: 'pct' },
      { key: 'slDtPct',      label: 'DT % of Sales · cloud',     source: 'salesLedgerRows', field: 'dtPctTotal',  granularity: ['daily','monthly'], better: null,     unit: 'pct' },
      { key: 'slDelivPct',   label: 'Delivery % of Sales · cloud',source:'salesLedgerRows', field: 'delivPctTotal',granularity: ['daily','monthly'], better: null,   unit: 'pct' },
      { key: 'slMopPct',     label: 'MOP % of Sales · cloud',    source: 'salesLedgerRows', field: 'mopPctTotal', granularity: ['daily','monthly'], better: null,     unit: 'pct' },
      { key: 'slKioskPct',   label: 'Kiosk % of Sales · cloud',  source: 'salesLedgerRows', field: 'kioskPctTotal',granularity: ['daily','monthly'], better: null,    unit: 'pct' },
      { key: 'slFcPct',      label: 'Front Counter % · cloud',   source: 'salesLedgerRows', field: 'fcPctTotal',  granularity: ['daily','monthly'], better: null,     unit: 'pct' },
    ],
  },
  {
    key: 'daractivity', label: 'DAR Summary (Cloud)', color: '#2dd4bf',
    metrics: [
      { key: 'qaSales',      label: 'Product Sales $ · cloud',   source: 'qsrActSummaryRows', field: 'sales',    granularity: ['daily','monthly'], better: 'higher', unit: '$' },
      { key: 'qaGC',         label: 'Guest Count · cloud',       source: 'qsrActSummaryRows', field: 'gc',       granularity: ['daily','monthly'], better: 'higher', unit: 'guests' },
      { key: 'qaSalesVsLY',  label: 'Sales vs LY % · cloud',     source: 'qsrActSummaryRows', field: 'salesVsLYPct',granularity: ['daily','monthly'], better: 'higher', unit: 'pct' },
      { key: 'qaActHrs',     label: 'Actual Labor Hrs · cloud',  source: 'qsrActSummaryRows', field: 'actHrs',   granularity: ['daily','monthly'], better: null,     unit: 'hrs', aggregate: 'sum' },
      { key: 'qaNeedHrs',    label: 'Needed Labor Hrs · cloud',  source: 'qsrActSummaryRows', field: 'needHrs',  granularity: ['daily','monthly'], better: null,     unit: 'hrs', aggregate: 'sum' },
    ],
  },
  // ── Weather (auto — Open-Meteo → weatherRows) ───────────────────────────────
  // Daily station weather per store. Lets the Scanner surface weather↔sales/traffic
  // relationships (Notes 28 #3). Temps drop 0 as missing (0°F never happens in
  // FL/OK); rain keeps 0 (a real "no-rain" day — dropping it would only correlate
  // rainy days, which is exactly the wrong thing to do).
  {
    key: 'weather', label: 'Weather', color: '#7dd3fc',
    metrics: [
      { key: 'wxTmax', label: 'High Temp (°F)',   source: 'weatherRows', field: 'tmax', granularity: ['daily','monthly'], better: null, unit: '°F' },
      { key: 'wxTmin', label: 'Low Temp (°F)',    source: 'weatherRows', field: 'tmin', granularity: ['daily','monthly'], better: null, unit: '°F' },
      { key: 'wxTavg', label: 'Avg Temp (°F)',    source: 'weatherRows', field: 'davg', granularity: ['daily','monthly'], better: null, unit: '°F' },
      { key: 'wxRain', label: 'Rainfall (in)',    source: 'weatherRows', field: 'rain', granularity: ['daily','monthly'], better: null, unit: 'in', allowZero: true },
      { key: 'wxWind', label: 'Wind Speed (mph)', source: 'weatherRows', field: 'wspd', granularity: ['daily','monthly'], better: null, unit: 'mph' },
    ],
  },
  // ── Calendar (synthesized from the date — no source table) ───────────────────
  // Day-of-week / calendar factors so common-sense patterns surface in the Scanner
  // and Signal Lab (Notes 28 #4), not just raw metric pairs. Each is a 0/1 flag per
  // (loc, date), so a Pearson vs sales/traffic reads as the day's lift (point-
  // biserial). Friday is broken out on purpose — the Filet-O-Fish-Fridays anchor
  // for the eventual product-mix correlation (Notes 28 #5). Daily-only: a weekend
  // flag averaged over a month is ~constant and meaningless.
  {
    key: 'calendar', label: 'Calendar', color: '#fbbf24',
    metrics: [
      { key: 'calWeekend', label: 'Weekend (Sat/Sun)', source: '__calendar', field: 'weekend', granularity: ['daily'], better: null, unit: 'flag', allowZero: true },
      { key: 'calFri',     label: 'Friday',            source: '__calendar', field: 'friday',  granularity: ['daily'], better: null, unit: 'flag', allowZero: true },
      { key: 'calMon',     label: 'Monday',            source: '__calendar', field: 'monday',  granularity: ['daily'], better: null, unit: 'flag', allowZero: true },
    ],
  },
];

// Calendar field synthesizers (date → 0/1 flag). Keyed by the metric's `field`.
const CAL_FIELDS = {
  weekend: d => (d.getDay() === 0 || d.getDay() === 6) ? 1 : 0,
  friday:  d => d.getDay() === 5 ? 1 : 0,
  monday:  d => d.getDay() === 1 ? 1 : 0,
};
// Daily-grained real sources whose (loc, date) coverage defines the universe a
// calendar metric is generated over, so it intersects cleanly with any metric.
const _CAL_SRC = ['laborRows','opsRows','ctrlRows','glimpseRows','salesLedgerRows','qsrActSummaryRows','cashRows','weatherRows'];

// Flat lookup by key
export const METRIC_FLAT = {};
for (const cat of METRIC_CATEGORIES) {
  for (const m of cat.metrics) {
    METRIC_FLAT[m.key] = { ...m, category: cat.key, categoryLabel: cat.label, categoryColor: cat.color };
  }
}

export function findMetric(key) { return METRIC_FLAT[key] || null; }

// ── Concept grouping (scanner de-duplication) ─────────────────────────────────
// Several metrics measure the SAME underlying quantity — the identical number
// pulled from a different source (manual vs cloud), or the same event expressed
// as count / $ / %. Correlating those against each other is a tautology (r≈1)
// that clutters the scanner. Metrics sharing a concept are never paired with one
// another; every CROSS-concept relationship is still surfaced.
const METRIC_CONCEPT = {
  // net sales — manual, glimpse, ledger, DAR
  sales: 'net_sales', glSales: 'net_sales', slSales: 'net_sales', qaSales: 'net_sales',
  // guest count
  gc: 'guest_count', glGC: 'guest_count', qaGC: 'guest_count',
  // sales vs LY
  salesVsLY: 'sales_vs_ly', slSalesVsLY: 'sales_vs_ly', qaSalesVsLY: 'sales_vs_ly',
  // labor %
  laborPct: 'labor_pct', glLaborPct: 'labor_pct',
  // service timings
  oepe: 'oepe', glOepe: 'oepe',
  kvst: 'kvst', glKvst: 'kvst',
  parkPct: 'park_pct', glParkedPct: 'park_pct',
  // channel mix
  dtMixPct: 'dt_pct', slDtPct: 'dt_pct',
  // controls families — collapse count/$/% + manual/cloud into one concept each
  promoPct: 'promo', promoCnt: 'promo', promoAmt: 'promo', glPromoPct: 'promo', glPromoAmt: 'promo',
  discPct: 'discount', discCnt: 'discount', discAmt: 'discount',
  cashOSPct: 'cash_os', cashOSAmt: 'cash_os', glCashOSPct: 'cash_os', csCashOSPct: 'cash_os',
  posOverCnt: 'pos_over', posOverAmt: 'pos_over', glPosOverCnt: 'pos_over', glPosOverAmt: 'pos_over', csPosOverAmt: 'pos_over',
  cashRefCnt: 'cash_ref', cashRefAmt: 'cash_ref', csCashRefCnt: 'cash_ref', csCashRefAmt: 'cash_ref',
  cashlessRefCnt: 'cashless_ref', cashlessRefAmt: 'cashless_ref', csCashlessRefCnt: 'cashless_ref', csCashlessRefAmt: 'cashless_ref',
  tRedBPct: 'tred_before', tRedBCnt: 'tred_before',
  tRedAPct: 'tred_after', tRedACnt: 'tred_after',
  // temperature — high/low/avg all measure the same thing (r≈0.9 among themselves);
  // group so they never pair with each other, but still pair with everything else.
  wxTmax: 'temp', wxTmin: 'temp', wxTavg: 'temp',
};
// The concept for a metric key (defaults to the key itself when ungrouped).
export function metricConcept(key) { return METRIC_CONCEPT[key] || key; }

// ── Period helpers ────────────────────────────────────────────────────────────
function _normLoc(l) { return String(parseInt(String(l||'').replace(/\D/g,''),10)||''); }
function _mKey(d) {
  const dt = d instanceof Date ? d : new Date(String(d));
  return dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0');
}
function _dKey(d) {
  const dt = d instanceof Date ? d : new Date(String(d));
  return dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
}
function _smgDate(r) { return new Date(r.year, (r.month||1)-1, 1); }

// ── Extraction ────────────────────────────────────────────────────────────────
// Returns [{loc, date, value}] for a given metric key, ds, granularity, optional scopeLoc
// The (loc, date) universe a calendar metric is synthesized over — the union of
// days present across the real daily streams, deduped, optionally scoped to one loc.
function _calendarUniverse(ds, scopeLoc) {
  const seen = new Set(); const out = [];
  const scope = scopeLoc ? _normLoc(scopeLoc) : null;
  for (const key of _CAL_SRC) {
    const src = ds[key];
    if (!src || !src.length) continue;
    for (const r of src) {
      if (!r.date) continue;
      const loc = _normLoc(r.loc);
      if (scope && loc !== scope) continue;
      const dt = r.date instanceof Date ? r.date : new Date(String(r.date));
      if (isNaN(+dt)) continue;
      const k = loc + '_' + _dKey(dt);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ loc, date: dt });
    }
  }
  return out;
}

export function extractMetricValues(metricKey, ds, granularity, scopeLoc) {
  const meta = findMetric(metricKey);
  if (!meta) return [];
  const field = meta.field;
  const altField = meta.altField;

  // Calendar metrics have no source table — synthesize a 0/1 flag per (loc, date).
  if (meta.source === '__calendar') {
    if (granularity !== 'daily') return [];
    const fn = CAL_FIELDS[field];
    if (!fn) return [];
    return _calendarUniverse(ds, scopeLoc).map(u => ({ loc: u.loc, date: u.date, value: fn(u.date) }));
  }

  const src = ds[meta.source] || [];
  const rows = scopeLoc ? src.filter(r => _normLoc(r.loc) === _normLoc(scopeLoc)) : src;

  if (meta.source === 'smgFullscale') {
    return rows
      .filter(r => r[field] != null && !isNaN(r[field]) && r.year && r.month)
      .map(r => ({ loc: _normLoc(r.loc), date: _smgDate(r), value: r[field] }));
  }

  if (meta.source === 'smgVoicePerf') {
    // Point-in-time Monthly only — skip trailing90/ytd rolling windows so a
    // month's value is comparable to the other monthly streams. period='YYYY-MM'.
    // A store can appear under several operator reports (overlapping stores) or
    // as a re-upload duplicate — collapse to one point per (loc, month) so it
    // isn't counted 2–3× in a correlation.
    const byKey = {};
    rows
      .filter(r => r && r.report_type === 'monthly' && r[field] != null && !isNaN(r[field]) && typeof r.period === 'string')
      .forEach(r => {
        const [y, m] = r.period.split('-').map(Number);
        const date = new Date(y, (m || 1) - 1, 1);
        if (!(date instanceof Date) || isNaN(+date)) return;
        const loc = _normLoc(r.loc);
        byKey[loc + '|' + r.period] = { loc, date, value: r[field] };
      });
    return Object.values(byKey);
  }

  if (granularity === 'daily') {
    return rows
      .filter(r => r.date)
      .flatMap(r => {
        const v = r[field] != null ? r[field] : (altField ? r[altField] : null);
        // Drop 0 as a missing-data proxy — EXCEPT where 0 is a legitimate value
        // (rainfall on a dry day, a calendar flag that's off), flagged allowZero.
        if (v == null || isNaN(v) || (v === 0 && !meta.allowZero)) return [];
        return [{ loc: _normLoc(r.loc), date: r.date, value: v }];
      });
  }

  // Monthly aggregation
  const byKey = {};
  for (const r of rows) {
    if (!r.date) continue;
    const v = r[field] != null ? r[field] : (altField ? r[altField] : null);
    if (v == null || isNaN(v)) continue;
    const k = _normLoc(r.loc) + '_' + _mKey(r.date);
    if (!byKey[k]) byKey[k] = { loc: _normLoc(r.loc), date: r.date, sum: 0, n: 0 };
    byKey[k].sum += v;
    byKey[k].n++;
  }
  return Object.values(byKey)
    .filter(b => b.n > 0)
    .map(b => ({ loc: b.loc, date: b.date, value: meta.aggregate === 'sum' ? b.sum : b.sum / b.n }));
}

// ── Statistics ────────────────────────────────────────────────────────────────
function pearson(pairs) {
  const n = pairs.length;
  if (n < 5) return null;
  const mx = pairs.reduce((s,p)=>s+p.x,0)/n;
  const my = pairs.reduce((s,p)=>s+p.y,0)/n;
  let num=0, dx2=0, dy2=0;
  for (const {x,y} of pairs) { const dx=x-mx,dy=y-my; num+=dx*dy; dx2+=dx*dx; dy2+=dy*dy; }
  if (!dx2||!dy2) return null;
  return Math.max(-1, Math.min(1, num/Math.sqrt(dx2*dy2)));
}

export function linearRegression(pairs) {
  const n = pairs.length;
  if (n < 5) return null;
  const mx = pairs.reduce((s,p)=>s+p.x,0)/n;
  const my = pairs.reduce((s,p)=>s+p.y,0)/n;
  let num=0, den=0;
  for (const {x,y} of pairs) { const dx=x-mx; num+=dx*(y-my); den+=dx*dx; }
  if (!den) return null;
  const slope = num/den;
  return { slope, intercept: my - slope*mx, mx, my };
}

// ── Conditional filtering ─────────────────────────────────────────────────────
// Conditions narrow the data before Pearson is computed.
// 'high'/'low' split at the median or average of the chosen axis values.
// 'positive'/'negative' split at zero (useful for gap/variance metrics).
function computeThreshold(values, reference) {
  if (!values.length) return null;
  if (reference === 'average') return values.reduce((a,b)=>a+b,0)/values.length;
  const sorted = [...values].sort((a,b)=>a-b);
  return sorted[Math.floor(sorted.length/2)];
}

function filterPairsByCondition(pairs, axis, condition, reference) {
  if (!condition || condition === 'all') return pairs;
  const get = p => axis === 'x' ? p.x : p.y;
  if (condition === 'positive') return pairs.filter(p => get(p) > 0);
  if (condition === 'negative') return pairs.filter(p => get(p) < 0);
  const threshold = computeThreshold(pairs.map(get), reference || 'median');
  if (threshold == null) return pairs;
  if (condition === 'high') return pairs.filter(p => get(p) > threshold);
  if (condition === 'low')  return pairs.filter(p => get(p) < threshold);
  return pairs;
}

export function getConditionLabel(condition, reference, metaMeta) {
  if (!condition || condition === 'all') return null;
  const ref = reference === 'average' ? 'avg' : 'median';
  if (condition === 'positive') return '> 0';
  if (condition === 'negative') return '< 0';
  if (condition === 'high') return metaMeta?.better === 'lower' ? `Above ${ref} (worse)` : `Above ${ref}`;
  if (condition === 'low')  return metaMeta?.better === 'higher' ? `Below ${ref} (worse)` : `Below ${ref}`;
  return condition;
}

// ── Custom Signal Computation ─────────────────────────────────────────────────
// def: { id, name, xMetric, yMetric, granularity, scope,
//        xCondition?, xReference?, yCondition?, yReference? }
// scope: 'district' or a loc string for per-store
// xCondition/yCondition: 'all'|'high'|'low'|'positive'|'negative'
// xReference/yReference: 'median'|'average'
export function computeCustomSignal(def, ds) {
  const xMeta = findMetric(def.xMetric);
  const yMeta = findMetric(def.yMetric);
  if (!xMeta || !yMeta) return null;

  const gran = def.granularity || 'daily';
  const scopeLoc = (!def.scope || def.scope === 'district') ? null : def.scope;

  const xVals = extractMetricValues(def.xMetric, ds, gran, scopeLoc);
  const yVals = extractMetricValues(def.yMetric, ds, gran, scopeLoc);
  if (!xVals.length || !yVals.length) return { r: null, n: 0, pairs: [], regression: null };

  const keyFn = gran === 'daily' ? _dKey : _mKey;
  const yIdx = {};
  for (const r of yVals) yIdx[_normLoc(r.loc) + '_' + keyFn(r.date)] = r.value;

  let pairs = [];
  for (const r of xVals) {
    const yv = yIdx[_normLoc(r.loc) + '_' + keyFn(r.date)];
    if (yv != null && !isNaN(yv)) pairs.push({ x: r.value, y: yv, loc: r.loc, date: r.date });
  }

  // Apply optional conditions
  const xCond = def.xCondition || 'all';
  const yCond = def.yCondition || 'all';
  const xRef  = def.xReference || 'median';
  const yRef  = def.yReference || 'median';
  if (xCond !== 'all') pairs = filterPairsByCondition(pairs, 'x', xCond, xRef);
  if (yCond !== 'all') pairs = filterPairsByCondition(pairs, 'y', yCond, yRef);

  const r = pearson(pairs);
  const regression = r != null ? linearRegression(pairs) : null;
  const confirmed = r != null && Math.abs(r) >= 0.50 && pairs.length >= 20;

  const xCondLabel = getConditionLabel(xCond, xRef, xMeta);
  const yCondLabel = getConditionLabel(yCond, yRef, yMeta);
  const condDesc = [xCondLabel ? `X: ${xCondLabel}` : null, yCondLabel ? `Y: ${yCondLabel}` : null].filter(Boolean).join(' · ');

  return {
    id: def.id,
    name: def.name || `${xMeta.label} → ${yMeta.label}`,
    xLabel: xMeta.label, yLabel: yMeta.label,
    xMeta, yMeta,
    r, n: pairs.length, pairs, regression, confirmed,
    domain: 'custom', granularity: gran,
    xCondition: xCond, yCondition: yCond,
    description: condDesc
      ? `${xMeta.categoryLabel} → ${yMeta.categoryLabel} · ${gran} · ${condDesc}`
      : `${xMeta.categoryLabel} → ${yMeta.categoryLabel} · ${gran}`,
  };
}

export function computeAllCustomSignals(defs, ds) {
  if (!defs?.length || !ds) return [];
  const results = [];
  for (const def of defs) {
    if (def.status === 'graveyard') continue;
    try {
      const sig = computeCustomSignal(def, ds);
      if (sig) results.push({ ...sig, defId: def.id, status: def.status || 'active', promotedTo: def.promoted_to || [] });
    } catch(e) { console.warn('[signal-registry] compute error', def.id, e); }
  }
  return results;
}

// ── Retirement detection ──────────────────────────────────────────────────────
// Propose graveyard when n ≥ 50 AND |r| < 0.15 for 3+ consecutive computations
export function shouldRetire(def, currentR, currentN) {
  if (currentN == null || currentN < 50) return false;
  if (Math.abs(currentR || 0) >= 0.15) return false;
  const history = def.history || [];
  if (history.length < 3) return false;
  return history.slice(-3).every(h => Math.abs(h.r || 0) < 0.15);
}

// ── Projection influence ──────────────────────────────────────────────────────
// For a promoted custom signal where Y is a sales/GC outcome, estimate
// the projected deviation given the current X value for a store.
// Returns { signal, projectedDelta, unit } or null
const OUTCOME_METRICS = new Set(['sales','gc','avgCheck','laborPct','fobPct','baseFoodPct']);

export function getProjectionInfluence(customSig, def, currentXValue) {
  if (!def?.promoted_to?.includes('projections')) return null;
  if (!OUTCOME_METRICS.has(def.yMetric)) return null;
  if (!customSig?.regression || !customSig.confirmed) return null;
  const { slope, mx, my } = customSig.regression;
  const predictedY = slope * currentXValue + (my - slope * mx);
  const delta = predictedY - my;
  return { signal: customSig, predictedY, delta, baselineY: my };
}

// ── Auto-correlation scanner ──────────────────────────────────────────────────
// Cycles every metric PAIR across the loaded data, computes Pearson + Spearman,
// and surfaces only pairs that clear an effect-size bar AND survive a
// multiple-comparisons (Benjamini–Hochberg FDR) correction — because scanning
// ~hundreds of pairs guarantees some will look "significant" by chance alone.
// Framing is ALWAYS "move together," never causation.

// Spearman rank correlation = Pearson on the rank-transformed values.
// Catches monotone-but-nonlinear relationships and is robust to outliers.
export function spearman(pairs) {
  const n = pairs.length;
  if (n < 5) return null;
  const rankOf = (getter) => {
    const arr = pairs.map((p, i) => ({ v: getter(p), i })).sort((a, b) => a.v - b.v);
    const ranks = new Array(n);
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && arr[j + 1].v === arr[i].v) j++;
      const avg = (i + j) / 2 + 1; // 1-based average rank for ties
      for (let k = i; k <= j; k++) ranks[arr[k].i] = avg;
      i = j + 1;
    }
    return ranks;
  };
  const xr = rankOf(p => p.x);
  const yr = rankOf(p => p.y);
  return pearson(xr.map((x, i) => ({ x, y: yr[i] })));
}

// Standard-normal CDF via an Abramowitz–Stegun erf approximation.
function _erf(x) {
  const s = x < 0 ? -1 : 1; const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return s * y;
}
function _normCdf(z) { return 0.5 * (1 + _erf(z / Math.SQRT2)); }

// Two-sided p-value for a Pearson r under H0: rho = 0.
// t = r·√((n−2)/(1−r²)); approximated by the normal tail (accurate for n ≳ 30,
// which is our scanner minimum). Small-sample monthly scans are directional only.
export function pValueFromR(r, n) {
  if (r == null || n == null || n < 4) return null;
  const rr = Math.min(0.999999, Math.max(-0.999999, r));
  const t = rr * Math.sqrt((n - 2) / (1 - rr * rr));
  const p = 2 * (1 - _normCdf(Math.abs(t)));
  return Math.max(0, Math.min(1, p));
}

// Benjamini–Hochberg FDR. Mutates each item: sets .qValue and .fdrSig (survives
// FDR at `alpha`). Denominator = number of tests actually run (all pairs scored),
// so the correction reflects the true search space, not just what we surface.
export function benjaminiHochberg(items, alpha = 0.05) {
  const withP = items.filter(it => it.p != null);
  const m = withP.length;
  if (!m) return items;
  const sorted = [...withP].sort((a, b) => a.p - b.p);
  let kMax = 0;
  for (let i = 0; i < m; i++) if (sorted[i].p <= ((i + 1) / m) * alpha) kMax = i + 1;
  const threshP = kMax > 0 ? sorted[kMax - 1].p : -1;
  let minq = 1;
  for (let i = m - 1; i >= 0; i--) {
    const q = Math.min(1, sorted[i].p * m / (i + 1));
    minq = Math.min(minq, q);
    sorted[i].qValue = minq;
  }
  for (const it of withP) it.fdrSig = it.p <= threshP;
  return items;
}

// scanAllPairs — the auto-scanner.
// opts: { granularity:'daily'|'monthly', minN, minAbsR, scopeLoc, alpha }
// Returns { granularity, minN, minAbsR, alpha, metricsUsed, tested, fdrCount, results }
// results: [{ xKey,yKey,xLabel,yLabel,xCat,yCat, r, rho, n, p, qValue, fdrSig,
//             divergent, crossDomain }] sorted by |r| desc (surfaced pairs only).
export function scanAllPairs(ds, opts = {}) {
  const gran = opts.granularity || 'daily';
  const minN = opts.minN || (gran === 'daily' ? 30 : 6);
  const minAbsR = opts.minAbsR != null ? opts.minAbsR : 0.35;
  const scopeLoc = opts.scopeLoc || null;
  const alpha = opts.alpha || 0.05;
  if (!ds) return { granularity: gran, minN, minAbsR, alpha, metricsUsed: 0, tested: 0, fdrCount: 0, results: [] };

  const keyFn = gran === 'daily' ? _dKey : _mKey;

  // Pre-extract each usable metric once → { loc_period : value }.
  const valMap = {};
  for (const cat of METRIC_CATEGORIES) {
    for (const m of cat.metrics) {
      if (!m.granularity.includes(gran)) continue;
      const src = ds[m.source];
      if (!src || !src.length) continue;
      const vals = extractMetricValues(m.key, ds, gran, scopeLoc);
      if (vals.length < minN) continue;
      const map = {};
      for (const v of vals) map[_normLoc(v.loc) + '_' + keyFn(v.date)] = v.value;
      valMap[m.key] = map;
    }
  }

  const keys = Object.keys(valMap);
  const all = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i], b = keys[j];
      // Skip same-concept pairs (identical quantity from another source, or the
      // same event as count/$/%) — those are tautologies, not discoveries.
      if (metricConcept(a) === metricConcept(b)) continue;
      // Skip calendar×calendar (weekend vs Friday etc.) — both are date-derived,
      // correlating them says nothing about the business.
      if (findMetric(a).category === 'calendar' && findMetric(b).category === 'calendar') continue;
      const ma = valMap[a], mb = valMap[b];
      // Intersect on shared loc_period keys; iterate the smaller map.
      const iter = Object.keys(ma).length <= Object.keys(mb).length ? ma : mb;
      const pairs = [];
      for (const k in iter) {
        const av = ma[k], bv = mb[k];
        if (av != null && bv != null && !isNaN(av) && !isNaN(bv)) pairs.push({ x: av, y: bv });
      }
      if (pairs.length < minN) continue;
      const r = pearson(pairs);
      if (r == null) continue;
      const am = findMetric(a), bm = findMetric(b);
      all.push({
        xKey: a, yKey: b, xLabel: am.label, yLabel: bm.label,
        xCat: am.categoryLabel, yCat: bm.categoryLabel,
        r, n: pairs.length, p: pValueFromR(r, pairs.length),
        crossDomain: am.category !== bm.category,
        _pairs: pairs,
      });
    }
  }

  // FDR across the full test space, THEN surface by effect size.
  benjaminiHochberg(all, alpha);
  const results = all
    .filter(t => Math.abs(t.r) >= minAbsR)
    .map(t => {
      const rho = spearman(t._pairs);
      const out = { ...t, rho, divergent: rho != null && Math.abs(t.r - rho) >= 0.25 };
      delete out._pairs;
      return out;
    })
    .sort((x, y) => Math.abs(y.r) - Math.abs(x.r));

  return {
    granularity: gran, minN, minAbsR, alpha,
    metricsUsed: keys.length,
    tested: all.length,
    fdrCount: all.filter(t => t.fdrSig).length,
    results,
  };
}

// ── Predefined "obvious" signals ──────────────────────────────────────────────
// Curated correlations that ship with the app so Signals has value on day one,
// before anyone builds a custom one. Computed live via computeCustomSignal(ds).
// Keys reference the metric registry above; each falls back gracefully to no
// data when its source isn't loaded.
export const SEEDED_SIGNALS = [
  { id: 'seed-park-oepe',   name: 'DT Park Rate → OEPE',              xMetric: 'parkPct',  yMetric: 'oepe',      granularity: 'daily',   seeded: true, rationale: 'More pull-forwards usually track with a slower drive-thru total experience.' },
  { id: 'seed-labor-tpph',  name: 'Labor % → TPPH',                   xMetric: 'laborPct', yMetric: 'tpph',      granularity: 'daily',   seeded: true, rationale: 'Throughput per labor hour vs how much labor you are spending.' },
  { id: 'seed-tredb-cashos',name: 'T-Reds Before Total % → Cash Over/Short %', xMetric: 'tRedBPct', yMetric: 'cashOSPct', granularity: 'daily', seeded: true, rationale: 'A classic loss-prevention pairing — reductions before total vs drawer variance.' },
  { id: 'seed-disc-sales',  name: 'Discount % → Net Sales',           xMetric: 'discPct',  yMetric: 'sales',     granularity: 'daily',   seeded: true, rationale: 'Do heavier discount days move top-line sales, or just give margin away?' },
  { id: 'seed-gc-sales',    name: 'Guest Count → Net Sales',          xMetric: 'gc',       yMetric: 'sales',     granularity: 'daily',   seeded: true, rationale: 'Sanity anchor — traffic should strongly track sales; a weak r flags a check-average story.' },
  { id: 'seed-promo-gc',    name: 'Promo % → Guest Count',            xMetric: 'promoPct', yMetric: 'gc',        granularity: 'daily',   seeded: true, rationale: 'Are promotions actually pulling traffic in?' },
  { id: 'seed-fob-base',    name: 'FOB % → Base Food %',              xMetric: 'fobPct',   yMetric: 'baseFoodPct',granularity:'monthly', seeded: true, rationale: 'How much of food-over-base is driven by base food cost vs controllable waste.' },
  { id: 'seed-weekend-sales',name:'Weekend → Net Sales',              xMetric: 'calWeekend',yMetric: 'sales',    granularity: 'daily',   seeded: true, rationale: 'The obvious one — do Sat/Sun run hotter? A weak or negative r on a given store is itself a flag.' },
  { id: 'seed-temp-sales',  name: 'High Temp → Net Sales',            xMetric: 'wxTmax',   yMetric: 'sales',     granularity: 'daily',   seeded: true, rationale: 'Does warmer weather move the top line? Watch for the divergent Spearman flag — the effect is often nonlinear.' },
  { id: 'seed-rain-gc',     name: 'Rainfall → Guest Count',           xMetric: 'wxRain',   yMetric: 'gc',        granularity: 'daily',   seeded: true, rationale: 'Rain days vs traffic — does weather pull guests, and does the drive-thru pick up the slack?' },
  { id: 'seed-fri-sales',   name: 'Friday → Net Sales',               xMetric: 'calFri',   yMetric: 'sales',     granularity: 'daily',   seeded: true, rationale: 'Friday lift — the anchor for the eventual Filet-O-Fish-Fridays product-mix check.' },
];
