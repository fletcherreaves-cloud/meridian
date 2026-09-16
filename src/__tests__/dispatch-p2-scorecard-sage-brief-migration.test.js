// @vitest-environment happy-dom
// @ts-nocheck
// Task #76 (P2 panel scorecard) found two panels dead-by-default: GM Coaching Brief
// (src/engine/coaching.js's callClaude) and Forecast Brief (src/views/analytics.js's
// LocationBrief.generateBrief) both required a personal Anthropic API key via
// localStorage `mf_anthropic_key` and called api.anthropic.com directly -- a key nobody
// (including the owner) has ever set, so both always threw before generating anything.
// Fixed by routing both through the already-deployed sage-chat Edge Function via the new
// shared src/lib/sage-client.js (extracted from sage.js's own callSageStream). These tests
// render the REAL components and assert callSageOnce is what actually gets called --
// mocking only the network boundary -- so a revert of the wiring (not just the helper)
// would fail here, per this repo's "would this verification still pass if reverted" rule.
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

describe('GM Coaching Brief (coaching.js) — callClaude routes through sage-client, not a personal API key', () => {
  let container, root, origLS;

  beforeEach(async () => {
    vi.clearAllMocks();
    origLS = globalThis.localStorage;
    // No mf_anthropic_key set anywhere -- the exact state every real user (including the
    // owner) is in, and the state that made this panel always throw before the fix.
    globalThis.localStorage = {
      getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {},
    };
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    globalThis.localStorage = origLS;
  });

  it('generates a letter via callSageOnce with no Anthropic API key set, and never touches localStorage/fetch for it', async () => {
    const { callSageOnce } = await import('../lib/sage-client.js');
    callSageOnce.mockResolvedValue('[WIN] Great week. [FOCUS] Keep it up. [ACTION] Nothing. [INSIGHT] None. [NEXT WEEK] Same.');
    const { GMCoachingBrief } = await import('../engine/coaching.js');

    const firstLoc = Object.keys(STORE_NAMES).sort((a, b) => STORE_NAMES[a].localeCompare(STORE_NAMES[b]))[0];
    const stores = [{
      loc: firstLoc, p: { laborPct: 0.24, tpph: 6.2, oepe: 180 }, p2: { laborPct: 0.23, tpph: 6.3, oepe: 175 },
      p4: { laborPct: 0.24, tpph: 6.2, oepe: 178 }, t: {}, opsScore: 88, ctrlScore: 90,
      pSales: 45000, pLY: 42000, findings: [], gm: 'Jordan Lee', city: 'Duncan', state: 'OK',
    }];

    const origFetch = global.fetch;
    global.fetch = vi.fn(() => { throw new Error('should not call fetch directly -- must go through sage-client'); });

    await act(async () => {
      root.render(React.createElement(GMCoachingBrief, {
        // loaded:true but no rows of any kind -- runWhyEngineScan (whyScan) still no-ops
        // safely on empty data; hasEnoughData comes from the store fixture's own pSales, not ds.
        stores, ds: { loaded: true }, settings: {}, userEvents: {}, onClose: () => {},
      }));
    });

    const genBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Generate'));
    expect(genBtn).toBeTruthy();
    await act(async () => { genBtn.click(); });
    // Flush the async generateSingle()
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(callSageOnce).toHaveBeenCalledTimes(1);
    const [messages, systemPrompt] = callSageOnce.mock.calls[0];
    expect(messages).toEqual([{ role: 'user', content: expect.stringContaining('coaching letter') }]);
    expect(systemPrompt).toEqual(expect.stringContaining('field coach'));
    expect(container.textContent).toContain('Draft generated');
    expect(container.textContent).not.toContain('API key');

    global.fetch = origFetch;
  });
});

describe('Forecast Brief (analytics.js LocationBrief) — generateBrief routes through sage-client, no API-key gate', () => {
  let container, root;
  beforeEach(() => {
    vi.clearAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('shows "Ready to generate brief" (not "API key required") with no key set, and calling Generate uses callSageOnce', async () => {
    const { callSageOnce } = await import('../lib/sage-client.js');
    callSageOnce.mockResolvedValue('District performance is trending up.');
    const { LocationBrief } = await import('../views/analytics.js');

    const stores = [{
      loc: '10422', name: 'Duncan', p: { t2w: 0.02, t6w: 0.01, oepe: 180, tpph: 6.2, laborPct: 0.24 },
      t: {}, opsScore: 85,
    }];

    await act(async () => {
      root.render(React.createElement(LocationBrief, {
        stores, ds: { loaded: false }, settings: {}, scope: 'store', scopeLabel: 'Duncan', onClose: () => {},
      }));
    });

    expect(container.textContent).toContain('Ready to generate brief');
    expect(container.textContent).not.toContain('API key required');

    const genBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Generate Intelligence Brief'));
    expect(genBtn).toBeTruthy();
    await act(async () => { genBtn.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(callSageOnce).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('District performance is trending up.');
  });
});
