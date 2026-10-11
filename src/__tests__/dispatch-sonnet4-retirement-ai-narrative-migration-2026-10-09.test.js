// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch 2026-10-09 — Anthropic retired `claude-sonnet-4-20250514` (2026-06-15). The owner
// forwarded Anthropic's own deprecation-notice email reporting 2 failed `not_found_error`
// requests against that model on 2026-10-08 from his personal API key.
//
// Audit of every `api.anthropic.com` call site (11 total, across 7 files still on the
// legacy personal-key/direct-browser pattern that src/app/changelog/5.459.js's migration
// explicitly deferred) found 3 that were broken, independent of each other:
//   - src/views/analytics.js's DistrictLensPanel generateNarrative (district correlation
//     "✨ Generate District Story") -- model:'claude-sonnet-4-6', a string that was never a
//     real model id (not even a retirement casualty -- always 404'd).
//   - src/views/at-a-glance.js's AtAGlance fetchAIComment ("AI Narrative" dashboard-comment
//     toggle) -- model:'claude-sonnet-4-20250514', the exact retired id from the email.
//   - src/features/location-intel.js's liGenerateAI (Location Intelligence "⚡ Generate" AI
//     mode) -- same retired id, AND (a second, independent bug) never sent an API key header
//     at all, so it was 401'ing even before the retirement.
// The other 8 call sites use 'claude-haiku-4-5-20251001', which Anthropic has not retired --
// out of scope for this fix, left exactly as the previous migration pass left them.
//
// Fix (same precedent as coaching.js/LocationBrief, dispatch #76): route all 3 through the
// already-deployed sage-chat Edge Function via src/lib/sage-client.js's callSageOnce, instead
// of a personal localStorage `mf_anthropic_key` + hardcoded model id. These tests render the
// REAL consumer components and assert callSageOnce is what actually gets called -- not
// fetch/localStorage -- per this repo's "would this verification still pass if reverted" rule.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { STORE_NAMES } from '../constants.js';

vi.mock('../lib/sage-client.js', () => ({
  callSageOnce: vi.fn(),
  callSageStream: vi.fn(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('DistrictLensPanel (analytics.js) generateNarrative — routes through sage-client, no personal API key or stale model id', () => {
  let container, root;
  beforeEach(() => { vi.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('"✨ Generate District Story" calls callSageOnce, never fetch, with no mf_anthropic_key set', async () => {
    const { callSageOnce } = await import('../lib/sage-client.js');
    callSageOnce.mockResolvedValue('Oklahoma and Florida both lean on OEPE as the top lever.');
    const { DistrictLensPanel } = await import('../views/analytics.js');

    const origFetch = global.fetch;
    global.fetch = vi.fn(() => { throw new Error('should not call fetch directly -- must go through sage-client'); });

    // computeAllCorrelations needs >=10 matched days of (sales, oepe) for at least one store
    // for hasData (and the Story tab's content) to render at all -- the panel's real data gate.
    const fixLoc = Object.keys(STORE_NAMES)[0];
    const laborRows = [], opsRows = [];
    for (let i = 0; i < 12; i++) {
      const date = new Date(2026, 0, i + 1);
      laborRows.push({ loc: fixLoc, date, sales: 10000 + i * 500 });
      opsRows.push({ loc: fixLoc, date, oepe: 200 - i * 5 });
    }

    await act(async () => {
      root.render(React.createElement(DistrictLensPanel, {
        stores: [], ds: { loaded: true, laborRows, opsRows }, settings: {}, onClose: () => {},
      }));
    });

    const storyTab = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Story'));
    expect(storyTab).toBeTruthy();
    await act(async () => { storyTab.click(); });

    const genBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Generate District Story'));
    expect(genBtn).toBeTruthy();
    await act(async () => { genBtn.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(callSageOnce).toHaveBeenCalledTimes(1);
    const [messages] = callSageOnce.mock.calls[0];
    expect(messages).toEqual([{ role: 'user', content: expect.stringContaining('Correlation analysis for a 27-store district') }]);
    expect(container.textContent).toContain('Oklahoma and Florida both lean on OEPE');
    expect(container.textContent).not.toContain('No API key');

    global.fetch = origFetch;
  });
});

describe('AtAGlance (at-a-glance.js) fetchAIComment — routes through sage-client, no personal API key or retired model id', () => {
  let container, root;
  const day = n => new Date(2026, 9, n, 12);
  const NOOP = () => {};
  const baseProps = {
    stores: [{ loc: '10422' }],
    ds: { loaded: false },
    settings: { weekStartDay: 3 },
    userEvents: [],
    lockedProjections: {},
    dateRange: { s: day(1), e: day(9), label: 'MTD' },
    onOpenStore: NOOP, onCoachingSaved: NOOP, onOpenProjections: NOOP,
    onOpenPVSA: NOOP, onOpenBrief: NOOP, onNav: NOOP, onOpenModal: NOOP,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('clicking the "AI Narrative" toggle calls callSageOnce, never fetch, with no mf_anthropic_key set', async () => {
    const { callSageOnce } = await import('../lib/sage-client.js');
    callSageOnce.mockResolvedValue('District is tracking to plan with no critical issues today.');
    const { AtAGlance } = await import('../views/at-a-glance.js');

    const origFetch = global.fetch;
    global.fetch = vi.fn(() => { throw new Error('should not call fetch directly -- must go through sage-client'); });

    await act(async () => { root.render(React.createElement(AtAGlance, baseProps)); });

    const aiToggle = [...container.querySelectorAll('button')].find(b => b.textContent.trim() === 'AI Narrative');
    expect(aiToggle).toBeTruthy();
    await act(async () => { aiToggle.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(callSageOnce).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('District is tracking to plan');
    expect(container.textContent).not.toContain('No API key');

    global.fetch = origFetch;
  });
});

describe('LocationIntelligence (location-intel.js) liGenerateAI — routes through sage-client, no personal API key and no retired model id', () => {
  let container, root;
  beforeEach(() => { vi.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('switching to AI mode and clicking "⚡ Generate" calls callSageOnce, never fetch (the old version never even sent an API key header)', async () => {
    const { callSageOnce } = await import('../lib/sage-client.js');
    callSageOnce.mockResolvedValue('This location is outperforming district average on speed.');
    const { LocationIntelligence } = await import('../features/location-intel.js');

    const origFetch = global.fetch;
    global.fetch = vi.fn(() => { throw new Error('should not call fetch directly -- must go through sage-client'); });

    const firstLoc = Object.keys(STORE_NAMES)[0];
    await act(async () => {
      root.render(React.createElement(LocationIntelligence, {
        store: { loc: firstLoc }, allStores: [{ loc: firstLoc }], ds: { loaded: true }, settings: {},
        scope: 'store', onClose: () => {},
      }));
    });

    const aiTab = [...container.querySelectorAll('button')].find(b => b.textContent.includes('AI Narrative'));
    expect(aiTab).toBeTruthy();
    await act(async () => { aiTab.click(); });

    const genBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Generate'));
    expect(genBtn).toBeTruthy();
    await act(async () => { genBtn.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(callSageOnce).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('outperforming district average');

    global.fetch = origFetch;
  });
});
