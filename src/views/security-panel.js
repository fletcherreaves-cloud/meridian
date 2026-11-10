// @ts-nocheck
// ── The Security panel — dispatch #43, Phase 1 (read-only investigation surface) ────────────────
// Owner-requested 2026-08-20: "We should build out the security panel UI... an entire modal to
// house security events." security_findings had ZERO references anywhere in src/ before this --
// the batch job (dispatches #39/#40/#42) writes findings; nothing read them. The only way to see
// one was a SQL query pasted into the Supabase console.
//
// Grouped by SUBJECT, not by rule (the dispatch's own central design call): a subject flagged on
// three of four independent signals is a lead; flagged on one is noise, and that convergence is
// invisible in the batch job's natural rule-major output. Showing every verdict per subject (not
// just failures) also implements plan §1 principle 4 (exoneration) for free -- the rules a subject
// PASSED are visible right next to the one they didn't.
//
// Permission is gated to the SAME tier security_findings' RLS enforces (admin/supervisor always,
// manager only when org_config.gm_identity_reveal_enabled) -- RLS returns [] to an unauthorized
// role, indistinguishable from "no findings" on the wire, so this panel never lets an empty read
// stand in for a permission check. securityPanelAccess() is the one place that decision is made.
import * as React from 'react';
import { supabase, logAppAccess } from '../lib/supabase.js';
import {
  loadSecurityFindings, loadSecurityRules, loadGmIdentityRevealEnabled,
  loadQsrVarianceStat, loadQsrVarianceHistoryAll, loadAuditRowsWindow,
  loadQsrSecurityEventsForSubject, loadSecurityFindingsForSubject,
  loadSecurityFindingActionsForFindings, saveSecurityFindingAction,
  loadSecurityFindingsRecentHistoryForKeys,
} from '../lib/supabase.js';
import { INV_ORG_COORDS, STORE_NAMES, supervisorOf } from '../constants.js';
import { RevealName } from './store-analytics.js';
import { addD, fmtDI } from '../utils/date.js';
import {
  monthsBack, assembleInventoryDrilldown, assembleCashDrilldown,
  classifySubjectShape, buildSubjectTimeline, corroboratingFlags,
} from '../engine/security-drilldown.js';
import { playbookForRule } from '../engine/security-playbook.js';
// dispatch 2026-11-10 -- Phase 1 of the owner's Security Health redesign (the "Loss Prevention
// Briefing" + "Security Health Dashboard" design concepts): a minimal per-store health score and
// the narrative-card/district-grid view built on it. See security-health.js's own header for
// exactly what this phase does and deliberately does not compute.
import { storeHealthList } from '../engine/security-health.js';
// dispatch 2026-11-10 follow-on -- drift/trajectory detection (the deep-dive doc's own §4, "Red
// flags on drift, not just a threshold breach"), additive to the Phase 1 score above. See
// security-drift.js's own header for why this is a separate file (one-directional import, never
// circular with security-health.js) and exactly what population it is bounded to.
import {
  selectDriftCandidates, computeDriftRollup, driftDirectionForStore, driftKeyFor,
  driftTrendBadge, TREND_BADGE_META, DRIFT_LOOKBACK_WINDOWS,
} from '../engine/security-drift.js';
// dispatch 2026-11-10 follow-on -- persistence (the deep-dive doc's own §3 `persistence_multiplier`
// score term). Deliberately reuses the SAME multi-window `driftHistory` fetched above for drift --
// see security-persistence.js's own header for why this is a separate concept/file from drift, and
// why it needs no second bulk query.
import { computePersistenceRollup } from '../engine/security-persistence.js';
// dispatch #100 -- the date-range control reuses the shared DateRangeControl (issue #126 Spine 1)
// rather than a bespoke date-input pair, matching this repo's "don't invent a new pattern"
// standing rule.
// dispatch #120 -- the hand-rolled State/Org/Store pill rows (~30 pills flat, unusable on mobile)
// are replaced by the shared LocationSelector in mode:'progressive' (dispatch #104), which reveals
// one tier at a time: States first, picking a State reveals its Patches, picking a Patch reveals
// its Stores. See scopeToSelectorValue/selectorValueToScope below for the translation this panel
// needs since it keeps its own {level,value} scope shape (panel-contract.md §3) and the Org/Patch
// decision recorded there.
import { DateRangeControl, DATE_RANGE_PRESETS, LocationSelector } from '../components/PanelControls.js';
import { printHtml } from '../utils/print-html.js';

// Dispatch #143 -- ExportDropdown lives in store-dash.js, a 145 KB module this already-lazyPanel()'d
// panel (App.js) would otherwise drag into ITS OWN chunk on every open, before Export is ever
// clicked. React.lazy defers the actual import() to first render of the Export control itself,
// matching the established pattern (record-day.js/dt-speedofservice.js, dispatch #130/#136).
const LazyExportDropdown = React.lazy(() =>
  import('./store-dash.js').then(m => ({ default: m.ExportDropdown }))
);

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

// Local HTML-escaper for the print report only -- same tiny local pattern every print/export
// builder in this codebase repeats (record-day.js, dt-speedofservice.js, analytics.js, etc.)
// rather than a shared import, since it's a two-line function, not a module.
function esc(s) { return String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c])); }

// ── Pure logic — exported and tested independently of any rendering ─────────────────────────────

// admin/owner/area_supervisor always allowed, matching security_findings' RLS exactly. gm and
// manager allowed ONLY when the caller has already confirmed org_config.gm_identity_reveal_enabled
// (loaded separately, async -- this function itself makes no network call, so it can be used as a
// pure gate both for the initial "should I even bother checking" decision and the final verdict
// once that flag is in). Everything else (vp/do/om/sm_am_dm/undefined) is denied.
// ⚠️ CORRECTED (RBAC audit, 2026-09-16) -- this used to check the literal string 'supervisor' and
// exclude 'owner' entirely, on the assumption (from an earlier, pre-dispatch-#148 CLAUDE.md draft)
// that profiles.role only carried 3 real values (admin/supervisor/manager). The live DB constraint
// (supabase/schema.sql's profiles_role_check) has carried 9 real ids since dispatch #148 --
// 'area_supervisor' (not 'supervisor'), plus 'owner' as a second level-1 (top-tier, same as admin)
// role -- src/engine/permissions.js's DEFAULT_ROLES is the source of truth. Neither a real
// area_supervisor-role profile nor a real owner-role profile could ever pass this check before.
// Currently dormant (the one live account is role='admin'), fixed opportunistically as part of the
// broader RBAC audit rather than left for a real account to hit it first. security_findings' RLS
// policy (supabase/schema-security-findings-role-fix.sql) is updated in the same pass -- see this
// function's own "must never be looser than that policy" rule above, still true, now against the
// corrected policy.
// ⚠️ CORRECTED AGAIN (owner decision, 2026-10-28) -- 'gm' used to be lumped in with every other
// denied role, which was wrong: the whole point of org_config.gm_identity_reveal_enabled is to let
// a GM see real names. The two existing 'manager'-role accounts are the owner's own, kept in this
// same gated branch deliberately (his explicit "let me still override access in settings" -- the
// toggle is that override, and narrowing this to 'gm' alone would have silently revoked access his
// own accounts already had). 'gm' is now named explicitly rather than falling through to the
// catch-all deny, which is the actual fix: going forward a real GM account is recognized by its own
// role id, not mistaken for one of the other manager-ladder tiers (sm_am_dm/om/do/vp), which still
// correctly fall through to denied here.
export function securityPanelAccess(userRole, gmRevealEnabled) {
  if (userRole === 'admin' || userRole === 'owner' || userRole === 'area_supervisor') return 'allowed';
  if (userRole === 'manager' || userRole === 'gm') return gmRevealEnabled ? 'allowed' : 'denied';
  return 'denied';
}

// pass=true -> 'flagged', pass=false -> 'clear' (a real, definite non-flag -- the rule DID
// evaluate), pass=null -> 'undetermined' (an honest non-verdict: no exposure, no baseline,
// insufficient population, below the exposure floor, ...). Rendering null as clear is a
// correctness bug (dispatch #43 §3) -- this is the one place that mapping happens.
//
// dispatch #45 §B: a lifecycle-classified finding (deactivated/obsolete/new item) takes priority
// over pass/fail here -- it must read as neither a security flag nor an exoneration, since it is a
// data-hygiene signal (fix the item's setup), not a security verdict about a person or item. This
// function is the ONE place that routing decision gets made, same discipline as the pass mapping.
export function verdictState(pass, lifecycleCategory) {
  if (lifecycleCategory) return 'hygiene';
  if (pass === true) return 'flagged';
  if (pass === false) return 'clear';
  return 'undetermined';
}

const VERDICT_META = {
  flagged:      { label: 'Flagged',      color: 'var(--crit,#ef4444)' },
  clear:        { label: 'Clear',        color: 'var(--ok,#10b981)' },
  undetermined: { label: 'No verdict',   color: 'var(--text3)' },
  hygiene:      { label: 'Hygiene',      color: 'var(--accent,#f5bc00)' },
};

const LIFECYCLE_LABEL = { deactivated: 'Deactivated item', obsolete: 'Obsolete item', new: 'New item' };

// Groups mapped security_findings rows (src/lib/supabase.js's loadSecurityFindings() shape) by
// (loc, subject) -- an employee-token or a WRIN, never both (the DB's own check constraint). One
// group per subject carries EVERY rule's LATEST verdict for them, sorted by how many rules agree
// (flaggedCount desc), then by the worst flagged value -- convergence across independent signals
// first, since that is the actual lead a loss-prevention system exists to surface.
//
// dispatch #46 §C item 1 -- the batch job runs daily with a ROLLING window, so a subject can
// legitimately carry more than one (rule, window) row over time (the finding table's own unique
// key is (rule, loc, window_start, window_end, subject), not (rule, subject) alone). `verdicts`
// dedupes to each rule's MOST RECENT window (by computedAt) -- what the chips/tally/detail render
// is always today's answer, never a stale duplicate chip for the same rule. Every window for every
// rule is preserved separately in `historyByRule` (ruleId -> windows sorted oldest-to-newest) so a
// trend view can tell chronic from new; see classifySubjectTrend() below.
// One subject's per-rule window history from a flat array of its own finding rows -- oldest to
// newest, keyed by ruleId. Factored out (this dispatch) so groupFindingsBySubject's bulk pass and
// the lazy per-subject fetch (loadSecurityFindingsForSubject, called on row-expand) build the
// IDENTICAL shape SubjectDetail/SubjectHistory already consume -- one history-shaping rule, not two
// that can drift.
export function buildHistoryByRule(findingsForOneSubject) {
  const byRule = new Map();
  for (const f of findingsForOneSubject) {
    const entry = {
      id: f.id, ruleId: f.ruleId, pass: f.pass, value: f.value, thresholdUsed: f.thresholdUsed,
      baselineContext: f.baselineContext || {}, explanation: f.explanation || [],
      windowStart: f.windowStart, windowEnd: f.windowEnd, computedAt: f.computedAt,
      lifecycleCategory: f.lifecycleCategory || null, exonerationShare: f.exonerationShare ?? null,
    };
    if (!byRule.has(f.ruleId)) byRule.set(f.ruleId, []);
    byRule.get(f.ruleId).push(entry);
  }
  const historyByRule = {};
  for (const [ruleId, windows] of byRule) {
    windows.sort((a, b) => (a.windowEnd || '').localeCompare(b.windowEnd || '') || (a.computedAt || '').localeCompare(b.computedAt || ''));
    historyByRule[ruleId] = windows;
  }
  return historyByRule;
}

export function groupFindingsBySubject(findings) {
  const bySubject = new Map();
  for (const f of findings) {
    const subjectType = f.empToken ? 'emp' : 'wrin';
    const subjectId = f.empToken || f.wrin;
    if (!subjectId || !f.loc) continue; // a malformed row (neither subject set) can't be grouped -- skip, don't crash
    const key = f.loc + '::' + subjectType + ':' + subjectId;
    if (!bySubject.has(key)) {
      bySubject.set(key, { key, loc: f.loc, subjectType, empToken: f.empToken || null, wrin: f.wrin || null, rows: [] });
    }
    bySubject.get(key).rows.push(f);
  }
  const out = [...bySubject.values()].map(g => {
    const historyByRule = buildHistoryByRule(g.rows);
    const verdicts = Object.values(historyByRule).map(windows => windows[windows.length - 1]); // latest window is what renders as THE verdict
    // dispatch #45 §B: a lifecycle-classified verdict is EXCLUDED from the security tally
    // (flaggedCount/clearCount/worstValue/sort) -- it routes to a distinct hygiene lane, never
    // counted toward "how many independent signals agree" (the whole point of subject-major
    // grouping) and never contributing to the sort order a real convergence would drive. It still
    // renders (routed, not suppressed) via hygieneCount and the verdicts array itself.
    const securityVerdicts = verdicts.filter(v => !v.lifecycleCategory);
    const flaggedCount = securityVerdicts.filter(v => v.pass === true).length;
    const clearCount = securityVerdicts.filter(v => v.pass === false).length;
    const undeterminedCount = securityVerdicts.filter(v => v.pass == null).length;
    const hygieneCount = verdicts.filter(v => v.lifecycleCategory).length;
    const worstValue = securityVerdicts.filter(v => v.pass === true).reduce((m, v) => Math.max(m, v.value || 0), 0);
    const newestComputedAt = verdicts.reduce((m, v) => (!m || (v.computedAt && v.computedAt > m)) ? v.computedAt : m, null);
    return {
      key: g.key, loc: g.loc, subjectType: g.subjectType, empToken: g.empToken, wrin: g.wrin,
      verdicts, historyByRule, flaggedCount, clearCount, undeterminedCount, hygieneCount, worstValue, newestComputedAt,
    };
  });
  out.sort((a, b) => b.flaggedCount - a.flaggedCount || b.worstValue - a.worstValue);
  return out;
}

// dispatch #46 §C item 1 (named the highest-value item in the dispatch itself) -- is a flag NEW or
// CHRONIC? `history` is one rule's own windows for one subject, oldest-to-newest (groupFindings
// BySubject's historyByRule[ruleId]). Deliberately conservative: fewer than 2 distinct windows is
// NOT "new," it is "insufficient-history" -- a single data point cannot support either label, and
// claiming "new" from one window would be exactly the kind of confident-sounding wrong answer
// CLAUDE.md's standing rules warn against. As of this dispatch, EVERY real subject in production
// has exactly one window (the daily batch job has not yet run long enough to accumulate a second
// one) -- so 'insufficient-history' is the honest, expected answer today, and this function starts
// doing real work automatically as soon as tomorrow's run adds a second window, with no code
// change needed.
export function classifySubjectTrend(history) {
  if (!Array.isArray(history) || history.length < 2) return 'insufficient-history';
  const latest = history[history.length - 1];
  const prior = history.slice(0, -1);
  const priorFlagged = prior.some(w => w.pass === true);
  if (latest.pass === true) return priorFlagged ? 'chronic' : 'new';
  return priorFlagged ? 'improving' : 'clear';
}

// ── Command Center — cross-domain rollups (dispatch 2026-11-10) ─────────────────────────────────
// Every other view in this panel (Table, Briefing) is scoped to ONE domain at a time (`domain`
// state) by design -- that's the right default for investigating a specific policy, but it means
// nothing here has ever answered "which employees are flagged across MORE than one domain" or
// "what does the whole network look like right now." These five pure functions are that layer,
// built entirely on primitives that already exist (groupFindingsBySubject, scopeMatches,
// security_rules' own domain/severity fields) -- no new query, no new math, just a cross-domain
// view of data the panel already loads in full (`findings` is never domain-filtered at the fetch
// layer; only the existing `groups` memo narrows it for Table/Briefing).
export const SECURITY_DOMAINS = ['cash', 'inventory', 'labor', 'events'];

// Cross-domain subject grouping for the Employee Watchlist. Deliberately `emp`-subjects only --
// INV-001/002/003/005 key on `wrin` (an ITEM, not a person; schema-security-findings.sql's
// subject_key is `emp_token::text || '::' || wrin`, empty on whichever side doesn't apply), so an
// item-level inventory finding has no employee to attribute to a row here. INV-004 (closing
// manager, keyed on emp_token) DOES show up, same as every CASH/LABOR/EVENT rule. flaggedCount on
// each returned group is already true cross-domain convergence (groupFindingsBySubject's own
// sort), the single strongest signal this panel can show.
export function buildCommandGroups(findings, scope) {
  return groupFindingsBySubject((findings || []).filter(f => f.empToken))
    .filter(g => scopeMatches(g.loc, scope));
}

// Per-domain rollup for the "By Security Domain" cards -- every CURRENTLY FLAGGED, non-hygiene
// finding in scope, bucketed by the rule's own domain/severity (security_rules' real fields, never
// re-derived or guessed). `rules` (the full registry, active+inactive) supplies each domain's rule
// COUNT even when a domain has zero open findings right now.
export function buildDomainBreakdown(findings, rulesById, rules, scope) {
  const byDomain = {};
  for (const f of (findings || [])) {
    if (f.pass !== true || f.lifecycleCategory || !scopeMatches(f.loc, scope)) continue;
    const rule = rulesById?.[f.ruleId];
    if (!rule) continue; // defensive -- a finding for a rule no longer in the registry read
    const d = rule.domain;
    if (!byDomain[d]) byDomain[d] = { domain: d, findings: 0, low: 0, med: 0, high: 0, ruleCounts: {} };
    const row = byDomain[d];
    row.findings += 1;
    row[rule.severity >= 4 ? 'high' : rule.severity === 3 ? 'med' : 'low'] += 1;
    row.ruleCounts[f.ruleId] = (row.ruleCounts[f.ruleId] || 0) + 1;
  }
  return SECURITY_DOMAINS.map(d => {
    const row = byDomain[d] || { domain: d, findings: 0, low: 0, med: 0, high: 0, ruleCounts: {} };
    const ruleCount = (rules || []).filter(r => r.domain === d).length;
    const topEntry = Object.entries(row.ruleCounts).sort((a, b) => b[1] - a[1])[0];
    return { ...row, ruleCount, topRule: topEntry ? rulesById[topEntry[0]] : null, topRuleCount: topEntry ? topEntry[1] : 0 };
  });
}

