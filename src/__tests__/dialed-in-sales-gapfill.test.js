// @ts-nocheck
// Notes 61: the Dialed-In Calibration panel's 1W/2W/4W/6W trend columns all rendered "—".
//
// ROOT CAUSE (measured against live Supabase on 2026-08-08): calibrateStore built its row set
// from ds.laborRows directly. That LOOKS auto-safe, because ds.laborRows is cloud-backed by
// loadLaborRows reading the labor_rows table — but labor_rows is populated from the manual
// Labor Report upload, and its newest row was 2026-07-23, sixteen days stale. qsr_labor_summary
// carried all 27 stores through 2026-08-08 the whole time.
//
// _computePeriodMape(1) filters to the last 7 days. With laborRows ending 16 days ago that set
// is empty, so it returned null and the column rendered "—". The 2W window failed the same way.
//
// calibrateStore now sources through metricSeries('sales'), which resolves per DAY down the
// chain laborRows -> qsrActSummaryRows. These tests pin the two properties that fix depends on:
// the manual value still wins on days it covers, and the auto stream fills the gap after it.

import { describe, it, expect } from 'vitest';
import { metricSeries, metricDaily } from '../engine/metric-source.js';

const d = s => new Date(s + 'T00:00:00');

// Mirrors the live shape found on 2026-08-08: manual labor_rows stops mid-window, the auto
// summary continues to today.
const STALE_END = '2026-07-23';
const TODAY     = '2026-08-08';

function dsWithStaleManual() {
  const laborRows = [];
  for (let i = 0; i < 10; i++) {           // ...through 2026-07-23, then nothing
    const dt = new Date(d(STALE_END)); dt.setDate(dt.getDate() - i);
    laborRows.push({ loc: '43380', date: dt, sales: 10000 + i });
  }
  const qsrActSummaryRows = [];
  for (let i = 0; i < 30; i++) {           // ...continuous through today
    const dt = new Date(d(TODAY)); dt.setDate(dt.getDate() - i);
    qsrActSummaryRows.push({ loc: '43380', date: dt, sales: 20000 + i });
  }
  return { laborRows, qsrActSummaryRows };
}

describe('Dialed-In calibration — sales sourcing gap-fill', () => {
  it('the manual row still wins on a day it covers', () => {
    const ds = dsWithStaleManual();
    // 2026-07-23 exists in BOTH streams. laborRows is first in the chain, so it wins.
    expect(metricDaily(ds, '43380', d(STALE_END), 'sales')).toBe(10000);
  });

  it('the auto stream fills every day after the manual upload stops', () => {
    const ds = dsWithStaleManual();
    // This is the exact window that produced "—": the 1W period, entirely past the stale end.
    const oneWeek = metricSeries(ds, '43380', { s: d('2026-08-02'), e: d(TODAY) }, 'sales');
    const days = Object.keys(oneWeek);

    expect(days.length).toBeGreaterThanOrEqual(7);
    expect(Object.values(oneWeek).every(v => v > 0)).toBe(true);
  });

  it('reading raw laborRows yields NOTHING for the 1W window — the original bug', () => {
    const { laborRows } = dsWithStaleManual();
    // The pre-fix expression, verbatim in shape: filter raw manual rows to the last 7 days.
    const cut = d('2026-08-02');
    const recent = laborRows.filter(r => r.loc === '43380' && r.sales > 0 && r.date >= cut);

    expect(recent.length).toBe(0);          // -> _computePeriodMape returns null -> "—"
  });

  it('a 6W window spans both streams and is continuous across the seam', () => {
    const ds = dsWithStaleManual();
    const sixWeek = metricSeries(ds, '43380', { s: d('2026-07-14'), e: d(TODAY) }, 'sales');

    // Days before the seam come from manual (10k band), after it from auto (20k band).
    expect(sixWeek['2026-07-20']).toBeGreaterThan(9000);
    expect(sixWeek['2026-07-20']).toBeLessThan(11000);
    expect(sixWeek['2026-08-05']).toBeGreaterThan(19000);

    // No holes: every date in the union of the two streams resolves.
    expect(Object.values(sixWeek).some(v => v == null)).toBe(false);
  });
});
