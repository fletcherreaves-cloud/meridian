// @ts-nocheck
// Reports redesign Phase 1 (2026-10-15, memory/project-reports-redesign.md) — before a Custom
// Report Builder can let someone pick a metric, the two existing metric catalogs
// (metric-source.js's resolution chains, signal-registry.js's labels/categories) had to agree
// with each other and actually cover the metrics a report would want. A full-file audit (two
// subagent passes, cross-checked against the real source text of both files) found:
//   1. 16 real metric-source.js keys had NO `direction` even though signal-registry.js already
//      declares `better` for every one of them -- a gap dispatch #77's own migration left open
//      (it set `direction` on only the rate/% "headline" metrics, never the $/count siblings).
//   2. signal-registry.js's parkPct/glParkedPct declared better:'lower', directly contradicting
//      metric-source.js's own documented, owner-confirmed ruling that park has NO single
//      direction (the exact dispatch #77 class of bug its header warns against reintroducing).
//   3. 21 real, resolvable metric-source.js keys had no signal-registry label/category at all,
//      so a report-builder picker reading METRIC_CATEGORIES could never offer them.
// This file guards all three fixes plus the two new date-range-scoped resolver functions
// (metricRowsForRange/metricValueForRange) that a report needs and neither catalog had before.
import { describe, it, expect } from 'vitest';
import { METRIC_SOURCES, metricDirection, rankableMetricKeys } from '../engine/metric-source.js';
import {
  findMetric, extractMetricValues, metricRowsForRange, metricValueForRange,
} from '../engine/signal-registry.js';

const GOOD = '3708';

describe('Phase 1 fix #1 — 16 loss-prevention keys now have a direction, matching their registry better', () => {
  const NOW_DIRECTED_LOWER = [
    'discAmt', 'discCnt', 'promoAmt', 'promoPct', 'promoCnt', 'cashOSAmt', 'drawerOpens',
    'posOverCnt', 'posOverAmt', 'cashRefCnt', 'cashRefAmt', 'cashlessRefCnt', 'cashlessRefAmt',
    'tRedACnt', 'tRedBCnt', 'manualRefAmt',
  ];
  it.each(NOW_DIRECTED_LOWER)('%s is now direction:lower, not undecided', key => {
    expect(metricDirection(key)).toBe('lower');
  });

  it('rankableMetricKeys() grew to include all 16 -- revert-sensitive', () => {
    const keys = rankableMetricKeys();
    for (const k of NOW_DIRECTED_LOWER) expect(keys).toContain(k);
  });

  it('every one of the 16 agrees with signal-registry.js\'s own better for the same real-world metric', () => {
    const bad = [];
    for (const key of NOW_DIRECTED_LOWER) {
      const meta = findMetric(key);
      if (!meta) { bad.push(`${key}: no registry label at all`); continue; }
      if (meta.better !== 'lower') bad.push(`${key}: registry better='${meta.better}', metric-source direction='lower'`);
    }
    expect(bad).toEqual([]);
  });
});

describe('Phase 1 fix #2 — park direction disagreement resolved, not just deleted', () => {
  it('parkPct/glParkedPct no longer declare better:lower, matching metric-source.js\'s own deliberate non-decision', () => {
    expect(findMetric('parkPct').better).toBeNull();
    expect(findMetric('glParkedPct').better).toBeNull();
  });

  it('metric-source.js\'s own park ruling is unchanged by this fix (still deliberately undirected)', () => {
    expect(metricDirection('park')).toBeNull();
    expect(rankableMetricKeys()).not.toContain('park');
  });
});

