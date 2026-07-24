import { describe, it, expect } from 'vitest';
import {
  computeScheduleSummary, weekStartOf, WEEK_START_DOW,
  FIXED_FLOOR_SEG_MIN, FIXED_FLOOR_SEG_MAX, FIXED_FLOOR_COMBINED_MAX,
} from '../engine/schedule-summary.js';

// Real store week from the LifeLenz screenshot — DeFuniak Springs (0006838),
// week of Wed Jul 22 → Tue Jul 28 2026. Per-day scheduled/forecast HOURS (decimal),
// forecast sales, labor % (percent), and GC distributed to sum 7,191.
const DAYS = [
  { dt: '2026-07-22', sched: 171,   fcst: 189.75, sales: 10774.97, laborPct: 24.34, gc: 1027 },
  { dt: '2026-07-23', sched: 201,   fcst: 210.5,  sales: 11901.83, laborPct: 24.92, gc: 1027 },
  { dt: '2026-07-24', sched: 222,   fcst: 231.5,  sales: 14611.22, laborPct: 23.30, gc: 1027 },
  { dt: '2026-07-25', sched: 226.5, fcst: 228,    sales: 14518.98, laborPct: 23.78, gc: 1027 },
  { dt: '2026-07-26', sched: 274.5, fcst: 247.75, sales: 16929.17, laborPct: 23.78, gc: 1027 },
  { dt: '2026-07-27', sched: 187,   fcst: 195.75, sales: 11134.49, laborPct: 25.95, gc: 1028 },
  { dt: '2026-07-28', sched: 178.5, fcst: 185.5,  sales: 9980.06,  laborPct: 26.57, gc: 1028 },
];
const rows = DAYS.map(d => ({
  loc: '0006838', date: new Date(d.dt + 'T12:00:00'),
  schVLH: d.sched, schFixHrs: 0, schFloor: 0,       // scheduled hours total on schVLH
  projVLH: d.fcst, fixGuideHrs: 0, projFloor: 0,    // forecast hours total on projVLH
  fcstSales: d.sales, laborPct: d.laborPct, fcstTCs: d.gc,
}));

describe('schedule-summary — reconciles to the LifeLenz screenshot band', () => {
  const res = computeScheduleSummary(rows);
  const wk = res.weeks[0];
  const s = wk.stores.find(x => x.loc === '6838');

  it('has one week and the store', () => {
    expect(res.weeks.length).toBe(1);
    expect(s).toBeTruthy();
  });
  it('Sales Forecast = $89,850.72', () => { expect(s.fcstSales).toBeCloseTo(89850.72, 2); });
  it('GC Forecast = 7,191', () => { expect(s.fcstGC).toBe(7191); });
  it('Scheduled Hours = 1460.5 (1460:30)', () => { expect(s.schedHrs).toBeCloseTo(1460.5, 5); });
  it('Forecast Hours = 1488.75 (1488:45)', () => { expect(s.fcstHrs).toBeCloseTo(1488.75, 5); });
  it('Scheduled minus Forecast = -28.25 hrs (28:15 under)', () => { expect(s.hrsDiff).toBeCloseTo(-28.25, 5); });
  it('Labor % (dollar-weighted) = 24.50%', () => { expect(s.laborPct).toBeCloseTo(24.50, 2); });
  it('Schd TPMH = 4.92', () => { expect(s.tpmh).toBeCloseTo(4.92, 2); });
  it('daily over/unders match (Wed -18.75, Sun +26.75)', () => {
    expect(s.days[0].hrsDiff).toBeCloseTo(171 - 189.75, 5);   // -18.75 = -18:45
    expect(s.days[4].hrsDiff).toBeCloseTo(274.5 - 247.75, 5); // +26.75 = +26:45
    expect(s.days.length).toBe(7);
  });
});

describe('schedule-summary — labor% ignores partial-day / garbage / null days', () => {
  // Wed+Thu completed (24% / 26%), Fri = today mid-day partial (409.74% on tiny sales),
  // Sat future (null). The weekly figure must weight only the two completed days.
  const rows = [
    { loc: '0001', date: new Date('2026-07-22T12:00:00'), schVLH: 100, projVLH: 100, fcstSales: 10000, laborPct: 24,     fcstTCs: 1000 },
    { loc: '0001', date: new Date('2026-07-23T12:00:00'), schVLH: 100, projVLH: 100, fcstSales: 10000, laborPct: 26,     fcstTCs: 1000 },
    { loc: '0001', date: new Date('2026-07-24T12:00:00'), schVLH: 100, projVLH: 100, fcstSales: 500,   laborPct: 409.74, fcstTCs: 50   },
    { loc: '0001', date: new Date('2026-07-25T12:00:00'), schVLH: 100, projVLH: 100, fcstSales: 10000, laborPct: null,   fcstTCs: 1000 },
  ];
  const s = computeScheduleSummary(rows).weeks[0].stores[0];

  it('weekly labor% = dollar-weighted over the two completed days = 25.00%', () => {
    // (24*10000 + 26*10000) / 20000 = 25 — the 409.74% partial day would otherwise blow it up
    expect(s.laborPct).toBeCloseTo(25, 5);
  });
  it('the partial (409.74%) and future (null) days show blank in the daily grid', () => {
    expect(s.days.find(d => d.date.getDate() === 24).laborPct).toBe(null);
    expect(s.days.find(d => d.date.getDate() === 25).laborPct).toBe(null);
  });
});

