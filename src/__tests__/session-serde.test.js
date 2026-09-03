// @vitest-environment happy-dom
// @ts-nocheck
// features/session.js's _mfSerDS/_mfDeserDS/_mfSessionMeta (the IndexedDB session
// save/restore round-trip) had zero test coverage despite being live: App.js imports
// mfIDBSave/mfIDBLoad (which call these internally) to persist and restore a session's
// full loaded dataset across page reloads. A round-trip bug here would silently corrupt
// dates or drop rebuilt indices on every restored session.
import { describe, it, expect } from 'vitest';
import { _mfSerDS, _mfDeserDS, _mfSessionMeta } from '../features/session.js';

function makeDS() {
  return {
    loaded: true,
    storeIds: ['3708', '6178'],
    targets: { '3708': { sales: 5000 } },
    records: { '3708': { '2026-06-01': { date: new Date('2026-06-01'), sales: 5100 } } },
    lastActual: { '3708': new Date('2026-06-02'), '6178': null },
    laborRows: [{ loc: '3708', date: new Date('2026-06-01'), hrs: 120 }],
    opsRows: [{ loc: '3708', date: new Date('2026-06-01'), waste: 12 }],
    ctrlRows: [{ loc: '6178', date: new Date('2026-06-02'), cashOS: 3 }],
    fobRows: [],
    weatherRows: [{ date: new Date('2026-06-01'), high: 88 }],
    peaksSvcRows: [],
    peaksSalesRows: [],
    auditRows: [],
    trendsRows: [],
  };
}

describe('_mfSerDS / _mfDeserDS round-trip', () => {
  it('returns null for a null ds', () => {
    expect(_mfSerDS(null)).toBeNull();
    expect(_mfDeserDS(null)).toBeNull();
  });

  it('serializes row Dates to ISO strings', () => {
    const raw = _mfSerDS(makeDS());
    expect(typeof raw.laborRows[0].date).toBe('string');
    expect(raw.laborRows[0].date).toBe(new Date('2026-06-01').toISOString());
  });

  it('serializes lastActual Dates to ISO strings, preserving null', () => {
    const raw = _mfSerDS(makeDS());
    expect(typeof raw.lastActual['3708']).toBe('string');
    expect(raw.lastActual['6178']).toBeNull();
  });

  it('round-trips row Dates back to real Date objects with the same value', () => {
    const ds = makeDS();
    const restored = _mfDeserDS(_mfSerDS(ds));
    expect(restored.laborRows[0].date).toBeInstanceOf(Date);
    expect(restored.laborRows[0].date.getTime()).toBe(ds.laborRows[0].date.getTime());
    expect(restored.laborRows[0].hrs).toBe(120);
  });

  it('round-trips lastActual, restoring null entries as null (not "null" string parsed to a date)', () => {
    const restored = _mfDeserDS(_mfSerDS(makeDS()));
    expect(restored.lastActual['3708']).toBeInstanceOf(Date);
    expect(restored.lastActual['6178']).toBeNull();
  });

  it('rebuilds laborIdx/opsIdx/ctrlIdx/weatherIdx/wxByDate keyed by loc_date or date', () => {
    const restored = _mfDeserDS(_mfSerDS(makeDS()));
    expect(restored.laborIdx['3708_2026-06-01']).toHaveLength(1);
    expect(restored.opsIdx['3708_2026-06-01']).toHaveLength(1);
    expect(restored.ctrlIdx['6178_2026-06-02']).toHaveLength(1);
    expect(restored.wxByDate['2026-06-01'].high).toBe(88);
  });

  it('rebuilds laborByLoc/opsByLoc/ctrlByLoc keyed by loc only', () => {
    const restored = _mfDeserDS(_mfSerDS(makeDS()));
    expect(restored.laborByLoc['3708']).toHaveLength(1);
    expect(restored.opsByLoc['3708']).toHaveLength(1);
    expect(restored.ctrlByLoc['6178']).toHaveLength(1);
  });

  it('restores nested records[loc][key].date strings back to Date objects', () => {
    const restored = _mfDeserDS(_mfSerDS(makeDS()));
    expect(restored.records['3708']['2026-06-01'].date).toBeInstanceOf(Date);
  });

  it('preserves non-Date fields (targets, storeIds) untouched through the round-trip', () => {
    const restored = _mfDeserDS(_mfSerDS(makeDS()));
    expect(restored.storeIds).toEqual(['3708', '6178']);
    expect(restored.targets['3708'].sales).toBe(5000);
  });
});

describe('_mfSessionMeta', () => {
  it('counts rows and computes the earliest/latest labor date as YYYY-MM-DD', () => {
    const meta = _mfSessionMeta(makeDS());
    expect(meta.storeCount).toBe(2);
    expect(meta.laborRows).toBe(1);
    expect(meta.ctrlRows).toBe(1);
    expect(meta.opsRows).toBe(1);
    expect(meta.earliest).toBe('2026-06-01');
    expect(meta.latest).toBe('2026-06-01');
  });

  it('returns null earliest/latest when laborRows is empty', () => {
    const ds = { ...makeDS(), laborRows: [] };
    const meta = _mfSessionMeta(ds);
    expect(meta.earliest).toBeNull();
    expect(meta.latest).toBeNull();
  });
});
