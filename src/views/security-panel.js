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
import { supabase } from '../lib/supabase.js';
import {
  loadSecurityFindings, loadSecurityRules, loadGmIdentityRevealEnabled,
  loadQsrVarianceStat, loadQsrVarianceHistoryAll, loadAuditRowsWindow,
  loadQsrSecurityEventsForSubject,
} from '../lib/supabase.js';
import { INV_ORG_COORDS, STORE_NAMES } from '../constants.js';
import { RevealName } from './store-analytics.js';
import { addD, fmtDI } from '../utils/date.js';
import {
  monthsBack, assembleInventoryDrilldown, assembleCashDrilldown,
  classifySubjectShape, buildSubjectTimeline, corroboratingFlags,
} from '../engine/security-drilldown.js';
// dispatch #100 -- the Org/Store pills below extend scopeMatches' own All->State->Org->Store
// hierarchy (feedback-selector-ui-standard.md); the date-range control reuses the shared
// DateRangeControl (issue #126 Spine 1) rather than a bespoke date-input pair, matching this
// repo's "don't invent a new pattern" standing rule.
import { DateRangeControl, DATE_RANGE_PRESETS } from '../components/PanelControls.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

// ── Pure logic — exported and tested independently of any rendering ─────────────────────────────

// admin/supervisor always allowed, matching security_findings' RLS exactly. manager allowed ONLY
// when the caller has already confirmed org_config.gm_identity_reveal_enabled (loaded separately,
// async -- this function itself makes no network call, so it can be used as a pure gate both for
// the initial "should I even bother checking" decision and the final verdict once that flag is in).
// Everything else (gm/office_staff/do/vp/owner/undefined) is denied -- CLAUDE.md's own documented
// finding that profiles.role only carries 3 real values today does not change what the SQL policy
// actually checks, and this must never be looser than that policy.
export function securityPanelAccess(userRole, gmRevealEnabled) {
  if (userRole === 'admin' || userRole === 'supervisor') return 'allowed';
  if (userRole === 'manager') return gmRevealEnabled ? 'allowed' : 'denied';
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
export function groupFindingsBySubject(findings) {
  const groups = new Map();
  for (const f of findings) {
    const subjectType = f.empToken ? 'emp' : 'wrin';
    const subjectId = f.empToken || f.wrin;
    if (!subjectId || !f.loc) continue; // a malformed row (neither subject set) can't be grouped -- skip, don't crash
    const key = f.loc + '::' + subjectType + ':' + subjectId;
    if (!groups.has(key)) {
      groups.set(key, { key, loc: f.loc, subjectType, empToken: f.empToken || null, wrin: f.wrin || null, byRule: new Map() });
    }
    const entry = {
      ruleId: f.ruleId, pass: f.pass, value: f.value, thresholdUsed: f.thresholdUsed,
      baselineContext: f.baselineContext || {}, explanation: f.explanation || [],
      windowStart: f.windowStart, windowEnd: f.windowEnd, computedAt: f.computedAt,
      lifecycleCategory: f.lifecycleCategory || null, exonerationShare: f.exonerationShare ?? null,
    };
    const byRule = groups.get(key).byRule;
    if (!byRule.has(f.ruleId)) byRule.set(f.ruleId, []);
    byRule.get(f.ruleId).push(entry);
  }
  const out = [...groups.values()].map(g => {
    const historyByRule = {};
    const verdicts = [];
    for (const [ruleId, windows] of g.byRule) {
      windows.sort((a, b) => (a.windowEnd || '').localeCompare(b.windowEnd || '') || (a.computedAt || '').localeCompare(b.computedAt || ''));
      historyByRule[ruleId] = windows;
      verdicts.push(windows[windows.length - 1]); // latest window is what renders as THE verdict
    }
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

// Store scope hierarchy (feedback-selector-ui-standard.md): All -> State -> Org -> Store.
export function scopeMatches(loc, scope) {
  if (!scope || scope.level === 'all') return true;
  const org = INV_ORG_COORDS[loc] || {};
  if (scope.level === 'state') return org.state === scope.value;
  if (scope.level === 'org') return (org.state === 'FL' ? 'emerald' : 'mcdok') === scope.value;
  if (scope.level === 'store') return loc === scope.value;
  return true;
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

function SubjectDetail({ group, rulesById, subjectLabel, domain, findings, domainRuleIds }) {
  return div({ style: { padding: '10px 14px 14px', borderTop: '1px solid var(--bdr)', background: 'var(--surf2)' } },
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

function explanationReason(explanation) {
  const e = Array.isArray(explanation) ? explanation[0] : null;
  return e && e.value == null ? e.label : null;
}
function fNum(n) { return n == null ? '—' : Number(n).toFixed(2); }
function fDateTime(iso) { return iso ? new Date(iso).toLocaleString() : '—'; }

function SubjectRow({ group, rulesById, revealed, onReveal, expanded, onToggle, ruleFilter, domain, findings, domainRuleIds, item }) {
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
  return div(null,
    div({
      onClick: onToggle,
      style: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', cursor: 'pointer', borderBottom: expanded ? 'none' : '1px solid var(--bdr)' },
    },
      span({ style: {
        minWidth: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 12, fontWeight: 800, color: '#fff',
        background: group.flaggedCount >= 2 ? 'var(--crit,#ef4444)' : group.flaggedCount === 1 ? 'var(--amber,#f59e0b)' : 'var(--text3)',
      } }, group.flaggedCount),
      div({ style: { minWidth: 150, maxWidth: 220, fontWeight: 700, fontSize: 12.5, color: 'var(--text)' }, title: itemName ? `${itemName} — WRIN ${group.wrin}` : undefined },
        group.subjectType === 'emp'
          ? h(RevealName, { token: group.empToken, cache: revealed, onReveal })
          : (itemName
              ? [itemName, span({ key: 'wrin', style: { fontSize: 10, fontWeight: 400, color: 'var(--text3)', marginLeft: 5 } }, group.wrin)]
              : `Item ${group.wrin}`),
      ),
      span({ style: { fontSize: 11, color: 'var(--text3)', minWidth: 60 } }, `Store ${group.loc}`),
      item?.cls && span({ style: { fontSize: 10, color: 'var(--text3)', border: '1px solid var(--bdr)', borderRadius: 999, padding: '1px 7px' } }, item.cls),
      div({ style: { display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 } }, chips),
      span({ style: { fontSize: 11, color: 'var(--text3)' } }, expanded ? '▲' : '▼'),
    ),
    expanded && h(SubjectDetail, { group, rulesById, subjectLabel, domain, findings, domainRuleIds }),
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

const RULE_DOMAIN_LABEL = { cash: 'Cash', inventory: 'Inventory' };

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
  );
}

// The panel body. `ds`/`stores` unused today (Phase 1 has no cross-panel data dependency beyond
// its own on-demand loads, per dispatch #43's "on-demand, not eager at startup" requirement --
// auditRows was deliberately pulled OUT of the eager startup batch under #191, and this must not
// reintroduce that cost). userRole/gmRevealEnabled drive the permission state machine below.
export function SecurityPanel({ userRole, onClose }) {
  const [permState, setPermState] = React.useState('checking'); // checking | denied | allowed
  const [dataState, setDataState] = React.useState('idle');     // idle | loading | loaded | error
  const [findings, setFindings] = React.useState([]);
  const [rules, setRules] = React.useState([]);
  const [domain, setDomain] = React.useState('cash'); // 'cash' | 'inventory'
  const [scope, setScope] = React.useState({ level: 'all' });
  const [ruleFilter, setRuleFilter] = React.useState(null);
  const [minSignals, setMinSignals] = React.useState(1);
  // dispatch #100 -- date-range filter, on windowEnd (see windowEndInRange's own comment for why).
  // null = unbounded (the pre-#100 behavior, unchanged) -- {s,e} is DateRangeControl's own shape.
  const [dateRange, setDateRange] = React.useState(null);
  const [expanded, setExpanded] = React.useState(null);
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
      if (userRole === 'admin' || userRole === 'supervisor') { if (!cancelled) setPermState('allowed'); return; }
      if (userRole !== 'manager') { if (!cancelled) setPermState('denied'); return; }
      const enabled = await loadGmIdentityRevealEnabled();
      if (!cancelled) setPermState(securityPanelAccess(userRole, enabled));
    })();
    return () => { cancelled = true; };
  }, [userRole]);

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

  // dispatch #50 Part B -- frictionless reveal for the privileged tier only. "Developer/Admin/
  // Owner" in the owner's own words collapses to the single real DB role value 'admin'
  // (profiles.role's check constraint allows exactly admin/supervisor/manager -- CLAUDE.md's own
  // documented finding). Supervisor/manager/GM keep the existing click-through RevealName path
  // unchanged -- this is additive, not a widening of who MAY reveal, only who is asked to click.
  // A ref, not a state flag, guards this to run exactly once per mount: it must not re-fire if
  // `findings` happens to get a new array reference for an unrelated reason, and it must not be a
  // dependency itself (same self-retrigger risk the data-load effect's own comment above warns
  // about -- this effect sets `revealed` via onReveal, which is not read by anything this effect
  // depends on, but the ref keeps that invariant explicit rather than relying on it never changing).
  const bulkRevealTried = React.useRef(false);
  React.useEffect(() => {
    if (userRole !== 'admin' || dataState !== 'loaded' || bulkRevealTried.current) return;
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

  const groups = React.useMemo(() => {
    const bySubjectType = domain === 'cash' ? 'emp' : 'wrin';
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

  const newestBatch = React.useMemo(() =>
    findings.reduce((m, f) => (!m || (f.computedAt && f.computedAt > m)) ? f.computedAt : m, null), [findings]);

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
  const states = React.useMemo(() => [...new Set(Object.values(INV_ORG_COORDS).map(o => o.state).filter(Boolean))], []);
  // dispatch #100 -- Org and Store tiers for the same All->State->Org->Store row. `orgs` derived
  // the same way `states` already is (from the live INV_ORG_COORDS data, not a hardcoded list) and
  // through the EXACT mapping scopeMatches itself uses (org.state==='FL' ? 'emerald' : 'mcdok'),
  // so a future third org/state added to INV_ORG_COORDS is picked up with no code change here.
  // `storeLocs` is every loc INV_ORG_COORDS knows about, numeric-sorted -- the same store-universe
  // source opportunity-dollars.js's LocationSelector already draws its own flat store-pill row
  // from, so a 27-store wrapped pill row is a proven, shipped pattern here, not a new risk.
  const orgs = React.useMemo(() => [...new Set(Object.values(INV_ORG_COORDS).map(o => (o.state === 'FL' ? 'emerald' : 'mcdok')))].sort(), []);
  const storeLocs = React.useMemo(() => Object.keys(INV_ORG_COORDS).sort((a, b) => Number(a) - Number(b)), []);
  const ORG_LABELS = { emerald: 'Emerald Arches', mcdok: 'MCDOK' };

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
    // ── Domain tabs + scope pills ──
    div({ style: { display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--bdr)', flexWrap: 'wrap', alignItems: 'center' } },
      ['cash', 'inventory'].map(d => btn({
        key: d, onClick: () => { setDomain(d); setRuleFilter(null); },
        style: {
          padding: '5px 12px', borderRadius: 'var(--r)', border: '1px solid ' + (domain === d ? 'var(--accent)' : 'var(--bdr)'),
          background: domain === d ? 'rgba(245,188,0,.12)' : 'transparent', color: 'var(--text)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
        },
      }, d === 'cash' ? '💵 Cash' : '📦 Inventory')),
      span({ style: { width: 1, height: 20, background: 'var(--bdr)', margin: '0 4px' } }),
      pill('All', scope.level === 'all', () => setScope({ level: 'all' })),
      states.map(st => pill(st, scope.level === 'state' && scope.value === st, () => setScope({ level: 'state', value: st }))),
      // dispatch #100 -- Org and Store pills, extending the SAME row (same pill() helper, same
      // scope shape scopeMatches already consumes) rather than a new control. A thin divider
      // separates each tier, reusing the exact divider style already used above (domain tabs ->
      // location pills) so Org/Store read as a new group, not a continuation of State.
      span({ style: { width: 1, height: 20, background: 'var(--bdr)', margin: '0 4px' } }),
      orgs.map(org => pill(ORG_LABELS[org] || org, scope.level === 'org' && scope.value === org, () => setScope({ level: 'org', value: org }))),
      span({ style: { width: 1, height: 20, background: 'var(--bdr)', margin: '0 4px' } }),
      storeLocs.map(loc => pill(
        STORE_NAMES[loc] ? `${loc} — ${STORE_NAMES[loc]}` : loc,
        scope.level === 'store' && scope.value === loc,
        () => setScope({ level: 'store', value: loc }),
      )),
      btn({
        onClick: () => setShowLegend(s => !s),
        style: { fontSize: 11, color: 'var(--text3)', background: 'none', border: '1px solid var(--bdr)', borderRadius: 999, padding: '4px 10px', cursor: 'pointer' },
      }, '❓ Legend'),
      newestBatch && span({ style: { marginLeft: showLegend ? 0 : 'auto', fontSize: 10.5, color: 'var(--text3)' } }, `Latest batch: ${fDateTime(newestBatch)}`),
    ),
    // dispatch #46 §A point 2 -- a legend defining the vocabulary, dismissible and remembered.
    showLegend && h(Legend, { onDismiss: dismissLegend, rules }),
    // ── Rule + signal filters ──
    dataState === 'loaded' && div({ style: { padding: '8px 14px', borderBottom: '1px solid var(--bdr)' } },
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
        [1, 2, 3].map(n => pill(String(n) + '+', minSignals === n, () => setMinSignals(n))),
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
      permState === 'allowed' && dataState === 'loaded' && groups.length === 0 && emptyState('No findings match the current filters.'),
      permState === 'allowed' && dataState === 'loaded' && groups.map(g => {
        const ik = domain === 'inventory' ? inventoryItemKey(g, domainRuleIds) : null;
        const item = ik ? itemInfo[ik.key] : null;
        return h(SubjectRow, {
          key: g.key, group: g, rulesById, revealed, onReveal, ruleFilter,
          expanded: expanded === g.key, onToggle: () => setExpanded(expanded === g.key ? null : g.key),
          domain, findings, domainRuleIds, item,
        });
      }),
    ),
  );
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
