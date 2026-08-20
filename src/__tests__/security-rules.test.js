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
  it.each(['z-score', 'sequence', 'window-function'])('%s returns implemented:false, pass:null', (logic_type) => {
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
