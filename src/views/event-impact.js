// @ts-nocheck
// ── Event Impact Registry panel (Notes 47 "findings home") ───────────────────────────────────────
// Per-store × event-type measured sales impact, editable. Seeded from the 2022-2025 football
// measurement (home/away n-shrunk lifts). Overrides win over the measured seed; reset restores it.
// Feeds the forecast (setEventImpact refresh on save). Drillable by state/group.
import * as React from 'react';
import { loadEventImpact, saveEventImpact } from '../lib/supabase.js';
import { setEventImpact } from '../engine/forecast.js';
import { STORE_NAMES, INV_ORG_COORDS, sName } from '../constants.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const TYPES = [['sports', '🏈 Sports (Home/Away)'], ['event', '🎪 Festival / Fair'], ['weather', '🌧 Weather'], ['promo', '🍔 LTO / Promo'], ['holiday', '🎉 Holiday'],
  // Retail / shopping (Event Lookup v1, Notes 56 #4) — seeded by scripts/measure-retail-impact.mjs.
  ['tax_free', '🛍 Sales-Tax Holiday'], ['black_friday', '🛒 Black Friday'], ['small_biz_sat', '🏬 Small Business Saturday'], ['cyber_monday', '🖱 Cyber Monday']];
const STYPES = ['', 'rural', 'travel', 'metro'];
const pctOf = v => v == null ? '' : (v * 100).toFixed(2);      // 0.093 → "9.30"
const toFrac = s => { const n = parseFloat(String(s).replace('%', '')); return isNaN(n) ? null : n / 100; };

