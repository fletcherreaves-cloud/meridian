// @ts-nocheck
// ── Visit Readiness panel ─────────────────────────────────────────────────────
// Per-store readiness for a PACE graded visit (CFV / RGRV / EcoSure), from the
// operational metrics Meridian tracks daily. Ranked most-at-risk first so the owner
// coaches the right stores before the (mostly unannounced) visit. Transparent: every
// score shows its driving metrics (actual vs the store's own target).
import * as React from 'react';
import { computeVisitReadiness } from '../engine/visit-readiness.js';
import { STORE_NAMES } from '../constants.js';

const h = React.createElement;
const sName = loc => STORE_NAMES?.[String(loc)] || ('Store ' + loc);
const BAND = { 'ready': { c: '#10b981', l: 'Ready' }, 'watch': { c: '#f59e0b', l: 'Watch' }, 'at-risk': { c: '#ef4444', l: 'At risk' } };
const FS = { low: { c: '#10b981', l: 'FS low' }, watch: { c: '#f59e0b', l: 'FS watch' }, elevated: { c: '#ef4444', l: 'FS elevated' }, unknown: { c: '#6b7280', l: 'FS n/a' } };

const fmt = (v, unit) => {
  if (v == null) return '—';
  if (unit === 'pct') { const p = Math.abs(v) <= 1.5 ? v * 100 : v; return p.toFixed(p < 10 ? 2 : 1) + '%'; }
  if (unit === 's') return Math.round(v) + 's';
  if (unit === 'hrs') return v.toFixed(1) + 'h';
  return (Math.round(v * 10) / 10).toString();
};
const scoreColor = s => s == null ? '#6b7280' : s >= 85 ? '#10b981' : s >= 70 ? '#f59e0b' : '#ef4444';

function Bar({ score, w = 60 }) {
  return h('div', { style: { width: w, height: 6, borderRadius: 3, background: 'var(--bdr)', overflow: 'hidden', display: 'inline-block', verticalAlign: 'middle' } },
    h('div', { style: { width: (score == null ? 0 : Math.max(2, score)) + '%', height: '100%', background: scoreColor(score) } }));
}

function StoreRow({ s, expanded, onToggle }) {
  const b = BAND[s.band]; const fs = FS[s.fsFlag];
  const sub = (label, sc) => h('div', { style: { display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text3)' } },
    h('span', { style: { width: 62, textAlign: 'right' } }, label), h(Bar, { score: sc, w: 54 }),
    h('span', { style: { fontFamily: 'var(--mono)', color: scoreColor(sc), width: 26 } }, sc == null ? '—' : Math.round(sc)));
  return h('div', { style: { borderTop: '.5px solid rgba(255,255,255,.05)' } },
    h('div', { onClick: onToggle, style: { display: 'flex', alignItems: 'center', gap: 12, padding: '9px 12px', cursor: 'pointer', flexWrap: 'wrap' } },
      h('div', { style: { width: 44, textAlign: 'center' } },
        h('div', { style: { fontSize: 19, fontWeight: 900, fontFamily: 'var(--mono)', color: b.c, lineHeight: 1 } }, Math.round(s.readiness)),
        h('div', { style: { fontSize: 7, color: 'var(--text3)', textTransform: 'uppercase' } }, 'ready')),
      h('div', { style: { flex: 1, minWidth: 150 } },
        h('div', { style: { fontSize: 12, fontWeight: 700 } }, sName(s.loc)),
        h('div', { style: { display: 'flex', gap: 6, marginTop: 3, alignItems: 'center', flexWrap: 'wrap' } },
          h('span', { style: { fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 4, color: b.c, background: b.c + '22' } }, b.l),
          h('span', { style: { fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 4, color: fs.c, background: fs.c + '18' } }, fs.l),
          s.coverage < 1 && h('span', { style: { fontSize: 9, color: 'var(--text3)' } }, Math.round(s.coverage * 100) + '% data'),
          s.lastVisit && h('span', { style: { fontSize: 9, color: 'var(--text3)' } }, `last ${s.lastVisit.type || 'visit'} ${Math.round(s.lastVisit.score)}%${s.lastVisit.pass === false ? ' ✗' : ''}`))),
      h('div', { style: { display: 'flex', flexDirection: 'column', gap: 2 } },
        sub('Speed', s.subs.speed.score), sub('Accuracy', s.subs.accuracy.score),
        sub('Quality', s.subs.quality.score), sub('Leadership', s.subs.leadership.score)),
      h('span', { style: { color: 'var(--text3)', fontSize: 11 } }, expanded ? '▲' : '▼')),
    expanded && h('div', { style: { padding: '4px 12px 12px 56px' } },
      h('div', { style: { fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 5 } }, 'Top risk drivers (actual vs target)'),
      s.topDrivers.map(d => h('div', { key: d.key, style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, padding: '2px 0' } },
        h('span', { style: { flex: 1, color: 'var(--text2)' } }, d.label),
        h('span', { style: { fontFamily: 'var(--mono)', color: scoreColor(d.score * 100) } }, fmt(d.actual, d.unit)),
        h('span', { style: { fontSize: 9, color: 'var(--text3)' } }, 'tgt ' + fmt(d.target, d.unit)),
        h(Bar, { score: d.score * 100, w: 44 }))),
      !s.topDrivers.length && h('div', { style: { fontSize: 11, color: 'var(--text3)' } }, 'No metric data loaded for this store.')));
}

