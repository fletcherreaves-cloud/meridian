// @ts-nocheck
// ── Leadership One-Pager panel ────────────────────────────────────────────────
// Weekly cascade one-pager (Owner→DO→Supervisor→GM): auto current-state + the
// Opportunity-$ "on the table" section + auto-suggested actions, with an action
// plan that persists week-to-week and shows whether each item's targeted metric
// actually moved (the accountability loop). Engines are pure + tested
// (opportunity.js / one-pager.js); this panel wires ds→engines→Supabase.
import * as React from 'react';
import { STORE_NAMES, INV_ORG_COORDS } from '../constants.js';
import { escapeHtml, f$ } from '../utils/fmt.js';
import { computeOpportunity, annualize, rankByOpportunity } from '../engine/opportunity.js';
import { buildOnePager } from '../engine/one-pager.js';
import { buildOnePagerInputs, buildMetricNow, buildCurrentState, buildPerLocationRows, buildReviewActuals } from '../engine/one-pager-data.js';
import { loadQsrFob, loadActionItems, saveOnePager, saveActionItem, updateActionItem } from '../lib/supabase.js';

const h = React.createElement;
const { useState, useEffect, useMemo, useCallback } = React;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const unpad = l => String(l || '').replace(/^0+/, '') || String(l || '');
const nm = l => STORE_NAMES[unpad(l)] || unpad(l);

// ── date / ISO-week helpers ───────────────────────────────────────────────────
const iso = d => d.toISOString().slice(0, 10);
function mondayOf(date) { const d = new Date(date); const wd = (d.getDay() + 6) % 7; d.setDate(d.getDate() - wd); d.setHours(0, 0, 0, 0); return d; }
function weekRangeFrom(date) { const s = mondayOf(date); const e = new Date(s); e.setDate(e.getDate() + 6); return { s: iso(s), e: iso(e) }; }
function isoWeekLabel(date) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const week = 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

const pctFmt = (v, lower) => v == null ? '—' : (v * 100).toFixed(1) + '%';
const valFmt = (v, fmt) => v == null ? '—'
  : fmt === '$' ? f$(v) : fmt === '%' ? (v * 100).toFixed(2) + '%' : fmt === 's' ? Math.round(v) + 's' : (+v).toFixed(1);

// ── Range modes (Notes 31 #1) ─────────────────────────────────────────────────
// The selected window can be a week, month-to-date, year-to-date, or a custom span.
// YTD is always computed alongside so the header KPIs show movement (range vs YTD).
const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function monthRangeFrom(date) { const s = new Date(date.getFullYear(), date.getMonth(), 1); return { s: iso(s), e: iso(date) }; }
function ytdRangeFrom(date)   { const s = new Date(date.getFullYear(), 0, 1);            return { s: iso(s), e: iso(date) }; }
const daysInRange = (r) => Math.max(1, Math.round((new Date(r.e + 'T00:00:00') - new Date(r.s + 'T00:00:00')) / 86400000) + 1);
// Annualization factor for a $ figure measured over the range (365 / days-in-range).
const annualFactor = (r) => 365 / daysInRange(r);
function rangeLabel(mode, range, anchor) {
  if (mode === 'week')   return 'Week ' + isoWeekLabel(new Date(anchor));
  if (mode === 'mtd')    return MONTH_NAMES[new Date(range.e + 'T00:00:00').getMonth()] + ' MTD';
  if (mode === 'ytd')    return new Date(range.e + 'T00:00:00').getFullYear() + ' YTD';
  return `${range.s} → ${range.e}`;
}

// Cascade level (who's talking to whom) — Notes 31 #6 / Notes 32 C. Separate from data
// SCOPE. Each level carries a FOCUS that actually re-emphasizes the page: a headline of
// what this conversation is about, the metric order for the current-state grid (what the
// recipient is accountable for, first), and talking points. DRAFT — owner to refine.
export const CASCADE_LEVELS = [
  { id: 'o_d', tag: 'O›D', label: 'Owner → DO',
    focus: 'District P&L + PACE outcomes — the number the business is graded on.',
    priority: ['sales', 'fobPct', 'laborPct', 'oepe', 'r2p', 'tpph'],
    talk: 'Strategic: district sales vs plan/LY, FOB & labor rollup, PACE speed (OEPE/R2P), and the stores dragging the district.' },
  { id: 'd_s', tag: 'D›S', label: 'DO → Supervisor',
    focus: 'Patch performance — coach the bottom stores toward the district standard.',
    priority: ['fobPct', 'laborPct', 'oepe', 'r2p', 'sales', 'tpph'],
    talk: 'Patch rollup + store-by-store outliers: which stores miss FOB / labor / speed, and the action plan to move them.' },
  { id: 's_g', tag: 'S›G', label: 'Supervisor → GM',
    focus: "Store execution — the GM's own restaurant, shift by shift.",
    priority: ['oepe', 'r2p', 'tpph', 'laborPct', 'fobPct', 'sales'],
    talk: 'Tactical: speed of service (OEPE/R2P/KVS), labor %, food waste (FOB), guest counts — what to fix on the next shift.' },
];
export const cascadeOf = id => CASCADE_LEVELS.find(c => c.id === id) || CASCADE_LEVELS[0];
// Reorder current-state rows by a cascade level's priority (unknown keys keep their order, appended).
function orderByFocus(rows, priority) {
  const idx = k => { const i = (priority || []).indexOf(k); return i === -1 ? 999 : i; };
  return [...(rows || [])].sort((a, b) => idx(a.key) - idx(b.key));
}

const FOLLOW_META = {
  achieved:  { label: '✓ Achieved',  color: '#10b981' },
  improving: { label: '↑ Improving', color: '#84cc16' },
  stalled:   { label: '→ Stalled',   color: '#eab308' },
  worsening: { label: '↓ Worsening', color: '#ef4444' },
  'no-data': { label: '· No data',   color: 'var(--text2)' },
};

