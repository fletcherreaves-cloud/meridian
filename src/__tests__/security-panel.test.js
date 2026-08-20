// @vitest-environment happy-dom
// @ts-nocheck
// The Security panel (dispatch #43, Phase 1). Pure-logic tests for the subject-grouping/
// permission/scope helpers, PLUS call-site rendering tests (standing rule from #366 — a test
// that only imports a grouping helper can't tell "built" from "built but never wired in").
// Mocks src/lib/supabase.js's loaders, matching dispatch #38's own RevealName test pattern
// (src/__tests__/reveal-name.test.js) -- no live Supabase session in this sandbox.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const loadSecurityFindingsMock = vi.fn();
const loadSecurityRulesMock = vi.fn();
const loadGmIdentityRevealEnabledMock = vi.fn();
const rpcMock = vi.fn();

vi.mock('../lib/supabase.js', () => ({
  supabase: { rpc: (...args) => rpcMock(...args) },
  loadSecurityFindings: (...args) => loadSecurityFindingsMock(...args),
  loadSecurityRules: (...args) => loadSecurityRulesMock(...args),
  loadGmIdentityRevealEnabled: (...args) => loadGmIdentityRevealEnabledMock(...args),
}));

import {
  securityPanelAccess, verdictState, groupFindingsBySubject, scopeMatches, SecurityPanel,
} from '../views/security-panel.js';

// ── Pure logic ────────────────────────────────────────────────────────────────────────────────

describe('securityPanelAccess() — matches security_findings\' RLS tier exactly, never looser', () => {
  it('admin and supervisor are always allowed, without needing the org_config flag', () => {
    expect(securityPanelAccess('admin', false)).toBe('allowed');
    expect(securityPanelAccess('supervisor', false)).toBe('allowed');
  });
  it('manager is allowed ONLY when gmRevealEnabled is true', () => {
    expect(securityPanelAccess('manager', true)).toBe('allowed');
    expect(securityPanelAccess('manager', false)).toBe('denied');
  });
  it('every other role (including undefined) is denied', () => {
    expect(securityPanelAccess('gm', true)).toBe('denied');
    expect(securityPanelAccess(undefined, true)).toBe('denied');
  });
});

describe('verdictState() — the honest three-state mapping, null is never rendered as clear', () => {
  it('true -> flagged, false -> clear, null -> undetermined', () => {
    expect(verdictState(true)).toBe('flagged');
    expect(verdictState(false)).toBe('clear');
    expect(verdictState(null)).toBe('undetermined');
    expect(verdictState(undefined)).toBe('undetermined');
  });
});

// Alice: flagged on CASH-001 (pass=true) and CASH-002 (pass=true), clear on CASH-004 -- 2 signals.
// Bob: flagged on CASH-001 only -- 1 signal. Carol: no verdict on CASH-001 (pass=null) -- 0 signals.
const CASH_FINDINGS = [
  { empToken: 'tok-alice', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: true, value: 12, thresholdUsed: 5, windowStart: '2026-07-01', windowEnd: '2026-07-28', computedAt: '2026-07-29T10:00:00Z', baselineContext: {}, explanation: [] },
  { empToken: 'tok-alice', wrin: null, loc: '0000001', ruleId: 'CASH-002', pass: true, value: 30, thresholdUsed: 15, windowStart: '2026-07-01', windowEnd: '2026-07-28', computedAt: '2026-07-29T10:00:00Z', baselineContext: {}, explanation: [] },
  { empToken: 'tok-alice', wrin: null, loc: '0000001', ruleId: 'CASH-004', pass: false, value: 2, thresholdUsed: 100, windowStart: '2026-07-01', windowEnd: '2026-07-28', computedAt: '2026-07-29T10:00:00Z', baselineContext: {}, explanation: [] },
  { empToken: 'tok-bob', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: true, value: 6, thresholdUsed: 5, windowStart: '2026-07-01', windowEnd: '2026-07-28', computedAt: '2026-07-29T10:00:00Z', baselineContext: {}, explanation: [] },
  { empToken: 'tok-carol', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: null, value: null, thresholdUsed: 5, windowStart: '2026-07-01', windowEnd: '2026-07-28', computedAt: '2026-07-29T10:00:00Z', baselineContext: {}, explanation: [{ label: 'no exposure in window', value: null }] },
];

