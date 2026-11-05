// Task #86 -- Prime Cost % (Labor % + FOB %), added as a named, rankable KPI.
// primeCostPct is a derive-only metric-source.js chain (no `srcs`) built on two metrics that
// are themselves resolved auto-first (laborPct, fobPct) -- so this fixture supplies the real
// underlying atoms each of THOSE already derives from (qsrFobRows' six $ legs for fobPct,
// laborRows.laborPct directly for laborPct), same pattern as controls-food-cost-link-engine's
// and labor-opportunity-cost-engine's own fixtures for other derive-only chains in this file.
import { describe, it, expect } from 'vitest';
import { metricDaily, metricSeries, metricAvg, metricDirection, rankableMetricKeys } from '../engine/metric-source.js';
import { PERFORMER_METRICS } from '../engine/top-bottom-performers.js';

const D = (d) => new Date(2026, 10, 1 + d);

function buildFixture() {
  const laborRows = [];
  const qsrFobRows = [];
  for (let i = 0; i < 3; i++) {
    // laborPct resolves straight off laborRows (0.25); fobPct = (10+5+3+2+0+0)/1000 = 0.02.
    // primeCostPct = 0.25 + 0.02 = 0.27 every day.
    laborRows.push({ loc: '3708', date: D(i), laborPct: 0.25 });
    qsrFobRows.push({
      loc: '3708', date: D(i),
      compWasteAmt: 10, rawWasteAmt: 5, condimentsAmt: 3, empMgrMealsAmt: 2,
      statVarianceAmt: 0, unexplainedAmt: 0, prodSalesAmt: 1000,
    });
  }
  return { laborRows, qsrFobRows };
}

describe('primeCostPct (task #86)', () => {
  const ds = buildFixture();
  const range = { s: '2026-11-01', e: '2026-11-03' };

  it('derives as laborPct + fobPct for a single day', () => {
    expect(metricDaily(ds, '3708', D(0), 'primeCostPct')).toBeCloseTo(0.27, 4);
  });

  it('resolves across a range via metricSeries/metricAvg', () => {
    const series = metricSeries(ds, '3708', range, 'primeCostPct');
    expect(Object.keys(series)).toHaveLength(3);
    for (const v of Object.values(series)) expect(v).toBeCloseTo(0.27, 4);
    expect(metricAvg(ds, ['3708'], range, 'primeCostPct')).toBeCloseTo(0.27, 4);
  });

  it('is null (not 0 or a crash) when an underlying leg is missing', () => {
    const thin = { laborRows: [{ loc: '9999', date: D(0), laborPct: 0.25 }], qsrFobRows: [] };
    expect(metricDaily(thin, '9999', D(0), 'primeCostPct')).toBeNull();
  });

  it('is registered with a real "lower" direction, like both of its components', () => {
    expect(metricDirection('primeCostPct')).toBe('lower');
    expect(metricDirection('laborPct')).toBe('lower');
    expect(metricDirection('fobPct')).toBe('lower');
  });

  it('is rankable and offered on the Top/Bottom Performers leaderboard', () => {
    expect(rankableMetricKeys()).toContain('primeCostPct');
    const entry = PERFORMER_METRICS.find(m => m.key === 'primeCostPct');
    expect(entry).toBeTruthy();
    expect(entry.label).toBe('Prime Cost %');
    expect(entry.fmt(0.27)).toBe('27.00%');
  });
});
