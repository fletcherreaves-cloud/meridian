// @vitest-environment happy-dom
// @ts-nocheck
// The Huddle -- Phase 1 (owner request 2026-11-08): a click-to-generate AI narrative line on
// Curated Home, reusing callSageOnce (the already-deployed sage-chat pipeline). Two halves:
// pure logic (src/engine/huddle-narrative.js) tested directly, and the real HuddleNarrative/
// CuratedHomePanel wiring tested at render-level per this repo's "would this still pass if
// reverted" bar -- a test that only imports the engine can't tell "built" from "built but never
// wired into the panel."
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  huddleScopeKey, huddleStorageKey, buildHuddleFacts, huddleSystemPrompt, huddleUserMessage,
} from '../engine/huddle-narrative.js';

describe('huddleScopeKey', () => {
  it('operatorGroup wins over everything else (a real operator identity beats any simulation)', () => {
    expect(huddleScopeKey('district', '3708', 'Ryan Thorley')).toBe('operator:Ryan Thorley');
  });
  it('viewAsScope narrows a store-altitude key to the specific store', () => {
    expect(huddleScopeKey('store', '3708', null)).toBe('store:3708');
  });
  it('viewAsScope narrows a patch-altitude key to the specific supervisor', () => {
    expect(huddleScopeKey('patch', 'Zukarr Eaves', null)).toBe('patch:Zukarr Eaves');
  });
  it('a real (non-simulated, non-operator) login just gets its own altitude as the key', () => {
    expect(huddleScopeKey('store', null, null)).toBe('store');
    expect(huddleScopeKey('district', null, null)).toBe('district');
  });
});

describe('huddleStorageKey', () => {
  it('combines scope and date into one key, distinct per day', () => {
    expect(huddleStorageKey('store:3708', '2026-11-08')).toBe('huddle_narrative_store:3708_2026-11-08');
    expect(huddleStorageKey('store:3708', '2026-11-09')).not.toBe(huddleStorageKey('store:3708', '2026-11-08'));
  });
});

function flag(over) { return { headline: 'h', detail: 'd', action: 'a', ...over }; }

describe('buildHuddleFacts', () => {
  it('counts severities straight off the real store objects, never re-derived', () => {
    const stores = [
      { name: 'A', severity: 'RED', flags: [flag()] },
      { name: 'B', severity: 'GREEN', flags: [] },
      { name: 'C', severity: 'AMBER', flags: [flag()] },
    ];
    const facts = buildHuddleFacts(stores, 'patch');
    expect(facts).toMatchObject({ altitude: 'patch', storeCount: 3, red: 1, amber: 1, green: 1 });
  });

  it('ranks flagged stores RED before AMBER before GREEN, caps at 3 stores', () => {
    const stores = [
      { name: 'Green-flagged', severity: 'GREEN', flags: [flag({ headline: 'g' })] },
      { name: 'Red-1', severity: 'RED', flags: [flag({ headline: 'r1' })] },
      { name: 'Amber-1', severity: 'AMBER', flags: [flag({ headline: 'a1' })] },
      { name: 'Red-2', severity: 'RED', flags: [flag({ headline: 'r2' })] },
      { name: 'Clean', severity: 'GREEN', flags: [] }, // no flags -- never appears in flaggedStores
    ];
    const facts = buildHuddleFacts(stores, 'district');
    expect(facts.flaggedStores).toHaveLength(3);
    expect(facts.flaggedStores.map(s => s.severity)).toEqual(['RED', 'RED', 'AMBER']);
    expect(facts.flaggedStores.every(s => s.store !== 'Clean')).toBe(true);
  });

  it('caps each flagged store at 2 flags', () => {
    const stores = [{ name: 'A', severity: 'RED', flags: [flag({ headline: '1' }), flag({ headline: '2' }), flag({ headline: '3' })] }];
    const facts = buildHuddleFacts(stores, 'store');
    expect(facts.flaggedStores[0].flags).toHaveLength(2);
  });

  it('handles an empty/missing stores array without throwing', () => {
    expect(buildHuddleFacts(null, 'store')).toMatchObject({ storeCount: 0, red: 0, amber: 0, green: 0, flaggedStores: [] });
    expect(buildHuddleFacts([], 'store')).toMatchObject({ storeCount: 0, flaggedStores: [] });
  });
});

describe('huddleSystemPrompt — voice by role/altitude (owner request: "keeping things worded appropriately for each role")', () => {
  it('store altitude gets a shift-lead/GM voice', () => {
    expect(huddleSystemPrompt('store')).toMatch(/GM or manager/i);
  });
  it('patch altitude gets a supervisor-coaching voice that leads with recognition', () => {
    const p = huddleSystemPrompt('patch');
    expect(p).toMatch(/Area Supervisor/i);
    expect(p).toMatch(/win to recognize/i);
  });
  it('district altitude gets a "lead through supervisors" voice, not store-level', () => {
    const p = huddleSystemPrompt('district');
    expect(p).toMatch(/District Ops/i);
    expect(p).toMatch(/THROUGH supervisors/);
  });
  it('an unrecognized altitude falls back to the store voice rather than throwing', () => {
    expect(huddleSystemPrompt('bogus')).toBe(huddleSystemPrompt('store'));
  });
});