describe('groupFindingsBySubject() — the central design call: subject-major, sorted by convergence', () => {
  it('produces one group per (loc, subject), never one row per finding', () => {
    const groups = groupFindingsBySubject(CASH_FINDINGS);
    expect(groups).toHaveLength(3); // Alice, Bob, Carol -- not 5 (the finding count)
  });

  it('sorts by flaggedCount descending -- Alice (2 signals) before Bob (1) before Carol (0)', () => {
    const groups = groupFindingsBySubject(CASH_FINDINGS);
    expect(groups.map(g => g.empToken)).toEqual(['tok-alice', 'tok-bob', 'tok-carol']);
    expect(groups[0].flaggedCount).toBe(2);
    expect(groups[1].flaggedCount).toBe(1);
    expect(groups[2].flaggedCount).toBe(0);
  });

  it('every subject carries ALL their verdicts, including the ones they cleared -- exoneration for free', () => {
    const alice = groupFindingsBySubject(CASH_FINDINGS).find(g => g.empToken === 'tok-alice');
    expect(alice.verdicts).toHaveLength(3);
    expect(alice.clearCount).toBe(1); // CASH-004, pass:false -- visible, not hidden
  });

  it('a wrin subject and an emp subject never collide even with the same numeric id', () => {
    const mixed = [
      { empToken: null, wrin: '00001-000', loc: '0000001', ruleId: 'INV-001', pass: true, value: 40, thresholdUsed: 20, windowStart: '2026-06-01', windowEnd: '2026-06-30', computedAt: '2026-07-01T00:00:00Z', baselineContext: {}, explanation: [] },
    ];
    const groups = groupFindingsBySubject(mixed);
    expect(groups).toHaveLength(1);
    expect(groups[0].subjectType).toBe('wrin');
    expect(groups[0].empToken).toBeNull();
  });
});

describe('scopeMatches() — All -> State -> Org -> Store hierarchy', () => {
  it('"all" matches every loc', () => {
    expect(scopeMatches('0000001', { level: 'all' })).toBe(true);
    expect(scopeMatches('0000001', null)).toBe(true);
  });
  it('"store" matches only the exact loc', () => {
    expect(scopeMatches('0000001', { level: 'store', value: '0000001' })).toBe(true);
    expect(scopeMatches('0000002', { level: 'store', value: '0000001' })).toBe(false);
  });
});

// ── Component wiring — call-site tests, not just the pure helpers ───────────────────────────────

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// The panel chains TWO async useEffects (permission check, then data load) -- a fixed tick count
// is fragile against how many microtask/macrotask hops React's own scheduling needs between them.
// Poll instead: flush repeatedly until the container's text stops changing (or a generous cap).
async function flush(container, maxTicks = 15) {
  let last = null;
  for (let i = 0; i < maxTicks; i++) {
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    if (container.textContent === last) return;
    last = container.textContent;
  }
}

describe('SecurityPanel — permission states are visually distinct, and a blocked read is never rendered as "no findings"', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadSecurityFindingsMock.mockReset().mockResolvedValue([]);
    loadSecurityRulesMock.mockReset().mockResolvedValue([]);
    loadGmIdentityRevealEnabledMock.mockReset().mockResolvedValue(false);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('admin: never calls loadGmIdentityRevealEnabled (not needed -- always allowed), and loads findings', async () => {
    loadSecurityFindingsMock.mockResolvedValue(CASH_FINDINGS);
    loadSecurityRulesMock.mockResolvedValue([{ ruleId: 'CASH-001', domain: 'cash', method: 'Cash O/S', active: true }]);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    expect(loadGmIdentityRevealEnabledMock).not.toHaveBeenCalled();
    expect(loadSecurityFindingsMock).toHaveBeenCalled();
    expect(container.textContent).not.toMatch(/not permitted/i);
  });

  it('manager with the org flag OFF: renders "not permitted", and NEVER calls loadSecurityFindings -- an empty read must never stand in for a permission check', async () => {
    loadGmIdentityRevealEnabledMock.mockResolvedValue(false);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'manager', onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/not permitted/i);
    expect(container.textContent).not.toMatch(/no findings/i);
    expect(loadSecurityFindingsMock).not.toHaveBeenCalled();
  });

  it('manager with the org flag ON: proceeds to load findings, same as admin/supervisor', async () => {
    loadGmIdentityRevealEnabledMock.mockResolvedValue(true);
    loadSecurityFindingsMock.mockResolvedValue([]);
    loadSecurityRulesMock.mockResolvedValue([]);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'manager', onClose: vi.fn() })); });
    await flush(container);
    expect(loadGmIdentityRevealEnabledMock).toHaveBeenCalled();
    expect(loadSecurityFindingsMock).toHaveBeenCalled();
    expect(container.textContent).not.toMatch(/not permitted/i);
  });

  it('an ineligible role (e.g. office_staff) is denied immediately, without an org_config round-trip', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'office_staff', onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/not permitted/i);
    expect(loadGmIdentityRevealEnabledMock).not.toHaveBeenCalled();
    expect(loadSecurityFindingsMock).not.toHaveBeenCalled();
  });

  it('permitted-but-genuinely-empty reads a DIFFERENT message than not-permitted', async () => {
    loadSecurityFindingsMock.mockResolvedValue([]);
    loadSecurityRulesMock.mockResolvedValue([]);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/no findings match/i);
    expect(container.textContent).not.toMatch(/not permitted/i);
  });
});
