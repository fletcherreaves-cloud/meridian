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
// v5.411 -- the lazy per-subject full-history fetch (fires on row-expand). Defaults to an empty
// match so every EXISTING expand-a-row test (none of which assert on multi-window trend) keeps
// passing unchanged with the group's own bulk-loaded historyByRule; dedicated tests below override
// this per-case to verify the fetched history actually supersedes it.
const loadSecurityFindingsForSubjectMock = vi.fn().mockResolvedValue([]);
// Owner request 2026-10-17 (app_access_log) -- SecurityPanel now calls this on every
// permState==='allowed' transition. Mocked here (not spread from actual, matching this file's
// existing full-replacement style) so every pre-existing render test below keeps passing
// instead of hitting "logAppAccess is not a function" the moment access resolves to allowed.
const logAppAccessMock = vi.fn().mockResolvedValue({ error: null });
// dispatch 2026-11-09 -- case tracking. Fires only on row-expand (same lazy shape as
// loadSecurityFindingsForSubjectMock above); defaults to empty/success so every EXISTING
// expand-a-row test below keeps passing unchanged. Dedicated tests override these per-case.
const loadSecurityFindingActionsForFindingsMock = vi.fn().mockResolvedValue([]);
const saveSecurityFindingActionMock = vi.fn().mockResolvedValue({ id: 'action-1', findingId: null, action: 'noted', note: null, createdByRole: null, createdAt: '2026-11-09T00:00:00Z' });
// dispatch 2026-11-10 follow-on -- drift/trajectory history, fetched once the Briefing view opens
// (security-panel.js's own driftHistory effect). Defaults to empty so every EXISTING render test
// (none of which switch to the Briefing view and assert on drift) keeps passing unchanged;
// dedicated drift tests below override this per-case.
const loadSecurityFindingsRecentHistoryForKeysMock = vi.fn().mockResolvedValue([]);

vi.mock('../lib/supabase.js', () => ({
  supabase: { rpc: (...args) => rpcMock(...args) },
  loadSecurityFindings: (...args) => loadSecurityFindingsMock(...args),
  loadSecurityRules: (...args) => loadSecurityRulesMock(...args),
  loadGmIdentityRevealEnabled: (...args) => loadGmIdentityRevealEnabledMock(...args),
  loadQsrVarianceStat: (...args) => loadQsrVarianceStatMock(...args),
  loadQsrVarianceHistoryAll: (...args) => loadQsrVarianceHistoryAllMock(...args),
  loadAuditRowsWindow: (...args) => loadAuditRowsWindowMock(...args),
  loadQsrSecurityEventsForSubject: (...args) => loadQsrSecurityEventsForSubjectMock(...args),
  loadSecurityFindingsForSubject: (...args) => loadSecurityFindingsForSubjectMock(...args),
  logAppAccess: (...args) => logAppAccessMock(...args),
  loadSecurityFindingActionsForFindings: (...args) => loadSecurityFindingActionsForFindingsMock(...args),
  saveSecurityFindingAction: (...args) => saveSecurityFindingActionMock(...args),
  loadSecurityFindingsRecentHistoryForKeys: (...args) => loadSecurityFindingsRecentHistoryForKeysMock(...args),
}));

import {
  securityPanelAccess, verdictState, groupFindingsBySubject, buildHistoryByRule, scopeMatches, SecurityPanel,
  classifySubjectTrend, buildDecisionSentence, windowEndInRange, ruleShortTag,
  scopeToSelectorValue, selectorValueToScope, latestWindowEnd, sortFindingsForDisplay, minSignalsLabel,
  buildCommandGroups, buildDomainBreakdown, buildTopContributingRules, latestCaseStatus, tallyCaseQueue,
  cameraReviewHint,
} from '../views/security-panel.js';
// dispatch #100 -- resolveDatePreset lets the render tests below compute a REAL, wall-clock-
// anchored {s,e} the same way the panel's own DateRangeControl preset buttons do, instead of
// hardcoding dates that would drift stale against "today."
import { resolveDatePreset } from '../components/PanelControls.js';
import { INV_ORG_COORDS } from '../constants.js';

// ── Pure logic ────────────────────────────────────────────────────────────────────────────────

