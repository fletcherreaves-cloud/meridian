// @ts-nocheck
// Interpreter (src/engine/security-rules.js) round-tripped against real rule shapes from
// supabase/schema-security-rules.sql's own seed rows (CASH-001, CASH-002) -- not invented
// fixtures, the actual LOGIC_EXPRESSION JSON this dispatch ships to the database. Hand-computed
// expected values below; see the arithmetic in each test's comment.
import { describe, it, expect } from 'vitest';
import { evaluateRule, resolveThreshold } from '../engine/security-rules.js';

// Mirrors CASH-001's seeded logic_expression exactly (schema-security-rules.sql).
const CASH_001 = {
  rule_id: 'CASH-001', logic_type: 'ratio', data_required: ['audit_rows'],
  logic_expression: {
    numerator: { field: 'cashOSDollar', agg: 'sum', abs: true },
    denominator: { field: 'drawerSales', agg: 'sum' },
    scale: 1000, comparator: 'gte',
  },
  threshold: { default: 5 },
};

// Mirrors CASH-002's seeded logic_expression exactly.
const CASH_002 = {
  rule_id: 'CASH-002', logic_type: 'ratio', data_required: ['audit_rows'],
  logic_expression: {
    numerator: { field: 'posOverCnt', agg: 'sum' },
    denominator: { field: 'drawerGC', agg: 'sum' },
    scale: 1000, comparator: 'gte',
  },
  threshold: { default: 15, byLoc: { '0000009': 25 } },
};

// Alice, 4 days: |cashOS| sums to 16, drawerSales sums to 4000 → 16/4000*1000 = 4.
const ALICE_ROWS = [
  { loc: '0000001', emp: 'Alice', date: '2026-08-01', drawerSales: 1000, cashOSDollar: -5 },
  { loc: '0000001', emp: 'Alice', date: '2026-08-02', drawerSales: 1000, cashOSDollar: -3 },
  { loc: '0000001', emp: 'Alice', date: '2026-08-03', drawerSales: 1000, cashOSDollar: -7 },
  { loc: '0000001', emp: 'Alice', date: '2026-08-04', drawerSales: 1000, cashOSDollar: -1 },
];

describe('evaluateRule() — ratio logic_type, against the real seeded CASH-001 shape', () => {
  it('computes value=4 ($/1000-sales, abs-normalized) and fails a threshold of 5', () => {
    const r = evaluateRule(CASH_001, { audit_rows: ALICE_ROWS });
    expect(r.implemented).toBe(true);
    expect(r.value).toBeCloseTo(4, 6);
    expect(r.numeratorSum).toBe(16);
    expect(r.denominatorSum).toBe(4000);
    expect(r.threshold).toBe(5);
    expect(r.pass).toBe(false);
  });

  it('passes (gte is inclusive) when the rate sits exactly at the threshold', () => {
    // Same 4 days, sales still sum to 4000; raise day 4's short from -1 to -5 so
    // sum|cashOS| = 5+3+7+5 = 20 -> 20/4000*1000 = 5, exactly the threshold.
    const rows = ALICE_ROWS.map(r => ({ ...r }));
    rows[3].cashOSDollar = -5;
    const r = evaluateRule(CASH_001, { audit_rows: rows });
    expect(r.value).toBeCloseTo(5, 6);
    expect(r.pass).toBe(true);
  });

  it('returns pass:null (not false) when the window has zero exposure — never a fabricated fail', () => {
    const r = evaluateRule(CASH_001, { audit_rows: [{ loc: '0000001', emp: 'Alice', date: '2026-08-01', drawerSales: 0, cashOSDollar: 0 }] });
    expect(r.implemented).toBe(true);
    expect(r.value).toBeNull();
    expect(r.pass).toBeNull();
    expect(r.reason).toMatch(/exposure/);
  });

  it('returns pass:null when no threshold is configured, distinct from "no exposure"', () => {
    const noThreshold = { ...CASH_001, threshold: null };
    const r = evaluateRule(noThreshold, { audit_rows: ALICE_ROWS });
    expect(r.value).toBeCloseTo(4, 6);
    expect(r.pass).toBeNull();
    expect(r.reason).toMatch(/threshold/);
  });

  it('reads the primary source from DATA_REQUIRED, not a hardcoded key', () => {
    const r = evaluateRule(CASH_001, { some_other_table: ALICE_ROWS });
    expect(r.value).toBeNull();
    expect(r.pass).toBeNull();
  });
});

