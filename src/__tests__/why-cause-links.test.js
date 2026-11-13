// @vitest-environment happy-dom
// @ts-nocheck
// Notes 73 #4 (owner, 2026-11-07): "Suggest where to look for more context on a finding, with
// links — even external." Checked before building anything new (same rule the remedy work
// followed): the in-app half already existed as KB_ARTICLES/InfoIcon (forecast.js), and the
// external half already existed as SAGE's own search_qsr_kb/search_project_memory/live-data
// tools reachable via the window.__MF_SAGE_SEED__/'mf:open-sage' seed convention
// (eom-dashboard.js's "Ask SAGE" buttons). So diagnoseMiss()'s causes get a `kbKey` (an
// EXISTING KB article) and an `askPrompt` (a cause-specific SAGE question) instead of a new,
// parallel help mechanism. These tests cover the engine-level guarantee (every real cause
// carries both) and the shared CauseLinks component that renders them identically in
// store-dash.js and analytics.js.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { diagnoseMiss, CauseLinks } from '../engine/why.js';

const baseR = (over = {}) => ({ date: new Date('2026-03-10T12:00:00'), actual: 1000, forecast: 900, varPct: 0.1, wAdj: 0, opsFactor: 1, ...over });

describe('diagnoseMiss() — every real cause carries a kbKey and an askPrompt', () => {
  it('a tagged event gets both', () => {
    const r = baseR();
    const userEvents = { '10422': { '2026-03-10': { label: 'Parade', note: 'Main St closed' } } };
    const causes = diagnoseMiss('10422', { loaded: false }, userEvents, r);
    const event = causes.find(c => c.icon === '📌');
    expect(event.kbKey).toBe('event_registry');
    expect(event.askPrompt).toMatch(/Parade/);
  });

  it('a weather mismatch points at the weather_adjustment article and names the store/date', () => {
    const ds = { wxByDate: { '2026-03-10': { rain: 2.0, tmax: 70, wmax: 5 } } };
    const r = baseR({ wAdj: 0.03, actual: 900, forecast: 1000 });
    const causes = diagnoseMiss('10422', ds, {}, r);
    const wx = causes.find(c => c.icon === '🌦');
    expect(wx.kbKey).toBe('weather_adjustment');
    expect(wx.askPrompt).toMatch(/recalibrat/i);
  });

  it('an ops-drag day points at the forecast formula and asks SAGE to pull the real labor data', () => {
    const r = baseR({ opsFactor: 0.9, actual: 850, forecast: 1000 });
    const causes = diagnoseMiss('10422', { loaded: false }, {}, r);
    const ops = causes.find(c => c.icon === '⚙️');
    expect(ops.kbKey).toBe('forecast_formula');
    expect(ops.askPrompt).toMatch(/labor summary/i);
  });

  it('trend divergence points at the forecast formula and asks which window to trust', () => {
    const r = baseR({ t2: 0.1, t6: -0.02 });
    const causes = diagnoseMiss('10422', { loaded: false }, {}, r);
    const trend = causes.find(c => c.icon === '📈');
    expect(trend.kbKey).toBe('forecast_formula');
    expect(trend.askPrompt).toMatch(/forecast accuracy/i);
  });

  it('no LY data points at the new-store ramp article', () => {
    const r = baseR({ noLYData: true });
    const causes = diagnoseMiss('10422', { loaded: false }, {}, r);
    const noLY = causes.find(c => c.icon === '📂');
    expect(noLY.kbKey).toBe('new_store_ramp');
    expect(noLY.askPrompt).toMatch(/project memory/i);
  });

  it('the unexplained fallback still carries both fields, asking about the broader pattern', () => {
    const r = baseR({ actual: 905, forecast: 900, varPct: 0.005, wAdj: 0, opsFactor: 1, t2: 0, t6: 0 });
    const causes = diagnoseMiss('10422', { loaded: false }, {}, r);
    expect(causes).toHaveLength(1);
    expect(causes[0].kbKey).toBe('why_engine_guide');
    expect(causes[0].askPrompt).toMatch(/recurring blind spot/i);
  });

  it('a single matching peer store gets a kbKey and an askPrompt naming both stores', () => {
    const missDate = new Date('2026-03-10T12:00:00');
    const peerDates = [1, 2, 3, 4, 5, 6].map(i => new Date(missDate.getTime() - i * 7 * 86400000));
    const ds = {
      loaded: true, storeIds: ['10422', '99999'],
      laborRows: [
        ...peerDates.map((d) => ({ loc: '10422', date: d, sales: 1000 })),
        ...peerDates.map((d, i) => ({ loc: '99999', date: d, sales: 950 + i * 10 })),
        { loc: '99999', date: missDate, sales: 1600 },
      ],
    };
    const r = baseR({ date: missDate, actual: 1000, forecast: 900 });
    const causes = diagnoseMiss('10422', ds, {}, r);
    const peer = causes.find(c => c.icon === '🏪' && c.weight === 'NOTE');
    expect(peer.kbKey).toBe('why_engine_guide');
    expect(peer.askPrompt).toMatch(/99999/); // STORE_NAMES has no entry for this test id, so it falls back to the loc itself
  });
});

describe('<CauseLinks> — renders the existing KB link + Ask SAGE button, never a parallel mechanism', () => {
  let container, root;
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); delete window.__MF_SAGE_SEED__; });

  it('renders nothing when the cause carries neither field', () => {
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    act(() => { root.render(React.createElement(CauseLinks, { cause: { text: 'x' } })); });
    expect(container.textContent).toBe('');
  });

  it('renders an Ask SAGE button that seeds window.__MF_SAGE_SEED__ and dispatches mf:open-sage on click', () => {
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    const cause = { text: 'Weather adj: -3% for rain', kbKey: 'weather_adjustment', askPrompt: 'Should this store recalibrate its rain coefficient?' };
    const onOpenSage = vi.fn();
    window.addEventListener('mf:open-sage', onOpenSage);
    act(() => { root.render(React.createElement(CauseLinks, { cause })); });

    const button = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Ask SAGE'));
    expect(button, 'Ask SAGE button not found').toBeTruthy();
    act(() => { button.click(); });

    expect(window.__MF_SAGE_SEED__).toEqual({ context: cause.text, prompt: cause.askPrompt });
    expect(onOpenSage).toHaveBeenCalledTimes(1);
    window.removeEventListener('mf:open-sage', onOpenSage);
  });
});
