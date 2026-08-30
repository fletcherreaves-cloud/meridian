#!/usr/bin/env node
// scripts/security-rules-run.mjs
// Dispatch #39 (memory/dispatch-39.md) — the Phase 1 scheduled batch job: evaluates every
// ACTIVE security_rules row (dispatch #36's registry) against a rolling audit_rows window,
// computes the relevant baseline context (dispatch #36's security-baselines.js, unmodified),
// and upserts one security_findings row per (rule, employee, window) — dispatch #39's own new
// output table, subject-keyed on emp_token, never a plaintext name (Direction B, dispatch #37).
//
// Dispatch #40 (memory/dispatch-40.md) extends this SAME loop with a second rule-type branch --
// INV-001/INV-002, sourced from qsr_variance_stat (store x month x item grain) instead of
// audit_rows, subject-keyed on wrin instead of emp_token. Not a second script: one active-rules
// loop, one output table, branching on which DATA_REQUIRED a rule names.
//
// Dispatch #42 (memory/dispatch-42.md) makes both branches baseline-relative: each call site now
// computes the baseline BEFORE calling evaluateRule() and passes it in, so a z-score rule (new
// LOGIC_TYPE, src/engine/security-rules.js) can compare a subject's rate against its peer/store
// population instead of a fixed constant. Also widens the exposure floor (a rule's own
// logic_expression.min_denominator) from an INV-001 special case to every denominator-bearing
// rule -- see schema-security-rules-phase1c.sql / -phase1d.sql.
//
// This is a COMPUTE job, not a pull -- audit_rows/qsr_variance_stat/qsr_fob are already in
// Supabase (their own pull jobs), this reads them back and scores them. Scaffolding (service-role
// client, GitHub Actions workflow, sync-failure-watch.yml entry) matches the *-pull.mjs family per
// CLAUDE.md's standing "new automated pull" checklist, but the compute loop itself is new --
// not modeled on any existing pull script's per-row mapping shape.
//
// Does NOT modify src/engine/security-baselines.js -- correct since dispatch #36, reused here
// exactly as-is for both rule-type branches.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Run AFTER supabase/schema-security-rules-phase1.sql, schema-security-rules-phase1b.sql, and
// schema-security-findings.sql have been applied, and after that day's qsrsoft-register-audit-
// pull.yml / qsrsoft-variance-pull.yml / qsrsoft-pull.yml (qsr_fob) runs (this job's inputs).

import { safeCreateClient } from './lib/safe-supabase-client.mjs';
import { evaluateRule } from '../src/engine/security-rules.js';
import { personalBaseline, peerBaseline, storeBaseline, networkBaseline } from '../src/engine/security-baselines.js';
import { daypartOf } from '../src/engine/labor-standard.js';

const TENANT = '00000000-0000-0000-0000-000000000001';
const DEFAULT_WINDOW_DAYS = 28;

// Guarded, not unconditional -- matching every other pull/compute script in this repo (dispatch
// #33's original note, repeated at #35/#37/#38): an unconditional createClient() at module scope
// would crash the pure functions' own unit tests, which have no env vars set.
const supabase = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? safeCreateClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
  : null;

const fmtDate = d => d.toISOString().slice(0, 10);
const addDay  = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };

// dispatch #39's own field-mapping table, re-derived here rather than importing
// src/lib/supabase.js's loadAuditRows() -- that loader is browser-oriented (import.meta.env),
// the same reason every scripts/*.mjs file in this repo maintains its own snake_case->camelCase
// mapping instead of cross-importing it (dispatch #35's qsrsoft-register-audit-pull.mjs note).
export function mapAuditRow(r) {
  return {
    loc: r.loc, date: r.date, emp: r.emp, empToken: r.emp_token,
    drawerSales: r.drawer_sales, drawerGC: r.drawer_gc,
    cashOSDollar: r.cash_os_dollar,
    posOverCnt: r.pos_over_cnt, posOverAmt: r.pos_over_amt,
    manualRefAmt: r.manual_ref_amt, manualRefCnt: r.manual_ref_cnt,
    refundCash: r.refund_cash, refundCashless: r.refund_cashless, refundCnt: r.refund_cnt,
    promoAmt: r.promo_amt,
    tRedACnt: r.t_red_a_cnt, tRedADollar: r.t_red_a_dollar,
    tRedBCnt: r.t_red_b_cnt, tRedBDollar: r.t_red_b_dollar,
  };
}

export function dataRequiredList(rule) {
  return Array.isArray(rule.data_required) ? rule.data_required
    : (typeof rule.data_required === 'string' ? JSON.parse(rule.data_required) : []);
}

// A rule naming a DATA_REQUIRED this job doesn't know how to source is skipped with a warning,
// not crashed on, so a rule can be registered ahead of this job supporting its source without
// breaking the run.
export function supportsAuditRows(rule) {
  return dataRequiredList(rule).includes('audit_rows');
}

