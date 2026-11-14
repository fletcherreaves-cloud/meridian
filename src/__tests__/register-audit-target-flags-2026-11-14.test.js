// @ts-nocheck
// Notes 61 items #10/#11 (owner, 2026-11-14): target-relative, egregious-vs-repetitive flagging
// for Register Audit, plus %-of-sales surfacing for the 5 metrics the owner named ("cash +/-,
// T-Reds before and after, Refunds and Overrings"). See register-audit.js's own header comment
// on computeTargetAwareRegisterFlags for the full design and the exact thresholds chosen
// (RECENT_WINDOW_DAYS=42, EGREGIOUS_MULTIPLE=3, FLOOR_PCT=0.005, REPETITIVE_MIN_DAYS=3,
// REPETITIVE_SHARE=0.5) and why each was picked.
//
// Store '43380' is used throughout -- a real DEFAULT_TARGETS entry (constants.js) with real
// target values: tCashOSPct:-0.0004, tRedAPct:0.0037, tRedBPct:0.0313, tPosOverPct:0.00318,
// tRefundPct:0.0. Pinned here so a future edit to DEFAULT_TARGETS that changes this store's
// numbers fails this test loudly instead of silently changing what "egregious"/"repetitive"
// mean without anyone noticing.
import { describe, it, expect } from 'vitest';
import { analyzeRegisterAudit, computeTargetAwareRegisterFlags } from '../utils/register-audit.js';
import { DEFAULT_TARGETS } from '../constants.js';

const LOC = '43380';

it('pins the real target values this whole test file depends on (fails loudly if DEFAULT_TARGETS changes)', () => {
  const t = DEFAULT_TARGETS[LOC];
  expect(t.tCashOSPct).toBeCloseTo(-0.0004, 6);
  expect(t.tRedAPct).toBeCloseTo(0.0037, 6);
  expect(t.tRedBPct).toBeCloseTo(0.0313, 6);
  expect(t.tPosOverPct).toBeCloseTo(0.00318, 6);
  expect(t.tRefundPct).toBeCloseTo(0.0, 6);
});

const row = (date, over = {}) => ({
  loc: LOC, emp: 'E1', empToken: 'tok-e1', date,
  drawerSales: 1000, drawerGC: 100, drawerOpens: 3, cashOSDollar: 0,
  tRedACnt: 0, tRedBCnt: 0, tRedADollar: 0, tRedBDollar: 0,
  manualRefAmt: 0, posOverCnt: 0, posOverAmt: 0,
  refundCnt: 0, refundCash: 0, refundCashless: 0, promoAmt: 0,
  ...over,
});

describe('%-of-sales self columns (Notes 61 item #11)', () => {
  it('computes cashOSPctSelf/tRedBPctSelf/tRedAPctSelf/posOverPctSelf/refundPctSelf as $÷totalSales', () => {
    const { employees: [e] } = analyzeRegisterAudit([
      row('2026-10-01', { cashOSDollar: -5, tRedBDollar: 20, tRedADollar: 10, posOverAmt: 3, refundCash: 2, refundCashless: 1 }),
    ]);
    expect(e.totalSales).toBe(1000);
    expect(e.cashOSPctSelf).toBeCloseTo(-5 / 1000, 6);
    expect(e.tRedBPctSelf).toBeCloseTo(20 / 1000, 6);
    expect(e.tRedAPctSelf).toBeCloseTo(10 / 1000, 6);
    expect(e.posOverPctSelf).toBeCloseTo(3 / 1000, 6);
    expect(e.refundPctSelf).toBeCloseTo(3 / 1000, 6); // cash(2) + cashless(1)
  });

  it('is null (not 0 or NaN) when totalSales is 0 -- "no sales to divide by" must render differently from "genuinely zero"', () => {
    const { employees: [e] } = analyzeRegisterAudit([row('2026-10-01', { drawerSales: 0, cashOSDollar: -5 })]);
    expect(e.totalSales).toBe(0);
    expect(e.cashOSPctSelf).toBeNull();
    expect(e.tRedBPctSelf).toBeNull();
    expect(e.tRedAPctSelf).toBeNull();
    expect(e.posOverPctSelf).toBeNull();
    expect(e.refundPctSelf).toBeNull();
  });
});

