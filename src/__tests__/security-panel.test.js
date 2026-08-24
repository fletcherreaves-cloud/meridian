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
// dispatch #52 -- the drill-down's own on-demand loaders, mocked the same way as the rest of
// this file's Supabase surface (no live session in this sandbox).
const loadQsrVarianceStatMock = vi.fn();
const loadQsrVarianceHistoryAllMock = vi.fn();
const loadAuditRowsWindowMock = vi.fn();
// dispatch #58 -- defaults to an empty match so every EXISTING cash-drilldown test (which never
// asserts on events) keeps passing unchanged; dedicated tests below override this per-case.
const loadQsrSecurityEventsForSubjectMock = vi.fn().mockResolvedValue([]);

vi.mock('../lib/supabase.js', () => ({
  supabase: { rpc: (...args) => rpcMock(...args) },
  loadSecurityFindings: (...args) => loadSecurityFindingsMock(...args),
  loadSecurityRules: (...args) => loadSecurityRulesMock(...args),
  loadGmIdentityRevealEnabled: (...args) => loadGmIdentityRevealEnabledMock(...args),
  loadQsrVarianceStat: (...args) => loadQsrVarianceStatMock(...args),
  loadQsrVarianceHistoryAll: (...args) => loadQsrVarianceHistoryAllMock(...args),
  loadAuditRowsWindow: (...args) => loadAuditRowsWindowMock(...args),
  loadQsrSecurityEventsForSubject: (...args) => loadQsrSecurityEventsForSubjectMock(...args),
}));

import {
  securityPanelAccess, verdictState, groupFindingsBySubject, scopeMatches, SecurityPanel,
  classifySubjectTrend, buildDecisionSentence, windowEndInRange, ruleShortTag,
} from '../views/security-panel.js';
// dispatch #100 -- resolveDatePreset lets the render tests below compute a REAL, wall-clock-
// anchored {s,e} the same way the panel's own DateRangeControl preset buttons do, instead of
// hardcoding dates that would drift stale against "today."
import { resolveDatePreset } from '../components/PanelControls.js';

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

  // dispatch #100 -- 'org' and 'store' were already implemented in scopeMatches (the gap was the
  // pill UI never offering them), so these two assertions were already true before this dispatch.
  // Kept here anyway so scopeMatches' own full 4-level contract is asserted in one place.
  it('"org" matches every store in the same org (real INV_ORG_COORDS mapping: FL -> emerald, OK -> mcdok)', () => {
    expect(scopeMatches('6178', { level: 'org', value: 'emerald' })).toBe(true); // Chipley, FL
    expect(scopeMatches('3708', { level: 'org', value: 'emerald' })).toBe(false); // Ardmore, OK
    expect(scopeMatches('3708', { level: 'org', value: 'mcdok' })).toBe(true);
  });
});

describe('windowEndInRange() — the date-range control\'s filtering basis (dispatch #100)', () => {
  it('no range (null, or both sides blank) matches everything -- the pre-#100 unfiltered default', () => {
    expect(windowEndInRange('2026-08-28', null)).toBe(true);
    expect(windowEndInRange('2026-08-28', { s: null, e: null })).toBe(true);
    expect(windowEndInRange(null, null)).toBe(true);
  });
  it('a finding with no windowEnd at all is excluded once ANY bound is set -- an honest non-placement, not a silent keep', () => {
    expect(windowEndInRange(null, { s: '2026-08-01', e: null })).toBe(false);
    expect(windowEndInRange(undefined, { s: null, e: '2026-08-31' })).toBe(false);
  });
  it('respects a start-only bound', () => {
    expect(windowEndInRange('2026-08-01', { s: '2026-08-02', e: null })).toBe(false);
    expect(windowEndInRange('2026-08-02', { s: '2026-08-02', e: null })).toBe(true); // inclusive
  });
  it('respects an end-only bound', () => {
    expect(windowEndInRange('2026-09-01', { s: null, e: '2026-08-31' })).toBe(false);
    expect(windowEndInRange('2026-08-31', { s: null, e: '2026-08-31' })).toBe(true); // inclusive
  });
  it('respects a full [s,e] range', () => {
    expect(windowEndInRange('2026-08-15', { s: '2026-08-01', e: '2026-08-31' })).toBe(true);
    expect(windowEndInRange('2026-07-31', { s: '2026-08-01', e: '2026-08-31' })).toBe(false);
    expect(windowEndInRange('2026-09-01', { s: '2026-08-01', e: '2026-08-31' })).toBe(false);
  });
});

