#!/usr/bin/env node
// scripts/security-rules-run.mjs
// Dispatch #39 (memory/dispatch-39.md) — the Phase 1 scheduled batch job: evaluates every
// ACTIVE security_rules row (dispatch #36's registry) against a rolling audit_rows window,
// computes the relevant baseline context (dispatch #36's security-baselines.js, unmodified),
// and upserts one security_findings row per (rule, employee, window) — dispatch #39's own new
// output table, subject-keyed on emp_token, never a plaintext name (Direction B, dispatch #37).
//
// This is a COMPUTE job, not a pull -- audit_rows is already in Supabase (qsrsoft-register-
// audit-pull.mjs's job), this reads it back and scores it. Scaffolding (service-role client,
// GitHub Actions workflow, sync-failure-watch.yml entry) matches the *-pull.mjs family per
// CLAUDE.md's standing "new automated pull" checklist, but the compute loop itself is new --
// not modeled on any existing pull script's per-row mapping shape.
//
// Does NOT modify src/engine/security-rules.js or security-baselines.js -- both already correct
// (dispatch #36), reused here exactly as they are.
//
// Required env: VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Run AFTER supabase/schema-security-rules-phase1.sql and schema-security-findings.sql have
// been applied, and after that day's qsrsoft-register-audit-pull.yml run (this job's input).

import { createClient } from '@supabase/supabase-js';
import { evaluateRule } from '../src/engine/security-rules.js';
import { personalBaseline, peerBaseline, storeBaseline, networkBaseline } from '../src/engine/security-baselines.js';

const TENANT = '00000000-0000-0000-0000-000000000001';
const DEFAULT_WINDOW_DAYS = 28;

// Guarded, not unconditional -- matching every other pull/compute script in this repo (dispatch
// #33's original note, repeated at #35/#37/#38): an unconditional createClient() at module scope
// would crash the pure functions' own unit tests, which have no env vars set.
const supabase = (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
  ? createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
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
    manualRefAmt: r.manual_ref_amt,
    refundCash: r.refund_cash, refundCashless: r.refund_cashless, refundCnt: r.refund_cnt,
    promoAmt: r.promo_amt,
    tRedACnt: r.t_red_a_cnt, tRedADollar: r.t_red_a_dollar,
    tRedBCnt: r.t_red_b_cnt, tRedBDollar: r.t_red_b_dollar,
  };
}

// This job only knows how to source audit_rows today -- a rule naming any other DATA_REQUIRED
// (e.g. a future qsr_variance_stat-based rule) is skipped with a warning, not crashed on, so a
// rule can be registered ahead of this job supporting its source without breaking the run.
export function supportsAuditRows(rule) {
  const req = Array.isArray(rule.data_required) ? rule.data_required
    : (typeof rule.data_required === 'string' ? JSON.parse(rule.data_required) : []);
  return req.includes('audit_rows');
}

// Extracts {numField, denField, scale, abs} from a rule's logic_expression -- a thin read, not a
// re-implementation of security-rules.js's own evaluation (evaluateRule still does the actual
// pass/fail math); this only tells the baseline functions which columns to look at.
export function fieldsFromExpr(rule) {
  const expr = typeof rule.logic_expression === 'string' ? JSON.parse(rule.logic_expression) : rule.logic_expression;
  if (rule.logic_type === 'ratio') {
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
    return [{ rule_id: rule.rule_id, label: `${rule.method}: no exposure in window`, value: null, contribution: 0 }];
  }
  const zscore = (baseline && baseline.stdev) ? (evalResult.value - baseline.mean) / baseline.stdev : null;
  const zLabel = zscore != null && Number.isFinite(zscore) ? ` (${zscore >= 0 ? '+' : ''}${zscore.toFixed(1)}σ vs ${rule.baseline_type} baseline)` : '';
  const verdict = evalResult.pass === true ? 'flagged' : evalResult.pass === false ? 'clear' : 'undetermined (no threshold configured)';
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
    const evalResult = evaluateRule(rule, { audit_rows: subjectRows }, { loc });

    const baselineOpts = { emp, loc, numField, denField, scale, abs, start: windowStart, end: windowEnd };
    let baseline = null;
    if (rule.baseline_type === 'personal') baseline = personalBaseline(rows, baselineOpts);
    else if (rule.baseline_type === 'peer') baseline = peerBaseline(rows, baselineOpts);
    else if (rule.baseline_type === 'store') baseline = storeBaseline(rows, baselineOpts);
    else if (rule.baseline_type === 'network') baseline = networkBaseline(rows, baselineOpts);

    findings.push({
      empToken, loc, ruleId: rule.rule_id, windowStart, windowEnd,
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

async function upsertFindings(findings) {
  if (!findings.length) return { saved: 0, errors: [] };
  const now = new Date().toISOString();
  const upsert = findings.map(f => ({
    tenant_id: TENANT, emp_token: f.empToken, loc: f.loc, rule_id: f.ruleId,
    window_start: f.windowStart, window_end: f.windowEnd,
    value: f.value, threshold_used: f.thresholdUsed, pass: f.pass,
    baseline_context: f.baselineContext, explanation: f.explanation, computed_at: now,
  }));
  const CHUNK = 500;
  let saved = 0; const errors = [];
  for (let i = 0; i < upsert.length; i += CHUNK) {
    // subject_key (generated column, schema-security-findings.sql) collapses emp_token/wrin's
    // nullability into a NOT NULL value -- a plain emp_token/wrin column list wouldn't actually
    // enforce idempotency here, since Postgres unique indexes treat NULL as never equal to
    // another NULL. This job only ever writes emp_token findings today (wrin is dispatch #40's),
    // but the conflict target already matches the wider table shape.
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
  const rowCache = new Map(); // windowStart..windowEnd -> rows, so same-window rules don't re-fetch
  let totalFindings = 0, totalErrors = 0, skipped = 0;

  for (const rule of rules) {
    if (!supportsAuditRows(rule)) {
      console.warn(`[security-rules-run] ${rule.rule_id}: DATA_REQUIRED not yet supported by this job — skipping`);
      skipped++; continue;
    }
    const windowDays = rule.window_days || DEFAULT_WINDOW_DAYS;
    const windowEnd = fmtDate(today);
    const windowStart = fmtDate(addDay(today, -windowDays));
    const cacheKey = `${windowStart}..${windowEnd}`;
    if (!rowCache.has(cacheKey)) rowCache.set(cacheKey, await loadAuditRowsWindow(windowStart, windowEnd));
    const rows = rowCache.get(cacheKey);

    const findings = computeFindingsForRule(rule, rows, { windowStart, windowEnd });
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