describe('evaluateRule() — CASH-002, per-1,000-transactions POS overring rate + per-loc threshold override', () => {
  const rows = [
    { loc: '0000009', emp: 'Bob', date: '2026-08-01', drawerGC: 1000, posOverCnt: 20 },
  ];
  it('uses the byLoc override (25) instead of default (15) for a matching loc', () => {
    expect(resolveThreshold(CASH_002, '0000009')).toBe(25);
    const r = evaluateRule(CASH_002, { audit_rows: rows }, { loc: '0000009' });
    expect(r.value).toBeCloseTo(20, 6); // 20 / 1000 * 1000
    expect(r.threshold).toBe(25);
    expect(r.pass).toBe(false); // 20 < 25
  });
  it('falls back to default (15) for a loc with no override', () => {
    expect(resolveThreshold(CASH_002, '0000001')).toBe(15);
    const r = evaluateRule(CASH_002, { audit_rows: rows }, { loc: '0000001' });
    expect(r.threshold).toBe(15);
    expect(r.pass).toBe(true); // 20 >= 15
  });
});

describe('evaluateRule() — unimplemented LOGIC_TYPEs are stubbed, never thrown', () => {
  // z-score is implemented as of dispatch #42 -- see its own describe block below.
  it.each(['sequence', 'window-function'])('%s returns implemented:false, pass:null', (logic_type) => {
    const r = evaluateRule({ logic_type, data_required: ['audit_rows'], logic_expression: {}, threshold: { default: 1 } }, { audit_rows: ALICE_ROWS });
    expect(r.implemented).toBe(false);
    expect(r.pass).toBeNull();
    expect(r.reason).toMatch(new RegExp(logic_type.replace('-', '.')));
  });
});

describe('evaluateRule() — threshold logic_type (no denominator: a raw normalized count)', () => {
  it('sums the field directly when no denominator is given', () => {
    const rule = { logic_type: 'threshold', data_required: ['audit_rows'], logic_expression: { field: 'tRedACnt', agg: 'sum', comparator: 'gt' }, threshold: { default: 3 } };
    const rows = [{ loc: '1', emp: 'A', date: '2026-08-01', tRedACnt: 2 }, { loc: '1', emp: 'A', date: '2026-08-02', tRedACnt: 2 }];
    const r = evaluateRule(rule, { audit_rows: rows });
    expect(r.value).toBe(4);
    expect(r.pass).toBe(true);
  });
});

// dispatch #42 §5 -- the exposure floor (min_denominator) is a SHARED engine mechanism, not a
// z-score-only feature: a plain ratio rule (CASH-001's own shape) honors it identically, since
// evalRatio() applies it at the same choke point z-score reuses. drawerSales=200 < floor 250.
describe('evaluateRule() — min_denominator exposure floor (dispatch #42 §5), on a plain ratio rule', () => {
  const ruleWithFloor = { ...CASH_001, logic_expression: { ...CASH_001.logic_expression, min_denominator: 250 } };
  it('a real, nonzero denominator below the floor produces the SAME honest null a zero denominator does, with a distinct reason', () => {
    const tinyDrawer = [{ loc: '0000001', emp: 'Alice', date: '2026-08-01', drawerSales: 200, cashOSDollar: -50 }];
    const r = evaluateRule(ruleWithFloor, { audit_rows: tinyDrawer });
    expect(r.value).toBeNull();
    expect(r.pass).toBeNull();
    expect(r.reason).toMatch(/exposure floor/);
    expect(r.reason).not.toMatch(/zero denominator/);
  });
  it('a literal zero denominator still reads as "no exposure," not "below floor" — the two reasons stay distinguishable', () => {
    const r = evaluateRule(ruleWithFloor, { audit_rows: [{ loc: '0000001', emp: 'Alice', date: '2026-08-01', drawerSales: 0, cashOSDollar: 0 }] });
    expect(r.reason).toMatch(/zero denominator/);
  });
  it('a denominator that clears the floor evaluates normally, unaffected by the new field', () => {
    const r = evaluateRule(ruleWithFloor, { audit_rows: ALICE_ROWS }); // drawerSales sums to 4000
    expect(r.value).toBeCloseTo(4, 6);
    expect(r.pass).toBe(false);
  });
  it('a rule with no min_denominator set behaves exactly as before (backward-compatible)', () => {
    const tinyDrawer = [{ loc: '0000001', emp: 'Alice', date: '2026-08-01', drawerSales: 200, cashOSDollar: -50 }];
    const r = evaluateRule(CASH_001, { audit_rows: tinyDrawer }); // no min_denominator on CASH_001 itself
    expect(r.value).toBeCloseTo(250, 6); // 50/200*1000 -- a real (if noisy) verdict, not nulled
  });
});

