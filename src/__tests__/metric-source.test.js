import { describe, it, expect } from 'vitest';
import { metricDaily, metricSeries, metricAvg } from '../engine/metric-source.js';

const d = s => new Date(s + 'T00:00:00');
const range = { s: d('2026-06-01'), e: d('2026-06-30') };

describe('metric-source resolver (auto-first)', () => {
  it('metricDaily prefers manual Ops over Glimpse, then falls back to Glimpse', () => {
    const ds = {
      opsRows: [{ loc: '1', date: d('2026-06-01'), oepe: 150 }],       // manual for day 1
      glimpseRows: [
        { loc: '1', date: d('2026-06-01'), oepe: 999 },                 // manual should win
        { loc: '1', date: d('2026-06-02'), oepe: 165 },                 // glimpse fills day 2
      ],
    };
    expect(metricDaily(ds, '1', d('2026-06-01'), 'oepe')).toBe(150);
    expect(metricDaily(ds, '1', d('2026-06-02'), 'oepe')).toBe(165);
    expect(metricDaily(ds, '1', d('2026-06-03'), 'oepe')).toBeNull();
  });

  it('labor% falls through ctrl → labor → glimpse', () => {
    const ds = {
      glimpseRows: [{ loc: '7', date: d('2026-06-05'), laborPct: 0.24 }],
    };
    expect(metricDaily(ds, '7', d('2026-06-05'), 'laborPct')).toBeCloseTo(0.24, 5);
  });

  it("'any' mode keeps 0 / negative values (cash O/S)", () => {
    const ds = { ctrlRows: [{ loc: '1', date: d('2026-06-01'), cashOSPct: 0 }, { loc: '1', date: d('2026-06-02'), cashOSPct: -0.03 }] };
    expect(metricDaily(ds, '1', d('2026-06-01'), 'cashOSPct')).toBe(0);
    expect(metricDaily(ds, '1', d('2026-06-02'), 'cashOSPct')).toBe(-0.03);
  });

  it("'pos' mode ignores 0 and looks to the next source", () => {
    const ds = {
      opsRows: [{ loc: '1', date: d('2026-06-01'), oepe: 0 }],          // 0 = no real data
      glimpseRows: [{ loc: '1', date: d('2026-06-01'), oepe: 170 }],
    };
    expect(metricDaily(ds, '1', d('2026-06-01'), 'oepe')).toBe(170);
  });

  it('metricSeries + metricAvg mean the freshest daily value per day', () => {
    const ds = {
      opsRows: [{ loc: '1', date: d('2026-06-01'), oepe: 150 }],
      glimpseRows: [{ loc: '1', date: d('2026-06-02'), oepe: 170 }],
    };
    const s = metricSeries(ds, '1', range, 'oepe');
    expect(Object.keys(s).length).toBe(2);
    expect(metricAvg(ds, ['1'], range, 'oepe')).toBe(160);   // (150+170)/2
  });

  it('metricAvg spans multiple locs, null when no data', () => {
    const ds = { ctrlRows: [
      { loc: '1', date: d('2026-06-01'), laborPct: 0.22 },
      { loc: '2', date: d('2026-06-01'), laborPct: 0.24 },
    ] };
    expect(metricAvg(ds, ['1', '2'], range, 'laborPct')).toBeCloseTo(0.23, 5);
    expect(metricAvg(ds, ['3'], range, 'laborPct')).toBeNull();
  });
});
