// @vitest-environment happy-dom
// @ts-nocheck
// Task #132 Phase 1, recommendation #3 (owner request 2026-11-08, "small focused vs big
// picture"): Intelligence Brief's two prompt voices (operator-coaching-a-GM vs. enterprise-
// briefing-a-VP) already existed but were gated on SCOPE SIZE (locs.length > 1), not on who's
// asking -- a GM comparing two of their own stores got the enterprise/VP voice, and a VP drilling
// into one store got the GM-coaching voice. Re-keyed to the caller's real altitude
// (altitudeForRole, the same 3-way collapse recommendations #1/#2 reuse): 'store' altitude always
// gets the coaching voice, 'patch'/'district' altitude always gets the enterprise voice,
// regardless of scope size. Scope size is kept as a secondary modifier -- the location count is
// stated explicitly in the prompt either way (open question #5).
//
// Drives the real exported LocationBrief component end to end, asserting on the actual prompt
// text sent to callSageOnce (mocked) -- per this repo's "would this still pass if reverted" bar,
// a test that only checked a role->voice mapping function in isolation could pass unchanged with
// the component's own wiring to it deleted.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const callSageOnce = vi.fn().mockResolvedValue('Mock brief text.');
vi.mock('../lib/sage-client.js', () => ({ callSageOnce: (...args) => callSageOnce(...args) }));

const { LocationBrief } = await import('../views/analytics.js');

// Fake, non-real store locs (no `p` field needed -- buildBriefContext skips any store without
// one, so this isolates the voice-selection logic from the metric-context build entirely).
const STORES = [{ loc: '91001' }, { loc: '91002' }];

async function renderAndGenerate({ scope, scopeLabel, effectiveRole }) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(LocationBrief, {
      stores: STORES, ds: {}, settings: {}, scope, scopeLabel, effectiveRole, onClose: () => {},
    }));
  });
  const genBtn = [...container.querySelectorAll('button')].find(b => b.textContent.startsWith('🧠 Generate Intelligence Brief'));
  expect(genBtn, 'generate button not found').toBeTruthy();
  await act(async () => { genBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  act(() => { root.unmount(); });
  container.remove();
}

afterEach(() => { callSageOnce.mockClear(); });

describe('LocationBrief — role-keyed voice (task #132 rec #3)', () => {
  it('a store-altitude role (GM) gets the coaching voice even on a multi-store (district) scope', async () => {
    await renderAndGenerate({ scope: 'district', scopeLabel: 'Test District', effectiveRole: 'gm' });
    const prompt = callSageOnce.mock.calls[0][0][0].content;
    expect(prompt).toContain('LOCATION INTELLIGENCE BRIEF');
    expect(prompt).not.toContain('ENTERPRISE-LEVEL');
    expect(prompt).toContain('DATA (2 locations):');
  });

  it('a district-altitude role (VP) gets the enterprise voice even on a single-store scope', async () => {
    await renderAndGenerate({ scope: 'store', scopeLabel: 'Test Store', effectiveRole: 'vp' });
    const prompt = callSageOnce.mock.calls[0][0][0].content;
    expect(prompt).toContain('ENTERPRISE-LEVEL');
    expect(prompt).not.toContain('LOCATION INTELLIGENCE BRIEF');
    expect(prompt).toContain('DATA (1 location):');
  });

  it('a patch-altitude role (OM) also gets the enterprise voice, not just VP/Owner', async () => {
    await renderAndGenerate({ scope: 'store', scopeLabel: 'Test Store', effectiveRole: 'om' });
    const prompt = callSageOnce.mock.calls[0][0][0].content;
    expect(prompt).toContain('ENTERPRISE-LEVEL');
  });

  it('falls back to the old scope-size heuristic when no role is threaded in at all', async () => {
    await renderAndGenerate({ scope: 'district', scopeLabel: 'Test District', effectiveRole: undefined });
    const prompt = callSageOnce.mock.calls[0][0][0].content;
    expect(prompt).toContain('ENTERPRISE-LEVEL'); // isMulti (2 stores) -> old behavior unchanged
  });
});
