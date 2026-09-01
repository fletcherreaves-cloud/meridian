// @vitest-environment happy-dom
// @ts-nocheck
// Owner report (2026-09-01, dispatch): the "⚠ No FOB report found for this period" warning
// banner and the "○ FOB missing" badge (EOM Supervisor Rollup / Inventory Control hub) were
// false positives for stores with real, current AUTO-pulled FOB (qsr_fob / ds.qsrFobRows) —
// hasFOB (computeStoreEOM, src/views/eom-supervisor.js) and the header's fobLoaded flag both
// only checked the MANUAL upload (ds.fobRows), even though the displayed actual $ / % figures
// (actSales/actFCPct/actFOBPct/actLaborPct) already correctly fell back to the auto stream.
// Verified live (service-role Supabase read) against 3708/Ardmore-Broadway and
// 5183/Chickasha-So 4th: both have complete August 2026 qsr_fob rows (31/31 days) driving real
// displayed actuals, while this flag alone still called it "missing" for lack of a manual row.
//
// Fixed: hasFOB now also checks autoFob (fobSnapshotByStore's ds.qsrFobRows lookup, the same
// value the actual-$ fields already fall back to); fobLoaded now also checks
// ds.qsrFobRows?.length. Both gate the warning banner, the badge, AND the rollup's
// stores-to-include filter (S = stores.filter(s => s.hasTargets || s.hasFOB)).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../lib/supabase.js', () => ({
  loadEbosMonthlyByStore: async () => ({}),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { EOMSupervisorPanel } = await import('../views/eom-supervisor.js');

const LOC = '3708';

function fakeSupabaseChain() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
    upsert: async () => ({ data: null, error: null }),
  };
  return chain;
}
const fakeSupabase = { from: () => fakeSupabaseChain() };

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

describe('EOM Supervisor Rollup — hasFOB / fobLoaded recognize auto-pulled qsr_fob, not just manual upload', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  const autoFobDs = {
    allMonthlyTargets: {
      // computeStoreEOM's periodKey is `${selYear}-${selMonth}` — NOT zero-padded — so August
      // is keyed '2026-8', not '2026-08'. tProdSales makes hasTargets:true so the store isn't
      // filtered out of storeData regardless of hasFOB.
      '2026-8': { [LOC]: { tProdSales: 300000 } },
    },
    fobRows: [], // no manual upload for this period
    qsrFobRows: [{
      // qsr_fob rows carry a 7-char zero-padded NSN (fobSnapshotByStore/computeStoreEOM both pad
      // locStr.padStart(7,'0') to look this up) — unpadded here would silently miss the match.
      loc: '000' + LOC, date: '2026-08-15',
      prodSalesAmt: 315034.65, compWasteAmt: 100, rawWasteAmt: 50, condimentsAmt: 20,
      empMgrMealsAmt: 10, statVarianceAmt: 5, unexplainedAmt: 2,
    }],
  };

  it('badge reads "✓ FOB" (not "○ FOB missing") for a store with only auto-pulled qsr_fob data', async () => {
    await act(async () => {
      root.render(React.createElement(EOMSupervisorPanel, {
        ds: autoFobDs, settings: {}, supabase: fakeSupabase, period: '2026-08', scopedLocs: [LOC],
      }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    const text = container.textContent;
    expect(text).toMatch(/✓ FOB/);
    expect(text).not.toMatch(/○ FOB missing/);
  });

  it('header banner reads "✓ FOB data in session" (not "○ No FOB data") when only ds.qsrFobRows is populated', async () => {
    await act(async () => {
      root.render(React.createElement(EOMSupervisorPanel, {
        ds: autoFobDs, settings: {}, supabase: fakeSupabase, period: '2026-08', scopedLocs: [LOC],
      }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    const text = container.textContent;
    expect(text).toMatch(/✓ FOB data in session/);
    expect(text).not.toMatch(/No FOB data/);
  });

  it('still reads "○ FOB missing" / "○ No FOB data" when NEITHER manual nor auto FOB data is present (no false negative introduced)', async () => {
    const noFobDs = {
      allMonthlyTargets: { '2026-8': { [LOC]: { tProdSales: 300000 } } }, // periodKey is non-zero-padded
      fobRows: [], qsrFobRows: [],
    };
    await act(async () => {
      root.render(React.createElement(EOMSupervisorPanel, {
        ds: noFobDs, settings: {}, supabase: fakeSupabase, period: '2026-08', scopedLocs: [LOC],
      }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    const text = container.textContent;
    expect(text).toMatch(/○ FOB missing/);
    expect(text).toMatch(/No FOB data/);
  });
});
