// @ts-nocheck
// scripts/security-rules-run.mjs (dispatch #39) -- the Phase 1 batch job's pure compute core.
// No Supabase dependency in these functions themselves, same testing precedent as dispatch #35's
// mapRow() and dispatch #36's evaluateRule()/baseline fixtures -- hand-computed expected values
// in each test's own comment, not assumed.
import { describe, it, expect } from 'vitest';
import { mapAuditRow, supportsAuditRows, fieldsFromExpr, computeFindingsForRule, buildExplanation } from '../../scripts/security-rules-run.mjs';

describe('mapAuditRow() — snake_case DB row -> camelCase, matching dispatch #39\'s own field table', () => {
  it('maps every column named in the dispatch, including emp_token -> empToken', () => {
    const r = mapAuditRow({
      loc: '0043380', date: '2026-08-01', emp: 'Aaden W', emp_token: 'tok-aaden',
      drawer_sales: 1000, drawer_gc: 100, cash_os_dollar: -6,
      pos_over_cnt: 2, pos_over_amt: 3.5, manual_ref_amt: 12.75,
      refund_cash: 8, refund_cashless: 4.5, refund_cnt: 3,
      promo_amt: 42.1, t_red_a_cnt: 1, t_red_a_dollar: 5.99, t_red_b_cnt: 4, t_red_b_dollar: 18.4,
    });
    expect(r).toMatchObject({
      loc: '0043380', emp: 'Aaden W', empToken: 'tok-aaden',
      drawerSales: 1000, drawerGC: 100, cashOSDollar: -6,
      posOverCnt: 2, posOverAmt: 3.5, manualRefAmt: 12.75,
      refundCash: 8, refundCashless: 4.5, refundCnt: 3,
      promoAmt: 42.1, tRedACnt: 1, tRedADollar: 5.99, tRedBCnt: 4, tRedBDollar: 18.4,
    });
  });
});

describe('supportsAuditRows()', () => {
  it('true for a rule whose DATA_REQUIRED includes audit_rows (array or JSON-string form)', () => {
    expect(supportsAuditRows({ data_required: ['audit_rows'] })).toBe(true);
    expect(supportsAuditRows({ data_required: '["audit_rows"]' })).toBe(true);
  });
  it('false for a rule naming a source this job does not yet read, never throws', () => {
    expect(supportsAuditRows({ data_required: ['qsr_variance_stat'] })).toBe(false);
    expect(supportsAuditRows({ data_required: [] })).toBe(false);
  });
});

describe('fieldsFromExpr()', () => {
  it('extracts numField/denField/scale/abs from a ratio expression, mirroring CASH-001\'s real shape', () => {
    const rule = { logic_type: 'ratio', logic_expression: { numerator: { field: 'cashOSDollar', agg: 'sum', abs: true }, denominator: { field: 'drawerSales', agg: 'sum' }, scale: 1000, comparator: 'gte' } };
    expect(fieldsFromExpr(rule)).toEqual({ numField: 'cashOSDollar', denField: 'drawerSales', scale: 1000, abs: true });
  });
  it('extracts from a threshold expression with no denominator', () => {
    const rule = { logic_type: 'threshold', logic_expression: { field: 'tRedACnt', agg: 'sum', comparator: 'gt' } };
    expect(fieldsFromExpr(rule)).toEqual({ numField: 'tRedACnt', denField: undefined, scale: 1, abs: false });
  });
});

// Same fixture shape and hand-computed values as dispatch #36's security-baselines.test.js,
// extended with empToken so this dispatch's own attribution logic is exercised, not re-derived.
// Alice (loc 1): days -6,-2 on $1000 sales each -> |sum|=8, sales=2000, rate=4 (below RULE_A's 5)
//                posOverCnt 2+1=3, drawerGC 100+100=200 -> rate=15 (RULE_B's threshold, exactly)
// Bob   (loc 1): day  -12   on $2000 sales       -> |sum|=12, sales=2000, rate=6 (above RULE_A's 5)
//                posOverCnt 1, drawerGC 200 -> rate=5 (below RULE_B's 15)
const ROWS = [
  { loc: '0000001', emp: 'Alice', empToken: 'tok-alice', date: '2026-08-01', drawerSales: 1000, drawerGC: 100, cashOSDollar: -6, posOverCnt: 2 },
  { loc: '0000001', emp: 'Alice', empToken: 'tok-alice', date: '2026-08-02', drawerSales: 1000, drawerGC: 100, cashOSDollar: -2, posOverCnt: 1 },
  { loc: '0000001', emp: 'Bob',   empToken: 'tok-bob',   date: '2026-08-01', drawerSales: 2000, drawerGC: 200, cashOSDollar: -12, posOverCnt: 1 },
  // Pre-backfill row -- no empToken yet. Must be excluded from findings entirely, not scored as "Unknown".
  { loc: '0000001', emp: 'Carol', empToken: null, date: '2026-08-01', drawerSales: 500, drawerGC: 50, cashOSDollar: -50, posOverCnt: 10 },
];
const WIN = { windowStart: '2026-08-01', windowEnd: '2026-08-02' };

