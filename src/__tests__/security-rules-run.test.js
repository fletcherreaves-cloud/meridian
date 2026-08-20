// @ts-nocheck
// scripts/security-rules-run.mjs (dispatch #39, extended #40) -- the Phase 1/1b batch job's pure
// compute core. No Supabase dependency in these functions themselves, same testing precedent as
// dispatch #35's mapRow() and dispatch #36's evaluateRule()/baseline fixtures -- hand-computed
// expected values in each test's own comment, not assumed.
import { describe, it, expect } from 'vitest';
import {
  mapAuditRow, supportsAuditRows, fieldsFromExpr, computeFindingsForRule, buildExplanation,
  dataRequiredList, supportsVarianceStat, mapVarianceStatRow, joinStoreMonthSales, periodEndDate,
  computeItemFindingsForRule,
} from '../../scripts/security-rules-run.mjs';
import { evaluateRule } from '../engine/security-rules.js';

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

// ── Dispatch #40 -- inventory-domain (qsr_variance_stat) branch ─────────────────────────────────

describe('dataRequiredList() / supportsVarianceStat()', () => {
  it('supportsAuditRows and supportsVarianceStat are mutually exclusive on their own fixtures', () => {
    expect(supportsVarianceStat({ data_required: ['qsr_variance_stat'] })).toBe(true);
    expect(supportsVarianceStat({ data_required: ['qsr_variance_stat', 'qsr_fob'] })).toBe(true);
    expect(supportsVarianceStat({ data_required: '["qsr_variance_stat"]' })).toBe(true);
    expect(supportsVarianceStat({ data_required: ['audit_rows'] })).toBe(false);
    expect(supportsAuditRows({ data_required: ['qsr_variance_stat'] })).toBe(false);
  });
  it('dataRequiredList handles array, JSON-string, and missing forms without throwing', () => {
    expect(dataRequiredList({ data_required: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(dataRequiredList({ data_required: '["a"]' })).toEqual(['a']);
    expect(dataRequiredList({})).toEqual([]);
  });
});

describe('mapVarianceStatRow() — snake_case DB row -> camelCase, period mapped straight onto date', () => {
  it('maps every real qsr_variance_stat column, date === period (not period + \'-01\')', () => {
    const r = mapVarianceStatRow({
      loc: '0000001', period: '2026-07', wrin: 'W100', cls: 'food', descr: 'Beef Patty',
      raw_waste: 1, comp_waste: 2, exp_usage: 100, act_usage: 108, variance: 8, dol_diff: 6.4,
    });
    expect(r).toMatchObject({
      loc: '0000001', period: '2026-07', date: '2026-07', wrin: 'W100', cls: 'food',
      descr: 'Beef Patty', rawWaste: 1, compWaste: 2, expUsage: 100, actUsage: 108,
      variance: 8, dolDiff: 6.4,
    });
  });
});

describe('periodEndDate()', () => {
  it('returns the real last calendar day of a YYYY-MM period, including leap Feb', () => {
    expect(periodEndDate('2026-08')).toBe('2026-08-31');
    expect(periodEndDate('2026-04')).toBe('2026-04-30');
    expect(periodEndDate('2024-02')).toBe('2024-02-29'); // leap year
    expect(periodEndDate('2026-02')).toBe('2026-02-28'); // non-leap
  });
});

describe('joinStoreMonthSales() — qsr_fob daily rows summed per (loc, month), attached to matching variance rows', () => {
  it('sums prod_sales_amt across all days in the period for the matching (loc, period)', () => {
    const varianceRows = [
      { loc: '0000001', period: '2026-07', wrin: 'W100', dolDiff: 6 },
      { loc: '0000002', period: '2026-07', wrin: 'W100', dolDiff: 3 },
    ];
    const fobRows = [
      { loc: '0000001', date: '2026-07-01', prod_sales_amt: 1000 },
      { loc: '0000001', date: '2026-07-02', prod_sales_amt: 1500 },
      { loc: '0000002', date: '2026-07-01', prod_sales_amt: 2000 },
      // A different month's row for store 1 must NOT contribute to July's sum.
      { loc: '0000001', date: '2026-08-01', prod_sales_amt: 9999 },
    ];
    const joined = joinStoreMonthSales(varianceRows, fobRows);
    expect(joined.find(r => r.loc === '0000001').storeMonthSales).toBe(2500);
    expect(joined.find(r => r.loc === '0000002').storeMonthSales).toBe(2000);
  });
  it('a (loc, period) with no matching qsr_fob rows gets null, not 0 or undefined', () => {
    const joined = joinStoreMonthSales([{ loc: '0000003', period: '2026-07', wrin: 'W1' }], []);
    expect(joined[0].storeMonthSales).toBeNull();
  });
});

// Store 1 / Store 2, item W100 (food), 2 periods each -- hand-computed:
//   Store 1 W100: variance |8|+|12|=20, expUsage 100+100=200 -> rate (variance/expUsage*100) = 10
//   Store 2 W100: variance |4|+|6|=10,  expUsage 100+100=200 -> rate = 5
// Item W200 (condiment) on Store 1 has a huge variance/expUsage ratio (999/1) that would dominate
// everything if not excluded -- proves the exclusion actually runs, not just documented.
const INV_ROWS = [
  { loc: '0000001', period: '2026-06', date: '2026-06', wrin: 'W100', cls: 'food', variance: 8,  expUsage: 100 },
  { loc: '0000001', period: '2026-07', date: '2026-07', wrin: 'W100', cls: 'food', variance: 12, expUsage: 100 },
  { loc: '0000002', period: '2026-06', date: '2026-06', wrin: 'W100', cls: 'food', variance: 4,  expUsage: 100 },
  { loc: '0000002', period: '2026-07', date: '2026-07', wrin: 'W100', cls: 'food', variance: 6,  expUsage: 100 },
  { loc: '0000001', period: '2026-06', date: '2026-06', wrin: 'W200', cls: 'condiment', variance: 999, expUsage: 1 },
];
const INV_RULE = {
  rule_id: 'INV-001', logic_type: 'ratio', baseline_type: 'store',
  data_required: ['qsr_variance_stat'],
  logic_expression: { numerator: { field: 'variance', agg: 'sum', abs: true }, denominator: { field: 'expUsage', agg: 'sum' }, scale: 100, comparator: 'gte' },
  threshold: { default: 10 }, method: 'Item TvA variance rate', severity: 3, weight: 1,
};
const INV_WIN = { windowStart: '2026-06', windowEnd: '2026-07' };

describe('computeItemFindingsForRule() — store x item subject, storeBaseline only, condiments excluded', () => {
  it('produces exactly one finding per (loc, wrin) present -- condiment row never becomes a subject', () => {
    const findings = computeItemFindingsForRule(INV_RULE, INV_ROWS, INV_WIN);
    expect(findings).toHaveLength(2); // W100 at store 1 and store 2 only -- W200 excluded
    expect(findings.every(f => f.wrin === 'W100')).toBe(true);
  });

  it('hand-computed rate + threshold crossing for store 1 (rate 10 >= threshold 10 -> pass)', () => {
    const s1 = computeItemFindingsForRule(INV_RULE, INV_ROWS, INV_WIN).find(f => f.loc === '0000001');
    expect(s1.value).toBeCloseTo(10, 6);
    expect(s1.thresholdUsed).toBe(10);
    expect(s1.pass).toBe(true);
  });

  it('hand-computed rate for store 2 (rate 5 < threshold 10 -> fail), baseline is store 1\'s rate ONLY (same item, self excluded)', () => {
    const s2 = computeItemFindingsForRule(INV_RULE, INV_ROWS, INV_WIN).find(f => f.loc === '0000002');
    expect(s2.value).toBeCloseTo(5, 6);
    expect(s2.pass).toBe(false);
    // storeBaseline's population for store 2's subject is "every OTHER store's rate for the SAME
    // wrin" -- only store 1 qualifies (W200's condiment row is pre-excluded, so it can never
    // pollute this population even though it's a different item entirely).
    expect(s2.baselineContext.values).toEqual([10]);
    expect(s2.baselineContext.memberCount).toBe(1);
  });

  it('converts YYYY-MM window bounds to real calendar-date finding bounds (window_start/window_end are `date` columns)', () => {
    const s1 = computeItemFindingsForRule(INV_RULE, INV_ROWS, INV_WIN).find(f => f.loc === '0000001');
    expect(s1.windowStart).toBe('2026-06-01');
    expect(s1.windowEnd).toBe('2026-07-31');
  });

  it('subject has no empToken at all -- emp_token stays null when this finding is upserted', () => {
    const s1 = computeItemFindingsForRule(INV_RULE, INV_ROWS, INV_WIN).find(f => f.loc === '0000001');
    expect(s1.empToken).toBeUndefined();
    expect(s1.wrin).toBe('W100');
  });
});

// ── Dispatch #42 -- z-score wiring test at the REAL call site, not just the engine ──────────────
// Standing rule (CLAUDE.md, #366): a test that only imports evaluateRule() can't tell "fixed" from
// "fixed but never wired in." This exercises computeItemFindingsForRule() end to end -- the
// baseline-before-evaluate reorder has to actually run for store A below to flag.
//
// 6 stores report the same item (W100, food, expUsage=100 each) in one period -- store A's
// variance (50, rate 50%) is a real outlier against 5 peers clustered at 8-12 (rates 8/9/11/12/10).
// Hand-computed: peer mean=10, stdev=sqrt(((8-10)^2+(9-10)^2+(11-10)^2+(12-10)^2+0^2)/5)=sqrt(2)
// ~= 1.4142 -> z for A = (50-10)/1.4142 ~= 28.28.
const Z_INV_ROWS = [
  { loc: '0000001', period: '2026-08', date: '2026-08', wrin: 'W100', cls: 'food', variance: 50, expUsage: 100 }, // A
  { loc: '0000002', period: '2026-08', date: '2026-08', wrin: 'W100', cls: 'food', variance: 8,  expUsage: 100 }, // B
  { loc: '0000003', period: '2026-08', date: '2026-08', wrin: 'W100', cls: 'food', variance: 9,  expUsage: 100 }, // C
  { loc: '0000004', period: '2026-08', date: '2026-08', wrin: 'W100', cls: 'food', variance: 11, expUsage: 100 }, // D
  { loc: '0000005', period: '2026-08', date: '2026-08', wrin: 'W100', cls: 'food', variance: 12, expUsage: 100 }, // E
  { loc: '0000006', period: '2026-08', date: '2026-08', wrin: 'W100', cls: 'food', variance: 10, expUsage: 100 }, // F
];
const Z_INV_RULE = {
  rule_id: 'INV-001', logic_type: 'z-score', baseline_type: 'store',
  data_required: ['qsr_variance_stat'],
  logic_expression: { numerator: { field: 'variance', agg: 'sum', abs: true }, denominator: { field: 'expUsage', agg: 'sum' }, scale: 100, comparator: 'gte', min_value: 20, min_denominator: 10 },
  threshold: { default: 2.5 }, method: 'Item TvA variance rate', severity: 3, weight: 1,
};
const Z_INV_WIN = { windowStart: '2026-08', windowEnd: '2026-08' };

describe('computeItemFindingsForRule() — z-score wiring (dispatch #42): the baseline reaches the verdict through the real call site', () => {
  it('store A (rate 50, a real outlier vs. 5 peers at 8-12) flags: z ~28.3 >= 2.5 AND value 50 >= min_value 20', () => {
    const a = computeItemFindingsForRule(Z_INV_RULE, Z_INV_ROWS, Z_INV_WIN).find(f => f.loc === '0000001');
    expect(a.value).toBeCloseTo(50, 6);
    expect(a.baselineContext.n).toBe(5); // 5 OTHER stores reporting the same wrin
    expect(a.baselineContext.mean).toBeCloseTo(10, 6);
    expect(a.pass).toBe(true);
    expect(a.explanation[0].zscore).toBeGreaterThan(2.5);
  });

  it("store B (rate 8) does NOT flag -- its own peer population is pulled noisy by A's outlier, but 8 is still on the LOW side of it (z negative)", () => {
    const b = computeItemFindingsForRule(Z_INV_RULE, Z_INV_ROWS, Z_INV_WIN).find(f => f.loc === '0000002');
    expect(b.value).toBeCloseTo(8, 6);
    expect(b.explanation[0].zscore).toBeLessThan(0);
    expect(b.pass).toBe(false);
  });

  it('proves the reorder matters: the SAME rule/row through the bare engine with no baseline degrades to an honest null, never a silent pass/fail', () => {
    const bare = evaluateRule(Z_INV_RULE, { qsr_variance_stat: [Z_INV_ROWS[0]] }, { loc: '0000001' });
    expect(bare.value).toBeCloseTo(50, 6); // the raw rate is still honestly reported
    expect(bare.pass).toBeNull();
    expect(bare.reason).toMatch(/no baseline/);
  });

  it('the min_denominator exposure floor reaches this call site too -- store A with expUsage crashed to 5 (< floor 10) nulls out instead of flagging', () => {
    const tinyExposure = Z_INV_ROWS.map(r => r.loc === '0000001' ? { ...r, expUsage: 5 } : r);
    const a = computeItemFindingsForRule(Z_INV_RULE, tinyExposure, Z_INV_WIN).find(f => f.loc === '0000001');
    expect(a.value).toBeNull();
    expect(a.pass).toBeNull();
  });
});

// ── Dispatch #42 §5 -- CASH-domain exposure floor, wiring test through computeFindingsForRule ───
// A rule with min_denominator set (matching schema-security-rules-phase1d.sql's real shape)
// nulls out a subject whose summed drawerSales falls below it, through the REAL call site.
const CASH_FLOOR_RULE = {
  rule_id: 'CASH-001', method: 'Cash drawer over/short rate', baseline_type: 'personal', severity: 3, weight: 1,
  data_required: ['audit_rows'],
  logic_type: 'ratio',
  logic_expression: { numerator: { field: 'cashOSDollar', agg: 'sum', abs: true }, denominator: { field: 'drawerSales', agg: 'sum' }, scale: 1000, comparator: 'gte', min_denominator: 250 },
  threshold: { default: 5 },
};
describe('computeFindingsForRule() — CASH-domain min_denominator exposure floor (dispatch #42 §5), through the real call site', () => {
  it('a subject whose summed drawerSales (200) is below the floor (250) gets an honest null, not a garbage rate', () => {
    const tinyDrawerRow = { loc: '0000001', emp: 'Dana', empToken: 'tok-dana', date: '2026-08-01', drawerSales: 200, cashOSDollar: -50 };
    const findings = computeFindingsForRule(CASH_FLOOR_RULE, [...ROWS, tinyDrawerRow], WIN);
    const dana = findings.find(f => f.empToken === 'tok-dana');
    expect(dana.value).toBeNull();
    expect(dana.pass).toBeNull();
  });
  it('Alice (drawerSales 2000, above the floor) still evaluates normally -- the floor does not touch subjects that clear it', () => {
    const findings = computeFindingsForRule(CASH_FLOOR_RULE, ROWS, WIN);
    const alice = findings.find(f => f.empToken === 'tok-alice');
    expect(alice.value).toBeCloseTo(4, 6);
  });
});