// Top-contributing-rules Pareto for the Command Center -- same currently-flagged/non-hygiene/
// in-scope filter as buildDomainBreakdown, grouped by rule instead of domain, worst first.
export function buildTopContributingRules(findings, rulesById, scope, limit = 6) {
  const counts = {};
  for (const f of (findings || [])) {
    if (f.pass !== true || f.lifecycleCategory || !scopeMatches(f.loc, scope)) continue;
    if (!rulesById?.[f.ruleId]) continue;
    counts[f.ruleId] = (counts[f.ruleId] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([ruleId, count]) => ({ ruleId, count, rule: rulesById[ruleId] }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

// Case-status vocabulary matches security_finding_actions' real check constraint (schema-
// security-finding-actions.sql) exactly -- 'investigated_cleared'/'escalated'/'noted' are the only
// real action rows; a finding with no row yet is 'open'. There is no 'investigating' status in
// this data model and this file must never invent one.
export const CASE_STATUS_LABEL = {
  open: { label: 'Flagged — no action yet', color: 'var(--text3)' },
  noted: { label: 'Note added', color: 'var(--text3)' },
  escalated: { label: 'Escalated', color: 'var(--crit,#ef4444)' },
  investigated_cleared: { label: 'Investigated — cleared', color: 'var(--ok,#10b981)' },
};

// The latest logged action for one finding id, 'open' when none has ever been logged.
// `findingActions` is the panel's own findingId -> action[] cache, ascending by created_at (same
// shape loadSecurityFindingActionsForFindings/the existing FindingActions component already use).
export function latestCaseStatus(findingId, findingActions) {
  const list = findingActions?.[findingId];
  if (!list || !list.length) return 'open';
  return list[list.length - 1].action;
}

// Cross-domain case-queue tally -- one bucket per CURRENTLY FLAGGED, non-hygiene finding across
// every subject group passed in (buildCommandGroups' own output, or any groupFindingsBySubject
// result). Counts findings, not subjects -- a subject with two open findings in two different
// states (one escalated, one untouched) contributes to both buckets, which is the honest picture:
// the queue tracks CASES, and each finding is its own case per security_finding_actions' own
// `finding_id` foreign key.
export function tallyCaseQueue(groups, findingActions) {
  const counts = { open: 0, noted: 0, escalated: 0, investigated_cleared: 0 };
  for (const g of (groups || [])) {
    for (const v of (g.verdicts || [])) {
      if (v.pass !== true || v.lifecycleCategory || !v.id) continue;
      counts[latestCaseStatus(v.id, findingActions)] += 1;
    }
  }
  return counts;
}

// Store scope hierarchy (feedback-selector-ui-standard.md, updated by dispatch #120): All ->
// State -> Patch -> Store. The 'org' level (FL/OK mapped to emerald/mcdok) is REMOVED here --
// dispatch #120's investigation confirmed it was 1:1 redundant with 'state' for this business
// (CLAUDE.md's own canonical mapping: MCDOK=Oklahoma, Emerald Arches=Florida), so it never added
// a second independent dimension, only a second button row selecting the same store set 'state'
// already reaches. 'patch' (org.sup, the supervisor field already in INV_ORG_COORDS -- the same
// source PanelControls.js's LocationSelector itself draws its Patch tier from) replaces it with a
// genuinely finer-grained, previously-unavailable scope: two stores in the same state/org can sit
// under different supervisors, so Patch can isolate one where State/Org never could. See the PR
// body for the full before/after reasoning.
export function scopeMatches(loc, scope) {
  if (!scope || scope.level === 'all') return true;
  const org = INV_ORG_COORDS[loc] || {};
  if (scope.level === 'state') return org.state === scope.value;
  // dispatch #139 — patch resolves LIVE (supervisorOf/whoRan), falling back to the static
  // org.sup seed only for a loc the live assignment timeline doesn't cover, matching the fix in
  // PanelControls.js's buildLocationHierarchy (the same source this panel's LocationSelector
  // patch picker now draws from) so a patch picked in the UI actually matches findings here.
  if (scope.level === 'patch') return supervisorOf(loc, org.sup) === scope.value;
  if (scope.level === 'store') return loc === scope.value;
  return true;
}

// dispatch #120 -- translation at the UI boundary only (panel-contract.md §3): this panel's own
// `scope` state keeps its pre-existing {level, value} shape (in-memory only, nothing persisted,
// so there is no stored-data migration concern -- just cheap to translate at render time), while
// LocationSelector's own value shape is {level, id}. 'org' has no counterpart on either side any
// more (see scopeMatches' own comment above for why it was dropped, not just renamed).
export function scopeToSelectorValue(scope) {
  if (!scope || scope.level === 'all') return { level: 'all', id: null };
  return { level: scope.level, id: scope.value };
}
export function selectorValueToScope(value) {
  if (!value || value.level === 'all') return { level: 'all' };
  return { level: value.level, value: value.id };
}

// dispatch #100 -- the date-range control's own filtering basis. windowEnd (the security rule's
// OWN evaluation-window end date), NOT computedAt (when the batch job happened to run): this
// panel's existing subject-timeline/trend features already key off windowEnd exclusively --
// groupFindingsBySubject sorts each rule's own window history by windowEnd (computedAt is only
// the tiebreaker), and buildSubjectTimeline()/security-drilldown.js's period/trend math does the
// same -- so the new control follows the basis this file already established rather than picking
// a fresh one. range: {s,e} ISO 'YYYY-MM-DD' strings, DateRangeControl's own shape
// (src/components/PanelControls.js) -- null, or either side blank, means unbounded on that side.
// A finding with no windowEnd at all is excluded once ANY bound is set (an honest "can't place
// this on the timeline you asked for"), never silently kept.
export function windowEndInRange(windowEnd, range) {
  if (!range || (!range.s && !range.e)) return true;
  if (!windowEnd) return false;
  if (range.s && windowEnd < range.s) return false;
  if (range.e && windowEnd > range.e) return false;
  return true;
}

// dispatch #120 -- findings readability. Investigated a click-through to an "actual event" first
// (per the owner's own primary ask): RegisterAuditTab (store-analytics.js) is the only candidate
// that surfaced, and it does NOT qualify as a real navigation target for a security_findings row
// -- it reads a completely separate, manually-uploaded dataset (`ds.auditRows`, "Load a Register
// Audit YYYY-MM-DD to YYYY-MM-DD.xlsx file to activate"), has no date-range prop at all (filters
// only by `loc`, the store's ENTIRE uploaded history), and is nested inside StoreDash's tab
// switcher rather than being URL/route-addressable with a store+window to pre-scope to. Wiring a
// "go to event" link there would silently jump to an unrelated, possibly-empty dataset and imply
// a connection that doesn't exist. security-events-level detail for a finding ALREADY renders
// in-panel via SubjectEvents (loadQsrSecurityEventsForSubject, cash domain) -- that is the real
// "actual event" view, and it already exists. So the owner's own explicitly-offered fallback
// applies: a clearer table layout for the findings list, sortable by window/rule/subject.
//
// 'signals' is the SPECIAL default: with sortDir 'desc' it returns `groups` UNCHANGED --
// groupFindingsBySubject's own flaggedCount-desc/worstValue-desc order, tie-broken by worstValue
// -- rather than re-deriving that tie-break here, so the table's default view renders identically
// to the pre-table card list's order. Any other key/direction combination re-sorts on a single
// comparable value per group.
// dispatch 2026-10-12 -- shared label for the minSignals filter, now that 0 ("All") is a real
// value alongside 1+/2+/3+. 0 reads as "All (incl. clear)" rather than the nonsensical "0+".
export function minSignalsLabel(n) {
  return n === 0 ? 'All (incl. clear)' : `${n}+`;
}
export function latestWindowEnd(group) {
  const ends = (group.verdicts || []).map(v => v.windowEnd).filter(Boolean);
  return ends.length ? ends.reduce((a, b) => (b > a ? b : a)) : '';
}
export function sortFindingsForDisplay(groups, sortKey, sortDir) {
  if (!sortKey || (sortKey === 'signals' && sortDir !== 'asc')) return groups;
  const dir = sortDir === 'asc' ? 1 : -1;
  const val = (g) => {
    if (sortKey === 'signals') return g.flaggedCount;
    if (sortKey === 'subject') return (g.subjectType === 'emp' ? g.empToken : g.wrin) || '';
    if (sortKey === 'rule') {
      const ids = g.verdicts.map(v => v.ruleId).filter(Boolean).sort();
      return ids[0] || '';
    }
    if (sortKey === 'window') return latestWindowEnd(g);
    return 0;
  };
  return [...groups].sort((a, b) => {
    const av = val(a), bv = val(b);
    if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir;
    return String(av).localeCompare(String(bv)) * dir;
  });
}

// dispatch #46 §A point 3 -- "units on every number." Five live rules, five units -- a hardcoded
// map, not a derivation from logic_expression (which the panel doesn't load; deriving it would
// mean loading and re-parsing jsonb the loader already has no other reason to fetch, for a lookup
// table this small). Keyed by rule_id, not logic_type -- CASH-001/CASH-004 share a shape but not a
// unit family with INV-002 despite both being "$ per $1,000." A z-score rule's `value` still uses
// its OWN unit here; only the SIGMA threshold (rendered separately, see fmtThreshold below) is unitless.
const RULE_UNITS = {
  'CASH-001': 'per $1,000 drawer sales',
  'CASH-002': 'per 1,000 transactions',
  'CASH-003': 'per 1,000 transactions', // count-based (dispatch #44); inactive today
  'CASH-004': 'per $1,000 drawer sales',
  'INV-001':  '% variance vs. expected usage',
  'INV-002':  'per $1,000 store sales',
  // LABOR-001/002 (schema-security-rules-labor.sql) are plain threshold COUNTS, not rates -- the
  // unit names what's being counted, same as every other RULE_UNITS entry naming its own metric.
  'LABOR-001': 'post-termination edit(s)',
  'LABOR-002': 'self-approved edit(s)',
  'LABOR-003': 'per 1,000 punches',
  // EVENT-001/002/003 (schema-security-rules-events-phase1.sql) -- qsr_security_events-sourced,
  // normalized per 1,000 POS sessions worked (that table carries no sales/GC column to
  // dollar-normalize against, see memory/design-security-events-risk-rules-2026-11-09.md).
  'EVENT-001': 'per 1,000 sessions worked',
  'EVENT-002': 'per 1,000 sessions worked',
  'EVENT-003': 'per 1,000 sessions worked',
};

// dispatch #100 follow-up (owner, same-day) -- "a small brief descriptor to the pill... Cash +/-,
// Overring, Refund, Promo." A 1-3-word tag, derived MECHANICALLY from the rule's own already-
// loaded `method` (security_rules.method -- the same short plain-English name buildDecisionSentence
// and SubjectDetail already render), never a hardcoded ruleId->tag lookup -- matching this file's
// own RuleDirectory anti-hardcode discipline (a rule renamed/added in security_rules must pick up
// a correct tag with no code change). Real seeded methods (supabase/schema-security-rules*.sql):
// "Cash drawer over/short rate", "POS over-ring rate", "Manual refund / self-authorized refund
// rate", "Promo/discount rate", "Item TvA variance rate vs. expected usage", "Dollar-variance rate
// vs. store sales". Two mechanical trims, both at real word/clause boundaries (never mid-word):
//   1. cut everything from the word "rate" onward -- every current method's qualifying clause
//      ("... vs. expected usage", "... vs. store sales") lives after it and a short tag doesn't
//      need it.
//   2. if what's left is phrased "X / Y" (the same concept stated two ways, e.g. "Manual refund /
//      self-authorized refund"), keep only the first clause.
export function ruleShortTag(rule) {
  const method = (rule?.method || '').trim();
  if (!method) return null;
  let tag = method.replace(/\brate\b.*$/i, '').trim();
  const slashClause = tag.indexOf(' / ');
  if (slashClause > 0) tag = tag.slice(0, slashClause).trim();
  tag = tag.replace(/[\s/-]+$/, '').trim();
  return tag || method;
}

function fmtValue(ruleId, v) {
  if (v == null) return '—';
  const unit = RULE_UNITS[ruleId];
  return unit ? `${fNum(v)} ${unit}` : fNum(v);
}
// dispatch #46 §A point 3 -- "threshold vs. sigma... two rules on screen use the same word for
// different units." A z-score rule's threshold is ALWAYS sigma (standard deviations vs. the peer/
// store baseline), never the rule's own rate unit -- this is the one place that distinction renders.
function fmtThreshold(logicType, t) {
  if (t == null) return '—';
  return logicType === 'z-score' ? `${fNum(t)}σ` : fNum(t);
}

// dispatch #46 §B -- a decision sentence beside (never instead of) the raw metric line, per
// CLAUDE.md's standing "say the number AND the decision" voice rule. Pure, testable independent of
// rendering: takes the rule metadata already loaded (method/description/baselineType/
// investigationAction), one verdict, and a caller-resolved subject label (RevealName's own async
// reveal state lives in the component, not here -- this function never triggers a reveal).
export function buildDecisionSentence(rule, verdict, subjectLabel) {
  const state = verdictState(verdict.pass, verdict.lifecycleCategory);
  if (state === 'hygiene') {
    const label = LIFECYCLE_LABEL[verdict.lifecycleCategory] || verdict.lifecycleCategory;
    return `${subjectLabel} is marked ${label.toLowerCase()} in QSRSoft — its usage figures aren't reliable for detection right now. This is a data-hygiene fix (the item's setup), not a security question.`;
  }
  if (state === 'undetermined') {
    const why = verdict.reason || explanationReason(verdict.explanation) || 'not enough exposure in this window';
    return `Not enough data here to form a verdict — ${why}. That is different from "clear": the rule hasn't looked yet, not looked and found nothing.`;
  }
  const bc = verdict.baselineContext || {};
  const unit = RULE_UNITS[rule.ruleId] || '';
  const mult = (bc.mean && bc.mean > 0 && verdict.value != null) ? verdict.value / bc.mean : null;
  const magnitude = (mult != null && Number.isFinite(mult))
    ? `about ${mult < 10 ? mult.toFixed(1) : Math.round(mult)}× the ${rule.baselineType || 'peer'} average — ${fmtValue(rule.ruleId, verdict.value)} against a typical ${fNum(bc.mean)}${unit ? ' ' + unit : ''}`
    : `${fmtValue(rule.ruleId, verdict.value)} against a threshold of ${fNum(verdict.thresholdUsed)}${unit ? ' ' + unit : ''}`;
  const verb = state === 'flagged' ? 'runs' : 'stays';
  const action = (state === 'flagged' && rule.investigationAction) ? ` Next: ${rule.investigationAction}` : '';
  return `${subjectLabel} ${verb} ${magnitude}.${action}`;
}

// ── Rendering ─────────────────────────────────────────────────────────────────────────────────

function VerdictChip({ ruleId, active, verdict, onClick }) {
  const state = verdictState(verdict.pass, verdict.lifecycleCategory);
  const meta = VERDICT_META[state];
  const hygieneTitle = verdict.lifecycleCategory ? ` — ${LIFECYCLE_LABEL[verdict.lifecycleCategory] || verdict.lifecycleCategory}, routed to hygiene, not a security verdict` : '';
  return span({
    onClick, title: `${ruleId}${active === false ? ' (rule inactive -- historical, not current)' : ''}${hygieneTitle}`,
    style: {
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 'var(--r)',
      border: `1px solid ${meta.color}`, color: meta.color, fontSize: 11, fontWeight: 600, cursor: onClick ? 'pointer' : 'default',
      opacity: active === false ? 0.55 : 1, background: state === 'flagged' ? `${meta.color}1a` : 'transparent',
    },
  }, ruleId, active === false && ' ⏸');
}

const TREND_META = {
  chronic:               { label: 'Chronic — flagged before, still flagged', color: 'var(--crit,#ef4444)' },
  new:                    { label: 'New — first time this has flagged', color: 'var(--amber,#f59e0b)' },
  improving:              { label: 'Improving — was flagged, now clear', color: 'var(--ok,#10b981)' },
  clear:                  { label: 'Clear across all known windows', color: 'var(--text3)' },
  'insufficient-history': { label: 'Not enough history yet to call this new or chronic', color: 'var(--text3)' },
};

// dispatch #56 Part D -- "instance / pattern / trend." A different axis from TREND_META above:
// that one asks "is it still going on" (a 2-state chronic/new/improving/clear); this one asks how
// many times and in what arrangement. Rendered alongside, not instead of, the existing line.
const SHAPE_META = {
  'never-flagged':        { label: null, color: 'var(--text3)' }, // not rendered -- no shape to name
  instance:                { label: n => 'Instance — flagged once', color: 'var(--amber,#f59e0b)' },
  pattern:                 { label: n => `Pattern — flagged ${n} times, not consecutively`, color: 'var(--crit,#ef4444)' },
  trend:                   { label: (n, dir) => `Trend — ${n} consecutive flagged windows, ${dir || 'moving'}`, color: 'var(--crit,#ef4444)' },
  'insufficient-history':  { label: (n, dir, min) => `${n} consecutive flagged windows — below the ${min}-window minimum to call this a trend`, color: 'var(--text3)' },
};

function fPct(n) { return n == null ? '—' : (n * 100).toFixed(1) + '%'; }

// dispatch #56 Part C -- the (loc, wrin, period) key for looking up an inventory subject's
// product name in qsr_variance_stat. `period` is the subject's OWN latest inventory verdict
// windowEnd, sliced to 'YYYY-MM' (qsr_variance_stat.period's own grain) -- the same derivation
// SubjectDrilldown already used for its population-baseline fetch, factored out so both call
// sites can't drift apart. Never join on (loc, wrin) alone: dropping period inflated a real join
// ~3.5x during the 0013113 investigation (658 rows vs the correct 188).
export function inventoryItemKey(group, domainRuleIds) {
  if (group.subjectType !== 'wrin') return null;
  const ends = group.verdicts
    .filter(v => domainRuleIds.has(v.ruleId) && !v.lifecycleCategory && v.windowEnd)
    .map(v => v.windowEnd);
  if (!ends.length) return null;
  const period = ends.reduce((a, b) => (b > a ? b : a)).slice(0, 7);
  return { period, key: `${group.loc}|${group.wrin}|${period}` };
}

// dispatch #52 -- the drill-down, scoped from a real investigation (memory/dispatch-52.md,
// memory/finding-store-13113-packaging-variance-2026-08-21.md). On-demand only: nothing fetches
// until the reader clicks "Investigate further" -- matching dispatch #43's eager-load discipline
// and keeping every subject row's initial expand cheap. Every number below renders beside the
// baseline it's judged against, and none of them is labelled a cause -- see the engine module's
// own header comment for why.
function SubjectDrilldown({ group, domain, findings, domainRuleIds, subjectLabel }) {
  const [state, setState] = React.useState('idle'); // idle | loading | loaded | error
  const [data, setData] = React.useState(null);

  const load = React.useCallback(() => {
    setState('loading');
    (async () => {
      try {
        if (domain === 'inventory') {
          const period = inventoryItemKey(group, domainRuleIds)?.period || null;
          if (!period) { setState('error'); return; }
          const periods = monthsBack(period, 4);
          const [popRows, histRows] = await Promise.all([
            loadQsrVarianceStat({ period }),
            loadQsrVarianceHistoryAll({ periods }),
          ]);
          setData(assembleInventoryDrilldown({ subjectLoc: group.loc, findings, domainRuleIds, popRows, histRows, periods }));
        } else {
          const cashEnds = group.verdicts.filter(v => domainRuleIds.has(v.ruleId) && !v.lifecycleCategory && v.windowEnd).map(v => v.windowEnd);
          const end = cashEnds.length ? cashEnds.reduce((a, b) => (b > a ? b : a)) : null;
          if (!end) { setState('error'); return; }
          const start = fmtDI(addD(end, -112)); // ~4 months, matching the inventory side's 4-period trend
          const period = end.slice(0, 7);
          const months = monthsBack(period, 4);
          const rows = await loadAuditRowsWindow({ start, end });
          const assembled = assembleCashDrilldown({ subjectLoc: group.loc, subjectEmpToken: group.empToken, findings, domainRuleIds, rows, months });
          // dispatch #58 (#56 Part E) -- event-level detail (time, register, daypart, amount,
          // tender) for this same subject/window, reusing THIS drill-down surface rather than a
          // parallel one. Only meaningful for an employee subject (qsr_security_events has no
          // item/wrin dimension) -- inventory drilldowns above never reach this branch at all.
          const events = group.empToken
            ? await loadQsrSecurityEventsForSubject({ empToken: group.empToken, loc: group.loc, start, end })
            : [];
          setData({ ...assembled, events });
        }
        setState('loaded');
      } catch {
        setState('error');
      }
    })();
  }, [group, domain, findings, domainRuleIds]);

  if (state === 'idle') {
    return div({ style: { padding: '10px 14px', borderTop: '1px solid var(--bdr)' } },
      btn({ onClick: load, style: { fontSize: 11.5, fontWeight: 600, color: 'var(--accent,#f5bc00)', background: 'none', border: '1px solid var(--bdr)', borderRadius: 999, padding: '5px 12px', cursor: 'pointer' } },
        '🔎 Investigate further'));
  }
  if (state === 'loading') return div({ style: { padding: '10px 14px', fontSize: 11.5, color: 'var(--text3)', borderTop: '1px solid var(--bdr)' } }, 'Running the drill-down…');
  if (state === 'error') return div({ style: { padding: '10px 14px', fontSize: 11.5, color: 'var(--crit,#ef4444)', borderTop: '1px solid var(--bdr)' } }, 'Could not run the drill-down — no windowed finding to anchor a period to.');

  const row = (label, node) => div({ style: { marginTop: 6 } },
    span({ style: { fontSize: 10.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px' } }, label),
    div({ style: { fontSize: 12, color: 'var(--text)', marginTop: 2, lineHeight: 1.4 } }, node));

  const flagRateNode = data.flagRate.subject
    ? `${subjectLabel.startsWith('This') || subjectLabel.startsWith('Item') ? 'This store' : 'This subject\'s store'} flags ${fPct(data.flagRate.subject.rate)} of its ${data.flagRate.subject.total} subjects (${data.flagRate.subject.flagged} of ${data.flagRate.subject.total}) — ${data.flagRate.multiple != null ? `${data.flagRate.multiple.toFixed(1)}× the other stores' average of ${fPct(data.flagRate.otherMean)}` : 'no comparable other-store rate yet'}.`
    : 'Not enough population data to compute a store rate.';

  const prevalenceNode = data.prevalence.total
    ? `${data.prevalence.localOnly} of ${data.prevalence.total} of this subject's discriminators flag at ONLY this store (${fPct(data.prevalence.localOnlyShare)} local-only) — ${domain === 'inventory' ? 'a high local-only share is a real lead; a low one means the estate-wide broken-mapping set, not this store' : 'a high local-only share means these rules are specific here, not an estate-wide threshold issue'}.`
    : 'Nothing currently flagged to check prevalence on.';

  const compositionNode = domain === 'inventory'
    ? (data.composition.length
      ? data.composition.slice(0, 3).map(c => `${c.class}: ${fPct(c.subjectShare)} of this subject's flags vs ${fPct(c.estateShare)} estate-wide${c.z != null ? ` (z=${c.z.toFixed(1)})` : ''}`).join(' · ')
      : 'No class data available for this subject\'s flagged items.')
    : (data.ruleMix.length
      ? data.ruleMix.map(r => `${r.ruleId}: ${fPct(r.estateShare)} of all OTHER flagged subjects\' rule-mix estate-wide`).join(' · ')
      : 'This subject has no currently-flagged rules to compare.');

  const trendNode = domain === 'inventory'
    ? (data.trend.some(t => t.medianValue != null)
      ? data.trend.map(t => `${t.period}: ${t.medianValue != null ? t.medianValue.toFixed(1) + '%' : '—'}`).join(' → ')
      : 'No period history yet for this subject\'s flagged items.')
    : (data.trendByRule.length
      ? data.trendByRule.map(t => `${t.ruleId}: ` + t.months.map(m => `${m.period} ${m.value != null ? m.value.toFixed(1) : '—'}`).join(' → ')).join(' | ')
      : 'This subject has no currently-flagged rules to trend.');

  const secondaryNode = data.secondary.length
    ? data.secondary.map(s => `${s.label}: ${typeof s.subjectValue === 'number' && s.subjectValue < 1.5 && s.subjectValue >= 0 && s.label.toLowerCase().includes('rate') ? fPct(s.subjectValue) : fNum(s.subjectValue)} vs. ${typeof s.estateMedian === 'number' && s.estateMedian < 1.5 && s.estateMedian >= 0 && s.label.toLowerCase().includes('rate') ? fPct(s.estateMedian) : fNum(s.estateMedian)} estate median${s.ratio != null ? ` (${s.ratio.toFixed(2)}×)` : ''}`).join(' · ')
    : 'No other metrics available for comparison.';

  return div({ style: { padding: '10px 14px 14px', borderTop: '1px solid var(--bdr)' } },
    span({ style: { fontSize: 11.5, fontWeight: 700, color: 'var(--text)' } }, '🔎 Drill-down — measurements, not conclusions'),
    row('1. Flag rate by store (normalized over subjects present)', flagRateNode),
    row(domain === 'inventory' ? '2. Cross-store prevalence (is this item local, or estate-wide?)' : '2. Cross-store prevalence (is this rule local, or estate-wide?)', prevalenceNode),
    row(domain === 'inventory' ? '3. Item-class composition vs. estate' : '3. Rule-mix vs. estate (descriptive — too few flags per subject for a statistical claim)', compositionNode),
    row('4. Period trend', trendNode),
    row('5. Secondary metrics vs. estate — is this subject unusual on anything else?', secondaryNode),
    domain === 'cash' && h(SubjectEvents, { events: data.events || [] }),
  );
}

// dispatch #58 (#56 Part E) -- "any other key info such as drawer (register) worked and time of
// event." One row per qsr_security_events match for this subject/window: time, register,
// daypart, tender, amount. crewBadge/mgrBadge are shown (a stable, low-cardinality identifier
// that isn't a name) but crewToken/mgrToken are never resolved to a name here -- reveal happens
// only through the existing RevealName / reveal_employee_identity() path, same as every other
// subject identity in this panel.
//
// 🔴 The explicit caveat is REQUIRED, not optional (dispatch #58): cash over/short -- the single
// biggest controls metric -- has NO event-level drill-down at all (it's a computed variance, not
// a discrete event). On a loss-prevention screen, silence must never read as "nothing happened."
function SubjectEvents({ events }) {
  return div({ style: { marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--bdr)' } },
    span({ style: { fontSize: 11.5, fontWeight: 700, color: 'var(--text)' } }, `6. Matching events (${events.length})`),
    div({ style: { fontSize: 10.5, color: 'var(--text3)', marginTop: 3, fontStyle: 'italic' } },
      'Cash over/short has no event-level detail — it is a computed variance, not a discrete event, so it never appears here regardless of how large it is. Discount is not on this report at all. Absence of an event below is not evidence of absence for either.'),
    events.length === 0
      ? div({ style: { fontSize: 11.5, color: 'var(--text3)', marginTop: 6 } }, 'No matching events in this window.')
      : div({ style: { marginTop: 6 } }, events.map(e => div({
          key: e.id, style: { fontSize: 11, color: 'var(--text2)', padding: '4px 0', borderBottom: '1px solid var(--bdr)' },
        },
          `${e.eventDt} ${e.eventTm} · ${e.eventDisplay || e.eventToken} · reg ${e.regNum || '—'} · ${e.daypartName || '—'} · ${e.tenderType || '—'} · $${fNum(e.eventAmt)}`,
        ))),
  );
}

// dispatch #56 Part D -- "has this subject been flagged before, on which rules, in which
// windows." A subject-level rollup across ALL the subject's rules, rendered once above the
// per-rule breakdown -- purely a flatten+sort of data already loaded (buildSubjectTimeline),
// no fetch. Renders nothing for a subject with no history at all (the common case today, per
// dispatch #46's own measurement that every real subject currently has exactly one window).
function SubjectHistory({ group }) {
  const timeline = buildSubjectTimeline(group.historyByRule);
  if (!timeline.totalWindows) return null;
  return div({ style: { marginBottom: 10, paddingBottom: 8, borderBottom: '1px solid var(--bdr)' } },
    span({ style: { fontSize: 11, fontWeight: 700, color: 'var(--text)' } },
      `Subject history: flagged ${timeline.flaggedCount} of ${timeline.totalWindows} evaluation${timeline.totalWindows === 1 ? '' : 's'}`
      + (timeline.firstWindowStart ? ` since ${timeline.firstWindowStart}` : '')),
    // A single-window subject's timeline is identical to the one verdict already shown below --
    // only render the list once there is a second window to actually compare against.
    timeline.totalWindows > 1 && div({ style: { fontSize: 10.5, color: 'var(--text3)', marginTop: 3 } },
      timeline.rows.map(r => `${r.ruleId} ${r.windowEnd}: ${r.pass === true ? 'flagged' : r.pass === false ? 'clear' : 'n/a'}`).join('  ·  ')),
  );
}

function SubjectDetail({ group, rulesById, subjectLabel, domain, findings, domainRuleIds, findingActions, actionBusy, actionError, onFindingAction }) {
  return div({ style: { padding: '10px 14px 14px', borderTop: '1px solid var(--bdr)', background: 'var(--surf2)' } },
    // Owner feedback, 2026-11-10: subjectLabel was already threaded into this component (used
    // inside each verdict's buildDecisionSentence), but never rendered on its own -- a name stated
    // only once, mid-sentence, inside the first verdict block, is easy to miss, especially once the
    // collapsed row's own Subject column has scrolled out of view above the expanded panel. A
    // standalone header fixes that without duplicating subjectLabel's derivation (subjectLabelFor's
    // single implementation, already the caller's job) or adding a second name source to drift
    // against SubjectRow's own collapsed-row RevealName.
    div({ style: { fontWeight: 700, fontSize: 13, color: 'var(--text)', marginBottom: 6 } }, subjectLabel),
    h(SubjectHistory, { group }),
    group.verdicts.map((v, i) => {
      const rule = rulesById[v.ruleId] || {};
      const state = verdictState(v.pass, v.lifecycleCategory);
      const meta = VERDICT_META[state];
      const bc = v.baselineContext || {};
      const trend = classifySubjectTrend(group.historyByRule?.[v.ruleId] || [v]);
      const trendMeta = TREND_META[trend];
      // dispatch #56 Part D -- instance/pattern/trend, a different axis from chronic/new above
      // (how many times, and in what arrangement, not just "is it still going on"). Never
      // rendered for a rule that has never actually flagged (SHAPE_META['never-flagged'].label
      // is null) -- there is no shape to name yet.
      const shapeResult = classifySubjectShape(group.historyByRule?.[v.ruleId] || [v]);
      const shapeMeta = SHAPE_META[shapeResult.shape];
      const shapeLabel = typeof shapeMeta.label === 'function'
        ? shapeMeta.label(shapeResult.flaggedCount, shapeResult.direction, shapeResult.minTrendWindows)
        : shapeMeta.label;
      const exonerated = v.exonerationShare != null && v.exonerationShare >= 0.5;
      // dispatch #56 Part D's "free win": which of this rule's corroboration_rules are ALSO
      // currently flagged for this same subject -- only meaningful on an actual flag.
      const corrob = v.pass === true ? corroboratingFlags(v, rule, group.verdicts) : [];
      return div({ key: v.ruleId + i, style: { padding: '8px 0', borderBottom: i < group.verdicts.length - 1 ? '1px solid var(--bdr)' : 'none' } },
        div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
          span({ style: { fontWeight: 700, fontSize: 12.5, color: 'var(--text)' } }, rule.method || v.ruleId),
          span({ style: { fontSize: 11, fontWeight: 700, color: meta.color } }, meta.label),
        ),
        // dispatch #46 §A point 1 -- the per-rule plain-language explainer, always visible, right
        // under the rule name. Reuses security_rules.description (rewritten to plain language by
        // schema-security-rules-plain-language.sql, dispatch #46) rather than inventing new copy.
        rule.description && div({ style: { fontSize: 10.5, color: 'var(--text3)', marginTop: 1, fontStyle: 'italic' } }, rule.description),
        // dispatch #46 §B -- the decision sentence, BESIDE (never instead of) the raw metric line
        // rendered right below it. state === 'flagged'/'clear'/'undetermined'/'hygiene' all get one.
        div({ style: { fontSize: 12, color: 'var(--text)', marginTop: 4, lineHeight: 1.4 } },
          buildDecisionSentence(rule, v, subjectLabel)),
        // dispatch #46 §C item 6 -- automatic exoneration. Only rendered when logged waste covers
        // at least half the usage variance; a lower share isn't worth a claim ("largely explained").
        exonerated && div({ style: { fontSize: 11, color: 'var(--ok,#10b981)', marginTop: 3 } },
          `✓ ${(v.exonerationShare * 100).toFixed(0)}% of this variance is covered by logged waste (raw + comp) — likely explained by waste, not shrink.`),
        // dispatch #56 Part D -- corroborating rules that also fired for this subject, the
        // finding-level half of the corroboration_rules free win (the static directory half
        // shipped in Part A).
        corrob.length > 0 && div({ style: { fontSize: 11, color: 'var(--crit,#ef4444)', marginTop: 3 } },
          `⚠ Corroborated by ${corrob.join(', ')} — also flagged for this subject.`),
        // dispatch 2026-11-09 -- case tracking, only offered on a real finding row (v.id) with an
        // actual verdict to act on (never for undetermined/hygiene, which have nothing to
        // investigate yet).
        v.pass === true && div({ style: { fontSize: 10.5, color: 'var(--text3)', marginTop: 4, fontStyle: 'italic' } },
          cameraReviewHint(group.loc, v.windowStart, v.windowEnd)),
        v.id && v.pass != null && !v.lifecycleCategory && h(FindingActions, {
          findingId: v.id, actions: findingActions?.[v.id], busy: actionBusy === v.id,
          error: actionError?.[v.id], onSubmit: onFindingAction,
        }),
        // dispatch #46 §C item 1 -- chronic vs. new, from the subject's own history for this rule.
        div({ style: { fontSize: 10.5, color: trendMeta.color, marginTop: 3 } }, trendMeta.label),
        shapeLabel && div({ style: { fontSize: 10.5, color: shapeMeta.color, marginTop: 1 } }, shapeLabel),
        v.lifecycleCategory
          ? null // the decision sentence above already carries the full hygiene explanation
          : v.pass == null
          ? null // ditto for undetermined -- the decision sentence already states what was missing
          : div({ style: { fontSize: 11.5, color: 'var(--text2)', marginTop: 4 } },
              `${fmtValue(v.ruleId, v.value)} vs threshold ${fmtThreshold(rule.logicType, v.thresholdUsed)}`,
              bc.mean != null && ` — ${rule.baselineType || 'baseline'}: mean ${fNum(bc.mean)}, stdev ${fNum(bc.stdev)}, n ${bc.n ?? '—'}`,
            ),
        div({ style: { fontSize: 10.5, color: 'var(--text3)', marginTop: 2 } },
          `Window ${v.windowStart} → ${v.windowEnd} · computed ${fDateTime(v.computedAt)}`,
          rule.active === false && ' · RULE INACTIVE — historical output, not current truth',
        ),
      );
    }),
    domainRuleIds && h(SubjectDrilldown, { group, domain, findings, domainRuleIds, subjectLabel }),
  );
}

// dispatch 2026-11-09 -- case tracking. Owner's own ask, named the highest-value follow-on in
// memory/design-security-events-risk-rules-2026-11-09.md's Phase 2 list: today a flagged finding
// is read-only -- nothing records whether anyone ever looked at it, let alone what they decided.
// Append-only (supabase/schema-security-finding-actions.sql) -- a correction is a NEW action, not
// an edit of an old one, same discipline identity_reveal_log already uses for this panel.
const ACTION_LABEL = {
  investigated_cleared: { label: 'Investigated — cleared', color: 'var(--ok,#10b981)' },
  escalated: { label: 'Escalated', color: 'var(--crit,#ef4444)' },
  noted: { label: 'Note added', color: 'var(--text3)' },
};

// Owner request 2026-11-10 -- a plain nudge to pull camera footage before acting on a flag, shown
// alongside every genuinely flagged finding's case-tracking actions. Deliberately code-only, not a
// per-rule security_rules.investigation_action edit -- that field is DATA (a DB row per rule, 16 of
// them), and this reminder applies identically to every domain/rule, so one line in the renderer
// is the honest fix, not a 16-row migration repeating the same sentence. No camera/DVR integration
// exists anywhere in this codebase (checked before writing this) -- this is a reminder to go check
// whatever system the store already has, nothing more.
export function cameraReviewHint(loc, windowStart, windowEnd) {
  const range = windowStart && windowEnd ? `${windowStart} – ${windowEnd}` : (windowEnd || windowStart || 'this window');
  return `📹 Before deciding: pull camera footage for Store ${loc || '—'}, ${range}, to verify what actually happened.`;
}

function FindingActions({ findingId, actions, busy, error, onSubmit }) {
  const [draft, setDraft] = React.useState(null); // null | 'investigated_cleared' | 'escalated' | 'noted'
  const [note, setNote] = React.useState('');
  const [showHistory, setShowHistory] = React.useState(false);
  if (!findingId) return null; // no real finding row to anchor an action to (shouldn't happen for a real verdict, but never crash)
  const list = actions || [];
  const latest = list.length ? list[list.length - 1] : null;

  const submit = () => {
    onSubmit(findingId, draft, note.trim() || null);
    setDraft(null); setNote('');
  };

  return div({ style: { marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--bdr)' } },
    div({ style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
      latest && span({ style: { fontSize: 10.5, fontWeight: 700, color: (ACTION_LABEL[latest.action] || {}).color || 'var(--text3)' } },
        `${(ACTION_LABEL[latest.action] || {}).label || latest.action} · ${latest.createdByRole || '—'} · ${fDateTime(latest.createdAt)}`),
      btn({ onClick: () => setDraft('investigated_cleared'), disabled: busy, style: caseBtnStyle }, '✓ Mark investigated'),
      btn({ onClick: () => setDraft('escalated'), disabled: busy, style: caseBtnStyle }, '⬆ Escalate'),
      list.length > 0 && btn({ onClick: () => setShowHistory(s => !s), style: { ...caseBtnStyle, border: 'none' } }, `History (${list.length})`),
    ),
    draft && div({ style: { marginTop: 6, display: 'flex', gap: 6, alignItems: 'flex-start' } },
      h('textarea', {
        value: note, onChange: e => setNote(e.target.value), placeholder: 'Optional note…', rows: 2,
        style: { flex: 1, fontSize: 11.5, padding: 6, borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text)', resize: 'vertical' },
      }),
      btn({ onClick: submit, disabled: busy, style: { ...caseBtnStyle, background: 'var(--accent,#f5bc00)', color: '#000', border: 'none' } }, busy ? 'Saving…' : 'Submit'),
      btn({ onClick: () => { setDraft(null); setNote(''); }, style: caseBtnStyle }, 'Cancel'),
    ),
    // dispatch 2026-11-09 -- a write failure (most likely cause today: the owner hasn't yet run
    // schema-security-finding-actions.sql) must reach the screen, not just the console -- this
    // panel's own standing voice rule applies to its own errors too.
    error && div({ style: { marginTop: 4, fontSize: 10.5, color: 'var(--crit,#ef4444)' } }, `⚠ ${error}`),
    showHistory && div({ style: { marginTop: 6, fontSize: 10.5, color: 'var(--text3)' } },
      list.slice().reverse().map(a => div({ key: a.id, style: { padding: '2px 0' } },
        `${(ACTION_LABEL[a.action] || {}).label || a.action} · ${a.createdByRole || '—'} · ${fDateTime(a.createdAt)}${a.note ? ' — ' + a.note : ''}`)),
    ),
  );
}
const caseBtnStyle = { fontSize: 10.5, fontWeight: 600, color: 'var(--text)', background: 'none', border: '1px solid var(--bdr)', borderRadius: 999, padding: '3px 9px', cursor: 'pointer' };

function explanationReason(explanation) {
  const e = Array.isArray(explanation) ? explanation[0] : null;
  return e && e.value == null ? e.label : null;
}
function fNum(n) { return n == null ? '—' : Number(n).toFixed(2); }
function fDateTime(iso) { return iso ? new Date(iso).toLocaleString() : '—'; }

// dispatch #120 -- real <table>/<tr>/<td> markup (findings-readability fallback, see
// sortFindingsForDisplay's own header comment for why a click-through wasn't wired instead).
// Returns a Fragment of two <tr>s (the row itself, plus a colSpan'd detail row when expanded) so
// the parent's <tbody> gets valid direct children -- same cell content as before the table
// conversion, just laid out in columns instead of one flex row.
const SUBJECT_ROW_COLS = 6;
function SubjectRow({ group, rulesById, revealed, onReveal, expanded, onToggle, ruleFilter, domain, findings, domainRuleIds, item, findingActions, actionBusy, actionError, onFindingAction }) {
  const chips = group.verdicts
    .filter(v => !ruleFilter || v.ruleId === ruleFilter)
    .map(v => h(VerdictChip, { key: v.ruleId, ruleId: v.ruleId, active: (rulesById[v.ruleId] || {}).active, verdict: v }));
  // dispatch #56 Part C -- "list the name of the product." `descr` (qsr_variance_stat) as the
  // heading, WRIN as the secondary identifier -- the code still matters for lookups, it just
  // stops being the only thing shown. Falls back to the bare WRIN when the item's period hasn't
  // resolved yet (itemInfo still loading) or has no variance_stat row for that period.
  const itemName = item?.descr || null;
  // dispatch #46 §B -- the decision sentence names the subject in restaurant words, not a bare
  // token. An employee not yet revealed (reveal is a deliberate, logged action -- never automatic)
  // still gets a real sentence via a generic "This employee," rather than the panel forcing a
  // reveal just to read the analysis.
  const subjectLabel = group.subjectType === 'emp'
    ? (revealed[group.empToken] || 'This employee')
    : (itemName ? `${itemName} (${group.wrin}, store ${group.loc})` : `Item ${group.wrin} (store ${group.loc})`);
  const windowEnd = latestWindowEnd(group);
  const td = (p, ...c) => h('td', p, ...c);
  return h(React.Fragment, null,
    h('tr', {
      onClick: onToggle,
      style: { cursor: 'pointer', borderBottom: expanded ? 'none' : '1px solid var(--bdr)' },
    },
      td({ style: { padding: '10px 8px', whiteSpace: 'nowrap' } },
        span({ style: {
          minWidth: 26, width: 26, height: 26, borderRadius: '50%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 800, color: '#fff',
          background: group.flaggedCount >= 2 ? 'var(--crit,#ef4444)' : group.flaggedCount === 1 ? 'var(--amber,#f59e0b)' : 'var(--text3)',
        } }, group.flaggedCount)),
      td({ style: { padding: '10px 8px' } },
        div({ style: { minWidth: 150, maxWidth: 220, fontWeight: 700, fontSize: 12.5, color: 'var(--text)' }, title: itemName ? `${itemName} — WRIN ${group.wrin}` : undefined },
          group.subjectType === 'emp'
            ? h(RevealName, { token: group.empToken, cache: revealed, onReveal })
            : (itemName
                ? [itemName, span({ key: 'wrin', style: { fontSize: 10, fontWeight: 400, color: 'var(--text3)', marginLeft: 5 } }, group.wrin)]
                : `Item ${group.wrin}`),
        ),
        item?.cls && span({ style: { fontSize: 10, color: 'var(--text3)', border: '1px solid var(--bdr)', borderRadius: 999, padding: '1px 7px' } }, item.cls),
      ),
      td({ style: { padding: '10px 8px', fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' } },
        span(null, `Store ${group.loc}`)),
      td({ style: { padding: '10px 8px' } }, div({ style: { display: 'flex', gap: 6, flexWrap: 'wrap' } }, chips)),
      td({ style: { padding: '10px 8px', fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' } }, windowEnd || '—'),
      td({ style: { padding: '10px 8px', fontSize: 11, color: 'var(--text3)', textAlign: 'right', whiteSpace: 'nowrap' } }, expanded ? '▲' : '▼'),
    ),
    expanded && h('tr', null,
      td({ colSpan: SUBJECT_ROW_COLS, style: { padding: 0 } },
        h(SubjectDetail, { group, rulesById, subjectLabel, domain, findings, domainRuleIds, findingActions, actionBusy, actionError, onFindingAction }))),
  );
}

// dispatch #46 §A point 2 -- remembered across sessions the same way every other dismissible UI
// element in this build persists a choice (a plain localStorage flag, not a Supabase round-trip --
// this is a per-device UI preference, not data).
const LEGEND_DISMISSED_KEY = 'mf_security_legend_dismissed_v1';

function Legend({ onDismiss, rules }) {
  const ROWS = [
    ['🔴 Flagged', 'The rule found this genuinely unusual AND, where applicable, big enough to matter (materiality floors exist specifically to keep tiny amounts from flagging).'],
    ['🟢 Clear', 'The rule evaluated and found nothing unusual — a real, decided answer.'],
    ['⚪ Undetermined', 'The rule could NOT honestly form a verdict — not enough exposure, too few peers to compare against, or below a materiality floor. This is NOT the same as Clear: the rule hasn\'t looked yet, not looked and found nothing.'],
    ['🟡 Hygiene', 'The subject is a data-hygiene item (a deactivated/new/obsolete item in QSRSoft) — its numbers aren\'t reliable for detection. A setup issue, not a security question.'],
    ['① signal-count badge', 'How many independent rules flagged this subject. One flag can be noise; several flags on the same person or item agreeing is the real lead — that convergence is the whole reason findings are grouped by subject instead of by rule.'],
    ['peer / personal / store / network baseline', 'What a subject is compared against: peer = other employees at the same store; personal = this subject\'s own history; store = other stores\' rate for the same item; network = the whole estate.'],
    ['threshold vs. σ (sigma)', 'A plain rate rule\'s threshold is in the metric\'s own unit (dollars, a percent, a count). A statistical (z-score) rule\'s threshold is in standard deviations from the baseline — a different kind of number that happens to use the same word.'],
    ['⏸ inactive rule', 'This rule is currently switched off. Its findings are historical output, not current truth — do not read an inactive rule\'s old "Clear" as still true today.'],
  ];
  return div({ style: { padding: '12px 14px', borderBottom: '1px solid var(--bdr)', background: 'var(--surf2)', fontSize: 11.5 } },
    div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 } },
      span({ style: { fontWeight: 700, fontSize: 12.5, color: 'var(--text)' } }, 'What am I looking at?'),
      btn({ onClick: onDismiss, style: { fontSize: 11, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer' } }, 'Got it, hide this'),
    ),
    ROWS.map(([term, def]) => div({ key: term, style: { display: 'flex', gap: 10, marginBottom: 5 } },
      span({ style: { minWidth: 150, fontWeight: 700, color: 'var(--text)' } }, term),
      span({ style: { color: 'var(--text2)', flex: 1 } }, def),
    )),
    h(RuleDirectory, { rules }),
  );
}

// 'events' added dispatch 2026-11-09 (schema-security-rules-events-phase1.sql's EVENT-001/002/003)
// -- qsr_security_events-sourced, emp-keyed same as cash/labor. Without a tab here those rules'
// findings could never be selected in this panel at all -- domainRuleIds is built from whichever
// of these four strings `domain` state holds, and the rule-directory/legend sections already list
// every domain regardless of tab (RuleDirectory's own "both domains shown... reference material"
// comment), so this was the one place actually gating visibility.
const RULE_DOMAIN_LABEL = { cash: 'Cash', inventory: 'Inventory', labor: 'Labor', events: 'Events' };

// dispatch 2026-10-12 -- the domain tab's own icon+label, read by both the tab row and (via
// RULE_DOMAIN_LABEL above) the rule directory/print-report/export titles. Was a two-way ternary
// (`d === 'cash' ? ... : ...`) that had no room for a third domain.
const DOMAIN_TAB_LABEL = { cash: '💵 Cash', inventory: '📦 Inventory', labor: '🕐 Labor', events: '🧾 Events' };

// Owner-reported live 2026-10-14: Labor looked identical to "broken" on first click (0 groups,
// "No findings match the current filters") even though LABOR-001/002 both had real data -- 330
// real clear verdicts, zero flagged ones (every employee evaluated cleanly). The default Min
// Signals floor of 1+ (see that pill row's own 2026-10-12 comment) hides any subject with zero
// FLAGGED verdicts, which is every subject in a domain that hasn't flagged anyone yet -- exactly
// the "100% clear" case that comment already named but didn't change the default for. Cash and
// Inventory both have real flagged findings today, so 1+ is still the right default there (it's
// what makes those two domains open straight to "here's what needs attention" instead of a wall
// of clear subjects) -- only Labor needs to default to All.
// 'events' defaults to All too (dispatch 2026-11-09) -- EVENT-001/002/003 ship active=false with
// zero findings computed yet (same as LABOR's own day-one state the 2026-10-14 comment above
// describes), so a 1+ floor would render the identical "looks broken" empty table.
const DOMAIN_DEFAULT_MIN_SIGNALS = { cash: 1, inventory: 1, labor: 0, events: 0 };

// dispatch #56 Part A -- owner: "let's add directory of what each policy covers." Renders
// ENTIRELY from the live `rules` array (loadSecurityRules()'s own security_rules read) -- never a
// hand-written list. A hardcoded directory is a second copy of text that lives in a table an
// owner can edit, and starts drifting the moment a rule is retuned, renamed, or deactivated with
// nothing to catch it -- this repo has already paid for that exact class three times in one week
// (Job A's stale 'Proj Workflow' label, dispatch #52's 15 schema-drift columns, proj's false
// section:'planning'). If a rule is added to security_rules tomorrow, it must appear here with no
// code change -- that is the whole test this component has to pass.
//
// Collapsed by default (below the vocabulary rows, own subsection) -- 9 rules x 8 fields would
// bury the 8 rows that answer "what am I looking at?" above. Local open/closed state only, no
// second localStorage key -- reuses the legend's own dismiss/remember behaviour for the legend as
// a whole; add persistence here only if it proves annoying in use.
function RuleDirectory({ rules }) {
  const [open, setOpen] = React.useState(false);
  if (!rules || !rules.length) return null;
  const byDomain = {};
  for (const r of rules) (byDomain[r.domain] = byDomain[r.domain] || []).push(r);
  // Both domains shown regardless of the panel's cash/inventory toggle -- this is reference
  // material ("is there a rule that covers X?"), which a tab-filtered directory can't answer.
  const domains = Object.keys(byDomain).sort();
  return div({ style: { marginTop: 10, paddingTop: 8, borderTop: '1px dashed var(--bdr)' } },
    btn({
      onClick: () => setOpen(o => !o),
      style: { fontSize: 11.5, fontWeight: 700, color: 'var(--text)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 },
    }, (open ? '▾ ' : '▸ ') + `Rule directory — what each policy covers (${rules.length})`),
    open && domains.map(d => div({ key: d, style: { marginTop: 10 } },
      div({ style: { fontWeight: 700, fontSize: 11.5, color: 'var(--text)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '.03em' } },
        RULE_DOMAIN_LABEL[d] || d),
      byDomain[d].map(r => h(RuleDirectoryRow, { key: r.ruleId, rule: r })),
    )),
  );
}

// Inactive rules are LISTED, not hidden (dispatch #56 Part A) -- omitting one makes a reader
// wonder whether a rule they remember was removed, renamed, or is silently not running. Reuses
// the legend's own ⏸ marker and wording rather than inventing a second way to say "not current."
function RuleDirectoryRow({ rule: r }) {
  const fps = Array.isArray(r.falsePositives) ? r.falsePositives : [];
  const corrob = Array.isArray(r.corroborationRules) ? r.corroborationRules : [];
  const exon = Array.isArray(r.exonerationRules) ? r.exonerationRules : [];
  return div({ style: { padding: '8px 0', borderBottom: '1px solid var(--bdr)' } },
    div({ style: { display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' } },
      span({ style: { fontWeight: 700, color: 'var(--text)' } }, (r.method || r.ruleId) + (r.active ? '' : ' ⏸')),
      span({ style: { fontSize: 10, color: 'var(--text3)' } }, r.ruleId),
      span({ style: { fontSize: 10, color: 'var(--text3)', marginLeft: 'auto' } }, `Severity ${r.severity ?? '—'}`),
    ),
    r.description && div({ style: { fontSize: 11, color: 'var(--text2)', marginTop: 3, fontStyle: 'italic' } }, r.description),
    div({ style: { display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 10.5, color: 'var(--text3)', marginTop: 4 } },
      r.baselineType && span(null, `Baseline: ${r.baselineType}`),
      span(null, `Logic: ${r.logicType || '—'}${r.windowDays != null ? ` over ${r.windowDays}d` : ''}`),
      !r.active && span({ style: { color: 'var(--accent,#f5bc00)' } }, '⏸ inactive — historical output, not current truth'),
    ),
    // "say the number AND the decision" -- a directory naming a rule but not what to do when it
    // fires is a number nobody acts on (CLAUDE.md's standing voice rule).
    r.investigationAction && div({ style: { fontSize: 11, color: 'var(--text)', marginTop: 4 } },
      span({ style: { fontWeight: 700 } }, 'When it fires: '), r.investigationAction),
    fps.length > 0 && div({ style: { fontSize: 10.5, color: 'var(--text3)', marginTop: 3 } },
      span({ style: { fontWeight: 700 } }, 'Known false positives: '),
      fps.map(fp => (typeof fp === 'string' ? fp : (fp.label || fp.reason || JSON.stringify(fp)))).join('; ')),
    (corrob.length > 0 || exon.length > 0) && div({ style: { fontSize: 10.5, color: 'var(--text3)', marginTop: 3 } },
      corrob.length > 0 && span(null, `Corroborates with: ${corrob.join(', ')}`),
      corrob.length > 0 && exon.length > 0 && span(null, '   ·   '),
      exon.length > 0 && span(null, `Weakened by: ${exon.join(', ')}`),
    ),
    h(RulePlaybook, { ruleId: r.ruleId }),
  );
}

// dispatch 2026-11-09 -- owner's own ask: "generally available techniques on how to best control
// cash controls on the floor." One level up from the row's already-live fields just above
// (description/investigation_action/false_positives, all security_rules columns) -- this is
// curated, general loss-prevention practice (src/engine/security-playbook.js), never a number
// derived from this org's own data. Renders nothing for a rule with no playbook entry yet
// (playbookForRule's own honest-null contract), so a brand-new rule family degrades silently
// instead of showing an empty box.
function RulePlaybook({ ruleId }) {
  const p = playbookForRule(ruleId);
  if (!p) return null;
  const row = (label, text) => div({ style: { marginTop: 4 } },
    span({ style: { fontWeight: 700, color: 'var(--text)' } }, label + ': '),
    span({ style: { color: 'var(--text2)' } }, text));
  return div({ style: { marginTop: 6, paddingTop: 6, borderTop: '1px dashed var(--bdr)', fontSize: 10.5 } },
    span({ style: { fontWeight: 700, color: 'var(--accent,#f5bc00)' } }, `📖 Playbook — ${p.title}`),
    row('What it is', p.what),
    row('The real tell', p.tell),
    row('Floor technique', p.floor),
  );
}

// ── Print / Export (dispatch #143) ──────────────────────────────────────────────────────────────
// Reuses this session's established pattern (dispatch #122/#129/#134/#136): a full, scroll-
// independent printable HTML document built straight from the SAME `sortedGroups` the on-screen
// table renders (never a second hand-copy that could drift), plus a CSV/JSON export via the
// shared ExportDropdown. Both are scoped to whatever domain/location-scope/rule/min-signals/
// date-range filter is currently active -- exporting `groups`/`sortedGroups`, not the unfiltered
// `findings` array.
//
// Privacy: identity reveal is a deliberate, logged action (RevealName / the bulk-reveal effect
// above) -- an export must never surface a name that hasn't already been revealed on screen. Both
// builders below use the exact same `subjectLabel` derivation SubjectRow already uses (revealed
// token -> name, else the generic "This employee"), so an export never leaks more than the current
// view already shows.
function scopeLabel(scope) {
  if (!scope || scope.level === 'all') return 'All Locations';
  if (scope.level === 'state') return scope.value;
  if (scope.level === 'patch') return scope.value + ' Patch';
  if (scope.level === 'store') return STORE_NAMES[scope.value] || scope.value;
  return 'All Locations';
}

// Same subjectLabel logic SubjectRow renders (dispatch #56 Part C's item-name heading, dispatch
// #46 §B's generic un-revealed fallback) -- kept in one place so print/export can't drift from
// what's on screen. itemInfoFor(group) resolves the (loc,wrin,period) -> {descr,cls} lookup the
// panel already loads on-demand for the inventory domain.
function subjectLabelFor(group, revealed, itemInfoFor) {
  if (group.subjectType === 'emp') return revealed[group.empToken] || 'This employee';
  const item = itemInfoFor ? itemInfoFor(group) : null;
  const itemName = item?.descr || null;
  return itemName ? `${itemName} (${group.wrin}, store ${group.loc})` : `Item ${group.wrin} (store ${group.loc})`;
}

// Decision-first summary bar -- the live screen's own version of buildSecurityPrintHtml's
// heroCard treatment above ("N Subjects Flagged," "2+ Signal Convergence," etc.), which until now
// only ever rendered in the PDF export, never here. Same four numbers, same `groups` (the
// filtered/scoped set the table itself renders -- NOT `sortedGroups`, since a reader who's
// re-sorted the table by Subject or Window shouldn't also silently change which subject this bar
// calls out; `groups` stays convergence-ordered from groupFindingsBySubject's own sort
// regardless), plus one decision line per CLAUDE.md's "voice by role" standing rule -- the number
// stays visible, the sentence says what to do with it, neither replaces the other.
//
// The decision line names a CONVERGING subject when one exists (2+ independent signals on the
// same subject) and stays there -- it does NOT also try to call out a single-rule CHRONIC subject
// (flagged many days running on just one rule), even though that can be an equally real lead. That
// needs a subject's own multi-window history, which this scope-wide summary can't afford to fetch
// for every visible subject (loadSecurityFindingsForSubject is deliberately lazy, one subject at a
// time, on row-expand) -- naming a false "top pick" from data this bar doesn't actually have would
// be worse than staying quiet on it. A composite score across both axes is tracked separately, not
// attempted here.
function SecuritySummaryBar({ groups, newestBatch, revealed, itemInfoFor }) {
  const flaggedTotal = groups.reduce((a, g) => a + g.flaggedCount, 0);
  const multiSignal = groups.filter(g => g.flaggedCount >= 2).length;
  // dispatch 2026-11-10 follow-on (owner-caught: "I thought we landed on a more robust look") --
  // these tiles were still the plain, small stat-box styling from before the dashboard-first
  // redesign, never bumped to match the bolder KPI-strip treatment the approved mockup actually
  // showed. Same data, same props, purely a visual pass: bigger numbers (34px, matching the
  // mockup), more breathing room, and a colored top accent on any tile carrying a `tone` (i.e.
  // something worth noticing) instead of a uniform flat border on every tile regardless of
  // severity.
  const tile = (label, val, tone) => div({
    style: {
      background: 'var(--surf2)', border: '1px solid var(--bdr)', borderTop: `3px solid ${tone || 'var(--bdr)'}`,
      borderRadius: 14, padding: '16px 18px',
    } },
    div({ style: { fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 } }, label),
    div({ style: { fontSize: 34, fontWeight: 800, lineHeight: 1, color: tone || 'var(--text)', fontVariantNumeric: 'tabular-nums' } }, val),
  );
  let decision;
  if (!groups.length) {
    decision = 'No subjects flagged — clear across this scope.';
  } else if (!multiSignal) {
    decision = `${groups.length} subject${groups.length === 1 ? '' : 's'} flagged, one signal each — worth a look, nothing converging yet.`;
  } else {
    const top = groups[0]; // groups is already convergence-sorted (flaggedCount desc, worstValue desc)
    decision = `${subjectLabelFor(top, revealed, itemInfoFor)} is converging on ${top.flaggedCount} independent signals — the strongest lead in this scope right now.`;
  }
  return div({ style: { padding: '10px 14px', borderBottom: '1px solid var(--bdr)' } },
    div({ style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10, marginBottom: 10 } },
      tile('Subjects Flagged', groups.length),
      tile('Total Signals', flaggedTotal, flaggedTotal > 0 ? 'var(--crit,#ef4444)' : undefined),
      tile('2+ Signal Convergence', multiSignal, multiSignal > 0 ? 'var(--crit,#ef4444)' : undefined),
      tile('Latest Batch', newestBatch ? new Date(newestBatch).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'),
    ),
    div({ style: { display: 'flex', gap: 8, alignItems: 'flex-start', background: 'rgba(245,188,0,.12)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '10px 12px', fontSize: 12.5 } },
      span(null, '💡'),
      span({ style: { color: 'var(--text)' } }, decision),
    ),
  );
}

// ── Command Center — the network-wide, cross-domain view (dispatch 2026-11-10) ───────────────────
// Reuses SecuritySummaryBar (fed `commandGroups` instead of the Table/Briefing views' own domain-
// scoped `groups` -- same component, a different, cross-domain input) and SecurityHealthGrid (fed
// the SAME `healthList` the Briefing view's district grid already renders -- storeHealthList is
// already cross-domain by its own design, see security-health.js's own header) rather than
// building either a second time. The only genuinely new surface here is the domain-breakdown
// cards, the Employee Watchlist table, and the Top Contributing Rules / Case Queue panels -- none
// of which existed anywhere in this panel before.
//
// Deliberately does NOT attempt the persistence_multiplier/convergence_multiplier terms the
// owner's own 2026-10-28 "Security Health Dashboard" design doc scoped for the health SCORE
// itself (https://claude.ai/artifact/9gMaF97gAD2VH8KoJ4rphv), nor that doc's Mockup B
// "Theories, ranked" corrective-action layer (concentration-pattern detection -- person/register/
// daypart/store/fleet -- generalizing crossStoreRecountConsistency). Both are real, already-scoped
// pieces of that doc that are still NOT BUILT anywhere in this codebase (checked directly:
// classifySubjectShape only classifies a flag's TEMPORAL shape, new/chronic/trend -- it is not the
// concentration-pattern classifier that doc describes) -- not something to invent weights or a new
// query for inside this dispatch. Both remain open follow-on work, not silently dropped.
function CommandCenterView({
  commandGroups, domainBreakdown, topRules, healthList, caseQueue, findingActions,
  revealed, onReveal, rulesById, newestBatch, itemInfoFor, scope, onSelectStore, onReviewSubject,
  onOpenTable,
}) {
  const ruleList = Object.values(rulesById);
  const activeRules = ruleList.filter(r => r.active).length;
  const storesNeedingReview = healthList.filter(s => s.tier !== 'clean').length;

  return div(null,
    h(SecuritySummaryBar, { groups: commandGroups, newestBatch, revealed, itemInfoFor }),
    // A second, network-specific KPI row alongside SecuritySummaryBar's own tiles (Subjects
    // Flagged/Total Signals/2+ Signal Convergence/Latest Batch) -- additive, not a replacement.
    div({ style: { display: 'flex', gap: 10, padding: '0 14px 10px', flexWrap: 'wrap' } },
      commandTile('Stores Needing Review', `${storesNeedingReview} / ${healthList.length}`, storesNeedingReview > 0 ? 'var(--crit,#ef4444)' : undefined),
      commandTile('Rules Live', `${activeRules} / ${ruleList.length}`, undefined,
        ruleList.length - activeRules > 0 ? `${ruleList.length - activeRules} pending activation review` : 'all rules active'),
    ),
    healthList.length > 0 && h(SecurityHealthGrid, { list: healthList, scope, onSelectStore }),
    // ── By Security Domain ──
    div({ style: { padding: '10px 14px' } },
      div({ style: { fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 8 } },
        'By Security Domain'),
      div({ style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10 } },
        domainBreakdown.map(d => h(DomainBreakdownCard, { key: d.domain, d })),
      ),
    ),
    // ── Employee Watchlist ──
    div({ style: { padding: '10px 14px' } },
      div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 8 } },
        div({ style: { fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.03em' } },
          'Employee Watchlist — flagged across any domain'),
        span({ style: { fontSize: 10.5, color: 'var(--text3)' } },
          `${commandGroups.length} subject${commandGroups.length === 1 ? '' : 's'} flagged this scope`),
      ),
      commandGroups.length === 0
        ? emptyState('No employees currently flagged in this scope.')
        : div({ style: { overflowX: 'auto' } },
            h('table', { style: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: 12 } },
              h('thead', null, h('tr', null,
                h('th', { style: thStyle(false) }, 'Subject'),
                h('th', { style: thStyle(false) }, 'Store'),
                h('th', { style: thStyle(false) }, 'Domains'),
                h('th', { style: thStyle(false) }, 'Rule(s) fired'),
                h('th', { style: thStyle(false) }, 'Convergence'),
                h('th', { style: thStyle(false) }, 'Status'),
                h('th', { style: thStyle(false) }, ''),
              )),
              h('tbody', null, commandGroups.slice(0, 25).map(g =>
                h(EmployeeWatchlistRow, { key: g.key, group: g, rulesById, revealed, onReveal, findingActions, onReviewSubject }),
              )),
            ),
          ),
      commandGroups.length > 25 && div({ style: { fontSize: 10.5, color: 'var(--text3)', marginTop: 6 } },
        `Showing the top 25 of ${commandGroups.length}, ranked by convergence then severity — same order as the rest of this panel.`),
    ),
    // ── Top Contributing Rules + Case Queue ──
    div({ style: { display: 'flex', flexWrap: 'wrap', gap: 10, padding: '10px 14px 20px' } },
      div({ style: { flex: '1 1 320px', background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '12px 14px' } },
        div({ style: { fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 10 } },
          '🔎 Top Contributing Rules'),
        topRules.length === 0
          ? span({ style: { fontSize: 11.5, color: 'var(--text3)' } }, 'Nothing flagged in this scope.')
          : div({ style: { display: 'flex', flexDirection: 'column', gap: 8 } },
              topRules.map(r => h(ParetoRow, { key: r.ruleId, r, max: topRules[0]?.count || 1 })),
            ),
      ),
      div({ style: { flex: '1 1 320px', background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '12px 14px' } },
        div({ style: { fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 10 } },
          `Case Queue — ${caseQueue.open + caseQueue.noted + caseQueue.escalated + caseQueue.investigated_cleared} open findings`),
        h(CaseQueueBar, { caseQueue }),
      ),
    ),
    // dispatch 2026-11-10, IA redesign -- the Tier-3 gateway. Everything the raw Table view offers
    // (every subject regardless of convergence, domain tabs, rule pills, min-signals, date range,
    // CSV/JSON export, print report) still exists, unchanged -- this is the one quiet, deliberate
    // way into it from the dashboard, replacing a view toggle that gave it equal visual weight to
    // the dashboard itself.
    div({ style: { textAlign: 'center', padding: '0 14px 20px' } },
      btn({ onClick: onOpenTable, style: { fontSize: 12, color: 'var(--text3)', background: 'none', border: 'none', borderBottom: '1px dotted var(--text3)', cursor: 'pointer', padding: 0 } },
        '⚙ Need every subject, every rule, every filter, CSV/export? Open the full data table →')),
  );
}

function commandTile(label, val, tone, caption) {
  return div({
    style: {
      background: 'var(--surf2)', border: '1px solid var(--bdr)', borderTop: `3px solid ${tone || 'var(--bdr)'}`,
      borderRadius: 14, padding: '16px 18px', minWidth: 160, flex: '1 1 160px',
    } },
    div({ style: { fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 6 } }, label),
    div({ style: { fontSize: 34, fontWeight: 800, lineHeight: 1, color: tone || 'var(--text)', fontVariantNumeric: 'tabular-nums' } }, val),
    caption && div({ style: { fontSize: 11, color: 'var(--text3)', marginTop: 6 } }, caption),
  );
}

function DomainBreakdownCard({ d }) {
  return div({ style: { background: 'var(--surf2)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 } },
    div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
      span({ style: { fontSize: 13, fontWeight: 800, color: 'var(--text)' } }, DOMAIN_TAB_LABEL[d.domain] || d.domain),
      span({ style: { fontSize: 10.5, color: 'var(--text3)' } }, `${d.ruleCount} rule${d.ruleCount === 1 ? '' : 's'}`),
    ),
    div({ style: { display: 'flex', height: 6, borderRadius: 999, overflow: 'hidden', background: 'var(--bdr)' } },
      div({ style: { flex: `${d.low} 1 0%`, background: 'var(--text3)' } }),
      div({ style: { flex: `${d.med} 1 0%`, background: 'var(--amber,#f59e0b)' } }),
      div({ style: { flex: `${d.high} 1 0%`, background: 'var(--crit,#ef4444)' } }),
    ),
    div({ style: { fontSize: 20, fontWeight: 800, color: d.findings > 0 ? 'var(--crit,#ef4444)' : 'var(--text)' } }, d.findings),
    d.topRule
      ? div({ style: { fontSize: 11, color: 'var(--text2)', lineHeight: 1.4 } },
          `${d.topRule.ruleId} · ${ruleShortTag(d.topRule) || d.topRule.method} (${d.topRuleCount})`)
      : div({ style: { fontSize: 11, color: 'var(--text3)' } }, 'Nothing flagged in this scope.'),
  );
}

function domainChipStyle(domain) {
  const colors = { cash: '#FFBC0D', inventory: '#38bdf8', labor: '#f97316', events: '#a78bfa' };
  const c = colors[domain] || '#526880';
  return { display: 'inline-flex', alignItems: 'center', fontSize: 9.5, fontWeight: 800, letterSpacing: '.03em', color: c, background: `${c}22`, borderRadius: 5, padding: '2px 6px', whiteSpace: 'nowrap' };
}

// One row per cross-domain subject, ranked by convergence then severity (commandGroups' own sort,
// unchanged here). The "lead" finding -- highest severity, most recent window as the tiebreaker --
// drives the Status cell and where "Review →" jumps into the existing Table view; the Domains/
// Rule(s) columns still list every currently-flagged signal, not just the lead one.
function EmployeeWatchlistRow({ group, rulesById, revealed, onReveal, findingActions, onReviewSubject }) {
  const flaggedVerdicts = group.verdicts.filter(v => v.pass === true && !v.lifecycleCategory);
  const domains = [...new Set(flaggedVerdicts.map(v => rulesById[v.ruleId]?.domain).filter(Boolean))];
  const lead = flaggedVerdicts.slice().sort((a, b) =>
    (rulesById[b.ruleId]?.severity || 0) - (rulesById[a.ruleId]?.severity || 0) || (b.windowEnd || '').localeCompare(a.windowEnd || ''),
  )[0];
  const leadRule = lead ? rulesById[lead.ruleId] : null;
  const status = lead ? latestCaseStatus(lead.id, findingActions) : 'open';
  const statusMeta = CASE_STATUS_LABEL[status] || CASE_STATUS_LABEL.open;
  const td = (p, ...c) => h('td', p, ...c);
  return h('tr', { style: { borderTop: '1px solid var(--bdr)' } },
    td({ style: { padding: '8px 10px', verticalAlign: 'top' } },
      div({ style: { fontWeight: 700, fontSize: 12.5, color: 'var(--text)' } }, h(RevealName, { token: group.empToken, cache: revealed, onReveal }))),
    td({ style: { padding: '8px 10px', fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap', verticalAlign: 'top' } },
      STORE_NAMES[group.loc] || group.loc),
    td({ style: { padding: '8px 10px', verticalAlign: 'top' } },
      div({ style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
        domains.map(d => span({ key: d, style: domainChipStyle(d) }, (DOMAIN_TAB_LABEL[d] || d).replace(/^\S+\s/, '').toUpperCase())))),
    td({ style: { padding: '8px 10px', verticalAlign: 'top' } },
      div({ style: { display: 'flex', gap: 4, flexWrap: 'wrap' } },
        flaggedVerdicts.map(v => h(VerdictChip, { key: v.ruleId, ruleId: v.ruleId, active: (rulesById[v.ruleId] || {}).active, verdict: v })))),
    td({ style: { padding: '8px 10px', verticalAlign: 'top', whiteSpace: 'nowrap' } },
      group.flaggedCount >= 2
        ? span({ style: { fontSize: 11, fontWeight: 800, color: 'var(--crit,#ef4444)' } }, `🔗 ${group.flaggedCount} signals`)
        : span({ style: { fontSize: 11, color: 'var(--text3)' } }, '—')),
    td({ style: { padding: '8px 10px', verticalAlign: 'top', whiteSpace: 'nowrap' } },
      span({ style: { fontSize: 11, fontWeight: 700, color: statusMeta.color } }, statusMeta.label)),
    td({ style: { padding: '8px 10px', verticalAlign: 'top', whiteSpace: 'nowrap' } },
      leadRule && btn({
        onClick: () => onReviewSubject(group, leadRule.domain),
        style: { fontSize: 10.5, fontWeight: 700, color: 'var(--accent,#f5bc00)', background: 'none', border: '1px solid var(--bdr)', borderRadius: 999, padding: '4px 10px', cursor: 'pointer' },
      }, 'Review →')),
  );
}

function ParetoRow({ r, max }) {
  const severity = r.rule?.severity ?? 1;
  const color = severity >= 4 ? 'var(--crit,#ef4444)' : severity === 3 ? 'var(--amber,#f59e0b)' : 'var(--text3)';
  const pct = max > 0 ? Math.round((r.count / max) * 100) : 0;
  return div(null,
    div({ style: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, marginBottom: 3 } },
      span({ style: { color: 'var(--text)', fontWeight: 600 } }, `${r.ruleId} · ${ruleShortTag(r.rule) || r.rule?.method || ''}`),
      span({ style: { color: 'var(--text3)', fontFamily: 'monospace', flexShrink: 0 } }, r.count),
    ),
    div({ style: { height: 5, borderRadius: 999, background: 'var(--bdr)', overflow: 'hidden' } },
      div({ style: { width: `${pct}%`, height: '100%', background: color } }),
    ),
  );
}

function CaseQueueBar({ caseQueue }) {
  const segments = [
    { key: 'open', label: 'Flagged', count: caseQueue.open, color: 'var(--text3)' },
    { key: 'noted', label: 'Noted', count: caseQueue.noted, color: 'var(--text2)' },
    { key: 'escalated', label: 'Escalated', count: caseQueue.escalated, color: 'var(--crit,#ef4444)' },
    { key: 'investigated_cleared', label: 'Cleared', count: caseQueue.investigated_cleared, color: 'var(--ok,#10b981)' },
  ];
  const total = segments.reduce((s, seg) => s + seg.count, 0);
  if (!total) return span({ style: { fontSize: 11.5, color: 'var(--text3)' } }, 'Nothing flagged in this scope.');
  return div(null,
    div({ style: { display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', background: 'var(--bdr)' } },
      segments.map(seg => seg.count > 0 && div({ key: seg.key, style: { flex: `${seg.count} 1 0%`, background: seg.color } }))),
    div({ style: { display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 8, fontSize: 10.5 } },
      segments.map(seg => span({ key: seg.key, style: { color: 'var(--text3)' } },
        span({ style: { display: 'inline-block', width: 8, height: 8, borderRadius: 2, marginRight: 5, background: seg.color, verticalAlign: '-1px' } }),
        `${seg.label} · ${seg.count}`))),
  );
}

// dispatch 2026-11-10, IA redesign -- Tier 2 of the owner's requested funnel ("a secondary level
// of sorts between the dashboard and the engine"), reached from Command Center's Employee
// Watchlist "Review →". Deliberately reuses SecurityBriefingCard as-is for the per-finding content
// (buildDecisionSentence's real plain-language sentence with the finding's REAL value/threshold/
// baseline numbers, corroboration, trend+drift badges, the camera-footage reminder, case actions)
// rather than inventing a second narrative renderer -- SecurityBriefingCard is already cross-
// domain (no `domain` prop needed) and already honest about what data exists: cash's over/short
// rules have no event-level register/timestamp detail (a computed variance, not a discrete event,
// per SubjectEvents' own caveat), so this view does not fabricate a register number or a clock
// time no query backs. Event-level detail (time, register, daypart, tender, $ amount) for subjects
// where it genuinely exists is intentionally left to Table's own "🔎 Investigate further" drill-
// down (SubjectDrilldown/SubjectEvents) rather than duplicated here -- the gateway link below is
// how a reader gets there, scoped to this exact subject, not a second copy of that fetch.
function SubjectBriefView({ group, rulesById, revealed, onReveal, itemInfoFor, findingActions, actionBusy, actionError, onFindingAction, openDrawers, onToggleDrawer, driftPerKey, onBack, onOpenTable }) {
  const linkStyle = { fontSize: 12, fontWeight: 600, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 };
  if (!group) {
    return div({ style: { padding: '40px 20px', textAlign: 'center' } },
      btn({ onClick: onBack, style: linkStyle }, '← Dashboard'),
      div({ style: { marginTop: 20, fontSize: 13, color: 'var(--text3)' } },
        'This subject is no longer in view — it may have cleared, or the scope changed. Head back to the dashboard and pick it again.'),
    );
  }
  const subjectLabel = subjectLabelFor(group, revealed, itemInfoFor);
  const flaggedVerdicts = group.verdicts.filter(v => v.pass === true && !v.lifecycleCategory);
  return div({ style: { maxWidth: 820, margin: '0 auto', padding: '16px 14px 30px' } },
    btn({ onClick: onBack, style: linkStyle }, '← Dashboard'),
    div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginTop: 14, marginBottom: 18 } },
      div(null,
        div({ style: { fontSize: 19, fontWeight: 800, color: 'var(--text)' } },
          group.subjectType === 'emp' ? h(RevealName, { token: group.empToken, cache: revealed, onReveal }) : subjectLabel),
        div({ style: { fontSize: 12, color: 'var(--text3)', marginTop: 3 } }, `${STORE_NAMES[group.loc] || `Store ${group.loc}`}`),
      ),
      group.flaggedCount >= 2 && span({
        style: { fontSize: 11.5, fontWeight: 800, color: 'var(--crit,#ef4444)', border: '1px solid var(--crit,#ef4444)', borderRadius: 999, padding: '5px 12px', background: 'rgba(239,68,68,.1)' },
      }, `⚠ ${group.flaggedCount} independent rules agree`),
    ),
    flaggedVerdicts.length === 0
      ? emptyState('No currently-flagged findings for this subject — it may have cleared since the dashboard loaded.')
      : h(SecurityBriefingCard, {
          group, rulesById, revealed, onReveal, itemInfoFor, findingActions, actionBusy, actionError,
          onFindingAction, openDrawers, onToggleDrawer, driftPerKey,
        }),
    div({ style: { textAlign: 'center', paddingTop: 10 } },
      btn({ onClick: onOpenTable, style: { fontSize: 12, color: 'var(--text3)', background: 'none', border: 'none', borderBottom: '1px dotted var(--text3)', cursor: 'pointer', padding: 0 } },
        '⚙ See this subject alongside every other one — sort, filter, export →')),
  );
}

// ── District Health Grid + Narrative Briefing cards (dispatch 2026-11-10, Phase 1) ─────────────
// The owner's own two design concepts (links in the dispatch commit) for this panel: "The Loss
// Prevention Briefing" (severity-striped narrative cards, headline-first) and "Security Health
// Dashboard" (a per-store score grid + drill-down). Built on this app's own existing tokens/
// helpers (subjectLabelFor, buildDecisionSentence, FindingActions, VERDICT_META/TREND_META) --
// the two mockups were read for LAYOUT and COPY TONE only, never for their own bespoke CSS.
const HEALTH_TIER_META = {
  'needs-attention': { label: 'Needs attention', color: 'var(--crit,#ef4444)' },
  watch:              { label: 'Watch', color: 'var(--amber,#f59e0b)' },
  clean:              { label: 'Clean', color: 'var(--ok,#10b981)' },
};

// dispatch 2026-11-10 follow-on -- the deep-dive doc's own district-grid mockup drives each tile's
// arrow from DRIFT, not color (§4's own words: "not just its color"). `null` (drift not computed
// for this store yet -- see computeStoreHealth's own header) renders NOTHING, never a fabricated
// "→ flat" guess.
const DRIFT_ARROW_META = {
  worsening: { arrow: '↑', label: 'worsening', color: 'var(--crit,#ef4444)' },
  improving: { arrow: '↓', label: 'improving', color: 'var(--ok,#10b981)' },
  flat:      { arrow: '→', label: 'flat', color: 'var(--text3)' },
};

// `onSelectStore(loc)` narrows the panel's existing `scope` state to that one store -- the SAME
// mechanism LocationSelector already drives, so picking a tile behaves exactly like picking that
// store in the location picker above it (every other filter -- domain, rule, min signals, date
// range -- stays exactly as set). Hidden entirely once scope is already narrowed to one store
// (see the render call site) -- a 1-tile "grid" of the store you're already looking at is noise.
function SecurityHealthGrid({ list, scope, onSelectStore }) {
  if (!list.length) return null;
  return div({ style: { padding: '10px 14px', borderBottom: '1px solid var(--bdr)' } },
    div({ style: { fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.03em', marginBottom: 8 } },
      'Store health, this scope — tap a store to focus the briefing below'),
    div({ style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8, overflowX: 'auto' } },
      list.map(row => {
        const meta = HEALTH_TIER_META[row.tier];
        const active = scope.level === 'store' && scope.value === row.loc;
        return btn({
          key: row.loc, onClick: () => onSelectStore(row.loc),
          style: {
            textAlign: 'left', padding: '10px 12px', borderRadius: 'var(--r)', cursor: 'pointer',
            border: `1.5px solid ${active ? 'var(--accent)' : meta.color}`,
            background: `${meta.color}14`, color: 'var(--text)',
          },
        },
          div({ style: { fontSize: 11.5, fontWeight: 700, marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } },
            STORE_NAMES[row.loc] || row.loc),
          div({ style: { display: 'flex', alignItems: 'baseline', gap: 6 } },
            div({ style: { fontSize: 19, fontWeight: 800, color: meta.color, fontVariantNumeric: 'tabular-nums' } }, row.score),
            row.driftDirection && (() => {
              const d = DRIFT_ARROW_META[row.driftDirection];
              return span({ title: `Trend: ${d.label}`, style: { fontSize: 13, fontWeight: 800, color: d.color } }, d.arrow);
            })(),
          ),
          div({ style: { fontSize: 10, color: 'var(--text3)' } },
            `${meta.label} · ${row.flaggedCount} signal${row.flaggedCount === 1 ? '' : 's'}${row.criticalCount ? ` · ${row.criticalCount} critical` : ''}`),
          row.insufficientCount > 0 && div({ style: { fontSize: 9.5, color: 'var(--text3)', fontStyle: 'italic', marginTop: 2 } },
            `+${row.insufficientCount} too thin on data to score`),
        );
      }),
    ),
    div({ style: { fontSize: 10, color: 'var(--text3)', marginTop: 8, fontStyle: 'italic' } },
      'Score = severity × how unusual, summed across every flagged signal at the store, plus a smaller drift nudge for a trajectory that’s worsening across its last 3-4 windows (persistence/convergence weighting is still a later phase). Not a dollar figure — see security-health.js if exactness here matters to you. ↑/↓/→ next to a score is that same drift signal, not color — it only appears once trend data has finished loading for this scope.'),
  );
}

// One severity-striped, headline-first card per FLAGGED, non-hygiene verdict -- a subject
// converging on 3 signals renders as 3 cards (one per signal), each independently investigable
// and independently case-tracked, rather than one card hiding two of three findings behind a
// click. `clear`/`undetermined`/`hygiene` verdicts never get a card here (nothing to action) --
// they still render in the Table view's full per-subject detail.
function SecurityBriefingCard({ group, rulesById, revealed, onReveal, itemInfoFor, findingActions, actionBusy, actionError, onFindingAction, openDrawers, onToggleDrawer, driftPerKey }) {
  const subjectLabel = subjectLabelFor(group, revealed, itemInfoFor);
  const flaggedVerdicts = group.verdicts.filter(v => v.pass === true && !v.lifecycleCategory);
  if (!flaggedVerdicts.length) return null;
  return h(React.Fragment, null, flaggedVerdicts.map(v => {
    const rule = rulesById[v.ruleId] || {};
    const severity = Number.isFinite(rule.severity) ? rule.severity : 1;
    const stripeColor = severity >= 4 ? 'var(--crit,#ef4444)' : severity === 3 ? 'var(--amber,#f59e0b)' : 'var(--text3)';
    const trend = classifySubjectTrend(group.historyByRule?.[v.ruleId] || [v]);
    const trendMeta = TREND_META[trend];
    // dispatch 2026-11-10 follow-on -- "Escalating"/"Recurring"/"First flag", the "Loss
    // Prevention Briefing" mockup's own trend-badge treatment. `driftPerKey` is only populated
    // once the Briefing view's drift fetch (security-panel.js's own driftHistory effect) has
    // resolved for THIS finding's own candidate key -- a key absent from the map (not a
    // candidate, or still loading) renders no badge at all rather than guessing "First flag".
    const driftKey = driftKeyFor({ loc: group.loc, ruleId: v.ruleId, empToken: group.empToken, wrin: group.wrin });
    const driftResult = driftPerKey?.get(driftKey);
    const trendBadgeKey = driftResult ? driftTrendBadge(driftResult.direction, trend) : null;
    const trendBadgeMeta = trendBadgeKey && TREND_BADGE_META[trendBadgeKey];
    const bc = v.baselineContext || {};
    const corrob = corroboratingFlags(v, rule, group.verdicts);
    const falsePositives = rule.falsePositives || [];
    const mathKey = 'math:' + (v.id || v.ruleId + group.key);
    const ruleOutKey = 'ruleout:' + (v.id || v.ruleId + group.key);
    const mathOpen = openDrawers.has(mathKey);
    const ruleOutOpen = openDrawers.has(ruleOutKey);
    const drawerBtn = { fontSize: 10.5, fontWeight: 600, color: 'var(--accent-ink,var(--text))', background: 'rgba(245,188,0,.14)', border: 'none', borderRadius: 999, padding: '4px 10px', cursor: 'pointer' };
    return div({ key: v.id || v.ruleId + group.key, style: { display: 'flex', border: '1px solid var(--bdr)', borderRadius: 'var(--r)', overflow: 'hidden', marginBottom: 10 } },
      div({ style: { width: 5, flex: '0 0 5px', background: stripeColor } }),
      div({ style: { flex: 1, minWidth: 0, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 8 } },
        div({ style: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' } },
          div({ style: { minWidth: 0 } },
            div({ style: { fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', fontWeight: 700 } }, rule.domain || v.ruleId),
            div({ style: { fontSize: 13.5, lineHeight: 1.45, color: 'var(--text)', marginTop: 2 } }, buildDecisionSentence(rule, v, subjectLabel)),
          ),
          span({ style: { flex: '0 0 auto', fontSize: 10, fontWeight: 700, color: stripeColor, border: `1px solid ${stripeColor}`, borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' } }, v.ruleId),
        ),
        div({ style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: '6px 16px', borderTop: '1px dashed var(--bdr)', borderBottom: '1px dashed var(--bdr)', padding: '8px 0' } },
          fact('Who', group.subjectType === 'emp' ? h(RevealName, { token: group.empToken, cache: revealed, onReveal }) : subjectLabel),
          fact('What', rule.method || v.ruleId),
          fact('Where', STORE_NAMES[group.loc] || `Store ${group.loc}`),
          fact('Window', `${v.windowStart} → ${v.windowEnd}`),
        ),
        corrob.length > 0 && div({ style: { fontSize: 11, color: 'var(--crit,#ef4444)' } }, `🔗 Corroborated by ${corrob.join(', ')} — also flagged for this subject.`),
        div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 } },
          div({ style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
            div({ style: { fontSize: 10.5, color: trendMeta.color, fontWeight: 600 } }, trendMeta.label),
            trendBadgeMeta && span({
              title: driftResult?.direction === 'worsening'
                ? `Rising across its last ${driftResult.windowsUsed} windows — still worth catching before it fully crosses the rule's own threshold.`
                : undefined,
              style: {
                fontSize: 10, fontWeight: 700, color: trendBadgeMeta.color,
                border: `1px solid ${trendBadgeMeta.color}`, borderRadius: 999, padding: '2px 8px',
              },
            }, trendBadgeMeta.label),
          ),
          div({ style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
            falsePositives.length > 0 && btn({ onClick: () => onToggleDrawer(ruleOutKey), style: drawerBtn }, ruleOutOpen ? 'Hide rule-outs' : 'Rule out first'),
            btn({ onClick: () => onToggleDrawer(mathKey), style: drawerBtn }, mathOpen ? 'Hide the math' : 'Show the math'),
          ),
        ),
        ruleOutOpen && div({ style: { background: 'var(--surf2)', borderRadius: 8, padding: '8px 10px', fontSize: 11.5 } },
          div({ style: { fontWeight: 700, color: 'var(--ok,#10b981)', marginBottom: 4 } }, 'Before escalating, rule out:'),
          h('ul', { style: { margin: 0, paddingLeft: 18, color: 'var(--text2)' } }, falsePositives.map((fp, i) => h('li', { key: i }, fp))),
        ),
        mathOpen && div({ style: { background: 'var(--surf2)', borderRadius: 8, padding: '8px 10px', fontSize: 11, fontFamily: 'monospace', color: 'var(--text2)', display: 'flex', flexDirection: 'column', gap: 3 } },
          div(null, `value: ${fmtValue(v.ruleId, v.value)}`),
          div(null, `threshold: ${fmtThreshold(rule.logicType, v.thresholdUsed)}`),
          bc.mean != null && div(null, `${rule.baselineType || 'baseline'}: mean ${fNum(bc.mean)}, stdev ${fNum(bc.stdev)}, n ${bc.n ?? '—'}`),
          v.exonerationShare != null && div(null, `exoneration share: ${fPct(v.exonerationShare)}`),
        ),
        v.pass === true && div({ style: { fontSize: 10.5, color: 'var(--text3)', fontStyle: 'italic' } },
          cameraReviewHint(group.loc, v.windowStart, v.windowEnd)),
        v.id && h(FindingActions, {
          findingId: v.id, actions: findingActions?.[v.id], busy: actionBusy === v.id,
          error: actionError?.[v.id], onSubmit: onFindingAction,
        }),
      ),
    );
  }));
}
function fact(k, v) {
  return div({ style: { minWidth: 0 } },
    div({ style: { fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--text3)', fontWeight: 700 } }, k),
    div({ style: { fontSize: 12, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, v));
}

// One row per subject (matches the on-screen grouping) -- the Rules column flattens every verdict
// chip into "RULE: Verdict" pairs, semicolon-joined, so the CSV still carries which rule(s) said
// what without exploding into one row per verdict.
function findingsExportSpec({ groups, domain, rulesById, revealed, itemInfoFor, scope, ruleFilter, minSignals, dateRange }) {
  const today = new Date().toISOString().slice(0, 10);
  const scopeStr = scopeLabel(scope);
  const rangeStr = dateRange && (dateRange.s || dateRange.e) ? `${dateRange.s || '…'} – ${dateRange.e || '…'}` : 'All dates';
  const rows = groups.map(g => ({
    Signals: g.flaggedCount,
    Subject: subjectLabelFor(g, revealed, itemInfoFor),
    Store: 'Store ' + g.loc,
    Rules: g.verdicts.map(v => {
      const state = verdictState(v.pass, v.lifecycleCategory);
      return v.ruleId + ': ' + (VERDICT_META[state]?.label || state);
    }).join('; '),
    'Window End': latestWindowEnd(g) || '—',
  }));
  return {
    rows,
    columns: ['Signals', 'Subject', 'Store', 'Rules', 'Window End'].map(k => ({ key: k, label: k })),
    title: `Security Findings — ${RULE_DOMAIN_LABEL[domain] || domain} — ${scopeStr}` +
      (ruleFilter ? ` — ${ruleFilter}` : '') + (minSignals !== 1 ? ` — ${minSignalsLabel(minSignals)} signals` : '') + ` — ${rangeStr}`,
    filename: `security-findings-${domain}-${today}`,
  };
}

function reportTable(headers, rows) {
  if (!rows.length) return '<p style="color:#9ca3af;font-size:12px;padding:8px 0">No findings match the current filters.</p>';
  return `<table style="width:100%;border-collapse:collapse;font-size:11px">
    <thead><tr>${headers.map(h => `<th style="padding:6px 10px;text-align:left;font-size:10px;color:#6b7280;font-weight:700;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid #e5e7eb;background:#f8fafc">${esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r, i) => `<tr style="background:${i % 2 ? '#fff' : '#fafafa'}">${r.map(c => `<td style="padding:5px 10px;border-bottom:1px solid #f1f5f9;color:#111">${c}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}
function reportSection(title, bodyHtml) {
  return `<div style="padding:20px 32px;border-top:1px solid #e5e7eb">
    <div style="font-size:11px;font-weight:700;letter-spacing:.06em;color:#6b7280;text-transform:uppercase;margin-bottom:12px">${esc(title)}</div>
    ${bodyHtml}
  </div>`;
}

// Full findings report -- same `groups` the table renders, plus the active filter summary as
// text (domain/scope/rule/min-signals/date-range) so a printed page is self-describing about what
// it does and doesn't include, matching the dispatch's "a filtered/scoped view's export reflects
// that scope, not an unfiltered dump" verification bar.
function buildSecurityPrintHtml({ groups, domain, rulesById, revealed, itemInfoFor, scope, ruleFilter, minSignals, dateRange, newestBatch }) {
  const now = new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  const scopeStr = scopeLabel(scope);
  const rangeStr = dateRange && (dateRange.s || dateRange.e) ? `${dateRange.s || '…'} – ${dateRange.e || '…'}` : 'All dates';

  const rows = groups.map(g => [
    `<b>${g.flaggedCount}</b>`,
    esc(subjectLabelFor(g, revealed, itemInfoFor)),
    'Store ' + esc(g.loc),
    g.verdicts.map(v => {
      const state = verdictState(v.pass, v.lifecycleCategory);
      const meta = VERDICT_META[state];
      return `<span style="color:${meta.color};font-weight:600">${esc(v.ruleId)}: ${esc(meta.label)}</span>`;
    }).join('<br>'),
    esc(latestWindowEnd(g) || '—'),
  ]);

  const flaggedTotal = groups.reduce((a, g) => a + g.flaggedCount, 0);
  const multiSignal = groups.filter(g => g.flaggedCount >= 2).length;

  const heroCard = (label, val, color) => `<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:8px;padding:12px 14px">
    <div style="font-size:10px;font-weight:700;letter-spacing:.06em;color:#6b7280;text-transform:uppercase;margin-bottom:5px">${esc(label)}</div>
    <div style="font-size:20px;font-weight:800;color:${color || '#0f172a'}">${esc(val)}</div>
  </div>`;
  const heroSection = `<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
      ${heroCard('Subjects Flagged', groups.length)}
      ${heroCard('Total Signals', flaggedTotal, '#ef4444')}
      ${heroCard('2+ Signal Convergence', multiSignal, multiSignal > 0 ? '#ef4444' : '#0f172a')}
      ${heroCard('Latest Batch', newestBatch ? new Date(newestBatch).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—')}
    </div>`;

  const filterLine = `Domain: ${RULE_DOMAIN_LABEL[domain] || domain} &nbsp;·&nbsp; Scope: ${esc(scopeStr)} &nbsp;·&nbsp; ` +
    `Rule filter: ${esc(ruleFilter || 'All')} &nbsp;·&nbsp; Min signals: ${esc(minSignalsLabel(minSignals))} &nbsp;·&nbsp; Window ending: ${esc(rangeStr)}`;

  const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Security Findings — Report</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;color:#111;font-size:13px}
  @media print{
    body{background:white}
    .no-print{display:none!important}
    .page{box-shadow:none!important;margin:0!important;border-radius:0!important;max-width:100%!important}
  }
</style>
</head><body>
<div class="no-print" style="background:#1e293b;padding:12px 24px;display:flex;align-items:center;gap:12px">
  <span style="color:#f59e0b;font-weight:800;font-size:16px">Meridian</span>
  <span style="color:#94a3b8;font-size:13px">Security Findings — Report</span>
  <button onclick="window.print()" style="margin-left:auto;background:#f59e0b;border:none;color:#000;padding:7px 20px;border-radius:6px;font-weight:700;cursor:pointer;font-size:13px">🖨 Print / Save as PDF</button>
  <button onclick="window.close()" style="background:transparent;border:1px solid #475569;color:#94a3b8;padding:7px 14px;border-radius:6px;cursor:pointer">Close</button>
</div>
<div class="page" style="max-width:1000px;margin:24px auto;background:white;border-radius:12px;box-shadow:0 4px 24px rgba(0,0,0,.10);overflow:hidden">
  <div style="background:linear-gradient(135deg,#0f172a 0%,#1e3a5f 100%);padding:28px 32px;color:white">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="font-size:11px;letter-spacing:.08em;color:#94a3b8;text-transform:uppercase;margin-bottom:6px">Loss Prevention Report</div>
        <div style="font-size:26px;font-weight:900;letter-spacing:-.5px">🔒 Security Findings</div>
        <div style="margin-top:8px;font-size:12px;color:#94a3b8">${filterLine}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#94a3b8">Generated</div>
        <div style="font-size:16px;font-weight:700;color:#f59e0b">${now}</div>
      </div>
    </div>
  </div>

  ${reportSection('Summary', heroSection)}
  ${reportSection('Findings — ' + groups.length + ' subject' + (groups.length === 1 ? '' : 's'),
    reportTable(['Signals', 'Subject', 'Store', 'Rules', 'Window End'], rows))}

  <div style="padding:12px 32px;background:#0f172a;display:flex;justify-content:space-between;align-items:center">
    <span style="color:#f59e0b;font-weight:800;font-size:14px">Meridian</span>
    <span style="color:#475569;font-size:11px">CONFIDENTIAL — Loss Prevention · Generated ${now}</span>
  </div>
</div>
</body></html>`;
  return html;
}

// The panel body. `ds`/`stores` unused today (Phase 1 has no cross-panel data dependency beyond
// its own on-demand loads, per dispatch #43's "on-demand, not eager at startup" requirement --
// auditRows was deliberately pulled OUT of the eager startup batch under #191, and this must not
// reintroduce that cost). userRole/gmRevealEnabled drive the permission state machine below.
// `initialView` is a test-only seam (never passed by any real caller -- panel-registry.js's own
// entry takes no props beyond userRole/onClose) letting the existing Table-view test suite keep
// asserting Table's own content/wiring without first clicking the toggle on every one of its ~70
// render call sites; the real default below ('command') is untouched for every actual user.
export function SecurityPanel({ userRole, onClose, initialView }) {
  const [permState, setPermState] = React.useState('checking'); // checking | denied | allowed
  const [dataState, setDataState] = React.useState('idle');     // idle | loading | loaded | error
  const [findings, setFindings] = React.useState([]);
  const [rules, setRules] = React.useState([]);
  const [domain, setDomain] = React.useState('cash'); // 'cash' | 'inventory' | 'labor' | 'events'
  const [scope, setScope] = React.useState({ level: 'all' });
  const [ruleFilter, setRuleFilter] = React.useState(null);
  const [minSignals, setMinSignals] = React.useState(1);
  // dispatch #100 -- date-range filter, on windowEnd (see windowEndInRange's own comment for why).
  // null = unbounded (the pre-#100 behavior, unchanged) -- {s,e} is DateRangeControl's own shape.
  const [dateRange, setDateRange] = React.useState(null);
  const [expanded, setExpanded] = React.useState(null);
  // dispatch 2026-11-10, IA redesign -- which subject (by groupFindingsBySubject key) the new
  // 'brief' view shows. Set only by onReviewSubject, below; cleared implicitly by navigating away
  // (no explicit reset needed -- a stale key just means briefGroup's memo returns null, handled by
  // its own empty state).
  const [briefKey, setBriefKey] = React.useState(null);
  // This dispatch -- the bulk `findings` load may now be reading security_findings_latest (one
  // window per rule, see loadSecurityFindings' own header), which is all the closed/list view ever
  // needed (verdicts already dedupe to "latest window per rule" regardless). Chronic/trend
  // classification for the ONE subject a reader expands needs real multi-window history though --
  // fetched lazily (see the effect right after `groups` below, which this state feeds) and cached
  // by group key so it's never re-fetched once loaded. The group's own (possibly single-window)
  // historyByRule renders unchanged while this is in flight, exactly like SubjectDrilldown's
  // existing "Investigate further" progressive-disclosure shape.
  const [subjectHistory, setSubjectHistory] = React.useState({});
  // dispatch #120 -- findings table sort. 'signals' + 'desc' is the default and, per
  // sortFindingsForDisplay's own comment, renders identically to the pre-table card order.
  const [sortKey, setSortKey] = React.useState('signals');
  const [sortDir, setSortDir] = React.useState('desc');
  const toggleSort = (key) => {
    if (key === sortKey) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir(key === 'subject' || key === 'rule' ? 'asc' : 'desc'); }
  };
  // dispatch 2026-11-10 (IA redesign, owner request) -- 'command' (the cross-domain dashboard) is
  // now the DEFAULT landing view, not 'table'. This reverses the posture this comment used to
  // document ("Flipping the default would mean rewriting ~40 tests... revisit once Briefing has
  // had real eyes on it") now that the actual blocker is gone: persistence/convergence scoring has
  // landed, Command Center has had real eyes on it, and a new 'brief' view (SubjectBriefView,
  // below) now gives a one-click path from the dashboard into a single subject's real narrative —
  // closing the owner's own "less to click, lead with the dashboard, keep the engine reachable but
  // not the default" ask. Table is UNCHANGED and fully intact; it is reached via the explicit
  // "⚙ Open the full data engine" link CommandCenterView renders, or the view toggle below, never
  // removed, never degraded — only demoted from "the first thing you see" to "one click away."
  const [view, setView] = React.useState(initialView || 'command');
  // Drawer open/closed state for the briefing cards' own "Rule out first"/"Show the math"
  // toggles, keyed by a string built in SecurityBriefingCard -- a plain Set, same shape
  // mathOpen/ruleOutOpen used in the original Loss Prevention Briefing mockup this is built from.
  const [openDrawers, setOpenDrawers] = React.useState(() => new Set());
  const toggleDrawer = React.useCallback((key) => {
    setOpenDrawers(prev => { const next = new Set(prev); next.has(key) ? next.delete(key) : next.add(key); return next; });
  }, []);
  const [revealed, setRevealed] = React.useState({});
  const [showLegend, setShowLegend] = React.useState(() => {
    try { return localStorage.getItem(LEGEND_DISMISSED_KEY) !== '1'; } catch { return true; }
  });
  const dismissLegend = React.useCallback(() => {
    setShowLegend(false);
    try { localStorage.setItem(LEGEND_DISMISSED_KEY, '1'); } catch {}
  }, []);
  const onReveal = React.useCallback((token, name) => setRevealed(r => ({ ...r, [token]: name })), []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      // Was a hand-duplicated copy of securityPanelAccess()'s own admin/owner/area_supervisor
      // check (and drifted from it, still checking the stale 'supervisor' string after the
      // exported function was corrected) -- call the real one instead of re-deriving it.
      if (securityPanelAccess(userRole, false) === 'allowed') { if (!cancelled) setPermState('allowed'); return; }
      if (userRole !== 'manager' && userRole !== 'gm') { if (!cancelled) setPermState('denied'); return; }
      const enabled = await loadGmIdentityRevealEnabled();
      if (!cancelled) setPermState(securityPanelAccess(userRole, enabled));
    })();
    return () => { cancelled = true; };
  }, [userRole]);

  // Owner request 2026-10-17 (app_access_log) -- log every actually-ALLOWED view, from every
  // role security.view admits (not just admin/owner -- this is the whole point: admin/owner are
  // the ones who READ the log, everyone else's views are what gets logged). Fires once per
  // permState transition to 'allowed', best-effort, never blocks the panel.
  React.useEffect(() => {
    if (permState === 'allowed') logAppAccess('panel_view', 'security').catch(() => {});
  }, [permState]);

  // Deliberately depends ONLY on permState, not on dataState -- a real bug found by the
  // permitted-but-empty test, not assumed away: including dataState (which THIS effect itself
  // sets, first to 'loading' then 'loaded') meant the effect re-ran on its own state change,
  // React ran the previous instance's cleanup first (as it always does before a dependency-
  // triggered re-run), that cleanup set `cancelled = true`, and the in-flight fetch's own
  // `if (cancelled) return` discarded its result right before it would have called
  // setDataState('loaded') -- a self-cancellation that left the panel stuck on "Loading
  // findings…" forever. The internal `dataState !== 'idle'` guard still exists and still does
  // its job (skip if somehow re-entered); it just must not ALSO be a dependency that retriggers
  // the effect.
  React.useEffect(() => {
    if (permState !== 'allowed' || dataState !== 'idle') return;
    let cancelled = false;
    setDataState('loading');
    (async () => {
      const [f, r] = await Promise.all([loadSecurityFindings(), loadSecurityRules()]);
      if (cancelled) return;
      setFindings(f); setRules(r); setDataState('loaded');
    })().catch(() => { if (!cancelled) setDataState('error'); });
    return () => { cancelled = true; };
  }, [permState]);

  // dispatch #50 Part B -- frictionless reveal for the privileged tier only: "Developer/Admin/
  // Owner" in the owner's own words. ⚠️ CORRECTED (RBAC audit, 2026-09-16) -- this used to check
  // only 'admin', on the stale pre-dispatch-#148 assumption that 'owner' collapsed into the same
  // DB value; 'owner' is now a real, distinct, equally-top-tier role (permissions.js's
  // DEFAULT_ROLES: both level 1), so a real owner-role profile was silently excluded from the
  // exact tier this comment says it belongs to. Area_supervisor/manager/GM keep the existing
  // click-through RevealName path unchanged -- this is additive, not a widening of who MAY
  // reveal (securityPanelAccess already allows all three), only who is asked to click.
  // A ref, not a state flag, guards this to run exactly once per mount: it must not re-fire if
  // `findings` happens to get a new array reference for an unrelated reason, and it must not be a
  // dependency itself (same self-retrigger risk the data-load effect's own comment above warns
  // about -- this effect sets `revealed` via onReveal, which is not read by anything this effect
  // depends on, but the ref keeps that invariant explicit rather than relying on it never changing).
  const bulkRevealTried = React.useRef(false);
  React.useEffect(() => {
    if ((userRole !== 'admin' && userRole !== 'owner') || dataState !== 'loaded' || bulkRevealTried.current) return;
    const tokens = [...new Set(findings.map(f => f.empToken).filter(Boolean))];
    if (!tokens.length) return; // nothing to resolve (an inventory-only run, or empty) -- no call
    bulkRevealTried.current = true;
    let cancelled = false;
    (async () => {
      try {
        const res = await supabase.rpc('reveal_employee_identities_bulk', {
          p_tokens: tokens,
          p_reason: 'Automatic reveal -- privileged tier (dispatch #50 Part B)',
        });
        const data = res?.data;
        if (res?.error || cancelled || !Array.isArray(data)) return;
        // Never log or console.error a name here -- an error/rejection above already returned
        // before this line; nothing past it ever prints `data` itself.
        data.forEach(row => onReveal(row.token, row.employee_name));
      } catch {
        // A network exception falls back to the existing click-through path silently -- same
        // failure posture RevealName's own reveal() already has for the single-token path.
      }
    })();
    return () => { cancelled = true; };
  }, [userRole, dataState, findings, onReveal]);

  const rulesById = React.useMemo(() => Object.fromEntries(rules.map(r => [r.ruleId, r])), [rules]);
  const domainRuleIds = React.useMemo(() =>
    new Set(rules.filter(r => r.domain === domain).map(r => r.ruleId)), [rules, domain]);

  // dispatch 2026-11-10 -- Command Center's own cross-domain data, independent of the `domain`/
  // `ruleFilter`/`minSignals`/`dateRange` state the Table/Briefing views' `groups` memo below is
  // scoped to. Deliberately unfiltered by those -- the whole point of this view is "every open
  // rule, every domain, one screen," not one policy at a time. Still respects `scope` (the shared
  // LocationSelector), same as every other view in this panel.
  const commandGroups = React.useMemo(() => buildCommandGroups(findings, scope), [findings, scope]);
  const domainBreakdown = React.useMemo(() => buildDomainBreakdown(findings, rulesById, rules, scope),
    [findings, rulesById, rules, scope]);
  const topRules = React.useMemo(() => buildTopContributingRules(findings, rulesById, scope), [findings, rulesById, scope]);
  // dispatch 2026-11-10, IA redesign -- the one subject the 'brief' view renders, found cross-
  // domain (commandGroups, not the domain-scoped Table `groups` below) since a real subject's
  // convergence can span more than one domain and Brief's whole point is showing all of it at
  // once. Merges in the lazily-fetched full history exactly like Table/Briefing's own groups do,
  // so trend/drift classification in SecurityBriefingCard has real multi-window data once it
  // resolves, not just the single latest-window verdict the bulk load always carries.
  const briefGroup = React.useMemo(() => {
    const g = commandGroups.find(x => x.key === briefKey);
    if (!g) return null;
    return subjectHistory[g.key] ? { ...g, historyByRule: subjectHistory[g.key] } : g;
  }, [commandGroups, briefKey, subjectHistory]);

  const groups = React.useMemo(() => {
    // 'labor' subjects are empToken-based too (an employee for LABOR-001/002, a manager --
    // resolved into the same emp_token column -- for LABOR-003), same identity shape as 'cash'.
    // Only 'inventory' subjects are wrin-based, so this reads as an explicit exclusion rather
    // than a three-way list that silently needs a fourth branch for the next emp-keyed domain.
    const bySubjectType = domain === 'inventory' ? 'wrin' : 'emp';
    return groupFindingsBySubject(findings)
      .filter(g => g.subjectType === bySubjectType)
      .filter(g => scopeMatches(g.loc, scope))
      .filter(g => !ruleFilter || g.verdicts.some(v => v.ruleId === ruleFilter))
      .filter(g => g.flaggedCount >= minSignals)
      // dispatch #100 -- windowEndInRange added alongside the pre-existing domainRuleIds check,
      // same placement/shape as that check: a subject with NO verdict inside the selected range
      // (in the current domain) drops out via the .filter below, exactly how a subject with no
      // verdict in the current domain already drops out today. dateRange===null is unbounded, so
      // this is a no-op until a range is actually picked.
      .map(g => ({ ...g, verdicts: g.verdicts.filter(v => domainRuleIds.has(v.ruleId) && windowEndInRange(v.windowEnd, dateRange)) }))
      .filter(g => g.verdicts.length > 0);
  }, [findings, domain, scope, ruleFilter, minSignals, domainRuleIds, dateRange]);

  // dispatch #120 -- see sortFindingsForDisplay's own header comment for the 'signals'/'desc'
  // no-op case that keeps the default view identical to the pre-table order.
  const sortedGroups = React.useMemo(() => sortFindingsForDisplay(groups, sortKey, sortDir), [groups, sortKey, sortDir]);

  // Lazy per-subject full history -- see subjectHistory's own declaration above for why. Fires at
  // most ONCE per subject per panel session, tracked via a ref (not subjectHistory state itself --
  // a genuinely empty result must still count as "attempted," or every re-expand of a subject with
  // no recoverable history would re-fetch forever). The ref is marked BEFORE the await starts, so
  // a rapid expand/collapse/re-expand while the first fetch is still in flight can't double-fire.
  const subjectHistoryAttempted = React.useRef(new Set());
  React.useEffect(() => {
    if (!expanded || subjectHistoryAttempted.current.has(expanded)) return;
    const g = groups.find(x => x.key === expanded);
    if (!g) return;
    subjectHistoryAttempted.current.add(expanded);
    let cancelled = false;
    (async () => {
      const rows = await loadSecurityFindingsForSubject({ loc: g.loc, empToken: g.empToken, wrin: g.wrin });
      if (cancelled || !rows.length) return;
      setSubjectHistory(prev => ({ ...prev, [expanded]: buildHistoryByRule(rows) }));
    })();
    return () => { cancelled = true; };
  }, [expanded, groups]);

  // dispatch 2026-11-09 -- case-tracking actions, fetched lazily per expanded subject (same shape
  // as the subjectHistory effect immediately above it -- "on-demand, not eager at startup").
  // findingActionsAttempted tracks individual FINDING ids, not subject keys, since a subject's
  // verdicts span multiple rules/finding rows and each needs its own fetch tracked once.
  const [findingActions, setFindingActions] = React.useState({}); // findingId -> action[]
  const [actionBusy, setActionBusy] = React.useState(null); // the one findingId currently submitting, or null
  const [actionError, setActionError] = React.useState({}); // findingId -> last submit error message, or absent
  const findingActionsAttempted = React.useRef(new Set());
  React.useEffect(() => {
    if (!expanded) return;
    const g = groups.find(x => x.key === expanded);
    if (!g) return;
    const toFetch = g.verdicts.map(v => v.id).filter(id => id && !findingActionsAttempted.current.has(id));
    if (!toFetch.length) return;
    toFetch.forEach(id => findingActionsAttempted.current.add(id));
    let cancelled = false;
    (async () => {
      const rows = await loadSecurityFindingActionsForFindings(toFetch);
      if (cancelled || !rows.length) return;
      setFindingActions(prev => {
        const next = { ...prev };
        for (const r of rows) next[r.findingId] = [...(next[r.findingId] || []), r];
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [expanded, groups]);

  // dispatch 2026-11-10 -- Command Center's Case Queue + each Employee Watchlist row's Status
  // cell both need the latest action on every CURRENTLY FLAGGED finding across the whole scope,
  // not just whichever one subject a reader has expanded. Reuses the EXACT SAME findingActions
  // cache / findingActionsAttempted ref the per-expanded-subject effect above already maintains
  // (one shared cache, no duplicate fetch for an id either path has already attempted) -- this is
  // additive, not a second mechanism.
  React.useEffect(() => {
    if (view !== 'command') return;
    const toFetch = [];
    for (const g of commandGroups) {
      for (const v of g.verdicts) {
        if (v.pass === true && !v.lifecycleCategory && v.id && !findingActionsAttempted.current.has(v.id)) toFetch.push(v.id);
      }
    }
    if (!toFetch.length) return;
    toFetch.forEach(id => findingActionsAttempted.current.add(id));
    let cancelled = false;
    (async () => {
      const rows = await loadSecurityFindingActionsForFindings(toFetch);
      if (cancelled || !rows.length) return;
      setFindingActions(prev => {
        const next = { ...prev };
        for (const r of rows) next[r.findingId] = [...(next[r.findingId] || []), r];
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [view, commandGroups]);

  const caseQueue = React.useMemo(() => tallyCaseQueue(commandGroups, findingActions), [commandGroups, findingActions]);

  const handleFindingAction = React.useCallback(async (findingId, action, note) => {
    setActionBusy(findingId);
    setActionError(prev => { const { [findingId]: _drop, ...rest } = prev; return rest; });
    try {
      const saved = await saveSecurityFindingAction({ findingId, action, note, role: userRole });
      setFindingActions(prev => ({ ...prev, [findingId]: [...(prev[findingId] || []), saved] }));
    } catch (e) {
      // security_finding_actions' own write path throws deliberately (its header comment: "a
      // write failure must never degrade silently") -- most likely cause right now is the table
      // itself not existing yet (the owner hasn't run schema-security-finding-actions.sql), so
      // this must actually reach the screen, not just the console.
      console.warn('[SecurityPanel] saveSecurityFindingAction failed:', e.message);
      setActionError(prev => ({ ...prev, [findingId]: e.message || 'Could not save — try again.' }));
    } finally {
      setActionBusy(null);
    }
  }, [userRole]);

  // dispatch 2026-11-10, IA redesign -- Command Center's "Review →" action now lands on the new
  // 'brief' view (SubjectBriefView, below) instead of jumping straight into Table. Still sets
  // domain/scope/minSignals/expanded exactly as before -- not for Brief itself (which reads
  // `commandGroups`, cross-domain, independent of these), but so that if the reader clicks
  // Brief's own "Open in full table" gateway, Table is already scoped/expanded to this exact
  // subject, same as this action always promised. `leadDomain` picks which of this subject's
  // (possibly several) flagged domains that gateway lands on -- EmployeeWatchlistRow passes its
  // own highest-severity verdict's domain.
  const onReviewSubject = React.useCallback((group, leadDomain) => {
    setDomain(leadDomain);
    setRuleFilter(null);
    setMinSignals(DOMAIN_DEFAULT_MIN_SIGNALS[leadDomain] ?? 1);
    setScope({ level: 'store', value: group.loc });
    setExpanded(group.key);
    setBriefKey(group.key);
    setView('brief');
  }, []);

  const newestBatch = React.useMemo(() =>
    findings.reduce((m, f) => (!m || (f.computedAt && f.computedAt > m)) ? f.computedAt : m, null), [findings]);

  // dispatch 2026-11-10 follow-on -- drift/trajectory history. Fetched ONCE, only once the
  // Briefing view is actually open (never for Table-view-only use -- matching this panel's own
  // "lazy by default, on-demand not eager at startup" discipline the whole file follows), and
  // bounded to the real candidate set selectDriftCandidates() resolves from the ALREADY-loaded
  // bulk `findings` -- never a full-district multi-window pull. See
  // loadSecurityFindingsRecentHistoryForKeys' own header (src/lib/supabase.js) for the real
  // row-count measurements (242,074-row base table; a flat recent-days filter costs 43-65k rows
  // AND still misses a rule family whose own cron history is stale; targeting by candidate
  // instead costs a bounded, real 1,877-subject fetch) that ruled out an eager full pull.
  // ref-guarded so it fires at most once per panel session, same shape as subjectHistoryAttempted
  // above -- `findings` only changes on a fresh load, which already remounts this whole tree.
  const [driftHistory, setDriftHistory] = React.useState(null); // null = not fetched yet; Map once resolved (possibly empty)
  const driftFetchAttempted = React.useRef(false);
  React.useEffect(() => {
    // dispatch 2026-11-10 follow-on -- widened to also fire for Command Center: that view's own
    // store-health grid (reusing SecurityHealthGrid/healthList verbatim) and this same
    // driftHistory now also feed persistence's score term, so Command Center needs this fetch too,
    // not just Briefing.
    if ((view !== 'briefing' && view !== 'command') || dataState !== 'loaded' || driftFetchAttempted.current || !findings.length) return;
    driftFetchAttempted.current = true;
    let cancelled = false;
    (async () => {
      const candidates = selectDriftCandidates(findings, rulesById);
      if (!candidates.length) { if (!cancelled) setDriftHistory(new Map()); return; }
      const rows = await loadSecurityFindingsRecentHistoryForKeys(candidates, { lookbackWindows: DRIFT_LOOKBACK_WINDOWS + 2 });
      if (cancelled) return;
      const byKey = new Map();
      for (const r of rows) {
        const key = driftKeyFor(r);
        if (!byKey.has(key)) byKey.set(key, { loc: r.loc, ruleId: r.ruleId, history: [] });
        byKey.get(key).history.push(r);
      }
      // Oldest-to-newest, the same ordering convention buildHistoryByRule already establishes --
      // classifySubjectDrift's own slice(-lookback) depends on it.
      for (const rec of byKey.values()) {
        rec.history.sort((a, b) => (a.windowEnd || '').localeCompare(b.windowEnd || '') || (a.computedAt || '').localeCompare(b.computedAt || ''));
      }
      setDriftHistory(byKey);
    })().catch(() => {
      // A hard failure (not the per-chunk try/catch loadSecurityFindingsRecentHistoryForKeys
      // already has, but e.g. a thrown network exception before any chunk resolves) must not
      // leave driftHistory stuck at null forever -- driftFetchAttempted is already true, so
      // nothing would ever retry. Degrading to "fetched, found nothing" is the same honest
      // fallback an empty candidate set already gets a few lines up: the grid/cards render
      // Phase 1's own numbers with no drift extras, never a silent hang.
      if (!cancelled) setDriftHistory(new Map());
    });
    return () => { cancelled = true; };
  }, [view, dataState, findings, rulesById]);

  // One pass over driftHistory -> both the health-score's own extra term AND the district grid's
  // per-store arrow (computeDriftRollup's own header -- a single pass so the two views can never
  // disagree about what the same history classified as). null (not yet fetched) is a real,
  // distinct state from "fetched and found nothing" -- storeHealthList below treats either the
  // same way (both omit the drift extras), so the grid/score render Phase 1's exact numbers while
  // this is in flight, then update once it resolves -- the same progressive-disclosure shape
  // SubjectDrilldown's "Investigate further" already established in this file.
  const driftRollup = React.useMemo(() => (driftHistory ? computeDriftRollup(driftHistory, rulesById) : null), [driftHistory, rulesById]);
  const driftContributions = React.useMemo(() => (driftRollup
    ? [...driftRollup.byLoc.values()].filter(r => r.contribution > 0).map(r => ({ loc: r.loc, amount: r.contribution }))
    : null), [driftRollup]);
  // dispatch 2026-11-10 follow-on -- persistence, computed from the SAME driftHistory fetch (see
  // security-persistence.js's own header for why no second query is needed). null until that fetch
  // resolves, exactly like driftContributions -- storeHealthList already treats either extra's
  // absence as "render Phase 1's own numbers, no extras yet," so this needs no new empty-state.
  const persistenceRollup = React.useMemo(() => (driftHistory ? computePersistenceRollup(driftHistory, rulesById) : null), [driftHistory, rulesById]);
  const persistenceContributions = React.useMemo(() => (persistenceRollup
    ? [...persistenceRollup.values()].filter(r => r.contribution > 0).map(r => ({ loc: r.loc, amount: r.contribution }))
    : null), [persistenceRollup]);
  const driftDirectionByLoc = React.useMemo(() => {
    if (!driftRollup) return null;
    const out = {};
    for (const [loc, row] of driftRollup.byLoc) out[loc] = driftDirectionForStore(row);
    return out;
  }, [driftRollup]);

  // dispatch 2026-11-10 -- the district health grid's own data, computed across EVERY domain/
  // rule at once (see security-health.js's own header for why) -- from the bulk `findings` +
  // `rulesById` this panel already loaded, independent of whatever domain tab/scope/rule filter
  // is currently selected for the briefing feed below it. Phase 2 follow-on: drift extras folded
  // in via the SAME optional, additive hook computeStoreHealth itself documents -- omitted
  // entirely (driftContributions/driftDirectionByLoc both null) until the fetch above resolves.
  const healthList = React.useMemo(() => storeHealthList(findings, rulesById, { driftContributions, driftDirectionByLoc, persistenceContributions }),
    [findings, rulesById, driftContributions, driftDirectionByLoc, persistenceContributions]);

  // dispatch #56 Part C -- "list the name of the product." `${loc}|${wrin}|${period}` ->
  // {descr, cls} from qsr_variance_stat, so an inventory subject's heading can show the item name
  // instead of a bare WRIN. On-demand, matching dispatch #43's discipline: fires only while
  // viewing the inventory tab, and only for periods actually present among the currently-loaded
  // findings (loadQsrVarianceStat({period}) is a whole-estate pull for one period, the same call
  // SubjectDrilldown already makes for the population baseline). loadedPeriodsRef guards against
  // re-fetching a period already resolved when `groups` gets a new reference from an unrelated
  // filter change (scope/ruleFilter/minSignals).
  const [itemInfo, setItemInfo] = React.useState({});
  const loadedPeriodsRef = React.useRef(new Set());
  React.useEffect(() => {
    if (domain !== 'inventory' || dataState !== 'loaded') return;
    const periods = [...new Set(groups.map(g => inventoryItemKey(g, domainRuleIds)?.period).filter(Boolean))];
    const toLoad = periods.filter(p => !loadedPeriodsRef.current.has(p));
    if (!toLoad.length) return;
    toLoad.forEach(p => loadedPeriodsRef.current.add(p));
    let cancelled = false;
    (async () => {
      const results = await Promise.all(toLoad.map(period => loadQsrVarianceStat({ period })));
      if (cancelled) return;
      setItemInfo(prev => {
        const next = { ...prev };
        results.forEach((rows, i) => {
          const period = toLoad[i];
          for (const r of (rows || [])) next[`${r.loc}|${r.wrin}|${period}`] = { descr: r.descr, cls: r.cls };
        });
        return next;
      });
    })();
    return () => { cancelled = true; };
  }, [domain, dataState, groups, domainRuleIds]);

  const domainRules = rules.filter(r => r.domain === domain);
  // dispatch #120 -- {loc} shape only, matching report-subscriptions.js's own LocationSelector
  // wiring: it derives state/patch/store tiers itself from INV_ORG_COORDS. Every loc
  // INV_ORG_COORDS knows about, same store universe the old hand-rolled storeLocs pill row used.
  const _stores = React.useMemo(() => Object.keys(INV_ORG_COORDS).map(loc => ({ loc })), []);

  // Dispatch #143 -- CSV/JSON export (ExportDropdown) + full print report, both built from
  // `sortedGroups` -- the exact filtered/sorted rows the table below renders -- so print/export
  // always matches the active domain/scope/rule/min-signals/date-range filter, never an
  // unfiltered dump. itemInfoFor resolves the same (loc,wrin,period) item-name lookup SubjectRow
  // uses for the inventory domain, so an item's product name (not just its WRIN) prints/exports
  // too, once resolved.
  const itemInfoFor = React.useCallback(g => {
    if (domain !== 'inventory') return null;
    const ik = inventoryItemKey(g, domainRuleIds);
    return ik ? itemInfo[ik.key] : null;
  }, [domain, domainRuleIds, itemInfo]);

  const exportSpec = React.useMemo(() => findingsExportSpec({
    groups: sortedGroups, domain, rulesById, revealed, itemInfoFor, scope, ruleFilter, minSignals, dateRange,
  }), [sortedGroups, domain, rulesById, revealed, itemInfoFor, scope, ruleFilter, minSignals, dateRange]);

  const handlePrintReport = React.useCallback(() => {
    const html = buildSecurityPrintHtml({
      groups: sortedGroups, domain, rulesById, revealed, itemInfoFor, scope, ruleFilter, minSignals, dateRange, newestBatch,
    });
    printHtml(html, { autoPrint: false });
  }, [sortedGroups, domain, rulesById, revealed, itemInfoFor, scope, ruleFilter, minSignals, dateRange, newestBatch]);

  // Dispatch #50 Part A -- owner: "scroll not working in the modal." Root cause: a flex item's
  // default min-height is 'auto' (content-based), not 0, so a flex column refuses to shrink below
  // its own content. This root div has NO overflow set (visible), so it never gets the CSS spec's
  // "automatic minimum size is zero" exception -- unlike ModalShell's own body div (App.js:2856's
  // bodyStyle sets overflow:'hidden' on itself, which DOES qualify). Without minHeight:0 here, this
  // column grows past ModalShell's 88vh cap and ModalShell's overflow:'hidden' clips it instead of
  // the body div below (:line ~474) ever getting squeezed enough to need its own scrollbar. Needed
  // at BOTH levels: this root (the one actually refusing to shrink) AND the body div below (belt-
  // and-suspenders -- its own overflowY:'auto' should self-qualify per spec, but cross-browser
  // automatic-minimum-size support for that exception has a real inconsistency history, so an
  // explicit minHeight:0 there too costs nothing and removes the reliance on it).
  return div({ style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
    // ── Domain tabs + Legend ── entirely hidden in 'brief' (dispatch 2026-11-10, IA redesign):
    // SubjectBriefView is reached by clicking a specific subject, not by filtering a list, and
    // renders its own "← Dashboard" link -- this whole chrome bar (domain tabs, Legend toggle,
    // view switcher, export) describes operations on a LIST of subjects that Brief doesn't show.
    view !== 'brief' && div({ style: { display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--bdr)', flexWrap: 'wrap', alignItems: 'center' } },
      // dispatch 2026-11-10 -- hidden in Command Center: that view is deliberately cross-domain
      // ("every open rule, every domain, one screen"), so a single-domain filter here would look
      // like it applies and silently not, which is worse than not offering it at all.
      view !== 'command' && ['cash', 'inventory', 'labor', 'events'].map(d => btn({
        key: d, onClick: () => { setDomain(d); setRuleFilter(null); setMinSignals(DOMAIN_DEFAULT_MIN_SIGNALS[d] ?? 1); },
        style: {
          padding: '5px 12px', borderRadius: 'var(--r)', border: '1px solid ' + (domain === d ? 'var(--accent)' : 'var(--bdr)'),
          background: domain === d ? 'rgba(245,188,0,.12)' : 'transparent', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        },
      }, DOMAIN_TAB_LABEL[d] || d)),
      btn({
        onClick: () => setShowLegend(s => !s),
        style: { fontSize: 11, color: 'var(--text3)', background: 'none', border: '1px solid var(--bdr)', borderRadius: 999, padding: '4px 10px', cursor: 'pointer' },
      }, '❓ Legend'),
      // dispatch 2026-11-10 -- Briefing/Table (unchanged) vs Command Center (new, cross-domain --
      // see CommandCenterView's own header for what it reuses vs. adds). A view choice, not a
      // filter -- doesn't touch `groups`.
      div({ style: { display: 'flex', gap: 2, border: '1px solid var(--bdr)', borderRadius: 999, padding: 2 } },
        ['briefing', 'table', 'command'].map(v => btn({
          key: v, onClick: () => setView(v),
          style: {
            fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: view === v ? 'var(--accent,#f5bc00)' : 'transparent', color: view === v ? '#000' : 'var(--text3)',
          },
        }, v === 'briefing' ? '🩺 Briefing' : v === 'table' ? '🗂 Table' : '🖥 Command Center')),
      ),
      // Dispatch #143 -- CSV/JSON export + full print report, both scoped to the currently
      // filtered/sorted findings table (sortedGroups) via exportSpec/handlePrintReport above.
      // Hidden until there's something to export, matching every other panel's convention.
      permState === 'allowed' && dataState === 'loaded' && sortedGroups.length > 0 && div({
        style: { marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center' } },
        h(React.Suspense, {
          fallback: h('button', { style: { fontSize: 11, padding: '4px 10px', borderRadius: 999, border: '1px solid var(--bdr)', background: 'none', color: 'var(--text3)', opacity: .5 }, disabled: true }, '⬇ Export') },
          h(LazyExportDropdown, {
            rows: exportSpec.rows, columns: exportSpec.columns, title: exportSpec.title, filename: exportSpec.filename,
          }),
        ),
        btn({
          onClick: handlePrintReport,
          style: { fontSize: 11, color: 'var(--text3)', background: 'none', border: '1px solid var(--bdr)', borderRadius: 999, padding: '4px 10px', cursor: 'pointer' },
        }, '🖨 Print Report'),
      ),
      newestBatch && span({ style: { fontSize: 10.5, color: 'var(--text3)' } }, `Latest batch: ${fDateTime(newestBatch)}`),
    ),
    // dispatch #120 -- location scope, on its own row: the shared LocationSelector in
    // mode:'progressive' (dispatch #104), replacing the hand-rolled All/State/Org/Store pill row
    // that put ~30 pills on screen simultaneously (unusable on mobile, per the owner's own
    // screenshot). Progressive reveals one tier at a time -- States first, picking a State reveals
    // its Patches, picking a Patch reveals its Stores -- so the pill count per screen stays small.
    // scope keeps this panel's own {level,value} shape (panel-contract.md §3); translated at this
    // boundary only via scopeToSelectorValue/selectorValueToScope.
    // dispatch 2026-11-10, IA redesign -- hidden in 'brief' too: a scope selector for filtering a
    // LIST of subjects makes no sense once the reader is already looking at one specific subject.
    view !== 'brief' && div({ style: { padding: '8px 14px', borderBottom: '1px solid var(--bdr)' } },
      h(LocationSelector, {
        stores: _stores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, mode: 'progressive',
        value: scopeToSelectorValue(scope), onChange: v => setScope(selectorValueToScope(v)),
      }),
    ),
    // dispatch #46 §A point 2 -- a legend defining the vocabulary, dismissible and remembered.
    view !== 'brief' && showLegend && h(Legend, { onDismiss: dismissLegend, rules }),
    // ── Rule + signal filters ── hidden in Command Center and Brief, same reasoning as the domain tabs above.
    view !== 'command' && view !== 'brief' && dataState === 'loaded' && div({ style: { padding: '8px 14px', borderBottom: '1px solid var(--bdr)' } },
      div({ style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 11 } },
        span({ style: { color: 'var(--text3)' } }, 'Rule:'),
        pill('All', !ruleFilter, () => setRuleFilter(null)),
        // dispatch #100 follow-up -- each pill now carries a short descriptor (ruleShortTag,
        // derived from the rule's own security_rules.method) alongside the bare ruleId, so the
        // policy a pill stands for is readable without first clicking it. The ⏸ inactive marker
        // stays exactly where it already was, appended last.
        domainRules.map(r => {
          const tag = ruleShortTag(r);
          const label = r.ruleId + (tag ? ` · ${tag}` : '') + (r.active ? '' : ' ⏸');
          return pill(label, ruleFilter === r.ruleId, () => setRuleFilter(r.ruleId));
        }),
        span({ style: { color: 'var(--text3)', marginLeft: 12 } }, 'Min signals:'),
        // dispatch 2026-10-12 -- 'All' (minSignals=0) alongside 1+/2+/3+. flaggedCount is always
        // >= 0, so `g.flaggedCount >= 0` keeps every subject that has at least one verdict in
        // scope -- the ONLY way to see a "Clear" subject at all, previously impossible: the
        // table's own grouping already drops anything with zero verdicts, and every signals
        // floor from 1+ up additionally required at least one FLAGGED verdict, so a domain that
        // is 100% clear (every rule evaluated, nothing ever flagged -- LABOR-001/002's own real
        // result the first day they went live, 0/129 flagged each) rendered an empty table
        // indistinguishable from "nothing loaded," with no way to confirm the data was actually
        // there short of trusting the batch job's own log output.
        [0, 1, 2, 3].map(n => pill(n === 0 ? 'All' : String(n) + '+', minSignals === n, () => setMinSignals(n))),
      ),
      // dispatch #100 -- date-range control, filtering on windowEnd (the rule's own evaluation-
      // window end date -- see windowEndInRange's own comment for why that basis, not computedAt).
      // Named explicitly in the label itself, per this repo's "name the basis" habit, rather than
      // an ambiguous "Date range." Reuses the shared DateRangeControl (PanelControls.js) with an
      // "All dates" reset pill alongside it -- the shared component has no built-in "no filter"
      // state, and this stays additive rather than editing that shared file.
      div({ style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', fontSize: 11, marginTop: 8 } },
        span({ style: { color: 'var(--text3)' } }, 'Findings with a window ending:'),
        pill('All dates', !dateRange, () => setDateRange(null)),
        h(DateRangeControl, { presets: DATE_RANGE_PRESETS, value: dateRange, onChange: setDateRange }),
      ),
      // dispatch #46 §A point 1 -- "a small detail under each policy." Shown for the currently
      // selected rule (or the first domain rule when 'All' is selected, so there is always
      // something to read rather than nothing until a reader clicks a specific pill).
      (rulesById[ruleFilter] || domainRules[0]) && div({ style: { fontSize: 11, color: 'var(--text3)', marginTop: 6, fontStyle: 'italic' } },
        (rulesById[ruleFilter] || domainRules[0]).description),
    ),
    // ── Body ── dispatch #50 Part A: minHeight:0, see the root div's own comment above.
    div({ style: { flex: 1, overflowY: 'auto', minHeight: 0 } },
      permState === 'checking' && emptyState('Checking access…'),
      permState === 'denied' && emptyState('Not permitted — this view requires admin, supervisor, or a manager role with identity-reveal enabled for this org. This is a permission gate, not an empty result — do not read it as "nothing to see here."', true),
      permState === 'allowed' && dataState === 'loading' && emptyState('Loading findings…'),
      permState === 'allowed' && dataState === 'error' && emptyState('Could not load findings — try again.', true),
      view !== 'command' && view !== 'brief' && permState === 'allowed' && dataState === 'loaded' && groups.length === 0 && emptyState('No findings match the current filters.'),
      // Live-screen hero bar -- see SecuritySummaryBar's own header for why this exists and why
      // it's fed `groups`, not `sortedGroups`. Only rendered once there's something to summarize;
      // the empty-state message just above already covers the zero-groups case. Command Center
      // renders its OWN SecuritySummaryBar inside CommandCenterView, fed `commandGroups` (cross-
      // domain) instead of this domain-scoped `groups` -- excluded here so it isn't shown twice.
      // Brief has no summary bar at all -- it's one subject, not a list to summarize.
      view !== 'command' && view !== 'brief' && permState === 'allowed' && dataState === 'loaded' && groups.length > 0
        && h(SecuritySummaryBar, { groups, newestBatch, revealed, itemInfoFor }),
      // dispatch 2026-11-10 -- Briefing view: district health grid (hidden once scope is already
      // narrowed to a single store — nothing to rank against) + one narrative card per flagged
      // signal, built from `sortedGroups` so it respects the exact same domain/rule/min-signals/
      // date-range filters the Table view does. See SecurityHealthGrid/SecurityBriefingCard's own
      // headers for what this phase does and doesn't compute.
      view === 'briefing' && permState === 'allowed' && dataState === 'loaded' && scope.level !== 'store'
        && h(SecurityHealthGrid, { list: healthList, scope, onSelectStore: loc => setScope({ level: 'store', value: loc }) }),
      view === 'briefing' && permState === 'allowed' && dataState === 'loaded' && groups.length > 0
        && div({ style: { padding: '10px 14px' } },
          sortedGroups.map(g => {
            const group = subjectHistory[g.key] ? { ...g, historyByRule: subjectHistory[g.key] } : g;
            return h(SecurityBriefingCard, {
              key: g.key, group, rulesById, revealed, onReveal, itemInfoFor,
              findingActions, actionBusy, actionError, onFindingAction: handleFindingAction,
              openDrawers, onToggleDrawer: toggleDrawer, driftPerKey: driftRollup?.perKey,
            });
          }),
        ),
      // dispatch #120 -- real <table>/<th> markup, sortable by Signals/Subject/Rule/Window (see
      // sortFindingsForDisplay's own header comment for why this was chosen over a click-through
      // to an "actual event" view). Wrapped in its own overflowX:'auto' scroller per panel-
      // contract.md's mobile-scroll rule, though this table's column count stays modest.
      view === 'table' && permState === 'allowed' && dataState === 'loaded' && groups.length > 0 && div({ style: { overflowX: 'auto' } },
        // width:'max-content' + minWidth:'100%' (not width:'100%' alone) -- the #192 rule
        // (scroll-table-width.test.js): a table locked to its wrapper's width has nothing to
        // scroll TO, so the browser silently crushes columns instead of the overflowX:'auto'
        // wrapper ever showing a scrollbar. This table's Rule-chips column can genuinely run wide.
        h('table', { style: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: 12 } },
          h('thead', null,
            h('tr', null,
              sortTh('Signals', 'signals', sortKey, sortDir, toggleSort),
              sortTh('Subject', 'subject', sortKey, sortDir, toggleSort),
              h('th', { style: thStyle(false) }, 'Store'),
              sortTh('Rule', 'rule', sortKey, sortDir, toggleSort),
              sortTh('Window', 'window', sortKey, sortDir, toggleSort),
              h('th', { style: thStyle(false) }, ''),
            ),
          ),
          h('tbody', null, sortedGroups.map(g => {
            const ik = domain === 'inventory' ? inventoryItemKey(g, domainRuleIds) : null;
            const item = ik ? itemInfo[ik.key] : null;
            // Once the lazy per-subject fetch (above) resolves for this subject, its REAL
            // multi-window history supersedes the bulk load's single-latest-window one -- verdicts
            // stay from `g` (already correct either way; see loadSecurityFindings' header for why),
            // only historyByRule is richer.
            const group = subjectHistory[g.key] ? { ...g, historyByRule: subjectHistory[g.key] } : g;
            return h(SubjectRow, {
              key: g.key, group, rulesById, revealed, onReveal, ruleFilter,
              expanded: expanded === g.key, onToggle: () => setExpanded(expanded === g.key ? null : g.key),
              domain, findings,
              // dispatch 2026-10-12 -- 'labor' has no assembleLaborDrilldown() yet (stated scope
              // decision, not an oversight: see scripts/security-rules-run.mjs's own LABOR header
              // for what's shipped this pass). domainRuleIds stays a real Set above for the
              // verdict-chip/group filtering this memo also feeds -- only THIS render prop is
              // nulled, which is what SubjectDetail/SubjectRow check before offering "Investigate
              // further" at all. Falling through to SubjectDrilldown's existing cash/inventory
              // branches for a domain neither one actually sources would silently run the WRONG
              // query (audit_rows) and render a misleading empty result, worse than offering
              // nothing. 'events' (dispatch 2026-11-09) has the identical gap -- no
              // assembleEventsDrilldown() exists either -- so it's nulled here for the same reason.
              domainRuleIds: (domain === 'labor' || domain === 'events') ? null : domainRuleIds, item,
              findingActions, actionBusy, actionError, onFindingAction: handleFindingAction,
            });
          })),
        ),
      ),
      // dispatch 2026-11-10 -- Command Center: cross-domain rollups + Employee Watchlist, built
      // entirely from `findings`/`rulesById`/`healthList` the panel already loaded -- no new query.
      // See CommandCenterView's own header for exactly what it reuses (SecuritySummaryBar,
      // SecurityHealthGrid) vs. what's genuinely new here (domain cards, watchlist, pareto, queue).
      view === 'command' && permState === 'allowed' && dataState === 'loaded'
        && h(CommandCenterView, {
          commandGroups, domainBreakdown, topRules, healthList, caseQueue, findingActions,
          revealed, onReveal, rulesById, newestBatch, itemInfoFor, scope,
          onSelectStore: loc => setScope({ level: 'store', value: loc }),
          onReviewSubject,
          onOpenTable: () => setView('table'),
        }),
      // dispatch 2026-11-10, IA redesign -- Tier 2. See SubjectBriefView's own header for what it
      // reuses (SecurityBriefingCard) vs. deliberately leaves to Table (event-level drill-down).
      view === 'brief' && permState === 'allowed' && dataState === 'loaded'
        && h(SubjectBriefView, {
          group: briefGroup, rulesById, revealed, onReveal, itemInfoFor,
          findingActions, actionBusy, actionError, onFindingAction: handleFindingAction,
          openDrawers, onToggleDrawer: toggleDrawer, driftPerKey: driftRollup?.perKey,
          onBack: () => setView('command'),
          onOpenTable: () => setView('table'),
        }),
    ),
  );
}

// dispatch #120 -- sortable column header, shared by the findings table above. Shows the sort
// direction only on the currently-active column so the other headers don't imply an order they
// aren't applying.
function thStyle(sortable) {
  return {
    padding: '8px', textAlign: 'left', fontSize: 10.5, fontWeight: 700, color: 'var(--text3)',
    textTransform: 'uppercase', letterSpacing: '.03em', borderBottom: '1px solid var(--bdr)',
    cursor: sortable ? 'pointer' : 'default', whiteSpace: 'nowrap', userSelect: 'none',
  };
}
function sortTh(label, key, sortKey, sortDir, onSort) {
  const active = sortKey === key;
  const arrow = active ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';
  return h('th', { style: thStyle(true), onClick: () => onSort(key) }, label + arrow);
}

function pill(label, active, onClick) {
  return btn({
    key: label, onClick,
    style: {
      padding: '4px 10px', borderRadius: 999, border: '1px solid ' + (active ? 'var(--accent)' : 'var(--bdr)'),
      background: active ? 'rgba(245,188,0,.14)' : 'transparent', color: 'var(--text)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
    },
  }, label);
}

function emptyState(text, warn) {
  return div({ style: { padding: '40px 20px', textAlign: 'center', color: warn ? 'var(--crit,#ef4444)' : 'var(--text3)', fontSize: 13 } }, text);
}
