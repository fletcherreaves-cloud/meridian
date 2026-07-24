// @ts-nocheck
// ── Weekly Schedule Summary panel ─────────────────────────────────────────────
// Surfaces the LifeLenz weekly-schedule "top section" band across ALL locations at
// once (LifeLenz shows one store at a time) — Labor % Sales, Sales/GC forecast,
// Scheduled vs Forecast hours + the daily over/unders, TPMH, Fixed Labor % — all
// derived from the lifelenz_schedule data Meridian already syncs daily. Verified to
// reconcile to the LifeLenz screen (src/__tests__/schedule-summary.test.js).
import * as React from 'react';
import { computeScheduleSummary, FIXED_FLOOR_SEG_MIN, FIXED_FLOOR_SEG_MAX, FIXED_FLOOR_COMBINED_MAX } from '../engine/schedule-summary.js';
import { STORE_NAMES } from '../constants.js';

const h = React.createElement;
const sName = loc => STORE_NAMES?.[String(loc)] || ('Store ' + loc);
const f$ = n => n == null ? '—' : '$' + Math.round(n).toLocaleString();
// decimal hours → H:MM (signed)
const hm = v => { if (v == null) return '—'; const neg = v < 0; const t = Math.round(Math.abs(v) * 60); return (neg ? '-' : '') + Math.floor(t / 60) + ':' + String(t % 60).padStart(2, '0'); };
// labor % may be stored as a fraction (0.245) or a percent (24.5); normalize to %.
const pct = v => v == null ? '—' : ((Math.abs(v) <= 1.5 ? v * 100 : v)).toFixed(2) + '%';
const fracPct = v => v == null ? '—' : (v * 100).toFixed(2) + '%'; // always a fraction (hours ratio)
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const diffColor = d => d == null ? 'var(--text3)' : d > 0.5 ? '#f59e0b' : d < -0.5 ? '#60a5fa' : '#10b981';
// Fixed/Floor standard flags: each segment green in [10%,15%], amber outside; combined
// green ≤25%, red if it breaches the 25% cap. (Fractions in, per engine.)
const segColor = v => v == null ? 'var(--text3)' : (v >= FIXED_FLOOR_SEG_MIN && v <= FIXED_FLOOR_SEG_MAX) ? '#10b981' : '#f59e0b';
const combColor = v => v == null ? 'var(--text3)' : (v > FIXED_FLOOR_COMBINED_MAX) ? '#ef4444' : '#10b981';