export function OnePagerPanel({ ds, stores, settings, onClose }) {
  const allLocs = useMemo(() => (stores || []).filter(s => /^\d+$/.test(s.loc)).map(s => unpad(s.loc)), [stores]);
  const operators = (settings && settings.operators) || {};      // operator (owner) → stores
  const supervisors = (settings && settings.supervisorGroups) || {}; // supervisor → stores
  const stateLocs = (st) => allLocs.filter(l => (INV_ORG_COORDS[l] || {}).state === st);
  const [locs, setLocs] = useState(allLocs);
  const [scopeLabel, setScopeLabel] = useState('All stores');
  const [level, setLevel] = useState('org');
  const applyScope = (label, list, lvl) => { setScopeLabel(label); setLocs((list || []).map(unpad)); setLevel(lvl); };
  const [weekDate, setWeekDate] = useState(() => iso(new Date()));
  const [rangeMode, setRangeMode] = useState('week'); // week | mtd | ytd | custom
  const [customRange, setCustomRange] = useState(() => weekRangeFrom(new Date()));
  const [cascade, setCascade] = useState('d_s');      // cascade pairing (Notes 31 #6)
  const [fobRows, setFobRows] = useState(null);
  const [priorItems, setPriorItems] = useState([]);
  const [narrative, setNarrative] = useState('');
  const [actions, setActions] = useState([]);       // working action-plan list
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState('');

  const anchor = useMemo(() => new Date(weekDate), [weekDate]);
  const range = useMemo(() => (
    rangeMode === 'week' ? weekRangeFrom(anchor)
    : rangeMode === 'mtd' ? monthRangeFrom(anchor)
    : rangeMode === 'ytd' ? ytdRangeFrom(anchor)
    : customRange
  ), [rangeMode, anchor, customRange]);
  const ytd = useMemo(() => ytdRangeFrom(new Date(range.e + 'T00:00:00')), [range.e]);
  const rLabel = useMemo(() => rangeLabel(rangeMode, range, weekDate), [rangeMode, range, weekDate]);
  const period = useMemo(() => rangeMode === 'week' ? isoWeekLabel(anchor) : `${range.s}_${range.e}`, [rangeMode, anchor, range]);
  const scopeKey = useMemo(() => 'locs:' + [...locs].sort().join(','), [locs]);

  useEffect(() => { let live = true; loadQsrFob({}).then(r => { if (live) setFobRows(r || []); }).catch(() => setFobRows([])); return () => { live = false; }; }, []);
  useEffect(() => { let live = true; loadActionItems({ scopeKey }).then(r => { if (live) setPriorItems(r || []); }).catch(() => setPriorItems([])); return () => { live = false; }; }, [scopeKey]);

  // Compute the page model from live data (pure engines).
  const page = useMemo(() => {
    if (fobRows == null) return null;
    const inputs = buildOnePagerInputs(ds, fobRows, locs, range);
    // GC paces vs the store's OWN QSRSoft projection (not best-in-class) so a down sales
    // trend doesn't inflate the guest-count opportunity (owner directive 2026-07-29).
    const opportunity = computeOpportunity(inputs, { mode: 'target', gcBench: 'projection' });
    const currentState = buildCurrentState(ds, fobRows, locs, range);
    // YTD companion for each header KPI so movement is visible (Notes 31 #1).
    const ytdState = buildCurrentState(ds, fobRows, locs, ytd);
    const ytdByKey = Object.fromEntries((ytdState || []).map(r => [r.key, r.actual]));
    const currentStateWithYtd = (currentState || []).map(r => ({ ...r, ytd: ytdByKey[r.key] ?? null }));
    const metricNow = buildMetricNow(ds, fobRows, locs, range);
    const built = buildOnePager({
      level, scopeLabel, locs, period, currentState: currentStateWithYtd, opportunity, attention: [],
      priorActionItems: priorItems, metricNow, storeName: nm,
      suggest: { rangeLabel: rLabel },
    });
    // Per-location breakdown (Notes 33 B#10) — only when the scope spans >1 store.
    const perLocation = (locs || []).length > 1 ? buildPerLocationRows(ds, fobRows, locs, range, opportunity) : [];
    // Weekly-Review scorecard actuals not in the header grid (GC vs LY, Voice, KVS, proj sales).
    const reviewActuals = buildReviewActuals(ds, locs, range);
    return { ...built, perLocation, reviewActuals, range: { s: range.s, e: range.e }, rangeLabel: rLabel, ytdLabel: rangeLabel('ytd', ytd, range.e), annualFactor: annualFactor(range), cascade: cascadeOf(cascade) };
  }, [ds, fobRows, locs, range, ytd, period, priorItems, level, scopeLabel, rLabel, cascade]);

  const addAction = useCallback((a) => {
    setActions(prev => prev.some(x => x.title === a.title) ? prev
      : [...prev, { title: a.title, detail: a.detail || '', loc: a.loc || null, metric_key: a.metricKey || null,
                    baseline_value: a.baselineValue ?? null, target_value: a.targetValue ?? null, dollar: a.dollar ?? null, status: 'open' }]);
  }, []);
  const setActionStatus = (i, status) => setActions(prev => prev.map((x, j) => j === i ? { ...x, status } : x));
  const removeAction = (i) => setActions(prev => prev.filter((_, j) => j !== i));

  const save = useCallback(async () => {
    setSaving(true); setSavedNote('');
    try {
      await saveOnePager({ level, scope_key: scopeKey, scope_label: scopeLabel,
        locs, period, narrative, snapshot: page ? { currentState: page.currentState, opportunity: page.opportunity } : null });
      for (const a of actions) {
        await saveActionItem({ scope_key: scopeKey, thread_key: (a.loc || 'all') + '|' + (a.metric_key || a.title),
          title: a.title, detail: a.detail, loc: a.loc, metric_key: a.metric_key,
          baseline_value: a.baseline_value, target_value: a.target_value, dollar: a.dollar,
          status: a.status, created_period: period });
      }
      const fresh = await loadActionItems({ scopeKey }); setPriorItems(fresh || []); setActions([]);
      setSavedNote('Saved ✓');
    } catch (e) { setSavedNote('Save failed'); } finally { setSaving(false); }
  }, [scopeKey, locs, period, narrative, actions, page]);

  const btn = { padding: '6px 12px', borderRadius: 7, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 700 };
  const gold = { ...btn, border: '1px solid var(--accent,#f5bc00)', background: 'var(--accent,#f5bc00)', color: '#111', fontWeight: 800 };
  // Weekly-Review options: shift-manager names for the selected scope + a scope label.
  const wkOpts = () => {
    const norm = v => String(v || '').replace(/^0+/, '') || String(v || '');
    const locSet = new Set((locs || []).map(norm));
    const nmeta = {};
    for (const r of (ds?.shiftManagerRows || [])) { if (locSet.has(norm(r.loc)) && r.geid && r.name) nmeta[r.geid] = r.name; }
    const managerNames = [...new Set(Object.values(nmeta))].sort();
    // Single-loc: show BOTH the restaurant number AND its name (Notes 35). Multi = scope label.
    const storeLabel = (locs || []).length === 1 ? `${unpad(locs[0])} — ${nm(locs[0])}` : (page?.scopeLabel || '');
    return { managerNames, storeLabel };
  };

  return div({ style: { position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,.55)', overflow: 'auto', padding: 18 }, onClick: onClose },
    div({ onClick: e => e.stopPropagation(), style: { width: 'min(1040px,100%)', margin: '0 auto', background: 'var(--bg)', border: '1px solid var(--bdr)', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,.5)' } },
      // Header
      div({ style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--bdr)', background: 'var(--surf)', flexWrap: 'wrap' } },
        div({},
          div({ style: { fontSize: 15, fontWeight: 800, color: 'var(--text)' } },
            '📋 Leadership One-Pager',
            span({ style: { marginLeft: 8, fontSize: 11, fontWeight: 800, color: '#111', background: 'var(--accent,#f5bc00)', borderRadius: 5, padding: '1px 6px' }, title: cascadeOf(cascade).label }, cascadeOf(cascade).tag)),
          div({ style: { fontSize: 11, color: 'var(--text2)', marginTop: 2 } }, `${rLabel} · ${locs.length} store${locs.length === 1 ? '' : 's'} · window ${range.s} → ${range.e}`),
        ),
        div({ style: { display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' } },
          // Cascade pairing (who → whom)
          h('select', { value: cascade, onChange: e => setCascade(e.target.value), title: 'Cascade level', style: { ...btn, padding: '5px 8px', fontWeight: 700 } },
            CASCADE_LEVELS.map(c => h('option', { key: c.id, value: c.id }, c.label))),
          savedNote ? span({ style: { fontSize: 11, color: 'var(--text2)' } }, savedNote) : null,
          h('button', { onClick: save, disabled: saving, style: gold }, saving ? 'Saving…' : '💾 Save'),
          h('button', { onClick: () => printOnePager(page, period, narrative, actions.length ? actions : priorItems), style: btn }, '🖨 Print'),
          h('button', { onClick: () => printBlankOnePager(page, period), style: btn, title: 'Open-ended discussion sheet (auto state, blank sections)' }, '📝 Discussion'),
          h('button', { onClick: () => printWeeklyReview(page, wkOpts()), style: btn, title: 'Weekly Business Review — auto-fills actuals + shift-manager names, print to PDF' }, '📋 Weekly Review'),
          h('button', { onClick: () => downloadDoc(`Weekly-Review-${(page?.rangeLabel || '').replace(/[^\w-]+/g, '-')}.doc`, weeklyReviewHtml(page, { ...wkOpts(), word: true })), style: btn, title: 'Download the filled Weekly Review as an editable Word (.doc)' }, '⬇ Word'),
          h('button', { onClick: () => downloadDoc('Weekly-Review-BLANK.doc', weeklyReviewHtml(page, { blank: true, word: true })), style: btn, title: 'Download a fully-blank fillable Weekly Review (.doc) for hand/Word completion' }, '▫ Blank'),
          h('button', { onClick: onClose, style: { ...btn, fontWeight: 800 } }, '✕'),
        ),
      ),
      // Range controls (Notes 31 #1) — mode pills + anchor/custom dates
      div({ style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', padding: '8px 16px', borderBottom: '1px solid var(--bdr)', background: 'var(--surf)' } },
        span({ style: { fontSize: 11, fontWeight: 700, color: 'var(--text2)' } }, 'Range:'),
        ...[['week', 'Week'], ['mtd', 'Month-to-date'], ['ytd', 'Year-to-date'], ['custom', 'Custom']].map(([m, lbl]) =>
          h('button', { key: m, onClick: () => setRangeMode(m), style: { padding: '4px 10px', fontSize: 11, borderRadius: 7, cursor: 'pointer', border: '1px solid ' + (rangeMode === m ? 'var(--accent,#f5bc00)' : 'var(--bdr)'), background: rangeMode === m ? 'var(--accent-dim,rgba(245,188,0,.12))' : 'var(--surf)', color: 'var(--text)', fontWeight: 700 } }, lbl)),
        rangeMode === 'custom'
          ? span({ style: { display: 'flex', gap: 6, alignItems: 'center' } },
              h('input', { type: 'date', value: customRange.s, onChange: e => setCustomRange(r => ({ ...r, s: e.target.value })), style: { ...btn, padding: '4px 6px' } }),
              span({ style: { fontSize: 11, color: 'var(--text2)' } }, 'to'),
              h('input', { type: 'date', value: customRange.e, onChange: e => setCustomRange(r => ({ ...r, e: e.target.value })), style: { ...btn, padding: '4px 6px' } }))
          : span({ style: { display: 'flex', gap: 6, alignItems: 'center' } },
              span({ style: { fontSize: 11, color: 'var(--text2)' } }, rangeMode === 'week' ? 'Week containing:' : 'As of:'),
              h('input', { type: 'date', value: weekDate, onChange: e => setWeekDate(e.target.value), style: { ...btn, padding: '4px 6px' } })),
        span({ style: { marginLeft: 'auto', fontSize: 10.5, color: 'var(--text3,var(--text2))' } }, 'Header KPIs show the selected range with YTD alongside for movement.'),
      ),
      !page
        ? div({ style: { padding: 40, textAlign: 'center', color: 'var(--text2)' } }, 'Loading…')
        : div({ style: { padding: 16, display: 'grid', gap: 16 } },
            // Scope presets (tie to the org groupings in settings)
            div({ style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
              span({ style: { fontSize: 11, fontWeight: 700, color: 'var(--text2)' } }, 'Scope:'),
              ...[['Org', 'All stores', allLocs, 'org'], ['OK', 'Oklahoma', stateLocs('OK'), 'org'], ['FL', 'Florida', stateLocs('FL'), 'org']].map(([lbl, sl, list, lv]) =>
                h('button', { key: lbl, onClick: () => applyScope(sl, list, lv), style: { padding: '4px 10px', fontSize: 11, borderRadius: 7, cursor: 'pointer', border: '1px solid ' + (scopeLabel === sl ? 'var(--accent,#f5bc00)' : 'var(--bdr)'), background: 'var(--surf)', color: 'var(--text)', fontWeight: 700 } }, lbl)),
              Object.keys(operators).length ? h('select', {
                value: scopeLabel.startsWith('Owner: ') ? scopeLabel.slice(7) : '',
                onChange: e => e.target.value && applyScope('Owner: ' + e.target.value, operators[e.target.value], 'owner'),
                style: { fontSize: 11, padding: '4px 6px', borderRadius: 7, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text)' },
              }, [h('option', { key: '', value: '' }, 'Owner…'), ...Object.keys(operators).map(o => h('option', { key: o, value: o }, o))]) : null,
              Object.keys(supervisors).length ? h('select', {
                value: scopeLabel.startsWith('Supervisor: ') ? scopeLabel.slice(12) : '',
                onChange: e => e.target.value && applyScope('Supervisor: ' + e.target.value, supervisors[e.target.value], 'supervisor'),
                style: { fontSize: 11, padding: '4px 6px', borderRadius: 7, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text)' },
              }, [h('option', { key: '', value: '' }, 'Supervisor…'), ...Object.keys(supervisors).map(s => h('option', { key: s, value: s }, s))]) : null,
              span({ style: { fontSize: 11, color: 'var(--text2)' } }, `${scopeLabel} · ${locs.length} store${locs.length === 1 ? '' : 's'}`),
            ),
            // Store pills (fine control)
            div({ style: { display: 'flex', gap: 5, flexWrap: 'wrap' } },
              (allLocs).map(l => {
                const on = locs.includes(l);
                return h('button', { key: l, onClick: () => setLocs(on ? locs.filter(x => x !== l) : [...locs, l]),
                  style: { padding: '3px 8px', fontSize: 10.5, borderRadius: 12, cursor: 'pointer', border: '1px solid ' + (on ? 'var(--accent,#f5bc00)' : 'var(--bdr)'), background: on ? 'var(--accent-dim,rgba(245,188,0,.12))' : 'var(--surf)', color: 'var(--text)' } }, nm(l));
              }),
            ),
            // Cascade focus banner — what THIS level's conversation is about (Notes 32 C)
            h(FocusBanner, { cascade: page.cascade }),
            // Opportunity $ headline
            h(OppSection, { page }),
            // Top/bottom performer highlight — supervisor & above (multi-store scope)
            page.perLocation && page.perLocation.length > 1 ? h(TopBottomStrip, { rows: page.perLocation }) : null,
            // Current state grid — ordered by the cascade level's focus priority
            h(StateGrid, { rows: orderByFocus(page.currentState, page.cascade?.priority), rangeLabel: page.rangeLabel, ytdLabel: page.ytdLabel }),
            // Per-location breakdown — the roll-up's stores listed individually (Notes 33 B#10)
            page.perLocation && page.perLocation.length ? h(PerLocationTable, { rows: page.perLocation }) : null,
            // Follow-ups
            priorItems.length ? h(FollowUps, { items: page.followUps }) : null,
            // Suggested actions
            h(Suggested, { acts: page.suggestedActions, onAdd: addAction, rangeLabel: page.rangeLabel }),
            // Action plan (working)
            h(ActionPlan, { actions, setActionStatus, removeAction }),
            // Narrative
            div({},
              div({ style: { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text2)', marginBottom: 5 } }, 'Narrative / notes'),
              h('textarea', { value: narrative, onChange: e => setNarrative(e.target.value), placeholder: 'Context, wins, focus for the week…', style: { width: '100%', minHeight: 80, padding: 8, borderRadius: 8, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text)', fontSize: 12.5, resize: 'vertical' } }),
            ),
          ),
    ),
  );
}

function FocusBanner({ cascade }) {
  if (!cascade) return null;
  return div({ style: { border: '1px solid var(--bdr)', borderLeft: '3px solid var(--accent,#f5bc00)', borderRadius: 8, padding: '8px 12px', background: 'var(--surf)' } },
    div({ style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
      span({ style: { fontSize: 11, fontWeight: 800, color: '#111', background: 'var(--accent,#f5bc00)', borderRadius: 5, padding: '1px 6px' } }, cascade.tag),
      span({ style: { fontSize: 12, fontWeight: 700, color: 'var(--text)' } }, cascade.label),
      span({ style: { fontSize: 12, color: 'var(--text2)' } }, '— ' + (cascade.focus || ''))),
    cascade.talk ? div({ style: { fontSize: 10.5, color: 'var(--text3,var(--text2))', marginTop: 4 } }, cascade.talk) : null);
}

function OppSection({ page }) {
  const total = page.opportunityTotal || 0;
  const d = page.opportunity?.district || {};
  const rLabel = page.rangeLabel || 'selected range';
  const annual = annualize(total, page.annualFactor || 52);
  const top = rankByOpportunity(page.opportunity?.perStore || []).slice(0, 5).filter(p => p.total$ > 0);
  const chip = (label, v, sub) => div({ style: { flex: 1, minWidth: 120, background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '8px 10px' } },
    div({ style: { fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.3px' } }, label),
    div({ style: { fontSize: 15, fontWeight: 800, color: 'var(--text)' } }, f$(v)),
    sub ? div({ style: { fontSize: 9.5, color: 'var(--text3,var(--text2))' } }, sub) : null);
  return div({ style: { border: '1px solid var(--accent,#f5bc00)', borderRadius: 10, padding: 12, background: 'var(--accent-dim,rgba(245,188,0,.06))' } },
    div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: 8, marginBottom: 8 } },
      div({ style: { fontSize: 12, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text)' } }, '💰 Opportunity on the Table (vs target)'),
      div({ style: { fontSize: 11, color: 'var(--text2)' } }, `$ are for the ${rLabel} · ~${f$(annual)}/yr annualized`)),
    div({ style: { display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: top.length ? 10 : 0 } },
      chip(rLabel, total, 'total recoverable'), chip('Labor', d.labor$, 'excess labor $'), chip('Food (FOB)', d.food$, 'excess food $'), chip('Sales to plan', d.gc$, 'behind projected prod sales')),
    top.length ? div({},
      div({ style: { display: 'flex', justifyContent: 'space-between', fontSize: 10.5, color: 'var(--text2)', marginBottom: 4 } },
        span(null, 'Biggest $ by store'),
        span(null, 'L = Labor · F = Food (FOB) · G = Guest count')),
      top.map(p => div({ key: p.loc, style: { display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '3px 0', borderBottom: '.5px solid var(--bdr)' } },
        span({ style: { color: 'var(--text)' } }, nm(p.loc)),
        span({ style: { color: 'var(--text2)' } }, `${f$(p.total$)}  (L ${f$(p.labor$)} · F ${f$(p.food$)} · G ${f$(p.gc$)})`)))) : null,
  );
}

function StateGrid({ rows, rangeLabel, ytdLabel }) {
  return div({},
    div({ style: { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text2)', marginBottom: 5 } },
      `Current state — ${rangeLabel || 'range'} (YTD alongside)`),
    div({ style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 8 } },
      (rows || []).map(r => {
        const off = r.target != null && r.actual != null;
        const bad = off && (r.lowerBetter ? r.actual > r.target : r.actual < r.target);
        const blankManual = r.manualOnly && r.actual == null;
        return div({ key: r.key, style: { background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '8px 10px' } },
          div({ style: { fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.3px' } }, r.label),
          div({ style: { fontSize: 15, fontWeight: 800, color: 'var(--text)' } }, valFmt(r.actual, r.fmt)),
          blankManual ? div({ style: { fontSize: 9, color: 'var(--text3,var(--text2))', fontStyle: 'italic' } }, 'manual upload only — no cloud feed') : null,
          r.ytd != null ? div({ style: { fontSize: 10, color: 'var(--text2)' } }, `${ytdLabel || 'YTD'}: ${valFmt(r.ytd, r.fmt)}`) : null,
          r.target != null ? div({ style: { fontSize: 10.5, color: bad ? '#ef4444' : '#10b981' } }, 'tgt ' + valFmt(r.target, r.fmt)) : null);
      })));
}

// Top/bottom performer highlight (supervisor & above — scope spans >1 store). Ranks by
// sales vs LY (the headline performance signal). When the scope mixes states, also breaks
// out each state's own best/worst (FL→FL, OK→OK) so a supervisor sees their district.
const stateOf = loc => (INV_ORG_COORDS[unpad(loc)] || {}).state || '';
function pickTopBottom(rows) {
  const rated = (rows || []).filter(r => r.salesVsLYPct != null);
  if (rated.length < 2) return null;
  const sorted = [...rated].sort((a, b) => b.salesVsLYPct - a.salesVsLYPct);
  return { top: sorted[0], bottom: sorted[sorted.length - 1] };
}
function TopBottomStrip({ rows }) {
  const overall = pickTopBottom(rows);
  if (!overall) return null;
  const byState = {};
  for (const r of rows) { const s = stateOf(r.loc); if (s) (byState[s] = byState[s] || []).push(r); }
  const states = Object.keys(byState).filter(s => (byState[s] || []).length >= 2);
  const pct = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  const cell = (tag, r, color) => div({ style: { flex: 1, minWidth: 150, background: 'var(--surf)', border: '1px solid var(--bdr)', borderLeft: `3px solid ${color}`, borderRadius: 8, padding: '7px 10px' } },
    div({ style: { fontSize: 9.5, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.3px' } }, tag),
    div({ style: { fontSize: 13, fontWeight: 800, color: 'var(--text)' } }, nm(r.loc)),
    div({ style: { fontSize: 11, color, fontWeight: 700 } }, `${pct(r.salesVsLYPct)} vs LY`));
  const pair = (label, tb) => tb ? div({ style: { marginBottom: 8 } },
    label ? div({ style: { fontSize: 10, fontWeight: 800, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.3px', marginBottom: 4 } }, label) : null,
    div({ style: { display: 'flex', gap: 8, flexWrap: 'wrap' } }, cell('🏆 Top performer', tb.top, '#10b981'), cell('⚠️ Needs attention', tb.bottom, '#ef4444'))) : null;
  return div({},
    div({ style: { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text2)', marginBottom: 5 } }, 'Top & bottom (by sales vs LY)'),
    pair(states.length > 1 ? 'District (all)' : '', overall),
    ...(states.length > 1 ? states.sort().map(s => pair(s === 'OK' ? 'Oklahoma' : s === 'FL' ? 'Florida' : s, pickTopBottom(byState[s]))) : []));
}

function PerLocationTable({ rows }) {
  const th = (t, extra) => h('th', { style: { textAlign: extra?.r ? 'right' : 'left', padding: '4px 8px', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '.3px', color: 'var(--text2)', whiteSpace: 'nowrap', borderBottom: '1px solid var(--bdr)' } }, t);
  // color a value vs its target (lowerBetter for cost/speed metrics)
  const cell = (v, fmt, tgt, lowerBetter) => {
    const bad = v != null && tgt != null && (lowerBetter ? v > tgt : v < tgt);
    return h('td', { style: { textAlign: 'right', padding: '4px 8px', fontSize: 11.5, whiteSpace: 'nowrap', color: v == null ? 'var(--text3,var(--text2))' : bad ? '#ef4444' : 'var(--text)' } }, valFmt(v, fmt));
  };
  return div({},
    div({ style: { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text2)', margin: '2px 0 5px' } }, `By location (${rows.length}) — worst sales vs LY first`),
    div({ style: { overflowX: 'auto', border: '1px solid var(--bdr)', borderRadius: 8 } },
      h('table', { style: { width: '100%', borderCollapse: 'collapse', minWidth: 620 } },
        h('thead', null, h('tr', null,
          th('Store'), th('Product Sales', { r: 1 }), th('vs LY', { r: 1 }), th('FOB %', { r: 1 }), th('Labor %', { r: 1 }), th('OEPE', { r: 1 }), th('R2P', { r: 1 }), th('Opp $/wk', { r: 1 }))),
        h('tbody', null, rows.map(r => h('tr', { key: r.loc, style: { borderTop: '.5px solid var(--bdr)' } },
          h('td', { style: { padding: '4px 8px', fontSize: 11.5, color: 'var(--text)', whiteSpace: 'nowrap' } }, nm(r.loc)),
          cell(r.netSales, '$'),
          h('td', { style: { textAlign: 'right', padding: '4px 8px', fontSize: 11.5, whiteSpace: 'nowrap', color: r.salesVsLYPct == null ? 'var(--text3,var(--text2))' : r.salesVsLYPct < 0 ? '#ef4444' : '#10b981' } },
            r.salesVsLYPct == null ? '—' : (r.salesVsLYPct >= 0 ? '+' : '') + r.salesVsLYPct.toFixed(1) + '%'),
          cell(r.fobPct, '%', r.fobTarget, true),
          cell(r.laborPct, '%', r.laborTarget, true),
          cell(r.oepe, 's', r.oepeTarget, true),
          cell(r.r2p, 's', r.r2pTarget, true),
          h('td', { style: { textAlign: 'right', padding: '4px 8px', fontSize: 11.5, whiteSpace: 'nowrap', color: 'var(--text2)' } }, r.oppWk ? f$(r.oppWk) : '—')))))));
}

function FollowUps({ items }) {
  return div({},
    div({ style: { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text2)', marginBottom: 5 } }, 'Follow-up — did last week move?'),
    (items || []).map((it, i) => {
      const m = FOLLOW_META[it.follow?.status] || FOLLOW_META['no-data'];
      return div({ key: i, style: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 8px', borderBottom: '.5px solid var(--bdr)', fontSize: 12.5 } },
        span({ style: { color: 'var(--text)' } }, it.title),
        span({ style: { color: m.color, fontWeight: 700, whiteSpace: 'nowrap' } }, m.label));
    }));
}

function Suggested({ acts, onAdd, rangeLabel }) {
  if (!acts || !acts.length) return null;
  return div({},
    div({ style: { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text2)', marginBottom: 2 } }, 'Suggested actions (approve to add)'),
    div({ style: { fontSize: 10, color: 'var(--text3,var(--text2))', marginBottom: 5 } }, `Shown as a weekly impact (the ${rangeLabel || 'selected range'} total is in parentheses) — not annualized.`),
    acts.map((a, i) => div({ key: i, style: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '6px 8px', borderBottom: '.5px solid var(--bdr)' } },
      div({}, div({ style: { fontSize: 12.5, fontWeight: 600, color: 'var(--text)' } }, a.title), div({ style: { fontSize: 11, color: 'var(--text2)' } }, a.detail)),
      h('button', { onClick: () => onAdd(a), style: { padding: '3px 10px', borderRadius: 6, border: '1px solid var(--accent,#f5bc00)', background: 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 11, fontWeight: 700, whiteSpace: 'nowrap' } }, '+ Add'))));
}

function ActionPlan({ actions, setActionStatus, removeAction }) {
  return div({},
    div({ style: { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text2)', marginBottom: 5 } }, `Action plan (${actions.length})`),
    actions.length === 0 ? div({ style: { fontSize: 12, color: 'var(--text2)' } }, 'Add from suggested actions above, then Save to carry these forward week-to-week.')
      : actions.map((a, i) => div({ key: i, style: { display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center', padding: '6px 8px', borderBottom: '.5px solid var(--bdr)' } },
          div({}, div({ style: { fontSize: 12.5, color: 'var(--text)' } }, a.title), a.detail ? div({ style: { fontSize: 11, color: 'var(--text2)' } }, a.detail) : null),
          div({ style: { display: 'flex', gap: 6, alignItems: 'center' } },
            h('select', { value: a.status, onChange: e => setActionStatus(i, e.target.value), style: { fontSize: 11, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text)' } },
              ['open', 'in_progress', 'done', 'dropped'].map(s => h('option', { key: s, value: s }, s))),
            h('button', { onClick: () => removeAction(i), style: { border: 'none', background: 'none', color: 'var(--text2)', cursor: 'pointer', fontSize: 14 } }, '✕')))));
}

// Shared print HTML: per-location breakdown table (each store in the selected group).
function perLocTableHtml(page, esc) {
  const rows = page.perLocation || [];
  if (!rows.length) return '';
  const body = rows.map(r => `<tr><td style="text-align:left">${esc(nm(r.loc))}</td><td>${esc(f$(r.netSales))}</td><td>${r.salesVsLYPct == null ? '—' : (r.salesVsLYPct >= 0 ? '+' : '') + r.salesVsLYPct.toFixed(1) + '%'}</td><td>${esc(valFmt(r.fobPct, '%'))}</td><td>${esc(valFmt(r.laborPct, '%'))}</td><td>${esc(valFmt(r.oepe, 's'))}</td><td>${esc(valFmt(r.r2p, 's'))}</td><td>${r.oppWk ? esc(f$(r.oppWk)) : '—'}</td></tr>`).join('');
  return `<h2>By location (${rows.length}) — worst sales vs LY first</h2><table>
    <tr><td><b>Store</b></td><td><b>Product Sales</b></td><td><b>vs LY</b></td><td><b>FOB %</b></td><td><b>Labor %</b></td><td><b>OEPE</b></td><td><b>R2P</b></td><td><b>Opp $/wk</b></td></tr>
    ${body}</table>`;
}
// Shared print HTML: top/bottom performer callout (supervisor & above), with FL/OK breakout.
function topBottomHtml(page, esc) {
  const rows = page.perLocation || [];
  if (rows.length < 2) return '';
  const pctS = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
  const line = (label, tb) => tb ? `<div style="margin:3px 0"><b>${esc(label)}</b> &nbsp;🏆 ${esc(nm(tb.top.loc))} (${pctS(tb.top.salesVsLYPct)}) &nbsp;·&nbsp; ⚠️ ${esc(nm(tb.bottom.loc))} (${pctS(tb.bottom.salesVsLYPct)})</div>` : '';
  const byState = {};
  for (const r of rows) { const s = stateOf(r.loc); if (s) (byState[s] = byState[s] || []).push(r); }
  const states = Object.keys(byState).filter(s => (byState[s] || []).length >= 2).sort();
  let html = line(states.length > 1 ? 'District (all):' : 'Top / bottom:', pickTopBottom(rows));
  if (states.length > 1) for (const s of states) html += line((s === 'OK' ? 'Oklahoma:' : s === 'FL' ? 'Florida:' : s + ':'), pickTopBottom(byState[s]));
  return html ? `<h2>Top &amp; bottom (by sales vs LY)</h2>${html}` : '';
}

// Print → clean one-pager (also Save-as-PDF via the dialog). Escaped throughout.
function printOnePager(page, period, narrative, actions) {
  const w = window.open('', '_blank', 'width=850,height=1000'); if (!w || !page) return;
  const esc = escapeHtml;
  const rLabel = page.rangeLabel || period;
  const ytdLabel = page.ytdLabel || 'YTD';
  const casc = page.cascade || { tag: '', label: '' };
  const state = orderByFocus(page.currentState, casc.priority).map(r => `<td><b>${esc(r.label)}</b><br>${esc(valFmt(r.actual, r.fmt))}${r.target != null ? ` <span style="color:#666">/ ${esc(valFmt(r.target, r.fmt))}</span>` : ''}${r.ytd != null ? `<br><span style="color:#888;font-size:9px">${esc(ytdLabel)}: ${esc(valFmt(r.ytd, r.fmt))}</span>` : ''}</td>`).join('');
  const opp = page.opportunity?.district || {};
  const acts = (actions || []).map(a => `<li>${esc(a.title)}${a.status ? ` — <i>${esc(a.status)}</i>` : ''}</li>`).join('');
  const foll = (page.followUps || []).map(it => `<li>${esc(it.title)} — ${esc((it.follow?.status || '').toString())}</li>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>One-Pager ${esc(rLabel)}</title>
    <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:26px;font-size:12px}
    h1{font-size:17px;margin:0 0 2px}.sub{color:#666;font-size:11px;margin-bottom:12px}
    .tag{display:inline-block;background:#f5bc00;color:#111;font-weight:800;border-radius:4px;padding:1px 6px;font-size:11px;margin-left:6px}
    h2{font-size:12px;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid #111;padding-bottom:3px;margin:16px 0 6px}
    table{border-collapse:collapse;width:100%}td{border:1px solid #ccc;padding:5px 7px;text-align:center;font-size:11px}
    .opp{font-size:15px;font-weight:800}ul{margin:4px 0;padding-left:18px}</style></head><body>
    <h1>Leadership One-Pager<span class="tag">${esc(casc.tag)}</span></h1>
    <div class="sub">${esc(rLabel)} · ${esc(page.scopeLabel || '')} · ${esc(casc.label)}</div>
    ${casc.focus ? `<div style="font-size:11px;color:#333;margin:2px 0 10px;padding:5px 9px;border-left:3px solid #f5bc00;background:#faf7ea">Focus: ${esc(casc.focus)}${casc.talk ? `<br><span style="color:#666">${esc(casc.talk)}</span>` : ''}</div>` : ''}
    <h2>Opportunity on the table (vs target)</h2>
    <div class="opp">${esc(f$(page.opportunityTotal || 0))} over the ${esc(rLabel)} — Labor ${esc(f$(opp.labor$))} · Food ${esc(f$(opp.food$))} · Guest count ${esc(f$(opp.gc$))}</div>
    <h2>Current state — ${esc(rLabel)} (${esc(ytdLabel)} alongside)</h2><table><tr>${state}</tr></table>
    ${topBottomHtml(page, esc)}
    ${perLocTableHtml(page, esc)}
    ${foll ? `<h2>Follow-up</h2><ul>${foll}</ul>` : ''}
    ${acts ? `<h2>Action plan</h2><ul>${acts}</ul>` : ''}
    ${narrative ? `<h2>Notes</h2><div>${esc(narrative)}</div>` : ''}
    </body></html>`);
  w.document.close(); w.focus(); setTimeout(() => { try { w.print(); } catch {} }, 350);
}

// Generic OPEN-ENDED discussion one-pager: auto current-state for reference, but blank
// sections for any pairing (Owner↔DO, DO↔Supervisor, Supervisor↔GM) to fill in together —
// which forces both parties to look the numbers up and drive the conversation.
function printBlankOnePager(page, period) {
  const w = window.open('', '_blank', 'width=850,height=1000'); if (!w || !page) return;
  const esc = escapeHtml;
  const rLabel = page.rangeLabel || period;
  const casc = page.cascade || { tag: '', label: '' };
  const state = orderByFocus(page.currentState, casc.priority).map(r => `<td><b>${esc(r.label)}</b><br>${esc(valFmt(r.actual, r.fmt))}${r.target != null ? ` <span style="color:#666">/ ${esc(valFmt(r.target, r.fmt))}</span>` : ''}</td>`).join('');
  const opp = page.opportunity?.district || {};
  const lines = (n) => Array.from({ length: n }, () => '<div class="wl"></div>').join('');
  const sec = (t, n) => `<h2>${esc(t)}</h2>${lines(n)}`;
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Discussion One-Pager ${esc(rLabel)}</title>
    <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#111;margin:26px;font-size:12px}
    h1{font-size:17px;margin:0 0 2px}.sub{color:#666;font-size:11px;margin-bottom:12px}
    .tag{display:inline-block;background:#f5bc00;color:#111;font-weight:800;border-radius:4px;padding:1px 6px;font-size:11px;margin-left:6px}
    h2{font-size:12px;text-transform:uppercase;letter-spacing:.4px;border-bottom:2px solid #111;padding-bottom:3px;margin:16px 0 6px}
    table{border-collapse:collapse;width:100%}td{border:1px solid #ccc;padding:5px 7px;text-align:center;font-size:11px}
    .ref{font-size:11px;color:#333;margin:6px 0}.wl{border-bottom:1px solid #999;height:1.5em;margin-top:7px}
    @media print{@page{margin:.5in}}</style></head><body>
    <h1>Leadership One-Pager — Discussion<span class="tag">${esc(casc.tag)}</span></h1>
    <div class="sub">${esc(rLabel)} · ${esc(page.scopeLabel || '')} · ${esc(casc.label)} &nbsp;·&nbsp; ______________ &nbsp;↔&nbsp; ______________</div>
    ${casc.focus ? `<div style="font-size:11px;color:#333;margin:2px 0 10px;padding:5px 9px;border-left:3px solid #f5bc00;background:#faf7ea">Focus: ${esc(casc.focus)}</div>` : ''}
    <h2>Current state (reference)</h2><table><tr>${state}</tr></table>
    <div class="ref">Opportunity on the table (${esc(rLabel)}): <b>${esc(f$(page.opportunityTotal || 0))}</b> — Labor ${esc(f$(opp.labor$))} · Food ${esc(f$(opp.food$))} · Guest count ${esc(f$(opp.gc$))} (GC vs plan)</div>
    ${topBottomHtml(page, esc)}
    ${perLocTableHtml(page, esc)}
    ${sec('Wins to celebrate', 3)}
    ${sec('Concerns / what needs attention', 4)}
    ${sec('Action plan — what are we working on this week?', 5)}
    ${sec("Follow-up — how did last week's items move?", 4)}
    ${sec('Notes / commitments', 3)}
    </body></html>`);
  w.document.close(); w.focus(); setTimeout(() => { try { w.print(); } catch {} }, 350);
}

// Weekly Business Review & Checkpoint — a polished, mostly-blank prep sheet the leader
// completes BEFORE the discussion (encourages looking at results + planning actions).
// Modeled on the owner's ReportLab design; rebuilt natively so it prints to PDF from the
// browser, auto-fills scorecard actuals from live data, and pre-lists the store's Shift
// Managers. `managerNames` = names for the selected scope (blank rows when unknown).
// Review title adapts to the cascade level so the SAME form serves all three
// conversations (Owner→DO district, DO→Supervisor area, Supervisor→GM restaurant).
const REVIEW_TITLE_BY_LEVEL = { o_d: 'ORGANIZATION BUSINESS REVIEW', d_s: 'PATCH BUSINESS REVIEW', s_g: 'RESTAURANT BUSINESS REVIEW' };
// The RECIPIENT's job title per cascade level — labels the signature/attendee field (Notes
// 35: "Leader:" → the actual role being reviewed). o_d reviews a DO, d_s a Supervisor, s_g a GM.
const REVIEW_RECIPIENT_BY_LEVEL = { o_d: 'DO', d_s: 'Supervisor', s_g: 'GM' };
// Talking-point altitude per cascade level (owner directive 2026-07-29): Owner→DO = big
// picture, outliers & opportunities; DO→Supervisor = the patch's stores, drive results
// through GMs; Supervisor→GM = store-specific improvement + wins (peers to motivate).
const REVIEW_FOCUS_BY_LEVEL = {
  o_d: 'Organization view — surface the biggest outliers and opportunities; agree where to press this week.',
  d_s: 'Patch view — drive store results through your GMs; focus on the stores that move the organization.',
  s_g: 'Store view — address the top improvement, celebrate the wins, use peers to motivate.',
};

// Build the Weekly Business Review HTML (used by both Print→PDF and Word download).
// blank:true → a fully-blank, leader-led fillable form (the priority): generic title, no
// live actuals, no pre-listed names, no level-specific data sections. Filled mode keeps
// the level-aware framing + auto actuals. Structure is shared so both stay in sync.
export function weeklyReviewHtml(page, { managerNames = [], storeLabel = '', blank = false, word = false } = {}) {
  const esc = escapeHtml;
  const rLabel = page.rangeLabel || '';
  const casc = page.cascade || {};
  // Title + focus follow the cascade level so each level has its OWN blank template
  // (District / Area / Restaurant); no level selected → generic.
  const title = REVIEW_TITLE_BY_LEVEL[casc.id] || 'WEEKLY BUSINESS REVIEW';
  const recipient = REVIEW_RECIPIENT_BY_LEVEL[casc.id] || 'Leader';
  const focus = REVIEW_FOCUS_BY_LEVEL[casc.id] || '';
  // Explicit calendar window under the period label (Notes 35: clarify the date range).
  const niceDate = s => { const p = String(s || '').split('-'); return p.length === 3 ? `${MONTH_NAMES[(+p[1] || 1) - 1]} ${+p[2]}, ${p[0]}` : ''; };
  const win = (page.range && page.range.s && page.range.e) ? `${niceDate(page.range.s)} – ${niceDate(page.range.e)}` : '';
  const isDistrict = casc.id === 'o_d', isPatch = casc.id === 'd_s', isStore = casc.id === 's_g';
  const hasStores = (page.perLocation || []).length > 0;
  const cs = Object.fromEntries((page.currentState || []).map(r => [r.key, r]));
  const ra = page.reviewActuals || {};
  const fillLine = '____________';
  // Scorecard rows carry a numeric actual + a GROUP-ROLLED-UP target + direction, so the
  // Target column pre-fills and On-Track auto-deduces (Notes 35). Targets: speed/labor/FOB
  // from the scope's own DEFAULT_TARGETS (via currentState); Product Sales vs its projection;
  // GC ≥ LY; Voice vs the standing thresholds (OSAT ≥90%, Accuracy B2B ≥95%). blank → both blank.
  const fmtDelta = v => (v == null) ? null : (v >= 0 ? '+' : '') + (v * 100).toFixed(1) + '%';
  const fmtVal = (v, fmt) => fmt === 'd' ? fmtDelta(v) : valFmt(v, fmt);
  const onTrackOf = (v, t, dir) => (v == null || t == null) ? null : (dir === 'lower' ? v <= t : v >= t);
  const otCell = (ot) => (blank || ot == null)
    ? '[&nbsp;&nbsp;] Yes &nbsp;&nbsp; [&nbsp;&nbsp;] No'
    : ot ? '[&nbsp;<b>X</b>&nbsp;] Yes &nbsp;&nbsp; [&nbsp;&nbsp;] No'
         : '[&nbsp;&nbsp;] Yes &nbsp;&nbsp; [&nbsp;<b>X</b>&nbsp;] No';
  const scDefs = [
    { label: 'Product Sales',          v: cs.sales?.actual,    t: ra.projSales,             fmt: '$', dir: 'higher' },
    { label: 'Guest Count (GC) vs LY', v: ra.gcVsLY,           t: 0,                        fmt: 'd', dir: 'higher', tLabel: '≥ LY' },
    { label: 'Drive-Thru OEPE',        v: cs.oepe?.actual,     t: cs.oepe?.target,          fmt: 's', dir: 'lower' },
    { label: 'R2P (Front Counter)',    v: cs.r2p?.actual,      t: cs.r2p?.target,           fmt: 's', dir: 'lower' },
    { label: 'Labor Cost %',           v: cs.laborPct?.actual, t: cs.laborPct?.target,      fmt: '%', dir: 'lower' },
    { label: 'Food Over Base %',       v: cs.fobPct?.actual,   t: cs.fobPct?.target,        fmt: '%', dir: 'lower' },
    { label: 'Voice OSAT',             v: ra.osat,             t: 0.90,                     fmt: '%', dir: 'higher' },
    { label: 'Voice B2B (Accuracy)',   v: ra.accB2B,           t: 0.95,                     fmt: '%', dir: 'higher' },
    // Store-level (Supervisor→GM) adds kitchen speed/health — noise at district/patch.
    ...(isStore ? [
      { label: 'KVS Time per GC',      v: ra.kvsPerGc,         t: (cs.kvst && cs.kvst.target) ?? null, fmt: 's', dir: 'lower' },
      { label: 'KVS Healthy Usage',    v: null,                t: null,                     fmt: '%', dir: 'higher' },
    ] : []),
  ];
  const scBody = scDefs.map(r => {
    const av = (!blank && r.v != null) ? `<b>${esc(fmtVal(r.v, r.fmt))}</b>` : fillLine;
    const tv = blank ? fillLine
      : (r.tLabel ? esc(r.tLabel) : (r.t != null ? esc(fmtVal(r.t, r.fmt)) : fillLine));
    const ot = otCell(blank ? null : onTrackOf(r.v, r.t, r.dir));
    return `<tr>
      <td style="text-align:left"><b>${esc(r.label)}</b></td>
      <td>${tv}</td>
      <td>${av}</td>
      <td style="text-align:left">${ot}</td></tr>`;
  }).join('');

  // Shift Manager tracking — 8 lines, condensed (keeps the store form on one page; a store
  // rarely runs >8 SMs and pre-listed names still populate). Names only in filled mode.
  const smSrc = blank ? [] : managerNames;
  const SM_ROWS = 8;
  const smBody = Array.from({ length: SM_ROWS }, (_, i) => {
    const nm2 = (smSrc && smSrc[i]) || '';
    return `<tr>
      <td style="text-align:left">${i + 1}. ${nm2 ? `<b>${esc(nm2)}</b>` : '&nbsp;'}</td>
      <td>[ ] B&nbsp; [ ] L&nbsp; [ ] D&nbsp; [ ] O</td>
      <td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td><td>[ ] Yes&nbsp; [ ] No</td></tr>`;
  }).join('');

  const line = '<div style="border-bottom:1px solid #999;height:1.35em;margin-top:4px"></div>';
  const lines = n => Array.from({ length: n }, () => line).join('');
  const wideLine = '<div style="border-bottom:1px solid #999;height:1.3em;margin-top:5px;width:100%"></div>';
  const subhead = t => `<div style="font-size:8.5pt;font-weight:bold;margin:6px 0 2px">${t}</div>`;
  // A blank fillable table: header row (first col left) + n empty rows.
  const blankRows = (headers, n) => `<table class="tight">
    <tr>${headers.map((hh, i) => `<th style="text-align:${i === 0 ? 'left' : 'center'}">${hh}</th>`).join('')}</tr>
    ${Array.from({ length: n }, () => `<tr>${headers.map((_, i) => `<td${i === 0 ? ' style="text-align:left"' : ''}>&nbsp;</td>`).join('')}</tr>`).join('')}
  </table>`;
  const stripH2 = s => s.replace(/<h2[^>]*>.*?<\/h2>/, '');

  // ── Level-specific middle sections ──────────────────────────────────────────
  // STORE (Supervisor→GM): operational deep dive + shift-manager tracking.
  const storeMiddle = `
    <div class="banner">DEEP DIVE: OPERATIONAL BOTTLENECKS &amp; COST CONTROLS</div>
    <div class="dd"><b>A. Speed of Service &amp; Drive-Thru</b><br/>• Primary bottleneck: ${lines(1)}
      • Breakfast Peak (7–9a): target ______ | actual ______<br/>
      • Lunch Peak (11a–2p): target ______ | actual ______<br/>
      • Dinner Peak (5–7p): target ______ | actual ______<br/>
      • Corrective actions: <div class="fl">1.<span></span> 2.<span></span></div></div>
    <div class="dd" style="margin-top:6px"><b>B. Food Cost &amp; Waste</b><br/>
      • Top 3 high-variance items: 1.<span class="il" style="width:1.7in"></span> 2.<span class="il" style="width:1.7in"></span> 3.<span class="il" style="width:1.7in"></span><br/>
      • Waste — Raw $ ____________ | Completed $ ____________<br/>
      • Yield actions: <span class="il" style="width:4.2in"></span></div>
    <div class="dd" style="margin-top:6px"><b>C. Labor Efficiency (Scheduling)</b><br/>• Projected Hours ____________ | Scheduled Hours ____________ | Variance ____________<br/>• Optimization actions: ${lines(1)}</div>

    <div class="banner">INDIVIDUAL SHIFT MANAGER PERFORMANCE TRACKING</div>
    <table class="tight">
      <tr><th style="text-align:left">Shift Manager</th><th>Dayparts Run</th><th>Avg OEPE</th><th>Shift Labor %</th><th>Shift Waste $</th><th>Checklist 100%?</th></tr>
      ${smBody}
    </table>
    ${managerNames && managerNames.length && !blank ? `<div style="font-size:7.5pt;color:#666;margin-top:3px">Names pre-listed from the store's Shift Manager Summary; per-shift metrics are for the leader to fill in.</div>` : ''}`;

  // DISTRICT (Owner→DO): outliers, opportunities, supervisor accountability (big picture).
  const districtMiddle = `
    <div class="banner">DISTRICT OUTLIERS</div>
    ${(!blank && hasStores)
      ? stripH2(topBottomHtml(page, esc)) + stripH2(perLocTableHtml(page, esc))
      : subhead('Top performers') + blankRows(['Store', "Why it's winning", 'How to reinforce'], 3)
        + subhead('Watch list / biggest gaps') + blankRows(['Store', 'Gap', 'Action / owner'], 4)}

    <div class="banner">OPPORTUNITIES &amp; PRIORITIES (biggest \$ / where to press)</div>
    ${lines(3)}

    <div class="banner">SUPERVISOR / PATCH ACCOUNTABILITY</div>
    ${blankRows(['Supervisor', 'Patch focus this week', 'Biggest gap', 'Committed action'], 6)}`;

  // PATCH (DO→Supervisor): store-by-store + GM coaching (drive results through GMs).
  const patchMiddle = `
    <div class="banner">STORE-BY-STORE — YOUR PATCH (drive results through your GMs)</div>
    ${(!blank && hasStores)
      ? stripH2(perLocTableHtml(page, esc))
      : blankRows(['Store', 'Sales vs LY', 'Labor %', 'FOB %', 'OEPE', 'Biggest gap', 'GM action'], 10)}

    <div class="banner">GM COACHING FOCUS</div>
    ${blankRows(['GM / Store', 'What to drive this week', 'Follow-up'], 5)}`;

  const middle = isDistrict ? districtMiddle : isPatch ? patchMiddle : storeMiddle;

  return `<!doctype html><html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>${esc(title)} ${esc(rLabel)}</title>
    ${word ? '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->' : ''}
    <style>
    ${word ? '@page WordSection1 { size: 8.5in 11.0in; margin: 0.4in; } div.WordSection1 { page: WordSection1; }' : ''}
    /* Tuned to fit ONE letter page across all levels (Notes 34). */
    body{font-family:Helvetica,Arial,sans-serif;color:#202124;margin:0;font-size:8.5pt}
    h1{color:#BD0011;font-size:15pt;font-weight:bold;margin:0 0 2px}
    .meta{font-size:9pt;margin-bottom:4px}
    .banner{background:#BD0011;color:#fff;font-weight:bold;font-size:10pt;padding:2px 6px;margin:3px 0 1px}
    table{border-collapse:collapse;width:100%}
    th{background:#202124;color:#fff;font-size:8.5pt;padding:2px 6px;text-align:center}
    td{border:.5px solid #DADCE0;padding:2px 6px;font-size:8pt;text-align:center;vertical-align:middle;word-wrap:break-word}
    tbody tr:nth-child(even){background:#F8F9FA}
    table.tight td{padding:1px 5px;height:1.12em}
    .dd{font-size:8.5pt;line-height:1.32;margin:1px 0}
    .il{display:inline-block;border-bottom:1px solid #999;height:1.05em;vertical-align:bottom;margin:0 3px}
    .fl{display:flex;gap:14px;align-items:flex-end;margin:1px 0 2px}
    .fl span{flex:1;border-bottom:1px solid #999;height:1.05em}
    @page{size:letter;margin:.4in}
    @media print{@page{size:letter;margin:.4in}}
    </style></head><body>
    ${word ? '<div class="WordSection1">' : ''}
    <h1>${esc(title)} &amp; CHECKPOINT</h1>
    <div class="meta"><b>Period:</b> ${esc(rLabel || '____________')}${win ? ` <span style="color:#666">(${esc(win)})</span>` : ''} &nbsp;&nbsp;&nbsp; ${casc.label ? `<b>${esc(casc.label)}</b> &nbsp;&nbsp;&nbsp; ` : ''}<b>${isDistrict ? 'District:' : isPatch ? 'Patch:' : 'Restaurant #:'}</b> ${(storeLabel && !blank) ? `<b>${esc(storeLabel)}</b>` : '__________________'} &nbsp;&nbsp;&nbsp; <b>${esc(recipient)}:</b> __________________</div>
    ${focus ? `<div style="font-size:9pt;color:#333;margin:2px 0 8px;padding:5px 9px;border-left:3px solid #FFC72C;background:#FFF9E8">${esc(focus)}</div>` : ''}

    <div class="banner">WINS FROM LAST WEEK</div>
    ${lines(2)}

    <div class="banner">WEEKLY PERFORMANCE SCORECARD</div>
    <table>
      <tr><th style="text-align:left">Metric</th><th>Target</th><th>Actual Result</th><th style="text-align:left">On Track?</th></tr>
      ${scBody}
    </table>
    ${blank ? '' : `<div style="font-size:7.5pt;color:#666;margin-top:3px">Bold actuals auto-filled from live Meridian data; targets + On-Track are for the leader to complete.</div>`}

    ${middle}

    <div class="banner">DISCUSSION CHECKLIST (covered? Y / N)</div>
    <div class="dd" style="line-height:1.5">
      • People Development / Training &nbsp;[&nbsp;&nbsp;]&nbsp;Y&nbsp;[&nbsp;&nbsp;]&nbsp;N &nbsp;&nbsp;&nbsp;
      • Promotions &nbsp;[&nbsp;&nbsp;]&nbsp;Y&nbsp;[&nbsp;&nbsp;]&nbsp;N &nbsp;&nbsp;&nbsp;
      • Controls / Cash &nbsp;[&nbsp;&nbsp;]&nbsp;Y&nbsp;[&nbsp;&nbsp;]&nbsp;N<br/>
      • Cleanliness Walkthrough &nbsp;[&nbsp;&nbsp;]&nbsp;Y&nbsp;[&nbsp;&nbsp;]&nbsp;N &nbsp;&nbsp;&nbsp;
      • Other: <span class="il" style="width:2.2in"></span>&nbsp;[&nbsp;&nbsp;]&nbsp;Y&nbsp;[&nbsp;&nbsp;]&nbsp;N
    </div>

    <div class="banner">COMMITMENTS FOR NEXT WEEK</div>
    ${lines(2)}
    ${word ? '</div>' : ''}
    </body></html>`;
}

// Print the Weekly Review (→ PDF via the browser dialog).
export function printWeeklyReview(page, opts) {
  const w = window.open('', '_blank', 'width=850,height=1100'); if (!w || !page) return;
  w.document.write(weeklyReviewHtml(page, opts));
  w.document.close(); w.focus(); setTimeout(() => { try { w.print(); } catch {} }, 350);
}

// Download an HTML doc as a Word-openable .doc (Word reads HTML-based .doc natively).
// The BOM + msword MIME make Word open it directly; the user edits in Word and can send
// it back for us to fold changes into the template.
export function downloadDoc(filename, html) {
  try {
    const blob = new Blob(['﻿' + html], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 150);
  } catch (e) { console.warn('[one-pager] Word download failed:', e); }
}
