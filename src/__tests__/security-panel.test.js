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
  classifySubjectTrend, buildDecisionSentence,
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

  // dispatch #45 §B: a lifecycle category takes priority over pass/fail -- it must read as neither
  // a security flag nor an exoneration, whichever way pass happened to land.
  it('a lifecycle category always wins, regardless of pass -- never a flag, never a clear', () => {
    expect(verdictState(true, 'deactivated')).toBe('hygiene');
    expect(verdictState(false, 'deactivated')).toBe('hygiene');
    expect(verdictState(null, 'obsolete')).toBe('hygiene');
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

// dispatch #45 §B -- a lifecycle-classified finding must NOT contribute to the security tally
// (flaggedCount/clearCount/worstValue/sort order), even though it's pass:true, because it's a
// data-hygiene signal, not a security verdict. W200 has a real security flag (INV-002, pass:true)
// AND a deactivated-item hygiene flag (INV-001, pass:true) -- only the security one should count.
const LIFECYCLE_FINDINGS = [
  { empToken: null, wrin: '00001-000', loc: '0000001', ruleId: 'INV-001', pass: true, value: 193, thresholdUsed: 20, lifecycleCategory: 'deactivated', windowStart: '2026-08-01', windowEnd: '2026-08-31', computedAt: '2026-08-20T10:00:00Z', baselineContext: {}, explanation: [] },
  { empToken: null, wrin: '00001-000', loc: '0000001', ruleId: 'INV-002', pass: true, value: 15, thresholdUsed: 2.5, lifecycleCategory: null, windowStart: '2026-08-01', windowEnd: '2026-08-31', computedAt: '2026-08-20T10:00:00Z', baselineContext: {}, explanation: [] },
];
describe('groupFindingsBySubject() — lifecycle routing (dispatch #45 §B): a hygiene finding never contributes to the security tally', () => {
  it('flaggedCount counts only the REAL security flag (INV-002), not the hygiene-classified one (INV-001)', () => {
    const g = groupFindingsBySubject(LIFECYCLE_FINDINGS)[0];
    expect(g.flaggedCount).toBe(1); // INV-002 only
    expect(g.hygieneCount).toBe(1); // INV-001, separately
  });

  it('both verdicts are still present in the group -- routed, not suppressed', () => {
    const g = groupFindingsBySubject(LIFECYCLE_FINDINGS)[0];
    expect(g.verdicts).toHaveLength(2);
    expect(g.verdicts.find(v => v.ruleId === 'INV-001').lifecycleCategory).toBe('deactivated');
    expect(g.verdicts.find(v => v.ruleId === 'INV-002').lifecycleCategory).toBeNull();
  });

  it('worstValue reflects only the security-flagged value (2.5-scale INV-002), not the hygiene item\'s larger raw value (193)', () => {
    const g = groupFindingsBySubject(LIFECYCLE_FINDINGS)[0];
    expect(g.worstValue).toBe(15); // INV-002's value, not INV-001's 193
  });
});

// dispatch #46 §C item 1 -- a subject can carry MULTIPLE windows for the same rule (the batch job
// runs daily with a rolling window). Alice: CASH-001 flagged on both an older window and today's.
const MULTI_WINDOW_FINDINGS = [
  { empToken: 'tok-alice', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: true, value: 6, thresholdUsed: 5, windowStart: '2026-07-01', windowEnd: '2026-07-28', computedAt: '2026-07-29T10:00:00Z', baselineContext: {}, explanation: [] },
  { empToken: 'tok-alice', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: true, value: 7, thresholdUsed: 5, windowStart: '2026-08-02', windowEnd: '2026-08-30', computedAt: '2026-08-31T10:00:00Z', baselineContext: {}, explanation: [] },
];
describe('groupFindingsBySubject() — multi-window history (dispatch #46 §C item 1)', () => {
  it('verdicts carries only the LATEST window per rule -- one chip per rule, never a duplicate for an older window', () => {
    const g = groupFindingsBySubject(MULTI_WINDOW_FINDINGS)[0];
    expect(g.verdicts).toHaveLength(1);
    expect(g.verdicts[0].value).toBeCloseTo(7, 6); // the newer window's value, not the older 6
  });
  it('historyByRule preserves EVERY window for the rule, oldest to newest, for a trend view', () => {
    const g = groupFindingsBySubject(MULTI_WINDOW_FINDINGS)[0];
    expect(g.historyByRule['CASH-001']).toHaveLength(2);
    expect(g.historyByRule['CASH-001'].map(w => w.value)).toEqual([6, 7]);
  });
});

describe('classifySubjectTrend() — chronic vs. new vs. not enough history yet (dispatch #46 §C item 1)', () => {
  it('fewer than 2 windows is "insufficient-history" -- never guesses new/chronic from one data point', () => {
    expect(classifySubjectTrend([])).toBe('insufficient-history');
    expect(classifySubjectTrend([{ pass: true }])).toBe('insufficient-history');
  });
  it('flagged now, flagged before -> chronic', () => {
    expect(classifySubjectTrend([{ pass: true }, { pass: false }, { pass: true }])).toBe('chronic');
  });
  it('flagged now, never flagged before -> new', () => {
    expect(classifySubjectTrend([{ pass: false }, { pass: false }, { pass: true }])).toBe('new');
  });
  it('clear now, flagged before -> improving', () => {
    expect(classifySubjectTrend([{ pass: true }, { pass: false }])).toBe('improving');
  });
  it('clear now, never flagged -> clear', () => {
    expect(classifySubjectTrend([{ pass: false }, { pass: false }])).toBe('clear');
  });
});

// dispatch #46 §B -- the decision sentence, matching the dispatch's own worked example: "Discounts
// here run about 2.6× the peer average -- 120 per $1,000 of sales against a typical 46."
describe('buildDecisionSentence() — the plain-language line beside (never instead of) the metric (dispatch #46 §B)', () => {
  const CASH_004 = { ruleId: 'CASH-004', method: 'Promo/discount rate', baselineType: 'peer', investigationAction: 'Pull the Meal Activity log for the flagged employee.' };

  it('a flagged verdict names the real multiple and includes the investigation action', () => {
    const verdict = { pass: true, value: 120.04, thresholdUsed: 100, baselineContext: { mean: 46.16, stdev: 85.31, n: 49 } };
    const s = buildDecisionSentence(CASH_004, verdict, 'This employee');
    expect(s).toMatch(/2\.6× the peer average/);
    expect(s).toMatch(/120\.04/);
    expect(s).toMatch(/46\.16/);
    expect(s).toMatch(/Pull the Meal Activity log/);
  });

  it('does NOT soften a large magnitude -- a 49x variance reads as a real, stated multiple, per the dispatch\'s own explicit instruction', () => {
    const verdict = { pass: true, value: 4936.47, thresholdUsed: 2.5, baselineContext: { mean: 276.49, stdev: 900, n: 6 } };
    const rule = { ruleId: 'INV-001', method: 'Item TvA variance rate', baselineType: 'store', investigationAction: 'Check the item setup.' };
    const s = buildDecisionSentence(rule, verdict, 'Item 00001-000 (store 0000001)');
    expect(s).toMatch(/18×/); // 4936.47 / 276.49 ~= 17.86 -> rounds to 18
  });

  it('a clear verdict never carries the investigation "Next:" clause', () => {
    const verdict = { pass: false, value: 20, thresholdUsed: 100, baselineContext: { mean: 46.16 } };
    const s = buildDecisionSentence(CASH_004, verdict, 'This employee');
    expect(s).not.toMatch(/Next:/);
  });

  it('an undetermined verdict states what was missing, plainly, and distinguishes itself from "clear"', () => {
    const verdict = { pass: null, reason: 'denominator below minimum exposure floor (250)' };
    const s = buildDecisionSentence(CASH_004, verdict, 'This employee');
    expect(s).toMatch(/Not enough data/);
    expect(s).toMatch(/denominator below minimum exposure floor/);
    expect(s).toMatch(/different from "clear"/);
  });

  it('a hygiene-classified verdict names the lifecycle category, not a security verdict', () => {
    const verdict = { pass: true, lifecycleCategory: 'deactivated', value: 193 };
    const rule = { ruleId: 'INV-001' };
    const s = buildDecisionSentence(rule, verdict, 'Item 00001-000 (store 0000001)');
    expect(s).toMatch(/deactivated/i);
    expect(s).toMatch(/not a security question/);
  });

  it('an inventory subject names the item and store, never a person, per the dispatch\'s explicit instruction', () => {
    const verdict = { pass: true, value: 40, thresholdUsed: 20, baselineContext: {} };
    const rule = { ruleId: 'INV-001', baselineType: 'store' };
    const s = buildDecisionSentence(rule, verdict, 'Item 00001-000 (store 0000001)');
    expect(s).toMatch(/^Item 00001-000 \(store 0000001\)/);
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

// dispatch #46 -- rendering wiring for legend/units/decision-sentence, through the REAL panel
// component (standing rule from #366: a test that only imports a helper can't tell "built" from
// "built but never wired in").
describe('SecurityPanel — dispatch #46: legend, units, and the decision sentence render through the real panel', () => {
  let container, root;
  const RULES = [
    { ruleId: 'CASH-001', domain: 'cash', method: 'Cash drawer over/short rate', description: 'How much cash is over or short at the drawer, sized against how much that employee actually handled.', baselineType: 'personal', logicType: 'ratio', active: true, investigationAction: 'Pull the flagged employee\'s drawer-count photos.' },
    { ruleId: 'CASH-002', domain: 'cash', method: 'POS over-ring rate', description: 'How often an employee corrects a POS entry, compared to peers.', baselineType: 'peer', logicType: 'ratio', active: true, investigationAction: 'Compare against same-store peers.' },
  ];
  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadSecurityRulesMock.mockReset().mockResolvedValue(RULES);
    loadGmIdentityRevealEnabledMock.mockReset().mockResolvedValue(true);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('the legend shows by default and defines Undetermined as distinct from Clear', async () => {
    loadSecurityFindingsMock.mockReset().mockResolvedValue(CASH_FINDINGS);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/What am I looking at\?/);
    expect(container.textContent).toMatch(/NOT the same as Clear/);
  });

  it('dismissing the legend hides it and is remembered (localStorage), then does not reappear on remount', async () => {
    loadSecurityFindingsMock.mockReset().mockResolvedValue(CASH_FINDINGS);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    const dismissBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Got it, hide this');
    expect(dismissBtn).toBeTruthy();
    await act(async () => { dismissBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).not.toMatch(/What am I looking at\?/);
    // Remount -- the dismissal persisted via localStorage, not just component state.
    act(() => { root.unmount(); });
    container.remove();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).not.toMatch(/What am I looking at\?/);
  });

  it('expanding a subject renders units, the decision sentence, and the investigation action -- through the real panel, not the pure helper alone', async () => {
    loadSecurityFindingsMock.mockReset().mockResolvedValue(CASH_FINDINGS);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    // Click Alice's row to expand it (the store label is a span; its grandparent div is the
    // clickable row -- SubjectRow's onClick sits on the wrapper div, not the span itself).
    const storeLabel = [...container.querySelectorAll('span')].find(s => s.textContent === 'Store 0000001');
    const aliceRow = storeLabel?.parentElement;
    expect(aliceRow).toBeTruthy();
    await act(async () => { aliceRow.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    // CASH-001: value 12, no baselineContext.mean -> "against a threshold of" branch, real unit.
    expect(container.textContent).toMatch(/per \$1,000 drawer sales/);
    expect(container.textContent).toMatch(/Next: Pull the flagged employee's drawer-count photos\./);
    // The plain-language rule explainer (security_rules.description) renders too.
    expect(container.textContent).toMatch(/How much cash is over or short/);
  });
});

// dispatch #50 Part A -- owner-reported "scroll not working in the modal," diagnosed to
// security-panel.js:431/468 (renumbered by this same dispatch's comment insertions -- both are the
// root flex column and the body flex:1/overflowY:auto div). Per the standing rule ("a test that
// only asserts a style object would pass with the panel's wiring deleted"), these render through
// the REAL SecurityPanel component, not a hand-copied style constant -- reverting the JSX edit
// (deleting minHeight:0 from either div) makes these fail. happy-dom does not compute real CSS
// layout (no scrollHeight/clientHeight), so this cannot observe an actual scrollbar pixel-for-
// pixel -- it proves the fix is wired into the real render output across both domain tabs and
// through an expanded finding, which is the level this codebase's own render-test family
// (immediately above) already treats as "rendered, not unit-tested." Final visual scroll behavior
// still wants a owner click-through in the live app, per feedback-verification-in-sandbox.md's own
// honest split (Supabase-authenticated panel content can't be opened in this sandbox at all).
describe('SecurityPanel — dispatch #50 Part A: the scroll-fix minHeight:0 is wired into the real render, not just a style constant', () => {
  let container, root;
  const RULES = [
    { ruleId: 'CASH-001', domain: 'cash', method: 'Cash drawer over/short rate', description: 'desc', baselineType: 'personal', logicType: 'ratio', active: true, investigationAction: 'Pull drawer-count photos.' },
    { ruleId: 'INV-001', domain: 'inventory', method: 'Item TvA variance rate', description: 'desc', baselineType: 'store', logicType: 'z-score', active: true, investigationAction: 'Check item setup.' },
  ];
  // Many subjects -- the shape a real overflow would need, even though happy-dom can't measure it.
  const MANY_CASH_FINDINGS = Array.from({ length: 40 }, (_, i) => ({
    empToken: `tok-${i}`, wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: true,
    value: 6 + i, thresholdUsed: 5, windowStart: '2026-08-01', windowEnd: '2026-08-28',
    computedAt: '2026-08-29T10:00:00Z', baselineContext: {}, explanation: [],
  }));
  const MANY_INV_FINDINGS = Array.from({ length: 40 }, (_, i) => ({
    empToken: null, wrin: `0000${i}-000`, loc: '0000001', ruleId: 'INV-001', pass: true,
    value: 40 + i, thresholdUsed: 20, windowStart: '2026-08-01', windowEnd: '2026-08-31',
    computedAt: '2026-08-31T10:00:00Z', baselineContext: {}, explanation: [],
  }));

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadSecurityFindingsMock.mockReset().mockResolvedValue([...MANY_CASH_FINDINGS, ...MANY_INV_FINDINGS]);
    loadSecurityRulesMock.mockReset().mockResolvedValue(RULES);
    loadGmIdentityRevealEnabledMock.mockReset().mockResolvedValue(true);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  // The root flex column (display:flex, flexDirection:column, height:100%) -- identified by
  // height:'100%' combined with flexDirection:'column', since it carries no other unique marker.
  function findRootColumn() {
    return [...container.querySelectorAll('div')].find(d => d.style.height === '100%' && d.style.flexDirection === 'column');
  }
  // The scrollable body (flex:1, overflowY:'auto') -- identified by overflowY:'auto', the one
  // property nothing else in this panel's render tree sets.
  function findScrollBody() {
    return [...container.querySelectorAll('div')].find(d => d.style.overflowY === 'auto');
  }

  it('on the Cash tab (default, 40 findings), both the root column and the scroll body carry minHeight:0', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    const rootCol = findRootColumn();
    const scrollBody = findScrollBody();
    expect(rootCol).toBeTruthy();
    expect(scrollBody).toBeTruthy();
    expect(rootCol.style.minHeight).toBe('0');
    expect(scrollBody.style.minHeight).toBe('0');
    // Sanity: the fixture really did produce 40 rows in the scrollable body, not a short list --
    // the whole point of the fix is a list long enough to need scrolling. Subjects are token-keyed
    // (never a plaintext name pre-reveal), so count "Store 0000001" labels rather than a token
    // string.
    expect([...scrollBody.querySelectorAll('span')].filter(s => s.textContent === 'Store 0000001').length).toBe(40);
  });

  it('switching to the Inventory tab keeps both fixes in place -- the wiring is not tab-specific', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    const invTabBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Inventory'));
    expect(invTabBtn).toBeTruthy();
    await act(async () => { invTabBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const rootCol = findRootColumn();
    const scrollBody = findScrollBody();
    expect(rootCol.style.minHeight).toBe('0');
    expect(scrollBody.style.minHeight).toBe('0');
    // Sanity: really switched domains (Cash rule chip gone, Inventory rule chip present), not just
    // clicked a no-op button.
    expect(scrollBody.textContent).not.toMatch(/CASH-001/);
    expect(container.textContent).toMatch(/INV-001/);
  });

  it('expanding a finding (accordion changes content height) does not remove either minHeight:0 -- the fix survives the exact interaction the dispatch calls out', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    const someRow = [...container.querySelectorAll('span')].find(s => s.textContent === 'Store 0000001');
    const clickable = someRow?.parentElement;
    expect(clickable).toBeTruthy();
    await act(async () => { clickable.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const rootCol = findRootColumn();
    const scrollBody = findScrollBody();
    expect(rootCol.style.minHeight).toBe('0');
    expect(scrollBody.style.minHeight).toBe('0');
  });
});

// dispatch #50 Part B -- frictionless reveal for the privileged tier ("Developer/Admin/Owner"
// collapses to the single real DB role 'admin'). Renders through the REAL panel (standing rule
// from #366) so a reverted wiring change (the new effect deleted, or the RPC name/args changed)
// makes these fail -- not just a unit test on the RPC's own SQL shape (covered separately by the
// live adversarial probe recorded in the dispatch-50 memory writeup, since happy-dom cannot invoke
// a real Postgres role-gated function).
describe('SecurityPanel — dispatch #50 Part B: admin sees names without clicking, other roles unchanged', () => {
  let container, root;
  const RULES = [{ ruleId: 'CASH-001', domain: 'cash', method: 'Cash O/S', description: 'desc', baselineType: 'personal', logicType: 'ratio', active: true, investigationAction: 'act' }];

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadSecurityFindingsMock.mockReset().mockResolvedValue(CASH_FINDINGS);
    loadSecurityRulesMock.mockReset().mockResolvedValue(RULES);
    loadGmIdentityRevealEnabledMock.mockReset().mockResolvedValue(true);
    rpcMock.mockReset().mockResolvedValue({
      data: [
        { token: 'tok-alice', employee_name: 'Alice Andrews' },
        { token: 'tok-bob', employee_name: 'Bob Baker' },
        { token: 'tok-carol', employee_name: 'Carol Chen' },
      ],
      error: null,
    });
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('admin: calls reveal_employee_identities_bulk once on mount with every distinct empToken and a synthetic reason, and names render without any click', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    const [name, args] = rpcMock.mock.calls[0];
    expect(name).toBe('reveal_employee_identities_bulk');
    expect(new Set(args.p_tokens)).toEqual(new Set(['tok-alice', 'tok-bob', 'tok-carol']));
    expect(typeof args.p_reason).toBe('string');
    expect(args.p_reason.length).toBeGreaterThan(0);
    // The names render directly -- no "🔒 reveal" click target left for a token the bulk call
    // already resolved.
    await flush(container);
    expect(container.textContent).toMatch(/Alice Andrews/);
    expect(container.textContent).not.toMatch(/🔒 reveal/);
  });

  it('supervisor: never calls the bulk RPC -- keeps the existing click-through path unchanged, dispatch #50\'s own explicit scope', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'supervisor', onClose: vi.fn() })); });
    await flush(container);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/🔒 reveal/);
    expect(container.textContent).not.toMatch(/Alice Andrews/);
  });

  it('manager (GM), even with the org reveal flag on: never calls the bulk RPC -- only the admin tier gets the frictionless path', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'manager', onClose: vi.fn() })); });
    await flush(container);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/🔒 reveal/);
  });

  it('a failed bulk call leaves the click-through path intact for admin -- no crash, names stay behind "🔒 reveal"', async () => {
    rpcMock.mockReset().mockResolvedValue({ data: null, error: { message: 'network error' } });
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toMatch(/🔒 reveal/);
    expect(container.textContent).not.toMatch(/Alice Andrews/);
  });
});
