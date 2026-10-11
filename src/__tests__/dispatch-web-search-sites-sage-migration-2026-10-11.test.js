// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch 2026-10-11 — the owner asked to migrate the last 3 personal-API-key call sites onto
// sage-chat too, now that SAGE itself has Anthropic's server-side web_search_20260209 tool
// (v5.515, memory/finding-sage-web-search-tool-2026-10-10.md). Those 3 sites
// (why.js's lookupMissEvent, calendar.js's searchUpcomingEvents, analytics.js's
// AIBacktestScanner callClaudeWithSearch helper) were deliberately left on the legacy
// api.anthropic.com pattern in v5.513/v5.514 for exactly this reason -- sage-chat didn't carry
// web_search yet, so migrating them then would have silently dropped real search.
//
// All 3 now route through callSageOnce with no personal Anthropic API key and no client-side
// tools array/multi-turn loop of their own -- sage-chat's own TOOLS array + round loop (fixed
// in v5.515 for exactly this: per-index input_json_delta accumulation and pause_turn handling)
// does the web search server-side. These tests render/call the real functions and assert
// callSageOnce is what actually gets called, never fetch/localStorage mf_anthropic_key.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../lib/sage-client.js', () => ({
  callSageOnce: vi.fn(),
  callSageStream: vi.fn(),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('lookupMissEvent (why.js) — AI Lookup routes through sage-client, no personal API key', () => {
  let origFetch;
  beforeEach(() => { vi.clearAllMocks(); origFetch = global.fetch; global.fetch = vi.fn(() => { throw new Error('should not call fetch directly -- must go through sage-client'); }); });
  afterEach(() => { global.fetch = origFetch; });

  it('calls callSageOnce with a web-search system prompt, never fetch, with no mf_anthropic_key set', async () => {
    const { callSageOnce } = await import('../lib/sage-client.js');
    callSageOnce.mockResolvedValue('A severe thunderstorm moved through the area that evening.');
    const { lookupMissEvent } = await import('../engine/why.js');

    let result = null;
    await lookupMissEvent(new Date('2026-03-10T12:00:00'), '10422', { tmax: 95, rain: 0.1, wmax: 10 }, r => { result = r; }, []);

    expect(callSageOnce).toHaveBeenCalledTimes(1);
    const [messages, systemPrompt] = callSageOnce.mock.calls[0];
    expect(messages).toEqual([{ role: 'user', content: expect.stringContaining('sales anomaly') }]);
    expect(systemPrompt).toEqual(expect.stringContaining('web search'));
    expect(result.text).toBe('A severe thunderstorm moved through the area that evening.');
    expect(result.error).toBeNull();
  });
});

describe('searchUpcomingEvents (calendar.js) — proactive search routes through sage-client, no personal API key', () => {
  let origFetch;
  beforeEach(() => { vi.clearAllMocks(); origFetch = global.fetch; global.fetch = vi.fn(() => { throw new Error('should not call fetch directly -- must go through sage-client'); }); });
  afterEach(() => { global.fetch = origFetch; });

  it('parses a valid JSON array response from callSageOnce into normalized candidates', async () => {
    const { callSageOnce } = await import('../lib/sage-client.js');
    callSageOnce.mockResolvedValue('[{"date":"2026-11-25","endDate":"2026-11-27","type":"school_break","label":"Thanksgiving Break","confidence":"high","sourceNote":"District calendar"}]');
    const { searchUpcomingEvents } = await import('../features/calendar.js');

    const found = await searchUpcomingEvents('29760');

    expect(callSageOnce).toHaveBeenCalledTimes(1);
    const [messages, systemPrompt] = callSageOnce.mock.calls[0];
    expect(messages).toEqual([{ role: 'user', content: expect.stringContaining('academic calendar') }]);
    expect(systemPrompt).toEqual(expect.stringContaining('web search'));
    expect(found).toEqual([{ date: '2026-11-25', endDate: '2026-11-27', type: 'school_break', label: 'Thanksgiving Break', confidence: 'high', sourceNote: 'District calendar' }]);
  });

  it('returns an empty array (not a throw) when callSageOnce returns unparseable text', async () => {
    const { callSageOnce } = await import('../lib/sage-client.js');
    callSageOnce.mockResolvedValue('Sorry, I could not find anything reliable.');
    const { searchUpcomingEvents } = await import('../features/calendar.js');

    const found = await searchUpcomingEvents('29760');
    expect(found).toEqual([]);
  });
});

describe('AIBacktestScanner (analytics.js) — per-row "🔍 AI" and batch scan route through sage-client', () => {
  let container, root, origFetch;
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    origFetch = global.fetch;
    global.fetch = vi.fn(() => { throw new Error('should not call fetch directly -- must go through sage-client'); });
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    global.fetch = origFetch;
  });

  it('"🔍 AI" per-row lookup calls callSageOnce, never fetch, with no mf_anthropic_key set', async () => {
    const { callSageOnce } = await import('../lib/sage-client.js');
    callSageOnce.mockResolvedValue('A local festival drew extra traffic that day.');
    const { AIBacktestScanner } = await import('../views/analytics.js');

    localStorage.setItem('mf_backtest_results', JSON.stringify({
      '3708': [{ dateStr: 'Jan 5, 2026', dow: 'Mon', varPct: 15.2, actual: 12000, forecast: 10000, dKeyStr: '2026-01-05', lyVarPct: null, isHoliday: false }],
    }));

    await act(async () => {
      root.render(React.createElement(AIBacktestScanner, {
        stores: [{ loc: '3708' }], ds: { loaded: false }, settings: {}, userEvents: {}, onTagEvent: () => {},
      }));
    });

    const aiBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('🔍 AI'));
    expect(aiBtn).toBeTruthy();
    await act(async () => { aiBtn.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(callSageOnce).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('A local festival drew extra traffic');
  });

  it('"🤖 AI Batch" is no longer gated on a personal API key (always enabled once a scan has results)', async () => {
    const { AIBacktestScanner } = await import('../views/analytics.js');

    localStorage.setItem('mf_backtest_results', JSON.stringify({
      '3708': [{ dateStr: 'Jan 5, 2026', dow: 'Mon', varPct: 15.2, actual: 12000, forecast: 10000, dKeyStr: '2026-01-05', lyVarPct: null, isHoliday: false }],
    }));

    await act(async () => {
      root.render(React.createElement(AIBacktestScanner, {
        stores: [{ loc: '3708' }], ds: { loaded: false }, settings: {}, userEvents: {}, onTagEvent: () => {},
      }));
    });

    const batchBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('AI Batch'));
    expect(batchBtn).toBeTruthy();
    expect(batchBtn.disabled).toBe(false);
    expect(batchBtn.title).not.toContain('API key');
  });
});