describe('computeTargetAwareRegisterFlags -- egregious vs. repetitive (Notes 61 item #10)', () => {
  it('a SINGLE extreme day fires "egregious" even with no pattern at all (one-off blowout)', () => {
    // tCashOSPct target = -0.0004. Egregious threshold = max(3*0.0004, 3*0.005) = 0.015.
    // One day at -2% ($-20/$1000) deviates by |−0.02 − (−0.0004)| = 0.0196 ≥ 0.015 → egregious.
    // Every other day is clean (cashOSDollar: 0) so there is no pattern to find either.
    const rows = [
      row('2026-10-25', { cashOSDollar: -20 }), // the one extreme day
      row('2026-10-26'), row('2026-10-27'), row('2026-10-28'), row('2026-10-29'),
    ];
    const flags = computeTargetAwareRegisterFlags(rows);
    const f = flags[LOC + '::E1'];
    expect(f.metrics.cashOS.isEgregious).toBe(true);
    expect(f.metrics.cashOS.isRepetitive).toBe(false); // only 1 over day -- below REPETITIVE_MIN_DAYS
    expect(f.flags.some(x => x.metric === 'cashOS' && x.kind === 'egregious')).toBe(true);
    expect(f.riskScore).toBeGreaterThanOrEqual(25); // egregious weight
  });

  it('a REPEATED moderate pattern fires "repetitive" without any single day being egregious', () => {
    // tRedAPct target = 0.0037. Egregious threshold = max(3*0.0037, 3*0.005) = 0.015.
    // $10 T-Red After on $1000 sales = 1% ($0.01) → deviation = 0.01 - 0.0037 = 0.0063.
    // 0.0063 ≥ FLOOR_PCT(0.005) (notably over) but < 0.015 (not egregious) -- exactly the gap
    // between the two thresholds this test is built to land in.
    const rows = [
      row('2026-10-20', { tRedADollar: 10 }),
      row('2026-10-21', { tRedADollar: 10 }),
      row('2026-10-22', { tRedADollar: 10 }),
      row('2026-10-23'), // one clean day
    ];
    const flags = computeTargetAwareRegisterFlags(rows);
    const f = flags[LOC + '::E1'];
    expect(f.metrics.tRedA.isEgregious).toBe(false);
    expect(f.metrics.tRedA.isRepetitive).toBe(true); // 3/4 days over, share=0.75 ≥ 0.5, overDays=3 ≥ 3
    expect(f.metrics.tRedA.overDays).toBe(3);
    expect(f.metrics.tRedA.share).toBeCloseTo(0.75, 2);
    expect(f.flags.some(x => x.metric === 'tRedA' && x.kind === 'repetitive')).toBe(true);
    expect(f.flags.some(x => x.metric === 'tRedA' && x.kind === 'egregious')).toBe(false);
  });

  it('ONE bad day among many clean ones is neither egregious nor repetitive -- a single miss is not a pattern', () => {
    const rows = [
      row('2026-10-10', { tRedADollar: 10 }), // same moderate deviation as the repetitive test above, just once
      row('2026-10-11'), row('2026-10-12'), row('2026-10-13'), row('2026-10-14'), row('2026-10-15'),
    ];
    const flags = computeTargetAwareRegisterFlags(rows);
    const f = flags[LOC + '::E1'];
    expect(f.metrics.tRedA.isEgregious).toBe(false);
    expect(f.metrics.tRedA.isRepetitive).toBe(false); // overDays=1 < REPETITIVE_MIN_DAYS(3)
    expect(f.flags.length).toBe(0);
    expect(f.riskScore).toBe(0);
    expect(f.riskLevel).toBe('ok');
  });

  it('egregious outweighs repetitive in the risk score (25 vs 15 per metric)', () => {
    const egregiousRows = [row('2026-10-25', { cashOSDollar: -20 }), row('2026-10-26')];
    const repetitiveRows = [row('2026-10-20', { tRedADollar: 10 }), row('2026-10-21', { tRedADollar: 10 }), row('2026-10-22', { tRedADollar: 10 }), row('2026-10-23')];
    const egregiousScore = computeTargetAwareRegisterFlags(egregiousRows)[LOC + '::E1'].riskScore;
    const repetitiveScore = computeTargetAwareRegisterFlags(repetitiveRows)[LOC + '::E1'].riskScore;
    expect(egregiousScore).toBeGreaterThan(repetitiveScore);
  });

  it('a day with zero sales is excluded from the recent-day denominator (cannot compute a ratio against zero)', () => {
    const rows = [
      row('2026-10-25', { drawerSales: 0, cashOSDollar: -20 }), // zero-sales day, excluded entirely
      row('2026-10-26'), row('2026-10-27'),
    ];
    const f = computeTargetAwareRegisterFlags(rows)[LOC + '::E1'];
    expect(f.recentDaysWithSales).toBe(2); // only the 2 real-sales days count
  });
});

