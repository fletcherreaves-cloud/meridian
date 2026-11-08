// @vitest-environment happy-dom
// @ts-nocheck
// Task #126/#125 (memory/plan-count-cycle-surfaces-and-spotcheck-ruler-2026-11-08.md Section A
// item 1) — owner-approved starting point, 2026-11-08: "I like this! Lets start there." Wires
// GM Coaching Letters (src/engine/coaching.js) to the durable inv_count_sessions log so a real
// near-miss count (Axis-1 identified, Axis-2 non-compliant — task #126) names its specific
// missing items in the letter prompt instead of a generic "finish your count" nudge.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { STORE_NAMES } from '../constants.js';

vi.mock('../lib/sage-client.js', () => ({
  callSageOnce: vi.fn(),
  callSageStream: vi.fn(),
}));

const mockLoadInvCountSessions = vi.fn();
vi.mock('../lib/supabase.js', () => ({
  loadInvCountSessions: (...args) => mockLoadInvCountSessions(...args),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('GM Coaching Letters — count-cycle near-miss wiring (task #126/#125)', () => {
  let container, root;
  const firstLoc = Object.keys(STORE_NAMES).sort((a, b) => STORE_NAMES[a].localeCompare(STORE_NAMES[b]))[0];

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

  it('names the real missing items from the most recent near-miss count in the letter prompt', async () => {
    const { callSageOnce } = await import('../lib/sage-client.js');
    callSageOnce.mockResolvedValue('[WIN] x [FOCUS] x [ACTION] x [INSIGHT] x [NEXT WEEK] x');
    mockLoadInvCountSessions.mockResolvedValue([
      { loc: firstLoc, countDate: '2026-10-30', cls: 'Paper', period: '2026-10',
        itemsCounted: 84, classTotal: 96, covered: false,
        missingItems: [{ wrin: 'P-1', descr: 'Pour Spouts' }, { wrin: 'P-2', descr: 'Clamshell Boxes' }] },
      { loc: firstLoc, countDate: '2026-10-30', cls: 'Food', period: '2026-10',
        itemsCounted: 118, classTotal: 120, covered: false, missingItems: null },
    ]);

    const { GMCoachingBrief } = await import('../engine/coaching.js');
    const stores = [{
      loc: firstLoc, p: { laborPct: 0.24, tpph: 6.2, oepe: 180 }, p2: {}, p4: {}, t: {},
      opsScore: 88, ctrlScore: 90, pSales: 45000, pLY: 42000, findings: [],
      gm: 'Jordan Lee', city: 'Duncan', state: 'OK',
    }];

    await act(async () => {
      root.render(React.createElement(GMCoachingBrief, {
        stores, ds: { loaded: true }, settings: {}, userEvents: {}, onClose: () => {},
      }));
    });
    // Flush the loader's useEffect (loadInvCountSessions x2 + sessionsFromLog)
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

    const genBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Generate'));
    expect(genBtn).toBeTruthy();
    await act(async () => { genBtn.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(callSageOnce).toHaveBeenCalledTimes(1);
    const [messages] = callSageOnce.mock.calls[0];
    expect(messages[0].content).toContain('Pour Spouts');
    expect(messages[0].content).toContain('Clamshell Boxes');
    expect(messages[0].content).toMatch(/Paper \d+%/);
  });

  it('adds no count-cycle block when the store has no near-miss on record', async () => {
    const { callSageOnce } = await import('../lib/sage-client.js');
    callSageOnce.mockResolvedValue('[WIN] x [FOCUS] x [ACTION] x [INSIGHT] x [NEXT WEEK] x');
    mockLoadInvCountSessions.mockResolvedValue([]);

    const { GMCoachingBrief } = await import('../engine/coaching.js');
    const stores = [{
      loc: firstLoc, p: { laborPct: 0.24 }, p2: {}, p4: {}, t: {}, opsScore: 88, ctrlScore: 90,
      pSales: 45000, pLY: 42000, findings: [], gm: 'Jordan Lee', city: 'Duncan', state: 'OK',
    }];

    await act(async () => {
      root.render(React.createElement(GMCoachingBrief, {
        stores, ds: { loaded: true }, settings: {}, userEvents: {}, onClose: () => {},
      }));
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });

    const genBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Generate'));
    await act(async () => { genBtn.click(); });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    const [messages] = callSageOnce.mock.calls[0];
    expect(messages[0].content).not.toContain('Most recent inventory count');
  });
});