// dispatch #45 §A -- min_numerator gates the RAW absolute numerator sum, independent of the
// computed rate: a real, decided "clear" (pass:false), never a null -- distinct from
// min_denominator's honest-null (the rule DID form a verdict here, it just decided the magnitude
// doesn't matter). Alice: |cashOS| sums to 16 on drawerSales 4000 -> value=4, crosses threshold 5?
// No (4<5) -- pick a rule shape where the RATE crosses but the raw dollars are still small, the
// exact INV-002 scenario: numerator 16, scaled against a much larger denominator so the rate alone
// looks material.
describe('evaluateRule() — min_numerator materiality floor (dispatch #45 §A), on a plain ratio rule', () => {
  // numerator (|cashOS|) sums to 16, denominator (drawerSales) sums to 400 -> value = 16/400*1000 = 40 (crosses threshold 5 easily).
  const TINY_DOLLAR_BIG_RATE_ROWS = [{ loc: '0000001', emp: 'Alice', date: '2026-08-01', drawerSales: 400, cashOSDollar: -16 }];
  it('a real, nonzero numerator below the floor produces pass:false, NOT a null -- the rule evaluated, it just decided the amount is trivial', () => {
    const ruleWithFloor = { ...CASH_001, logic_expression: { ...CASH_001.logic_expression, min_numerator: 25 } };
    const r = evaluateRule(ruleWithFloor, { audit_rows: TINY_DOLLAR_BIG_RATE_ROWS });
    expect(r.value).toBeCloseTo(40, 6); // the rate is still honestly reported...
    expect(r.numeratorSum).toBeCloseTo(16, 6); // ...16 < floor 25...
    expect(r.pass).toBe(false); // ...so a decided clear, not an honest-null
  });
  it('a numerator that clears the floor evaluates normally, unaffected by the new field', () => {
    const ruleWithFloor = { ...CASH_001, logic_expression: { ...CASH_001.logic_expression, min_numerator: 10 } };
    const r = evaluateRule(ruleWithFloor, { audit_rows: TINY_DOLLAR_BIG_RATE_ROWS }); // numeratorSum 16 >= 10
    expect(r.value).toBeCloseTo(40, 6);
    expect(r.pass).toBe(true);
  });
  it('a rule with no min_numerator set behaves exactly as before (backward-compatible)', () => {
    const r = evaluateRule(CASH_001, { audit_rows: TINY_DOLLAR_BIG_RATE_ROWS }); // no min_numerator on CASH_001 itself
    expect(r.pass).toBe(true); // value 40 >= threshold 5, nothing else gates it
  });
  it('min_numerator and min_denominator compose -- exposure floor (null) is checked independently and wins when the denominator itself is too small to mean anything', () => {
    const ruleWithBoth = { ...CASH_001, logic_expression: { ...CASH_001.logic_expression, min_numerator: 10, min_denominator: 1000 } };
    const r = evaluateRule(ruleWithBoth, { audit_rows: TINY_DOLLAR_BIG_RATE_ROWS }); // denominatorSum 400 < 1000
    expect(r.value).toBeNull();
    expect(r.pass).toBeNull(); // exposure floor's null, not min_numerator's false -- they never collide
  });
});

