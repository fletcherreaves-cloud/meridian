// @ts-nocheck
// scripts/security-rules-run.mjs (dispatch #39, extended #40) -- the Phase 1/1b batch job's pure
// compute core. No Supabase dependency in these functions themselves, same testing precedent as
// dispatch #35's mapRow() and dispatch #36's evaluateRule()/baseline fixtures -- hand-computed
// expected values in each test's own comment, not assumed.
import { describe, it, expect } from 'vitest';
import {
  mapAuditRow, supportsAuditRows, fieldsFromExpr, computeFindingsForRule, buildExplanation,
  dataRequiredList, supportsVarianceStat, mapVarianceStatRow, joinStoreMonthSales, periodEndDate,
  computeItemFindingsForRule, classifyLifecycle, computeWasteExoneration,
  supportsWasteDaypart, daypartFromBusnTm, mapWasteRow, mapDailyActivityRow,
  buildDaypartSalesIndex, joinWasteDaypartSales, computeManagerDaypartFindingsForRule,
} from '../../scripts/security-rules-run.mjs';
import { evaluateRule } from '../engine/security-rules.js';

describe('mapAuditRow() — snake_case DB row -> camelCase, matching dispatch #39\'s own field table', () => {
  it('maps every column named in the dispatch, including emp_token -> empToken', () => {
    const r = mapAuditRow({
      loc: '0043380', date: '2026-08-01', emp: 'Aaden W', emp_token: 'tok-aaden',
      drawer_sales: 1000, drawer_gc: 100, cash_os_dollar: -6,
      pos_over_cnt: 2, pos_over_amt: 3.5, manual_ref_amt: 12.75, manual_ref_cnt: 1,
      refund_cash: 8, refund_cashless: 4.5, refund_cnt: 3,
      promo_amt: 42.1, t_red_a_cnt: 1, t_red_a_dollar: 5.99, t_red_b_cnt: 4, t_red_b_dollar: 18.4,
    });
    expect(r).toMatchObject({
      loc: '0043380', emp: 'Aaden W', empToken: 'tok-aaden',
      drawerSales: 1000, drawerGC: 100, cashOSDollar: -6,
      posOverCnt: 2, posOverAmt: 3.5, manualRefAmt: 12.75, manualRefCnt: 1,
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

// Dispatch #59's own consumer audit concluded computeFindingsForRule() needs NO code change --
// subjectRows already includes every register-type row for an (loc,empToken) pair, and
// evaluateRule() sums numerator/denominator across all of them, which is the CORRECT behaviour
// (separate drawers genuinely sum). This is that conclusion, reproduced empirically through the
// real call site rather than trusted from reading -- per CLAUDE.md's "a reviewer's root cause is
// a hypothesis, reproduce it" rule. Adds a Manager-register row for Alice on her EXISTING
// 2026-08-01 date, so this also exercises personalBaseline()'s collapse fix end-to-end: the new
// row must combine with her Cashier row into ONE day's rate, not add a third observation.
describe('computeFindingsForRule() — register_type rows sum correctly through the real call site (dispatch #59)', () => {
  const ALICE_MANAGER_ROW = { loc: '0000001', emp: 'Alice', empToken: 'tok-alice', registerType: 'manager', date: '2026-08-01', drawerSales: 1000, drawerGC: 100, cashOSDollar: -10, posOverCnt: 0 };
  const ROWS_WITH_MANAGER = [...ROWS, ALICE_MANAGER_ROW];

  it("value sums cashOSDollar/drawerSales across BOTH register types: (6+10+2)/(1000+1000+1000)*1000 = 6, not the cashier-only 4", () => {
    const f = computeFindingsForRule(RULE_A, ROWS_WITH_MANAGER, WIN).find(x => x.empToken === 'tok-alice');
    expect(f.value).toBeCloseTo(6, 6);
  });

  it("personalBaseline collapses the two 2026-08-01 rows (cashier -6/1000, manager -10/1000) into ONE day's combined rate (16/2000*1000=8), so n stays 2 (two DAYS: 08-01 combined, 08-02), not 3 (three rows)", () => {
    const f = computeFindingsForRule(RULE_A, ROWS_WITH_MANAGER, WIN).find(x => x.empToken === 'tok-alice');
    expect(f.baselineContext.n).toBe(2);
    expect(f.baselineContext.mean).toBeCloseTo(5, 6);   // (8 + 2) / 2
    expect(f.baselineContext.stdev).toBeCloseTo(3, 6);  // sqrt(((8-5)^2+(2-5)^2)/2) = sqrt(9) = 3
  });

  it("Bob (untouched by the new Manager row) is unaffected -- still value=6, pass=true", () => {
    const f = computeFindingsForRule(RULE_A, ROWS_WITH_MANAGER, WIN).find(x => x.empToken === 'tok-bob');
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

  // dispatch #46 (engineer queue) -- unexplainedVariance/positiveVariance, the two derived fields
  // INV-003/INV-005 read. variance=8 (positive: actual usage came in BELOW theoretical, a "gain"),
  // waste sums to 3 -> unexplained = |8| - 3 = 5. positiveVariance = max(0, 8) = 8.
  it('unexplainedVariance = |variance| - waste, floored at 0 -- not negative when waste exceeds variance', () => {
    const covered = mapVarianceStatRow({ loc: '1', period: '2026-07', wrin: 'W1', variance: 8, raw_waste: 1, comp_waste: 2 });
    expect(covered.unexplainedVariance).toBeCloseTo(5, 6); // 8 - (1+2)

    const overCovered = mapVarianceStatRow({ loc: '1', period: '2026-07', wrin: 'W1', variance: 3, raw_waste: 10, comp_waste: 0 });
    expect(overCovered.unexplainedVariance).toBe(0); // waste (10) exceeds |variance| (3) -- floored, not -7

    const noWaste = mapVarianceStatRow({ loc: '1', period: '2026-07', wrin: 'W1', variance: -8, raw_waste: null, comp_waste: null });
    expect(noWaste.unexplainedVariance).toBeCloseTo(8, 6); // |−8| − 0, null waste treated as 0, never NaN
  });

  it('positiveVariance keeps only the gain direction -- zero for every shrink-side (negative/zero) row, never negative itself', () => {
    expect(mapVarianceStatRow({ loc: '1', period: '2026-07', wrin: 'W1', variance: 8 }).positiveVariance).toBeCloseTo(8, 6);
    expect(mapVarianceStatRow({ loc: '1', period: '2026-07', wrin: 'W1', variance: -8 }).positiveVariance).toBe(0);
    expect(mapVarianceStatRow({ loc: '1', period: '2026-07', wrin: 'W1', variance: 0 }).positiveVariance).toBe(0);
  });

  it('both derived fields are null (not 0 or NaN) when variance itself is null -- an honest "no data," not a fabricated zero', () => {
    const r = mapVarianceStatRow({ loc: '1', period: '2026-07', wrin: 'W1', variance: null });
    expect(r.unexplainedVariance).toBeNull();
    expect(r.positiveVariance).toBeNull();
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

  // dispatch #45 §A -- min_numerator wiring at the real call site, mirroring INV-002's own shape
  // (no min_value set, mirrors the real rule post-PR-481-review). Store A's numerator (variance,
  // abs-summed) is 50 -- statistically a real outlier (z ~28.3) but if the floor sits above 50,
  // that outlier must NOT flag.
  it('min_numerator reaches this call site too -- store A is a real z-score outlier but its numerator (50) is below a 60 floor, so it reads pass:false, not a null and not a silent flag', () => {
    const rule = { ...Z_INV_RULE, logic_expression: { ...Z_INV_RULE.logic_expression, min_value: null, min_numerator: 60 } };
    const a = computeItemFindingsForRule(rule, Z_INV_ROWS, Z_INV_WIN).find(f => f.loc === '0000001');
    expect(a.value).toBeCloseTo(50, 6);
    expect(a.explanation[0].zscore).toBeGreaterThan(2.5); // still statistically unusual...
    expect(a.pass).toBe(false); // ...but 50 < min_numerator 60, so a decided clear
  });

  it('the same store flags once min_numerator sits at or below its real numerator (50)', () => {
    const rule = { ...Z_INV_RULE, logic_expression: { ...Z_INV_RULE.logic_expression, min_value: null, min_numerator: 50 } };
    const a = computeItemFindingsForRule(rule, Z_INV_ROWS, Z_INV_WIN).find(f => f.loc === '0000001');
    expect(a.pass).toBe(true);
  });

  // dispatch #45 §A, second cause -- min_stdev wiring at the real call site. Peers B-F cluster
  // TIGHTLY (rates 0.99-1.01, a real but tiny stdev ~0.0071) -- store A's rate (5.0) is genuinely
  // far from that cluster, so a naive z (~565) reads as an absurd outlier driven by the peer
  // population's own near-zero spread, not by A's behavior. This is the exact live pattern
  // dispatch #45 §A recorded (a stdev that rounds to 0.00 on screen but is not literally zero).
  const TIGHT_ROWS = [
    { loc: '0000001', period: '2026-08', date: '2026-08', wrin: 'W200', cls: 'food', variance: 50,   expUsage: 1000 }, // A: rate 5.0
    { loc: '0000002', period: '2026-08', date: '2026-08', wrin: 'W200', cls: 'food', variance: 10.0,  expUsage: 1000 }, // rate 1.00
    { loc: '0000003', period: '2026-08', date: '2026-08', wrin: 'W200', cls: 'food', variance: 10.1,  expUsage: 1000 }, // rate 1.01
    { loc: '0000004', period: '2026-08', date: '2026-08', wrin: 'W200', cls: 'food', variance: 9.9,   expUsage: 1000 }, // rate 0.99
    { loc: '0000005', period: '2026-08', date: '2026-08', wrin: 'W200', cls: 'food', variance: 10.05, expUsage: 1000 }, // rate 1.005
    { loc: '0000006', period: '2026-08', date: '2026-08', wrin: 'W200', cls: 'food', variance: 9.95,  expUsage: 1000 }, // rate 0.995
  ];

  it('min_stdev reaches this call site too -- a tightly-clustered peer population (real, non-zero stdev ~0.007) nulls out instead of producing an absurd z-score', () => {
    const rule = { ...Z_INV_RULE, logic_expression: { ...Z_INV_RULE.logic_expression, min_value: null, min_stdev: 0.05 } };
    const a = computeItemFindingsForRule(rule, TIGHT_ROWS, Z_INV_WIN).find(f => f.loc === '0000001');
    expect(a.value).toBeCloseTo(5, 6); // the raw rate is still honestly reported
    expect(a.pass).toBeNull(); // NOT flagged, despite a naive z in the hundreds
    expect(a.explanation[0].label).toMatch(/degenerate baseline/);
  });

  it('the SAME degenerate baseline flags without min_stdev set -- proving the guard, not the data, changed the outcome', () => {
    const rule = { ...Z_INV_RULE, logic_expression: { ...Z_INV_RULE.logic_expression, min_value: null } }; // no min_stdev
    const a = computeItemFindingsForRule(rule, TIGHT_ROWS, Z_INV_WIN).find(f => f.loc === '0000001');
    expect(a.pass).toBe(true);
    expect(a.explanation[0].zscore).toBeGreaterThan(100); // the absurd z this dispatch exists to catch
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

// ── Dispatch #44 -- CASH-003 re-expressed as a count rule, wiring test at the real call site ────
// Mirrors schema-security-rules-phase1e.sql's real logic_expression exactly (manualRefCnt/drawerGC,
// scale 1000, min_denominator 25) -- the same shape CASH-002 already uses (posOverCnt/drawerGC),
// swapped to the manual-refund count field. threshold is intentionally omitted here too, matching
// the migration's own choice (no measured range exists yet) -- so this test proves the SHAPE is
// wired correctly (a real count produces a real rate, honored by the min_denominator floor) without
// pretending a threshold exists to cross.
const CASH003_COUNT_RULE = {
  rule_id: 'CASH-003', method: 'Manual refund / self-authorized refund rate', baseline_type: 'personal', severity: 3, weight: 1,
  data_required: ['audit_rows'],
  logic_type: 'ratio',
  logic_expression: { numerator: { field: 'manualRefCnt', agg: 'sum' }, denominator: { field: 'drawerGC', agg: 'sum' }, scale: 1000, comparator: 'gte', min_denominator: 25 },
  threshold: {},
};
describe('computeFindingsForRule() — CASH-003 re-expressed as a count rule (dispatch #44), through the real call site', () => {
  it('a subject with 2 manual refunds across 200 transactions rates 10 per 1,000 -- the count numerator reaches the real call site, not just the engine', () => {
    const rows = [
      { loc: '0000001', emp: 'Eve', empToken: 'tok-eve', date: '2026-08-01', drawerGC: 100, manualRefCnt: 1 },
      { loc: '0000001', emp: 'Eve', empToken: 'tok-eve', date: '2026-08-02', drawerGC: 100, manualRefCnt: 1 },
    ];
    const findings = computeFindingsForRule(CASH003_COUNT_RULE, rows, WIN);
    const eve = findings.find(f => f.empToken === 'tok-eve');
    expect(eve.value).toBeCloseTo(10, 6); // (1+1)/200*1000
  });

  it('with no threshold configured (the real migration\'s own choice -- no measured range exists yet), the verdict is an honest undetermined null, never a fabricated pass/fail', () => {
    const rows = [{ loc: '0000001', emp: 'Eve', empToken: 'tok-eve', date: '2026-08-01', drawerGC: 100, manualRefCnt: 1 }];
    const findings = computeFindingsForRule(CASH003_COUNT_RULE, rows, WIN);
    const eve = findings.find(f => f.empToken === 'tok-eve');
    expect(eve.value).toBeCloseTo(10, 6);
    expect(eve.pass).toBeNull();
  });

  it('the min_denominator floor (25 transactions, matching CASH-002\'s own value now that the denominator is the same field) still applies -- a subject below it nulls out, not a garbage rate', () => {
    const rows = [{ loc: '0000001', emp: 'Frank', empToken: 'tok-frank', date: '2026-08-01', drawerGC: 10, manualRefCnt: 1 }];
    const findings = computeFindingsForRule(CASH003_COUNT_RULE, rows, WIN);
    const frank = findings.find(f => f.empToken === 'tok-frank');
    expect(frank.value).toBeNull();
  });

  it('a subject with zero manual refunds (the overwhelming majority, per the real measured distribution) rates exactly 0, not null -- distinct from "no exposure"', () => {
    const rows = [{ loc: '0000001', emp: 'Grace', empToken: 'tok-grace', date: '2026-08-01', drawerGC: 100, manualRefCnt: 0 }];
    const findings = computeFindingsForRule(CASH003_COUNT_RULE, rows, WIN);
    const grace = findings.find(f => f.empToken === 'tok-grace');
    expect(grace.value).toBe(0);
  });
});

// ── Dispatch #45 §B -- lifecycle routing: classifyLifecycle() + wiring through
// computeItemFindingsForRule(). Real markers from qsr_variance_stat.descr, per
// memory/analysis-zscore-dry-run-2026-08-20.md's own measured share (22 deactivated, 2 obsolete,
// 2 new of INV-001's 188 real flags).
describe('classifyLifecycle() — pure, from a real qsr_variance_stat.descr string', () => {
  it('recognizes the three real markers', () => {
    expect(classifyLifecycle('Beef Patty (Deactivated)')).toBe('deactivated');
    expect(classifyLifecycle('New Sauce Cup (New)')).toBe('new');
    expect(classifyLifecycle('Old Wrapper (Obsolete 14 days left)')).toBe('obsolete');
  });
  it('returns null for an ordinary, unmarked descr -- the 86.2% majority, not an error case', () => {
    expect(classifyLifecycle('Big Mac Bun')).toBeNull();
  });
  it('returns null, never throws, for missing/empty descr', () => {
    expect(classifyLifecycle(null)).toBeNull();
    expect(classifyLifecycle(undefined)).toBeNull();
    expect(classifyLifecycle('')).toBeNull();
  });
  it('is case-insensitive and does not require the marker to be the whole string', () => {
    expect(classifyLifecycle('SOME ITEM (deactivated) - discontinued')).toBe('deactivated');
  });
});

describe('computeItemFindingsForRule() — lifecycle routing wired at the real call site (dispatch #45 §B)', () => {
  const LIFECYCLE_ROWS = [
    { loc: '0000001', period: '2026-08', date: '2026-08', wrin: 'W100', cls: 'food', descr: 'Beef Patty (Deactivated)', variance: 50, expUsage: 100 },
    { loc: '0000002', period: '2026-08', date: '2026-08', wrin: 'W100', cls: 'food', descr: 'Beef Patty', variance: 8, expUsage: 100 },
  ];
  const RULE = {
    rule_id: 'INV-001', logic_type: 'ratio', baseline_type: 'store',
    data_required: ['qsr_variance_stat'],
    logic_expression: { numerator: { field: 'variance', agg: 'sum', abs: true }, denominator: { field: 'expUsage', agg: 'sum' }, scale: 100, comparator: 'gte' },
    threshold: { default: 10 }, method: 'Item TvA variance rate', severity: 3, weight: 1,
  };
  const WIN = { windowStart: '2026-08', windowEnd: '2026-08' };

  it('a deactivated item is classified on its finding, without altering its real verdict/value', () => {
    const a = computeItemFindingsForRule(RULE, LIFECYCLE_ROWS, WIN).find(f => f.loc === '0000001');
    expect(a.lifecycleCategory).toBe('deactivated');
    expect(a.value).toBeCloseTo(50, 6); // routed, not suppressed -- the real finding survives intact
    expect(a.pass).toBe(true); // still a real, decided verdict against its own threshold
  });

  it('an unmarked item classifies to null -- the majority path, not a missing-data error', () => {
    const b = computeItemFindingsForRule(RULE, LIFECYCLE_ROWS, WIN).find(f => f.loc === '0000002');
    expect(b.lifecycleCategory).toBeNull();
  });
});

// ── Dispatch #46 §C item 6 -- automatic exoneration: computeWasteExoneration() + wiring ──────────
describe('computeWasteExoneration() — pure, from a subject\'s own qsr_variance_stat rows', () => {
  it('share = totalWaste / totalVariance, summed across all rows for the subject', () => {
    const rows = [
      { variance: 40, rawWaste: 10, compWaste: 5 },
      { variance: -10, rawWaste: 0, compWaste: 3 }, // variance sign doesn't matter -- abs-summed
    ];
    // totalVariance = |40| + |-10| = 50. totalWaste = 10+5+0+3 = 18. share = 18/50 = 0.36.
    const r = computeWasteExoneration(rows);
    expect(r.totalVariance).toBeCloseTo(50, 6);
    expect(r.totalWaste).toBeCloseTo(18, 6);
    expect(r.share).toBeCloseTo(0.36, 6);
  });
  it('returns null when there is no variance to explain -- share against a zero denominator is meaningless, not zero', () => {
    expect(computeWasteExoneration([{ variance: 0, rawWaste: 5, compWaste: 0 }])).toBeNull();
    expect(computeWasteExoneration([])).toBeNull();
  });
  it('treats missing/null waste fields as zero, never throws', () => {
    const r = computeWasteExoneration([{ variance: 10, rawWaste: null, compWaste: undefined }]);
    expect(r.totalWaste).toBe(0);
    expect(r.share).toBe(0);
  });
});

describe('computeItemFindingsForRule() — exoneration wiring (dispatch #46 §C item 6)', () => {
  // Store A: same outlier fixture as the z-score wiring tests above (variance 50, real flag). Add
  // waste fields covering more than half of it.
  const rows = Z_INV_ROWS.map(r => r.loc === '0000001'
    ? { ...r, rawWaste: 20, compWaste: 10 } // 30 of 50 variance covered -> share 0.6
    : { ...r, rawWaste: 0, compWaste: 0 });

  it('a flagged subject with logged waste covering the variance carries a real exonerationShare', () => {
    const a = computeItemFindingsForRule(Z_INV_RULE, rows, Z_INV_WIN).find(f => f.loc === '0000001');
    expect(a.pass).toBe(true);
    expect(a.exonerationShare).toBeCloseTo(0.6, 6);
  });

  it('a subject that does NOT flag (pass:false) carries exonerationShare:null -- nothing to exonerate against a non-flag', () => {
    const b = computeItemFindingsForRule(Z_INV_RULE, rows, Z_INV_WIN).find(f => f.loc === '0000002');
    expect(b.pass).toBe(false);
    expect(b.exonerationShare).toBeNull();
  });
});

// ── Engineer queue -- INV-003 (waste-unexplained) + INV-005 (phantom gains) wiring ───────────────
// Both reuse computeItemFindingsForRule() end to end -- no new call site, only new numerator
// fields (unexplainedVariance / positiveVariance) a rule's logic_expression can now name.

describe('computeItemFindingsForRule() — INV-003 wiring: numerator reads unexplainedVariance, not raw variance', () => {
  const INV003_RULE = {
    rule_id: 'INV-003', logic_type: 'z-score', baseline_type: 'store',
    data_required: ['qsr_variance_stat'],
    logic_expression: { numerator: { field: 'unexplainedVariance', agg: 'sum' }, denominator: { field: 'expUsage', agg: 'sum' }, scale: 100, comparator: 'gte', min_value: 15, min_denominator: 10, min_stdev: 1 },
    threshold: { default: 2.5 }, method: 'Variance unmatched by logged waste', severity: 3, weight: 1,
  };
  // Store A: variance 50, waste 30 -> unexplainedVariance 20. Peers B-F: variance 8/9/11/12/10, no
  // waste -> unexplainedVariance equals their own variance (waste doesn't touch them). Peer mean=10,
  // stdev=sqrt(2)~=1.4142 (same hand-computed peer stats as the INV-001 z-score wiring test above).
  const ROWS = [
    { loc: '0000001', period: '2026-08', date: '2026-08', wrin: 'W300', cls: 'food', variance: 50, expUsage: 100, rawWaste: 20, compWaste: 10 },
    { loc: '0000002', period: '2026-08', date: '2026-08', wrin: 'W300', cls: 'food', variance: 8,  expUsage: 100 },
    { loc: '0000003', period: '2026-08', date: '2026-08', wrin: 'W300', cls: 'food', variance: 9,  expUsage: 100 },
    { loc: '0000004', period: '2026-08', date: '2026-08', wrin: 'W300', cls: 'food', variance: 11, expUsage: 100 },
    { loc: '0000005', period: '2026-08', date: '2026-08', wrin: 'W300', cls: 'food', variance: 12, expUsage: 100 },
    { loc: '0000006', period: '2026-08', date: '2026-08', wrin: 'W300', cls: 'food', variance: 10, expUsage: 100 },
  ].map(r => ({ ...r, unexplainedVariance: Math.max(0, Math.abs(r.variance) - ((r.rawWaste || 0) + (r.compWaste || 0))), positiveVariance: Math.max(0, r.variance) }));
  const WIN = { windowStart: '2026-08', windowEnd: '2026-08' };

  it('store A reads value=20 (unexplainedVariance, NOT the raw variance of 50), and still flags -- a real outlier even after waste is subtracted', () => {
    const a = computeItemFindingsForRule(INV003_RULE, ROWS, WIN).find(f => f.loc === '0000001');
    expect(a.value).toBeCloseTo(20, 6);
    expect(a.pass).toBe(true);
  });

  // Dispatch #48's own instruction: reuse exoneration_share rather than add a column. This proves
  // it through computeItemFindingsForRule() itself (not just cited as a fact) -- the field the
  // batch job later persists as security_findings.exoneration_share is already populated for a
  // flagged INV-003 subject, with zero rule-specific code: computeItemFindingsForRule() gates it
  // only on evalResult.pass === true, same as every other flagged INV rule.
  it('a flagged INV-003 subject gets exonerationShare populated automatically -- no INV-003-specific code path, the same generic gate every INV rule already runs through', () => {
    const a = computeItemFindingsForRule(INV003_RULE, ROWS, WIN).find(f => f.loc === '0000001');
    // variance 50, waste 30 -> exoneration share = waste/|variance| = 30/50 = 0.6.
    expect(a.exonerationShare).toBeCloseTo(0.6, 6);
  });

  it('the SAME variance (50) does NOT flag once waste fully covers it -- proving the rule reads unexplainedVariance through the real call site, not raw variance', () => {
    const fullyCovered = ROWS.map(r => r.loc === '0000001' ? { ...r, rawWaste: 50, compWaste: 0, unexplainedVariance: 0 } : r);
    const a = computeItemFindingsForRule(INV003_RULE, fullyCovered, WIN).find(f => f.loc === '0000001');
    expect(a.value).toBe(0);
    expect(a.pass).toBe(false); // z is negative (0 is below peer mean 10) -- a real clear, not a flag
  });
});

describe('computeItemFindingsForRule() — INV-005 wiring: numerator reads positiveVariance, zeroing out every shrink-side subject', () => {
  const INV005_RULE = {
    rule_id: 'INV-005', logic_type: 'z-score', baseline_type: 'store',
    data_required: ['qsr_variance_stat'],
    logic_expression: { numerator: { field: 'positiveVariance', agg: 'sum' }, denominator: { field: 'expUsage', agg: 'sum' }, scale: 100, comparator: 'gte', min_value: 15, min_denominator: 10, min_stdev: 1 },
    threshold: { default: 2.5 }, method: 'Unexplained positive inventory adjustment', severity: 3, weight: 1,
  };
  // Store A: a real gain (variance +50). Peers mixed: two shrink-side (negative, -> positiveVariance
  // 0), three small gains (11, 12, 10) -- exactly the "mostly zero, a few real gains" shape
  // dispatch #46's own migration header measured as the degenerate-stdev risk this rule is built to
  // survive (min_stdev:1 is set on the rule; these peer stats aren't degenerate, so it should NOT gate).
  const ROWS = [
    { loc: '0000001', period: '2026-08', date: '2026-08', wrin: 'W400', cls: 'food', variance: 50,  expUsage: 100 },
    { loc: '0000002', period: '2026-08', date: '2026-08', wrin: 'W400', cls: 'food', variance: -8,  expUsage: 100 },
    { loc: '0000003', period: '2026-08', date: '2026-08', wrin: 'W400', cls: 'food', variance: -9,  expUsage: 100 },
    { loc: '0000004', period: '2026-08', date: '2026-08', wrin: 'W400', cls: 'food', variance: 11,  expUsage: 100 },
    { loc: '0000005', period: '2026-08', date: '2026-08', wrin: 'W400', cls: 'food', variance: 12,  expUsage: 100 },
    { loc: '0000006', period: '2026-08', date: '2026-08', wrin: 'W400', cls: 'food', variance: 10,  expUsage: 100 },
  ].map(r => ({ ...r, unexplainedVariance: Math.abs(r.variance), positiveVariance: Math.max(0, r.variance) }));
  const WIN = { windowStart: '2026-08', windowEnd: '2026-08' };

  it('store A (a real +50 gain) reads value=50 (positiveVariance), and its shrink-side peers (-8,-9) contribute 0 to the peer population, not their raw negative variance', () => {
    const a = computeItemFindingsForRule(INV005_RULE, ROWS, WIN).find(f => f.loc === '0000001');
    expect(a.value).toBeCloseTo(50, 6);
    // Peer mean over [0,0,11,12,10] = 6.6, clearly below store A's 50 -- a real, large z.
    expect(a.explanation[0].baseline_mean).toBeCloseTo(6.6, 6);
  });

  it('a shrink-side peer (variance -8) itself reads value=0 (positiveVariance floors negative variance), and does not flag', () => {
    const b = computeItemFindingsForRule(INV005_RULE, ROWS, WIN).find(f => f.loc === '0000002');
    expect(b.value).toBe(0);
    expect(b.pass).toBe(false);
  });
});

// ── Dispatch #48/#50 lineage -- INV-004 (waste-log padding, manager x day-part x store) ──────────

describe('supportsWasteDaypart() — requires BOTH qsr_waste and qsr_daily_activity, neither alone', () => {
  it('true only when both data sources are named', () => {
    expect(supportsWasteDaypart({ data_required: ['qsr_waste', 'qsr_daily_activity'] })).toBe(true);
    expect(supportsWasteDaypart({ data_required: ['qsr_waste'] })).toBe(false);
    expect(supportsWasteDaypart({ data_required: ['qsr_daily_activity'] })).toBe(false);
    expect(supportsWasteDaypart({ data_required: ['audit_rows'] })).toBe(false);
  });
});

describe('daypartFromBusnTm() — wraps a wall-clock hour into daypartOf()\'s own 05:00->28:00 shape, never a second boundary set', () => {
  it('daytime hours map straight through to daypartOf()\'s own buckets', () => {
    expect(daypartFromBusnTm('10:30:00')).toBe('Breakfast');
    expect(daypartFromBusnTm('13:00:00')).toBe('Lunch');
    expect(daypartFromBusnTm('16:15:00')).toBe('Afternoon');
    expect(daypartFromBusnTm('20:00:00')).toBe('Dinner');
    expect(daypartFromBusnTm('23:59:00')).toBe('Dinner');
  });
  it('the 00:00-03:59 tail wraps to Late Night (hour+24), matching the DAR\'s own wrapped hour_slot convention, not a fresh calendar-day bucket', () => {
    expect(daypartFromBusnTm('02:30:00')).toBe('Late Night');
    expect(daypartFromBusnTm('00:05:00')).toBe('Late Night');
  });
  it('05:00 itself is Late Night too, same as daypartOf(\'05:00\') directly', () => {
    expect(daypartFromBusnTm('05:00:00')).toBe('Late Night');
  });
  it('a malformed/missing busn_tm returns null, never a guessed daypart', () => {
    expect(daypartFromBusnTm(null)).toBeNull();
    expect(daypartFromBusnTm('')).toBeNull();
  });
});

describe('mapWasteRow() — snake_case qsr_waste row -> camelCase, reads emp_token only, never the plaintext manager eID', () => {
  it('maps busn_dt/busn_tm/amount/emp_token and computes daypart, and does NOT expose manager', () => {
    const r = mapWasteRow({ loc: '0006178', busn_dt: '2026-07-30', busn_tm: '19:57:20', amount: 24.7, manager: 'Crystal C - eo360686', emp_token: 'tok-crystal' });
    expect(r).toEqual({ loc: '0006178', date: '2026-07-30', busnTm: '19:57:20', empToken: 'tok-crystal', amount: 24.7, wtype: undefined, daypart: 'Dinner' });
    expect(r.manager).toBeUndefined();
  });
});

describe('mapDailyActivityRow()', () => {
  it('maps loc/dt/hour_slot/product_sales', () => {
    expect(mapDailyActivityRow({ loc: '0006178', dt: '2026-07-30', hour_slot: '19:00', product_sales: 150.5 }))
      .toEqual({ loc: '0006178', date: '2026-07-30', hourSlot: '19:00', productSales: 150.5 });
  });
});

describe('buildDaypartSalesIndex() — sums product_sales per (loc,date,daypart), pooling every hour_slot in that day-part', () => {
  it('two Breakfast hour slots sum into one bucket; a Dinner slot stays separate', () => {
    const rows = [
      mapDailyActivityRow({ loc: 'A', dt: '2026-08-01', hour_slot: '06:00', product_sales: 100 }),
      mapDailyActivityRow({ loc: 'A', dt: '2026-08-01', hour_slot: '07:00', product_sales: 50 }),
      mapDailyActivityRow({ loc: 'A', dt: '2026-08-01', hour_slot: '19:00', product_sales: 80 }),
    ];
    const idx = buildDaypartSalesIndex(rows);
    expect(idx.get('A::2026-08-01::Breakfast')).toBe(150);
    expect(idx.get('A::2026-08-01::Dinner')).toBe(80);
    expect(idx.size).toBe(2);
  });
});

describe('joinWasteDaypartSales() — aggregates waste by (loc,date,daypart,empToken), attaches the sales bucket ONCE per date, drops what it cannot price', () => {
  const salesIdx = new Map([['A::2026-08-01::Dinner', 1000]]);

  it('two waste rows for the same manager/date/day-part sum into one aggregated row, sharing one sales figure (not doubled)', () => {
    const rows = [
      mapWasteRow({ loc: 'A', busn_dt: '2026-08-01', busn_tm: '19:00:00', amount: 10, emp_token: 'tok-x' }),
      mapWasteRow({ loc: 'A', busn_dt: '2026-08-01', busn_tm: '20:30:00', amount: 15, emp_token: 'tok-x' }),
    ];
    const out = joinWasteDaypartSales(rows, salesIdx);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ loc: 'A', date: '2026-08-01', daypart: 'Dinner', empToken: 'tok-x', wasteAmt: 25, daypartSales: 1000 });
  });

  it('a waste row with no matching sales bucket is dropped, not carried forward with a null denominator', () => {
    const rows = [mapWasteRow({ loc: 'A', busn_dt: '2026-08-02', busn_tm: '19:00:00', amount: 10, emp_token: 'tok-x' })];
    expect(joinWasteDaypartSales(rows, salesIdx)).toHaveLength(0);
  });

  it('a waste row with no emp_token (pre-backfill) is dropped -- cannot attribute an unattributable finding', () => {
    const rows = [mapWasteRow({ loc: 'A', busn_dt: '2026-08-01', busn_tm: '19:00:00', amount: 10, emp_token: null })];
    expect(joinWasteDaypartSales(rows, salesIdx)).toHaveLength(0);
  });
});

describe('computeManagerDaypartFindingsForRule() — the third subject grain (loc, empToken, daypart), storeBaseline pre-filtered to the SAME daypart', () => {
  const INV004_RULE = {
    rule_id: 'INV-004', logic_type: 'z-score', baseline_type: 'store',
    data_required: ['qsr_waste', 'qsr_daily_activity'],
    logic_expression: { numerator: { field: 'wasteAmt', agg: 'sum' }, denominator: { field: 'daypartSales', agg: 'sum' }, scale: 1000, comparator: 'gte', min_value: 13, min_denominator: 250, min_stdev: 1 },
    threshold: { default: 2.5 }, method: 'Waste $ per day-part sales $, by manager', severity: 3, weight: 1,
  };
  // Store A (target manager, Dinner): wasteAmt=50, daypartSales=1000 -> value=50. Peer stores
  // B-F (same daypart, different stores): wasteAmt/daypartSales = 8/9/11/12/10 per $1,000 -- same
  // hand-computed peer stats as every other z-score wiring test in this file (mean=10,
  // stdev=sqrt(2)~=1.4142). z = (50-10)/1.4142 ~= 28.3, comfortably >= threshold 2.5.
  const ROWS = [
    { loc: 'A', date: '2026-08-01', daypart: 'Dinner', empToken: 'tok-mgr1', wasteAmt: 50, daypartSales: 1000 },
    { loc: 'B', date: '2026-08-01', daypart: 'Dinner', empToken: 'tok-mgr2', wasteAmt: 8,  daypartSales: 1000 },
    { loc: 'C', date: '2026-08-01', daypart: 'Dinner', empToken: 'tok-mgr3', wasteAmt: 9,  daypartSales: 1000 },
    { loc: 'D', date: '2026-08-01', daypart: 'Dinner', empToken: 'tok-mgr4', wasteAmt: 11, daypartSales: 1000 },
    { loc: 'E', date: '2026-08-01', daypart: 'Dinner', empToken: 'tok-mgr5', wasteAmt: 12, daypartSales: 1000 },
    { loc: 'F', date: '2026-08-01', daypart: 'Dinner', empToken: 'tok-mgr6', wasteAmt: 10, daypartSales: 1000 },
    // Store A's SAME manager, a DIFFERENT day-part (Breakfast) -- a separate subject entirely, and
    // it must not pollute Store A's own Dinner peer computation or vice versa. Its own value (5) is
    // below min_value (13), so it should never flag regardless of peers.
    { loc: 'A', date: '2026-08-01', daypart: 'Breakfast', empToken: 'tok-mgr1', wasteAmt: 5, daypartSales: 500 },
  ];
  const WIN = { windowStart: '2026-08-01', windowEnd: '2026-08-28' };

  it('Store A/Dinner subject reads value=50 and flags -- a real outlier against same-daypart peer stores', () => {
    const findings = computeManagerDaypartFindingsForRule(INV004_RULE, ROWS, WIN);
    const a = findings.find(f => f.loc === 'A' && f.daypart === 'Dinner');
    expect(a.empToken).toBe('tok-mgr1');
    expect(a.value).toBeCloseTo(50, 6);
    expect(a.pass).toBe(true);
    expect(a.baselineContext.mean).toBeCloseTo(10, 6);
    expect(a.baselineContext.stdev).toBeCloseTo(Math.sqrt(2), 4);
  });

  it('the SAME manager\'s Breakfast subject at Store A is a SEPARATE finding with its own value -- no peer stores exist for Breakfast in this fixture, so it reads an honest pass:null (insufficient baseline population), never merged with the Dinner subject\'s peer stats', () => {
    const findings = computeManagerDaypartFindingsForRule(INV004_RULE, ROWS, WIN);
    const breakfast = findings.find(f => f.loc === 'A' && f.daypart === 'Breakfast');
    expect(breakfast).toBeTruthy();
    expect(breakfast.value).toBeCloseTo(10, 6); // 5/500*1000
    expect(breakfast.pass).toBeNull(); // no peer stores for Breakfast at all -- honest null, not a guessed false
  });

  it('produces exactly one finding per (loc, empToken, daypart) triple -- 7 rows in, 7 subjects out (no cross-daypart or cross-store merging)', () => {
    const findings = computeManagerDaypartFindingsForRule(INV004_RULE, ROWS, WIN);
    expect(findings).toHaveLength(7);
  });
});
