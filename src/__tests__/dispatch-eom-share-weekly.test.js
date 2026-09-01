// @vitest-environment happy-dom
// @ts-nocheck
// 2026-09-01 (owner req): "I would like to see the share link expanded to work with weekly
// counts." A Count Cycle share link reuses the EXISTING eom_share_links table + eom-share edge
// function verbatim (no schema change, no redeploy) -- the ONE thing that tells a Count Cycle
// link apart from a real EOM link is its `period` shape: count-cycle-panel.js's createWeeklyShare
// stores `wk:YYYY-MM-DD`, which can never match the `/^\d{4}-\d{2}$/` shape a real EOM period
// always has. The edge function's 'refresh' action queries qsr_fob/qsr_onhand by a MONTHLY
// period (`${period}-01`..`${period}-31` date-range math) -- meaningless, and untested, against a
// non-monthly string -- so the viewer must never call it for a Count Cycle link.
//
// Per this repo's "would this verification still pass if reverted?" standing rule, this renders
// the REAL EomShareView and asserts refreshSharedEom is/isn't actually CALLED (a spy), not just
// that isMonthlyPeriod() returns the right boolean in isolation -- a revert that re-enabled
// doRefresh() for every period unconditionally would fail this even if the regex helper itself
// still existed and still passed its own unit test.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

afterEach(() => { document.body.innerHTML = ''; vi.resetModules(); });

describe('EomShareView — Count Cycle (weekly) links never call the EOM-only refresh action', () => {
  it('a wk:-period link shows the Count Cycle badge + a static-snapshot line, no Refresh button, and never calls refreshSharedEom', async () => {
    const refreshSpy = vi.fn(async () => ({ error: 'should never be called' }));
    vi.doMock('../lib/supabase.js', () => ({
      fetchSharedEom: async () => ({
        loc: '3708', storeName: 'Ardmore-Broadway', title: 'Count Cycle — Ardmore-Broadway',
        period: 'wk:2026-09-01', fob: null,
        recapMd: '# Count Cycle — Ardmore-Broadway\n\n**Status: On cycle**',
        fullMd: '# Count Cycle — Ardmore-Broadway\n\n**Status: On cycle**',
        expiresAt: null, createdAt: '2026-09-01T00:00:00Z', acknowledgedAt: null,
      }),
      refreshSharedEom: refreshSpy,
      acknowledgeSharedEom: async () => ({}),
    }));
    const { EomShareView } = await import('../views/eom-share-view.js');
    const { container, root } = mountRoot();
    await act(async () => {
      root.render(React.createElement(EomShareView, { token: '44444444-4444-4444-4444-444444444444' }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });

    const text = container.textContent;
    expect(text).toMatch(/Count Cycle · view-only/);
    expect(text).not.toMatch(/EOM report · view-only/);
    expect(text).toMatch(/Static snapshot/);
    expect(text).toMatch(/Status: On cycle/);
    expect([...container.querySelectorAll('button')].some(b => b.textContent.includes('Refresh'))).toBe(false);
    expect(refreshSpy).not.toHaveBeenCalled();

    act(() => { root.unmount(); });
  });

  it('a real EOM (YYYY-MM) period link is UNAFFECTED — still calls refreshSharedEom and shows the Refresh button', async () => {
    const refreshSpy = vi.fn(async () => ({ error: 'offline' })); // offline is fine -- only call-count matters here
    vi.doMock('../lib/supabase.js', () => ({
      fetchSharedEom: async () => ({
        loc: '3708', storeName: 'Ardmore-Broadway', title: 'EOM FOB 2026-08', period: '2026-08',
        fob: { sales: 200000, fob: 9000, fobPct: 0.045 }, recapMd: '# Recap', fullMd: '# Full',
        expiresAt: null, createdAt: '2026-08-29T00:00:00Z', acknowledgedAt: null,
      }),
      refreshSharedEom: refreshSpy,
      acknowledgeSharedEom: async () => ({}),
    }));
    const { EomShareView } = await import('../views/eom-share-view.js');
    const { container, root } = mountRoot();
    await act(async () => {
      root.render(React.createElement(EomShareView, { token: '55555555-5555-5555-5555-555555555555' }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });

    const text = container.textContent;
    expect(text).toMatch(/EOM report · view-only/);
    expect([...container.querySelectorAll('button')].some(b => b.textContent.includes('Refresh'))).toBe(true);
    expect(refreshSpy).toHaveBeenCalledTimes(1);

    act(() => { root.unmount(); });
  });
});