// Dispatch #40 -- INV-001/INV-002, store x item subject (no emp/empToken on this table at all).
export function supportsVarianceStat(rule) {
  return dataRequiredList(rule).includes('qsr_variance_stat');
}

// Dispatch #48/#50 lineage -- INV-004, the third subject grain (manager x day-part x store).
// Requires BOTH qsr_waste (the numerator) and qsr_daily_activity (the day-part sales denominator)
// -- neither alone is enough, so this checks for the pair, not either name individually.
export function supportsWasteDaypart(rule) {
  const req = dataRequiredList(rule);
  return req.includes('qsr_waste') && req.includes('qsr_daily_activity');
}

// Extracts {numField, denField, scale, abs} from a rule's logic_expression -- a thin read, not a
// re-implementation of security-rules.js's own evaluation (evaluateRule still does the actual
// pass/fail math); this only tells the baseline functions which columns to look at.
export function fieldsFromExpr(rule) {
  const expr = typeof rule.logic_expression === 'string' ? JSON.parse(rule.logic_expression) : rule.logic_expression;
  // z-score (dispatch #42) uses the SAME numerator/denominator shape as ratio -- evaluateZScoreRule
  // reuses evalRatio() for the raw rate, so the baseline needs to read the same field names. Only
  // threshold's flat {field, denominator:{field}} shape is different.
  if (rule.logic_type === 'ratio' || rule.logic_type === 'z-score') {
    return { numField: expr.numerator.field, denField: expr.denominator.field, scale: expr.scale || 1, abs: !!expr.numerator.abs };
  }
  return { numField: expr.field, denField: expr.denominator?.field, scale: expr.scale || 1, abs: false };
}

// plan §4's additive-breakdown shape, sliced to what a SINGLE rule's finding can honestly say --
// composite multi-rule scoring (the full worked example) is Phase 2, not this dispatch. Always
// an array (not a bare object) so a future composite-scoring consumer can concatenate several
// rules' explanation arrays into one breakdown without reshaping each entry.
export function buildExplanation(rule, evalResult, baseline) {
  if (evalResult.value == null) {
    return [{ rule_id: rule.rule_id, label: `${rule.method}: ${evalResult.reason || 'no exposure in window'}`, value: null, contribution: 0 }];
  }
  // z-score rules (dispatch #42) already computed and honest-null-gated a zscore inside
  // evaluateRule() -- prefer THAT over recomputing here, since a fresh (value-mean)/stdev would
  // ignore evaluateZScoreRule's own MIN_BASELINE_N / zero-stdev / no-baseline checks and could
  // show a number the actual verdict discarded as undetermined. threshold/ratio rules never carry
  // `.zscore`, so this falls back to the original ad-hoc computation for them unchanged.
  const zscore = 'zscore' in evalResult ? evalResult.zscore : ((baseline && baseline.stdev) ? (evalResult.value - baseline.mean) / baseline.stdev : null);
  const zLabel = zscore != null && Number.isFinite(zscore) ? ` (${zscore >= 0 ? '+' : ''}${zscore.toFixed(1)}σ vs ${rule.baseline_type} baseline)` : '';
  const verdict = evalResult.pass === true ? 'flagged' : evalResult.pass === false ? 'clear' : `undetermined (${evalResult.reason || 'no threshold configured'})`;
  return [{
    rule_id: rule.rule_id,
    label: `${rule.method}: ${evalResult.value.toFixed(2)} vs threshold ${evalResult.threshold}${zLabel} — ${verdict}`,
    value: evalResult.value,
    threshold: evalResult.threshold,
    baseline_type: rule.baseline_type,
    baseline_mean: baseline?.mean ?? null,
    baseline_stdev: baseline?.stdev ?? null,
    baseline_n: baseline?.n ?? null,
    zscore,
    severity: rule.severity,
    weight: rule.weight,
    contribution: evalResult.pass ? Number(rule.weight ?? 1) : 0,
  }];
}

