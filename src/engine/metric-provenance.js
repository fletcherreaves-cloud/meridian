// @ts-nocheck
// ── Metric provenance (source lineage) — Notes 33 transparency directive ──────
// Every metric Meridian surfaces must be traceable to its verifiable source, so a
// user can pull it up and check it against the applicable report. This registry is the
// SINGLE place that records, for each metric, where it comes from and — for anything
// CALCULATED FROM OTHER METRICS — the exact math and its upstream inputs.
//   label    — human display name
//   system   — source platform (QSRSoft / LifeLenz / SMG VOICE / Meridian-derived)
//   report   — the human-facing report/screen the number lives on
//   table    — the Supabase table it's cloud-persisted in (for auditing)
//   composed — true when the value is CALCULATED from other fields/metrics (not read directly)
//   inputs   — the upstream fields/metrics a composed metric is built from
//   formula  — the exact computation (composed metrics show their math)
//   grain    — cadence / granularity
// 100% transparency + accuracy: no black-box numbers. Surfaced via the KPI ⓘ AND the
// Metric Lineage panel (views/metric-lineage.js). See memory/feedback-metric-provenance.md,
// reference-digital-app-formula.md, reference-r2p-formula.md.
export const METRIC_PROVENANCE = {
  // ── Composed / derived (calculated from other metrics or raw fields) ──────────
  digitalGC:  { label: 'Digital App GC/day', system: 'QSRSoft', report: 'Digital App (mobileApp report)', table: 'digital_app_monthly', composed: true,
    inputs: ['Mobile Order Ahead GC', 'Scanned Offers (×3)', 'Loyalty Self-ID Earn', 'Internal/GMA Delivery GC', 'rest-days'],
    formula: 'Digital App GCs ÷ rest-days, where Digital App = Mobile Order Ahead + Scanned Offers (×3) + Loyalty Self-ID Earn + Internal/GMA Delivery', grain: 'monthly · per store' },
  delivGC:    { label: 'McDelivery 3PO GC/day', system: 'QSRSoft', report: 'McDelivery / Delivery (3PO)', table: 'mcdelivery_monthly', composed: true,
    inputs: ['3PO GC (DoorDash + GrubHub + PostMates + UberEats)', 'rest-days'],
    formula: '3PO GC ÷ rest-days (Combined Vendors: DoorDash / GrubHub / PostMates / UberEats)', grain: 'monthly · per store' },
  oepe:       { label: 'OEPE (Order-to-Exit)', system: 'QSRSoft', report: 'Daily Activity (DAR) — drive-thru', table: 'qsr_daily_activity', composed: true,
    inputs: ['dt_untilserve', 'dt_untilstore', 'dt_trans_cnt'],
    formula: 'OEPE (sec) = (dt_untilserve − dt_untilstore) ÷ dt_trans_cnt ÷ 1000, count-weighted across the day. Reconciled exactly to the DAR OEPE column. Manual Ops Report / emailed Glimpse win first; DAR fallback is cloud-fresh (current-day)', grain: 'daily · per store' },
  r2p:        { label: 'R2P (Receipt to Print)', system: 'QSRSoft', report: 'Daily Activity (DAR) — front counter', table: 'qsr_daily_activity', composed: true,
    inputs: ['fc_untilserve', 'fc_untilclosedrawer', 'fc_trans_cnt'],
    formula: 'R2P (sec) = (fc_untilserve − fc_untilclosedrawer) ÷ fc_trans_cnt ÷ 1000, count-weighted across the day. Reconciled exactly to the DAR R2P column. Manual Ops Report wins first if uploaded; DAR fallback is cloud-fresh (current-day)', grain: 'daily · per store' },
  tpph:       { label: 'TPPH (Transactions/Punched Hr)', system: 'QSRSoft', report: 'Daily Activity (DAR) — labor', table: 'qsr_daily_activity', composed: true,
    inputs: ['transactions', 'actual_punched_hours'],
    formula: 'TPPH = Σ transactions ÷ Σ actual_punched_hours (day). Uses the DAR true transactions count — NOT healthy+unhealthy (a KVS order-health count that understated it ~0.1 vs ~5 target). Matches the Shift Manager Summary transPerPunchedHour', grain: 'daily · per store' },
  avgWinTtl:  { label: 'Avg Win TTL (front-counter total)', system: 'QSRSoft', report: 'Daily Activity (DAR) — front counter', table: 'qsr_daily_activity', composed: true,
    inputs: ['fc_untilserve', 'fc_trans_cnt'],
    formula: 'Avg Win TTL (sec) = fc_untilserve ÷ fc_trans_cnt ÷ 1000. This is the front-counter WINDOW total — NOT R2P (R2P subtracts drawer-close time). Reconciled exactly to the DAR Avg Win TTL column', grain: 'daily · per store' },
  avgDtTtl:   { label: 'Avg DT TTL (drive-thru total)', system: 'QSRSoft', report: 'Daily Activity (DAR) — drive-thru', table: 'qsr_daily_activity', composed: true,
    inputs: ['dt_untilserve', 'dt_trans_cnt'],
    formula: 'Avg DT TTL (sec) = dt_untilserve ÷ dt_trans_cnt ÷ 1000. Reconciled exactly to the DAR Avg DT TTL column', grain: 'daily · per store' },
  foodOB:     { label: 'FOB % (Food + Paper over Base)', system: 'QSRSoft', report: 'FOB / Food Cost', table: 'qsr_fob', composed: true,
    inputs: ['Σ food + paper $ (components)', 'Σ product sales base'],
    formula: 'FOB % = Σ (food + paper) $ ÷ Σ product-sales base — DOLLAR-WEIGHTED (never an average of store %s). Uses the FOB rows own period base, not a window sales base', grain: 'monthly · per store' },
  turnover90: { label: '0–90 Day Turnover', system: 'QSRSoft', report: 'Turnover Report (Crew)', table: 'turnover_monthly', composed: true,
    inputs: ['Retained > 90 days %'],
    formula: '0–90 turnover = 1 − Retained>90% (crew)', grain: 'monthly · per store' },
  shiftCert:  { label: 'Shift-Certified Managers', system: 'QSRSoft', report: 'Employee Roster', table: 'roster_role_counts', composed: true,
    inputs: ['Cert Swing Manager count', 'Department Manager count'],
    formula: '# active Shift-Certified Managers = Cert Swing + Dept Mgrs (GM excluded)', grain: 'monthly · per store' },
  osat:       { label: 'OSAT (5★ pass %)', system: 'SMG VOICE', report: 'FullScale scorecard', table: 'smg_fullscale', composed: true,
    inputs: ['# 5★ responses', '# total responses'],
    formula: 'OSAT = 5★ responses ÷ total responses (only a 5★ counts as a pass)', grain: 'monthly · per store' },
  salesVsLY:  { label: 'Sales vs LY %', system: 'Meridian-derived', report: 'DAR / Labor (matched-day)', table: 'qsr_daily_activity', composed: true,
    inputs: ['current-day product sales', 'same-day last-year product sales (matched days only)'],
    formula: 'Sales vs LY % = (Σ current − Σ LY) ÷ Σ LY over MATCHED days only (a day counts only if it has both current and LY data) — never compares a full current window to a partial LY', grain: 'daily → range · per store' },
  oppTotal:   { label: 'Opportunity $ (recoverable)', system: 'Meridian-derived', report: 'Leadership One-Pager', table: '(computed)', composed: true,
    inputs: ['Labor: (labor% − target) × net sales', 'Food: (FOB% − target) × prod sales', 'GC: (best GC/day − actual) × avg check × days'],
    formula: 'Opportunity $ = Labor$ + Food$ + GC$ (three disjoint pillars, each floored at $0 — beating the benchmark = $0, never a negative credit). Dollar-weighted rollup (Σ$, never average-of-averages). Weekly figure = $ × 7 ÷ days', grain: 'range · per store → district' },

  // ── Direct reads (a single source field / count — shown for completeness) ─────
  headcount:  { label: 'Active Headcount', system: 'QSRSoft', report: 'Roster Statistics', table: 'roster_statistics', composed: false,
    inputs: ['Roster Active count'],
    formula: 'Roster Active — all active hourly (crew + shift + GM&DM active)', grain: 'monthly · per store' },
  opSupplies: { label: 'Operating Supplies $', system: 'QSRSoft', report: 'eBOS Purchases', table: 'qsr_ebos_daily', composed: false,
    inputs: ['operating-supplies purchase lines'],
    formula: 'Σ operating-supplies purchases $', grain: 'daily · per store' },
};

export const provenanceFor = key => METRIC_PROVENANCE[key] || null;

// Every composed (calculated-from-other-metrics) entry, as [key, entry] pairs — for the
// Metric Lineage transparency panel.
export function composedMetrics() {
  return Object.entries(METRIC_PROVENANCE).filter(([, p]) => p.composed);
}

// One-line, human-readable source string for a tooltip / ⓘ.
export function provenanceText(key) {
  const p = METRIC_PROVENANCE[key];
  if (!p) return '';
  return `Source: ${p.system} — ${p.report}${p.table ? ` (${p.table})` : ''}. ${p.formula}. ${p.grain}.`;
}
