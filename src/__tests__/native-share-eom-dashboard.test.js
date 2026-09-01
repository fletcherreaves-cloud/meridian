// @vitest-environment happy-dom
// @ts-nocheck
// 2026-09-01 — Native OS Share sheet (Web Share API) wired into the EOM Scoreboard's "🔗 Share"
// button (eom-dashboard.js's createShare) via src/utils/share.js's shareOrCopy(). Mock module
// list copied from dispatch-eom-housekeeping-report.test.js's own established pattern for this
// file (EOMDashboardPanel's body is gated on several load* calls that must resolve before the
// scoreboard table — and its "🔗 Share" button — render at all).
//
// Per this repo's "would this verification still pass if reverted?" standing rule, this drives
// the actual EOMDashboardPanel -> real "🔗 Share" button click, not an isolated call to
// shareOrCopy() — a revert of the wiring (call site still calling navigator.clipboard.writeText
// directly) would fail these.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const createEomShareLink = vi.fn(async () => ({ token: '77777777-7777-7777-7777-777777777777', error: null }));

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ data: null, error: null }) }) },
  loadQsrOnHand: async () => ([
    { loc: '3708', wrin: 'F1', descr: 'Food Item', cls: 'Food', onHandAmt: 10, active: true, lastCounted: '2026-08-25' },
  ]),
  loadQsrFob: async () => [],
  loadEomPeriods: async () => [],
  loadEomCountStatus: async () => [],
  saveEomCountStatus: async () => ({}),
  loadQsrVarianceStat: async () => [],
  loadQsrVarianceHistory: async () => [],
  loadQsrVarianceHistoryAll: async () => [],
  loadQsrWaste: async () => [],
  loadQsrTransfers: async () => [],
  loadQsrRawItemDetail: async () => [],
  loadQsrRawItemInfo: async () => [],
  loadEomDiagConfig: async () => null,
  saveEomDiagConfig: async () => ({}),
  triggerSync: async () => ({ ok: true }),
  loadEomDigestConfig: async () => ({ levels: ['district', 'patch'], sendHourUtc: 23 }),
  saveEomDigestConfig: async () => ({ saved: true }),
  saveEomItemDisposition: async () => ({}),
  loadEomItemDisposition: async () => [],
  loadSelfServeTowerLocs: async () => new Set(),
  saveEomSnapshots: async () => ({}),
  loadEomSnapshots: async () => [],
  saveEomSecondaryReview: async () => ({}),
  loadEomSecondaryReview: async () => [],
  saveEomCountException: async () => ({}),
  deleteEomCountException: async () => ({}),
  loadEomCountExceptions: async () => ({}),
  createEomShareLink,
  loadEbosMonthlyByStore: async () => ({}),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { EOMDashboardPanel } = await import('../views/eom-dashboard.js');

const STORES = [{ loc: '3708' }];

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

async function renderPanel(root) {
  await act(async () => {
    root.render(React.createElement(EOMDashboardPanel, {
      stores: STORES, ds: {}, settings: {}, onClose: () => {}, initialMode: 'eom',
    }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

async function clickShare(container) {
  const shareBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '🔗 Share');
  expect(shareBtn, '🔗 Share button not found in the scoreboard row').toBeTruthy();
  await act(async () => { shareBtn.click(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

describe('EOM Scoreboard "🔗 Share" — native OS Share sheet, real button click', () => {
  const origShare = navigator.share;
  beforeEach(() => { createEomShareLink.mockClear(); });
  afterEach(() => {
    document.body.innerHTML = '';
    navigator.share = origShare;
    vi.restoreAllMocks();
  });

  it('when navigator.share exists, the click opens the OS sheet with the link and does NOT touch clipboard', async () => {
    const share = vi.fn(async () => {});
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    navigator.share = share;

    const { container, root } = mountRoot();
    await renderPanel(root);
    await clickShare(container);

    expect(createEomShareLink).toHaveBeenCalledTimes(1);
    expect(share).toHaveBeenCalledTimes(1);
    const payload = share.mock.calls[0][0];
    expect(payload.url).toMatch(/\?share=77777777-7777-7777-7777-777777777777$/);
    expect(payload.title).toMatch(/EOM FOB/);
    expect(writeText).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/✓ Shared/);

    root.unmount();
  });

  it('user cancelling the OS share sheet (AbortError) shows no error and does not silently copy the link', async () => {
    const abortErr = Object.assign(new Error('cancel'), { name: 'AbortError' });
    const share = vi.fn(async () => { throw abortErr; });
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();
    navigator.share = share;

    const { container, root } = mountRoot();
    await renderPanel(root);
    await clickShare(container);

    expect(share).toHaveBeenCalledTimes(1);
    expect(writeText).not.toHaveBeenCalled();
    expect(container.textContent).not.toMatch(/Share failed/);
    expect(container.textContent).not.toMatch(/✓ Shared/);
    expect(container.textContent).not.toMatch(/✓ Read-only link copied/);

    root.unmount();
  });

  it('without navigator.share (desktop), the click falls back to clipboard-copy exactly as before', async () => {
    navigator.share = undefined;
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue();

    const { container, root } = mountRoot();
    await renderPanel(root);
    await clickShare(container);

    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toMatch(/\?share=77777777-7777-7777-7777-777777777777$/);
    expect(container.textContent).toMatch(/✓ Read-only link copied/);

    root.unmount();
  });
});
