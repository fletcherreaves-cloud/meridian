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
import { buildOnePagerInputs, buildMetricNow, buildCurrentState } from '../engine/one-pager-data.js';
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

// Cascade level (who's talking to whom) — Notes 31 #6. Separate from data SCOPE.
const CASCADE_LEVELS = [
  { id: 'o_d', tag: 'O›D', label: 'Owner → DO' },
  { id: 'd_s', tag: 'D›S', label: 'DO → Supervisor' },
  { id: 's_g', tag: 'S›G', label: 'Supervisor → GM' },
];
const cascadeOf = id => CASCADE_LEVELS.find(c => c.id === id) || CASCADE_LEVELS[0];

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
    const opportunity = computeOpportunity(inputs, { mode: 'target' });
    const currentState = buildCurrentState(ds, fobRows, locs, range);
    // YTD companion for each header KPI so movement is visible (Notes 31 #1).
    const ytdState = buildCurrentState(ds, fobRows, locs, ytd);
    const ytdByKey = Object.fromEntries((ytdState || []).map(r => [r.key, r.actual]));
    const currentStateWithYtd = (currentState || []).map(r => ({ ...r, ytd: ytdByKey[r.key] ?? null }));
    const metricNow = buildMetricNow(ds, fobRows, locs, range);
    const built = buildOnePager({
      level, scopeLabel, locs, period, currentState: currentStateWithYtd, opportunity, attention: [],
      priorActionItems: priorItems, metricNow, storeName: nm,
    });
    return { ...built, rangeLabel: rLabel, ytdLabel: rangeLabel('ytd', ytd, range.e), annualFactor: annualFactor(range), cascade: cascadeOf(cascade) };
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
            // Opportunity $ headline
            h(OppSection, { page }),
            // Current state grid
            h(StateGrid, { rows: page.currentState, rangeLabel: page.rangeLabel, ytdLabel: page.ytdLabel }),
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
      chip(rLabel, total, 'total recoverable'), chip('Labor', d.labor$, 'excess labor $'), chip('Food (FOB)', d.food$, 'excess food $'), chip('Guest count', d.gc$, '$ = GC gap × avg check')),
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
        return div({ key: r.key, style: { background: 'var(--surf)', border: '1px solid var(--bdr)', borderRadius: 8, padding: '8px 10px' } },
          div({ style: { fontSize: 10, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '.3px' } }, r.label),
          div({ style: { fontSize: 15, fontWeight: 800, color: 'var(--text)' } }, valFmt(r.actual, r.fmt)),
          r.ytd != null ? div({ style: { fontSize: 10, color: 'var(--text2)' } }, `${ytdLabel || 'YTD'}: ${valFmt(r.ytd, r.fmt)}`) : null,
          r.target != null ? div({ style: { fontSize: 10.5, color: bad ? '#ef4444' : '#10b981' } }, 'tgt ' + valFmt(r.target, r.fmt)) : null);
      })));
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
    div({ style: { fontSize: 10, color: 'var(--text3,var(--text2))', marginBottom: 5 } }, `Recoverable $ are measured over the ${rangeLabel || 'selected range'} (not annualized).`),
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

// Print → clean one-pager (also Save-as-PDF via the dialog). Escaped throughout.
function printOnePager(page, period, narrative, actions) {
  const w = window.open('', '_blank', 'width=850,height=1000'); if (!w || !page) return;
  const esc = escapeHtml;
  const rLabel = page.rangeLabel || period;
  const ytdLabel = page.ytdLabel || 'YTD';
  const casc = page.cascade || { tag: '', label: '' };
  const state = (page.currentState || []).map(r => `<td><b>${esc(r.label)}</b><br>${esc(valFmt(r.actual, r.fmt))}${r.target != null ? ` <span style="color:#666">/ ${esc(valFmt(r.target, r.fmt))}</span>` : ''}${r.ytd != null ? `<br><span style="color:#888;font-size:9px">${esc(ytdLabel)}: ${esc(valFmt(r.ytd, r.fmt))}</span>` : ''}</td>`).join('');
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
    <h2>Opportunity on the table (vs target)</h2>
    <div class="opp">${esc(f$(page.opportunityTotal || 0))} over the ${esc(rLabel)} — Labor ${esc(f$(opp.labor$))} · Food ${esc(f$(opp.food$))} · Guest count ${esc(f$(opp.gc$))}</div>
    <h2>Current state — ${esc(rLabel)} (${esc(ytdLabel)} alongside)</h2><table><tr>${state}</tr></table>
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
  const state = (page.currentState || []).map(r => `<td><b>${esc(r.label)}</b><br>${esc(valFmt(r.actual, r.fmt))}${r.target != null ? ` <span style="color:#666">/ ${esc(valFmt(r.target, r.fmt))}</span>` : ''}</td>`).join('');
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
    <h2>Current state (reference)</h2><table><tr>${state}</tr></table>
    <div class="ref">Opportunity on the table (${esc(rLabel)}): <b>${esc(f$(page.opportunityTotal || 0))}</b> — Labor ${esc(f$(opp.labor$))} · Food ${esc(f$(opp.food$))} · Guest count ${esc(f$(opp.gc$))}</div>
    ${sec('Wins to celebrate', 3)}
    ${sec('Concerns / what needs attention', 4)}
    ${sec('Action plan — what are we working on this week?', 5)}
    ${sec("Follow-up — how did last week's items move?", 4)}
    ${sec('Notes / commitments', 3)}
    </body></html>`);
  w.document.close(); w.focus(); setTimeout(() => { try { w.print(); } catch {} }, 350);
}
