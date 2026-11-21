// @ts-nocheck
// Egress Phase 1 pilot #2 (2026-11-21): qsrActSummaryRows (qsr_daily_activity_rollup) joins the
// OPFS snapshot — the SECOND cloud-first stream added, after schedRows (pilot #1,
// dispatch-egress-phase1-sched-cache-2026-11-20.test.js). Unlike schedRows, this one is a T1-tier
// stream (App.js's tiered startup loader awaits it before calling the app "usable") feeding
// At-A-Glance's Sales/vs-LY/Guest-Count/TPPH tiles and Scheduling's QSR labor columns — the
// stream the owner explicitly watches load. See memory/plan-egress-reduction-2026-11-20.md
// Section 3/4/10.
//
// qsrActSummaryRows rows carry a SECOND Date field (`refreshedAt`, used by At-A-Glance's Movers
// strip via `.getTime()`) beyond the `date` field every other cached stream has — this is the one
// real wrinkle pilot #1 didn't have to handle. db/index.js's opfsLoad has a dedicated
// `toQsrActRow` wrapper for it; these tests exist specifically to catch a regression there (a
// `refreshedAt` that comes back as a string instead of a Date would throw the moment it reached
// that Movers-strip code, not at restore time — so this needs its own direct check, not just an
// absence-of-crash smoke test).
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

const { opfsSave, loadDsFromIDB } = await import('../db/index.js');

beforeEach(() => { fakeFiles.clear(); });

describe('egress Phase 1 pilot #2: qsrActSummaryRows joins the OPFS snapshot', () => {
  const actDate = new Date('2026-11-18T00:00:00');
  const refreshedAt = new Date('2026-11-18T19:17:05Z');

  it('opfsSave writes qsrActSummaryRows into the blob, stripped to _d like every other stream', async () => {
    await opfsSave({ laborRows: [], qsrActSummaryRows: [{ loc: '3708', date: actDate, sales: 1234, refreshedAt }] });
    const raw = JSON.parse(fakeFiles.get('meridian-data.json'));
    expect(raw.qsrAct).toHaveLength(1);
    expect(raw.qsrAct[0]._d).toBe('2026-11-18');
    expect(raw.qsrAct[0].date).toBeUndefined();
    expect(raw.qsrAct[0].sales).toBe(1234);
    // refreshedAt is NOT special-cased by strip() — it rides through as whatever
    // JSON.stringify does with a Date (ISO string), same as `date` would without the rename.
    expect(raw.qsrAct[0].refreshedAt).toBe(refreshedAt.toJSON());
  });

  it('loadDsFromIDB restores BOTH date fields as real Date objects — date via toRow, refreshedAt via the dedicated toQsrActRow wrapper', async () => {
    await opfsSave({
      laborRows: [{ loc: '3708', date: new Date('2026-11-01'), sales: 100 }],
      qsrActSummaryRows: [{ loc: '3708', date: actDate, sales: 1234, refreshedAt }],
    });
    const ds = await loadDsFromIDB();
    expect(ds.qsrAct).toHaveLength(1);
    expect(ds.qsrAct[0].date).toBeInstanceOf(Date);
    expect(ds.qsrAct[0].date.getTime()).toBe(new Date('2026-11-18T00:00:00').getTime());
    expect(ds.qsrAct[0].refreshedAt).toBeInstanceOf(Date);
    expect(ds.qsrAct[0].refreshedAt.getTime()).toBe(refreshedAt.getTime());
    expect(ds.qsrAct[0].sales).toBe(1234);
  });

  it('a null refreshedAt (the hourly-fallback path, which has no such column) restores as null, not Invalid Date', async () => {
    await opfsSave({
      laborRows: [{ loc: '3708', date: new Date('2026-11-01'), sales: 100 }],
      qsrActSummaryRows: [{ loc: '3708', date: actDate, sales: 1234, refreshedAt: null }],
    });
    const ds = await loadDsFromIDB();
    expect(ds.qsrAct[0].refreshedAt).toBeNull();
  });

  it('is backward-compatible with a v4 blob that has no qsrAct field at all (pre-pilot-#2)', async () => {
    fakeFiles.set('meridian-data.json', JSON.stringify({
      v: 4,
      labor: [{ loc: '3708', _d: '2026-11-01', sales: 100 }],
      ops: [], ctrl: [], fob: [], audit: [], peaks: [], dar: [], sched: [],
    }));
    const ds = await loadDsFromIDB();
    expect(ds.qsrAct).toEqual([]);
  });
});