// dispatch #42 -- mirrors INV-001's real shape (numerator/denominator ratio, z-scored against a
// caller-supplied baseline instead of compared to a fixed constant). One subject row:
// v=30, d=100 -> raw value = 30/100*100 = 30. Baseline mean=10, stdev=5 -> z = (30-10)/5 = 4.
describe('evaluateRule() — z-score logic_type (dispatch #42), against the real INV-001 shape', () => {
  const Z_RULE = {
    rule_id: 'INV-001', logic_type: 'z-score', data_required: ['qsr_variance_stat'],
    logic_expression: {
      numerator: { field: 'v', agg: 'sum', abs: true },
      denominator: { field: 'd', agg: 'sum' },
      scale: 100, comparator: 'gte', min_value: 20, min_denominator: 10,
    },
    threshold: { default: 2.5 },
  };
  const SUBJECT_ROWS = [{ loc: '0000001', wrin: '00001-000', v: 30, d: 100 }];
  const GOOD_BASELINE = { mean: 10, stdev: 5, n: 6 };

  it('flags when BOTH gates clear: z (4) >= threshold (2.5) AND value (30) >= min_value (20)', () => {
    const r = evaluateRule(Z_RULE, { qsr_variance_stat: SUBJECT_ROWS }, { loc: '0000001', baseline: GOOD_BASELINE });
    expect(r.implemented).toBe(true);
    expect(r.value).toBeCloseTo(30, 6);
    expect(r.zscore).toBeCloseTo(4, 6);
    expect(r.pass).toBe(true);
  });

  it('does NOT flag when z clears but the materiality floor does not — a real "clear", not an honest-null', () => {
    const rule = { ...Z_RULE, logic_expression: { ...Z_RULE.logic_expression, min_value: 40 } };
    const r = evaluateRule(rule, { qsr_variance_stat: SUBJECT_ROWS }, { loc: '0000001', baseline: GOOD_BASELINE });
    expect(r.zscore).toBeCloseTo(4, 6); // still statistically unusual...
    expect(r.value).toBeCloseTo(30, 6); // ...but 30 < 40
    expect(r.pass).toBe(false); // a definite no, not undetermined -- the rule DID evaluate
  });

  it('does NOT flag when the value clears materiality but z does not clear sigma', () => {
    const rule = { ...Z_RULE, threshold: { default: 10 } }; // z=4 < 10
    const r = evaluateRule(rule, { qsr_variance_stat: SUBJECT_ROWS }, { loc: '0000001', baseline: GOOD_BASELINE });
    expect(r.zscore).toBeCloseTo(4, 6);
    expect(r.pass).toBe(false);
  });

  it('returns pass:null when no baseline is supplied — never silently treated as a fail', () => {
    const r = evaluateRule(Z_RULE, { qsr_variance_stat: SUBJECT_ROWS }, { loc: '0000001' });
    expect(r.value).toBeCloseTo(30, 6); // the raw rate is still honestly reported
    expect(r.zscore).toBeNull();
    expect(r.pass).toBeNull();
    expect(r.reason).toMatch(/no baseline/);
  });

  it('returns pass:null when the baseline population is too small (n < 5) to mean anything', () => {
    const r = evaluateRule(Z_RULE, { qsr_variance_stat: SUBJECT_ROWS }, { loc: '0000001', baseline: { mean: 10, stdev: 5, n: 2 } });
    expect(r.pass).toBeNull();
    expect(r.reason).toMatch(/insufficient/);
  });

  it('returns pass:null when baseline stdev is zero — division carries no information', () => {
    const r = evaluateRule(Z_RULE, { qsr_variance_stat: SUBJECT_ROWS }, { loc: '0000001', baseline: { mean: 10, stdev: 0, n: 6 } });
    expect(r.pass).toBeNull();
    expect(r.zscore).toBeNull();
    expect(r.reason).toMatch(/stdev/);
  });

  it('returns an honest null (not a garbage ratio) when the denominator is below the exposure floor -- the SAME shared mechanism the plain-ratio test above exercises', () => {
    const tinyDenom = [{ loc: '0000001', wrin: '00001-000', v: 30, d: 5 }]; // d=5 < min_denominator=10
    const r = evaluateRule(Z_RULE, { qsr_variance_stat: tinyDenom }, { loc: '0000001', baseline: GOOD_BASELINE });
    expect(r.value).toBeNull();
    expect(r.pass).toBeNull();
    expect(r.reason).toMatch(/exposure floor/);
  });

  it('returns the ordinary zero-denominator honest-null, distinct from the exposure-floor one', () => {
    const zeroDenom = [{ loc: '0000001', wrin: '00001-000', v: 30, d: 0 }];
    const r = evaluateRule(Z_RULE, { qsr_variance_stat: zeroDenom }, { loc: '0000001', baseline: GOOD_BASELINE });
    expect(r.value).toBeNull();
    expect(r.pass).toBeNull();
    expect(r.reason).toMatch(/no exposure/);
  });

  it('returns pass:null (with zscore still computed) when no threshold is configured', () => {
    const rule = { ...Z_RULE, threshold: null };
    const r = evaluateRule(rule, { qsr_variance_stat: SUBJECT_ROWS }, { loc: '0000001', baseline: GOOD_BASELINE });
    expect(r.zscore).toBeCloseTo(4, 6);
    expect(r.pass).toBeNull();
    expect(r.reason).toMatch(/threshold/);
  });

  // dispatch #45 §A -- the exact INV-002 scenario: a rate that's statistically unusual (high z)
  // AND clears its own min_value on the RATE, but the raw dollar amount behind it is trivial. One
  // subject: v=5 (numerator), d=1000 (denominator), scale=100 -> value = 5/1000*100 = 0.5. Baseline
  // mean=0.1, stdev=0.1 -> z = (0.5-0.1)/0.1 = 4 (clears threshold 2.5 easily). value 0.5 also
  // clears a min_value of, say, 0.3 -- both existing gates say "flag." min_numerator asks a
  // DIFFERENT question: is 5 (the raw numerator) big enough to matter at all.
  describe('min_numerator materiality floor (dispatch #45 §A) -- gates the RAW numerator, independent of the rate/z-score', () => {
    const TINY_DOLLAR_RULE = {
      ...Z_RULE,
      logic_expression: { ...Z_RULE.logic_expression, min_value: 0.3, min_numerator: 10 },
    };
    const TINY_DOLLAR_ROWS = [{ loc: '0000001', wrin: '00001-000', v: 5, d: 1000 }];
    const TINY_BASELINE = { mean: 0.1, stdev: 0.1, n: 6 };

    it('a statistically unusual rate that ALSO clears min_value still gets pass:false when the raw numerator (5) is below min_numerator (10) -- a real clear, not a null', () => {
      const r = evaluateRule(TINY_DOLLAR_RULE, { qsr_variance_stat: TINY_DOLLAR_ROWS }, { loc: '0000001', baseline: TINY_BASELINE });
      expect(r.value).toBeCloseTo(0.5, 6); // the rate is still honestly reported...
      expect(r.numeratorSum).toBeCloseTo(5, 6); // ...5 < floor 10...
      expect(r.zscore).toBeCloseTo(4, 6); // ...z clears sigma...
      expect(r.pass).toBe(false); // ...but the absolute amount doesn't clear materiality
    });

    it('the SAME subject flags once the numerator floor is lowered below its real amount -- proving min_numerator, not min_value or z, was what gated it above', () => {
      const rule = { ...TINY_DOLLAR_RULE, logic_expression: { ...TINY_DOLLAR_RULE.logic_expression, min_numerator: 3 } };
      const r = evaluateRule(rule, { qsr_variance_stat: TINY_DOLLAR_ROWS }, { loc: '0000001', baseline: TINY_BASELINE });
      expect(r.numeratorSum).toBeCloseTo(5, 6);
      expect(r.pass).toBe(true);
    });

    it('a rule with no min_numerator set behaves exactly as before (backward-compatible) -- min_value alone still governs', () => {
      const rule = { ...Z_RULE, logic_expression: { ...Z_RULE.logic_expression, min_value: 0.3 } }; // no min_numerator
      const r = evaluateRule(rule, { qsr_variance_stat: TINY_DOLLAR_ROWS }, { loc: '0000001', baseline: TINY_BASELINE });
      expect(r.pass).toBe(true);
    });
  });
});
