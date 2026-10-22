// @ts-nocheck
import { METRIC_SOURCES } from './metric-source.js';
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
//
// ── Notes 61 — "complete listing of every metric we have access to, generated from the
// registry, not hand-written" ────────────────────────────────────────────────────────
// This file used to be ENTIRELY hand-written and covered 16 of the resolver's 92 real
// chains (measured 2026-10-22, direct `Object.keys(METRIC_SOURCES).length` — not the
// stale "~35 chains" this header once implied). Below, `CURATED_PROVENANCE` stays
// hand-written where a human wrote exact math/report names worth keeping verbatim
// (speed metrics field-reconciled to the DAR, OSAT/EAP's exact FullScale definitions,
// etc.) — hand-curation is still the right tool when the prose itself is the value.
// Everything METRIC_SOURCES knows about but nobody curated by hand is now synthesized
// by `autoProvenanceFrom()` below, straight from the SAME resolver this whole app reads
// metrics through (`engine/metric-source.js`) — so a metric added there (one line, per
// that file's own standing rule) gets a Metric Lineage entry for free, not as a second
// manual step someone has to remember. Curated entries always win on a key collision.
const CURATED_PROVENANCE = {
  // ── Composed / derived (calculated from other metrics or raw fields) ──────────
  digitalGC:  { label: 'Digital App GC/day', system: 'QSRSoft', report: 'Digital App (mobileApp report)', table: 'digital_app_monthly', composed: true,
    inputs: ['Mobile Order Ahead GC', 'Scanned Offers (×3)', 'Loyalty Self-ID Earn', 'Internal/GMA Delivery GC', 'rest-days'],
    formula: 'Digital App GCs ÷ rest-days, where Digital App = Mobile Order Ahead + Scanned Offers (×3) + Loyalty Self-ID Earn + Internal/GMA Delivery', grain: 'monthly · per store' },
  delivGC:    { label: 'McDelivery 3PO GC/day', system: 'QSRSoft', report: 'McDelivery / Delivery (3PO)', table: 'mcdelivery_monthly', composed: true,
    inputs: ['3PO GC (DoorDash + GrubHub + PostMates + UberEats)', 'rest-days'],
    formula: '3PO GC ÷ rest-days (Combined Vendors: DoorDash / GrubHub / PostMates / UberEats)', grain: 'monthly · per store' },
  oepe:       { label: 'OEPE (Order-to-Exit)', system: 'QSRSoft', report: 'Daily Activity (DAR) — drive-thru', table: 'qsr_daily_activity', composed: true,
    inputs: ['dt_untilserve', 'dt_untilstore', 'dt_heldtime', 'dt_trans_cnt'],
    formula: 'OEPE (sec) = (dt_untilserve − dt_untilstore − dt_heldtime) ÷ dt_trans_cnt ÷ 1000, count-weighted across the day — excludes parked/held time (#183, reconciled r=0.9958 against a real QSRSoft Service report, 2026-08-11). Manual Ops Report / emailed Glimpse win first; DAR fallback is cloud-fresh (current-day)', grain: 'daily · per store' },
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
  eap:        { label: 'EAP (Experienced A Problem %)', system: 'SMG VOICE', report: 'FullScale scorecard', table: 'smg_fullscale', composed: false,
    inputs: ['overall_problem'],
    formula: 'EAP = the FullScale report\'s Overall-section "Experienced a Problem (Yes)" % (dispatch #145) — not the '
      + 'B2B-qualified version epb2b uses', grain: 'monthly · per store' },
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

// ── Auto-generation, straight from METRIC_SOURCES ─────────────────────────────────
// What each ds-field stream IS, for the handful of streams every chain in metric-source.js
// is built from (confirmed against src/app/App.js's loader wiring and src/lib/supabase.js's
// own .from() calls, 2026-10-22 — not guessed from the field name). This is the ONE place
// that mapping lives; a new stream needs one line added here, not one per metric.
const DS_FIELD_META = {
  qsrActSummaryRows: { system: 'QSRSoft', table: 'qsr_daily_activity_rollup', report: 'Daily Activity (DAR)' },
  glimpseRows:       { system: 'QSRSoft', table: 'daily_glimpse_daily', report: 'Daily Glimpse (emailed)' },
  cashRows:          { system: 'QSRSoft', table: 'cash_sheet_daily', report: 'Cash Sheet (emailed)' },
  salesLedgerRows:   { system: 'QSRSoft', table: 'sales_ledger_daily', report: 'Sales Ledger (emailed)' },
  opsCashRows:       { system: 'QSRSoft', table: 'qsr_cash_sheet', report: 'Operations Report — Cash Sheet' },
  opsLaborRows:      { system: 'QSRSoft', table: 'qsr_labor_summary', report: 'Operations Report — Labor Summary' },
  opsServiceRows:    { system: 'QSRSoft', table: 'qsr_service_stats', report: 'Operations Report — Service Stats' },
  opsSalesMixRows:   { system: 'QSRSoft', table: 'qsr_sales_mix', report: 'Operations Report — Sales Mix' },
  qsrFobRows:        { system: 'QSRSoft', table: 'qsr_fob', report: 'FOB / Food Cost' },
  schedRows:         { system: 'LifeLenz', table: 'lifelenz_schedule', report: 'LifeLenz Schedule' },
  laborRows:         { system: 'QSRSoft', table: 'labor_rows', report: 'Labor Report (manual upload)' },
  opsRows:           { system: 'QSRSoft', table: 'ops_rows', report: 'Operations Report (manual upload)' },
  ctrlRows:          { system: 'QSRSoft', table: 'ctrl_rows', report: 'DAR / Controls (manual upload)' },
  auditRows:         { system: 'QSRSoft', table: 'audit_rows', report: 'Register Audit (manual upload)' },
  fobRows:           { system: 'QSRSoft', table: 'fob_rows', report: 'FOB / Food Cost Excel (manual upload)' },
};

// A small set of recurring QSR abbreviations this codebase already uses fluently (DT/OEPE/
// R2P/TPPH/KVS/...) so the auto-generated label reads like the rest of the app instead of
// a literal camelCase split. Deliberately short — this is polish on a mechanical process,
// not a per-metric description, and a key missing from it still gets a readable Title Case
// fallback.
const LABEL_ACRONYMS = {
  dt: 'DT', fc: 'FC', gc: 'GC', fob: 'FOB', oepe: 'OEPE', r2p: 'R2P', tpph: 'TPPH',
  kvs: 'KVS', kvst: 'KVS Time', ot: 'OT', pos: 'POS', mfy: 'MFY', bf: 'Breakfast',
  mop: 'Mobile Order Pickup', deliv: 'Delivery', sched: 'Scheduled', act: 'Actual',
  vs: 'vs', us: '(µs)', num: '', amt: '$', pct: '%', cnt: 'Count', hrs: 'Hours',
  dollar: '$', mgr: 'Manager', mgmt: 'Management', ref: 'Refund', opp: 'Opportunity',
};

// camelCase -> "Title Case", using LABEL_ACRONYMS where a token matches one (case-insensitive).
export function humanizeMetricKey(key) {
  const words = key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .split(/[\s_]+/)
    .filter(Boolean);
  return words
    .map(w => LABEL_ACRONYMS[w.toLowerCase()] ?? (w.charAt(0).toUpperCase() + w.slice(1)))
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const _rawField = (dsField, col) => `${(DS_FIELD_META[dsField] || {}).table || dsField}.${col}`;

// One auto-generated entry per METRIC_SOURCES key, mechanically derived — never hand-typed
// math. A composed (derive:) entry's formula names its inputs rather than inlining the
// derive function's source, since a production build minifies parameter names and a
// transparency panel showing minified code would be worse than no code at all; the exact
// combination logic is one click away in engine/metric-source.js under the same key.
function autoProvenanceFor(key, def) {
  const srcs = def.srcs || [];
  const derive = def.derive || null;
  const primaryMeta = srcs.length ? DS_FIELD_META[srcs[0][0]] : null;

  const inputs = [
    ...srcs.map(([dsField, col]) => _rawField(dsField, col)),
    ...(derive ? derive.inputs.map(k => `${humanizeMetricKey(k)} (${k})`) : []),
  ];

  let formula;
  if (derive && srcs.length) {
    formula = `Auto-first read, in priority order: ${srcs.map(([f, c]) => _rawField(f, c)).join(' → ')}. `
      + `If none of those cover the day, computed from ${derive.inputs.map(humanizeMetricKey).join(', ')} `
      + `(exact combination: engine/metric-source.js, chain "${key}").`;
  } else if (derive) {
    formula = `Computed from ${derive.inputs.map(humanizeMetricKey).join(', ')} `
      + `(exact combination: engine/metric-source.js, chain "${key}").`;
  } else if (srcs.length > 1) {
    formula = `Auto-first read, in priority order: ${srcs.map(([f, c]) => _rawField(f, c)).join(' → ')} `
      + `— first source with a value for the day wins.`;
  } else {
    formula = `Direct read: ${_rawField(srcs[0][0], srcs[0][1])}.`;
  }

  return {
    label: humanizeMetricKey(key),
    system: primaryMeta ? primaryMeta.system : 'Meridian-derived',
    report: primaryMeta ? primaryMeta.report : 'Meridian-derived (computed from other metrics)',
    table: primaryMeta ? primaryMeta.table : '(computed)',
    composed: !!derive,
    inputs: inputs.length ? inputs : [key],
    formula,
    grain: 'daily · per store',
    auto: true, // flags a mechanically-generated entry, vs. hand-curated prose above
  };
}

function buildProvenanceRegistry() {
  const auto = {};
  for (const [key, def] of Object.entries(METRIC_SOURCES)) {
    if (CURATED_PROVENANCE[key]) continue; // curated always wins
    auto[key] = autoProvenanceFor(key, def);
  }
  return { ...auto, ...CURATED_PROVENANCE };
}

export const METRIC_PROVENANCE = buildProvenanceRegistry();

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
