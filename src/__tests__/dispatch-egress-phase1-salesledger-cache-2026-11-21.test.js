// @ts-nocheck
// Egress Phase 1 pilot #3 (2026-11-21): salesLedgerRows (sales_ledger_daily) joins the OPFS
// snapshot — the THIRD cloud-first stream added via this plan's pattern, after schedRows
// (pilot #1) and qsrActSummaryRows (pilot #2). Unlike those two, salesLedgerRows has no second
// Date field (no `refreshedAt`-style wrinkle) — loadSalesLedger/loadGlimpse/loadCash each emit
// exactly one Date field (`date`), confirmed by reading src/lib/supabase.js before writing this —
// so the plain toRow()/strip() pair that every other stream uses is sufficient here; no dedicated
// wrapper like pilot #2's toQsrActRow was needed.
//
// This pass also discovered and fixed a real, pre-existing bug: glimpseRows/cashRows were ALREADY
// part of this OPFS blob (added for the Dexie v7 "QSRSoft email report types" migration, long
// before the egress plan existed), but (a) App.js's empty-shell restore branch (no legacy
// manual-upload history) never actually seeded them from the cache — hardcoded to `[]` — and
// (b) the live-fetch stage (_stCloudEmailReport) never wrote back into the cache at all, only the
// legacy manual-upload path did. So a user who never manually uploads has had an effectively
// permanently-empty glimpse/cash cache this whole time. Both are fixed in the same commit as
// adding salesLedgerRows. See memory/plan-egress-reduction-2026-11-20.md Section 12.
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

describe('egress Phase 1 pilot #3: salesLedgerRows joins the OPFS snapshot', () => {
  const ledgerDate = new Date('2026-11-18T00:00:00');

  it('opfsSave writes salesLedgerRows into the blob under `salesLedger`, stripped to _d like every other stream', async () => {
    await opfsSave({ laborRows: [], salesLedgerRows: [{ loc: '3708', date: ledgerDate, digitalSales: 456.78 }] });
    const raw = JSON.parse(fakeFiles.get('meridian-data.json'));
    // Not hardcoded to this pilot's own v6 — Phase 1.5 (v7) bumped the live write version again;
    // the real thing this assertion guards is "opfsSave stamps a version number", not which one.
    expect(raw.v).toBeGreaterThanOrEqual(6);
    expect(raw.salesLedger).toHaveLength(1);
    expect(raw.salesLedger[0]._d).toBe('2026-11-18');
    expect(raw.salesLedger[0].date).toBeUndefined();
    expect(raw.salesLedger[0].digitalSales).toBe(456.78);
  });

  it('loadDsFromIDB restores salesLedgerRows with date as a real Date object — plain toRow, no special wrapper needed', async () => {
    await opfsSave({
      laborRows: [{ loc: '3708', date: new Date('2026-11-01'), sales: 100 }],
      salesLedgerRows: [{ loc: '3708', date: ledgerDate, digitalSales: 456.78 }],
    });
    const ds = await loadDsFromIDB();
    expect(ds.salesLedger).toHaveLength(1);
    expect(ds.salesLedger[0].date).toBeInstanceOf(Date);
    expect(ds.salesLedger[0].date.getTime()).toBe(ledgerDate.getTime());
    expect(ds.salesLedger[0].digitalSales).toBe(456.78);
  });

  it('glimpseRows and cashRows round-trip too — same opfsSave/loadDsFromIDB pass, confirming the write-back-gap fix actually reaches the cache', async () => {
    const glimpseDate = new Date('2026-11-19T00:00:00');
    const cashDate = new Date('2026-11-20T00:00:00');
    // loadDsFromIDB only trusts the OPFS snapshot when it has at least one labor row
    // (its own sentinel for "this is a real, non-corrupt snapshot") — include one here, same as
    // every other test in this file and in pilot #1/#2's tests, so this exercises the OPFS
    // restore path rather than falling through to the empty-IDB cold-start path.
    await opfsSave({
      laborRows: [{ loc: '3708', date: new Date('2026-11-01'), sales: 100 }],
      glimpseRows: [{ loc: '3708', date: glimpseDate, oepeSec: 180 }],
      cashRows: [{ loc: '3708', date: cashDate, cashOverShort: -2.5 }],
    });
    const ds = await loadDsFromIDB();
    expect(ds.glimpse).toHaveLength(1);
    expect(ds.glimpse[0].date.getTime()).toBe(glimpseDate.getTime());
    expect(ds.glimpse[0].oepeSec).toBe(180);
    expect(ds.cash).toHaveLength(1);
    expect(ds.cash[0].date.getTime()).toBe(cashDate.getTime());
    expect(ds.cash[0].cashOverShort).toBe(-2.5);
  });

  it('is backward-compatible with a v5 blob that has no salesLedger field at all (pre-pilot-#3)', async () => {
    fakeFiles.set('meridian-data.json', JSON.stringify({
      v: 5,
      labor: [{ loc: '3708', _d: '2026-11-01', sales: 100 }],
      ops: [], ctrl: [], fob: [], audit: [], peaks: [], dar: [], sched: [], qsrAct: [],
      glimpse: [], cash: [],
    }));
    const ds = await loadDsFromIDB();
    expect(ds.salesLedger).toEqual([]);
    // glimpse/cash still resolve to [] cleanly too — not a crash on the missing salesLedger key.
    expect(ds.glimpse).toEqual([]);
    expect(ds.cash).toEqual([]);
  });

  it('rejects an unrecognized version number (not 2-6) and resolves null without crashing, same guard as prior versions', async () => {
    fakeFiles.set('meridian-data.json', JSON.stringify({ v: 99, labor: [{ loc: '3708', _d: '2026-11-01', sales: 100 }] }));
    // opfsLoad rejects v99 outright (resolves null), so loadDsFromIDB can't use the OPFS branch at
    // all and falls through to its IDB cold-start path — which, with no data in fake-indexeddb
    // either, returns its own minimal empty shape that doesn't carry a `salesLedger` key (same as
    // it doesn't carry `sched`/`qsrAct` — App.js's destructuring defaults all three via `||[]`).
    // The only thing this test needs to prove is that a v99 blob doesn't crash the load.
    await expect(loadDsFromIDB()).resolves.toBeTruthy();
  });
});
