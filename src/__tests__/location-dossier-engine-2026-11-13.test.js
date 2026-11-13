// @ts-nocheck
// Task #79 Phase 1 — Location Dossier engine (src/engine/location-dossier.js).
import { describe, it, expect } from 'vitest';
import { dossierWindows, buildFactualGrid, topFindings, dossierStoreContext, DOSSIER_METRICS } from '../engine/location-dossier.js';

describe('dossierWindows', () => {
  it('returns 5 fixed windows in order: current, 28d, lm, l3m, ytd', () => {
    const windows = dossierWindows(new Date('2026-11-13T12:00:00'));
    expect(windows.map(w => w.id)).toEqual(['current', '28d', 'lm', 'l3m', 'ytd']);
  });

  it('28-Day window spans exactly 28 days ending on the last closed business day', () => {
    const windows = dossierWindows(new Date('2026-11-13T12:00:00'));
    const win28 = windows.find(w => w.id === '28d');
    const days = (new Date(win28.e) - new Date(win28.s)) / 86400000 + 1;
    expect(days).toBe(28);
  });

  it('Last Month is the most recently completed full calendar month', () => {
    const windows = dossierWindows(new Date('2026-11-13T12:00:00'));
    const lm = windows.find(w => w.id === 'lm');
    expect(lm.s).toBe('2026-10-01');
    expect(lm.e).toBe('2026-10-31');
  });

  it('L3M spans the 3 most recently completed calendar months', () => {
    const windows = dossierWindows(new Date('2026-11-13T12:00:00'));
    const l3m = windows.find(w => w.id === 'l3m');
    expect(l3m.s).toBe('2026-08-01');
    expect(l3m.e).toBe('2026-10-31');
  });

  it('YTD starts Jan 1 of the current year', () => {
    const windows = dossierWindows(new Date('2026-11-13T12:00:00'));
    const ytd = windows.find(w => w.id === 'ytd');
    expect(ytd.s).toBe('2026-01-01');
  });
});

describe('buildFactualGrid', () => {
  it('returns one row per DOSSIER_METRICS entry, with a value per window', () => {
    const ds = {
      qsrActSummaryRows: [
        { loc: '3708', date: '2026-11-01', sales: 1000, gc: 100, tpph: 5.5 },
        { loc: '3708', date: '2026-11-02', sales: 1200, gc: 110, tpph: 5.8 },
      ],
    };
    const windows = dossierWindows(new Date('2026-11-13T12:00:00'));
    const grid = buildFactualGrid(ds, '3708', windows);
    expect(grid).toHaveLength(DOSSIER_METRICS.length);
    expect(grid[0].key).toBe('sales');
    expect(Object.keys(grid[0].values)).toEqual(windows.map(w => w.id));
  });

  it('a metric with no resolvable data for a window reads null, not a guessed number', () => {
    const ds = {};
    const windows = dossierWindows(new Date('2026-11-13T12:00:00'));
    const grid = buildFactualGrid(ds, '9999', windows);
    for (const row of grid) {
      for (const wid of windows.map(w => w.id)) expect(row.values[wid]).toBeNull();
    }
  });
});

describe('topFindings', () => {
  it('ranks crit before watch before ok, and slices to the top N', () => {
    const findings = [
      { t: 'ok', m: 'fine 1' }, { t: 'crit', m: 'urgent' }, { t: 'watch', m: 'watch 1' },
      { t: 'ok', m: 'fine 2' }, { t: 'watch', m: 'watch 2' },
    ];
    const { headline, rest } = topFindings(findings, 3);
    expect(headline.map(f => f.t)).toEqual(['crit', 'watch', 'watch']);
    expect(rest).toHaveLength(2);
  });

  it('empty findings -> empty headline, empty rest', () => {
    const { headline, rest } = topFindings([]);
    expect(headline).toEqual([]);
    expect(rest).toEqual([]);
  });
});

describe('dossierStoreContext', () => {
  it('returns the real STORE_KB entry for a known store', () => {
    const ctx = dossierStoreContext('3708');
    expect(ctx).toBeTruthy();
    expect(ctx.notes).toContain('Ardmore-Broadway');
  });

  it('returns null for an unknown loc', () => {
    expect(dossierStoreContext('0000000')).toBeNull();
  });
});
