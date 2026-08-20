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
import { loadSecurityFindings, loadSecurityRules, loadGmIdentityRevealEnabled } from '../lib/supabase.js';
import { INV_ORG_COORDS } from '../constants.js';
import { RevealName } from './store-analytics.js';

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
// group per subject carries EVERY rule's verdict for them, sorted by how many rules agree
// (flaggedCount desc), then by the worst flagged value -- convergence across independent signals
// first, since that is the actual lead a loss-prevention system exists to surface.
export function groupFindingsBySubject(findings) {
  const groups = new Map();
  for (const f of findings) {
    const subjectType = f.empToken ? 'emp' : 'wrin';
    const subjectId = f.empToken || f.wrin;
    if (!subjectId || !f.loc) continue; // a malformed row (neither subject set) can't be grouped -- skip, don't crash
    const key = f.loc + '::' + subjectType + ':' + subjectId;
    if (!groups.has(key)) {
      groups.set(key, { key, loc: f.loc, subjectType, empToken: f.empToken || null, wrin: f.wrin || null, verdicts: [] });
    }
    groups.get(key).verdicts.push({
      ruleId: f.ruleId, pass: f.pass, value: f.value, thresholdUsed: f.thresholdUsed,
      baselineContext: f.baselineContext || {}, explanation: f.explanation || [],
      windowStart: f.windowStart, windowEnd: f.windowEnd, computedAt: f.computedAt,
      lifecycleCategory: f.lifecycleCategory || null,
    });
  }
  const out = [...groups.values()].map(g => {
    // dispatch #45 §B: a lifecycle-classified verdict is EXCLUDED from the security tally
    // (flaggedCount/clearCount/worstValue/sort) -- it routes to a distinct hygiene lane, never
    // counted toward "how many independent signals agree" (the whole point of subject-major
    // grouping) and never contributing to the sort order a real convergence would drive. It still
    // renders (routed, not suppressed) via hygieneCount and the verdicts array itself.
    const securityVerdicts = g.verdicts.filter(v => !v.lifecycleCategory);
    const flaggedCount = securityVerdicts.filter(v => v.pass === true).length;
    const clearCount = securityVerdicts.filter(v => v.pass === false).length;
    const undeterminedCount = securityVerdicts.filter(v => v.pass == null).length;
    const hygieneCount = g.verdicts.filter(v => v.lifecycleCategory).length;
    const worstValue = securityVerdicts.filter(v => v.pass === true).reduce((m, v) => Math.max(m, v.value || 0), 0);
    const newestComputedAt = g.verdicts.reduce((m, v) => (!m || (v.computedAt && v.computedAt > m)) ? v.computedAt : m, null);
    return { ...g, flaggedCount, clearCount, undeterminedCount, hygieneCount, worstValue, newestComputedAt };
  });
  out.sort((a, b) => b.flaggedCount - a.flaggedCount || b.worstValue - a.worstValue);
  return out;
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

function SubjectDetail({ group, rulesById }) {
  return div({ style: { padding: '10px 14px 14px', borderTop: '1px solid var(--bdr)', background: 'var(--surf2)' } },
    group.verdicts.map((v, i) => {
      const rule = rulesById[v.ruleId] || {};
      const state = verdictState(v.pass, v.lifecycleCategory);
      const meta = VERDICT_META[state];
      const bc = v.baselineContext || {};
      return div({ key: v.ruleId + i, style: { padding: '8px 0', borderBottom: i < group.verdicts.length - 1 ? '1px solid var(--bdr)' : 'none' } },
        div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
          span({ style: { fontWeight: 700, fontSize: 12.5, color: 'var(--text)' } }, rule.method || v.ruleId),
          span({ style: { fontSize: 11, fontWeight: 700, color: meta.color } }, meta.label),
        ),
        // dispatch #45 §B: a hygiene-classified verdict shows its OWN item-lifecycle explanation,
        // not the pass/fail one -- it must not read as either a security flag or an exoneration,
        // even though the real value/threshold below it is still shown (routed, not suppressed).
        v.lifecycleCategory
          ? div({ style: { fontSize: 11.5, color: 'var(--accent,#f5bc00)', marginTop: 2 } },
              `${LIFECYCLE_LABEL[v.lifecycleCategory] || v.lifecycleCategory} — a data-hygiene item, not a security verdict. Real value: ${fNum(v.value)} vs threshold ${fNum(v.thresholdUsed)}.`)
          : v.pass == null
          ? div({ style: { fontSize: 11.5, color: 'var(--text3)', marginTop: 2 } },
              'No verdict — ', (v.reason || explanationReason(v.explanation) || 'no exposure in window'))
          : div({ style: { fontSize: 11.5, color: 'var(--text2)', marginTop: 2 } },
              `${fNum(v.value)} vs threshold ${fNum(v.thresholdUsed)}`,
              bc.mean != null && ` — ${rule.baselineType || 'baseline'}: mean ${fNum(bc.mean)}, stdev ${fNum(bc.stdev)}, n ${bc.n ?? '—'}`,
            ),
        div({ style: { fontSize: 10.5, color: 'var(--text3)', marginTop: 2 } },
          `Window ${v.windowStart} → ${v.windowEnd} · computed ${fDateTime(v.computedAt)}`,
          rule.active === false && ' · RULE INACTIVE — historical output, not current truth',
        ),
      );
    }),
  );
}

