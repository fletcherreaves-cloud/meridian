import { describe, it, expect } from 'vitest';
import {
  median, twoProportionZ, flagRateByStore, crossStorePrevalence,
  compositionVsEstate, periodTrend, secondaryMetrics, monthsBack,
  assembleInventoryDrilldown, assembleCashDrilldown, CASH_RULE_FIELDS,
  classifySubjectShape, buildSubjectTimeline, corroboratingFlags,
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

// dispatch #56 Part D -- "a first-time flag and a fifth consecutive flag are completely different
// situations." classifySubjectShape asks a different question from dispatch #46's
// classifySubjectTrend (chronic/new/improving/clear, a two-state "is it still going on"): this
// asks how many times, and in what arrangement -- instance / pattern / trend, with an explicit
// minimum before a directional "trend" claim is allowed.
describe('classifySubjectShape', () => {
  const w = (pass, value) => ({ pass, value, windowStart: '2026-01-01', windowEnd: '2026-01-28' });

  it('no flagged windows -> never-flagged', () => {
    expect(classifySubjectShape([w(false, 1), w(null, null)])).toEqual({ shape: 'never-flagged', flaggedCount: 0 });
  });

  it('exactly one flagged window -> instance, regardless of how many clear windows surround it', () => {
    expect(classifySubjectShape([w(false, 1), w(true, 10), w(false, 1)]))
      .toEqual({ shape: 'instance', flaggedCount: 1 });
  });

  it('two flagged windows with a clear window between them -> pattern, asserted even at n=2 (a count, not a direction)', () => {
    expect(classifySubjectShape([w(true, 5), w(false, 1), w(true, 8)]))
      .toEqual({ shape: 'pattern', flaggedCount: 2 });
  });

  it('two CONSECUTIVE flagged windows, below the default minTrendWindows -> insufficient-history, not trend -- the exact "do not label a shape from two windows" case', () => {
    expect(classifySubjectShape([w(false, 1), w(true, 5), w(true, 8)]))
      .toEqual({ shape: 'insufficient-history', flaggedCount: 2, minTrendWindows: 3 });
  });

  it('three consecutive flagged windows, rising value -> trend, direction rising', () => {
    expect(classifySubjectShape([w(true, 5), w(true, 8), w(true, 12)]))
      .toEqual({ shape: 'trend', flaggedCount: 3, direction: 'rising' });
  });

  it('three consecutive flagged windows, falling value -> direction falling', () => {
    expect(classifySubjectShape([w(true, 12), w(true, 8), w(true, 5)]))
      .toEqual({ shape: 'trend', flaggedCount: 3, direction: 'falling' });
  });

  it('three consecutive flagged windows, same first and last value -> direction flat', () => {
    expect(classifySubjectShape([w(true, 8), w(true, 20), w(true, 8)]))
      .toEqual({ shape: 'trend', flaggedCount: 3, direction: 'flat' });
  });

  it('a run of 3+ consecutive flags plus one more flag elsewhere (a gap in between) -> pattern, not trend -- the overall arrangement is not one unbroken run', () => {
    expect(classifySubjectShape([w(true, 5), w(true, 8), w(true, 12), w(false, 1), w(true, 20)]))
      .toEqual({ shape: 'pattern', flaggedCount: 4 });
  });

  it('minTrendWindows is a caller-supplied option, not a hardcoded 3', () => {
    expect(classifySubjectShape([w(true, 5), w(true, 8)], { minTrendWindows: 2 }))
      .toEqual({ shape: 'trend', flaggedCount: 2, direction: 'rising' });
  });

  it('a null value in the run yields direction null rather than a fabricated comparison', () => {
    expect(classifySubjectShape([w(true, null), w(true, 8), w(true, 12)]))
      .toEqual({ shape: 'trend', flaggedCount: 3, direction: null });
  });
});

describe('buildSubjectTimeline', () => {
  it('flattens every rule\'s own history into one oldest->newest list, and counts flags + first window', () => {
    const historyByRule = {
      'CASH-001': [
        { pass: false, value: 1, windowStart: '2026-06-01', windowEnd: '2026-06-28', computedAt: '2026-06-29T00:00:00Z' },
        { pass: true, value: 10, windowStart: '2026-07-01', windowEnd: '2026-07-28', computedAt: '2026-07-29T00:00:00Z' },
      ],
      'CASH-004': [
        { pass: true, value: 5, windowStart: '2026-08-01', windowEnd: '2026-08-28', computedAt: '2026-08-29T00:00:00Z' },
      ],
    };
    const out = buildSubjectTimeline(historyByRule);
    expect(out.totalWindows).toBe(3);
    expect(out.flaggedCount).toBe(2);
    expect(out.firstWindowStart).toBe('2026-06-01');
    // Sorted by windowEnd across BOTH rules, not grouped by rule.
    expect(out.rows.map(r => r.ruleId)).toEqual(['CASH-001', 'CASH-001', 'CASH-004']);
    expect(out.rows.map(r => r.windowEnd)).toEqual(['2026-06-28', '2026-07-28', '2026-08-28']);
  });

  it('an empty or missing historyByRule returns an empty, honest result -- not a crash', () => {
    expect(buildSubjectTimeline({})).toEqual({ rows: [], totalWindows: 0, flaggedCount: 0, firstWindowStart: null });
    expect(buildSubjectTimeline(undefined)).toEqual({ rows: [], totalWindows: 0, flaggedCount: 0, firstWindowStart: null });
  });
});

// dispatch #56 Part D's "free win": corroboration_rules is populated in security_rules and mapped
// by loadSecurityRules() as of Part A, but nothing checked whether a corroborating rule ACTUALLY
// fired for this subject until this function. Window overlap matters: `subjectVerdicts` carries
// each rule's own LATEST window independently, and different rules run on different cadences, so
// two rules' "latest" verdicts can land months apart -- that is not corroboration.
describe('corroboratingFlags', () => {
  const rule = { ruleId: 'CASH-003', corroborationRules: ['CASH-001', 'CASH-002'] };
  const verdict = { ruleId: 'CASH-003', pass: true, windowStart: '2026-08-01', windowEnd: '2026-08-28' };

  it('returns the corroborating rule ids that are ALSO flagged for this subject in an OVERLAPPING window', () => {
    const verdicts = [
      verdict,
      { ruleId: 'CASH-001', pass: true, windowStart: '2026-08-01', windowEnd: '2026-08-28' },
      { ruleId: 'CASH-002', pass: false, windowStart: '2026-08-01', windowEnd: '2026-08-28' },
    ];
    expect(corroboratingFlags(verdict, rule, verdicts)).toEqual(['CASH-001']);
  });

  it('a corroborating rule flagged in a NON-overlapping window does not count -- two unrelated flags months apart are not corroboration', () => {
    const verdicts = [
      verdict,
      // CASH-001 flagged, but back in June -- long before CASH-003's August window.
      { ruleId: 'CASH-001', pass: true, windowStart: '2026-06-01', windowEnd: '2026-06-28' },
    ];
    expect(corroboratingFlags(verdict, rule, verdicts)).toEqual([]);
  });

  it('a partially overlapping window still counts -- any shared days is corroboration, not just an exact match', () => {
    const verdicts = [
      verdict,
      // Ends one day into CASH-003's window -- overlaps by a single day, still real overlap.
      { ruleId: 'CASH-001', pass: true, windowStart: '2026-07-05', windowEnd: '2026-08-01' },
    ];
    expect(corroboratingFlags(verdict, rule, verdicts)).toEqual(['CASH-001']);
  });

  it('a hygiene-routed verdict (lifecycleCategory set) does not count as a corroborating flag, even with an overlapping window', () => {
    const verdicts = [verdict, { ruleId: 'CASH-001', pass: true, lifecycleCategory: 'deactivated', windowStart: '2026-08-01', windowEnd: '2026-08-28' }];
    expect(corroboratingFlags(verdict, rule, verdicts)).toEqual([]);
  });

  it('no corroboration_rules on the rule -> empty, no crash', () => {
    expect(corroboratingFlags(verdict, { ruleId: 'CASH-004' }, [{ ruleId: 'CASH-001', pass: true, windowStart: '2026-08-01', windowEnd: '2026-08-28' }])).toEqual([]);
  });

  it('a missing window on either side -> no overlap asserted, not a crash', () => {
    const noWindowVerdict = { ruleId: 'CASH-003', pass: true };
    const verdicts = [{ ruleId: 'CASH-001', pass: true, windowStart: '2026-08-01', windowEnd: '2026-08-28' }];
    expect(corroboratingFlags(noWindowVerdict, rule, verdicts)).toEqual([]);
  });
});
