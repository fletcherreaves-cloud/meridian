// @ts-nocheck
// ── Metric provenance (source lineage) — Notes 33 transparency directive ──────
// Every metric Meridian surfaces must be traceable to its verifiable source, so a
// user can pull it up and check it against the applicable report. This registry maps
// a metric key → where it comes from and how it's computed:
//   system  — source platform (QSRSoft / LifeLenz / SMG VOICE / Meridian-derived)
//   report  — the human-facing report/screen the number lives on
//   table   — the Supabase table it's cloud-persisted in (for auditing)
//   formula — how it's computed/composed (composed metrics show their math)
//   grain   — cadence / granularity
// 100% transparency + accuracy: no black-box numbers. Surfaced via the KPI ⓘ.
// See memory/feedback-metric-provenance.md + reference-digital-app-formula.md.
export const METRIC_PROVENANCE = {
  headcount:    { system: 'QSRSoft', report: 'Roster Statistics',              table: 'roster_statistics',  formula: 'Roster Active — all active hourly (crew + shift + GM&DM active)',                         grain: 'monthly · per store' },
  shiftCert:    { system: 'QSRSoft', report: 'Employee Roster',                table: 'roster_role_counts', formula: '# active Shift-Certified Managers = Cert Swing + Dept Mgrs (GM excluded)',                grain: 'monthly · per store' },
  turnover90:   { system: 'QSRSoft', report: 'Turnover Report (Crew)',         table: 'turnover_monthly',   formula: '0-90 turnover = 1 − Retained>90% (crew)',                                                grain: 'monthly · per store' },
  digitalGC:    { system: 'QSRSoft', report: 'Digital App (mobileApp report)', table: 'digital_app_monthly', formula: 'Digital App GCs ÷ rest-days. Digital App = Mobile Order Ahead + Scanned Offers (×3) + Loyalty Self-ID Earn + Internal/GMA Delivery', grain: 'monthly · per store' },
  delivGC:      { system: 'QSRSoft', report: 'McDelivery / Delivery (3PO)',    table: 'mcdelivery_monthly',  formula: '3PO GC ÷ rest-days (Combined Vendors: DoorDash/GrubHub/PostMates/UberEats)',             grain: 'monthly · per store' },
  oepe:         { system: 'QSRSoft', report: 'Daily Activity (DAR) — peaks',   table: 'qsr_daily_activity', formula: 'Order-to-Exit peak efficiency (sec), peak dayparts',                                     grain: 'daily · per store-hour' },
  r2p:          { system: 'QSRSoft', report: 'Daily Activity (DAR) — front counter', table: 'qsr_daily_activity', formula: 'R2P = Receipt to Print (sec) = (fc_untilserve − fc_untilclosedrawer) ÷ fc_trans_cnt ÷ 1000, count-weighted across the day. Reconciled exactly to the DAR R2P column. Manual Ops Report wins first if uploaded; DAR fallback is cloud-fresh (current-day)', grain: 'daily · per store' },
  osat:         { system: 'SMG VOICE', report: 'FullScale scorecard',          table: 'smg_fullscale',      formula: 'OSAT 5★ pass % (only 5★ counts as a pass)',                                             grain: 'monthly · per store' },
  foodOB:       { system: 'QSRSoft', report: 'FOB / Food Cost',                table: 'qsr_fob',            formula: 'Food + paper over base $ (dollar-weighted)',                                             grain: 'monthly · per store' },
  opSupplies:   { system: 'QSRSoft', report: 'eBOS Purchases',                 table: 'qsr_ebos_daily',     formula: 'Σ operating-supplies purchases $',                                                      grain: 'daily · per store' },
};

export const provenanceFor = key => METRIC_PROVENANCE[key] || null;

// One-line, human-readable source string for a tooltip / ⓘ.
export function provenanceText(key) {
  const p = METRIC_PROVENANCE[key];
  if (!p) return '';
  return `Source: ${p.system} — ${p.report}${p.table ? ` (${p.table})` : ''}. ${p.formula}. ${p.grain}.`;
}
