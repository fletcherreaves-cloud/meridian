// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch 2026-10-10 — follow-up to the Sonnet-4-retirement fix (v5.513). Owner asked to
// finish migrating every remaining api.anthropic.com/personal-key call site onto the
// already-deployed sage-chat Edge Function (callSageOnce), so no feature in the app still
// depends on a personal Anthropic API key.
//
// Audit found 8 such call sites total. 3 genuinely need Anthropic's server-side
// web_search_20250305 tool (why.js's lookupMissEvent, calendar.js's searchUpcomingEvents,
// analytics.js's AIBacktestScanner callClaudeWithSearch helper) -- sage-chat's TOOLS array is
// its own fixed SAGE data-query toolset and does not proxy an arbitrary caller-supplied tool,
// so migrating those would silently drop real web search. Deliberately left on the legacy
// pattern; flagged back to the owner separately.
//
// The other 5 are plain text generation (no tools) and were migrated here, same as the 3
// fixed in v5.513:
//   - store-dash.js's AITabInsight (reusable "💡 AI Analysis" button, several tabs)
//   - analytics.js's AIInsightsTab ("⚡ Generate Insights", store-level AI performance insights)
//   - analytics.js's DistrictPriorityBrief ("✍ Weekly Narrative")
//   - calendar.js's generateReviewPack (batch per-anomaly suggestion text, "📤 Pack")
//   - projections.js's PreForecastBrief ("Generate Summary")
//
// These tests render the real components and assert callSageOnce is what actually gets
// called, never fetch/localStorage mf_anthropic_key, per this repo's "would this verification
// still pass if reverted" rule.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../lib/sage-client.js', () => ({
  callSageOnce: vi.fn(),
  callSageStream: vi.fn(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('AITabInsight (store-dash.js) — routes through sage-client, no personal API key gate', () => {
  let container, root;
  beforeEach(() => { vi.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('renders (and is clickable) with no mf_anthropic_key set, and calls callSageOnce, never fetch', async () => {
    const { callSageOnce } = await import('../lib/sage-client.js');
    callSageOnce.mockResolvedValue('Peak hours 11a-1p show the biggest OEPE/labor gap.');
    const { AITabInsight } = await import('../views/store-dash.js');

    const origFetch = global.fetch;
    global.fetch = vi.fn(() => { throw new Error('should not call fetch directly -- must go through sage-client'); });

    await act(async () => {
      root.render(React.createElement(AITabInsight, { label: 'Test Insight', buildPrompt: () => 'Analyze this.' }));
    });

    const runBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Test Insight'));
    expect(runBtn).toBeTruthy();
    await act(async () => { runBtn.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(callSageOnce).toHaveBeenCalledTimes(1);
    expect(callSageOnce.mock.calls[0][0]).toEqual([{ role: 'user', content: 'Analyze this.' }]);
    expect(container.textContent).toContain('Peak hours 11a-1p');

    global.fetch = origFetch;
  });
});

describe('AIInsightsTab (analytics.js) — routes through sage-client, no personal API key gate', () => {
  let container, root;
  beforeEach(() => { vi.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('"⚡ Generate Insights" calls callSageOnce, never fetch, with no mf_anthropic_key set', async () => {
    const { callSageOnce } = await import('../lib/sage-client.js');
    callSageOnce.mockResolvedValue('1. Top 3 Priority Actions: ...');
    const { AIInsightsTab } = await import('../views/analytics.js');

    const origFetch = global.fetch;
    global.fetch = vi.fn(() => { throw new Error('should not call fetch directly -- must go through sage-client'); });

    const store = { loc: '3708', p: { oepe: 180, tpph: 6.2 }, t: {} };
    await act(async () => {
      root.render(React.createElement(AIInsightsTab, { store, ds: { loaded: false }, settings: {} }));
    });

    const genBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Generate Insights'));
    expect(genBtn).toBeTruthy();
    await act(async () => { genBtn.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(callSageOnce).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Top 3 Priority Actions');
    expect(container.textContent).not.toContain('API key');

    global.fetch = origFetch;
  });
});

describe('DistrictPriorityBrief (analytics.js) — "Weekly Narrative" routes through sage-client', () => {
  let container, root;
  beforeEach(() => { vi.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('"Weekly Narrative" calls callSageOnce, never fetch, with no mf_anthropic_key set', async () => {
    const { callSageOnce } = await import('../lib/sage-client.js');
    callSageOnce.mockResolvedValue('District performance held steady this week.');
    const { DistrictPriorityBrief } = await import('../views/analytics.js');

    const origFetch = global.fetch;
    global.fetch = vi.fn(() => { throw new Error('should not call fetch directly -- must go through sage-client'); });

    const stores = [{ loc: '3708', name: 'Duncan', findings: [], opsScore: 90, ctrlScore: 90, pSales: 40000, pLY: 38000 }];
    await act(async () => {
      root.render(React.createElement(DistrictPriorityBrief, {
        stores, ds: { loaded: false }, settings: {}, userEvents: {}, onSelectStore: () => {}, onClose: () => {},
      }));
    });

    const narBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Weekly Narrative'));
    expect(narBtn).toBeTruthy();
    await act(async () => { narBtn.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(callSageOnce).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('District performance held steady');

    global.fetch = origFetch;
  });
});

describe('PreForecastBrief (projections.js) — "Generate Summary" routes through sage-client', () => {
  let container, root;
  beforeEach(() => { vi.clearAllMocks(); container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('"Generate Summary" calls callSageOnce, never fetch, with no mf_anthropic_key set', async () => {
    const { callSageOnce } = await import('../lib/sage-client.js');
    callSageOnce.mockResolvedValue('Sales are trending up this week. Staffing is on plan.');
    const { PreForecastBrief } = await import('../features/projections.js');

    const origFetch = global.fetch;
    global.fetch = vi.fn(() => { throw new Error('should not call fetch directly -- must go through sage-client'); });

    const ds = { loaded: true, laborRows: [], opsRows: [], ctrlRows: [] };
    await act(async () => {
      root.render(React.createElement(PreForecastBrief, {
        stores: [{ loc: '3708' }], ds, settings: {}, userEvents: {}, weekStart: '2026-01-07',
        projPeriod: 'week', lockedProjections: {}, onRun: () => {}, onClose: () => {},
      }));
    });

    const genBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Generate Summary'));
    expect(genBtn).toBeTruthy();
    await act(async () => { genBtn.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(callSageOnce).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Sales are trending up this week');

    global.fetch = origFetch;
  });
});

describe('generateReviewPack (calendar.js) — per-anomaly AI suggestions route through sage-client', () => {
  let origFetch, origCreateObjectURL, origRevokeObjectURL;
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    origFetch = global.fetch;
    global.fetch = vi.fn(() => { throw new Error('should not call fetch directly -- must go through sage-client'); });
    origCreateObjectURL = global.URL.createObjectURL;
    origRevokeObjectURL = global.URL.revokeObjectURL;
    global.URL.createObjectURL = vi.fn(() => 'blob:mock');
    global.URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => {
    global.fetch = origFetch;
    global.URL.createObjectURL = origCreateObjectURL;
    global.URL.revokeObjectURL = origRevokeObjectURL;
  });

  it('batch-generates a suggestion per anomaly via callSageOnce, never fetch, with no mf_anthropic_key set', async () => {
    const { callSageOnce } = await import('../lib/sage-client.js');
    callSageOnce.mockResolvedValue('Likely a local event drove extra traffic.');
    const { generateReviewPack } = await import('../features/calendar.js');

    localStorage.setItem('mf_backtest_results', JSON.stringify({
      '3708': [{ dateStr: 'Jan 5, 2026', dow: 'Mon', varPct: 12.3, actual: 5000, forecast: 4000, dKeyStr: '2026-01-05' }],
    }));
    localStorage.setItem('mf_events', '{}');

    await generateReviewPack('3708', { loaded: true }, {}, {});

    expect(callSageOnce).toHaveBeenCalledTimes(1);
    expect(callSageOnce.mock.calls[0][0][0].content).toContain('sales on');
  });
});