describe('ruleShortTag() — the rule-pill short descriptor, derived from method (dispatch #100 follow-up)', () => {
  it('compresses the real seeded methods (supabase/schema-security-rules*.sql) to short, readable tags', () => {
    expect(ruleShortTag({ method: 'Cash drawer over/short rate' })).toBe('Cash drawer over/short');
    expect(ruleShortTag({ method: 'POS over-ring rate' })).toBe('POS over-ring');
    expect(ruleShortTag({ method: 'Manual refund / self-authorized refund rate' })).toBe('Manual refund');
    expect(ruleShortTag({ method: 'Promo/discount rate' })).toBe('Promo/discount');
    expect(ruleShortTag({ method: 'Item TvA variance rate vs. expected usage' })).toBe('Item TvA variance');
    expect(ruleShortTag({ method: 'Dollar-variance rate vs. store sales' })).toBe('Dollar-variance');
  });
  it('never fabricates a tag for a rule with no method -- an honest null, not an invented label', () => {
    expect(ruleShortTag({})).toBeNull();
    expect(ruleShortTag(null)).toBeNull();
  });
  it('a method with no trailing "rate" clause is returned as-is rather than mangled', () => {
    expect(ruleShortTag({ method: 'Count-cycle gap' })).toBe('Count-cycle gap');
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

// dispatch #56 Part A -- owner: "let's add directory of what each policy covers." Render-based,
// and specifically the anti-hardcode check the dispatch itself calls out as the important one: a
// directory built from a literal list would pass every other assertion here and fail only the one
// that adds a rule to the fixture that exists in no real source file and asserts it still renders.
describe('SecurityPanel — dispatch #56 Part A: the rule directory renders entirely from the live rules array', () => {
  let container, root;
  // 9 rules, both domains, one inactive (CASH-003, matching real production data), one carrying
  // corroboration/exoneration (the Part D "free win" this directory also surfaces), and one that
  // exists in NO real schema file anywhere in this repo -- the anti-hardcode fixture.
  const RULES = [
    { ruleId: 'CASH-001', domain: 'cash', method: 'Cash drawer over/short rate', description: 'How much cash is over or short at the drawer.', baselineType: 'personal', logicType: 'ratio', windowDays: 28, severity: 3, active: true, investigationAction: 'Pull the flagged employee\'s drawer-count photos.', falsePositives: ['register malfunction'] },
    { ruleId: 'CASH-002', domain: 'cash', method: 'POS over-ring rate', description: 'How often an employee corrects a POS entry.', baselineType: 'peer', logicType: 'ratio', windowDays: 28, severity: 3, active: true, investigationAction: 'Compare against same-store peers.' },
    { ruleId: 'CASH-003', domain: 'cash', method: 'Manual refund rate', description: 'Manual refund dollars, normalized.', baselineType: 'personal', logicType: 'ratio', windowDays: 28, severity: 3, active: false, investigationAction: 'Pull manual-refund transaction detail.', falsePositives: ['documented price-match override', 'manager-approved service recovery'], corroborationRules: ['CASH-001'] },
    { ruleId: 'CASH-004', domain: 'cash', method: 'Promo/discount rate', description: 'Promo dollars, normalized.', baselineType: 'peer', logicType: 'ratio', windowDays: 28, severity: 2, active: true, investigationAction: 'Review discount authorization logs.' },
    { ruleId: 'INV-001', domain: 'inventory', method: 'Item TvA variance rate', description: 'Theoretical-vs-actual usage variance.', baselineType: 'store', logicType: 'z-score', windowDays: 30, severity: 4, active: true, investigationAction: 'Check the item setup.', exonerationRules: ['INV-005'] },
    { ruleId: 'INV-002', domain: 'inventory', method: 'Waste dollar rate', description: 'Waste dollars per $1,000 sales.', baselineType: 'store', logicType: 'ratio', windowDays: 30, severity: 3, active: true, investigationAction: 'Review waste logs.' },
    { ruleId: 'INV-003', domain: 'inventory', method: 'Yield deviation', description: 'Yield vs. expected band.', baselineType: 'network', logicType: 'z-score', windowDays: 30, severity: 2, active: true, investigationAction: 'Check prep procedure.' },
    { ruleId: 'INV-004', domain: 'inventory', method: 'Transfer anomaly', description: 'Unusual inter-store transfer volume.', baselineType: 'network', logicType: 'ratio', windowDays: 30, severity: 3, active: true, investigationAction: 'Review transfer logs.' },
    { ruleId: 'INV-005', domain: 'inventory', method: 'Count-cycle gap', description: 'Missed or late count cycles.', baselineType: 'store', logicType: 'threshold', windowDays: 30, severity: 2, active: true, investigationAction: 'Check count-cycle completion.' },
    // Exists in this test fixture only -- no schema file, no other test, nothing in src/ names it.
    // A hardcoded directory component cannot show this row; only one reading the live array can.
    { ruleId: 'ZZZ-999', domain: 'cash', method: 'Synthetic Anti-Hardcode Rule', description: 'This rule exists only in this test fixture -- nowhere in the real schema.', baselineType: 'peer', logicType: 'ratio', windowDays: 28, severity: 1, active: true, investigationAction: 'This is a fixture-only action string.' },
  ];
  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadSecurityFindingsMock.mockReset().mockResolvedValue(CASH_FINDINGS);
    loadSecurityRulesMock.mockReset().mockResolvedValue(RULES);
    loadGmIdentityRevealEnabledMock.mockReset().mockResolvedValue(true);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  async function openDirectory() {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    const toggle = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Rule directory'));
    expect(toggle).toBeTruthy();
    return toggle;
  }

  it('is collapsed by default -- rule descriptions are not in the DOM until opened', async () => {
    const toggle = await openDirectory();
    expect(toggle.textContent).toMatch(/^▸/);
    expect(container.textContent).not.toMatch(/Theoretical-vs-actual usage variance/);
  });

  it('opening it renders every one of the 10 fixture rules -- counted, not spot-checked -- including a rule hardcoded nowhere in the real codebase', async () => {
    const toggle = await openDirectory();
    await act(async () => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    // Count by ruleId text, since method names could theoretically collide; ruleId cannot.
    for (const r of RULES) {
      expect(container.textContent, `missing ${r.ruleId}`).toMatch(new RegExp(r.ruleId));
    }
    // The anti-hardcode check itself: a rule with NO real-schema counterpart still renders.
    expect(container.textContent).toMatch(/Synthetic Anti-Hardcode Rule/);
    expect(container.textContent).toMatch(/This rule exists only in this test fixture/);
  });

  it('an inactive rule is LISTED, not hidden, and marked with the legend\'s own ⏸ convention', async () => {
    const toggle = await openDirectory();
    await act(async () => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toMatch(/Manual refund rate ⏸/);
    expect(container.textContent).toMatch(/inactive — historical output, not current truth/);
  });

  it('investigationAction and false_positives render -- the half that makes this a directory, not a list', async () => {
    const toggle = await openDirectory();
    await act(async () => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toMatch(/When it fires: Pull the flagged employee's drawer-count photos\./);
    expect(container.textContent).toMatch(/Known false positives: register malfunction/);
    expect(container.textContent).toMatch(/documented price-match override; manager-approved service recovery/);
  });

  it('corroboration_rules / exoneration_rules (dropped by the loader until this dispatch) surface too', async () => {
    const toggle = await openDirectory();
    await act(async () => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toMatch(/Corroborates with: CASH-001/);
    expect(container.textContent).toMatch(/Weakened by: INV-005/);
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

// dispatch #52 -- the drill-down, scoped from the store 0013113 investigation
// (memory/dispatch-52.md). Render-based per its own closing rule ("a test asserting a query's
// shape passes with the panel unwired") -- these click through the REAL SecurityPanel, not the
// engine module alone (already covered by src/__tests__/security-drilldown.test.js).
describe('SecurityPanel — dispatch #52: the drill-down renders through the real panel, both domains', () => {
  let container, root;
  const INV_RULES = [
    { ruleId: 'INV-001', domain: 'inventory', method: 'Item TvA variance rate', description: 'desc', baselineType: 'store', logicType: 'z-score', active: true, investigationAction: 'Check item setup.' },
  ];
  const INV_FINDINGS = [
    { empToken: null, wrin: 'CUP', loc: '0000001', ruleId: 'INV-001', pass: true, value: 45, thresholdUsed: 20, windowStart: '2026-08-01', windowEnd: '2026-08-31', computedAt: '2026-09-01T10:00:00Z', baselineContext: {}, explanation: [] },
    { empToken: null, wrin: 'LID', loc: '0000001', ruleId: 'INV-001', pass: true, value: 38, thresholdUsed: 20, windowStart: '2026-08-01', windowEnd: '2026-08-31', computedAt: '2026-09-01T10:00:00Z', baselineContext: {}, explanation: [] },
    { empToken: null, wrin: 'BUN', loc: '0000002', ruleId: 'INV-001', pass: true, value: 25, thresholdUsed: 20, windowStart: '2026-08-01', windowEnd: '2026-08-31', computedAt: '2026-09-01T10:00:00Z', baselineContext: {}, explanation: [] },
  ];
  const INV_POP_ROWS = [
    { loc: '0000001', period: '2026-08', wrin: 'CUP', cls: 'paper', expUsage: 100, actUsage: 50, variance: 45, rawWaste: 100, compWaste: 50 },
    { loc: '0000001', period: '2026-08', wrin: 'LID', cls: 'paper', expUsage: 100, actUsage: 60, variance: 38, rawWaste: 80, compWaste: 20 },
    { loc: '0000001', period: '2026-08', wrin: 'PATTY', cls: 'food', expUsage: 100, actUsage: 98, variance: 2, rawWaste: 30, compWaste: 10 },
    { loc: '0000002', period: '2026-08', wrin: 'BUN', cls: 'food', expUsage: 100, actUsage: 78, variance: 25, rawWaste: 40, compWaste: 20 },
    { loc: '0000002', period: '2026-08', wrin: 'CUP', cls: 'paper', expUsage: 100, actUsage: 96, variance: 4, rawWaste: 90, compWaste: 10 },
  ];

  const CASH_RULES = [
    { ruleId: 'CASH-001', domain: 'cash', method: 'Cash drawer over/short rate', description: 'desc', baselineType: 'personal', logicType: 'ratio', active: true, investigationAction: 'Pull drawer-count photos.' },
  ];
  const CASH_DRILLDOWN_FINDINGS = [
    { empToken: 'tok-alice', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: true, value: 110, thresholdUsed: 5, windowStart: '2026-08-01', windowEnd: '2026-08-28', computedAt: '2026-08-29T10:00:00Z', baselineContext: {}, explanation: [] },
    { empToken: 'tok-dave', wrin: null, loc: '0000002', ruleId: 'CASH-001', pass: false, value: 1, thresholdUsed: 5, windowStart: '2026-08-01', windowEnd: '2026-08-28', computedAt: '2026-08-29T10:00:00Z', baselineContext: {}, explanation: [] },
  ];
  const CASH_AUDIT_ROWS = [
    { loc: '0000001', empToken: 'tok-alice', date: '2026-08-05', manualRefAmt: 50, drawerSales: 500, posOverCnt: 0, drawerGC: 100, promoAmt: 0 },
    { loc: '0000001', empToken: 'tok-alice', date: '2026-08-12', manualRefAmt: 60, drawerSales: 500, posOverCnt: 0, drawerGC: 100, promoAmt: 0 },
    { loc: '0000001', empToken: 'tok-bob', date: '2026-08-05', manualRefAmt: 5, drawerSales: 500, posOverCnt: 0, drawerGC: 100, promoAmt: 0 },
    { loc: '0000002', empToken: 'tok-dave', date: '2026-08-05', manualRefAmt: 5, drawerSales: 500, posOverCnt: 0, drawerGC: 100, promoAmt: 0 },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadGmIdentityRevealEnabledMock.mockReset().mockResolvedValue(true);
    loadQsrVarianceStatMock.mockReset().mockResolvedValue(INV_POP_ROWS);
    loadQsrVarianceHistoryAllMock.mockReset().mockResolvedValue(INV_POP_ROWS.map(r => ({ loc: r.loc, period: r.period, wrin: r.wrin, cls: r.cls, variance: r.variance })));
    loadAuditRowsWindowMock.mockReset().mockResolvedValue(CASH_AUDIT_ROWS);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('inventory: clicking "Investigate further" fetches the drill-down on demand (not before), separate from dispatch #56 Part C\'s own lighter per-tab item-name preload, and renders all five measurements with a baseline beside each number', async () => {
    loadSecurityFindingsMock.mockReset().mockResolvedValue(INV_FINDINGS);
    loadSecurityRulesMock.mockReset().mockResolvedValue(INV_RULES);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    const invTab = [...container.querySelectorAll('button')].find(b => b.textContent === '📦 Inventory');
    await act(async () => { invTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    // dispatch #56 Part C: selecting the Inventory tab already fired its own item-name preload
    // once for this period -- real callers get a product name on the row heading with no click;
    // this fixture's popRows carry no `descr`, so the heading still falls back to the bare WRIN.
    expect(loadQsrVarianceStatMock).toHaveBeenCalledTimes(1);
    expect(loadQsrVarianceStatMock).toHaveBeenCalledWith({ period: '2026-08' });
    const itemLabel = [...container.querySelectorAll('div')].find(d => d.textContent === 'Item CUP');
    const subjectRow = itemLabel?.parentElement;
    expect(subjectRow).toBeTruthy();
    await act(async () => { subjectRow.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    const investigateBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '🔎 Investigate further');
    expect(investigateBtn).toBeTruthy();
    // The DRILL-DOWN's own population/history fetch is still gated behind the explicit click --
    // expanding the row alone must not add a second call beyond Part C's preload.
    expect(loadQsrVarianceStatMock).toHaveBeenCalledTimes(1);
    await act(async () => { investigateBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(loadQsrVarianceStatMock).toHaveBeenCalledTimes(2);
    expect(loadQsrVarianceStatMock).toHaveBeenLastCalledWith({ period: '2026-08' });
    expect(container.textContent).toMatch(/Drill-down — measurements, not conclusions/);
    // Metric 1: flag rate by store -- 2 of 3 subjects flagged at this store, above the other store.
    expect(container.textContent).toMatch(/66\.7%/);
    // Metric 3: composition -- subject is 100% paper (CUP+LID), estate (BUN) is 100% food.
    expect(container.textContent).toMatch(/paper: 100\.0% of this subject's flags vs 0\.0% estate-wide/);
  });

  // dispatch #56 Part C -- the product name itself, when qsr_variance_stat actually has a descr
  // for the (loc, wrin, period). Separate test from the drill-down one above so a descr-bearing
  // fixture doesn't complicate that test's "Item CUP" lookup.
  it('a wrin subject with a descr in qsr_variance_stat shows the product name as the heading, WRIN as the secondary identifier -- no click required', async () => {
    loadSecurityFindingsMock.mockReset().mockResolvedValue(INV_FINDINGS);
    loadSecurityRulesMock.mockReset().mockResolvedValue(INV_RULES);
    loadQsrVarianceStatMock.mockReset().mockResolvedValue([
      { loc: '0000001', period: '2026-08', wrin: 'CUP', cls: 'paper', descr: '32oz Cold Cup' },
      { loc: '0000001', period: '2026-08', wrin: 'LID', cls: 'paper', descr: 'Cold Cup Lid' },
      { loc: '0000002', period: '2026-08', wrin: 'BUN', cls: 'food', descr: 'Regular Bun' },
    ]);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    const invTab = [...container.querySelectorAll('button')].find(b => b.textContent === '📦 Inventory');
    await act(async () => { invTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(container.textContent).toMatch(/32oz Cold Cup/);
    expect(container.textContent).toMatch(/Cold Cup Lid/);
    // WRIN still visible as the secondary identifier -- it still matters for lookups -- and the
    // old bare-WRIN heading is gone now that a real name is available.
    const heading = [...container.querySelectorAll('div')].find(d => d.textContent.includes('32oz Cold Cup') && d.textContent.includes('CUP'));
    expect(heading).toBeTruthy();
    expect(container.textContent).not.toMatch(/Item CUP/);
  });

  it('cash: renders the flag rate and rule-mix through the real panel for an employee subject', async () => {
    loadSecurityFindingsMock.mockReset().mockResolvedValue(CASH_DRILLDOWN_FINDINGS);
    loadSecurityRulesMock.mockReset().mockResolvedValue(CASH_RULES);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    const storeLabel = [...container.querySelectorAll('span')].find(s => s.textContent === 'Store 0000001');
    const subjectRow = storeLabel?.parentElement;
    await act(async () => { subjectRow.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    const investigateBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '🔎 Investigate further');
    expect(investigateBtn).toBeTruthy();
    await act(async () => { investigateBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(loadAuditRowsWindowMock).toHaveBeenCalledTimes(1);
    // Metric 1: this store has 1 of 2 distinct employees flagged.
    expect(container.textContent).toMatch(/1 of 2/);
    expect(container.textContent).toMatch(/Drill-down — measurements, not conclusions/);
  });

  // dispatch #58 (#56 Part E) -- the event-level "matching events" section, rendered through the
  // real panel (not just qsr_security_events' own loader in isolation), and its required caveat.
  it('cash: renders matching events (time, register, daypart, tender, amount) and the cash-over/short "no drill-down" caveat', async () => {
    loadSecurityFindingsMock.mockReset().mockResolvedValue(CASH_DRILLDOWN_FINDINGS);
    loadSecurityRulesMock.mockReset().mockResolvedValue(CASH_RULES);
    loadQsrSecurityEventsForSubjectMock.mockReset().mockResolvedValue([
      { id: 'evt-1', loc: '0000001', eventToken: 'all_promo', eventDt: '2026-08-14', eventTm: '23:44:07', regNum: 'POS0013', orderKey: 'POS0012:1', eventName: 'Mobile Promo', eventDisplay: 'Mobile Promo', eventAmt: 3.89, remainingAmt: 5.21, tenderType: 'Cash', daypartName: 'Dinner', crewToken: 'tok-alice', crewBadge: '91', mgrToken: null, mgrBadge: null, mgrCode: 'Unknown' },
    ]);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    const storeLabel = [...container.querySelectorAll('span')].find(s => s.textContent === 'Store 0000001');
    const subjectRow = storeLabel?.parentElement;
    await act(async () => { subjectRow.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    const investigateBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '🔎 Investigate further');
    await act(async () => { investigateBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(loadQsrSecurityEventsForSubjectMock).toHaveBeenCalledTimes(1);
    expect(loadQsrSecurityEventsForSubjectMock).toHaveBeenCalledWith(expect.objectContaining({ empToken: 'tok-alice', loc: '0000001' }));
    expect(container.textContent).toMatch(/Matching events \(1\)/);
    expect(container.textContent).toMatch(/2026-08-14 23:44:07/);
    expect(container.textContent).toMatch(/reg POS0013/);
    expect(container.textContent).toMatch(/Dinner/);
    expect(container.textContent).toMatch(/Cash/);
    // The required caveat: cash over/short has no drill-down at all, on every render of this
    // section, not just when the subject's events happen to be empty.
    expect(container.textContent).toMatch(/Cash over\/short has no event-level detail/);
  });

  it('cash: an employee subject with no matching events renders an honest empty state, not a blank section', async () => {
    loadSecurityFindingsMock.mockReset().mockResolvedValue(CASH_DRILLDOWN_FINDINGS);
    loadSecurityRulesMock.mockReset().mockResolvedValue(CASH_RULES);
    loadQsrSecurityEventsForSubjectMock.mockReset().mockResolvedValue([]);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    const storeLabel = [...container.querySelectorAll('span')].find(s => s.textContent === 'Store 0000001');
    const subjectRow = storeLabel?.parentElement;
    await act(async () => { subjectRow.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    const investigateBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '🔎 Investigate further');
    await act(async () => { investigateBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(container.textContent).toMatch(/Matching events \(0\)/);
    expect(container.textContent).toMatch(/No matching events in this window/);
  });
});

// dispatch #56 Part D -- "a first-time flag and a fifth consecutive flag are completely different
// situations and the panel currently presents them identically." Render-based, through the real
// SecurityPanel, not just the engine unit tests -- proves the subject-history rollup, the
// instance/pattern/trend shape line, and the corroboration cross-link are actually wired into
// SubjectDetail, not just correct in isolation.
describe('SecurityPanel — dispatch #56 Part D: subject history, shape, and corroboration render through the real panel', () => {
  let container, root;
  const RULES = [
    { ruleId: 'CASH-001', domain: 'cash', method: 'Cash drawer over/short rate', description: 'desc', baselineType: 'personal', logicType: 'ratio', active: true, investigationAction: 'act', corroborationRules: ['CASH-004'] },
    { ruleId: 'CASH-004', domain: 'cash', method: 'Promo/discount rate', description: 'desc2', baselineType: 'peer', logicType: 'ratio', active: true, investigationAction: 'act2' },
  ];
  // Alice: CASH-001 flagged in three CONSECUTIVE windows with a rising value (6 -> 9 -> 12) --
  // a real trend -- plus CASH-004 flagged in the latest window, which corroborates CASH-001 per
  // the RULES fixture above. Four windows total, all flagged.
  const FINDINGS = [
    { empToken: 'tok-alice', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: true, value: 6, thresholdUsed: 5, windowStart: '2026-06-01', windowEnd: '2026-06-28', computedAt: '2026-06-29T10:00:00Z', baselineContext: {}, explanation: [] },
    { empToken: 'tok-alice', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: true, value: 9, thresholdUsed: 5, windowStart: '2026-07-01', windowEnd: '2026-07-28', computedAt: '2026-07-29T10:00:00Z', baselineContext: {}, explanation: [] },
    { empToken: 'tok-alice', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: true, value: 12, thresholdUsed: 5, windowStart: '2026-08-01', windowEnd: '2026-08-28', computedAt: '2026-08-29T10:00:00Z', baselineContext: {}, explanation: [] },
    { empToken: 'tok-alice', wrin: null, loc: '0000001', ruleId: 'CASH-004', pass: true, value: 100, thresholdUsed: 50, windowStart: '2026-08-01', windowEnd: '2026-08-28', computedAt: '2026-08-29T10:05:00Z', baselineContext: {}, explanation: [] },
  ];
  // Bob: a single CASH-001 window -- the "first-time flag" side of the dispatch's own contrast.
  const BOB_FINDINGS = [
    { empToken: 'tok-bob', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: true, value: 6, thresholdUsed: 5, windowStart: '2026-08-01', windowEnd: '2026-08-28', computedAt: '2026-08-29T10:00:00Z', baselineContext: {}, explanation: [] },
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

  async function expandAliceRow() {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    const storeLabel = [...container.querySelectorAll('span')].find(s => s.textContent === 'Store 0000001');
    const row = storeLabel?.parentElement;
    expect(row).toBeTruthy();
    await act(async () => { row.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
  }

  it('the subject history rollup shows the total window count and flags, and the per-window timeline once there is more than one window', async () => {
    loadSecurityFindingsMock.mockReset().mockResolvedValue(FINDINGS);
    await expandAliceRow();
    expect(container.textContent).toMatch(/Subject history: flagged 4 of 4 evaluations since 2026-06-01/);
    expect(container.textContent).toMatch(/CASH-001 2026-06-28: flagged/);
    expect(container.textContent).toMatch(/CASH-004 2026-08-28: flagged/);
  });

  it('a single-window subject gets a history line but no redundant per-window list (identical to the one verdict already shown)', async () => {
    loadSecurityFindingsMock.mockReset().mockResolvedValue(BOB_FINDINGS);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    const storeLabel = [...container.querySelectorAll('span')].find(s => s.textContent === 'Store 0000001');
    await act(async () => { storeLabel.parentElement.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(container.textContent).toMatch(/Subject history: flagged 1 of 1 evaluation since 2026-08-01/);
    // "evaluation" singular, not "evaluations" -- and Bob is the dispatch's own "first-time flag"
    // contrast case, so his shape is Instance, not Trend.
    expect(container.textContent).not.toMatch(/Subject history: flagged 1 of 1 evaluations/);
    expect(container.textContent).toMatch(/Instance — flagged once/);
  });

  it('three consecutive rising windows classify as Trend, rendered beside (not instead of) the existing chronic/new line', async () => {
    loadSecurityFindingsMock.mockReset().mockResolvedValue(FINDINGS);
    await expandAliceRow();
    expect(container.textContent).toMatch(/Trend — 3 consecutive flagged windows, rising/);
    // The pre-existing dispatch #46 chronic/new line still renders too -- additive, not replaced.
    expect(container.textContent).toMatch(/Chronic — flagged before, still flagged/);
  });

  it('a corroborating rule that also fired for the same subject renders the cross-link on the finding', async () => {
    loadSecurityFindingsMock.mockReset().mockResolvedValue(FINDINGS);
    await expandAliceRow();
    expect(container.textContent).toMatch(/Corroborated by CASH-004 — also flagged for this subject/);
  });

  it('no corroboration cross-link when the corroborating rule is NOT flagged for this subject', async () => {
    const noCorrobFindings = FINDINGS.filter(f => f.ruleId !== 'CASH-004');
    loadSecurityFindingsMock.mockReset().mockResolvedValue(noCorrobFindings);
    await expandAliceRow();
    expect(container.textContent).not.toMatch(/Corroborated by/);
  });

  it('no corroboration cross-link when the corroborating rule flagged in a DIFFERENT, non-overlapping window -- two unrelated flags months apart are not corroboration', async () => {
    // Same findings as the "corroborated" case above, except CASH-004's flag is back in June --
    // long before CASH-001's August window it would otherwise appear to corroborate.
    const staleCorrobFindings = FINDINGS.map(f => f.ruleId === 'CASH-004'
      ? { ...f, windowStart: '2026-06-01', windowEnd: '2026-06-28', computedAt: '2026-06-29T10:05:00Z' }
      : f);
    loadSecurityFindingsMock.mockReset().mockResolvedValue(staleCorrobFindings);
    await expandAliceRow();
    expect(container.textContent).not.toMatch(/Corroborated by/);
  });
});

// dispatch #100 -- Org and Store pills render through the real SecurityPanel and actually change
// what's visible, not just "the pill renders" (standing rule: a test exercising only scopeMatches
// in isolation can't tell a real fix from one whose pill row was never wired up -- exactly the gap
// this dispatch closes). Real loc numbers from constants.js' own INV_ORG_COORDS, not synthetic
// '0000001'-style fixture locs, so the org split is checked against the actual live mapping.
describe('SecurityPanel — dispatch #100: Org and Store pills reach scopeMatches through the real UI', () => {
  let container, root;
  const RULES = [{ ruleId: 'CASH-001', domain: 'cash', method: 'Cash drawer over/short rate', description: 'desc', baselineType: 'personal', logicType: 'ratio', active: true, investigationAction: 'act' }];
  // 3708 = Ardmore-Broadway, OK -> MCDOK. 5183 = Chickasha, OK -> MCDOK. 6178 = Chipley, FL -> Emerald Arches.
  const FINDINGS = [
    { empToken: 'tok-ardmore', wrin: null, loc: '3708', ruleId: 'CASH-001', pass: true, value: 10, thresholdUsed: 5, windowStart: '2026-08-01', windowEnd: '2026-08-28', computedAt: '2026-08-29T10:00:00Z', baselineContext: {}, explanation: [] },
    { empToken: 'tok-chickasha', wrin: null, loc: '5183', ruleId: 'CASH-001', pass: true, value: 8, thresholdUsed: 5, windowStart: '2026-08-01', windowEnd: '2026-08-28', computedAt: '2026-08-29T10:00:00Z', baselineContext: {}, explanation: [] },
    { empToken: 'tok-chipley', wrin: null, loc: '6178', ruleId: 'CASH-001', pass: true, value: 12, thresholdUsed: 5, windowStart: '2026-08-01', windowEnd: '2026-08-28', computedAt: '2026-08-29T10:00:00Z', baselineContext: {}, explanation: [] },
  ];
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadSecurityFindingsMock.mockReset().mockResolvedValue(FINDINGS);
    loadSecurityRulesMock.mockReset().mockResolvedValue(RULES);
    loadGmIdentityRevealEnabledMock.mockReset().mockResolvedValue(true);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('before selecting any pill, all three real stores render unfiltered (baseline for the assertions below)', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/Store 3708/);
    expect(container.textContent).toMatch(/Store 5183/);
    expect(container.textContent).toMatch(/Store 6178/);
  });

  it('the MCDOK Org pill filters to exactly the OK stores (3708, 5183), excluding the FL store (6178)', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    const mcdokBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'MCDOK');
    expect(mcdokBtn).toBeTruthy();
    await act(async () => { mcdokBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toMatch(/Store 3708/);
    expect(container.textContent).toMatch(/Store 5183/);
    expect(container.textContent).not.toMatch(/Store 6178/);
  });

  it('the Emerald Arches Org pill filters to exactly the FL store (6178), excluding both OK stores', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    const emeraldBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Emerald Arches');
    expect(emeraldBtn).toBeTruthy();
    await act(async () => { emeraldBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toMatch(/Store 6178/);
    expect(container.textContent).not.toMatch(/Store 3708/);
    expect(container.textContent).not.toMatch(/Store 5183/);
  });

  it('a Store pill filters to EXACTLY that store, excluding a sibling in the same org', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    // Store pills carry the store name too (matching the shared LocationSelector's own label
    // convention, PanelControls.js's storeLabel) -- click on the real label, not the bare loc.
    const storeBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '3708 — Ardmore-Broadway');
    expect(storeBtn).toBeTruthy();
    await act(async () => { storeBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toMatch(/Store 3708/);
    expect(container.textContent).not.toMatch(/Store 5183/); // same org (MCDOK), still excluded
    expect(container.textContent).not.toMatch(/Store 6178/);
  });

  it('"All" and per-State pills still behave exactly as before -- additive, not a rewrite', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    const okBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'OK');
    expect(okBtn).toBeTruthy();
    await act(async () => { okBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toMatch(/Store 3708/);
    expect(container.textContent).toMatch(/Store 5183/);
    expect(container.textContent).not.toMatch(/Store 6178/);
    const allBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'All');
    await act(async () => { allBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toMatch(/Store 3708/);
    expect(container.textContent).toMatch(/Store 5183/);
    expect(container.textContent).toMatch(/Store 6178/);
  });
});

// dispatch #100 -- the date-range control renders through the real panel and actually changes
// which findings are visible, filtered on windowEnd (see windowEndInRange's own header comment
// for why that basis). Uses resolveDatePreset() to compute a REAL, wall-clock-anchored {s,e} the
// same way the panel's own preset buttons do, rather than a hardcoded date that would go stale.
describe('SecurityPanel — dispatch #100: date-range control filters on windowEnd through the real UI', () => {
  let container, root;
  const RULES = [{ ruleId: 'CASH-001', domain: 'cash', method: 'Cash drawer over/short rate', description: 'desc', baselineType: 'personal', logicType: 'ratio', active: true, investigationAction: 'act' }];
  // recentEnd: today's real last-closed-business-day (per resolveDatePreset/lastClosedBusinessDay)
  // -- guaranteed inside every preset window, including 7D. distantEnd: 400 real days before that
  // -- guaranteed outside every preset window (the widest is 180D).
  const recentEnd = resolveDatePreset('7d').e;
  const distant = new Date(recentEnd + 'T00:00:00');
  distant.setDate(distant.getDate() - 400);
  const distantEnd = distant.toISOString().slice(0, 10);
  const FINDINGS = [
    { empToken: 'tok-recent', wrin: null, loc: '3708', ruleId: 'CASH-001', pass: true, value: 10, thresholdUsed: 5, windowStart: recentEnd, windowEnd: recentEnd, computedAt: recentEnd + 'T10:00:00Z', baselineContext: {}, explanation: [] },
    { empToken: 'tok-distant', wrin: null, loc: '5183', ruleId: 'CASH-001', pass: true, value: 8, thresholdUsed: 5, windowStart: distantEnd, windowEnd: distantEnd, computedAt: distantEnd + 'T10:00:00Z', baselineContext: {}, explanation: [] },
  ];
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadSecurityFindingsMock.mockReset().mockResolvedValue(FINDINGS);
    loadSecurityRulesMock.mockReset().mockResolvedValue(RULES);
    loadGmIdentityRevealEnabledMock.mockReset().mockResolvedValue(true);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('defaults to "All dates" -- both the recent and the distant subject render unfiltered', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/Store 3708/);
    expect(container.textContent).toMatch(/Store 5183/);
    const allDatesBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'All dates');
    expect(allDatesBtn).toBeTruthy();
  });

  it('the 90D preset excludes the distant (400-day-old) subject and keeps the recent one', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    const preset90 = [...container.querySelectorAll('button')].find(b => b.textContent === '90D');
    expect(preset90).toBeTruthy();
    await act(async () => { preset90.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toMatch(/Store 3708/);
    expect(container.textContent).not.toMatch(/Store 5183/);
  });

  it('clicking "All dates" after a preset resets back to unbounded -- both subjects return', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    const preset90 = [...container.querySelectorAll('button')].find(b => b.textContent === '90D');
    await act(async () => { preset90.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).not.toMatch(/Store 5183/);
    const allDatesBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'All dates');
    await act(async () => { allDatesBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toMatch(/Store 3708/);
    expect(container.textContent).toMatch(/Store 5183/);
  });

  it('the control names its own filtering basis explicitly (windowEnd, not an ambiguous "date range")', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    expect(container.textContent).toMatch(/Findings with a window ending:/);
  });
});

// dispatch #100 follow-up -- the rule-filter pill row shows a short descriptor on EVERY rule pill
// (not just the currently-selected one's long description underneath), for both Cash and
// Inventory domains, through the real panel.
describe('SecurityPanel — dispatch #100 follow-up: rule pills carry a short descriptor for every rule, both domains', () => {
  let container, root;
  const RULES = [
    { ruleId: 'CASH-001', domain: 'cash', method: 'Cash drawer over/short rate', description: 'd1', baselineType: 'personal', logicType: 'ratio', active: true, investigationAction: 'a1' },
    { ruleId: 'CASH-002', domain: 'cash', method: 'POS over-ring rate', description: 'd2', baselineType: 'peer', logicType: 'ratio', active: true, investigationAction: 'a2' },
    { ruleId: 'CASH-003', domain: 'cash', method: 'Manual refund / self-authorized refund rate', description: 'd3', baselineType: 'personal', logicType: 'ratio', active: false, investigationAction: 'a3' },
    { ruleId: 'CASH-004', domain: 'cash', method: 'Promo/discount rate', description: 'd4', baselineType: 'peer', logicType: 'ratio', active: true, investigationAction: 'a4' },
    { ruleId: 'INV-001', domain: 'inventory', method: 'Item TvA variance rate vs. expected usage', description: 'd5', baselineType: 'store', logicType: 'z-score', active: true, investigationAction: 'a5' },
    { ruleId: 'INV-002', domain: 'inventory', method: 'Dollar-variance rate vs. store sales', description: 'd6', baselineType: 'store', logicType: 'ratio', active: true, investigationAction: 'a6' },
  ];
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadSecurityFindingsMock.mockReset().mockResolvedValue(CASH_FINDINGS);
    loadSecurityRulesMock.mockReset().mockResolvedValue(RULES);
    loadGmIdentityRevealEnabledMock.mockReset().mockResolvedValue(true);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('every Cash rule pill shows both its ruleId and a short descriptor, and inactive CASH-003 still carries its ⏸ marker', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    const pillText = id => [...container.querySelectorAll('button')].find(b => b.textContent.startsWith(id))?.textContent;
    expect(pillText('CASH-001')).toBe('CASH-001 · Cash drawer over/short');
    expect(pillText('CASH-002')).toBe('CASH-002 · POS over-ring');
    expect(pillText('CASH-003')).toBe('CASH-003 · Manual refund ⏸'); // inactive marker preserved
    expect(pillText('CASH-004')).toBe('CASH-004 · Promo/discount');
  });

  it('every Inventory rule pill shows both its ruleId and a short descriptor', async () => {
    loadSecurityFindingsMock.mockReset().mockResolvedValue([]);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    const invTab = [...container.querySelectorAll('button')].find(b => b.textContent === '📦 Inventory');
    await act(async () => { invTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const pillText = id => [...container.querySelectorAll('button')].find(b => b.textContent.startsWith(id))?.textContent;
    expect(pillText('INV-001')).toBe('INV-001 · Item TvA variance');
    expect(pillText('INV-002')).toBe('INV-002 · Dollar-variance');
  });

  it('the fuller description line below still renders for the selected rule -- the tag is additive, not a replacement', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    const ruleBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'CASH-001 · Cash drawer over/short');
    await act(async () => { ruleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toMatch(/d1/); // the full description fixture text
  });
});