describe('schedule-summary — Fixed / Floor viewed separately vs the standard', () => {
  // One store, one day. Total scheduled = VLH 76 + Fixed 12 + Floor 12 = 100h.
  //   Fixed % = 12/100 = 12% (in the 10–15% band)
  //   Floor % = 12/100 = 12% (in band)
  //   Combined = 24% (≤ 25% cap)
  const rows = [
    { loc: '0001', date: new Date('2026-07-22T12:00:00'), schVLH: 76, schFixHrs: 12, schFloor: 12,
      projVLH: 76, fixGuideHrs: 12, projFloor: 12, fcstSales: 10000, laborPct: 24, fcstTCs: 1000 },
  ];
  const s = computeScheduleSummary(rows).weeks[0].stores[0];

  it('constants define the 10–15% segment band and 25% combined cap', () => {
    expect(FIXED_FLOOR_SEG_MIN).toBeCloseTo(0.10, 6);
    expect(FIXED_FLOOR_SEG_MAX).toBeCloseTo(0.15, 6);
    expect(FIXED_FLOOR_COMBINED_MAX).toBeCloseTo(0.25, 6);
  });
  it('total scheduled hours include VLH + Fixed + Floor', () => {
    expect(s.schedHrs).toBeCloseTo(100, 6);
    expect(s.fixHrs).toBeCloseTo(12, 6);
    expect(s.floorHrs).toBeCloseTo(12, 6);
  });
  it('Fixed % and Floor % are each that segment ÷ total scheduled hours (kept separate)', () => {
    expect(s.fixedLaborPct).toBeCloseTo(0.12, 6);
    expect(s.floorLaborPct).toBeCloseTo(0.12, 6);
  });
  it('Combined Fixed+Floor % is their sum over total scheduled hours', () => {
    expect(s.combinedFixedFloorPct).toBeCloseTo(0.24, 6);
    expect(s.combinedFixedFloorPct).toBeLessThanOrEqual(FIXED_FLOOR_COMBINED_MAX);
  });

  it('breaches the 25% combined cap when Fixed+Floor run heavy', () => {
    const heavy = [
      { loc: '0002', date: new Date('2026-07-22T12:00:00'), schVLH: 60, schFixHrs: 22, schFloor: 18,
        projVLH: 60, fixGuideHrs: 22, projFloor: 18, fcstSales: 10000, laborPct: 24, fcstTCs: 1000 },
    ];
    const h2 = computeScheduleSummary(heavy).weeks[0].stores[0];
    expect(h2.fixedLaborPct).toBeCloseTo(0.22, 6);  // > 15% band → amber in UI
    expect(h2.floorLaborPct).toBeCloseTo(0.18, 6);  // > 15% band → amber in UI
    expect(h2.combinedFixedFloorPct).toBeCloseTo(0.40, 6);
    expect(h2.combinedFixedFloorPct).toBeGreaterThan(FIXED_FLOOR_COMBINED_MAX); // red in UI
  });

  it('district rolls Fixed/Floor as ratio-of-aggregates (not an average of store %s)', () => {
    const two = [
      ...rows,
      { loc: '0003', date: new Date('2026-07-22T12:00:00'), schVLH: 180, schFixHrs: 8, schFloor: 12,
        projVLH: 180, fixGuideHrs: 8, projFloor: 12, fcstSales: 20000, laborPct: 24, fcstTCs: 2000 },
    ];
    const dist = computeScheduleSummary(two).weeks[0].district;
    // Σ sched = 100 + 200 = 300; Σ fixed = 12 + 8 = 20; Σ floor = 12 + 12 = 24.
    expect(dist.schedHrs).toBeCloseTo(300, 6);
    expect(dist.fixedLaborPct).toBeCloseTo(20 / 300, 6);
    expect(dist.floorLaborPct).toBeCloseTo(24 / 300, 6);
    expect(dist.combinedFixedFloorPct).toBeCloseTo(44 / 300, 6);
  });
});

describe('schedule-summary — grouping + district', () => {
  it('groups the week on the Wednesday anchor', () => {
    expect(WEEK_START_DOW).toBe(3);
    expect(weekStartOf(new Date('2026-07-28T12:00:00')).toISOString().slice(0, 10)).toBe('2026-07-22');
    expect(weekStartOf(new Date('2026-07-22T12:00:00')).toISOString().slice(0, 10)).toBe('2026-07-22');
  });
  it('rolls a district total across stores (dollar/hour weighted)', () => {
    const two = [...rows, ...rows.map(r => ({ ...r, loc: '0005985' }))];
    const wk = computeScheduleSummary(two).weeks[0];
    expect(wk.district.nStores).toBe(2);
    expect(wk.district.fcstSales).toBeCloseTo(89850.72 * 2, 1);
    expect(wk.district.laborPct).toBeCloseTo(24.50, 2); // identical stores → same weighted %
  });
});
