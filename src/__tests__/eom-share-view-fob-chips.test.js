// @vitest-environment happy-dom
// @ts-nocheck
// Owner feedback: the EOM Share view's FOB chip strip should match the header-chip style already
// used elsewhere in the app (EOM Dashboard's own store-message draft, `FobStrip` in
// eom-dashboard.js) — percent as the primary bold focus per component, dollar secondary, plus the
// vs-target delta — instead of the view's own smaller, dollar-primary cells with no target info.
// Real render test (per this repo's "would this verification still pass if reverted" rule): drives
// the actual EomShareView -> FobStripLite chain against a real STORE_NAMES/DEFAULT_TARGETS entry,
// not an isolated helper call.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { DEFAULT_TARGETS } from '../constants.js';

const LOC = '3708'; // Ardmore-Broadway, real DEFAULT_TARGETS entry
const TGT = DEFAULT_TARGETS[LOC];

const SNAPSHOT_FOB = {
  sales: 200000, fob: 9000, fobPct: 0.045,
  comp: 300, raw: 900, cond: 3800, emp: 700, statv: 2600, unex: -100,
  asOf: '2026-08-29',
};

vi.mock('../lib/supabase.js', () => ({
  fetchSharedEom: async () => ({
    loc: LOC, storeName: 'Ardmore-Broadway', title: 'EOM FOB 2026-08', period: '2026-08',
    fob: SNAPSHOT_FOB, recapMd: '# Recap', fullMd: '# Full',
    expiresAt: null, createdAt: '2026-08-29T00:00:00Z', acknowledgedAt: null,
  }),
  // No live rows -> buildFromLive() returns null (hasData false) -> the frozen snapshot (with its
  // now-present `loc`) stays the active source, same as a share link opened after Supabase can't
  // be reached live. Proves the chips work off the FROZEN path's `loc`, not just the live one.
  refreshSharedEom: async () => ({ error: 'offline' }),
  acknowledgeSharedEom: async () => ({}),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { EomShareView } = await import('../views/eom-share-view.js');

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

afterEach(() => { document.body.innerHTML = ''; });

describe('EomShareView FOB chip strip — percent primary, dollar secondary, vs-target shown', () => {
  it('renders each component chip with its actual % as the bold headline and the $ amount + target delta as secondary text', async () => {
    const { container, root } = mountRoot();
    await act(async () => {
      root.render(React.createElement(EomShareView, { token: '11111111-1111-1111-1111-111111111111' }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });

    const text = container.textContent;
    // Headline FOB chip: percent shown, dollar shown, vs-target line present (real DEFAULT_TARGETS[LOC]).
    expect(text).toMatch(/4\.50%/); // fobPct headline
    expect(text).toContain('$9,000');
    expect(TGT?.tFOBTarget).not.toBeUndefined(); // sanity: this store really has a seeded FOB target
    expect(text).toMatch(/tgt \d+\.\d{2}%/); // a "(tgt X.XX%)" line rendered for at least one chip

    // Component chip: Condiments actual % (3800/200000 = 1.90%) must appear as its own headline.
    expect(text).toMatch(/1\.90%/);
    expect(text).toContain('$3,800');

    act(() => { root.unmount(); });
  });

  it('a store with no seeded DEFAULT_TARGETS entry still renders percent/dollar, just no target line (graceful degradation)', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase.js', () => ({
      fetchSharedEom: async () => ({
        loc: '9999999', storeName: 'No-Target Store', title: 'EOM FOB 2026-08', period: '2026-08',
        fob: SNAPSHOT_FOB, recapMd: '# Recap', fullMd: '# Full',
        expiresAt: null, createdAt: '2026-08-29T00:00:00Z', acknowledgedAt: null,
      }),
      refreshSharedEom: async () => ({ error: 'offline' }),
      acknowledgeSharedEom: async () => ({}),
    }));
    const { EomShareView: FreshView } = await import('../views/eom-share-view.js');
    const { container, root } = mountRoot();
    await act(async () => {
      root.render(React.createElement(FreshView, { token: '22222222-2222-2222-2222-222222222222' }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    const text = container.textContent;
    expect(text).toMatch(/4\.50%/);
    expect(text).toContain('$9,000');
    expect(text).not.toMatch(/tgt \d/);
    act(() => { root.unmount(); });
  });

  // 2026-08-30 finding: DEFAULT_TARGETS (constants.js) is a hardcoded build-time snapshot that
  // never reflects a fresh monthly_targets workbook upload -- confirmed live for Tishomingo
  // (real August FOB target 3.95%, DEFAULT_TARGETS still seeded at 4.00%). The edge function's
  // fetchMonthlyTargetOverride() resolves the real current-month value; this proves the client
  // actually uses it (would fail if reverted to reading DEFAULT_TARGETS[loc] alone).
  it('a monthlyOverride from the edge function wins over the hardcoded DEFAULT_TARGETS seed', async () => {
    vi.resetModules();
    vi.doMock('../lib/supabase.js', () => ({
      fetchSharedEom: async () => ({
        loc: LOC, storeName: 'Ardmore-Broadway', title: 'EOM FOB 2026-08', period: '2026-08',
        fob: SNAPSHOT_FOB, recapMd: '# Recap', fullMd: '# Full',
        expiresAt: null, createdAt: '2026-08-29T00:00:00Z', acknowledgedAt: null,
        monthlyOverride: { tFOBTarget: 0.0395, tCondiment: 0.019 }, // real override, differs from DEFAULT_TARGETS[LOC]
      }),
      refreshSharedEom: async () => ({ error: 'offline' }),
      acknowledgeSharedEom: async () => ({}),
    }));
    const { EomShareView: OverrideView } = await import('../views/eom-share-view.js');
    const { container, root } = mountRoot();
    await act(async () => {
      root.render(React.createElement(OverrideView, { token: '33333333-3333-3333-3333-333333333333' }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    const text = container.textContent;
    expect(TGT?.tFOBTarget).not.toBe(0.0395); // sanity: the seed really differs from the override
    expect(TGT?.tCondiment).not.toBe(0.019);
    expect(text).toMatch(/tgt 3\.95%/);   // FOB chip uses the override, not DEFAULT_TARGETS' seed
    expect(text).toMatch(/tgt 1\.90%/);   // Condiments chip uses the override too
    expect(text).not.toMatch(new RegExp(`tgt ${(TGT.tFOBTarget * 100).toFixed(2)}%`)); // stale FOB seed must NOT show
    expect(text).not.toMatch(new RegExp(`tgt ${(TGT.tCondiment * 100).toFixed(2)}%`)); // stale condiment seed must NOT show
    act(() => { root.unmount(); });
  });
});