export function EventImpactPanel({ onClose }) {
  const { useState, useEffect, useMemo } = React;
  const [rows, setRows] = useState(null);       // loaded registry rows (camelCase)
  const [edits, setEdits] = useState({});       // key `loc|type` → {homeImpact, awayImpact, storeType}
  const [evType, setEvType] = useState('sports');
  const [scope, setScope] = useState('all');    // all | ok | fl
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => { let live = true; loadEventImpact().then(r => { if (live) setRows(r || []); }).catch(() => { if (live) setRows([]); }); return () => { live = false; }; }, []);

  const byKey = useMemo(() => { const m = {}; for (const r of (rows || [])) m[r.loc + '|' + r.eventType] = r; return m; }, [rows]);
  const LOCS = useMemo(() => Object.keys(STORE_NAMES)
    .filter(l => scope === 'all' || (INV_ORG_COORDS[l] || {}).state === (scope === 'ok' ? 'OK' : 'FL'))
    .sort((a, b) => (STORE_NAMES[a] || a).localeCompare(STORE_NAMES[b] || b)), [scope]);

  const cur = (loc, field) => {
    const k = loc + '|' + evType;
    if (edits[k] && field in edits[k]) return edits[k][field];
    const r = byKey[k];
    return r ? r[field] : (field === 'storeType' ? '' : null);
  };
  const setCur = (loc, field, val) => setEdits(e => ({ ...e, [loc + '|' + evType]: { ...e[loc + '|' + evType], [field]: val } }));
  const dirtyKeys = Object.keys(edits).filter(k => Object.keys(edits[k]).length);

  const resetToMeasured = (loc) => {
    const r = byKey[loc + '|' + evType]; if (!r) return;
    setCur(loc, 'homeImpact', r.measuredHome); setCur(loc, 'awayImpact', r.measuredAway); setCur(loc, '_reset', true);
  };
  const save = async () => {
    setBusy(true); setMsg('');
    const payload = dirtyKeys.map(k => {
      const [loc, eventType] = k.split('|'); const r = byKey[k] || {};
      const e = edits[k];
      return { loc, eventType,
        homeImpact: 'homeImpact' in e ? e.homeImpact : r.homeImpact,
        awayImpact: 'awayImpact' in e ? e.awayImpact : r.awayImpact,
        measuredHome: r.measuredHome ?? null, measuredAway: r.measuredAway ?? null,
        nHome: r.nHome ?? null, nAway: r.nAway ?? null,
        storeType: 'storeType' in e ? e.storeType : r.storeType,
        source: e._reset ? 'measured' : 'override' };
    });
    const res = await saveEventImpact(payload);
    if (res.errors?.length) { setMsg('Save error: ' + res.errors[0]); setBusy(false); return; }
    // reload + refresh forecast cache
    const fresh = await loadEventImpact(); setRows(fresh || []); setEdits({});
    const map = {}; for (const r of (fresh || [])) { const kk = String(r.loc).replace(/^0+/, ''); (map[kk] = map[kk] || {})[r.eventType] = { home: r.homeImpact, away: r.awayImpact }; }
    setEventImpact(map);
    setMsg('✓ Saved ' + payload.length + ' store' + (payload.length === 1 ? '' : 's') + ' — forecast updated.'); setBusy(false);
  };

  const th = (t, r) => h('th', { style: { textAlign: r ? 'right' : 'left', fontSize: '9px', textTransform: 'uppercase', letterSpacing: '.04em', color: 'var(--text3)', fontWeight: 700, padding: '5px 8px', borderBottom: '1px solid var(--bdr2)', position: 'sticky', top: 0, background: 'var(--surf)' } }, t);
  const inp = (val, on) => h('input', { value: val ?? '', onChange: e => on(e.target.value), placeholder: '—',
    style: { width: 52, textAlign: 'right', fontSize: '11px', background: 'var(--surf3)', color: 'var(--text)', border: '1px solid var(--bdr2)', borderRadius: 4, padding: '3px 5px', fontVariantNumeric: 'tabular-nums' } });
  const sportsT = evType === 'sports';

  return div({ style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 460, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, paddingTop: 24 } },
    div({ style: { background: 'var(--surf)', border: '.5px solid var(--bdr2)', borderRadius: 'var(--rl)', width: '100%', maxWidth: 860, maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,.5)', overflow: 'hidden' } },
      // header
      div({ style: { padding: '12px 16px', borderBottom: '.5px solid var(--bdr)', background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        span({ style: { fontSize: 18 } }, '📈'),
        div({ style: { flex: 1, minWidth: 160 } },
          div({ style: { fontSize: '13px', fontWeight: 800, color: 'var(--text)' } }, 'Event Impact Registry'),
          div({ style: { fontSize: '9px', color: 'var(--text3)' } }, 'Measured per-store sales lift by event type — editable; feeds the forecast')),
        h('select', { value: evType, onChange: e => setEvType(e.target.value), style: { fontSize: '11px', background: 'var(--surf3)', color: 'var(--text)', border: '1px solid var(--bdr2)', borderRadius: 5, padding: '4px 7px' } },
          TYPES.map(([v, l]) => h('option', { key: v, value: v }, l))),
        div({ style: { display: 'flex', gap: 3 } },
          ...[['all', 'All'], ['ok', 'OK'], ['fl', 'FL']].map(([id, l]) =>
            btn({ key: id, onClick: () => setScope(id), style: { fontSize: '10px', padding: '4px 9px', borderRadius: 'var(--r)', background: scope === id ? 'var(--adim)' : 'transparent', color: scope === id ? 'var(--amber)' : 'var(--text3)', border: '.5px solid ' + (scope === id ? 'rgba(245,188,0,.4)' : 'var(--bdr)'), cursor: 'pointer' } }, l))),
        btn({ className: 'btn btn-sm', style: { color: 'var(--text3)' }, onClick: onClose }, '✕')),
      // body
      rows === null ? div({ style: { padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: '12px' } }, 'Loading…')
      : div({ style: { flex: 1, overflow: 'auto', padding: '0 4px' } },
        h('table', { style: { width: '100%', borderCollapse: 'collapse', fontSize: '11.5px' } },
          h('thead', null, h('tr', null,
            th('Store'), th('Type'),
            th(sportsT ? 'Home %' : 'Impact %', true), sportsT ? th('Away %', true) : null,
            th('Measured', true), th('n', true), th(''))),
          h('tbody', null, ...LOCS.map(loc => {
            const r = byKey[loc + '|' + evType];
            const overridden = r && r.source === 'override' || (edits[loc + '|' + evType] && !edits[loc + '|' + evType]._reset && Object.keys(edits[loc + '|' + evType]).length);
            const home = cur(loc, 'homeImpact'), away = cur(loc, 'awayImpact');
            return h('tr', { key: loc, style: { borderBottom: '1px solid var(--bdr)' } },
              h('td', { style: { padding: '4px 8px', color: 'var(--text2)', whiteSpace: 'nowrap' } }, sName(loc) || STORE_NAMES[loc] || loc,
                overridden ? span({ style: { marginLeft: 5, fontSize: '8px', color: 'var(--amber)', fontWeight: 700 } }, '✎') : null),
              h('td', { style: { padding: '4px 8px' } },
                h('select', { value: cur(loc, 'storeType') || '', onChange: e => setCur(loc, 'storeType', e.target.value || null), style: { fontSize: '10px', background: 'var(--surf3)', color: 'var(--text2)', border: '1px solid var(--bdr2)', borderRadius: 4, padding: '2px 4px' } },
                  STYPES.map(t => h('option', { key: t || 'x', value: t }, t || '—')))),
              h('td', { style: { padding: '4px 8px', textAlign: 'right' } }, inp(typeof home === 'string' ? home : pctOf(home), v => setCur(loc, 'homeImpact', toFrac(v)))),
              sportsT ? h('td', { style: { padding: '4px 8px', textAlign: 'right' } }, inp(typeof away === 'string' ? away : pctOf(away), v => setCur(loc, 'awayImpact', toFrac(v)))) : null,
              h('td', { style: { padding: '4px 8px', textAlign: 'right', color: 'var(--text3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } },
                r ? (pctOf(r.measuredHome) + '%' + (sportsT && r.measuredAway != null ? ' / ' + pctOf(r.measuredAway) + '%' : '')) : '—'),
              h('td', { style: { padding: '4px 8px', textAlign: 'right', color: 'var(--text3)', fontVariantNumeric: 'tabular-nums' } }, r ? (sportsT ? (r.nHome || 0) + '/' + (r.nAway || 0) : (r.nHome || '')) : ''),
              h('td', { style: { padding: '4px 8px', textAlign: 'right' } },
                r && r.measuredHome != null ? btn({ onClick: () => resetToMeasured(loc), title: 'Reset to measured', style: { fontSize: '9px', color: 'var(--text3)', background: 'transparent', border: '1px solid var(--bdr2)', borderRadius: 4, padding: '2px 6px', cursor: 'pointer' } }, '↺') : null));
          }))),
        LOCS.every(l => !byKey[l + '|' + evType]) ? div({ style: { padding: '20px', textAlign: 'center', color: 'var(--text3)', fontSize: '11px', lineHeight: 1.6 } },
          'No measured data for this event type yet. Sports is seeded from the 2022-2025 football measurement; festivals/weather/LTOs populate as we measure them. You can still enter values manually.') : null),
      // footer
      div({ style: { padding: '10px 16px', borderTop: '.5px solid var(--bdr)', background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 10 } },
        div({ style: { flex: 1, fontSize: '10px', color: msg.startsWith('✓') ? '#6ee7b7' : msg ? '#fca5a5' : 'var(--text3)' } },
          msg || (sportsT ? 'Home = sales lift on home-game days; Away = away-game days. Values are % (e.g. 7.5). Edit = override; ↺ = reset to measured.' : 'Impact = sales lift %. Edit to set; ↺ resets to measured.')),
        dirtyKeys.length ? span({ style: { fontSize: '10px', color: 'var(--amber)', fontWeight: 700 } }, dirtyKeys.length + ' unsaved') : null,
        btn({ className: 'btn btn-sm btn-a', disabled: busy || !dirtyKeys.length, style: { fontWeight: 700, opacity: (busy || !dirtyKeys.length) ? 0.5 : 1 }, onClick: save }, busy ? 'Saving…' : '✓ Save changes'))));
}
