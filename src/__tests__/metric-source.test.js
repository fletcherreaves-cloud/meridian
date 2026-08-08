import { describe, it, expect } from 'vitest';
import { metricDaily, metricSeries, metricAvg } from '../engine/metric-source.js';

const d = s => new Date(s + 'T00:00:00');
const range = { s: d('2026-06-01'), e: d('2026-06-30') };

describe('metric-source resolver (auto-first)', () => {
  it('metricDaily prefers auto Glimpse over the manual Ops upload, and manual fills gaps', () => {
    // Corrected 2026-08-08: this asserted manual-wins, contradicting the auto-first rule.
    const ds = {
      opsRows: [
        { loc: '1', date: d('2026-06-01'), oepe: 150 },                 // manual — must NOT win
        { loc: '1', date: d('2026-06-04'), oepe: 143 },                 // manual FILLS a day glimpse lacks
      ],
      glimpseRows: [
        { loc: '1', date: d('2026-06-01'), oepe: 999 },                 // auto wins day 1
        { loc: '1', date: d('2026-06-02'), oepe: 165 },                 // glimpse-only day
      ],
    };
    expect(metricDaily(ds, '1', d('2026-06-01'), 'oepe')).toBe(999);
    expect(metricDaily(ds, '1', d('2026-06-04'), 'oepe')).toBe(143);   // last-resort fill still works
    expect(metricDaily(ds, '1', d('2026-06-02'), 'oepe')).toBe(165);
    expect(metricDaily(ds, '1', d('2026-06-03'), 'oepe')).toBeNull();
  });

  it('labor% resolves glimpse → ctrl → labor (auto punched % preferred over manual)', () => {
    // Notes 35: labor% is PUNCHED for all locs; the auto Daily-Glimpse punched % is ordered
    // ahead of the manual Labor rows so a stale manual value can't override the cloud-fresh one.
    const ds = { glimpseRows: [{ loc: '7', date: d('2026-06-05'), laborPct: 0.24 }] };
    expect(metricDaily(ds, '7', d('2026-06-05'), 'laborPct')).toBeCloseTo(0.24, 5);
    // Glimpse (auto) beats laborRows (manual) for the same day:
    const ds2 = {
      laborRows:   [{ loc: '7', date: d('2026-06-05'), laborPct: 0.31 }],  // manual — should NOT win
      glimpseRows: [{ loc: '7', date: d('2026-06-05'), laborPct: 0.24 }],  // auto punched — wins
    };
    expect(metricDaily(ds2, '7', d('2026-06-05'), 'laborPct')).toBeCloseTo(0.24, 5);
    // Glimpse wins over Controls too (2026-08-03 correction — parseCtrlData preferred "Actual
    // Labor %" over "Punched Labor %" when a sheet had both columns, so a manual Controls
    // upload from before that parser fix can silently hold a non-punched value; Glimpse is
    // independently confirmed always punched. See project-labor-pct-punched-vs-crew.md).
    const ds3 = { ctrlRows: [{ loc: '7', date: d('2026-06-05'), laborPct: 0.22 }],
                  glimpseRows: [{ loc: '7', date: d('2026-06-05'), laborPct: 0.24 }] };
    expect(metricDaily(ds3, '7', d('2026-06-05'), 'laborPct')).toBeCloseTo(0.24, 5);
    // Controls still fills a day Glimpse doesn't cover:
    const ds4 = { ctrlRows: [{ loc: '7', date: d('2026-06-06'), laborPct: 0.22 }],
                  glimpseRows: [{ loc: '7', date: d('2026-06-05'), laborPct: 0.24 }] };
    expect(metricDaily(ds4, '7', d('2026-06-06'), 'laborPct')).toBeCloseTo(0.22, 5);
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

  it('accepts STRING ranges against Date-typed rows (One-Pager bug regression)', () => {
    // Cloud rows carry Date objects (via _mkDate); the One-Pager passes "YYYY-MM-DD"
    // string ranges. A raw Date >= string coerces to NaN and dropped every row.
    const ds = { glimpseRows: [
      { loc: '1', date: d('2026-06-10'), laborPct: 0.25, oepe: 160 },
      { loc: '1', date: d('2026-06-20'), laborPct: 0.23, oepe: 150 },
    ] };
    const strRange = { s: '2026-06-01', e: '2026-06-30' };
    expect(Object.keys(metricSeries(ds, '1', strRange, 'laborPct')).length).toBe(2);
    expect(metricAvg(ds, ['1'], strRange, 'laborPct')).toBeCloseTo(0.24, 5);
    expect(metricAvg(ds, ['1'], strRange, 'oepe')).toBe(155);
    // string range must also EXCLUDE out-of-window rows
    expect(metricAvg(ds, ['1'], { s: '2026-07-01', e: '2026-07-31' }, 'oepe')).toBeNull();
  });

  it('derives cloud TPPH from the DAR summary source', () => {
    const ds = { qsrActSummaryRows: [{ loc: '1', date: d('2026-06-05'), tpph: 5.4 }] };
    expect(metricDaily(ds, '1', d('2026-06-05'), 'tpph')).toBe(5.4);
    // manual Controls TPPH still wins first
    const ds2 = { ctrlRows: [{ loc: '1', date: d('2026-06-05'), tpph: 6.0 }],
                  qsrActSummaryRows: [{ loc: '1', date: d('2026-06-05'), tpph: 5.4 }] };
    expect(metricDaily(ds2, '1', d('2026-06-05'), 'tpph')).toBeCloseTo(5.4, 4); // auto DAR wins over manual ctrl
  });
});
