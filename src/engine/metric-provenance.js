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
  // Curated (not auto-generated) so the label is "Labor + FOB %", never the humanizer's
  // mechanical "Prime Cost Pct"/"Prime Cost %" — relabeled 2026-11-13 (owner-reported; not the
  // real industry Prime Cost term here, since fobPct below is waste/variance, not full COGS —
  // see memory/finding-prime-cost-rename-2026-11-13.md). Key name (`primeCostPct`) unchanged.
  primeCostPct: { label: 'Labor + FOB %', system: 'Meridian-derived', report: 'Location Dossier / Top-Bottom Performers', table: '(computed)', composed: true,
    inputs: ['Labor % (laborPct)', 'FOB % (fobPct)'],
    formula: 'Labor + FOB % = Labor % + FOB % — a sum of two already-resolved ratios, not its own numerator/denominator pair, so it rolls up as a mean of daily values (metricAvg), never a Σ/Σ ratio', grain: 'daily · per store' },
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
  visitReadiness: { label: 'Visit Readiness (PACE composite)', system: 'Meridian-derived', report: 'Visit Readiness', table: '(computed)', composed: true,
    inputs: ['Speed sub-score (35%)', 'Accuracy sub-score (30%)', 'Quality sub-score (20%)', 'Leadership sub-score (15%)'],
    formula: 'Visit Readiness % = Speed×0.35 + Accuracy×0.30 + Quality×0.20 + Leadership×0.15 (engine/visit-readiness.js READINESS_WEIGHTS), renormalized over whichever sub-scores have real data for that store. Each sub-score is itself the store\'s own metrics graded against its own DEFAULT_TARGETS, not a fixed scale. Food-safety flag (EcoSure when current, waste/variance proxy as fallback) is tracked independently and deliberately excluded from this composite', grain: 'current · per store' },
  // The 4 sub-scores feeding visitReadiness above (task #152, 2026-11-14) — each printed on
  // the Visit Readiness panel on its own, so each needs its own entry, not just the composite.
  // Every metric below is scored 0-1 via scoreMetric() (engine/visit-readiness.js): 1 = at/better
  // than target, falling linearly to 0 over a per-metric tolerance band (% of target, or an
  // absolute tolerance for schedGap), then subScore() takes the plain mean of whichever of a
  // sub-score's metrics actually resolved for that store that day/month (never silently assumes
  // full coverage — the panel's own 'missing' list under each sub-score names anything left out
  // and why). The exact metric list, targets and bands live in SPEED/ACCURACY/QUALITY/LEADERSHIP
  // in that file — summarized here, not duplicated field-by-field, since the live panel already
  // shows each metric's own actual/target/score ('drivers').
  visitReadinessSpeed: { label: 'Visit Readiness — Speed sub-score', system: 'Meridian-derived', report: 'Visit Readiness', table: '(computed)', composed: true,
    inputs: ['OEPE (DT total) vs tOepe', 'KVS time vs tKvst', 'DT park rate vs tPark', 'R2P (front counter) vs tR2p'],
    formula: 'Mean of each metric\'s 0-1 target-grade (engine/visit-readiness.js scoreMetric/subScore, SPEED spec list) × 100, over whichever of the 4 resolved for this store', grain: 'current · per store' },
  visitReadinessAccuracy: { label: 'Visit Readiness — Accuracy sub-score', system: 'Meridian-derived', report: 'Visit Readiness', table: '(computed)', composed: true,
    inputs: ['SMG accuracy (B2B) % vs 95% standard (monthly, manual SMG FullScale upload)', 'SMG problem % vs 10% standard (monthly, manual)', 'T-Red after total % vs tRedAPct'],
    formula: 'Mean of each metric\'s 0-1 target-grade × 100 (ACCURACY spec list) — the first two are genuinely manual-only (no SMG FullScale API exists), so this sub-score is only as fresh as the last monthly upload', grain: 'current · per store' },
  visitReadinessQuality: { label: 'Visit Readiness — Quality sub-score', system: 'Meridian-derived', report: 'Visit Readiness', table: '(computed)', composed: true,
    inputs: ['Comp waste % vs tCompWaste (monthly)', 'Raw waste % vs tRawWaste (monthly)', 'SMG OSAT (B2B) % vs 90% standard (monthly, manual)'],
    formula: 'Mean of each metric\'s 0-1 target-grade × 100 (QUALITY spec list) — a waste/holding-discipline + guest-satisfaction proxy, NOT a food-safety score (see the composite\'s own note: cook-temp/pest criticals are a separate, deliberately-excluded gap)', grain: 'current · per store' },
  visitReadinessLeadership: { label: 'Visit Readiness — Leadership sub-score', system: 'Meridian-derived', report: 'Visit Readiness', table: '(computed)', composed: true,
    inputs: ['TPPH vs tTpph', 'Labor % of sales vs tCrewLabor', 'Schedule gap vs ideal (LifeLenz schVsIdealDiff) vs 0, ±8hr tolerance'],
    formula: 'Mean of each metric\'s 0-1 target-grade × 100 (LEADERSHIP spec list) — schedGap reads LifeLenz\'s own auto-synced schedule-vs-ideal diff directly, the other two reuse this app\'s existing TPPH/Labor % chains', grain: 'current · per store' },

  // GM Daily Review (task #152, 2026-11-14) — the review's own two lines that compose MULTIPLE
  // already-resolved metric-source.js values into one displayed number (sumMs in
  // engine/daily-review.js's buildLine()), rather than naming a single metric-source key the
  // way every other line on that panel does (those already get a Metric Lineage entry for free
  // via METRIC_SOURCES/autoProvenanceFor — only these two composed lines need a hand entry).
  dailyReviewRefundAmt: { label: 'Daily Review — Refund $', system: 'Meridian-derived', report: 'GM Daily Review', table: '(computed)', composed: true,
    inputs: ['Cash refund $ (cashRefAmt)', 'Cashless refund $ (cashlessRefAmt)'],
    formula: 'Refund $ = cashRefAmt + cashlessRefAmt (engine/daily-review.js buildLine(), sumMs) — the panel\'s own single combined-dollar line; metric-source.js has no single key for this, only the two separate legs', grain: 'daily · per store' },
  dailyReviewEmplMgrMeal: { label: 'Daily Review — Empl/Mgr Meal $', system: 'Meridian-derived', report: 'GM Daily Review', table: '(computed)', composed: true,
    inputs: ['Employee meal $ (empMealAmt)', 'Manager meal $ (mgrMealAmt)'],
    formula: 'Empl/Mgr Meal $ = empMealAmt + mgrMealAmt (engine/daily-review.js buildLine(), sumMs) — same single-combined-line reasoning as Refund $ above', grain: 'daily · per store' },

  // ── Direct reads (a single source field / count — shown for completeness) ─────
  headcount:  { label: 'Active Headcount', system: 'QSRSoft', report: 'Roster Statistics', table: 'roster_statistics', composed: false,
    inputs: ['Roster Active count'],
    formula: 'Roster Active — all active hourly (crew + shift + GM&DM active)', grain: 'monthly · per store' },
  opSupplies: { label: 'Operating Supplies $', system: 'QSRSoft', report: 'eBOS Purchases', table: 'qsr_ebos_daily', composed: false,
    inputs: ['operating-supplies purchase lines'],
    formula: 'Σ operating-supplies purchases $', grain: 'daily · per store' },

  // ── signal-registry.js metrics with no METRIC_SOURCES chain (task #152, 2026-11-14) ──────
  // engine/signal-registry.js's METRIC_CATEGORIES feeds the Signals panel's Scanner/Signal Lab.
  // Most of its ~90 metric keys already have a real METRIC_SOURCES chain (bridged via that
  // file's own AUTO_FIRST_KEY_MAP, confirmed by reading it directly) and so already get a
  // Metric Lineage entry for free via autoProvenanceFor() — no action needed on those. The 4
  // FOB sub-items + 11 SMG/VOICE metrics below are the real, confirmed exception: signal-
  // registry.js's own header comment (AUTO_FIRST_KEY_MAP, "Keys NOT listed here... have NO
  // matching METRIC_SOURCES chain today") already named the FOB four; grep confirmed zero hits
  // for any of the 11 SMG/VOICE field names in metric-source.js, so that gap was real but
  // previously unstated.
  //
  // FOB sub-items — direct pass-through of the uploaded Monthly Projections/FOB report's own
  // columns (src/parsers/index.js), same table/report tier as every other fobRows field above
  // (foodOB). No in-app formula exists because none is computed — the vendor report's own % is
  // used as-is.
  baseFoodPct: { label: 'Base Food %', system: 'QSRSoft', report: 'Monthly Projections / FOB', table: 'qsr_fob', composed: false,
    inputs: ['Base Food % column'], formula: 'Direct from the uploaded Monthly Projections/FOB report\'s own "Base Food %" column', grain: 'monthly · per store' },
  discCoupon:  { label: 'Disc Coupon %', system: 'QSRSoft', report: 'Monthly Projections / FOB', table: 'qsr_fob', composed: false,
    inputs: ['Disc Coupon % column'], formula: 'Direct from the uploaded Monthly Projections/FOB report\'s own "Disc Coupon %" column', grain: 'monthly · per store' },
  pLFoodPct:   { label: 'P&L Food Cost %', system: 'QSRSoft', report: 'Monthly Projections / FOB', table: 'qsr_fob', composed: false,
    inputs: ['P&L Food Cost % column'], formula: 'Direct from the uploaded Monthly Projections/FOB report\'s own "P&L Food Cost %" column — the vendor\'s own food-cost %, not Meridian\'s primeCostPct/fobPct', grain: 'monthly · per store' },
  pLPaperPct:  { label: 'P&L Paper Cost %', system: 'QSRSoft', report: 'Monthly Projections / FOB', table: 'qsr_fob', composed: false,
    inputs: ['P&L Paper Cost % column'], formula: 'Direct from the uploaded Monthly Projections/FOB report\'s own "P&L Paper Cost %" column', grain: 'monthly · per store' },

  // SMG FullScale scorecard — same table/report tier as osat/eap above. osat5/osatB2B/
  // accuracyB2B/dtProblem/overallProblem are each a single parsed column (src/parsers/index.js);
  // osatTop2 is the one composed exception (5★ + 4★).
  osat5:          { label: 'OSAT 5★ %', system: 'SMG VOICE', report: 'FullScale scorecard', table: 'smg_fullscale', composed: false,
    inputs: ['5★ responses % column'], formula: 'Direct from the FullScale report\'s 5★ response %', grain: 'monthly · per store' },
  osatTop2:       { label: 'OSAT Top-2 Box %', system: 'SMG VOICE', report: 'FullScale scorecard', table: 'smg_fullscale', composed: true,
    inputs: ['5★ %', '4★ %'], formula: 'OSAT Top-2 Box % = 5★ % + 4★ %', grain: 'monthly · per store' },
  osatB2B:        { label: 'B2B % (No Problem)', system: 'SMG VOICE', report: 'FullScale scorecard', table: 'smg_fullscale', composed: false,
    inputs: ['"no problem" B2B % column'], formula: 'Direct from the FullScale report\'s Overall-section B2B (no-problem) %', grain: 'monthly · per store' },
  accuracyB2B:    { label: 'Accuracy B2B %', system: 'SMG VOICE', report: 'FullScale scorecard', table: 'smg_fullscale', composed: false,
    inputs: ['order-accuracy B2B % column'], formula: 'Direct from the FullScale report\'s order-accuracy-section B2B (no-problem) %', grain: 'monthly · per store' },
  dtProblem:      { label: 'DT Problem %', system: 'SMG VOICE', report: 'FullScale scorecard', table: 'smg_fullscale', composed: false,
    inputs: ['DT problem % column'], formula: 'Direct from the FullScale report\'s drive-thru-section problem %', grain: 'monthly · per store' },
  overallProblem: { label: 'Overall Problem %', system: 'SMG VOICE', report: 'FullScale scorecard', table: 'smg_fullscale', composed: false,
    inputs: ['overall problem % column'], formula: 'Direct from the FullScale report\'s Overall-section problem % (the complement EAP uses for its own 1 − value)', grain: 'monthly · per store' },

  // VOICE Performance report (src/lib/supabase.js's smgVoicePerf, src/parsers/index.js's VOICE
  // parser) — a separate monthly upload from the FullScale scorecard above, richer per-channel
  // satisfaction splits the FullScale export doesn't carry. All 5 are direct parsed columns.
  vpDtSat:      { label: 'DT Satisfaction % (VOICE)', system: 'SMG VOICE', report: 'VOICE Performance', table: 'smg_voice_performance', composed: false,
    inputs: ['Drive Thru Overall Satisfaction column'], formula: 'Direct from the VOICE Performance report\'s "Drive Thru Overall Satisfaction" column', grain: 'monthly · per store' },
  vpIrSat:      { label: 'In-Restaurant Sat % (VOICE)', system: 'SMG VOICE', report: 'VOICE Performance', table: 'smg_voice_performance', composed: false,
    inputs: ['In Restaurant Satisfaction column'], formula: 'Direct from the VOICE Performance report\'s "In Restaurant Satisfaction" column', grain: 'monthly · per store' },
  vpQualityB2B: { label: 'Overall Quality B2B % (VOICE)', system: 'SMG VOICE', report: 'VOICE Performance', table: 'smg_voice_performance', composed: false,
    inputs: ['Overall Quality B2B column'], formula: 'Direct from the VOICE Performance report\'s "Overall Quality B2B" column', grain: 'monthly · per store' },
  vpFriesB2B:   { label: 'Fries Quality B2B % (VOICE)', system: 'SMG VOICE', report: 'VOICE Performance', table: 'smg_voice_performance', composed: false,
    inputs: ['Fries Quality B2B column'], formula: 'Direct from the VOICE Performance report\'s "Fries Quality B2B" column', grain: 'monthly · per store' },
  vpSnackB2B:   { label: 'Snack Wrap B2B % (VOICE)', system: 'SMG VOICE', report: 'VOICE Performance', table: 'smg_voice_performance', composed: false,
    inputs: ['Snack Wrap Quality B2B column'], formula: 'Direct from the VOICE Performance report\'s "Snack Wrap Quality B2B" column', grain: 'monthly · per store' },

  // Schedule Discipline (LifeLenz Data Explorer "Schedule Variance") and Compliance Audit
  // (LifeLenz Data Explorer "Compliance Audit") — both real engines (schedule-discipline.js,
  // compliance-audit.js), each with its own header explaining the "why" in full; summarized
  // here rather than restated. schedGap is the one pass-through field (pre-computed upstream by
  // the LifeLenz pull itself, per engine/insights.js's own comment confirming the formula).
  schedGap:                { label: 'Schedule Gap vs Ideal (hrs)', system: 'LifeLenz', report: 'Schedule vs Ideal', table: 'lifelenz_schedule', composed: true,
    inputs: ['Scheduled crew hours (crewHrs)', 'Ideal total hours (idealTotHrs)'],
    formula: 'Schedule Gap (hrs) = crewHrs − idealTotHrs (engine/insights.js). Negative = under-scheduled vs the ideal; computed upstream in the schedRows pipeline, read here as-is', grain: 'daily · per store' },
  scheduleEditCount:       { label: 'Schedule Edits (post-publish)', system: 'LifeLenz', report: 'Data Explorer — Schedule Variance', table: 'lifelenz_schedule_variance', composed: true,
    inputs: ['count of post-publish schedule-edit events'],
    formula: 'Schedule Edits = count of edit events made to an already-published schedule for that (store, date) (engine/schedule-discipline.js dailyScheduleVariance)', grain: 'daily · per store' },
  scheduleCostVariance:    { label: 'Schedule Edit Cost Impact ($)', system: 'LifeLenz', report: 'Data Explorer — Schedule Variance', table: 'lifelenz_schedule_variance', composed: true,
    inputs: ['Σ costVariance per edit event'],
    formula: 'Schedule Edit Cost Impact ($) = Σ costVariance across every post-publish edit event for that (store, date) — positive means edits kept ADDING cost after publish (engine/schedule-discipline.js dailyScheduleVariance)', grain: 'daily · per store' },
  complianceViolationCount:{ label: 'Compliance Violations', system: 'LifeLenz', report: 'Data Explorer — Compliance Audit', table: 'lifelenz_compliance_audit', composed: true,
    inputs: ['count of labor-compliance violation events'],
    formula: 'Compliance Violations = count of violation events (meal/rest-break, minor-labor-law, etc.) for that (store, date) (engine/compliance-audit.js)', grain: 'daily · per store' },
  complianceCostPenalty:   { label: 'Compliance Cost Penalty ($)', system: 'LifeLenz', report: 'Data Explorer — Compliance Audit', table: 'lifelenz_compliance_audit', composed: true,
    inputs: ['Σ costPenalty per violation event'],
    formula: 'Compliance Cost Penalty ($) = Σ costPenalty across every violation event for that (store, date) (engine/compliance-audit.js)', grain: 'daily · per store' },

  // ── Forecast models — Model Assignment / Forecast Accuracy's 5 model columns (task #152,
  // 2026-11-14, the single highest-value item this task deliberately deferred twice already —
  // see memory/plan-metric-reconciliation-2026-11-14.md's "Still deferred from pass 1"). Traced
  // directly from engine/forecast.js's forecastDay()/forecastSimple()/forecastAdaptiveEnsemble()/
  // forecastEWMA() branches, cross-checked against this file's own existing owner-facing KB
  // articles (model_types/forecast_formula/adaptive_ensemble/ewma_model/adaptive_di/
  // dialed_in_calibration, same file, ~line 1314+) so the two surfaces agree rather than
  // independently re-deriving the same math and risking drift. DOW and DI share the literal same
  // "Core Forecast Formula" code path — DI differs only in WHICH parameter values it plugs in
  // (store-calibrated vs district-default), not in the formula shape; AE and EWMA are genuinely
  // different formulas that never touch that path at all. Simple is covered too even though it
  // predates and sits outside the KB's own "four model codes" framing (model_types's KB article
  // still says "Four codes exist" — DOW/DI/AE/EWMA — which is now stale; Simple shipped later,
  // v4.532, and was never added there. Not fixed here: that's a KB-content gap, out of this
  // task's scope, flagged for whoever next touches that article).
  forecastModelDow: { label: 'DOW Trend (Forecast Model)', system: 'Meridian-derived', report: 'Model Assignment / Forecast Accuracy', table: '(computed)', composed: true,
    inputs: ['LY same-day sales (lyRaw — ~364-day lookback with DOW-matched fallbacks, or the Ramp Model for a store <365 days old)',
      'District-DOW-average blend (lyAdj, via lyW — defaults to 1.0 = pure store LY, no blend)',
      'Holiday correction (holidayLyAdj)', 'YOY trend: t2/t4/t6 (weeks 1–2/3–4/5–6) at default weights .50/.30/.20, blended 65% global + 35% DOW-specific',
      'Ops factor (OEPE/TPPH/KVS-time/park-rate/staffing-vs-need vs target, calcOpsF)', 'Weather adjustment (wAdj)', 'Tagged event factor', 'Plus-up %'],
    formula: 'forecast = lyAdjH × opsFactor × (1+wAdj) × (1+trendFactor) × (1+eventFactor) × (1+plusUp) — the "Core Forecast Formula" (engine/forecast.js forecastDay, default/fallthrough branch; full step-by-step in this file\'s own forecast_formula KB article). DOW is this formula run with the DISTRICT DEFAULT parameters — trend weights t2/t4/t6=.50/.30/.20, opsMult=1.0, lyW=1.0 — no per-store calibration. It is the same code path DI uses below, just with uncalibrated defaults; the default/starting assignment before a store has been Dialed-In', grain: 'daily · per store' },
  forecastModelDi: { label: 'Dialed-In (Forecast Model)', system: 'Meridian-derived', report: 'Model Assignment / Forecast Accuracy', table: '(computed)', composed: true,
    inputs: ['Same Core Forecast Formula inputs as DOW above',
      'Per-store calibrated {lyW, t2, t4, t6, opsMult} (settings.dialedIn[loc]) — found by a grid search over ~21,500 combinations minimizing MAPE against the store\'s trailing 42 real days, evaluated through this same formula'],
    formula: 'Identical Core Forecast Formula to DOW (forecast = lyAdjH × opsFactor × (1+wAdj) × (1+trendFactor) × (1+eventFactor) × (1+plusUp), engine/forecast.js forecastDay) — DI differs only in WHICH values feed lyW/t2/t4/t6/opsMult: this store\'s own Dialed-In-calibrated values (settings.dialedIn[loc]) instead of the district defaults DOW uses. Falls back to the DOW defaults when the store has no calibration on file or is explicitly skipped (DI Skip toggle)', grain: 'daily · per store' },
  forecastModelAe: { label: 'Adaptive Ensemble (Forecast Model)', system: 'Meridian-derived', report: 'Model Assignment / Forecast Accuracy', table: '(computed)', composed: true,
    inputs: ['Signal 1 — EWMA-DOW (α=.22 weekday / .30 weekend)',
      'Signal 2 — LY Adjusted (prior-year same date, ±3-day DOW-matched fallback, ±20%-clamped recent-90d-vs-LY-90d adjustment)',
      'Signal 3 — Short-term Momentum (recent 2wk vs prior 2wk same-DOW, clamped .85–1.15×)',
      'Signal 4 — Monthly Seasonality (this-month vs all-time same-DOW average, min 4 data points, clamped .80–1.20×)',
      'Signal 5 — Adaptive DI (per-store-calibrated 14d/28d/42d EWMA blend — a DIFFERENT thing from DI model mode, see below)'],
    formula: 'Weighted blend of the 5 signals above, ÷ the sum of whichever signals actually resolved for that store/day (renormalizes when a signal lacks data) — does NOT use the Core Forecast Formula at all (engine/forecast.js forecastAdaptiveEnsemble). Blend weights differ Oklahoma vs the 6 named Florida interstate stores (6178/6838/10034/35242/37566/38609, which lean harder on Signal 2/LY for annual highway-traffic seasonality) and weekday vs weekend — exact weight tables in this file\'s own Adaptive Ensemble KB article. District-validated 9.29% MAPE vs LifeLenz\'s own 9.51% (daily-level backtest, same evaluation window)', grain: 'daily · per store' },
  forecastModelEwma: { label: 'EWMA (Forecast Model)', system: 'Meridian-derived', report: 'Model Assignment / Forecast Accuracy', table: '(computed)', composed: true,
    inputs: ['Up to 14 most-recent same-day-of-week actual sales values (S_i)'],
    formula: 'forecast = Σ(α × (1−α)^i × S_i) ÷ Σ(α × (1−α)^i) over the up-to-14 most-recent same-DOW actuals (i=0 is the most recent, weighted highest); α=0.25 as a standalone model (engine/forecast.js forecastEWMA — the identical function also backs AE\'s Signal 1 at a different α). No LY, no trend, no ops factor — ignores the prior year and operational metrics entirely, which is why it\'s used for stores in active operational change (new GM, remodel, relocation ramp) where the historical/LY anchor can\'t be trusted. Requires ≥3 same-DOW data points or returns null (no forecast)', grain: 'daily · per store' },
  forecastModelSimple: { label: 'Simple — T3M/T6W/T3W (Forecast Model)', system: 'Meridian-derived', report: 'Model Assignment / Forecast Accuracy', table: '(computed)', composed: true,
    inputs: ['Trailing daily sales rate — anomaly-excluded mean over trailing 90/42/21-day windows, recency-weighted .2/.3/.5 (weightedRecencyProjection, reused verbatim from smart-targets.js)',
      'Same-day-of-week shape multiplier — robustBaseline(same-DOW days)÷robustBaseline(all days) over the trailing 90 days, clamped .5–1.8×', 'Holiday multiplier (isHoliday-gated)'],
    formula: 'forecast = trailing daily rate × same-DOW shape × holiday multiplier (engine/forecast.js forecastSimple/_dowShape). Strictly leak-free — anchors to the START of the forecast day, so trailing windows can never see the target day or anything after it. Requires ≥14 days of real trailing history or falls through to the DOW model (modelUsed then reports "dow", not "simple"). This is the day-level propagation of the T3M/T6W/T3W trailing family that won the original 27-store MONTHLY-TOTAL Smart Targets backtest (v4.483, ~5% MAPE vs 8–14% for the engineered models) — a full month of these sums back to (trailing rate × days), the exact method that won, while any single day still respects its own weekday. A LATER head-to-head specifically on 28-day period TOTALS (the Period-Total Scoreboard) found Adaptive Ensemble actually beats Simple there (AE 2.7% median vs Simple 4.5%) — Simple\'s original monthly-total win and its showing on this later, stricter re-validation are two different, already-reconciled findings (memory/simple-models-propagation.md), not a contradiction; this entry documents what the model computes, not a verdict on which model is "best"', grain: 'daily · per store' },
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
