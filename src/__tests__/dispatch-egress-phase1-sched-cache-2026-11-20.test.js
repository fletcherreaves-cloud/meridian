// @ts-nocheck
// Egress Phase 1 pilot (2026-11-20): schedRows (LifeLenz schedule) is the first cloud-first
// stream added to the OPFS snapshot — previously this blob only ever carried manual-upload-era
// streams (labor/ops/ctrl/fob/audit/peaks/dar/pmix/weather/glimpse/cash/exceptions/targets). See
// memory/plan-egress-reduction-2026-11-20.md Section 3/4 for the design this closes part of:
// render last session's schedule rows immediately from cache; App.js's _stLifelenz still runs
// its live fetch and replaces them, and writes the refreshed rows back to this same cache.
//
// This exercises the REAL opfsSave -> opfsLoad (private) -> loadDsFromIDB round-trip, not just
// a hand-built JS object shape, by faking the two browser-only primitives db/index.js depends on
// (navigator.storage's OPFS directory handle, and the dedicated Worker). This repo's test suite
// runs in Vitest's 'node' environment (vite.config.ts), where neither API exists natively, so
// this mechanism — including the 9 OPFS fields that joined this same blob before schedRows did
// — had never been exercised by a real test. A revert of the `sched` field in either opfsSave
// or opfsLoad, or of its threading through loadDsFromIDB(), must fail this file.
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';

const fakeFiles = new Map();

class MockOpfsWorker {
  constructor() { this._listeners = []; }
  addEventListener(type, cb) { if (type === 'message') this._listeners.push(cb); }
  removeEventListener(type, cb) { this._listeners = this._listeners.filter(l => l !== cb); }
  postMessage(msg) {
    if (msg.cmd !== 'load') return;
    queueMicrotask(() => {
      const content = fakeFiles.get('meridian-data.json');
      const payload = content == null
        ? { cmd: 'load', ok: false, notFound: true }
        : { cmd: 'load', ok: true, buf: new TextEncoder().encode(content).buffer };
      this._listeners.slice().forEach(cb => cb({ data: payload }));
    });
  }
}

function makeFakeStorageRoot() {
  return {
    getFileHandle: async (name, opts) => {
      if (!fakeFiles.has(name) && !(opts && opts.create)) {
        const e = new Error('not found'); e.name = 'NotFoundError'; throw e;
      }
      return {
        createWritable: async () => ({
          write: async (data) => { fakeFiles.set(name, data); },
          close: async () => {},
        }),
      };
    },
    removeEntry: async (name) => { fakeFiles.delete(name); },
  };
}

globalThis.Worker = MockOpfsWorker;
if (!globalThis.navigator) globalThis.navigator = {};
globalThis.navigator.storage = { getDirectory: async () => makeFakeStorageRoot() };

// opfsLoad itself is a private helper (not exported) — exercised here only through the two
// public functions that actually call it: opfsSave (write side) and loadDsFromIDB (read side,
// the function App.js calls on every cold start).
const { opfsSave, loadDsFromIDB } = await import('../db/index.js');

beforeEach(() => { fakeFiles.clear(); });

describe('egress Phase 1: schedRows joins the OPFS snapshot', () => {
  const schedDate = new Date('2026-11-18T12:00:00');

  it('opfsSave writes schedRows into the blob, stripped to _d like every other stream', async () => {
    await opfsSave({ laborRows: [], schedRows: [{ loc: '3708', date: schedDate, fcstSales: 5000 }] });
    const raw = JSON.parse(fakeFiles.get('meridian-data.json'));
    // v bumped again (v5, egress Phase 1 pilot #2, qsrAct) after this test was first written at
    // v4 — assert only that it's current-or-newer, not a fixed number, so the NEXT stream added
    // to this blob doesn't have to hunt down and edit this unrelated assertion too.
    expect(raw.v).toBeGreaterThanOrEqual(4);
    expect(raw.sched).toHaveLength(1);
    expect(raw.sched[0]._d).toBe('2026-11-18');
    expect(raw.sched[0].date).toBeUndefined();
    expect(raw.sched[0].fcstSales).toBe(5000);
  });

  it('loadDsFromIDB restores schedRows as real Date objects (the field App.js destructures)', async () => {
    await opfsSave({
      laborRows: [{ loc: '3708', date: new Date('2026-11-01'), sales: 100 }],
      schedRows: [{ loc: '3708', date: schedDate, fcstSales: 5000 }],
    });
    const ds = await loadDsFromIDB();
    expect(ds.sched).toHaveLength(1);
    expect(ds.sched[0].date).toBeInstanceOf(Date);
    expect(ds.sched[0].fcstSales).toBe(5000);
  });

  it('is backward-compatible with a v3 blob that has no sched field at all', async () => {
    fakeFiles.set('meridian-data.json', JSON.stringify({
      v: 3,
      labor: [{ loc: '3708', _d: '2026-11-01', sales: 100 }],
      ops: [], ctrl: [], fob: [], audit: [], peaks: [], dar: [],
    }));
    const ds = await loadDsFromIDB();
    expect(ds.sched).toEqual([]);
  });

  it('a corrupt/unparseable blob falls back to the IDB migration path, not a throw (existing behavior, unaffected by the sched addition)', async () => {
    fakeFiles.set('meridian-data.json', 'not json');
    const ds = await loadDsFromIDB();
    expect(Array.isArray(ds.labor)).toBe(true);
  });

  it('no OPFS file at all (fresh install) falls back gracefully, not a throw', async () => {
    const ds = await loadDsFromIDB();
    expect(Array.isArray(ds.labor)).toBe(true);
  });
});