describe('huddleUserMessage', () => {
  it('embeds the facts as JSON the model can read', () => {
    const facts = { altitude: 'store', red: 1 };
    const msg = huddleUserMessage(facts);
    expect(msg).toContain(JSON.stringify(facts));
  });
});

// ── Render-level: the real CuratedHomePanel + HuddleNarrative wiring ──────────────────────────
const loadUserSettingMock = vi.fn();
const saveUserSettingMock = vi.fn();
vi.mock('../lib/supabase.js', () => ({
  loadUserSetting: (...args) => loadUserSettingMock(...args),
  saveUserSetting: (...args) => saveUserSettingMock(...args),
}));
const callSageOnceMock = vi.fn();
vi.mock('../lib/sage-client.js', () => ({
  callSageOnce: (...args) => callSageOnceMock(...args),
  callSageStream: vi.fn(),
}));

import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

function freshBrief() {
  return {
    stores: [
      { loc: '3708', name: 'Ardmore-Broadway', hasData: true, severity: 'RED',
        flags: [flag({ headline: '19 drawer opens' })] },
      { loc: '24471', name: 'Ardmore-Cooper', hasData: true, severity: 'GREEN', flags: [] },
    ],
    summary: { red: 1, amber: 0, green: 1, noData: 0, totalFlags: 1 },
  };
}
let BRIEF_FIXTURE;
vi.mock('../features/morning-brief.js', () => ({
  computeMorningBrief: () => BRIEF_FIXTURE,
  getLatestBriefDate: () => new Date('2026-11-08T12:00:00'),
  useBriefDarByLoc: () => ({}),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { CuratedHomePanel } = await import('../views/curated-home.js');

let container, root;
beforeEach(() => {
  BRIEF_FIXTURE = freshBrief();
  loadUserSettingMock.mockReset().mockResolvedValue(null);
  saveUserSettingMock.mockReset().mockResolvedValue(undefined);
  callSageOnceMock.mockReset().mockResolvedValue('Sample narrative.');
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

async function mount(props) {
  await act(async () => {
    root.render(React.createElement(CuratedHomePanel, { ds: {}, settings: {}, role: 'gm', darRows: [], ...props }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

describe('HuddleNarrative wired into CuratedHomePanel', () => {
  it('renders the click-to-generate affordance and no AI call fires on mount alone', async () => {
    await mount({ role: 'gm' });
    expect(container.textContent).toContain('No huddle note yet for today.');
    expect(callSageOnceMock).not.toHaveBeenCalled();
  });

  it('clicking the Huddle button calls callSageOnce with the store-altitude voice and renders the result', async () => {
    await mount({ role: 'gm' });
    const btn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Huddle'));
    expect(btn, 'Huddle button not found').toBeTruthy();
    await act(async () => { btn.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(callSageOnceMock).toHaveBeenCalledTimes(1);
    const [messages, systemPrompt] = callSageOnceMock.mock.calls[0];
    expect(systemPrompt).toMatch(/GM or manager/i);
    // The real facts straight from the fixture's two stores -- not re-derived or approximated.
    expect(messages[0].content).toContain('"red":1');
    expect(messages[0].content).toContain('Ardmore-Broadway');
    expect(container.textContent).toContain('Sample narrative.');
  });

  it('caches the generated narrative to user_settings, keyed by scope + business day', async () => {
    await mount({ role: 'gm' });
    const btn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Huddle'));
    await act(async () => { btn.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(saveUserSettingMock).toHaveBeenCalledWith(
      expect.stringContaining('huddle_narrative_store_2026-11-08'),
      expect.objectContaining({ text: 'Sample narrative.' }),
    );
  });

  it('a cached narrative from a prior click loads without calling the AI again', async () => {
    loadUserSettingMock.mockResolvedValue({ text: 'Already generated today.' });
    await mount({ role: 'gm' });
    expect(container.textContent).toContain('Already generated today.');
    expect(callSageOnceMock).not.toHaveBeenCalled();
  });

  it('an AI failure shows an error instead of crashing the panel', async () => {
    callSageOnceMock.mockRejectedValue(new Error('network down'));
    await mount({ role: 'gm' });
    const btn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Huddle'));
    await act(async () => { btn.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toContain('AI narrative unavailable');
    expect(container.textContent).toContain('network down');
  });

  it('a patch-altitude viewer gets the supervisor-coaching voice, not the GM voice', async () => {
    await mount({ role: 'area_supervisor' });
    const btn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Huddle'));
    await act(async () => { btn.click(); await Promise.resolve(); await Promise.resolve(); });
    const [, systemPrompt] = callSageOnceMock.mock.calls[0];
    expect(systemPrompt).toMatch(/Area Supervisor/i);
  });
});
