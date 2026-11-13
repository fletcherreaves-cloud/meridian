// @ts-nocheck
// Supervisor/OM patch-level Daily Review rollup (owner spec, memory/plan-role-based-panel-
// gating-2026-11-03.md §6, 2026-11-13 night): "largely the same review as a GM's, but across
// all assigned locations... Supervisor and OM levels especially should also see WTD and MTD."
//
// Additive to engine/daily-review.js's existing GM-only buildDailyReview — these tests prove
// (1) the new patch functions compute real sum/ratio rollups, never a mean of store percentages
// or a mean of an in-progress day, and (2) buildDailyReview's own existing behavior (asserted by
// daily-review.test.js) is completely untouched by this addition.
import { describe, it, expect, vi, afterEach } from 'vitest';

const metricDailyMock = vi.fn();
const metricDirectionMock = vi.fn();
const metricSeriesMock = vi.fn();
const metricRateMock = vi.fn();
const autoFirstDailyMock = vi.fn();
const matchedVsLYMock = vi.fn();

vi.mock('../engine/metric-source.js', () => ({
  metricDaily: (...a) => metricDailyMock(...a),
  metricDirection: (...a) => metricDirectionMock(...a),
  metricSeries: (...a) => metricSeriesMock(...a),
  metricRate: (...a) => metricRateMock(...a),
}));
vi.mock('../engine/vs-ly.js', () => ({
  autoFirstDaily: (...a) => autoFirstDailyMock(...a),
  matchedVsLY: (...a) => matchedVsLYMock(...a),
}));

const { buildPatchDailyReview, buildPatchHotspots } = await import('../engine/daily-review.js');

const RANGE = { s: new Date(2026, 10, 9), e: new Date(2026, 10, 11) };
const LOCS = ['5985', '10422'];

describe('buildPatchDailyReview()', () => {
  it('sums a dollar/hours/count line across stores and days rather than averaging it', () => {
    metricDirectionMock.mockReturnValue('higher');
    metricRateMock.mockReturnValue(null);
    // actHrs is a plain 'hours' line (TOTAL_UNITS) -- must be SUMMED via metricSeries, never
    // passed through metricRate (which is for ratios only).
    metricSeriesMock.mockImplementation((ds, loc, range, key) => {
      if (key !== 'actHrs') return {};
      return loc === '5985' ? { '2026-11-09': 50, '2026-11-10': 52 } : { '2026-11-09': 70 };
    });
    matchedVsLYMock.mockReturnValue({ cur: 0, ly: 0, pct: null, days: 0, flagged: [] });

    const review = buildPatchDailyReview({}, LOCS, RANGE, {});
    const actHrs = review.sections.find(s => s.key === 'labor').lines.find(l => l.key === 'actHrs');
    expect(actHrs.actual).toBe(172); // 50 + 52 + 70, a true sum
  });

  it('resolves a rate/% line through metricRate (Sum/Sum first), never a mean of per-store values', () => {
    metricDirectionMock.mockReturnValue('lower');
    metricSeriesMock.mockReturnValue({});
    matchedVsLYMock.mockReturnValue({ cur: 0, ly: 0, pct: null, days: 0, flagged: [] });
    metricRateMock.mockImplementation((ds, locs, range, key) => (key === 'laborPct' ? 0.227 : null));

    const review = buildPatchDailyReview({}, LOCS, RANGE, {});
    const laborPct = review.sections.find(s => s.key === 'labor').lines.find(l => l.key === 'laborPct');
    expect(laborPct.actual).toBe(0.227);
    expect(metricRateMock).toHaveBeenCalledWith({}, LOCS, RANGE, 'laborPct');
  });

  it('Sales/GC vs LY goes through matchedVsLY with the full patch loc list', () => {
    metricDirectionMock.mockReturnValue('higher');
    metricSeriesMock.mockReturnValue({});
    metricRateMock.mockReturnValue(null);
    matchedVsLYMock.mockImplementation((ds, locs, range, kind) =>
      kind === 'sales' ? { cur: 21000, ly: 19000, pct: (21000 - 19000) / 19000, days: 2, flagged: [] }
                       : { cur: 0, ly: 0, pct: null, days: 0, flagged: [] });

    const review = buildPatchDailyReview({}, LOCS, RANGE, {});
    const prodSales = review.sections.find(s => s.key === 'sales').lines.find(l => l.key === 'prodSales');
    expect(prodSales.actual).toBe(21000);
    expect(prodSales.ly).toBe(19000);
    expect(prodSales.vsLYPct).toBeCloseTo((21000 - 19000) / 19000, 6);
    expect(matchedVsLYMock).toHaveBeenCalledWith({}, LOCS, RANGE, 'sales');
  });

  it('averages a target across the patch\'s own per-store targets', () => {
    metricDirectionMock.mockReturnValue('lower');
    metricSeriesMock.mockReturnValue({});
    metricRateMock.mockReturnValue(0.22);
    matchedVsLYMock.mockReturnValue({ cur: 0, ly: 0, pct: null, days: 0, flagged: [] });

    const targetsByLoc = { '5985': { tLabor: 0.20 }, '10422': { tLabor: 0.24 } };
    const review = buildPatchDailyReview({}, LOCS, RANGE, targetsByLoc);
    const laborPct = review.sections.find(s => s.key === 'labor').lines.find(l => l.key === 'laborPct');
    expect(laborPct.target).toBeCloseTo(0.22, 6); // (0.20 + 0.24) / 2
  });
});

describe('buildPatchHotspots()', () => {
  afterEach(() => vi.clearAllMocks());

  it('ranks the worst-severity store first', () => {
    metricDirectionMock.mockReturnValue('lower');
    autoFirstDailyMock.mockReturnValue({ curByDate: {}, lyByDate: {} });
    metricDailyMock.mockImplementation((ds, loc, date, key) => {
      if (key !== 'laborPct') return null;
      return loc === '5985' ? 0.40 : 0.20; // 5985 badly over target, 10422 fine
    });

    const date = new Date(2026, 10, 10);
    const targetsByLoc = { '5985': { tLabor: 0.21 }, '10422': { tLabor: 0.21 } };
    const hotspots = buildPatchHotspots({}, LOCS, date, targetsByLoc);

    expect(hotspots[0].loc).toBe('5985');
    expect(hotspots[0].worst).toBe('bad');
    expect(hotspots[1].loc).toBe('10422');
  });
});