// The core per-rule compute loop -- pure, no Supabase dependency, unit-testable against fixture
// rows exactly like register-audit-pull.mjs's mapRow(). `rows` is every mapped audit_rows row in
// the rule's window, across all stores -- baseline functions need the FULL window (peer/store/
// network populations reach beyond one subject), evaluateRule() only ever sees one subject's own
// rows via the per-pair filter below.
export function computeFindingsForRule(rule, rows, { windowStart, windowEnd }) {
  const { numField, denField, scale, abs } = fieldsFromExpr(rule);

  // Distinct (loc, empToken) pairs actually present in the window -- a row with no token yet
  // (pre-backfill) cannot produce an attributable finding, so it's excluded here, not silently
  // scored against an empty subject.
  const pairs = new Map();
  for (const r of rows) {
    if (!r.empToken || !r.loc) continue;
    const key = r.loc + '::' + r.empToken;
    if (!pairs.has(key)) pairs.set(key, { loc: r.loc, empToken: r.empToken, emp: r.emp });
  }

  const findings = [];
  for (const { loc, empToken, emp } of pairs.values()) {
    const subjectRows = rows.filter(r => r.loc === loc && r.empToken === empToken);

    // Baseline computed BEFORE evaluateRule() -- dispatch #42's reordering. Before z-score, the
    // baseline was only context attached to an already-final verdict; for a z-score rule it's an
    // INPUT the verdict itself depends on, so it has to exist first. threshold/ratio rules ignore
    // the extra argument entirely (evaluateRule() only reads `baseline` on the z-score branch).
    const baselineOpts = { emp, loc, numField, denField, scale, abs, start: windowStart, end: windowEnd };
    let baseline = null;
    if (rule.baseline_type === 'personal') baseline = personalBaseline(rows, baselineOpts);
    else if (rule.baseline_type === 'peer') baseline = peerBaseline(rows, baselineOpts);
    else if (rule.baseline_type === 'store') baseline = storeBaseline(rows, baselineOpts);
    else if (rule.baseline_type === 'network') baseline = networkBaseline(rows, baselineOpts);

    const evalResult = evaluateRule(rule, { audit_rows: subjectRows }, { loc, baseline });

    findings.push({
      empToken, loc, ruleId: rule.rule_id, windowStart, windowEnd,
      value: evalResult.value, thresholdUsed: evalResult.threshold, pass: evalResult.pass,
      baselineContext: baseline || {}, explanation: buildExplanation(rule, evalResult, baseline),
    });
  }
  return findings;
}

// dispatch #40's own field-mapping table for qsr_variance_stat -- store x month x item grain,
// PK (loc, period, wrin). `date: r.period` is the dispatch's own explicit suggestion (header
// "One small, real row-shaping step"): security-baselines.js's inWindow() does a plain string
// comparison against r.date, so mapping period ('YYYY-MM') straight onto date -- and passing
// windowStart/windowEnd as 'YYYY-MM' bounds too, not full dates -- keeps that comparison correct
// at month granularity with zero security-baselines.js changes. Appending '-01' here instead
// would silently break it: a same-length-prefix string ('2026-08') compares LESS than a longer
// one that starts with it ('2026-08-01'), so an end bound of '2026-08' would wrongly exclude the
// current month's own row.
// dispatch #46 (engineer queue, waste-log padding / phantom gains) -- two derived fields, computed
// once here so every consumer (the batch job, tests, a future panel) reads the SAME derivation.
// QSRSoft's own sign convention (measured live, 2026-08-20, exact across every sampled row):
// `variance = exp_usage - act_usage` -- POSITIVE means actual usage came in BELOW theoretical
// (less consumed than the recipe predicts, i.e. ending inventory reads HIGHER than expected, the
// "gain" direction phantom-gains targets); NEGATIVE means actual usage exceeded theoretical (the
// shrink/shortage direction INV-001 already covers without distinguishing).
//   unexplainedVariance = the portion of |variance| NOT covered by logged waste, floored at 0 --
//     plan's own "strongest single signal": an unexplained variance with zero waste logged for it.
//     Same units as `variance`/`rawWaste`/`compWaste` (both waste columns are unit-based, adjacent
//     to exp_usage/act_usage in the schema, not to dol_diff -- confirmed by computeWasteExoneration
//     already summing them directly against |variance| with no unit conversion).
//   positiveVariance = max(0, variance) -- the gain direction alone, zero for every shrink-side
//     subject (the majority, ~70.7% measured live) so a rule built on it flags ONLY genuine
//     unexplained gains, never conflating them with ordinary shrinkage.
export function mapVarianceStatRow(r) {
  const variance = r.variance;
  const rawWaste = r.raw_waste, compWaste = r.comp_waste;
  const absVariance = variance == null ? null : Math.abs(variance);
  const waste = (Number(rawWaste) || 0) + (Number(compWaste) || 0);
  return {
    loc: r.loc, period: r.period, date: r.period, wrin: r.wrin, cls: r.cls, descr: r.descr,
    rawWaste, compWaste, expUsage: r.exp_usage, actUsage: r.act_usage,
    variance, dolDiff: r.dol_diff,
    unexplainedVariance: absVariance == null ? null : Math.max(0, absVariance - waste),
    positiveVariance: variance == null ? null : Math.max(0, variance),
  };
}

// INV-002's denominator path (dispatch #40 §"Denominator needs a decision, not a guess") --
// pct_sales' real semantics are unconfirmed from this sandbox (no comment/test/prior probe
// settles what QSRSoft's `percentage` field measures), so this uses the real cross-table join
// instead: qsr_fob's daily prod_sales_amt, summed per (loc, month), attached to every
// qsr_variance_stat row for that same (loc, period) as `storeMonthSales`. security-rules.js
// itself needs zero changes -- INV-002's logic_expression just names "storeMonthSales" as its
// denominator field, same as any other column. fobRows are raw (loc, date, prod_sales_amt) rows;
// varianceRows are already mapVarianceStatRow-mapped (carry `.period`, 'YYYY-MM').
export function joinStoreMonthSales(varianceRows, fobRows) {
  const salesByLocPeriod = new Map();
  for (const r of fobRows) {
    const period = String(r.date).slice(0, 7);
    const key = r.loc + '::' + period;
    salesByLocPeriod.set(key, (salesByLocPeriod.get(key) || 0) + (Number(r.prod_sales_amt) || 0));
  }
  return varianceRows.map(r => ({
    ...r,
    storeMonthSales: salesByLocPeriod.get(r.loc + '::' + r.period) ?? null,
  }));
}