const RULE_A = { // CASH-001 shape: personal baseline, cash O/S rate
  rule_id: 'CASH-001', method: 'Cash drawer over/short rate', baseline_type: 'personal', severity: 3, weight: 1,
  data_required: ['audit_rows'],
  logic_type: 'ratio', logic_expression: { numerator: { field: 'cashOSDollar', agg: 'sum', abs: true }, denominator: { field: 'drawerSales', agg: 'sum' }, scale: 1000, comparator: 'gte' },
  threshold: { default: 5 },
};
const RULE_B = { // CASH-002 shape: peer baseline, POS overring rate
  rule_id: 'CASH-002', method: 'POS over-ring rate', baseline_type: 'peer', severity: 2, weight: 1,
  data_required: ['audit_rows'],
  logic_type: 'ratio', logic_expression: { numerator: { field: 'posOverCnt', agg: 'sum' }, denominator: { field: 'drawerGC', agg: 'sum' }, scale: 1000, comparator: 'gte' },
  threshold: { default: 15 },
};

describe('computeFindingsForRule() — RULE_A (personal baseline, cash O/S)', () => {
  it('produces one finding per distinct (loc, empToken) pair, excluding the untokenized row', () => {
    const findings = computeFindingsForRule(RULE_A, ROWS, WIN);
    expect(findings.length).toBe(2); // Alice, Bob -- NOT Carol
    expect(findings.find(f => f.empToken === 'tok-alice')).toBeTruthy();
    expect(findings.find(f => f.empToken === 'tok-bob')).toBeTruthy();
  });

  it("Alice: value=4, below threshold 5, pass=false; personal baseline mean=4 (own per-day rates [6,2])", () => {
    const f = computeFindingsForRule(RULE_A, ROWS, WIN).find(x => x.empToken === 'tok-alice');
    expect(f.value).toBeCloseTo(4, 6);
    expect(f.thresholdUsed).toBe(5);
    expect(f.pass).toBe(false);
    expect(f.baselineContext.mean).toBeCloseTo(4, 6);
    expect(f.baselineContext.stdev).toBeCloseTo(2, 6); // sqrt(((6-4)^2+(2-4)^2)/2) = sqrt(4) = 2
  });

  it("Bob: value=6, at/above threshold 5, pass=true", () => {
    const f = computeFindingsForRule(RULE_A, ROWS, WIN).find(x => x.empToken === 'tok-bob');
    expect(f.value).toBeCloseTo(6, 6);
    expect(f.pass).toBe(true);
  });
});

describe('computeFindingsForRule() — RULE_B (peer baseline, POS overring)', () => {
  it("Alice's own value=15 (at the RULE_B threshold, exactly), pass=true", () => {
    const f = computeFindingsForRule(RULE_B, ROWS, WIN).find(x => x.empToken === 'tok-alice');
    expect(f.value).toBeCloseTo(15, 6); // (2+1)/200*1000
    expect(f.pass).toBe(true); // gte 15
  });

  it("an untokenized peer (Carol, no finding of her own) still anonymously CONTRIBUTES a rate to " +
     "the peer baseline population -- dispatch #39's own baseline functions are unmodified " +
     "(dispatch #36's), and group by raw emp name, not emp_token. This is correct, not a bug: " +
     "Carol is never the SUBJECT of a finding (excluded from computeFindingsForRule's own pairs " +
     "above), but excluding her rate from what 'normal' looks like for her peers would throw away " +
     "real signal for no privacy benefit -- her identity is never exposed, only a pooled number.", () => {
    const alice = computeFindingsForRule(RULE_B, ROWS, WIN).find(x => x.empToken === 'tok-alice');
    const bob    = computeFindingsForRule(RULE_B, ROWS, WIN).find(x => x.empToken === 'tok-bob');
    // Alice's peers = Bob (rate 5) + Carol (rate 10/50*1000 = 200).
    expect(alice.baselineContext.values.slice().sort((a, b) => a - b)).toEqual([5, 200]);
    // Bob's peers = Alice (combined rate (2+1)/(100+100)*1000 = 15) + Carol (200).
    expect(bob.baselineContext.values.slice().sort((a, b) => a - b)).toEqual([15, 200]);
  });
});

describe('buildExplanation()', () => {
  it('returns a single-entry array with the label, value, threshold, and z-score', () => {
    const evalResult = { value: 6, threshold: 5, pass: true };
    const baseline = { mean: 4, stdev: 2, n: 2 };
    const exp = buildExplanation(RULE_A, evalResult, baseline);
    expect(exp).toHaveLength(1);
    expect(exp[0].rule_id).toBe('CASH-001');
    expect(exp[0].value).toBe(6);
    expect(exp[0].threshold).toBe(5);
    expect(exp[0].zscore).toBeCloseTo(1, 6); // (6-4)/2
    expect(exp[0].contribution).toBe(1); // weight, since pass=true
    expect(exp[0].label).toMatch(/flagged/);
  });

  it('never fabricates a verdict — a null value (no exposure) produces a distinct, honest label', () => {
    const exp = buildExplanation(RULE_A, { value: null, threshold: 5, pass: null }, null);
    expect(exp[0].value).toBeNull();
    expect(exp[0].label).toMatch(/no exposure/);
  });

  it('a null pass with a real value (no threshold configured) reads "undetermined", not a fabricated verdict', () => {
    const exp = buildExplanation(RULE_A, { value: 4, threshold: null, pass: null }, null);
    expect(exp[0].label).toMatch(/undetermined/);
    expect(exp[0].contribution).toBe(0);
  });
});