describe('securityPanelAccess() — matches security_findings\' RLS tier exactly, never looser', () => {
  it('admin, owner, and area_supervisor are always allowed, without needing the org_config flag', () => {
    expect(securityPanelAccess('admin', false)).toBe('allowed');
    expect(securityPanelAccess('owner', false)).toBe('allowed');
    expect(securityPanelAccess('area_supervisor', false)).toBe('allowed');
  });
  it('manager and gm are both allowed ONLY when gmRevealEnabled is true (owner decision, 2026-10-28)', () => {
    expect(securityPanelAccess('manager', true)).toBe('allowed');
    expect(securityPanelAccess('manager', false)).toBe('denied');
    expect(securityPanelAccess('gm', true)).toBe('allowed');
    expect(securityPanelAccess('gm', false)).toBe('denied');
  });
  it('every other role (including undefined, and the stale pre-dispatch-#148 "supervisor" string) is denied', () => {
    expect(securityPanelAccess('sm_am_dm', true)).toBe('denied');
    expect(securityPanelAccess('om', true)).toBe('denied');
    expect(securityPanelAccess(undefined, true)).toBe('denied');
    expect(securityPanelAccess('supervisor', true)).toBe('denied'); // real id is 'area_supervisor'
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

// v5.411 -- buildHistoryByRule() was factored OUT of groupFindingsBySubject so the lazy
// per-subject fetch (loadSecurityFindingsForSubject, called on row-expand once the bulk load may
// be reading security_findings_latest) builds the exact same shape. Tested directly here so the
// two call sites can never quietly drift apart -- groupFindingsBySubject's own multi-window test
// above already proves it produces this shape when fed the FULL findings array; these prove the
// extracted function does the same when fed just one subject's own rows, the shape the lazy path
// actually uses.
describe('buildHistoryByRule() — the shared per-subject window-history builder', () => {
  it('sorts one rule\'s windows oldest-to-newest by windowEnd, tie-broken by computedAt', () => {
    const rows = [
      { ruleId: 'CASH-001', pass: true, value: 12, windowEnd: '2026-08-28', computedAt: '2026-08-29T10:00:00Z' },
      { ruleId: 'CASH-001', pass: true, value: 6, windowEnd: '2026-06-28', computedAt: '2026-06-29T10:00:00Z' },
      { ruleId: 'CASH-001', pass: true, value: 9, windowEnd: '2026-07-28', computedAt: '2026-07-29T10:00:00Z' },
    ];
    const out = buildHistoryByRule(rows);
    expect(out['CASH-001'].map(w => w.value)).toEqual([6, 9, 12]);
  });
  it('keeps each rule\'s windows in a separate bucket', () => {
    const rows = [
      { ruleId: 'CASH-001', pass: true, value: 6, windowEnd: '2026-06-28', computedAt: '2026-06-29T10:00:00Z' },
      { ruleId: 'CASH-004', pass: false, value: 2, windowEnd: '2026-06-28', computedAt: '2026-06-29T10:05:00Z' },
    ];
    const out = buildHistoryByRule(rows);
    expect(Object.keys(out).sort()).toEqual(['CASH-001', 'CASH-004']);
    expect(out['CASH-001']).toHaveLength(1);
    expect(out['CASH-004']).toHaveLength(1);
  });
  it('an empty input produces an empty history, not a crash', () => {
    expect(buildHistoryByRule([])).toEqual({});
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

// dispatch 2026-11-10 -- Command Center's own cross-domain pure functions. Table/Briefing's
// `groups` memo is scoped to one `domain` at a time (see security-panel.js's own header on it);
// these are the cross-domain layer, built on the same groupFindingsBySubject/scopeMatches
// primitives, never a second grouping algorithm.
describe('cameraReviewHint() — the owner-requested camera-footage reminder (2026-11-10)', () => {
  it('names the store and the real window range', () => {
    expect(cameraReviewHint('0000001', '2026-10-01', '2026-10-28')).toBe(
      '📹 Before deciding: pull camera footage for Store 0000001, 2026-10-01 – 2026-10-28, to verify what actually happened.');
  });
  it('falls back gracefully when only one side of the window is known, never crashes on neither', () => {
    expect(cameraReviewHint('0000001', null, '2026-10-28')).toContain('2026-10-28');
    expect(cameraReviewHint('0000001', null, null)).toContain('this window');
    expect(cameraReviewHint(null, null, null)).toContain('Store —');
  });
});

describe('buildCommandGroups() — cross-domain, emp-subjects only (person-attributable rules, never a wrin/item finding)', () => {
  const FINDINGS = [
    { id: 'f1', empToken: 'tok-a', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: true, windowEnd: '2026-10-01', computedAt: '2026-10-02T00:00:00Z' },
    { id: 'f2', empToken: 'tok-a', wrin: null, loc: '0000001', ruleId: 'LABOR-001', pass: true, windowEnd: '2026-10-01', computedAt: '2026-10-02T00:00:00Z' },
    { id: 'f3', empToken: null, wrin: 'WRIN-1', loc: '0000001', ruleId: 'INV-001', pass: true, windowEnd: '2026-10-01', computedAt: '2026-10-02T00:00:00Z' },
    { id: 'f4', empToken: 'tok-b', wrin: null, loc: '0000002', ruleId: 'CASH-001', pass: true, windowEnd: '2026-10-01', computedAt: '2026-10-02T00:00:00Z' },
  ];
  it('excludes item/wrin findings entirely -- an inventory variance finding has no employee to attribute to a row', () => {
    const out = buildCommandGroups(FINDINGS, { level: 'all' });
    expect(out.every(g => g.subjectType === 'emp')).toBe(true);
    expect(out.some(g => g.wrin === 'WRIN-1')).toBe(false);
  });
  it('a subject flagged under two different domains converges into ONE group with flaggedCount 2, ranked first', () => {
    const out = buildCommandGroups(FINDINGS, { level: 'all' });
    expect(out[0].empToken).toBe('tok-a');
    expect(out[0].flaggedCount).toBe(2);
  });
  it('respects scope the same way every other view in this panel does', () => {
    const out = buildCommandGroups(FINDINGS, { level: 'store', value: '0000002' });
    expect(out.map(g => g.empToken)).toEqual(['tok-b']);
  });
});

describe('buildDomainBreakdown() — per-domain rollup for the Command Center cards', () => {
  const RULES = [
    { ruleId: 'CASH-001', domain: 'cash', method: 'Cash drawer over/short rate', severity: 3, active: true },
    { ruleId: 'CASH-002', domain: 'cash', method: 'POS over-ring rate', severity: 2, active: false },
    { ruleId: 'LABOR-001', domain: 'labor', method: 'Post-termination punch edit', severity: 5, active: true },
  ];
  const rulesById = Object.fromEntries(RULES.map(r => [r.ruleId, r]));
  const FINDINGS = [
    { empToken: 'tok-a', loc: '0000001', ruleId: 'CASH-001', pass: true },
    { empToken: 'tok-b', loc: '0000001', ruleId: 'CASH-001', pass: true },
    { empToken: 'tok-c', loc: '0000001', ruleId: 'LABOR-001', pass: true },
    { empToken: 'tok-d', loc: '0000001', ruleId: 'CASH-001', pass: false }, // not flagged -- excluded
    { empToken: 'tok-e', loc: '0000001', ruleId: 'CASH-001', pass: true, lifecycleCategory: 'hygiene' }, // hygiene-routed -- excluded
  ];
  it('counts every domain, even one with zero open findings right now (rule count still real)', () => {
    const out = buildDomainBreakdown(FINDINGS, rulesById, RULES, { level: 'all' });
    const domains = Object.fromEntries(out.map(d => [d.domain, d]));
    expect(domains.cash.findings).toBe(2);
    expect(domains.cash.ruleCount).toBe(2);
    expect(domains.labor.findings).toBe(1);
    expect(domains.inventory.findings).toBe(0);
    expect(domains.inventory.ruleCount).toBe(0);
  });
  it('severity buckets low/med/high correctly, and names the top-firing rule', () => {
    const out = buildDomainBreakdown(FINDINGS, rulesById, RULES, { level: 'all' });
    const cash = out.find(d => d.domain === 'cash');
    expect(cash.med).toBe(2); // CASH-001 is severity 3
    expect(cash.high).toBe(0);
    expect(cash.topRule.ruleId).toBe('CASH-001');
    expect(cash.topRuleCount).toBe(2);
    const labor = out.find(d => d.domain === 'labor');
    expect(labor.high).toBe(1); // LABOR-001 is severity 5
  });
});

describe('buildTopContributingRules() — Pareto ranking, same filter as buildDomainBreakdown', () => {
  const RULES = [
    { ruleId: 'CASH-001', domain: 'cash', severity: 3 },
    { ruleId: 'LABOR-001', domain: 'labor', severity: 5 },
  ];
  const rulesById = Object.fromEntries(RULES.map(r => [r.ruleId, r]));
  it('ranks worst-first by flagged count and respects the limit', () => {
    const findings = [
      { loc: '1', ruleId: 'CASH-001', pass: true }, { loc: '1', ruleId: 'CASH-001', pass: true },
      { loc: '1', ruleId: 'LABOR-001', pass: true },
    ];
    const out = buildTopContributingRules(findings, rulesById, { level: 'all' }, 1);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ ruleId: 'CASH-001', count: 2 });
  });
});

describe('latestCaseStatus() / tallyCaseQueue() — matches security_finding_actions\' real check constraint, never a fabricated "Investigating" status', () => {
  it('no logged action at all -> "open", not a crash', () => {
    expect(latestCaseStatus('f1', {})).toBe('open');
    expect(latestCaseStatus('f1', undefined)).toBe('open');
  });
  it('the LAST row (ascending by created_at, same order loadSecurityFindingActionsForFindings returns) is the current status', () => {
    const actions = { f1: [{ action: 'noted' }, { action: 'escalated' }] };
    expect(latestCaseStatus('f1', actions)).toBe('escalated');
  });
  it('tallies every currently-flagged, non-hygiene finding across every group into its real bucket', () => {
    const groups = [
      { verdicts: [{ id: 'f1', pass: true }, { id: 'f2', pass: true }] },
      { verdicts: [{ id: 'f3', pass: true, lifecycleCategory: 'hygiene' }, { id: 'f4', pass: false }] }, // both excluded
    ];
    const actions = { f1: [{ action: 'escalated' }] };
    expect(tallyCaseQueue(groups, actions)).toEqual({ open: 1, noted: 0, escalated: 1, investigated_cleared: 0 });
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

describe('scopeMatches() — All -> State -> Patch -> Store hierarchy (dispatch #120 -- Org replaced by Patch)', () => {
  it('"all" matches every loc', () => {
    expect(scopeMatches('0000001', { level: 'all' })).toBe(true);
    expect(scopeMatches('0000001', null)).toBe(true);
  });
  it('"store" matches only the exact loc', () => {
    expect(scopeMatches('0000001', { level: 'store', value: '0000001' })).toBe(true);
    expect(scopeMatches('0000002', { level: 'store', value: '0000001' })).toBe(false);
  });

  it('"state" matches every store in the same state (real INV_ORG_COORDS mapping)', () => {
    expect(scopeMatches('6178', { level: 'state', value: 'FL' })).toBe(true); // Chipley, FL
    expect(scopeMatches('3708', { level: 'state', value: 'FL' })).toBe(false); // Ardmore, OK
    expect(scopeMatches('3708', { level: 'state', value: 'OK' })).toBe(true);
  });

  // dispatch #120 -- 'org' (state==='FL'?'emerald':'mcdok') is REMOVED: it was 1:1 redundant with
  // 'state' for this business (CLAUDE.md's canonical mapping), never a second independent
  // dimension. 'patch' (live whoRan()/supervisorOf(), falling back to org.sup) replaces it with a
  // genuinely finer grain -- two same-state/same-org stores can have DIFFERENT supervisors, which
  // 'state'/'org' could never isolate. 13113 and 5183 are both OK/mcdok but have different sup
  // values. (3708 -- this block's example before the 2026-10-05 supervisor reassignment -- moved
  // to Zukarr Eaves; 13113 is Robert Spencer's patch now.)
  it('"patch" matches only stores under the same supervisor -- finer than the old org tier, not a renamed copy of it', () => {
    expect(scopeMatches('13113', { level: 'patch', value: 'Robert Spencer' })).toBe(true);
    expect(scopeMatches('5183', { level: 'patch', value: 'Robert Spencer' })).toBe(false); // same org/state as 13113, different sup
    expect(scopeMatches('5183', { level: 'patch', value: 'Krystiana Langford' })).toBe(true);
  });

  it('an unrecognized scope level falls through to true (matches everything) -- same permissive-default behavior "org" itself used to rely on before removal', () => {
    expect(scopeMatches('3708', { level: 'org', value: 'mcdok' })).toBe(true);
  });
});

// dispatch #120 -- confirms the redundancy claim itself, not just the new code: the OLD org
// mapping (state==='FL' ? 'emerald' : 'mcdok', scopeMatches' own pre-#120 formula) and the
// SURVIVING 'state' level produce the IDENTICAL store set for every real store in INV_ORG_COORDS.
// This is the regression check the dispatch asked for -- selecting "FL" via the old mechanism
// scopes to the same stores the new State tier alone reaches -- computed independently of
// scopeMatches (which no longer implements the old formula) so it can't trivially pass by testing
// itself.
describe('dispatch #120 -- Org-tier removal is a true no-op: old org mapping === new state-only scoping, for every real store', () => {
  it('every store\'s old-org-formula result matches scopeMatches(state) for both orgs, across the whole real INV_ORG_COORDS estate', () => {
    const locs = Object.keys(INV_ORG_COORDS);
    expect(locs.length).toBeGreaterThan(20); // sanity: this is the real ~27-store estate, not an empty fixture
    for (const loc of locs) {
      const oldOrg = INV_ORG_COORDS[loc].state === 'FL' ? 'emerald' : 'mcdok';
      const newStateMatchesFL = scopeMatches(loc, { level: 'state', value: 'FL' });
      const newStateMatchesOK = scopeMatches(loc, { level: 'state', value: 'OK' });
      expect(newStateMatchesFL).toBe(oldOrg === 'emerald');
      expect(newStateMatchesOK).toBe(oldOrg === 'mcdok');
    }
  });
});

describe('scopeToSelectorValue() / selectorValueToScope() — the {level,value} <-> {level,id} boundary translation (dispatch #120, panel-contract.md §3)', () => {
  it('"all" round-trips both ways', () => {
    expect(scopeToSelectorValue({ level: 'all' })).toEqual({ level: 'all', id: null });
    expect(scopeToSelectorValue(null)).toEqual({ level: 'all', id: null });
    expect(selectorValueToScope({ level: 'all', id: null })).toEqual({ level: 'all' });
    expect(selectorValueToScope(null)).toEqual({ level: 'all' });
  });
  it('state/patch/store round-trip value <-> id', () => {
    expect(scopeToSelectorValue({ level: 'state', value: 'OK' })).toEqual({ level: 'state', id: 'OK' });
    expect(selectorValueToScope({ level: 'state', id: 'OK' })).toEqual({ level: 'state', value: 'OK' });
    expect(scopeToSelectorValue({ level: 'patch', value: 'Robert Spencer' })).toEqual({ level: 'patch', id: 'Robert Spencer' });
    expect(selectorValueToScope({ level: 'patch', id: 'Robert Spencer' })).toEqual({ level: 'patch', value: 'Robert Spencer' });
    expect(scopeToSelectorValue({ level: 'store', value: '3708' })).toEqual({ level: 'store', id: '3708' });
    expect(selectorValueToScope({ level: 'store', id: '3708' })).toEqual({ level: 'store', value: '3708' });
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
    logAppAccessMock.mockClear();
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('admin: never calls loadGmIdentityRevealEnabled (not needed -- always allowed), and loads findings', async () => {
    loadSecurityFindingsMock.mockResolvedValue(CASH_FINDINGS);
    loadSecurityRulesMock.mockResolvedValue([{ ruleId: 'CASH-001', domain: 'cash', method: 'Cash O/S', active: true }]);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    expect(loadGmIdentityRevealEnabledMock).not.toHaveBeenCalled();
    expect(loadSecurityFindingsMock).toHaveBeenCalled();
    expect(container.textContent).not.toMatch(/not permitted/i);
    // Owner request 2026-10-17 (app_access_log) -- an allowed view logs itself.
    expect(logAppAccessMock).toHaveBeenCalledWith('panel_view', 'security');
  });

  it('manager with the org flag OFF: renders "not permitted", and NEVER calls loadSecurityFindings -- an empty read must never stand in for a permission check', async () => {
    loadGmIdentityRevealEnabledMock.mockResolvedValue(false);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'manager', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    expect(container.textContent).toMatch(/not permitted/i);
    expect(container.textContent).not.toMatch(/no findings/i);
    expect(loadSecurityFindingsMock).not.toHaveBeenCalled();
    // A DENIED view must never log itself as an access event.
    expect(logAppAccessMock).not.toHaveBeenCalled();
  });

  it('manager with the org flag ON: proceeds to load findings, same as admin/supervisor', async () => {
    loadGmIdentityRevealEnabledMock.mockResolvedValue(true);
    loadSecurityFindingsMock.mockResolvedValue([]);
    loadSecurityRulesMock.mockResolvedValue([]);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'manager', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    expect(loadGmIdentityRevealEnabledMock).toHaveBeenCalled();
    expect(loadSecurityFindingsMock).toHaveBeenCalled();
    expect(container.textContent).not.toMatch(/not permitted/i);
  });

  it('an ineligible role (e.g. office_staff) is denied immediately, without an org_config round-trip', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'office_staff', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    expect(container.textContent).toMatch(/not permitted/i);
    expect(loadGmIdentityRevealEnabledMock).not.toHaveBeenCalled();
    expect(loadSecurityFindingsMock).not.toHaveBeenCalled();
  });

  it('permitted-but-genuinely-empty reads a DIFFERENT message than not-permitted', async () => {
    loadSecurityFindingsMock.mockResolvedValue([]);
    loadSecurityRulesMock.mockResolvedValue([]);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    expect(container.textContent).toMatch(/no findings match/i);
    expect(container.textContent).not.toMatch(/not permitted/i);
  });
});

// v5.413 (Loss Forensics Roadmap Rec #1, owner-reviewed 2026-09-09) -- buildSecurityPrintHtml's
// own heroCard treatment ("N Subjects Flagged," "2+ Signal Convergence," etc.) already answered
// "how bad is it right now" at a glance, but only ever rendered in the PDF export. Ported to the
// live screen as SecuritySummaryBar, through the real panel per the standing "verification must
// touch the call site" rule -- these prove the numbers AND the decision line are actually wired
// in, not just correct as an isolated helper (there is no isolated helper here to unit-test;
// SecuritySummaryBar is intentionally not exported, same as SubjectRow/SubjectDetail/Legend).
describe('SecurityPanel — live decision-first summary bar (ports buildSecurityPrintHtml\'s heroCard treatment to the screen)', () => {
  let container, root;
  const RULES = [
    { ruleId: 'CASH-001', domain: 'cash', method: 'Cash drawer over/short rate', description: 'd', baselineType: 'personal', logicType: 'ratio', active: true },
    { ruleId: 'CASH-002', domain: 'cash', method: 'POS over-ring rate', description: 'd', baselineType: 'peer', logicType: 'ratio', active: true },
    { ruleId: 'CASH-004', domain: 'cash', method: 'Promo/discount rate', description: 'd', baselineType: 'peer', logicType: 'ratio', active: true },
  ];
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadSecurityRulesMock.mockReset().mockResolvedValue(RULES);
    loadGmIdentityRevealEnabledMock.mockReset().mockResolvedValue(true);
    loadSecurityFindingsForSubjectMock.mockReset().mockResolvedValue([]);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('shows the four hero numbers and names the converging subject as the strongest lead', async () => {
    // Alice: CASH-001 + CASH-002 both pass:true -- 2 signals, converging. Bob: CASH-001 only --
    // 1 signal. Carol: pass:null on CASH-001 -- 0 signals, filtered out by the default minSignals:1.
    loadSecurityFindingsMock.mockReset().mockResolvedValue(CASH_FINDINGS);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    expect(container.textContent).toMatch(/Subjects Flagged/);
    expect(container.textContent).toMatch(/Total Signals/);
    expect(container.textContent).toMatch(/2\+ Signal Convergence/);
    expect(container.textContent).toMatch(/Latest Batch/);
    expect(container.textContent).toMatch(/is converging on 2 independent signals — the strongest lead in this scope right now/);
  });

  it('names nothing converging when every flagged subject has exactly one signal', async () => {
    const singleSignalFindings = [
      { empToken: 'tok-dave', wrin: null, loc: '0000002', ruleId: 'CASH-001', pass: true, value: 8, thresholdUsed: 5, windowStart: '2026-08-01', windowEnd: '2026-08-28', computedAt: '2026-08-29T10:00:00Z', baselineContext: {}, explanation: [] },
      { empToken: 'tok-erin', wrin: null, loc: '0000002', ruleId: 'CASH-002', pass: true, value: 20, thresholdUsed: 15, windowStart: '2026-08-01', windowEnd: '2026-08-28', computedAt: '2026-08-29T10:00:00Z', baselineContext: {}, explanation: [] },
    ];
    loadSecurityFindingsMock.mockReset().mockResolvedValue(singleSignalFindings);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    expect(container.textContent).toMatch(/2 subjects flagged, one signal each — worth a look, nothing converging yet/);
    expect(container.textContent).not.toMatch(/strongest lead/);
  });

  it('renders no summary bar when nothing is flagged -- the existing "no findings" message covers it alone', async () => {
    loadSecurityFindingsMock.mockReset().mockResolvedValue([]);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    expect(container.textContent).toMatch(/no findings match/i);
    expect(container.textContent).not.toMatch(/Subjects Flagged/);
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
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    expect(container.textContent).toMatch(/What am I looking at\?/);
    expect(container.textContent).toMatch(/NOT the same as Clear/);
  });

  it('dismissing the legend hides it and is remembered (localStorage), then does not reappear on remount', async () => {
    loadSecurityFindingsMock.mockReset().mockResolvedValue(CASH_FINDINGS);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const dismissBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Got it, hide this');
    expect(dismissBtn).toBeTruthy();
    await act(async () => { dismissBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).not.toMatch(/What am I looking at\?/);
    // Remount -- the dismissal persisted via localStorage, not just component state.
    act(() => { root.unmount(); });
    container.remove();
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    expect(container.textContent).not.toMatch(/What am I looking at\?/);
  });

  it('expanding a subject renders units, the decision sentence, and the investigation action -- through the real panel, not the pure helper alone', async () => {
    loadSecurityFindingsMock.mockReset().mockResolvedValue(CASH_FINDINGS);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
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
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
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
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
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
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
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
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
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
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
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

  it('owner: same frictionless bulk-reveal as admin -- both are the "Developer/Admin/Owner" privileged tier dispatch #50 describes', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'owner', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    await flush(container);
    expect(container.textContent).toMatch(/Alice Andrews/);
    expect(container.textContent).not.toMatch(/🔒 reveal/);
  });

  it('area_supervisor: never calls the bulk RPC -- keeps the existing click-through path unchanged, dispatch #50\'s own explicit scope', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'area_supervisor', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/🔒 reveal/);
    expect(container.textContent).not.toMatch(/Alice Andrews/);
  });

  it('manager (GM), even with the org reveal flag on: never calls the bulk RPC -- only the admin tier gets the frictionless path', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'manager', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    expect(rpcMock).not.toHaveBeenCalled();
    expect(container.textContent).toMatch(/🔒 reveal/);
  });

  it('a failed bulk call leaves the click-through path intact for admin -- no crash, names stay behind "🔒 reveal"', async () => {
    rpcMock.mockReset().mockResolvedValue({ data: null, error: { message: 'network error' } });
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(container.textContent).toMatch(/🔒 reveal/);
    expect(container.textContent).not.toMatch(/Alice Andrews/);
  });

  // Owner feedback, 2026-11-10: expanding a row to read its finding(s) is a different scroll
  // position than the collapsed row's own Subject column -- a subject name stated only once,
  // mid-sentence, inside the first verdict's decision sentence, was easy to miss. SubjectDetail
  // already received subjectLabel as a prop (used inside buildDecisionSentence) before this fix;
  // what was missing was ever rendering it on its own.
  it('expanding a row shows the subject name as its own standalone header, not just inside the decision sentence', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const storeLabel = [...container.querySelectorAll('span')].find(s => s.textContent === 'Store 0000001');
    const aliceRow = storeLabel?.parentElement;
    expect(aliceRow).toBeTruthy();
    await act(async () => { aliceRow.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    const header = [...container.querySelectorAll('div')].find(d => d.textContent === 'Alice Andrews' && d.children.length === 0);
    expect(header).toBeTruthy();
    expect(header.style.fontWeight).toBe('700');
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
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
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
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
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
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
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
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
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
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
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
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
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
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
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

  // v5.411 -- loadSecurityFindings() may now read from security_findings_latest (one window per
  // rule per subject, see that function's own header), so the bulk-loaded `findings` a real
  // subject with real chronic history arrives here can look exactly like Bob's single-window
  // fixture even though the underlying table holds far more. The lazy per-subject fetch
  // (loadSecurityFindingsForSubject, fired on row-expand) exists to recover that real history --
  // these tests prove it actually rewires historyByRule, not just that the mock got called
  // (standing "verification must touch the call site" rule: a test asserting only the call
  // happened would still pass if the fetched rows were silently dropped on the floor).
  describe('lazy per-subject full history, fetched on row-expand', () => {
    it('a subject that looks like a single-window "first flag" from the bulk load upgrades to Chronic once its real multi-window history resolves', async () => {
      loadSecurityFindingsMock.mockReset().mockResolvedValue(BOB_FINDINGS);
      // Bob's REAL history, as only the base table (not the latest view) would carry it -- three
      // rising CASH-001 windows, identical shape to Alice's own chronic fixture above.
      const bobFullHistory = [
        { empToken: 'tok-bob', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: true, value: 6, thresholdUsed: 5, windowStart: '2026-06-01', windowEnd: '2026-06-28', computedAt: '2026-06-29T10:00:00Z', baselineContext: {}, explanation: [] },
        { empToken: 'tok-bob', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: true, value: 9, thresholdUsed: 5, windowStart: '2026-07-01', windowEnd: '2026-07-28', computedAt: '2026-07-29T10:00:00Z', baselineContext: {}, explanation: [] },
        { empToken: 'tok-bob', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: true, value: 12, thresholdUsed: 5, windowStart: '2026-08-01', windowEnd: '2026-08-28', computedAt: '2026-08-29T10:00:00Z', baselineContext: {}, explanation: [] },
      ];
      loadSecurityFindingsForSubjectMock.mockReset().mockResolvedValue(bobFullHistory);
      await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
      await flush(container);
      // SubjectDetail (where the trend line lives) only mounts once a row is expanded -- nothing
      // to assert on the collapsed state here, and the fetch itself is expand-triggered anyway
      // (matching SubjectDrilldown's own click-to-load shape elsewhere in this panel).
      const storeLabel = [...container.querySelectorAll('span')].find(s => s.textContent === 'Store 0000001');
      await act(async () => { storeLabel.parentElement.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush(container);
      expect(loadSecurityFindingsForSubjectMock).toHaveBeenCalledWith({ loc: '0000001', empToken: 'tok-bob', wrin: null });
      // After the fetch resolves: the REAL history is in, and the trend line -- read straight off
      // group.historyByRule, which only the merge in the render loop can have supplied -- upgrades.
      expect(container.textContent).toMatch(/Chronic — flagged before, still flagged/);
      expect(container.textContent).not.toMatch(/Not enough history yet to call this new or chronic/);
    });

    it('does not re-fetch a subject whose full history is already cached', async () => {
      loadSecurityFindingsMock.mockReset().mockResolvedValue(BOB_FINDINGS);
      loadSecurityFindingsForSubjectMock.mockReset().mockResolvedValue([]);
      await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
      await flush(container);
      const storeLabel = [...container.querySelectorAll('span')].find(s => s.textContent === 'Store 0000001');
      const row = storeLabel.parentElement;
      await act(async () => { row.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); // expand
      await flush(container);
      await act(async () => { row.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); // collapse
      await flush(container);
      await act(async () => { row.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); // re-expand
      await flush(container);
      expect(loadSecurityFindingsForSubjectMock).toHaveBeenCalledTimes(1);
    });

    it('a subject whose lazy fetch resolves empty keeps rendering the bulk-loaded (single-window) history -- never blanks out', async () => {
      loadSecurityFindingsMock.mockReset().mockResolvedValue(BOB_FINDINGS);
      loadSecurityFindingsForSubjectMock.mockReset().mockResolvedValue([]);
      await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
      await flush(container);
      const storeLabel = [...container.querySelectorAll('span')].find(s => s.textContent === 'Store 0000001');
      await act(async () => { storeLabel.parentElement.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
      await flush(container);
      expect(container.textContent).toMatch(/Subject history: flagged 1 of 1 evaluation since 2026-08-01/);
    });
  });
});

// dispatch #120 -- the progressive LocationSelector (replacing the old flat State/Org/Store pill
// row) renders through the real SecurityPanel and actually changes what's visible, not just "the
// selector renders" (standing rule: a test exercising only scopeMatches in isolation can't tell a
// real fix from one whose selector was never wired up). Real loc numbers from constants.js' own
// INV_ORG_COORDS, not synthetic '0000001'-style fixture locs, so the state/patch split is checked
// against the actual live mapping. 13113 and 5183 are both OK -- and were both 'mcdok' under the
// now-removed Org tier -- but sit under DIFFERENT supervisors (Robert Spencer / Krystiana
// Langford), which is exactly the finer-grained capability the Patch tier adds. (This block used
// 3708 for the Robert Spencer example before the 2026-10-05 supervisor reassignment moved 3708 to
// Zukarr Eaves; 13113 is Robert Spencer's patch now -- see scopeMatches' own describe block above.)
describe('SecurityPanel — dispatch #120: progressive LocationSelector (State -> Patch -> Store) reaches scopeMatches through the real UI', () => {
  let container, root;
  const RULES = [{ ruleId: 'CASH-001', domain: 'cash', method: 'Cash drawer over/short rate', description: 'desc', baselineType: 'personal', logicType: 'ratio', active: true, investigationAction: 'act' }];
  // 13113 = Madill-Hwy 70, OK, sup Robert Spencer. 5183 = Chickasha, OK, sup Krystiana Langford.
  // 6178 = Chipley, FL, sup Brad Denley.
  const FINDINGS = [
    { empToken: 'tok-madill', wrin: null, loc: '13113', ruleId: 'CASH-001', pass: true, value: 10, thresholdUsed: 5, windowStart: '2026-08-01', windowEnd: '2026-08-28', computedAt: '2026-08-29T10:00:00Z', baselineContext: {}, explanation: [] },
    { empToken: 'tok-chickasha', wrin: null, loc: '5183', ruleId: 'CASH-001', pass: true, value: 8, thresholdUsed: 5, windowStart: '2026-08-01', windowEnd: '2026-08-28', computedAt: '2026-08-29T10:00:00Z', baselineContext: {}, explanation: [] },
    { empToken: 'tok-chipley', wrin: null, loc: '6178', ruleId: 'CASH-001', pass: true, value: 12, thresholdUsed: 5, windowStart: '2026-08-01', windowEnd: '2026-08-28', computedAt: '2026-08-29T10:00:00Z', baselineContext: {}, explanation: [] },
  ];
  const btnByText = (text) => [...container.querySelectorAll('button')].find(b => b.textContent === text);
  const click = async (b) => { await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };
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

  it('before selecting any pill, all three real stores render unfiltered, and there is no flat ~30-pill Org/Store row any more (the mobile-usability bug this dispatch fixes)', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    expect(container.textContent).toMatch(/Store 13113/);
    expect(container.textContent).toMatch(/Store 5183/);
    expect(container.textContent).toMatch(/Store 6178/);
    // The old Org pills are gone entirely -- not renamed, removed (see scopeMatches' own comment).
    expect(btnByText('MCDOK')).toBeFalsy();
    expect(btnByText('Emerald Arches')).toBeFalsy();
    // Progressive mode: only the State tier (+ "All Locations") shows before any State is picked
    // -- Patch and Store pills for 13113/5183/6178 are NOT all on screen at once.
    expect(btnByText('All Locations')).toBeTruthy();
    expect(btnByText('OK')).toBeTruthy();
    expect(btnByText('FL')).toBeTruthy();
    expect(btnByText('Robert Spencer')).toBeFalsy();
    expect(btnByText('13113 — Madill-Hwy 70')).toBeFalsy();
  });

  it('picking the OK State pill filters to exactly the OK stores (13113, 5183), excluding the FL store (6178) -- same store set the old MCDOK Org pill reached', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    await click(btnByText('OK'));
    expect(container.textContent).toMatch(/Store 13113/);
    expect(container.textContent).toMatch(/Store 5183/);
    expect(container.textContent).not.toMatch(/Store 6178/);
    // Picking OK reveals ITS Patch tier -- both supervisors, since both have an OK store present.
    expect(btnByText('Robert Spencer')).toBeTruthy();
    expect(btnByText('Krystiana Langford')).toBeTruthy();
  });

  it('picking the FL State pill filters to exactly the FL store (6178), excluding both OK stores -- same store set the old Emerald Arches Org pill reached', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    await click(btnByText('FL'));
    expect(container.textContent).toMatch(/Store 6178/);
    expect(container.textContent).not.toMatch(/Store 13113/);
    expect(container.textContent).not.toMatch(/Store 5183/);
  });

  it('the Patch tier is a genuinely finer scope than the old Org tier -- Robert Spencer isolates 13113 from 5183, though both are OK/mcdok', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    await click(btnByText('OK'));
    await click(btnByText('Robert Spencer'));
    expect(container.textContent).toMatch(/Store 13113/);
    expect(container.textContent).not.toMatch(/Store 5183/); // same state AND same old org -- only Patch can separate these
    expect(container.textContent).not.toMatch(/Store 6178/);
    // Picking the Patch reveals its Store tier.
    expect(btnByText('13113 — Madill-Hwy 70')).toBeTruthy();
  });

  it('the other Patch under the same state isolates the sibling store instead', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    await click(btnByText('OK'));
    await click(btnByText('Krystiana Langford'));
    expect(container.textContent).toMatch(/Store 5183/);
    expect(container.textContent).not.toMatch(/Store 13113/);
    expect(container.textContent).not.toMatch(/Store 6178/);
  });

  it('a Store pill (reached via State -> Patch) filters to EXACTLY that store', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    await click(btnByText('OK'));
    await click(btnByText('Robert Spencer'));
    // Store pills carry the store name too (matching the shared LocationSelector's own label
    // convention, PanelControls.js's storeLabel) -- click on the real label, not the bare loc.
    const storeBtn = btnByText('13113 — Madill-Hwy 70');
    expect(storeBtn).toBeTruthy();
    await click(storeBtn);
    expect(container.textContent).toMatch(/Store 13113/);
    expect(container.textContent).not.toMatch(/Store 5183/);
    expect(container.textContent).not.toMatch(/Store 6178/);
  });

  it('"All Locations" resets back to unfiltered after a State/Patch/Store selection', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    await click(btnByText('OK'));
    await click(btnByText('Robert Spencer'));
    expect(container.textContent).not.toMatch(/Store 5183/);
    await click(btnByText('All Locations'));
    expect(container.textContent).toMatch(/Store 13113/);
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
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    expect(container.textContent).toMatch(/Store 3708/);
    expect(container.textContent).toMatch(/Store 5183/);
    const allDatesBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'All dates');
    expect(allDatesBtn).toBeTruthy();
  });

  it('the 90D preset excludes the distant (400-day-old) subject and keeps the recent one', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const preset90 = [...container.querySelectorAll('button')].find(b => b.textContent === '90D');
    expect(preset90).toBeTruthy();
    await act(async () => { preset90.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toMatch(/Store 3708/);
    expect(container.textContent).not.toMatch(/Store 5183/);
  });

  it('clicking "All dates" after a preset resets back to unbounded -- both subjects return', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
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
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    expect(container.textContent).toMatch(/Findings with a window ending:/);
  });

  // dispatch #120's verification bar -- confirm the fetch effect never depends on dateRange
  // through the real component, not just by reading loadSecurityFindings' call signature (it
  // takes no date argument at all, so a signature check alone can't catch an added dependency
  // that re-triggers the SAME no-arg call a second time). loadSecurityFindings is called exactly
  // once for the whole test regardless of how many date-range interactions happen after mount --
  // if `dateRange` were ever added to that effect's dependency array, each click below would add
  // another call.
  it('changing the date-range control (preset, then All dates) never re-triggers loadSecurityFindings -- it only re-filters already-loaded findings client-side', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    expect(loadSecurityFindingsMock).toHaveBeenCalledTimes(1);
    const preset90 = [...container.querySelectorAll('button')].find(b => b.textContent === '90D');
    await act(async () => { preset90.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(loadSecurityFindingsMock).toHaveBeenCalledTimes(1);
    const preset7 = [...container.querySelectorAll('button')].find(b => b.textContent === '7D');
    await act(async () => { preset7.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(loadSecurityFindingsMock).toHaveBeenCalledTimes(1);
    const allDatesBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'All dates');
    await act(async () => { allDatesBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(loadSecurityFindingsMock).toHaveBeenCalledTimes(1);
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
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const pillText = id => [...container.querySelectorAll('button')].find(b => b.textContent.startsWith(id))?.textContent;
    expect(pillText('CASH-001')).toBe('CASH-001 · Cash drawer over/short');
    expect(pillText('CASH-002')).toBe('CASH-002 · POS over-ring');
    expect(pillText('CASH-003')).toBe('CASH-003 · Manual refund ⏸'); // inactive marker preserved
    expect(pillText('CASH-004')).toBe('CASH-004 · Promo/discount');
  });

  it('every Inventory rule pill shows both its ruleId and a short descriptor', async () => {
    loadSecurityFindingsMock.mockReset().mockResolvedValue([]);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const invTab = [...container.querySelectorAll('button')].find(b => b.textContent === '📦 Inventory');
    await act(async () => { invTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const pillText = id => [...container.querySelectorAll('button')].find(b => b.textContent.startsWith(id))?.textContent;
    expect(pillText('INV-001')).toBe('INV-001 · Item TvA variance');
    expect(pillText('INV-002')).toBe('INV-002 · Dollar-variance');
  });

  it('the fuller description line below still renders for the selected rule -- the tag is additive, not a replacement', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const ruleBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'CASH-001 · Cash drawer over/short');
    await act(async () => { ruleBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toMatch(/d1/); // the full description fixture text
  });
});

// dispatch #120 -- findings-readability pure helpers (latestWindowEnd, sortFindingsForDisplay).
// See sortFindingsForDisplay's own header comment in security-panel.js for why a table+sort was
// chosen over a click-through to an "actual event" view (RegisterAuditTab does not qualify).
describe('latestWindowEnd()', () => {
  it('returns the max windowEnd across a group\'s verdicts', () => {
    const group = { verdicts: [{ windowEnd: '2026-08-01' }, { windowEnd: '2026-08-28' }, { windowEnd: '2026-07-15' }] };
    expect(latestWindowEnd(group)).toBe('2026-08-28');
  });
  it('returns "" (never null/undefined) when no verdict has a windowEnd', () => {
    expect(latestWindowEnd({ verdicts: [] })).toBe('');
    expect(latestWindowEnd({ verdicts: [{ windowEnd: null }] })).toBe('');
    expect(latestWindowEnd({})).toBe('');
  });
});

describe('sortFindingsForDisplay()', () => {
  // Deliberately NOT pre-sorted by any of the columns under test, so a passing "sorts by X" case
  // can't be an accidental no-op on already-sorted input.
  const groups = [
    { key: 'b', subjectType: 'emp', empToken: 'tok-bob', flaggedCount: 1, verdicts: [{ ruleId: 'CASH-002', windowEnd: '2026-08-10' }] },
    { key: 'a', subjectType: 'emp', empToken: 'tok-alice', flaggedCount: 2, verdicts: [{ ruleId: 'CASH-001', windowEnd: '2026-08-28' }] },
    { key: 'c', subjectType: 'emp', empToken: 'tok-carol', flaggedCount: 0, verdicts: [{ ruleId: 'CASH-003', windowEnd: '2026-07-01' }] },
  ];
  it('the default ("signals","desc") is a TRUE no-op -- returns the SAME array reference, never re-deriving groupFindingsBySubject\'s own tie-break', () => {
    expect(sortFindingsForDisplay(groups, 'signals', 'desc')).toBe(groups);
    expect(sortFindingsForDisplay(groups, null, null)).toBe(groups);
  });
  it('sorting by "signals" ascending DOES re-sort -- only the desc case is the no-op', () => {
    expect(sortFindingsForDisplay(groups, 'signals', 'asc').map(g => g.key)).toEqual(['c', 'b', 'a']); // 0 < 1 < 2
  });
  it('sorts by subject (empToken/wrin) ascending and descending', () => {
    expect(sortFindingsForDisplay(groups, 'subject', 'asc').map(g => g.key)).toEqual(['a', 'b', 'c']); // tok-alice < tok-bob < tok-carol
    expect(sortFindingsForDisplay(groups, 'subject', 'desc').map(g => g.key)).toEqual(['c', 'b', 'a']);
  });
  it('sorts by rule (lowest ruleId among a group\'s verdicts) ascending', () => {
    expect(sortFindingsForDisplay(groups, 'rule', 'asc').map(g => g.key)).toEqual(['a', 'b', 'c']); // CASH-001 < 002 < 003
  });
  it('sorts by window (latest windowEnd) ascending and descending', () => {
    expect(sortFindingsForDisplay(groups, 'window', 'desc').map(g => g.key)).toEqual(['a', 'b', 'c']); // 08-28 > 08-10 > 07-01
    expect(sortFindingsForDisplay(groups, 'window', 'asc').map(g => g.key)).toEqual(['c', 'b', 'a']);
  });
  it('never mutates the input array', () => {
    const before = [...groups];
    sortFindingsForDisplay(groups, 'subject', 'asc');
    expect(groups).toEqual(before);
  });
});

// dispatch #120 -- the table renders through the real panel (standing rule: a test exercising
// only sortFindingsForDisplay in isolation can't tell a real fix from one whose header clicks
// were never wired to onSort). Inventory domain, not cash: a wrin subject's heading renders
// directly as text ("Item WRIN") with no reveal click needed, so row order is readable from
// textContent alone -- an emp subject would render an identical "🔒 reveal" placeholder for every
// row regardless of token, which can't distinguish row order.
describe('SecurityPanel — dispatch #120: findings render as a real, sortable <table>', () => {
  let container, root;
  const INV_RULES = [{ ruleId: 'INV-001', domain: 'inventory', method: 'Item TvA variance rate vs. expected usage', description: 'd', baselineType: 'store', logicType: 'z-score', active: true, investigationAction: 'a' }];
  // All three flag on the same single rule (flaggedCount ties at 1) -- default order falls to
  // worstValue descending, deliberately set ZULU > MIKE > ECHO so it differs from every other
  // sort the test below exercises (subject-alpha gives ECHO/MIKE/ZULU).
  const INV_FINDINGS = [
    { empToken: null, wrin: 'ZULU-001', loc: '0000001', ruleId: 'INV-001', pass: true, value: 90, thresholdUsed: 20, windowStart: '2026-08-01', windowEnd: '2026-08-28', computedAt: '2026-08-29T10:00:00Z', baselineContext: {}, explanation: [] },
    { empToken: null, wrin: 'MIKE-002', loc: '0000001', ruleId: 'INV-001', pass: true, value: 50, thresholdUsed: 20, windowStart: '2026-08-01', windowEnd: '2026-08-28', computedAt: '2026-08-29T10:00:00Z', baselineContext: {}, explanation: [] },
    { empToken: null, wrin: 'ECHO-003', loc: '0000001', ruleId: 'INV-001', pass: true, value: 30, thresholdUsed: 20, windowStart: '2026-08-01', windowEnd: '2026-08-28', computedAt: '2026-08-29T10:00:00Z', baselineContext: {}, explanation: [] },
  ];
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadSecurityFindingsMock.mockReset().mockResolvedValue(INV_FINDINGS);
    loadSecurityRulesMock.mockReset().mockResolvedValue(INV_RULES);
    loadGmIdentityRevealEnabledMock.mockReset().mockResolvedValue(true);
    loadQsrVarianceStatMock.mockReset().mockResolvedValue([]); // no descr -> falls back to "Item WRIN"
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  const rowOrder = (container) => [...container.querySelectorAll('tbody tr')]
    .map(tr => (tr.textContent.match(/ZULU-001|MIKE-002|ECHO-003/) || [])[0])
    .filter(Boolean);

  it('renders real <table>/<thead>/<th>/<tbody> markup, not a hand-rolled flex list', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const invTab = [...container.querySelectorAll('button')].find(b => b.textContent === '📦 Inventory');
    await act(async () => { invTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(container.querySelector('table')).toBeTruthy();
    expect(container.querySelector('thead')).toBeTruthy();
    expect(container.querySelectorAll('th').length).toBeGreaterThanOrEqual(4);
    expect(container.querySelectorAll('tbody tr').length).toBe(3);
  });

  it('defaults to the pre-existing signal/worstValue order: ZULU, MIKE, ECHO', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const invTab = [...container.querySelectorAll('button')].find(b => b.textContent === '📦 Inventory');
    await act(async () => { invTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(rowOrder(container)).toEqual(['ZULU-001', 'MIKE-002', 'ECHO-003']);
  });

  it('clicking the Subject column header re-sorts ascending (ECHO, MIKE, ZULU) through the real UI', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const invTab = [...container.querySelectorAll('button')].find(b => b.textContent === '📦 Inventory');
    await act(async () => { invTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    const subjectTh = [...container.querySelectorAll('th')].find(t => t.textContent.startsWith('Subject'));
    expect(subjectTh).toBeTruthy();
    await act(async () => { subjectTh.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(rowOrder(container)).toEqual(['ECHO-003', 'MIKE-002', 'ZULU-001']);
    // Clicking the SAME header again flips direction back to descending.
    await act(async () => { subjectTh.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(rowOrder(container)).toEqual(['ZULU-001', 'MIKE-002', 'ECHO-003']);
  });

  it('expanding a flagged row shows the camera-footage reminder, naming the real store and window', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const invTab = [...container.querySelectorAll('button')].find(b => b.textContent === '📦 Inventory');
    await act(async () => { invTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    const firstRow = container.querySelector('tbody tr');
    await act(async () => { firstRow.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(container.textContent).toMatch(/📹 Before deciding: pull camera footage for Store 0000001, 2026-08-01 – 2026-08-28/);
  });
});

// dispatch #120's verification bar -- rendered at a real mobile viewport with the FULL real
// 27-store dataset (constants.js' own INV_ORG_COORDS, not a 2-3-store fixture), confirming the
// location scope no longer puts every State/Org/Store pill on screen simultaneously. happy-dom
// does not lay out CSS flex-wrap, so wrapped-row pixel geometry can't be asserted here -- what
// IS asserted, and what the dispatch's actual bug was, is the STRUCTURAL fix: before any
// selection, only "All Locations" + the State tier render (not all 27 store pills at once), and
// even after drilling to a Patch, the Store tier shown is bounded to that one patch's stores, far
// below the full 27.
describe('SecurityPanel — dispatch #120: full 27-store dataset at a mobile viewport (390x844), no flat 30+-pill dump', () => {
  let container, root;
  const RULES = [{ ruleId: 'CASH-001', domain: 'cash', method: 'Cash drawer over/short rate', description: 'd', baselineType: 'personal', logicType: 'ratio', active: true, investigationAction: 'a' }];
  const ALL_LOCS = Object.keys(INV_ORG_COORDS);
  const FINDINGS = ALL_LOCS.map((loc, i) => ({
    empToken: 'tok-' + loc, wrin: null, loc, ruleId: 'CASH-001', pass: true, value: 10 + i, thresholdUsed: 5,
    windowStart: '2026-08-01', windowEnd: '2026-08-28', computedAt: '2026-08-29T10:00:00Z', baselineContext: {}, explanation: [],
  }));
  let origW, origH;
  beforeEach(() => {
    origW = window.innerWidth; origH = window.innerHeight;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
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
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: origW });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: origH });
  });

  it('sanity: the real estate has more than 20 stores (this is the ~27-store dataset, not a small fixture)', () => {
    expect(ALL_LOCS.length).toBeGreaterThan(20);
  });

  it('before any selection, the location scope shows only "All Locations" + the State tier -- zero individual store pills, regardless of viewport', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const storeLabelBtns = [...container.querySelectorAll('button')].filter(b => /^\d+ — /.test(b.textContent));
    expect(storeLabelBtns.length).toBe(0);
    const stateBtns = [...container.querySelectorAll('button')].filter(b => b.textContent === 'OK' || b.textContent === 'FL');
    expect(stateBtns.length).toBe(2); // just the two real states -- not one pill per store
  });

  it('after drilling State -> Patch, the revealed Store tier is bounded to that one patch, never all 27 at once', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const okBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'OK');
    await act(async () => { okBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const patchBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Robert Spencer');
    expect(patchBtn).toBeTruthy();
    await act(async () => { patchBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const storeLabelBtns = [...container.querySelectorAll('button')].filter(b => /^\d+ — /.test(b.textContent));
    expect(storeLabelBtns.length).toBeGreaterThan(0);
    expect(storeLabelBtns.length).toBeLessThan(10); // one supervisor's patch, nowhere near all 27
  });
});

// dispatch 2026-10-12 -- the 'labor' domain (LABOR-001/002/003, schema-security-rules-labor.sql).
// Renders through the REAL panel (standing rule from #366): a test that only imports
// groupFindingsBySubject can't tell "the domain renders" from "the domain was only added to a
// pure helper and never reached the tab/filter wiring."
describe('SecurityPanel — labor domain wiring (dispatch 2026-10-12): tab renders, subjects group by empToken same as Cash, drill-down is a stated scope decision, not offered yet', () => {
  let container, root;
  const RULES = [
    { ruleId: 'CASH-001', domain: 'cash', method: 'Cash drawer over/short rate', description: 'desc', baselineType: 'personal', logicType: 'ratio', active: true, investigationAction: 'act' },
    { ruleId: 'LABOR-001', domain: 'labor', method: 'Post-termination punch-edit activity', description: 'desc', baselineType: null, logicType: 'threshold', active: false, investigationAction: 'act' },
  ];
  const FINDINGS = [
    { empToken: 'tok-cash', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: true, value: 10, thresholdUsed: 5, windowStart: '2026-10-01', windowEnd: '2026-10-12', computedAt: '2026-10-12T10:00:00Z', baselineContext: {}, explanation: [] },
    { empToken: 'tok-jordan', wrin: null, loc: '0000001', ruleId: 'LABOR-001', pass: true, value: 1, thresholdUsed: 1, windowStart: '2026-10-01', windowEnd: '2026-10-12', computedAt: '2026-10-12T10:00:00Z', baselineContext: {}, explanation: [] },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadSecurityFindingsMock.mockReset().mockResolvedValue(FINDINGS);
    loadSecurityRulesMock.mockReset().mockResolvedValue(RULES);
    loadGmIdentityRevealEnabledMock.mockReset().mockResolvedValue(true);
    rpcMock.mockReset(); // admin's bulk-reveal effect fires; an unmocked call just resolves undefined, handled gracefully.
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('a third "🕐 Labor" tab exists alongside Cash/Inventory', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const tabs = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(tabs).toContain('🕐 Labor');
  });

  it('switching to Labor shows the LABOR-001 subject (empToken-keyed, same grouping as Cash) and hides the Cash subject', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const laborTab = [...container.querySelectorAll('button')].find(b => b.textContent === '🕐 Labor');
    await act(async () => { laborTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(container.textContent).toMatch(/LABOR-001/);
    expect(container.textContent).not.toMatch(/CASH-001/);
    // Sanity on the bySubjectType fix: before it, domain==='labor' fell into the old two-way
    // ternary's ELSE branch (wrin-based) and this empToken-only subject (no wrin at all) would
    // have been filtered out of every group entirely -- "Store 0000001" would never render.
    expect([...container.querySelectorAll('span')].some(s => s.textContent === 'Store 0000001')).toBe(true);
  });

  it('expanding the Labor subject does NOT offer "Investigate further" -- a stated scope decision (no assembleLaborDrilldown yet), not a silent gap', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const laborTab = [...container.querySelectorAll('button')].find(b => b.textContent === '🕐 Labor');
    await act(async () => { laborTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    const subjectSpan = [...container.querySelectorAll('span')].find(s => s.textContent === 'Store 0000001');
    const clickable = subjectSpan?.parentElement;
    expect(clickable).toBeTruthy();
    await act(async () => { clickable.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    // The row DID expand (its per-rule detail, e.g. the rule's own method name, is now visible) --
    // this is not a false negative from the row never opening.
    expect(container.textContent).toMatch(/Post-termination punch-edit activity/);
    const investigateBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '🔎 Investigate further');
    expect(investigateBtn).toBeFalsy();
  });
});

describe('minSignalsLabel()', () => {
  it('0 reads as "All (incl. clear)", not the nonsensical "0+"', () => {
    expect(minSignalsLabel(0)).toBe('All (incl. clear)');
  });
  it('1/2/3 read as the plain N+ the pill row always showed', () => {
    expect(minSignalsLabel(1)).toBe('1+');
    expect(minSignalsLabel(2)).toBe('2+');
    expect(minSignalsLabel(3)).toBe('3+');
  });
});

// dispatch 2026-10-12 -- the real scenario that surfaced this gap: LABOR-001/LABOR-002 went
// live with 0/129 subjects flagged on EITHER rule (a clean, real, decided result -- not a
// loading failure). Every pre-existing Min Signals floor (1+/2+/3+) requires at least one
// FLAGGED verdict, so a domain that is 100% clear rendered an empty table indistinguishable
// from "nothing loaded" -- exactly what prompted "none of them are pulling any data." This
// dispatch originally shipped only the "All" pill as a manual escape hatch, defaulting EVERY
// domain to 1+ including Labor -- which meant the owner saw that exact "looks broken" empty
// state live on first click, reported "Labor still does not [show results]" believing it was
// the same load bug Cash/Inventory had (it wasn't -- those loaded via the concurrency fix;
// Labor was loading fine, just 100% clear under the 1+ default). Dispatch 2026-10-14 Part 4
// (owner: "default Labor to All too") -- DOMAIN_DEFAULT_MIN_SIGNALS makes the domain-tab click
// itself set Min Signals to each domain's own default (Labor: 0/All, Cash/Inventory: 1+,
// unchanged) rather than requiring a second manual click Labor's own real-world launch state
// made necessary every time. Renders through the REAL panel (standing rule from #366): a test
// that only imports groupFindingsBySubject's own flaggedCount math can't tell "the UI has no
// way to show a clear subject" from "the UI correctly shows nothing."
describe('SecurityPanel — Labor defaults to Min Signals: All (dispatch 2026-10-14 Part 4, following 2026-10-12\'s "All" pill)', () => {
  let container, root;
  const RULES = [
    { ruleId: 'CASH-001', domain: 'cash', method: 'Cash drawer over/short rate', description: 'desc', baselineType: 'personal', logicType: 'ratio', active: true, investigationAction: 'act' },
    { ruleId: 'LABOR-001', domain: 'labor', method: 'Post-termination punch-edit activity', description: 'desc', baselineType: null, logicType: 'threshold', active: true, investigationAction: 'act' },
    { ruleId: 'LABOR-002', domain: 'labor', method: 'Employee self-approved punch edit', description: 'desc', baselineType: null, logicType: 'threshold', active: true, investigationAction: 'act' },
  ];
  // Every Labor subject clear on every rule -- the real LABOR-001/002 launch-day shape (0/129
  // flagged on either rule), not a contrived edge case. One Cash finding, flagged, so Cash's
  // own 1+ default still has something real to show (and this test file can tell "Cash still
  // defaults to 1+" from "every domain silently defaults to All now").
  const FINDINGS = [
    { empToken: 'tok-casey', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: true, value: 50, thresholdUsed: 10, windowStart: '2026-10-01', windowEnd: '2026-10-12', computedAt: '2026-10-12T19:00:00Z', baselineContext: {}, explanation: [] },
    { empToken: 'tok-jordan', wrin: null, loc: '0000001', ruleId: 'LABOR-001', pass: false, value: 0, thresholdUsed: 1, windowStart: '2026-10-01', windowEnd: '2026-10-12', computedAt: '2026-10-12T19:00:00Z', baselineContext: {}, explanation: [] },
    { empToken: 'tok-jordan', wrin: null, loc: '0000001', ruleId: 'LABOR-002', pass: false, value: 0, thresholdUsed: 1, windowStart: '2026-10-01', windowEnd: '2026-10-12', computedAt: '2026-10-12T19:00:00Z', baselineContext: {}, explanation: [] },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadSecurityFindingsMock.mockReset().mockResolvedValue(FINDINGS);
    loadSecurityRulesMock.mockReset().mockResolvedValue(RULES);
    loadGmIdentityRevealEnabledMock.mockReset().mockResolvedValue(true);
    rpcMock.mockReset();
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('clicking the Labor tab shows the real, clear subject immediately -- no extra "All" click needed (regression guard: confirmed this fails -- shows the empty state instead -- without DOMAIN_DEFAULT_MIN_SIGNALS wired into the tab click)', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const laborTab = [...container.querySelectorAll('button')].find(b => b.textContent === '🕐 Labor');
    await act(async () => { laborTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(container.textContent).not.toMatch(/No findings match the current filters/);
    expect([...container.querySelectorAll('span')].some(s => s.textContent === 'Store 0000001')).toBe(true);
    // Clear (green), not Flagged -- the honest verdict, not a fabricated one.
    expect(container.textContent).toMatch(/Clear/);
    // The Min Signals row itself should show "All" as the active pill, not 1+ -- confirms this
    // happened via the real default, not some other path (e.g. minSignals' filter being bypassed).
    const minSignalsRow = [...container.querySelectorAll('span')].find(s => s.textContent === 'Min signals:');
    expect(minSignalsRow).toBeTruthy();
  });

  it('Cash still defaults to 1+ (unchanged) -- only Labor\'s default moved, not every domain\'s', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    // Mounts on Cash by default; its one finding is pass:true (flagged), so it should already
    // show under the pre-existing 1+ default with no tab click needed.
    await flush(container);
    expect(container.textContent).not.toMatch(/No findings match the current filters/);
    expect(container.textContent).toMatch(/Flagged/);
  });

  it('switching Labor -> Cash -> Labor re-defaults to All each time, not just on the first visit', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const laborTab = [...container.querySelectorAll('button')].find(b => b.textContent === '🕐 Labor');
    const cashTab = [...container.querySelectorAll('button')].find(b => b.textContent === '💵 Cash');
    await act(async () => { laborTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(container.textContent).not.toMatch(/No findings match the current filters/);
    await act(async () => { cashTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    await act(async () => { laborTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(container.textContent).not.toMatch(/No findings match the current filters/);
    expect([...container.querySelectorAll('span')].some(s => s.textContent === 'Store 0000001')).toBe(true);
  });
});

// dispatch 2026-11-09 -- owner's own ask, in order: "Case tracking and the Playbook stuff
// first, the rest can follow." Three things render through the real SecurityPanel here: the
// new Events domain tab (EVENT-001/002/003 would otherwise be permanently unreachable in the
// UI -- the domain tab array never had 'events' in it until this dispatch), the curated
// Playbook content (src/engine/security-playbook.js) surfacing inside the existing Rule
// Directory, and the case-tracking action buttons (security_finding_actions) surfacing inside
// an expanded subject's own verdict block.
describe('SecurityPanel — dispatch 2026-11-09: Events domain tab, Rule Playbook, case tracking', () => {
  let container, root;
  const RULES = [
    { ruleId: 'CASH-001', domain: 'cash', method: 'Cash drawer over/short rate', description: 'How much cash is over or short at the drawer.', baselineType: 'personal', logicType: 'ratio', active: true, investigationAction: 'Pull drawer-count photos.' },
    { ruleId: 'EVENT-001', domain: 'events', method: 'Employee meal discount outside scheduled hours', description: 'An employee-meal discount rung when that employee was not clocked in.', baselineType: 'personal', logicType: 'z-score', active: false, investigationAction: 'Check the clock against the meal timestamp.' },
  ];
  const FINDINGS = [
    { id: 'find-cash-1', empToken: 'tok-alice', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: true, value: 12, thresholdUsed: 5, windowStart: '2026-07-01', windowEnd: '2026-07-28', computedAt: '2026-07-29T10:00:00Z', baselineContext: {}, explanation: [] },
    { id: 'find-event-1', empToken: 'tok-jordan', wrin: null, loc: '0000001', ruleId: 'EVENT-001', pass: true, value: 3.2, thresholdUsed: 2.5, windowStart: '2026-10-01', windowEnd: '2026-10-28', computedAt: '2026-10-29T10:00:00Z', baselineContext: {}, explanation: [] },
  ];

  beforeEach(() => {
    localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadSecurityFindingsMock.mockReset().mockResolvedValue(FINDINGS);
    loadSecurityRulesMock.mockReset().mockResolvedValue(RULES);
    loadGmIdentityRevealEnabledMock.mockReset().mockResolvedValue(true);
    loadSecurityFindingActionsForFindingsMock.mockReset().mockResolvedValue([]);
    saveSecurityFindingActionMock.mockReset().mockResolvedValue({ id: 'action-1', findingId: 'find-cash-1', action: 'investigated_cleared', note: null, createdByRole: 'admin', createdAt: '2026-11-09T12:00:00Z' });
    rpcMock.mockReset();
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('a fourth "🧾 Events" tab exists alongside Cash/Inventory/Labor, and switching to it shows the EVENT-001 subject', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const tabs = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(tabs).toContain('🧾 Events');
    const eventsTab = tabs.includes('🧾 Events') && [...container.querySelectorAll('button')].find(b => b.textContent === '🧾 Events');
    await act(async () => { eventsTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(container.textContent).toMatch(/EVENT-001/);
    expect(container.textContent).not.toMatch(/CASH-001/);
  });

  it('expanding the Events subject does NOT offer "Investigate further" -- same stated scope decision as Labor, no assembleEventsDrilldown yet', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const eventsTab = [...container.querySelectorAll('button')].find(b => b.textContent === '🧾 Events');
    await act(async () => { eventsTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    const subjectSpan = [...container.querySelectorAll('span')].find(s => s.textContent === 'Store 0000001');
    const clickable = subjectSpan?.parentElement;
    expect(clickable).toBeTruthy();
    await act(async () => { clickable.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(container.textContent).toMatch(/Employee meal discount outside scheduled hours/);
    const investigateBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '🔎 Investigate further');
    expect(investigateBtn).toBeFalsy();
  });

  it('the Rule Directory renders the Playbook content for a rule that has a playbook entry (CASH-001 -> the "cash" family)', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const toggle = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Rule directory'));
    expect(toggle).toBeTruthy();
    await act(async () => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toMatch(/📖 Playbook — Cash drawer variance/);
    expect(container.textContent).toMatch(/What it is:/);
    expect(container.textContent).toMatch(/The real tell:/);
    expect(container.textContent).toMatch(/Floor technique:/);
    expect(container.textContent).toMatch(/Never let one person count their own drawer and verify it\./);
  });

  it('a rule with no playbook entry renders no Playbook block at all (playbookForRule\'s honest-null contract, not an empty box)', async () => {
    loadSecurityRulesMock.mockReset().mockResolvedValue([
      { ruleId: 'ZZZ-999', domain: 'cash', method: 'Synthetic rule with no playbook family', description: 'desc', baselineType: 'peer', logicType: 'ratio', active: true, investigationAction: 'act' },
    ]);
    loadSecurityFindingsMock.mockReset().mockResolvedValue([]);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const toggle = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Rule directory'));
    await act(async () => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toMatch(/Synthetic rule with no playbook family/);
    expect(container.textContent).not.toMatch(/📖 Playbook/);
  });

  async function expandAliceRow() {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const storeLabel = [...container.querySelectorAll('span')].find(s => s.textContent === 'Store 0000001');
    const row = storeLabel?.parentElement;
    expect(row).toBeTruthy();
    await act(async () => { row.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
  }

  it('expanding a flagged subject fetches its finding actions on demand and renders the two case-tracking buttons', async () => {
    await expandAliceRow();
    expect(loadSecurityFindingActionsForFindingsMock).toHaveBeenCalledTimes(1);
    expect(loadSecurityFindingActionsForFindingsMock).toHaveBeenCalledWith(['find-cash-1']);
    const markBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '✓ Mark investigated');
    const escalateBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '⬆ Escalate');
    expect(markBtn).toBeTruthy();
    expect(escalateBtn).toBeTruthy();
  });

  it('clicking "Mark investigated", typing a note, and submitting calls saveSecurityFindingAction with the right shape and then renders the new action as the latest badge', async () => {
    await expandAliceRow();
    const markBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '✓ Mark investigated');
    await act(async () => { markBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const textarea = container.querySelector('textarea');
    expect(textarea).toBeTruthy();
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(textarea, 'Checked drawer photos, matches the count.');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const submitBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Submit');
    await act(async () => { submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(saveSecurityFindingActionMock).toHaveBeenCalledWith({
      findingId: 'find-cash-1', action: 'investigated_cleared',
      note: 'Checked drawer photos, matches the count.', role: 'admin',
    });
    expect(container.textContent).toMatch(/Investigated — cleared/);
  });

  it('escalating renders the Escalated badge and a History toggle once there is a prior action', async () => {
    loadSecurityFindingActionsForFindingsMock.mockReset().mockResolvedValue([
      { id: 'action-0', findingId: 'find-cash-1', action: 'noted', note: 'First pass, nothing conclusive.', createdByRole: 'gm', createdAt: '2026-11-01T09:00:00Z' },
    ]);
    saveSecurityFindingActionMock.mockReset().mockResolvedValue({ id: 'action-2', findingId: 'find-cash-1', action: 'escalated', note: null, createdByRole: 'admin', createdAt: '2026-11-09T12:00:00Z' });
    await expandAliceRow();
    await flush(container);
    const escalateBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '⬆ Escalate');
    await act(async () => { escalateBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const submitBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Submit');
    await act(async () => { submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(container.textContent).toMatch(/Escalated/);
    const historyBtn = [...container.querySelectorAll('button')].find(b => /^History \(\d+\)$/.test(b.textContent));
    expect(historyBtn).toBeTruthy();
    expect(historyBtn.textContent).toBe('History (2)');
    await act(async () => { historyBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(container.textContent).toMatch(/First pass, nothing conclusive\./);
  });

  it('a failed submit (e.g. the table not applied yet) shows a visible error, not just a console warning, and leaves the busy state cleared', async () => {
    saveSecurityFindingActionMock.mockReset().mockRejectedValue(new Error('relation "public.security_finding_actions" does not exist'));
    await expandAliceRow();
    const markBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '✓ Mark investigated');
    await act(async () => { markBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const submitBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Submit');
    await act(async () => { submitBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(container.textContent).toMatch(/⚠ relation "public\.security_finding_actions" does not exist/);
    // Busy cleared -- the button row is interactable again, not stuck on "Saving…".
    expect([...container.querySelectorAll('button')].some(b => b.textContent === '✓ Mark investigated')).toBe(true);
  });

  it('case tracking is never offered for an undetermined or hygiene verdict -- nothing real to act on yet', async () => {
    loadSecurityFindingsMock.mockReset().mockResolvedValue([
      { id: 'find-undet-1', empToken: 'tok-alice', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: null, thresholdUsed: 5, windowStart: '2026-07-01', windowEnd: '2026-07-28', computedAt: '2026-07-29T10:00:00Z', baselineContext: {}, explanation: [] },
    ]);
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    // Undetermined, never flagged -- falls below Cash's own 1+ Min Signals default, so switch to
    // the "All" pill first (same mechanic as the Labor-defaults-to-All tests above) to even see the
    // row. Two buttons read exactly "All" (the Rule: All reset pill comes first in the DOM) -- the
    // Min Signals one is the second.
    const allPills = [...container.querySelectorAll('button')].filter(b => b.textContent === 'All');
    expect(allPills.length).toBe(2);
    const allPill = allPills[1];
    await act(async () => { allPill.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    const storeLabel = [...container.querySelectorAll('span')].find(s => s.textContent === 'Store 0000001');
    const row = storeLabel?.parentElement;
    expect(row).toBeTruthy();
    await act(async () => { row.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    // The lazy fetch itself fires for any real finding row (it doesn't know the verdict's
    // pass state until the data is already loaded) -- what must NOT happen is the UI offering an
    // action on a verdict there is nothing yet to act on.
    const markBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '✓ Mark investigated');
    const escalateBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '⬆ Escalate');
    expect(markBtn).toBeFalsy();
    expect(escalateBtn).toBeFalsy();
  });
});

// dispatch 2026-11-10 -- Phase 1 of the owner's Security Health redesign: the district health
// grid + narrative Briefing cards, rendered through the real SecurityPanel (not just
// security-health.js's own engine tests) per this repo's "would this verification still pass if
// reverted" standing rule -- a test that only imported computeStoreHealth couldn't tell "wired
// into the panel" from "built but never rendered."
describe('SecurityPanel — Briefing view: district health grid + narrative cards (dispatch 2026-11-10)', () => {
  let container, root;
  const RULES = [
    {
      ruleId: 'CASH-001', domain: 'cash', method: 'Cash drawer over/short rate',
      description: 'How much cash is over or short at the drawer.', baselineType: 'personal',
      logicType: 'ratio', windowDays: 28, severity: 3, active: true,
      investigationAction: 'Pull the flagged employee\'s drawer-count photos.',
      falsePositives: ['register malfunction', 'new hire training week'],
    },
    {
      ruleId: 'LABOR-001', domain: 'labor', method: 'Post-termination punch edit',
      description: 'A punch edited after the employee\'s own termination date.', baselineType: 'none',
      logicType: 'threshold', windowDays: 28, severity: 5, active: true,
      investigationAction: 'Pull the edit detail and confirm the termination date is accurate.',
      falsePositives: [],
    },
  ];
  // Two stores, two subjects -- enough for the health grid to have something real to rank, and
  // for a click-to-filter to have a second store to disappear FROM.
  const FINDINGS = [
    {
      id: 'find-cash-alice', empToken: 'tok-alice', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: true,
      value: 50, thresholdUsed: 5, windowStart: '2026-07-01', windowEnd: '2026-07-28',
      computedAt: '2026-07-29T10:00:00Z',
      baselineContext: { mean: 10, stdev: 5, n: 8 }, explanation: [], exonerationShare: null,
    },
    {
      id: 'find-labor-bob', empToken: 'tok-bob', wrin: null, loc: '0000002', ruleId: 'LABOR-001', pass: true,
      value: 2, thresholdUsed: 1, windowStart: '2026-07-01', windowEnd: '2026-07-28',
      computedAt: '2026-07-29T10:00:00Z',
      baselineContext: {}, explanation: [], exonerationShare: null,
    },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadSecurityFindingsMock.mockReset().mockResolvedValue(FINDINGS);
    loadSecurityRulesMock.mockReset().mockResolvedValue(RULES);
    loadGmIdentityRevealEnabledMock.mockReset().mockResolvedValue(true);
    loadSecurityFindingActionsForFindingsMock.mockReset().mockResolvedValue([]);
    logAppAccessMock.mockClear();
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  async function mount() {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
  }
  function clickByText(tag, text) {
    const el = [...container.querySelectorAll(tag)].find(b => b.textContent === text);
    expect(el, `no <${tag}> with text "${text}"`).toBeTruthy();
    act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    return el;
  }

  // Dispatch 2026-11-10, IA redesign -- this test used to assert the OPPOSITE (Table is the
  // default), by design at the time (see this file's own `mount()` helper, which now forces
  // `initialView: 'table'` for every OTHER test in this describe block so they can keep asserting
  // Table's own content without re-proving the default on every one of them). This is the one test
  // that owns verifying the real, unforced default -- mounted with NO initialView override, same
  // as every actual caller (panel-registry.js passes no such prop).
  it('defaults to the Command Center view (the dashboard), not Table -- Table is still one click away via the toggle, never removed', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn() })); });
    await flush(container);
    // Command Center content (its Employee Watchlist IS its own <table>, and its own KPI strip
    // has a "Total Signals" tile, so "Signals" alone isn't a safe discriminator -- the real tell
    // is the rule/signal-filter row, which only Table/Briefing render, never Command Center).
    expect(container.textContent).toMatch(/Employee Watchlist/);
    expect(container.textContent).not.toMatch(/Min signals:/);
    // Table is reachable, unchanged -- clicking it still shows the real sortable table.
    clickByText('button', '🗂 Table');
    await flush(container);
    expect(container.querySelector('table')).toBeTruthy();
    expect(container.textContent).toMatch(/Min signals:/);
  });

  it('switching to Briefing renders a plain-English decision sentence per flagged signal, not the raw table', async () => {
    await mount();
    clickByText('button', '🩺 Briefing');
    await flush(container);
    // buildDecisionSentence's own real "mult" branch (fires because baselineContext.mean is set):
    // value 50 is 5.0x baselineContext.mean 10 -> "runs about 5.0× the personal average — 50.00
    // per $1,000 drawer sales against a typical 10.00 per $1,000 drawer sales. Next: ..."
    expect(container.textContent).toMatch(/runs about 5\.0× the personal average/);
    expect(container.textContent).toMatch(/Next: Pull the flagged employee's drawer-count photos\./);
  });

  it('the district health grid ranks both stores, worst first, and a tile click narrows scope to that store (the grid then disappears)', async () => {
    await mount();
    clickByText('button', '🩺 Briefing');
    await flush(container);
    expect(container.textContent).toMatch(/Store health, this scope/);
    const store2Tile = [...container.querySelectorAll('button')].find(b => b.textContent.match(/0000002/));
    expect(store2Tile).toBeTruthy();
    act(() => { store2Tile.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    // Scope is now a single store -- the grid hides itself (nothing to rank against), per
    // SecurityHealthGrid's own render-call-site gate (scope.level !== 'store').
    expect(container.textContent).not.toMatch(/Store health, this scope/);
  });

  it('"Rule out first" and "Show the math" drawers toggle real rule/finding data, not placeholders', async () => {
    await mount();
    clickByText('button', '🩺 Briefing');
    await flush(container);
    clickByText('button', 'Rule out first');
    expect(container.textContent).toMatch(/register malfunction/);
    expect(container.textContent).toMatch(/new hire training week/);
    clickByText('button', 'Show the math');
    expect(container.textContent).toMatch(/value: 50.00 per \$1,000 drawer sales/);
    expect(container.textContent).toMatch(/mean 10\.00, stdev 5\.00, n 8/);
  });

  it('a rule with no false_positives never offers a "Rule out first" drawer', async () => {
    await mount();
    clickByText('button', '🩺 Briefing');
    await flush(container);
    // Scope to the LABOR-001 store alone so only its card (no false_positives) is on screen.
    const store2Tile = [...container.querySelectorAll('button')].find(b => b.textContent.match(/0000002/));
    act(() => { store2Tile.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    clickByText('button', '🕐 Labor');
    await flush(container);
    const ruleOutButtons = [...container.querySelectorAll('button')].filter(b => b.textContent === 'Rule out first');
    expect(ruleOutButtons.length).toBe(0);
  });

  it('case tracking (Mark investigated / Escalate) is offered on a Briefing card too, same as Table', async () => {
    await mount();
    clickByText('button', '🩺 Briefing');
    await flush(container);
    expect([...container.querySelectorAll('button')].some(b => b.textContent === '✓ Mark investigated')).toBe(true);
    expect([...container.querySelectorAll('button')].some(b => b.textContent === '⬆ Escalate')).toBe(true);
  });
});

// dispatch 2026-11-10 follow-on -- drift/trajectory detection (the deep-dive doc's own §4). Same
// scaffolding as the Briefing-view describe block above (RULES/FINDINGS/mount/clickByText/flush),
// extended with loadSecurityFindingsRecentHistoryForKeysMock -- the ONE new network call this
// phase adds, fired only once the Briefing view is open. These tests render the REAL SecurityPanel
// end to end (never the engine in isolation) per this repo's own "would this verification still
// pass if reverted" rule -- a revert of the panel's wiring (not just security-drift.js itself)
// must fail these.
describe('SecurityPanel — drift/trajectory (dispatch 2026-11-10 follow-on)', () => {
  let container, root;
  const RULES = [
    {
      ruleId: 'CASH-001', domain: 'cash', method: 'Cash drawer over/short rate',
      description: 'How much cash is over or short at the drawer.', baselineType: 'personal',
      logicType: 'z-score', windowDays: 28, severity: 3, active: true,
      investigationAction: 'Pull the flagged employee\'s drawer-count photos.', falsePositives: [],
    },
    {
      ruleId: 'LABOR-001', domain: 'labor', method: 'Post-termination punch edit',
      description: 'A punch edited after the employee\'s own termination date.', baselineType: 'none',
      logicType: 'threshold', windowDays: 28, severity: 5, active: true,
      investigationAction: 'Pull the edit detail.', falsePositives: [],
    },
  ];
  // Alice's CURRENT (latest) window -- flagged, z-score magnitude (510-10)/5 = 100. Deliberately
  // large (matching the real scale v5.726's HEALTH_SCORE_SCALE=0.1 recalibration measured --
  // real per-store raw contribution sums ran 45.00-1,480.40, not single-digit z-scores) so the
  // raw score sits well under the 100 clamp at the REAL scale -- a fixture scaled for the old,
  // superseded scale=8 world would either saturate the clamp or round to 0-1 at scale=0.1,
  // either way making the "drift raises the score" test below meaningless regardless of whether
  // the wiring is right.
  const FINDINGS = [
    {
      id: 'find-cash-alice', empToken: 'tok-alice', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: true,
      value: 510, thresholdUsed: 5, windowStart: '2026-07-01', windowEnd: '2026-07-28',
      computedAt: '2026-07-29T10:00:00Z',
      baselineContext: { mean: 10, stdev: 5, n: 8 }, explanation: [], exonerationShare: null,
    },
    {
      id: 'find-labor-bob', empToken: 'tok-bob', wrin: null, loc: '0000002', ruleId: 'LABOR-001', pass: true,
      value: 2, thresholdUsed: 1, windowStart: '2026-07-01', windowEnd: '2026-07-28',
      computedAt: '2026-07-29T10:00:00Z',
      baselineContext: {}, explanation: [], exonerationShare: null,
    },
  ];
  // Alice's REAL 4-window history (oldest -> newest), as only the base-table bulk fetch (never the
  // latest view) would carry it -- z-score magnitude rises 25 -> 50 -> 75 -> 100, monotonically,
  // a clean 4x relative rise well past DRIFT_MIN_RELATIVE_RISE=0.15 -- classifies 'worsening'.
  // The LAST entry matches FINDINGS' own alice row exactly (same value/mean/stdev/windowEnd), so
  // this is one real, continuous trajectory, not two disagreeing sources.
  const ALICE_HISTORY = [
    { empToken: 'tok-alice', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: false, value: 135, thresholdUsed: 5, windowStart: '2026-06-01', windowEnd: '2026-06-28', computedAt: '2026-06-29T10:00:00Z', baselineContext: { mean: 10, stdev: 5, n: 8 }, explanation: [] },
    { empToken: 'tok-alice', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: false, value: 260, thresholdUsed: 5, windowStart: '2026-06-08', windowEnd: '2026-07-05', computedAt: '2026-07-06T10:00:00Z', baselineContext: { mean: 10, stdev: 5, n: 8 }, explanation: [] },
    { empToken: 'tok-alice', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: false, value: 385, thresholdUsed: 5, windowStart: '2026-06-15', windowEnd: '2026-07-12', computedAt: '2026-07-13T10:00:00Z', baselineContext: { mean: 10, stdev: 5, n: 8 }, explanation: [] },
    { empToken: 'tok-alice', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: true, value: 510, thresholdUsed: 5, windowStart: '2026-07-01', windowEnd: '2026-07-28', computedAt: '2026-07-29T10:00:00Z', baselineContext: { mean: 10, stdev: 5, n: 8 }, explanation: [] },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadSecurityFindingsMock.mockReset().mockResolvedValue(FINDINGS);
    loadSecurityRulesMock.mockReset().mockResolvedValue(RULES);
    loadGmIdentityRevealEnabledMock.mockReset().mockResolvedValue(true);
    loadSecurityFindingActionsForFindingsMock.mockReset().mockResolvedValue([]);
    loadSecurityFindingsForSubjectMock.mockReset().mockResolvedValue([]);
    logAppAccessMock.mockClear();
    // Bob gets only his OWN single current row back (insufficient history for a drift call,
    // same as a real subject the daily batch has only run once for) -- Alice gets her real
    // 4-window rising trajectory. A real caller would scope this per rule_id; the mock just
    // returns the union since the panel itself does the grouping-by-key, not this fetch.
    loadSecurityFindingsRecentHistoryForKeysMock.mockReset().mockResolvedValue([...ALICE_HISTORY, FINDINGS[1]]);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  async function mountBriefing() {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const briefingBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '🩺 Briefing');
    act(() => { briefingBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
  }

  it('fetches drift history only once the Briefing view is open, scoped to the real candidate set (both currently-flagged subjects, by loc/ruleId/token)', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    // Table view is forced here via initialView -- no drift fetch yet.
    expect(loadSecurityFindingsRecentHistoryForKeysMock).not.toHaveBeenCalled();
    const briefingBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '🩺 Briefing');
    act(() => { briefingBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(loadSecurityFindingsRecentHistoryForKeysMock).toHaveBeenCalledTimes(1);
    const candidates = loadSecurityFindingsRecentHistoryForKeysMock.mock.calls[0][0];
    expect(candidates).toEqual(expect.arrayContaining([
      { loc: '0000001', ruleId: 'CASH-001', empToken: 'tok-alice', wrin: null },
      { loc: '0000002', ruleId: 'LABOR-001', empToken: 'tok-bob', wrin: null },
    ]));
  });

  it('a narrative card for a subject rising across its real history shows the "Escalating" badge, not just the existing chronic/new trend line', async () => {
    await mountBriefing();
    const escalating = [...container.querySelectorAll('span')].find(s => s.textContent === 'Escalating');
    expect(escalating, container.textContent).toBeTruthy();
  });

  it('a subject with only one real window on file (too little history for a trend either way) shows "First flag", never "Escalating"', async () => {
    await mountBriefing();
    // Bob's card is on the Labor domain tab, not the default Cash one.
    const laborTab = [...container.querySelectorAll('button')].find(b => b.textContent === '🕐 Labor');
    act(() => { laborTab.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    const laborPill = [...container.querySelectorAll('span')].find(s => s.textContent === 'LABOR-001');
    expect(laborPill, container.textContent).toBeTruthy();
    const firstFlag = [...container.querySelectorAll('span')].find(s => s.textContent === 'First flag');
    expect(firstFlag, container.textContent).toBeTruthy();
    // Bob's own card must not ALSO carry Alice's badge -- a loose "some Escalating badge exists
    // somewhere" assertion would pass even if the keying were wrong and every card showed the
    // same badge, since this tab only shows Bob's card at all (domain-filtered).
    expect(container.textContent).not.toMatch(/Escalating/);
  });

  it('the district grid shows a real ↑ worsening arrow on Alice\'s store once drift history resolves, never before', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const briefingBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '🩺 Briefing');
    act(() => { briefingBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    // Immediately after the click, React has not yet committed the resolved drift fetch --
    // the grid must render Phase 1's own tiles with no arrow rather than a fabricated one.
    expect(container.querySelector('[title^="Trend:"]')).toBeFalsy();
    await flush(container);
    const arrow = container.querySelector('[title="Trend: worsening"]');
    expect(arrow, container.textContent).toBeTruthy();
    expect(arrow.textContent).toBe('↑');
  });

  // Reads a health-grid tile's own score number precisely -- the tile's digits run together with
  // no separator in plain textContent (loc "0000001" immediately followed by the score, e.g.
  // "0000001" + "48" = "000000148"), so a naive /\d+/ match on the WHOLE tile grabs the loc, not
  // the score. The score lives in its own dedicated child <div> (SecurityHealthGrid's own
  // fontSize:19/fontWeight:800 element), which carries NOTHING but the number.
  function tileScore(tile) {
    // tile.children[0] is the store-name div ("0000001" -- itself all digits for this fixture's
    // synthetic loc, so a plain "first pure-digit div" search would wrongly grab IT instead of
    // the real score). The score lives in the first child of the SECOND top-level div (the
    // flex wrapper SecurityHealthGrid wraps the score + optional drift arrow in).
    const scoreDiv = tile.children[1]?.children[0];
    expect(scoreDiv, tile.outerHTML).toBeTruthy();
    return Number(scoreDiv.textContent.trim());
  }

  it('the drift term raises Alice\'s store score above what the static rule alone would produce', async () => {
    // Same fixture, but with an EMPTY drift history -- isolates the Phase-1-only score.
    loadSecurityFindingsRecentHistoryForKeysMock.mockReset().mockResolvedValue([]);
    await mountBriefing();
    const phase1Tile = [...container.querySelectorAll('button')].find(b => b.textContent.match(/0000001/));
    const phase1Score = tileScore(phase1Tile);
    expect(phase1Score).toBe(30); // severity 3 × magnitude 100 × HEALTH_SCORE_SCALE 0.1 = 30, well under the 100 clamp

    act(() => { root.unmount(); });
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadSecurityFindingsRecentHistoryForKeysMock.mockReset().mockResolvedValue([...ALICE_HISTORY, FINDINGS[1]]);
    await mountBriefing();
    const driftTile = [...container.querySelectorAll('button')].find(b => b.textContent.match(/0000001/));
    const driftScore = tileScore(driftTile);
    // + severity 3 × latest magnitude 100 × DRIFT_CONFIRMED_WEIGHT 0.5 = 150 raw -> ×0.1 = +15
    expect(driftScore).toBe(45);
    expect(driftScore).toBeGreaterThan(phase1Score);
  });

  // dispatch 2026-11-10 follow-on -- persistence, reusing the SAME driftHistory fetch (see
  // security-persistence.js's own header). Carol's history is deliberately FLAT (same magnitude
  // every window, not rising) so drift classifies 'flat' and contributes 0 -- isolating
  // persistence's own additive term the same way the drift test above isolates drift's.
  it('the persistence term raises a chronic subject\'s store score, reusing the drift fetch rather than a second query', async () => {
    const CAROL_FINDING = {
      id: 'find-cash-carol', empToken: 'tok-carol', wrin: null, loc: '0000003', ruleId: 'CASH-001', pass: true,
      value: 60, thresholdUsed: 5, windowStart: '2026-07-01', windowEnd: '2026-07-28',
      computedAt: '2026-07-29T10:00:00Z', baselineContext: { mean: 10, stdev: 5, n: 8 }, explanation: [], exonerationShare: null,
    };
    // 7 consecutive flagged windows, magnitude flat at (60-10)/5=10 throughout -- extra beyond
    // PERSISTENCE_MIN_WINDOWS(3) is 4; 3×10×0.25×4=30 raw, capped at PERSISTENCE_BONUS_CAP(20).
    const CAROL_WINDOW_ENDS = ['2026-06-08', '2026-06-15', '2026-06-22', '2026-06-29', '2026-07-06', '2026-07-13', '2026-07-28'];
    const CAROL_CHRONIC_HISTORY = CAROL_WINDOW_ENDS.map(windowEnd => ({
      empToken: 'tok-carol', wrin: null, loc: '0000003', ruleId: 'CASH-001', pass: true,
      value: 60, thresholdUsed: 5, windowStart: windowEnd, windowEnd, computedAt: windowEnd + 'T10:00:00Z',
      baselineContext: { mean: 10, stdev: 5, n: 8 }, explanation: [],
    }));
    loadSecurityFindingsMock.mockReset().mockResolvedValue([...FINDINGS, CAROL_FINDING]);
    // Same fixture, but with an EMPTY drift/persistence history -- isolates the Phase-1-only score
    // (same two-mount isolation strategy the drift test above uses).
    loadSecurityFindingsRecentHistoryForKeysMock.mockReset().mockResolvedValue([]);
    await mountBriefing();
    const phase1Tile = [...container.querySelectorAll('button')].find(b => b.textContent.match(/0000003/));
    const phase1Score = tileScore(phase1Tile);
    expect(phase1Score).toBe(3); // severity 3 × magnitude 10 × 0.1 = 3

    act(() => { root.unmount(); });
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadSecurityFindingsRecentHistoryForKeysMock.mockReset().mockResolvedValue(CAROL_CHRONIC_HISTORY);
    await mountBriefing();
    const chronicTile = [...container.querySelectorAll('button')].find(b => b.textContent.match(/0000003/));
    const chronicScore = tileScore(chronicTile);
    expect(chronicScore).toBe(5); // + capped persistence bonus 20 raw -> (30+20)×0.1 = 5
    expect(chronicScore).toBeGreaterThan(phase1Score);
    // One fetch covers BOTH drift and persistence -- never a second network round-trip for the
    // same candidate set.
    expect(loadSecurityFindingsRecentHistoryForKeysMock).toHaveBeenCalledTimes(1);
  });

  it('the Command Center view also triggers the drift/persistence history fetch, not just Briefing', async () => {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    expect(loadSecurityFindingsRecentHistoryForKeysMock).not.toHaveBeenCalled();
    const commandBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '🖥 Command Center');
    act(() => { commandBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    expect(loadSecurityFindingsRecentHistoryForKeysMock).toHaveBeenCalledTimes(1);
  });
});

// dispatch 2026-11-10 -- Command Center: the cross-domain view, rendered through the REAL panel
// end to end (never the pure functions in isolation) per this repo's own "would this verification
// still pass if reverted" rule -- a revert of the panel's wiring (the view toggle, the render
// block, the bulk case-action fetch) must fail these even though the pure functions above would
// still pass unchanged.
describe('SecurityPanel — Command Center (dispatch 2026-11-10)', () => {
  let container, root;
  const RULES = [
    { ruleId: 'CASH-001', domain: 'cash', method: 'Cash drawer over/short rate', description: 'desc', baselineType: 'personal', logicType: 'ratio', windowDays: 28, severity: 3, active: true, investigationAction: 'act' },
    { ruleId: 'LABOR-001', domain: 'labor', method: 'Post-termination punch edit', description: 'desc', baselineType: 'none', logicType: 'threshold', windowDays: 28, severity: 5, active: true, investigationAction: 'act' },
    { ruleId: 'INV-001', domain: 'inventory', method: 'Item TvA variance rate', description: 'desc', baselineType: 'store', logicType: 'ratio', windowDays: 90, severity: 3, active: false, investigationAction: 'act' },
  ];
  // Alice converges on two domains (the strongest signal) at store 1; Bob is a single signal at
  // store 2; the WRIN finding is item-level (no empToken) and must never appear as a "person" row.
  const FINDINGS = [
    { id: 'find-cash-alice', empToken: 'tok-alice', wrin: null, loc: '0000001', ruleId: 'CASH-001', pass: true, value: 50, thresholdUsed: 5, windowStart: '2026-10-01', windowEnd: '2026-10-28', computedAt: '2026-10-29T00:00:00Z', baselineContext: {}, explanation: [], exonerationShare: null },
    { id: 'find-labor-alice', empToken: 'tok-alice', wrin: null, loc: '0000001', ruleId: 'LABOR-001', pass: true, value: 1, thresholdUsed: 1, windowStart: '2026-10-01', windowEnd: '2026-10-28', computedAt: '2026-10-29T00:00:00Z', baselineContext: {}, explanation: [], exonerationShare: null },
    { id: 'find-cash-bob', empToken: 'tok-bob', wrin: null, loc: '0000002', ruleId: 'CASH-001', pass: true, value: 20, thresholdUsed: 5, windowStart: '2026-10-01', windowEnd: '2026-10-28', computedAt: '2026-10-29T00:00:00Z', baselineContext: {}, explanation: [], exonerationShare: null },
    { id: 'find-inv-item', empToken: null, wrin: 'WRIN-1', loc: '0000001', ruleId: 'INV-001', pass: true, value: 30, thresholdUsed: 20, windowStart: '2026-10-01', windowEnd: '2026-10-28', computedAt: '2026-10-29T00:00:00Z', baselineContext: {}, explanation: [], exonerationShare: null },
  ];

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    loadSecurityFindingsMock.mockReset().mockResolvedValue(FINDINGS);
    loadSecurityRulesMock.mockReset().mockResolvedValue(RULES);
    loadGmIdentityRevealEnabledMock.mockReset().mockResolvedValue(true);
    loadSecurityFindingActionsForFindingsMock.mockReset().mockResolvedValue([
      { id: 'act-1', findingId: 'find-cash-alice', action: 'escalated', note: null, createdByRole: 'admin', createdAt: '2026-10-30T00:00:00Z' },
    ]);
    rpcMock.mockReset().mockResolvedValue({
      data: [
        { token: 'tok-alice', employee_name: 'Alice Andrews' },
        { token: 'tok-bob', employee_name: 'Bob Baker' },
      ],
      error: null,
    });
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  async function mountCommand() {
    await act(async () => { root.render(React.createElement(SecurityPanel, { userRole: 'admin', onClose: vi.fn(), initialView: 'table' })); });
    await flush(container);
    const btnEl = [...container.querySelectorAll('button')].find(b => b.textContent === '🖥 Command Center');
    expect(btnEl, 'no Command Center toggle button').toBeTruthy();
    act(() => { btnEl.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
  }

  it('hides the single-domain tabs and rule/signal filters -- this view is cross-domain by design', async () => {
    await mountCommand();
    // The domain tab BUTTON (exact text, no finding count) is gone; the domain breakdown CARD
    // legitimately reuses the same DOMAIN_TAB_LABEL text for its own heading, so this checks the
    // tab specifically rather than the substring anywhere on screen.
    expect([...container.querySelectorAll('button')].some(b => b.textContent === '💵 Cash')).toBe(false);
    expect(container.textContent).not.toMatch(/Min signals:/);
  });

  it('renders a domain card per domain with REAL rule/finding counts, even for inventory (item-level, zero watchlist rows)', async () => {
    await mountCommand();
    expect(container.textContent).toMatch(/By Security Domain/);
    expect(container.textContent).toMatch(/CASH-001/);
    // Inventory has one open finding (the WRIN one) even though it contributes no watchlist row.
    const inventoryCardText = container.textContent;
    expect(inventoryCardText).toMatch(/📦 Inventory/);
  });

  it('Employee Watchlist: Alice converges across two domains (flaggedCount 2), Bob is a single signal, the WRIN item never appears as a person', async () => {
    await mountCommand();
    expect(container.textContent).toMatch(/Alice Andrews/);
    expect(container.textContent).toMatch(/Bob Baker/);
    expect(container.textContent).toMatch(/🔗 2 signals/);
    expect(container.textContent).not.toMatch(/WRIN-1/);
  });

  it('Case Queue tallies the one logged action correctly: 1 escalated, 2 still open, no fabricated "Investigating" bucket', async () => {
    await mountCommand();
    expect(container.textContent).toMatch(/Case Queue — 3 open findings/);
    expect(container.textContent).toMatch(/Escalated · 1/);
    expect(container.textContent).toMatch(/Flagged · 2/);
    expect(container.textContent).not.toMatch(/Investigating/);
  });

  // Dispatch 2026-11-10, IA redesign -- "Review →" now lands on the new Subject Brief view (Tier
  // 2, between the dashboard and the raw table) instead of jumping straight into Table. Table is
  // still reachable, unchanged, one click further via Brief's own gateway link -- never a dead end,
  // just no longer the FIRST thing a reviewer sees.
  it('"Review →" on Alice\'s row lands on her Subject Brief, scoped and ready -- Table is still one click further, never a dead end', async () => {
    await mountCommand();
    const reviewBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Review →');
    expect(reviewBtn).toBeTruthy();
    act(() => { reviewBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    // Brief view: Alice's own name and real decision sentence, no domain tabs/rule chrome, no
    // sibling subjects' rows.
    expect(container.textContent).toMatch(/Alice Andrews/);
    // dispatch 2026-11-10 follow-on -- the plain "N independent rules agree" count badge was
    // replaced by a severity/persistence tier badge (subjectTierMeta) matching the approved
    // mockup's "High — chronic, multi-rule" wording; the underlying "2+ rules" fact still shows,
    // just as "multi-rule" in the descriptor list rather than its own sentence.
    expect(container.textContent).toMatch(/High.*multi-rule/);
    expect(container.textContent).not.toMatch(/Signals/); // Table's own sort-header vocabulary
    // The gateway link into the full table is present and still works.
    const openTableLink = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Open the full data engine') || b.textContent.includes('sort, filter, export'));
    expect(openTableLink).toBeTruthy();
    act(() => { openTableLink.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await flush(container);
    // Table view, scoped to Alice's store and expanded on her, exactly as before this redesign.
    expect(container.textContent).toMatch(/Signals/);
    expect(container.textContent).toMatch(/Alice Andrews/);
  });
});
