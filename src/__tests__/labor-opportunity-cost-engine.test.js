// Reports redesign Phase 5 -- engine/labor-opportunity-cost.js
// otDollar/actVsNeed read directly off their own tables; oppCostDollar/actVsSched/
// actVsSchedOpp/spph/avgRate are all metric-source.js DERIVE-ONLY chains (no `srcs` at all --
// confirmed by reading metric-source.js directly, same "measure it, don't reason about it"
// check that caught fobPct's identical shape in controls-food-cost-link-engine.test.js), so
// this fixture supplies the real underlying atoms (actHrs, sales, laborPct, schedTotHrs) each
// chain actually derives from, not the final field names.
import { describe, it, expect } from 'vitest';
import { buildLaborOpportunityCostReport, LABOR_OPP_COLUMNS } from '../engine/labor-opportunity-cost.js';

const D = (d) => new Date(2026, 9, 1 + d);

function buildFixture() {
  const qsrActSummaryRows = [];
  const schedRows = [];
  const laborRows = [];
  const opsLaborRows = [];
  for (let i = 0; i < 4; i++) {
    // avgRate = laborPct * sales / actHrs = 0.25 * 5000 / 50 = $25/hr
    // oppCostDollar = actVsNeed * avgRate = -5 * 25 = -$125/day
    // actVsSched = actHrs - schedHrs = 50 - 55 = -5 hrs/day; actVsSchedOpp = -5 * 25 = -$125/day
    // spph = sales / actHrs = 5000 / 50 = $100/hr
    qsrActSummaryRows.push({ loc: '3708', date: D(i), actVsNeed: -5, actHrs: 50, sales: 5000 });
    schedRows.push({ loc: '3708', date: D(i), schedTotHrs: 55 });
    laborRows.push({ loc: '3708', date: D(i), laborPct: 0.25 });
    opsLaborRows.push({ loc: '3708', date: D(i), otDollar: 80 });
  }
  return { qsrActSummaryRows, schedRows, laborRows, opsLaborRows, storeIds: ['3708'] };
}

describe('buildLaborOpportunityCostReport', () => {
  const ds = buildFixture();
  const range = { s: '2026-10-01', e: '2026-10-04' };

  it('returns [] when range is missing', () => {
    expect(buildLaborOpportunityCostReport(ds, { locs: ['3708'], range: null })).toEqual([]);
  });

  it('sums the $ totals across the 4-day range and averages the hour-gap/rate fields', () => {
    const rows = buildLaborOpportunityCostReport(ds, { locs: ['3708'], range });
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.name).toBe('Ardmore-Broadway');
    expect(r.otDollarTotal).toBeCloseTo(320, 1); // 80 * 4
    expect(r.oppCostDollarTotal).toBeCloseTo(-500, 1); // -125 * 4
    expect(r.actVsSchedOppTotal).toBeCloseTo(-500, 1); // -125 * 4
    expect(r.actVsNeedAvgHrs).toBeCloseTo(-5, 1); // mean, not summed
    expect(r.actVsSchedAvgHrs).toBeCloseTo(-5, 1);
    expect(r.spphAvg).toBeCloseTo(100, 1);
  });

  it('falls back to ds.storeIds when no locs given', () => {
    const rows = buildLaborOpportunityCostReport(ds, { locs: [], range });
    expect(rows.map(r => r.loc)).toEqual(['3708']);
  });

  it('every documented column resolves to a real (non-undefined) value on the row', () => {
    const rows = buildLaborOpportunityCostReport(ds, { locs: ['3708'], range });
    for (const c of LABOR_OPP_COLUMNS) {
      expect(rows[0][c.key]).not.toBeUndefined();
    }
  });

  it('resolves null (not 0 or a crash) for a store/range with no underlying data', () => {
    const rows = buildLaborOpportunityCostReport(ds, { locs: ['3708'], range: { s: '2020-01-01', e: '2020-01-04' } });
    expect(rows[0].otDollarTotal).toBeNull();
    expect(rows[0].oppCostDollarTotal).toBeNull();
  });
});