function StoreRow({ s, expanded, onToggle }) {
  const td = (c, col, mono) => h('td', { style: { textAlign: 'right', padding: '6px 8px', fontSize: 11, fontFamily: mono ? 'var(--mono)' : 'inherit', color: col || 'var(--text)', whiteSpace: 'nowrap' } }, c);
  return h(React.Fragment, null,
    h('tr', { onClick: onToggle, style: { borderTop: '.5px solid rgba(255,255,255,.05)', cursor: 'pointer' } },
      h('td', { style: { padding: '6px 8px', fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' } }, h('span', { style: { color: 'var(--text3)', marginRight: 5 } }, expanded ? '▾' : '▸'), sName(s.loc)),
      td(f$(s.fcstSales), null, true),
      td((s.fcstGC || 0).toLocaleString(), null, true),
      td(pct(s.laborPct), null, true),
      td(hm(s.schedHrs), null, true),
      td(hm(s.fcstHrs), 'var(--text3)', true),
      td((s.hrsDiff >= 0 ? '+' : '') + hm(s.hrsDiff), diffColor(s.hrsDiff), true),
      td(s.tpmh == null ? '—' : s.tpmh.toFixed(2), null, true),
      td(fracPct(s.fixedLaborPct), segColor(s.fixedLaborPct), true),
      td(fracPct(s.floorLaborPct), segColor(s.floorLaborPct), true),
      td(fracPct(s.combinedFixedFloorPct), combColor(s.combinedFixedFloorPct), true)),
    expanded && h('tr', null, h('td', { colSpan: 11, style: { padding: '0 8px 10px 26px', background: 'rgba(255,255,255,.02)' } },
      h('table', { style: { width: '100%', borderCollapse: 'collapse', marginTop: 4 } },
        h('thead', null, h('tr', { style: { color: 'var(--text3)', fontSize: 9, textTransform: 'uppercase' } },
          ...['Day', 'Sched', 'Forecast', 'Over/Under', 'Labor %', 'Fcst Sales'].map((t, i) => h('th', { key: i, style: { textAlign: i ? 'right' : 'left', padding: '3px 8px', fontWeight: 700 } }, t)))),
        h('tbody', null, s.days.map((d, i) => h('tr', { key: i, style: { fontSize: 10.5, fontFamily: 'var(--mono)' } },
          h('td', { style: { padding: '3px 8px', color: 'var(--text2)' } }, DOW[d.date.getDay()] + ' ' + (d.date.getMonth() + 1) + '/' + d.date.getDate()),
          h('td', { style: { textAlign: 'right', padding: '3px 8px' } }, hm(d.schedHrs)),
          h('td', { style: { textAlign: 'right', padding: '3px 8px', color: 'var(--text3)' } }, hm(d.fcstHrs)),
          h('td', { style: { textAlign: 'right', padding: '3px 8px', color: diffColor(d.hrsDiff), fontWeight: 700 } }, (d.hrsDiff >= 0 ? '+' : '') + hm(d.hrsDiff)),
          h('td', { style: { textAlign: 'right', padding: '3px 8px' } }, pct(d.laborPct)),
          h('td', { style: { textAlign: 'right', padding: '3px 8px' } }, f$(d.fcstSales))))))))
  );
}

export function ScheduleSummaryPanel({ ds, onClose }) {
  const { useMemo, useState } = React;
  const res = useMemo(() => computeScheduleSummary(ds?.schedRows || []), [ds?.schedRows]);
  const [wkIdx, setWkIdx] = useState(0);
  const [expanded, setExpanded] = useState(null);
  const wk = res.weeks[wkIdx];
  const d = wk?.district;

  const th = t => h('th', { style: { textAlign: 'right', padding: '6px 8px', fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', position: 'sticky', top: 0, background: 'var(--surf2)' } }, t);
  const stat = (label, val, col) => h('div', { style: { flex: '1 1 96px', minWidth: 88, background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, padding: '8px 12px' } },
    h('div', { style: { fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 } }, label),
    h('div', { style: { fontSize: 16, fontWeight: 800, fontFamily: 'var(--mono)', color: col || 'var(--text)' } }, val));

  return h('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 460, display: 'flex', flexDirection: 'column', paddingTop: 20 } },
    h('div', { style: { flex: '0 0 20px', cursor: 'pointer' }, onClick: onClose }),
    h('div', { style: { flex: 1, background: 'var(--surf)', maxWidth: 1080, margin: '0 auto', width: 'calc(100% - 24px)', borderRadius: 'var(--rl) var(--rl) 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -8px 40px rgba(0,0,0,.4)' } },
      h('div', { style: { padding: '10px 16px', borderBottom: '.5px solid var(--bdr)', flexShrink: 0, background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        h('span', { style: { fontSize: 18 } }, '📋'),
        h('div', { style: { flex: 1, minWidth: 180 } },
          h('div', { style: { fontSize: 14, fontWeight: 800 } }, 'Weekly Schedule Summary'),
          h('div', { style: { fontSize: 9, color: 'var(--text3)' } }, 'LifeLenz schedule band across all stores — derived from the daily sync (no re-pull needed)')),
        wk && h('div', { style: { display: 'flex', alignItems: 'center', gap: 6 } },
          h('button', { onClick: () => setWkIdx(i => Math.min(res.weeks.length - 1, i + 1)), disabled: wkIdx >= res.weeks.length - 1, style: navBtn }, '‹'),
          h('span', { style: { fontSize: 11, fontWeight: 700, minWidth: 96, textAlign: 'center' } }, 'Wk of ' + (wk.weekStart.getMonth() + 1) + '/' + wk.weekStart.getDate()),
          h('button', { onClick: () => setWkIdx(i => Math.max(0, i - 1)), disabled: wkIdx <= 0, style: navBtn }, '›')),
        h('button', { className: 'btn btn-sm', style: { color: 'var(--text3)' }, onClick: onClose }, '✕')),

      h('div', { style: { flex: 1, overflowY: 'auto', padding: '14px 16px' } },
        !wk ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 } },
          h('div', { style: { fontSize: 26, marginBottom: 10 } }, '📋'),
          'No LifeLenz schedule data loaded. This reads the auto-synced lifelenz_schedule — it fills in after the daily LifeLenz pull.')
        : h('div', null,
          h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 } },
            stat('Labor % Sales', pct(d.laborPct)),
            stat('Sales Forecast', f$(d.fcstSales)),
            stat('GC Forecast', (d.fcstGC || 0).toLocaleString()),
            stat('Sched vs Fcst', (d.hrsDiff >= 0 ? '+' : '') + hm(d.hrsDiff), diffColor(d.hrsDiff)),
            stat('Schd TPMH', d.tpmh == null ? '—' : d.tpmh.toFixed(2)),
            stat('Fixed % (hrs)', fracPct(d.fixedLaborPct), segColor(d.fixedLaborPct)),
            stat('Floor % (hrs)', fracPct(d.floorLaborPct), segColor(d.floorLaborPct)),
            stat('Fixed+Floor %', fracPct(d.combinedFixedFloorPct), combColor(d.combinedFixedFloorPct))),

          h('div', { style: { border: '.5px solid var(--bdr)', borderRadius: 8, overflow: 'auto' } },
            h('table', { style: { width: '100%', borderCollapse: 'collapse', minWidth: 620 } },
              h('thead', null, h('tr', null,
                h('th', { style: { textAlign: 'left', padding: '6px 8px', fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', position: 'sticky', top: 0, background: 'var(--surf2)' } }, 'Store'),
                th('Sales Fcst'), th('GC Fcst'), th('Labor %'), th('Sched'), th('Forecast'), th('Over/Under'), th('TPMH'), th('Fixed %'), th('Floor %'), th('F+F %'))),
              h('tbody', null, wk.stores.map(s => h(StoreRow, { key: s.loc, s, expanded: expanded === s.loc, onToggle: () => setExpanded(expanded === s.loc ? null : s.loc) }))))),

          h('div', { style: { fontSize: 9, color: 'var(--text3)', lineHeight: 1.6, marginTop: 8 } },
            '⚙ Over/Under = Scheduled − Forecast hours (blue = under, amber = over). Labor % is dollar-weighted across the week. Fixed % and Floor % are each that segment\'s scheduled hours ÷ total scheduled hours — target 10–15% each (green in-band, amber outside); F+F % is the combined Fixed+Floor share and must stay ≤25% (green ok, red over cap). Click a store for its daily grid. The per-job hours/cost breakdown from LifeLenz is not yet pulled.')))));
}

const navBtn = { width: 26, height: 24, borderRadius: 6, border: '.5px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text2)', cursor: 'pointer', fontSize: 13 };