// Last calendar day of a 'YYYY-MM' period, as 'YYYY-MM-DD' -- security_findings.window_start/
// window_end are real `date` columns, not text, so a period-string bound has to become an actual
// date before it's stored (internally, computeItemFindingsForRule keeps windowStart/windowEnd as
// 'YYYY-MM' strings throughout, matching mapVarianceStatRow's date field -- this conversion only
// happens at the point a finding object is built).
export function periodEndDate(period) {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

// dispatch #45 §B -- qsr_variance_stat.descr carries machine-readable lifecycle markers the batch
// job already loads (mapVarianceStatRow) but never reads: '(Deactivated)', '(New)', '(Obsolete NN
// days left'. Measured share of INV-001's real flagged population (memory/analysis-zscore-dry-
// run-2026-08-20.md): 13.8% of flags carry a marker -- real, but a minority, NOT the dominant
// explanation an earlier same-day reading wrongly concluded from a top-20 sorted by magnitude
// (marked items cluster at the extreme end, which made them look dominant in a sorted head that
// was never a representative sample). Route, don't suppress: a deactivated WRIN at 193% median
// variance is a genuine work item, just a data-hygiene one, not a security one -- deleting it
// would discard real signal. Pure, order-checked (Deactivated before Obsolete before New matters
// only if a descr could ever carry more than one marker; QSRSoft's real strings never do, but the
// order here is deliberate and stable regardless).
// dispatch #46 §C item 6 -- automatic exoneration. qsr_variance_stat already carries raw_waste/
// comp_waste (mapVarianceStatRow's rawWaste/compWaste) alongside the variance figure a rule flags
// on -- loaded on every run, never read for this purpose before now. security_rules' own
// exoneration_rules column is '{}' (unpopulated) on every current rule, so reading it would be a
// no-op; this instead computes the real check the dispatch names directly: variance covered by
// LOGGED waste is largely explained, not shrink. Pure -- `rows` is a subject's own subjectRows
// (already available at the call site, no new data source). Returns null when there's no variance
// to explain at all (share is meaningless against a zero denominator, same honest-null discipline
// as the engine's own exposure floor).
export function computeWasteExoneration(rows) {
  let totalVariance = 0, totalWaste = 0;
  for (const r of rows) {
    totalVariance += Math.abs(Number(r.variance) || 0);
    totalWaste += (Number(r.rawWaste) || 0) + (Number(r.compWaste) || 0);
  }
  if (!totalVariance) return null;
  return { totalVariance, totalWaste, share: totalWaste / totalVariance };
}

export function classifyLifecycle(descr) {
  if (!descr) return null;
  if (/\(Deactivated\)/i.test(descr)) return 'deactivated';
  if (/\(Obsolete\b/i.test(descr)) return 'obsolete';
  if (/\(New\)/i.test(descr)) return 'new';
  return null;
}

// The item-domain parallel to computeFindingsForRule() -- pure, no Supabase dependency. Subject
// is (loc, wrin), never an employee: qsr_variance_stat carries no emp/empToken field at all, so
// personalBaseline/peerBaseline/networkBaseline (all hard-require r.emp, dispatch #40's header)
// are not usable here -- only storeBaseline(), which groups purely by r.loc.
export function computeItemFindingsForRule(rule, rows, { windowStart, windowEnd }) {
  const { numField, denField, scale, abs } = fieldsFromExpr(rule);
  const dataRequired = dataRequiredList(rule);
  const primary = dataRequired[0];

  // Condiment-class rows carry a dol_diff forced to 0 at map time (eom-parsers.js's
  // mapVarianceRows) -- but this exclusion is applied uniformly to BOTH INV-001 and INV-002, not
  // just the dol_diff-based one: condiments' inherently low/noisy unit-usage figures make a
  // %-rate rule prone to false positives even on INV-001's variance/exp_usage ratio, where the
  // numerator isn't literally zeroed. One policy, stated once, not a per-rule special case.
  const eligible = rows.filter(r => r.cls !== 'condiment');

  // Distinct (loc, wrin) pairs actually present in the window -- the subject is a store x item,
  // never a person.
  const pairs = new Map();
  for (const r of eligible) {
    if (!r.loc || !r.wrin) continue;
    const key = r.loc + '::' + r.wrin;
    if (!pairs.has(key)) pairs.set(key, { loc: r.loc, wrin: r.wrin });
  }

  const findings = [];
  for (const { loc, wrin } of pairs.values()) {
    const subjectRows = eligible.filter(r => r.loc === loc && r.wrin === wrin);

    // Baseline computed BEFORE evaluateRule() -- same dispatch #42 reordering as
    // computeFindingsForRule(), required now that INV-001/INV-002 are z-score rules (the baseline
    // is an input to the verdict, not context attached after it). storeBaseline's population is
    // pre-filtered to the SAME wrin -- "this store's rate for item X vs. other stores' rate for
    // that SAME item X," never pooled across unrelated items (a chicken-nugget variance rate
    // isn't comparable to a napkin one). This is a caller-side filter, not a storeBaseline()
    // change -- it already groups by r.loc alone, so handing it a same-item-only row set is all
    // that's needed.
    const sameItemRows = eligible.filter(r => r.wrin === wrin);
    const baseline = rule.baseline_type === 'store'
      ? storeBaseline(sameItemRows, { loc, numField, denField, scale, abs, start: windowStart, end: windowEnd })
      : null;

    const evalResult = evaluateRule(rule, { [primary]: subjectRows }, { loc, baseline });

    // dispatch #45 §B -- classified from THIS subject's own descr (any row for the (loc,wrin)
    // pair carries the same item-level descr; subjectRows[0] is as good as any). A lifecycle
    // category is item metadata, not a property of the evaluation -- computed once per subject,
    // independent of pass/fail, so a routed finding still carries its real value/threshold/verdict
    // and is never silently dropped.
    const lifecycleCategory = classifyLifecycle(subjectRows[0]?.descr);

    // dispatch #46 §C item 6 -- only computed for a real flag. A clear/undetermined subject has
    // nothing to exonerate, and computing it unconditionally would waste a pass over every subject
    // for a number nobody would ever read (CLAUDE.md's "a number nobody acts on is not a shipped
    // feature," applied to a compute cost as much as a UI tile).
    const exoneration = evalResult.pass === true ? computeWasteExoneration(subjectRows) : null;

    findings.push({
      wrin, loc, ruleId: rule.rule_id,
      windowStart: `${windowStart}-01`, windowEnd: periodEndDate(windowEnd),
      value: evalResult.value, thresholdUsed: evalResult.threshold, pass: evalResult.pass,
      baselineContext: baseline || {}, explanation: buildExplanation(rule, evalResult, baseline),
      lifecycleCategory, exonerationShare: exoneration?.share ?? null,
    });
  }
  return findings;
}

// ── INV-004 -- manager x day-part x store (dispatch #48/#50 lineage) ────────────────────────────
// dispatch #48's original "no day-part sales denominator" premise was WRONG (dispatch #50's own
// correction, same failure shape as manOverringQty): qsr_daily_activity already carries
// net_sales/product_sales/transactions per (loc, dt, hour_slot), an HOURLY grain, finer than
// day-part. Summing hour slots into day-parts is directly computable -- nothing new to pull.
//
// Boundary, measured not assumed (dispatch #50's own explicit instruction -- "do not invent a
// convention, do not re-derive inline"): qsr_waste.busn_dt is treated as ALREADY business-date-
// aligned, the same convention qsr_daily_activity.dt already uses (hour_slot 05:00->28:00 = the
// 4am->4am business day, confirmed in dar-vs-ops-reconciliation.md). Checked live 2026-08-20: 0 of
// 26,443 qsr_waste rows have a busn_tm in the 00:00-03:59 window that would distinguish "already
// shifted" from "raw calendar date" -- the DAR itself confirms real overnight activity exists at
// 26 stores (238,781 transactions measured in that same wall-clock window), so the absence isn't
// "the business is closed then," it's that waste specifically isn't logged in that narrow window.
// With no live counter-example, this follows the two remaining signals -- the column's own name
// (busn_dt = business date) and the DAR's own established alignment -- and joins busn_dt directly
// against qsr_daily_activity.dt with NO calendar-to-business-date shift applied. If a future
// backfill or a 24-hour store ever produces a busn_tm in that window, re-run this same check
// before trusting the join further.
//
// Day-part bucketing reuses daypartOf() (src/engine/labor-standard.js, the VLH guide's own
// boundaries) rather than inventing a second boundary set -- this wraps a raw wall-clock hour from
// busn_tm into daypartOf()'s own hour_slot string shape (0-4 -> the wrapped 24-28 "Late Night"
// tail, matching the DAR's own hour_slot convention exactly) instead of re-deriving Breakfast/
// Lunch/Afternoon/Dinner/Late Night boundaries a second time.
export function daypartFromBusnTm(busnTm) {
  const h = parseInt(String(busnTm).slice(0, 2), 10);
  if (!Number.isFinite(h)) return null;
  const wrapped = h < 5 ? h + 24 : h;
  return daypartOf(String(wrapped).padStart(2, '0') + ':00');
}

// qsr_waste field mapping -- loc/period/event_id/wtype/reason/wsource/edited are loaded but not
// read by this rule (busn_dt/busn_tm/amount/empToken are the only fields the compute function
// below uses); manager (the raw eID) is intentionally NOT exposed here -- empToken is the only
// identity this rule ever reads, matching dispatch #48's own explicit instruction ("never a
// plaintext eID in security_findings").
export function mapWasteRow(r) {
  return {
    loc: r.loc, date: r.busn_dt, busnTm: r.busn_tm, empToken: r.emp_token,
    amount: Number(r.amount) || 0, wtype: r.wtype,
    daypart: daypartFromBusnTm(r.busn_tm),
  };
}

// qsr_daily_activity field mapping -- only the columns this rule's denominator needs.
export function mapDailyActivityRow(r) {
  return { loc: r.loc, date: r.dt, hourSlot: r.hour_slot, productSales: Number(r.product_sales) || 0 };
}

// loc|date|daypart -> summed product_sales across that day-part's hour slots. Built ONCE per
// window and reused for every subject -- the same sales figure is looked up, never recomputed,
// for every waste row that lands in that (loc,date,daypart) bucket, so multiple waste line-items
// on the same shift don't inflate the denominator.
export function buildDaypartSalesIndex(dailyActivityRows) {
  const idx = new Map();
  for (const r of dailyActivityRows) {
    if (!r.loc || !r.date || !r.hourSlot) continue;
    const dp = daypartOf(r.hourSlot);
    const k = `${r.loc}::${r.date}::${dp}`;
    idx.set(k, (idx.get(k) || 0) + r.productSales);
  }
  return idx;
}

// Pre-aggregates raw qsr_waste rows into ONE row per (loc, date, daypart, empToken), summing
// amount, THEN attaches that (loc,date,daypart)'s own sales figure once per bucket -- this is the
// step that prevents double-counting the denominator (see buildDaypartSalesIndex's own comment).
// The resulting rows are what computeManagerDaypartFindingsForRule()/evaluateZScoreRule sum again,
// per subject, across the window -- exactly the same two-stage shape computeItemFindingsForRule()
// uses for qsr_variance_stat (one row per (loc,period,wrin), summed per subject across periods).
// Rows with no matching sales bucket (a waste event with no corresponding DAR data at all for
// that store/date/daypart) are dropped -- there is no denominator to divide by, and carrying a
// null-denominator row forward would either explode or silently zero the rate depending on how it
// got handled downstream; dropping it here is the same honest-exclusion the item/wrin path applies
// to condiment rows.
export function joinWasteDaypartSales(wasteRows, salesIndex) {
  const buckets = new Map(); // loc|date|daypart|empToken -> aggregated row
  for (const r of wasteRows) {
    if (!r.loc || !r.date || !r.daypart || !r.empToken) continue;
    const salesKey = `${r.loc}::${r.date}::${r.daypart}`;
    const sales = salesIndex.get(salesKey);
    if (sales == null) continue;
    const key = `${salesKey}::${r.empToken}`;
    const cur = buckets.get(key) || { loc: r.loc, date: r.date, daypart: r.daypart, empToken: r.empToken, wasteAmt: 0, daypartSales: sales };
    cur.wasteAmt += r.amount;
    buckets.set(key, cur);
  }
  return [...buckets.values()];
}

// The manager x day-part x store domain (INV-004). Subject is (loc, empToken, daypart) -- a
// THIRD grain beyond computeFindingsForRule's (loc,empToken) and computeItemFindingsForRule's
// (loc,wrin), because qsr_waste carries no wrin (event-level, not item-level -- item-level waste
// is INV-003's own territory against qsr_variance_stat, not this table). baseline_type 'store'
// reuses storeBaseline() exactly as computeItemFindingsForRule() does, pre-filtered to the SAME
// daypart (peer STORES' own rate for the SAME day-part, pooling across whichever managers logged
// waste there) -- never pooled across unrelated day-parts, the same "same key, never pooled
// across unrelated things" discipline INV-003/005 apply to wrin.
export function computeManagerDaypartFindingsForRule(rule, rows, { windowStart, windowEnd }) {
  const { numField, denField, scale, abs } = fieldsFromExpr(rule);

  const pairs = new Map();
  for (const r of rows) {
    if (!r.loc || !r.empToken || !r.daypart) continue;
    const key = `${r.loc}::${r.empToken}::${r.daypart}`;
    if (!pairs.has(key)) pairs.set(key, { loc: r.loc, empToken: r.empToken, daypart: r.daypart });
  }

  const findings = [];
  for (const { loc, empToken, daypart } of pairs.values()) {
    const subjectRows = rows.filter(r => r.loc === loc && r.empToken === empToken && r.daypart === daypart);

    const sameDaypartRows = rows.filter(r => r.daypart === daypart);
    const baseline = rule.baseline_type === 'store'
      ? storeBaseline(sameDaypartRows, { loc, numField, denField, scale, abs, start: windowStart, end: windowEnd })
      : null;

    const evalResult = evaluateRule(rule, { [dataRequiredList(rule)[0]]: subjectRows }, { loc, baseline });

    findings.push({
      empToken, loc, daypart, ruleId: rule.rule_id, windowStart, windowEnd,
      value: evalResult.value, thresholdUsed: evalResult.threshold, pass: evalResult.pass,
      baselineContext: baseline || {}, explanation: buildExplanation(rule, evalResult, baseline),
    });
  }
  return findings;
}

// ── I/O layer ──────────────────────────────────────────────────────────────────────────────────
async function loadActiveRules() {
  const { data, error } = await supabase.from('security_rules').select('*').eq('active', true).eq('tenant_id', TENANT);
  if (error) throw new Error(`[security-rules-run] loadActiveRules failed: ${error.message}`);
  return data || [];
}

const PAGE = 1000;
async function loadAuditRowsWindow(startDate, endDate) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from('audit_rows').select('*')
      .gte('date', startDate).lte('date', endDate).range(from, from + PAGE - 1);
    if (error) throw new Error(`[security-rules-run] loadAuditRowsWindow failed: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data.map(mapAuditRow));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

const PERIOD_PAGE = 1000;
async function loadVarianceStatWindow(startPeriod, endPeriod) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from('qsr_variance_stat').select('*')
      .gte('period', startPeriod).lte('period', endPeriod).range(from, from + PERIOD_PAGE - 1);
    if (error) throw new Error(`[security-rules-run] loadVarianceStatWindow failed: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data.map(mapVarianceStatRow));
    if (data.length < PERIOD_PAGE) break;
    from += PERIOD_PAGE;
  }
  return rows;
}