function explanationReason(explanation) {
  const e = Array.isArray(explanation) ? explanation[0] : null;
  return e && e.value == null ? e.label : null;
}
function fNum(n) { return n == null ? '—' : Number(n).toFixed(2); }
function fDateTime(iso) { return iso ? new Date(iso).toLocaleString() : '—'; }

function SubjectRow({ group, rulesById, revealed, onReveal, expanded, onToggle, ruleFilter }) {
  const chips = group.verdicts
    .filter(v => !ruleFilter || v.ruleId === ruleFilter)
    .map(v => h(VerdictChip, { key: v.ruleId, ruleId: v.ruleId, active: (rulesById[v.ruleId] || {}).active, verdict: v }));
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
      div({ style: { minWidth: 150, fontWeight: 700, fontSize: 12.5, color: 'var(--text)' } },
        group.subjectType === 'emp'
          ? h(RevealName, { token: group.empToken, cache: revealed, onReveal })
          : `Item ${group.wrin}`,
      ),
      span({ style: { fontSize: 11, color: 'var(--text3)', minWidth: 60 } }, `Store ${group.loc}`),
      div({ style: { display: 'flex', gap: 6, flexWrap: 'wrap', flex: 1 } }, chips),
      span({ style: { fontSize: 11, color: 'var(--text3)' } }, expanded ? '▲' : '▼'),
    ),
    expanded && h(SubjectDetail, { group, rulesById }),
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
  const [expanded, setExpanded] = React.useState(null);
  const [revealed, setRevealed] = React.useState({});
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
      .map(g => ({ ...g, verdicts: g.verdicts.filter(v => domainRuleIds.has(v.ruleId)) }))
      .filter(g => g.verdicts.length > 0);
  }, [findings, domain, scope, ruleFilter, minSignals, domainRuleIds]);

  const newestBatch = React.useMemo(() =>
    findings.reduce((m, f) => (!m || (f.computedAt && f.computedAt > m)) ? f.computedAt : m, null), [findings]);

  const domainRules = rules.filter(r => r.domain === domain);
  const states = React.useMemo(() => [...new Set(Object.values(INV_ORG_COORDS).map(o => o.state).filter(Boolean))], []);

  return div({ style: { display: 'flex', flexDirection: 'column', height: '100%' } },
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
      newestBatch && span({ style: { marginLeft: 'auto', fontSize: 10.5, color: 'var(--text3)' } }, `Latest batch: ${fDateTime(newestBatch)}`),
    ),
    // ── Rule + signal filters ──
    dataState === 'loaded' && div({ style: { display: 'flex', gap: 8, padding: '8px 14px', borderBottom: '1px solid var(--bdr)', flexWrap: 'wrap', alignItems: 'center', fontSize: 11 } },
      span({ style: { color: 'var(--text3)' } }, 'Rule:'),
      pill('All', !ruleFilter, () => setRuleFilter(null)),
      domainRules.map(r => pill(r.ruleId + (r.active ? '' : ' ⏸'), ruleFilter === r.ruleId, () => setRuleFilter(r.ruleId))),
      span({ style: { color: 'var(--text3)', marginLeft: 12 } }, 'Min signals:'),
      [1, 2, 3].map(n => pill(String(n) + '+', minSignals === n, () => setMinSignals(n))),
    ),
    // ── Body ──
    div({ style: { flex: 1, overflowY: 'auto' } },
      permState === 'checking' && emptyState('Checking access…'),
      permState === 'denied' && emptyState('Not permitted — this view requires admin, supervisor, or a manager role with identity-reveal enabled for this org. This is a permission gate, not an empty result — do not read it as "nothing to see here."', true),
      permState === 'allowed' && dataState === 'loading' && emptyState('Loading findings…'),
      permState === 'allowed' && dataState === 'error' && emptyState('Could not load findings — try again.', true),
      permState === 'allowed' && dataState === 'loaded' && groups.length === 0 && emptyState('No findings match the current filters.'),
      permState === 'allowed' && dataState === 'loaded' && groups.map(g =>
        h(SubjectRow, {
          key: g.key, group: g, rulesById, revealed, onReveal, ruleFilter,
          expanded: expanded === g.key, onToggle: () => setExpanded(expanded === g.key ? null : g.key),
        })),
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