describe('full-history reference stays visible alongside the recent-window-driven flags', () => {
  it('fullHistory reflects EVERY day on file (including days outside the 42-day recent window), while flags/recentDaysWithSales only reflect the recent window', () => {
    const rows = [
      // Old data, 100 days before the dataset's most recent date -- outside the 42-day window.
      row('2026-07-01', { tRedADollar: 50 }), // a much larger historical deviation
      row('2026-07-02', { tRedADollar: 50 }),
      // Recent, clean data (the most recent date in the whole dataset, so this anchors "today").
      row('2026-10-09'),
      row('2026-10-10'),
    ];
    const f = computeTargetAwareRegisterFlags(rows)[LOC + '::E1'];
    // The old 50/1000=5% days are OUTSIDE the recent window -- no flags from them.
    expect(f.metrics.tRedA.isEgregious).toBe(false);
    expect(f.metrics.tRedA.isRepetitive).toBe(false);
    expect(f.recentDaysWithSales).toBe(2); // only the 2 recent clean days
    // But full-history reference still sees ALL 4 days, old deviation included.
    expect(f.fullHistory.daysOnFile).toBe(4);
    expect(f.fullHistory.pct.tRedA).toBeCloseTo(100 / 4000, 6); // (50+50+0+0) / (1000*4)
    expect(f.fullHistory.spanStart).toBe('2026-07-01');
    expect(f.fullHistory.spanEnd).toBe('2026-10-10');
  });
});

describe('computeTargetAwareRegisterFlags -- grouping and edge cases', () => {
  it('keys results by loc::emp and keeps two different employees at the same store independent', () => {
    const rows = [
      { ...row('2026-10-25', { cashOSDollar: -20 }), emp: 'Alice' },
      { ...row('2026-10-25'), emp: 'Bob' },
    ];
    const flags = computeTargetAwareRegisterFlags(rows);
    expect(flags[LOC + '::Alice'].metrics.cashOS.isEgregious).toBe(true);
    expect(flags[LOC + '::Bob'].metrics.cashOS.isEgregious).toBe(false);
  });

  it('returns {} for an empty or missing row list rather than throwing', () => {
    expect(computeTargetAwareRegisterFlags([])).toEqual({});
    expect(computeTargetAwareRegisterFlags(null)).toEqual({});
  });

  it('degrades to no flags (not a crash) for a store with no DEFAULT_TARGETS entry', () => {
    const rows = [{ ...row('2026-10-25', { cashOSDollar: -9999 }), loc: '99999999' }];
    const f = computeTargetAwareRegisterFlags(rows)['99999999::E1'];
    expect(f.riskScore).toBe(0);
    expect(f.flags).toEqual([]);
    expect(Object.values(f.metrics).every(v => v === null)).toBe(true);
  });
});