describe('Phase 1 fix #3 — the 21 previously-unlabeled metric-source keys are now a real registry entry', () => {
  const NEWLY_LABELED = [
    'projGC', 'projSales', 'kvsHealthy', 'otDollar', 'crewHrs', 'actVsNeed',
    'floorMgmtNeeded', 'floorHrsSched', 'variableNeeded', 'fixedContractHrs', 'schedHrs',
    'salaryMgrHrs', 'oppCostDollar', 'oppCostPct', 'actVsSched', 'actVsSchedOpp', 'spph',
    'empMealAmt', 'mgrMealAmt', 'depositAmt', 'empMealCnt', 'mgrMealCnt',
  ];
  it.each(NEWLY_LABELED)('%s exists in METRIC_SOURCES (mechanical sanity check)', key => {
    expect(METRIC_SOURCES[key]).toBeTruthy();
  });

  it.each(NEWLY_LABELED)('%s now resolves via findMetric() with a real label/category', key => {
    const meta = findMetric(key);
    expect(meta, `${key}: no registry entry`).toBeTruthy();
    expect(typeof meta.label).toBe('string');
    expect(meta.label.length).toBeGreaterThan(0);
    expect(typeof meta.category).toBe('string');
  });

  it('signed-gap metrics (actVsNeed, oppCostDollar, oppCostPct, actVsSched, actVsSchedOpp) got better:null, not an invented direction', () => {
    for (const key of ['actVsNeed', 'oppCostDollar', 'oppCostPct', 'actVsSched', 'actVsSchedOpp']) {
      expect(findMetric(key).better).toBeNull();
    }
  });

  it('otDollar/spph/kvsHealthy got an unambiguous direction, backfilled on BOTH sides consistently', () => {
    expect(findMetric('otDollar').better).toBe('lower');
    expect(metricDirection('otDollar')).toBe('lower');
    expect(findMetric('spph').better).toBe('higher');
    expect(metricDirection('spph')).toBe('higher');
    expect(findMetric('kvsHealthy').better).toBe('higher');
    expect(metricDirection('kvsHealthy')).toBe('higher');
  });

  it('a previously-orphaned srcs-based key (schedHrs) actually resolves real values through the bridge, not just a label', () => {
    // The AUTO_FIRST_KEY_MAP bridge path returns a date-key STRING (metricSeriesWithSource's own
    // series keys), unlike the static ds[source] branch's real Date objects just below -- real,
    // confirmed behavior of the existing bridge (see dispatch-229's own 'oepe' reproduction test
    // for the same shape), not something this phase changed.
    const ds = { schedRows: [{ loc: GOOD, date: new Date(2026, 9, 15), schedTotHrs: 212.5 }] };
    const out = extractMetricValues('schedHrs', ds, 'daily', GOOD);
    expect(out).toEqual([{ loc: GOOD, date: '2026-10-15', value: 212.5 }]);
  });

  it('a previously-orphaned DERIVE-based key (spph = sales ÷ actHrs) resolves through the bridge too, not just srcs-based ones', () => {
    const ds = { qsrActSummaryRows: [{ loc: GOOD, date: new Date(2026, 9, 15), sales: 4000, actHrs: 160 }] };
    const out = extractMetricValues('spph', ds, 'daily', GOOD);
    expect(out).toEqual([{ loc: GOOD, date: '2026-10-15', value: 25 }]); // 4000/160
  });
});

const d = n => new Date(2026, 9, n); // Oct 2026 (0-indexed month)
const dk = n => `2026-10-${String(n).padStart(2, '0')}`;

describe('metricRowsForRange — the one real new primitive a report needs', () => {
  const ds = {
    opsLaborRows: [
      { loc: GOOD, date: d(1), otHrs: 2 },
      { loc: GOOD, date: d(5), otHrs: 3 },
      { loc: GOOD, date: d(15), otHrs: 10 }, // outside the report's chosen window
    ],
  };

  it('filters to [start,end] inclusive, excluding points outside the window', () => {
    const rows = metricRowsForRange('otHrs', ds, { loc: GOOD, start: dk(1), end: dk(10) });
    expect(rows.map(r => r.value).sort((a, b) => a - b)).toEqual([2, 3]);
  });

  it('scopes to one loc when `loc` is given', () => {
    const ds2 = {
      opsLaborRows: [
        { loc: GOOD, date: d(2), otHrs: 4 },
        { loc: '5183', date: d(2), otHrs: 99 },
      ],
    };
    const rows = metricRowsForRange('otHrs', ds2, { loc: GOOD, start: dk(1), end: dk(10) });
    expect(rows).toHaveLength(1);
    expect(rows[0].value).toBe(4);
  });

  it('scopes to a list of locs when `locs` is given', () => {
    const ds2 = {
      opsLaborRows: [
        { loc: GOOD, date: d(2), otHrs: 4 },
        { loc: '5183', date: d(2), otHrs: 7 },
        { loc: '9999', date: d(2), otHrs: 99 },
      ],
    };
    const rows = metricRowsForRange('otHrs', ds2, { locs: [GOOD, '5183'], start: dk(1), end: dk(10) });
    expect(rows.map(r => r.value).sort((a, b) => a - b)).toEqual([4, 7]);
  });

  it('returns nothing, not a throw, when start/end is missing', () => {
    expect(metricRowsForRange('otHrs', ds, { loc: GOOD })).toEqual([]);
  });
});

describe('metricValueForRange — reduces to the one number a report cell shows', () => {
  it('sums a sum-aggregated metric (otHrs) rather than averaging it', () => {
    const ds = { opsLaborRows: [
      { loc: GOOD, date: d(1), otHrs: 2 },
      { loc: GOOD, date: d(2), otHrs: 3 },
    ] };
    expect(metricValueForRange('otHrs', ds, { loc: GOOD, start: dk(1), end: dk(10) })).toBe(5);
  });

  it('means a non-sum metric (laborPct) rather than summing it', () => {
    const ds = { glimpseRows: [
      { loc: GOOD, date: d(1), laborPct: 0.20 },
      { loc: GOOD, date: d(2), laborPct: 0.30 },
    ] };
    expect(metricValueForRange('laborPct', ds, { loc: GOOD, start: dk(1), end: dk(10) })).toBeCloseTo(0.25, 6);
  });

  it('is null, not a fabricated 0, when nothing resolves in the window', () => {
    const ds = { opsLaborRows: [{ loc: GOOD, date: d(1), otHrs: 2 }] };
    expect(metricValueForRange('otHrs', ds, { loc: GOOD, start: dk(20), end: dk(25) })).toBeNull();
  });
});
