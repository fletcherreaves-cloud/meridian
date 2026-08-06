// @ts-nocheck
// ── Leadership One-Pager assembly engine ──────────────────────────────────────
// Assembles the weekly cascade one-pager (Owner→DO→Supervisor→GM) from already-
// computed inputs: current-state KPIs, the Opportunity-$ result, and the attention
// feed. Two pieces carry the real value and are unit-tested here:
//   • suggestActions() — turn the biggest $ drivers + top concerns into candidate
//     action items the leader edits/approves.
//   • reconcileFollowUps() — for each carried-over action item, check whether the
//     metric it targeted actually MOVED (the accountability / Coaching-ROI loop).
// Pure — no ds/Supabase coupling; a thin adapter feeds it real data. See
// memory/design-unified-form-engine.md + north-star-discovery-lens.md.
import { rankByOpportunity } from './opportunity.js';

const num = v => (typeof v === 'number' && isFinite(v)) ? v : null;

// Direction that counts as improvement for each metric (cost/speed = lower; volume = higher).
export const METRIC_DIRECTION = {
  laborPct: 'lower', fobPct: 'lower', oepe: 'lower', kvst: 'lower', r2p: 'lower',
  park: 'lower', cashOSPct: 'lower', tRedAPct: 'lower', discPct: 'lower',
  gcPerDay: 'higher', sales: 'higher', gc: 'higher', tpph: 'higher', csat: 'higher',
};

const fmtPct = v => v == null ? '—' : (v * 100).toFixed(2) + '%';
const fmt$   = v => v == null ? '—' : '$' + Math.round(v).toLocaleString();

// ── Suggested actions ─────────────────────────────────────────────────────────
// From the Opportunity-$ per-store pillars (biggest dollars first) + attention
// concerns, produce candidate action items. Deduped by (loc, metricKey). Each item
// is a *draft* — the leader edits/approves before it persists.
export function suggestActions(opportunity = {}, attention = [], { max = 6, minDollar = 250, storeName = String, rangeLabel = 'the period' } = {}) {
  const items = [];
  const seen = new Set();
  const add = (it) => {
    const k = `${it.loc || 'all'}|${it.metricKey || it.title}`;
    if (seen.has(k)) return;
    seen.add(k); items.push(it);
  };

  // Dollar-driven: walk stores by total $ opportunity, emit the top pillar per store.
  for (const p of rankByOpportunity(opportunity.perStore || [])) {
    const pillars = [
      { key: 'laborPct', $: p.labor$, d: p.drivers?.labor, verb: 'Tighten labor' },
      { key: 'fobPct',   $: p.food$,  d: p.drivers?.food,  verb: 'Attack food cost' },
      { key: 'gcPerDay', $: p.gc$,    d: p.drivers?.gc,    verb: (p.drivers?.gc?.mode === 'sales' ? 'Pace to sales plan' : 'Grow guest counts') },
    ].filter(x => (x.$ || 0) >= minDollar).sort((a, b) => b.$ - a.$);
    if (!pillars.length) continue;
    const top = pillars[0];
    const nm = storeName(p.loc);
    // Lead with a WEEKLY impact — a number a GM/supervisor can act on this week
    // ("I can do that") instead of a range total that reads as inflated. The range
    // total stays in parentheses so the math is still transparent/auditable.
    const days = num(p.days) || num(top.d?.days) || 0;
    const wk$ = days > 0 ? top.$ * 7 / days : top.$;
    const detail = top.key === 'gcPerDay'
      ? (top.d?.mode === 'sales'
          ? `${nm} running ${fmt$(top.d?.actual || 0)}/day vs plan ${fmt$(top.d?.bench || 0)} — about ${fmt$(wk$)}/week behind projected sales (${fmt$(top.$)} over the ${rangeLabel}).`
          : `${nm} at ${Math.round(top.d?.actual || 0)} GC/day vs plan ${Math.round(top.d?.bench || 0)} — about ${fmt$(wk$)}/week (${fmt$(top.$)} over the ${rangeLabel}) to pace to projection.`)
      : `${nm} running ${fmtPct(top.d?.actual)} vs ${fmtPct(top.d?.bench)} target — about ${fmt$(wk$)}/week recoverable (${fmt$(top.$)} over the ${rangeLabel}).`;
    add({ loc: p.loc, metricKey: top.key, title: `${top.verb} at ${nm}`, detail,
          dollar: top.$, weeklyDollar: wk$, baselineValue: top.d?.actual, targetValue: top.d?.bench, source: 'opportunity' });
    if (items.length >= max) break;
  }

  // Concern-driven: fill remaining slots from the top attention items not already covered.
  for (const a of (attention || [])) {
    if (items.length >= max) break;
    const loc = a.loc || a.store || null;
    add({ loc, metricKey: a.metricKey || null, title: a.title || a.label || 'Address concern',
          detail: a.detail || a.message || '', dollar: num(a.dollar), source: 'attention', severity: a.sev ?? a.severity });
  }

  return items.slice(0, max);
}

// ── Follow-up reconciliation (the accountability loop) ────────────────────────
// For each carried-over action item that targeted a metric, compare the metric NOW
// vs the baseline captured when the item was created. `metricNow` = { loc: { key: value } }
// (or a flat { key: value } for district-scope items with loc null).
export function reconcileFollowUps(priorItems = [], metricNow = {}, { flatEps = 0.02 } = {}) {
  return (priorItems || []).map(it => {
    const dir = METRIC_DIRECTION[it.metricKey] || 'lower';
    const baseline = num(it.baselineValue);
    const target = num(it.targetValue);
    const bucket = (it.loc != null ? (metricNow[it.loc] || {}) : metricNow) || {};
    const now = num(bucket[it.metricKey]);

    if (it.metricKey == null || baseline == null || now == null) {
      return { ...it, follow: { status: 'no-data', now, delta: null, improved: null } };
    }
    const delta = now - baseline;
    const rel = baseline !== 0 ? Math.abs(delta / baseline) : Math.abs(delta);
    const flat = rel < flatEps;
    const improved = flat ? null : (dir === 'lower' ? delta < 0 : delta > 0);
    const achieved = target != null && (dir === 'lower' ? now <= target : now >= target);

    const status = achieved ? 'achieved'
      : improved === true ? 'improving'
      : improved === false ? 'worsening'
      : 'stalled';
    return { ...it, follow: { status, now, delta, improved, achieved, direction: dir } };
  });
}

// ── Assemble the full page model ──────────────────────────────────────────────
export function buildOnePager({
  level = 'supervisor', locs = [], period = '', author = '', scopeLabel = '',
  currentState = [], opportunity = {}, attention = [], priorActionItems = [],
  metricNow = {}, narrative = '', storeName = String, suggest = {},
} = {}) {
  return {
    level, locs, period, author,
    scopeLabel: scopeLabel || `${(locs || []).length} store${(locs || []).length === 1 ? '' : 's'}`,
    currentState,                                   // [{key,label,actual,target,ly,status}]
    opportunity,                                    // computeOpportunity() result
    opportunityTotal: num(opportunity?.district?.total$) || 0,
    concerns: (attention || []).filter(a => (a.sev ?? a.severity ?? 0) >= 2),
    wins: (attention || []).filter(a => a.kind === 'win' || a.win === true),
    followUps: reconcileFollowUps(priorActionItems, metricNow),
    suggestedActions: suggestActions(opportunity, attention, { storeName, ...suggest }),
    narrative,
  };
}