export function VisitReadinessPanel({ ds, onClose }) {
  const { useMemo, useState } = React;
  const res = useMemo(() => computeVisitReadiness(ds), [ds]);
  const [expanded, setExpanded] = useState(null);
  const d = res.district;

  const stat = (label, val, col) => h('div', { style: { flex: '1 1 96px', minWidth: 90, background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, padding: '8px 12px' } },
    h('div', { style: { fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 } }, label),
    h('div', { style: { fontSize: 17, fontWeight: 800, fontFamily: 'var(--mono)', color: col || 'var(--text)' } }, val));

  return h('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 460, display: 'flex', flexDirection: 'column', paddingTop: 20 } },
    h('div', { style: { flex: '0 0 20px', cursor: 'pointer' }, onClick: onClose }),
    h('div', { style: { flex: 1, background: 'var(--surf)', maxWidth: 1080, margin: '0 auto', width: 'calc(100% - 24px)', borderRadius: 'var(--rl) var(--rl) 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -8px 40px rgba(0,0,0,.4)' } },
      h('div', { style: { padding: '10px 16px', borderBottom: '.5px solid var(--bdr)', flexShrink: 0, background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        h('span', { style: { fontSize: 18 } }, '🛡️'),
        h('div', { style: { flex: 1, minWidth: 200 } },
          h('div', { style: { fontSize: 14, fontWeight: 800 } }, 'Visit Readiness'),
          h('div', { style: { fontSize: 9, color: 'var(--text3)' } }, 'PACE graded-visit readiness (CFV / RGRV / EcoSure) from daily ops metrics · coach the at-risk stores before the visit')),
        h('button', { className: 'btn btn-sm', style: { color: 'var(--text3)' }, onClick: onClose }, '✕')),

      h('div', { style: { flex: 1, overflowY: 'auto', padding: '14px 16px' } },
        !d ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 } },
          h('div', { style: { fontSize: 26, marginBottom: 10 } }, '🛡️'),
          'No operational data loaded yet. Readiness reads your speed (OEPE/KVS/park), accuracy (SMG/refunds/T-Reds), waste, and labor metrics — sync or upload data and it fills in.')
        : h('div', null,
          h('div', { style: { fontSize: 11, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 14, padding: '10px 12px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
            'Readiness (0–100) is a weighted blend — ', h('b', null, 'Speed 35%'), ' · ', h('b', null, 'Accuracy 30%'), ' · ',
            h('b', null, 'Quality 20%'), ' · ', h('b', null, 'Leadership 15%'), ' — each metric scored against that store\'s own target. ',
            'Weighted toward the areas most heavily graded and most directly measured in your data. Food Safety is a separate risk flag (waste/holding proxies). ',
            h('b', null, 'This is an early-warning estimate, not a predicted score.')),

          h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 } },
            stat('District readiness', Math.round(d.readiness), scoreColor(d.readiness)),
            stat('At risk', d.atRisk, d.atRisk ? '#ef4444' : '#10b981'),
            stat('Watch', d.watch, '#f59e0b'),
            stat('FS elevated', d.fsElevated, d.fsElevated ? '#ef4444' : '#10b981'),
            stat('Speed', Math.round(d.subs.speed || 0), scoreColor(d.subs.speed)),
            stat('Accuracy', Math.round(d.subs.accuracy || 0), scoreColor(d.subs.accuracy))),

          h('div', { style: { border: '.5px solid var(--bdr)', borderRadius: 8, overflow: 'hidden' } },
            res.stores.map(s => h(StoreRow, { key: s.loc, s, expanded: expanded === s.loc, onToggle: () => setExpanded(expanded === s.loc ? null : s.loc) }))),

          h('div', { style: { fontSize: 9, color: 'var(--text3)', lineHeight: 1.6, marginTop: 8 } },
            '⚙ ', res.gapNote, ' Scores are a directional early-warning from leading indicators, not a predicted visit percentage. Validate against actual CFV/RGR outcomes as they accumulate (shown per store when available).')))));
}
