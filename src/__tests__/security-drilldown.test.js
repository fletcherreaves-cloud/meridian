import { describe, it, expect } from 'vitest';
import {
  median, twoProportionZ, flagRateByStore, crossStorePrevalence,
  compositionVsEstate, periodTrend, secondaryMetrics, monthsBack,
  assembleInventoryDrilldown, assembleCashDrilldown, CASH_RULE_FIELDS,
} from '../engine/security-drilldown.js';

describe('median', () => {
  it('handles odd and even counts', () => {
    expect(median([1, 3, 2])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });
  it('filters nulls/NaN and returns null when nothing is left', () => {
    expect(median([null, undefined, NaN, 5])).toBe(5);
    expect(median([])).toBe(null);
    expect(median([null])).toBe(null);
  });
});

describe('twoProportionZ', () => {
  it('returns null on zero exposure either side', () => {
    expect(twoProportionZ(1, 0, 1, 10)).toBe(null);
    expect(twoProportionZ(1, 10, 1, 0)).toBe(null);
  });
  it('computes a real z-score for a clear skew (mirrors the 82.1% vs 47.0% finding)', () => {
    const r = twoProportionZ(23, 28, 71, 151); // subject's paper share vs estate's
    expect(r.p1).toBeCloseTo(0.8214, 3);
    expect(r.p2).toBeCloseTo(0.4702, 3);
    expect(r.z).toBeGreaterThan(3); // the finding called this ~3.7 sigma
  });
  it('a matching proportion yields z near zero', () => {
    const r = twoProportionZ(50, 100, 50, 100);
    expect(r.z).toBeCloseTo(0, 5);
  });
});

describe('flagRateByStore', () => {
  const popRows = [
    { loc: '1', wrin: 'A' }, { loc: '1', wrin: 'B' }, { loc: '1', wrin: 'C' }, { loc: '1', wrin: 'D' },
    { loc: '2', wrin: 'A' }, { loc: '2', wrin: 'B' }, { loc: '2', wrin: 'C' }, { loc: '2', wrin: 'D' },
    { loc: '3', wrin: 'A' }, { loc: '3', wrin: 'B' }, { loc: '3', wrin: 'C' }, { loc: '3', wrin: 'D' },
  ];
  const domainRuleIds = new Set(['INV-001']);
  const findings = [
    { loc: '1', wrin: 'A', ruleId: 'INV-001', pass: true },
    { loc: '1', wrin: 'B', ruleId: 'INV-001', pass: true }, // store 1: 2/4 = 50%
    { loc: '2', wrin: 'A', ruleId: 'INV-001', pass: true }, // store 2: 1/4 = 25%
    { loc: '3', wrin: 'A', ruleId: 'INV-001', pass: false }, // clear -- not counted
    { loc: '1', wrin: 'A', ruleId: 'CASH-001', pass: true }, // wrong domain -- excluded
  ];
  const call = () => flagRateByStore({
    subjectLoc: '1', popRows, findings, domainRuleIds,
    subjectField: 'wrin', popKeyField: 'wrin',
  });

  it('computes a rate over the store\'s own subject population, not a raw count', () => {
    const { subject, rates } = call();
    expect(subject.total).toBe(4);
    expect(subject.flagged).toBe(2);
    expect(subject.rate).toBe(0.5);
    expect(rates.find(r => r.loc === '3').rate).toBe(0); // pass:false -- clear, not flagged
  });

  it('the multiple compares the subject store against the OTHER stores only', () => {
    const { otherMean, multiple } = call();
    expect(otherMean).toBeCloseTo(0.125, 5); // (0.25 + 0)/2, store 1 excluded from otherMean
    expect(multiple).toBeCloseTo(4, 5); // 0.5 / 0.125
  });

  it('a store with zero subject population never divides by zero', () => {
    const r = flagRateByStore({
      subjectLoc: '9', popRows: [], findings: [], domainRuleIds,
      subjectField: 'wrin', popKeyField: 'wrin',
    });
    expect(r.subject).toBe(null);
    expect(r.rates).toEqual([]);
  });
});

describe('crossStorePrevalence', () => {
  const domainRuleIds = new Set(['INV-001']);
  const findings = [
    { loc: '1', wrin: 'LOCAL', ruleId: 'INV-001', pass: true },   // flags nowhere else
    { loc: '1', wrin: 'BROAD', ruleId: 'INV-001', pass: true },
    { loc: '2', wrin: 'BROAD', ruleId: 'INV-001', pass: true },
    { loc: '3', wrin: 'BROAD', ruleId: 'INV-001', pass: true },   // BROAD flags at 3 stores
    { loc: '1', wrin: 'LOCAL', ruleId: 'CASH-001', pass: true },  // wrong domain -- excluded
  ];
  it('separates a store-specific item from an estate-wide one', () => {
    const r = crossStorePrevalence({
      subjectFlaggedKeys: ['LOCAL', 'BROAD'], findings, domainRuleIds, keyField: 'wrin',
    });
    const local = r.items.find(i => i.key === 'LOCAL');
    const broad = r.items.find(i => i.key === 'BROAD');
    expect(local.storeCount).toBe(1);
    expect(local.isLocalOnly).toBe(true);
    expect(broad.storeCount).toBe(3);
    expect(broad.isLocalOnly).toBe(false);
    expect(r.localOnlyShare).toBe(0.5);
  });
});

describe('compositionVsEstate', () => {
  it('reproduces the finding\'s own numbers: 82.1% vs 47.0%, z > 3', () => {
    const subjectFlags = [...Array(23).fill('paper'), ...Array(5).fill('food')];
    const estateFlags = [...Array(71).fill('paper'), ...Array(80).fill('food')];
    const r = compositionVsEstate({ subjectClass: 'paper', subjectFlags, estateFlags });
    expect(r.subjectShare).toBeCloseTo(0.821, 3);
    expect(r.estateShare).toBeCloseTo(0.470, 3);
    expect(r.z).toBeGreaterThan(3);
  });
  it('returns null shares, not NaN, when a group is empty', () => {
    const r = compositionVsEstate({ subjectClass: 'paper', subjectFlags: [], estateFlags: [] });
    expect(r.subjectShare).toBe(null);
    expect(r.estateShare).toBe(null);
    expect(r.z).toBe(null);
  });
});

describe('periodTrend', () => {
  it('takes the median per period, oldest to newest, and preserves order', () => {
    const r = periodTrend([
      { period: '2026-05', values: [10, 20, 30] },
      { period: '2026-06', values: [5, 15] },
      { period: '2026-07', values: [] },
    ]);
    expect(r.map(p => p.period)).toEqual(['2026-05', '2026-06', '2026-07']);
    expect(r[0].medianValue).toBe(20);
    expect(r[1].medianValue).toBe(10);
    expect(r[2].medianValue).toBe(null); // no data that period -- honest null, not 0
    expect(r[2].n).toBe(0);
  });
});

describe('secondaryMetrics', () => {
  it('computes a ratio beside every subject value, never the value alone', () => {
    const r = secondaryMetrics([
      { label: 'Waste logged', subjectValue: 3173, estateMedian: 5497 },
      { label: 'Item count', subjectValue: 173, estateMedian: 0 }, // zero baseline -- no ratio
    ]);
    expect(r[0].ratio).toBeCloseTo(3173 / 5497, 5);
    expect(r[1].ratio).toBe(null);
  });
});

describe('monthsBack', () => {
  it('returns n consecutive months ending at period, oldest first', () => {
    expect(monthsBack('2026-08', 4)).toEqual(['2026-05', '2026-06', '2026-07', '2026-08']);
  });
  it('crosses a year boundary correctly', () => {
    expect(monthsBack('2026-02', 3)).toEqual(['2025-12', '2026-01', '2026-02']);
  });
});

describe('assembleInventoryDrilldown', () => {
  // A miniature version of the 0013113 shape: 3 stores, subject store flags 2 packaging items
  // nobody else flags, at a rate well above its peers, with elevated waste and normal counting.
  const domainRuleIds = new Set(['INV-001']);
  const popRows = [
    { loc: '13113', wrin: 'CUP', cls: 'paper', expUsage: 100, actUsage: 50, variance: 50, rawWaste: 100, compWaste: 50 },
    { loc: '13113', wrin: 'LID', cls: 'paper', expUsage: 100, actUsage: 60, variance: 40, rawWaste: 80, compWaste: 20 },
    { loc: '13113', wrin: 'PATTY', cls: 'food', expUsage: 100, actUsage: 98, variance: 2, rawWaste: 30, compWaste: 10 },
    { loc: '2', wrin: 'CUP', cls: 'paper', expUsage: 100, actUsage: 95, variance: 5, rawWaste: 90, compWaste: 10 },
    { loc: '2', wrin: 'BUN', cls: 'food', expUsage: 100, actUsage: 80, variance: 20, rawWaste: 40, compWaste: 20 },
    { loc: '3', wrin: 'BUN', cls: 'food', expUsage: 100, actUsage: 82, variance: 18, rawWaste: 35, compWaste: 15 },
  ];
  const findings = [
    { loc: '13113', wrin: 'CUP', ruleId: 'INV-001', pass: true },
    { loc: '13113', wrin: 'LID', ruleId: 'INV-001', pass: true },
    { loc: '2', wrin: 'BUN', ruleId: 'INV-001', pass: true },
  ];
  const histRows = [
    { loc: '13113', period: '2026-07', wrin: 'CUP', variance: 60 }, { loc: '13113', period: '2026-07', wrin: 'LID', variance: 50 },
    { loc: '13113', period: '2026-08', wrin: 'CUP', variance: 50 }, { loc: '13113', period: '2026-08', wrin: 'LID', variance: 40 },
  ];
  const r = assembleInventoryDrilldown({
    subjectLoc: '13113', findings, domainRuleIds, popRows, histRows, periods: ['2026-07', '2026-08'],
  });

  it('flag rate: subject store carries 2/3 flagged, well above its peers (0/2, 1/1)', () => {
    expect(r.flagRate.subject.rate).toBeCloseTo(2 / 3, 5);
  });
  it('prevalence: both flagged items are local-only (flag nowhere else)', () => {
    expect(r.prevalence.localOnlyShare).toBe(1);
  });
  it('composition: subject is 100% paper vs. the estate\'s 100% food (BUN only) -- a real skew', () => {
    const paper = r.composition.find(c => c.class === 'paper');
    expect(paper.subjectShare).toBe(1);
    expect(paper.estateShare).toBe(0);
  });
  it('trend: median variance improves from period to period, oldest first', () => {
    expect(r.trend.map(t => t.medianValue)).toEqual([55, 45]); // (60+50)/2, (50+40)/2
  });
  it('secondary: waste logged is compared against the OTHER stores\' median, not zero', () => {
    const waste = r.secondary.find(s => s.label.startsWith('Waste logged'));
    expect(waste.subjectValue).toBe(290); // 100+50+80+20+30+10
    expect(waste.estateMedian).toBeGreaterThan(0);
  });
});

describe('assembleCashDrilldown', () => {
  const domainRuleIds = new Set(['CASH-001', 'CASH-002', 'CASH-004']);
  const rows = [
    { loc: '1', empToken: 'EMP-A', date: '2026-08-05', manualRefAmt: 50, drawerSales: 500, posOverCnt: 0, drawerGC: 100, promoAmt: 0 },
    { loc: '1', empToken: 'EMP-A', date: '2026-08-12', manualRefAmt: 60, drawerSales: 500, posOverCnt: 0, drawerGC: 100, promoAmt: 0 },
    { loc: '1', empToken: 'EMP-B', date: '2026-08-05', manualRefAmt: 5, drawerSales: 500, posOverCnt: 0, drawerGC: 100, promoAmt: 0 },
    { loc: '2', empToken: 'EMP-C', date: '2026-08-05', manualRefAmt: 5, drawerSales: 500, posOverCnt: 0, drawerGC: 100, promoAmt: 0 },
  ];
  const findings = [
    { loc: '1', empToken: 'EMP-A', ruleId: 'CASH-001', pass: true },
    { loc: '2', empToken: 'EMP-C', ruleId: 'CASH-002', pass: true },
  ];
  const r = assembleCashDrilldown({
    subjectLoc: '1', subjectEmpToken: 'EMP-A', findings, domainRuleIds, rows, months: ['2026-08'],
  });

  it('flag rate: subject store has 1 of 2 distinct employees flagged', () => {
    expect(r.flagRate.subject.total).toBe(2);
    expect(r.flagRate.subject.flagged).toBe(1);
    expect(r.flagRate.subject.rate).toBe(0.5);
  });
  it('prevalence: CASH-001 flags at exactly one store (this one)', () => {
    expect(r.prevalence.items[0].storeCount).toBe(1);
    expect(r.prevalence.items[0].isLocalOnly).toBe(true);
  });
  it('rule mix: CASH-001 is 0% of the (excluding-subject) estate\'s flags -- estate flags are all CASH-002', () => {
    expect(r.ruleMix[0].ruleId).toBe('CASH-001');
    expect(r.ruleMix[0].estateShare).toBe(0);
  });
  it('trend: CASH-001\'s own rate for the subject, per month, using the real numField/denField', () => {
    const t = r.trendByRule.find(x => x.ruleId === 'CASH-001');
    expect(t.months[0].period).toBe('2026-08');
    expect(t.months[0].value).toBeCloseTo(110, 5); // (50+60)/(500+500) * 1000 (per $1,000 drawer sales)
  });
  it('secondary: reports the subject\'s OTHER rules (not CASH-001) vs. their store peer', () => {
    expect(r.secondary.map(s => s.label).sort()).toEqual(['CASH-002', 'CASH-004']);
    const c2 = r.secondary.find(s => s.label === 'CASH-002');
    expect(c2.subjectValue).toBe(0); // posOverCnt always 0 in the fixture
  });
});

describe('CASH_RULE_FIELDS', () => {
  it('covers exactly the four cash rules, matching the live seeds', () => {
    expect(Object.keys(CASH_RULE_FIELDS).sort()).toEqual(['CASH-001', 'CASH-002', 'CASH-003', 'CASH-004']);
  });
});