// qsr_fob is daily grain -- the window here is real calendar dates spanning startPeriod's first
// day through endPeriod's last day, not the 'YYYY-MM' bounds loadVarianceStatWindow uses.
async function loadFobWindow(startPeriod, endPeriod) {
  const startDate = `${startPeriod}-01`;
  const endDate = periodEndDate(endPeriod);
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from('qsr_fob').select('loc,date,prod_sales_amt')
      .gte('date', startDate).lte('date', endDate).range(from, from + PERIOD_PAGE - 1);
    if (error) throw new Error(`[security-rules-run] loadFobWindow failed: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data);
    if (data.length < PERIOD_PAGE) break;
    from += PERIOD_PAGE;
  }
  return rows;
}

// INV-004's two sources -- daily grain, same date-range shape loadAuditRowsWindow already uses
// (CASH-*'s own convention), not the monthly qsr_variance_stat shape.
async function loadWasteWindow(startDate, endDate) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from('qsr_waste').select('*')
      .gte('busn_dt', startDate).lte('busn_dt', endDate).range(from, from + PAGE - 1);
    if (error) throw new Error(`[security-rules-run] loadWasteWindow failed: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data.map(mapWasteRow));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function loadDailyActivityWindow(startDate, endDate) {
  const rows = [];
  let from = 0;
  for (;;) {
    const { data, error } = await supabase.from('qsr_daily_activity').select('loc,dt,hour_slot,product_sales')
      .gte('dt', startDate).lte('dt', endDate).range(from, from + PAGE - 1);
    if (error) throw new Error(`[security-rules-run] loadDailyActivityWindow failed: ${error.message}`);
    if (!data?.length) break;
    rows.push(...data.map(mapDailyActivityRow));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return rows;
}

async function upsertFindings(findings) {
  if (!findings.length) return { saved: 0, errors: [] };
  const now = new Date().toISOString();
  const upsert = findings.map(f => ({
    tenant_id: TENANT, emp_token: f.empToken ?? null, wrin: f.wrin ?? null, loc: f.loc, rule_id: f.ruleId,
    window_start: f.windowStart, window_end: f.windowEnd,
    value: f.value, threshold_used: f.thresholdUsed, pass: f.pass,
    baseline_context: f.baselineContext, explanation: f.explanation, computed_at: now,
    lifecycle_category: f.lifecycleCategory ?? null,
    exoneration_share: f.exonerationShare ?? null,
    daypart: f.daypart ?? null,
  }));
  const CHUNK = 500;
  let saved = 0; const errors = [];
  for (let i = 0; i < upsert.length; i += CHUNK) {
    // subject_key (generated column, schema-security-findings.sql) collapses emp_token/wrin's
    // nullability into a NOT NULL value -- a plain emp_token/wrin column list wouldn't actually
    // enforce idempotency here, since Postgres unique indexes treat NULL as never equal to
    // another NULL. CASH-*/audit_rows findings write emp_token with wrin null; INV-*/
    // qsr_variance_stat findings (dispatch #40) write wrin with emp_token null -- either way
    // subject_key resolves to one NOT NULL value per row, so the same conflict target works.
    const { error } = await supabase.from('security_findings').upsert(
      upsert.slice(i, i + CHUNK),
      { onConflict: 'tenant_id,rule_id,loc,window_start,window_end,subject_key' },
    );
    if (error) { console.error('[security-rules-run] upsert error:', error); errors.push(error.message); }
    else saved += Math.min(CHUNK, upsert.length - i);
  }
  return { saved, errors };
}

async function main() {
  if (!supabase) { console.error('[security-rules-run] Missing VITE_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY'); process.exit(1); }

  const rules = await loadActiveRules();
  console.log(`[security-rules-run] ${rules.length} active rule(s)`);
  if (!rules.length) { console.log('[security-rules-run] nothing to do'); process.exit(0); }

  const today = new Date();
  const auditRowCache = new Map();    // 'YYYY-MM-DD..YYYY-MM-DD' -> mapped audit_rows
  const varianceRowCache = new Map(); // 'YYYY-MM..YYYY-MM' -> mapped qsr_variance_stat rows (unjoined)
  const fobRowCache = new Map();      // 'YYYY-MM..YYYY-MM' -> raw qsr_fob rows
  const wasteRowCache = new Map();        // 'YYYY-MM-DD..YYYY-MM-DD' -> mapped qsr_waste rows
  const dailyActivityCache = new Map();   // 'YYYY-MM-DD..YYYY-MM-DD' -> mapped qsr_daily_activity rows
  let totalFindings = 0, totalErrors = 0, skipped = 0;

  for (const rule of rules) {
    let findings, rows, cacheKey;

    if (supportsAuditRows(rule)) {
      const windowDays = rule.window_days || DEFAULT_WINDOW_DAYS;
      const windowEnd = fmtDate(today);
      const windowStart = fmtDate(addDay(today, -windowDays));
      cacheKey = `${windowStart}..${windowEnd}`;
      if (!auditRowCache.has(cacheKey)) auditRowCache.set(cacheKey, await loadAuditRowsWindow(windowStart, windowEnd));
      rows = auditRowCache.get(cacheKey);
      findings = computeFindingsForRule(rule, rows, { windowStart, windowEnd });
    } else if (supportsVarianceStat(rule)) {
      // qsr_variance_stat is monthly grain -- window_days (personal to CASH-*'s daily convention)
      // is converted to a whole-month count, INV-001/002's default (90 days, see
      // schema-security-rules-phase1b.sql) landing on a 3-month rolling window.
      const windowMonths = Math.max(1, Math.round((rule.window_days || DEFAULT_WINDOW_DAYS) / 30));
      const periods = [];
      for (let i = windowMonths - 1; i >= 0; i--) {
        const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
        periods.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
      }
      const windowStart = periods[0], windowEnd = periods[periods.length - 1];
      cacheKey = `${windowStart}..${windowEnd}`;
      if (!varianceRowCache.has(cacheKey)) varianceRowCache.set(cacheKey, await loadVarianceStatWindow(windowStart, windowEnd));
      rows = varianceRowCache.get(cacheKey);
      if (dataRequiredList(rule).includes('qsr_fob')) {
        if (!fobRowCache.has(cacheKey)) fobRowCache.set(cacheKey, await loadFobWindow(windowStart, windowEnd));
        rows = joinStoreMonthSales(rows, fobRowCache.get(cacheKey));
      }
      findings = computeItemFindingsForRule(rule, rows, { windowStart, windowEnd });
    } else if (supportsWasteDaypart(rule)) {
      // Daily grain, CASH-*'s own date-range convention (not qsr_variance_stat's monthly shape).
      const windowDays = rule.window_days || DEFAULT_WINDOW_DAYS;
      const windowEnd = fmtDate(today);
      const windowStart = fmtDate(addDay(today, -windowDays));
      cacheKey = `${windowStart}..${windowEnd}`;
      if (!wasteRowCache.has(cacheKey)) wasteRowCache.set(cacheKey, await loadWasteWindow(windowStart, windowEnd));
      if (!dailyActivityCache.has(cacheKey)) dailyActivityCache.set(cacheKey, await loadDailyActivityWindow(windowStart, windowEnd));
      const salesIndex = buildDaypartSalesIndex(dailyActivityCache.get(cacheKey));
      rows = joinWasteDaypartSales(wasteRowCache.get(cacheKey), salesIndex);
      findings = computeManagerDaypartFindingsForRule(rule, rows, { windowStart, windowEnd });
    } else {
      console.warn(`[security-rules-run] ${rule.rule_id}: DATA_REQUIRED not yet supported by this job — skipping`);
      skipped++; continue;
    }

    console.log(`[security-rules-run] ${rule.rule_id}: ${rows.length} row(s) in ${cacheKey} -> ${findings.length} finding(s), ${findings.filter(f => f.pass).length} flagged`);
    const { saved, errors } = await upsertFindings(findings);
    totalFindings += saved;
    if (errors.length) totalErrors += errors.length;
  }

  console.log(`[security-rules-run] done — ${totalFindings} finding(s) upserted across ${rules.length - skipped} rule(s) (${skipped} skipped), ${totalErrors} error(s)`);
  process.exit(totalErrors > 0 ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => { console.error('[security-rules-run] FATAL:', e); process.exit(1); });
}
