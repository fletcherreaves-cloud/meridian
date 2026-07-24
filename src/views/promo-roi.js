// @ts-nocheck
// ── Promo / Discount ROI panel ────────────────────────────────────────────────
// "Are our promos and discounts paying for themselves?" Answered with a matched-
// day analysis (engine in ../engine/promo-roi.js): per store, promo-heavy days are
// compared against promo-light days WITHIN the same day-of-week (controls for the
// weekly pattern and the habit of running promos on slow days), and the sales /
// guest lift is weighed against the give-away. Framed as a directional readout —
// association with controls, not a randomized trial.
import * as React from 'react';
import { computePromoDiscountRoi } from '../engine/promo-roi.js';
import { STORE_NAMES } from '../constants.js';

const h = React.createElement;
const f$ = n => (n == null ? '—' : (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString());
const fPct = n => (n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(1) + '%');
const sName = loc => STORE_NAMES?.[String(loc)] || ('Store ' + loc);

const VERDICT = {
  pays:    { label: 'Pays',    col: '#10b981', bg: 'rgba(16,185,129,.12)' },
  costs:   { label: 'Costs',   col: '#ef4444', bg: 'rgba(239,68,68,.12)' },
  neutral: { label: 'Neutral', col: '#f59e0b', bg: 'rgba(245,158,11,.12)' },
  'n/a':   { label: 'n/a',     col: '#6b7280', bg: 'rgba(255,255,255,.04)' },
};

function VerdictChip({ v }) {
  const m = VERDICT[v] || VERDICT['n/a'];
  return h('span', { style: { fontSize: 10, fontWeight: 800, padding: '2px 8px', borderRadius: 5, color: m.col, background: m.bg } }, m.label);
}

function LeverSection({ title, icon, data, marginRate }) {
  const d = data?.district;
  const rows = data?.byStore || [];
  const th = (t, r) => h('th', { style: { textAlign: r ? 'right' : 'left', padding: '5px 8px', fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', position: 'sticky', top: 0, background: 'var(--surf2)' } }, t);
  const td = (c, r, col) => h('td', { style: { textAlign: r ? 'right' : 'left', padding: '5px 8px', fontSize: 11, fontFamily: r ? 'var(--mono)' : 'inherit', color: col || 'var(--text)', whiteSpace: 'nowrap' } }, c);

  return h('div', { style: { marginBottom: 22 } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
      h('span', { style: { fontSize: 15 } }, icon),
      h('div', { style: { fontSize: 13, fontWeight: 800 } }, title),
      d && h(VerdictChip, { v: d.verdict })),

    !rows.length && h('div', { style: { padding: 18, border: '1px dashed var(--bdr)', borderRadius: 8, color: 'var(--text3)', fontSize: 12 } },
      'Not enough daily data with a ' + title.toLowerCase() + ' signal yet (needs ~4+ weeks per store across both heavy and light days).'),

    d && rows.length ? h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 } },
      statCard('District verdict', VERDICT[d.verdict]?.label || '—', VERDICT[d.verdict]?.col),
      statCard('Sales lift / heavy day', f$(d.extraSalesPerDay), d.extraSalesPerDay >= 0 ? '#10b981' : '#ef4444'),
      statCard('Give-away / heavy day', f$(d.extraSpendPerDay), '#f59e0b'),
      statCard('Gross-profit Δ / day', f$(d.grossProfitDelta), d.grossProfitDelta >= 0 ? '#10b981' : '#ef4444'),
    ) : null,

    rows.length ? h('div', { style: { border: '.5px solid var(--bdr)', borderRadius: 8, overflow: 'hidden', maxHeight: 300, overflowY: 'auto' } },
      h('table', { style: { width: '100%', borderCollapse: 'collapse' } },
        h('thead', null, h('tr', null, th('Store'), th('Days', 1), th('Lift %', 1), th('Sales/day', 1), th('Give-away/day', 1), th('GP Δ/day', 1), th('Verdict', 1))),
        h('tbody', null, rows.map(s => h('tr', { key: s.loc, style: { borderTop: '.5px solid rgba(255,255,255,.05)' } },
          td(sName(s.loc)),
          td(s.nDays, 1, 'var(--text3)'),
          td(fPct(s.liftSalesPct), 1, s.liftSalesPct >= 0 ? '#10b981' : '#ef4444'),
          td(f$(s.extraSalesPerDay), 1),
          td(f$(s.extraSpendPerDay), 1, '#f59e0b'),
          td(f$(s.grossProfitDelta), 1, s.grossProfitDelta >= 0 ? '#10b981' : '#ef4444'),
          h('td', { style: { textAlign: 'right', padding: '5px 8px' } }, h(VerdictChip, { v: s.verdict })),
        )))))
    : null,
  );
}

function statCard(label, val, col) {
  return h('div', { style: { flex: '1 1 130px', minWidth: 120, background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8, padding: '8px 12px' } },
    h('div', { style: { fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 } }, label),
    h('div', { style: { fontSize: 16, fontWeight: 800, fontFamily: 'var(--mono)', color: col || 'var(--text)' } }, val));
}

export function PromoRoiPanel({ ds, onClose }) {
  const { useState, useMemo } = React;
  const [marginPct, setMarginPct] = useState(35);
  const roi = useMemo(() => computePromoDiscountRoi(ds, { marginRate: marginPct / 100 }), [ds, marginPct]);

  return h('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 460, display: 'flex', flexDirection: 'column', paddingTop: 20 } },
    h('div', { style: { flex: '0 0 20px', cursor: 'pointer' }, onClick: onClose }),
    h('div', { style: { flex: 1, background: 'var(--surf)', maxWidth: 1080, margin: '0 auto', width: 'calc(100% - 24px)', borderRadius: 'var(--rl) var(--rl) 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -8px 40px rgba(0,0,0,.4)' } },
      // Header
      h('div', { style: { padding: '10px 16px', borderBottom: '.5px solid var(--bdr)', flexShrink: 0, background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        h('span', { style: { fontSize: 18 } }, '🎟️'),
        h('div', { style: { flex: 1, minWidth: 180 } },
          h('div', { style: { fontSize: 14, fontWeight: 800, color: 'var(--text)' } }, 'Promo / Discount ROI'),
          h('div', { style: { fontSize: 9, color: 'var(--text3)' } }, 'Matched-day lift — promo-heavy vs promo-light days within each weekday. Directional, not a controlled trial.')),
        h('span', { style: { fontSize: 9, fontWeight: 700, color: 'var(--text3)' } }, 'Incremental margin'),
        h('input', { type: 'range', min: 10, max: 60, step: 5, value: marginPct, onChange: e => setMarginPct(+e.target.value), style: { width: 90 } }),
        h('span', { style: { fontSize: 11, fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--amber)', width: 34 } }, marginPct + '%'),
        h('button', { className: 'btn btn-sm', style: { color: 'var(--text3)' }, onClick: onClose }, '✕')),
      // Body
      h('div', { style: { flex: 1, overflowY: 'auto', padding: '14px 16px' } },
        (!roi || roi.nRecords < 20) ? h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text3)', fontSize: 13 } },
          h('div', { style: { fontSize: 26, marginBottom: 10 } }, '🎟️'),
          'Not enough daily promo/discount data loaded yet. This reads the auto-synced Daily Glimpse (promo) and Controls (discount) streams — sync or upload a few weeks and it fills in.')
        : h('div', null,
          h('div', { style: { fontSize: 11, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 14, padding: '10px 12px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
            'How to read this: on ', h('b', null, 'promo-heavy'), ' days a store rings ', h('b', null, 'Sales/day'), ' more than its matched ', h('b', null, 'promo-light'),
            ' days (same weekday), while giving away ', h('b', null, 'Give-away/day'), ' more. ',
            h('b', null, 'GP Δ/day'), ' = that sales lift × your incremental margin (', marginPct, '%) − the extra give-away. ',
            h('b', { style: { color: '#10b981' } }, 'Pays'), ' means the lift more than covers the give-away; ',
            h('b', { style: { color: '#ef4444' } }, 'Costs'), ' means it doesn\'t. Stores are sorted worst-ROI first — coach those.'),
          h(LeverSection, { title: 'Promotions', icon: '🎉', data: roi.promo, marginRate: roi.marginRate }),
          h(LeverSection, { title: 'Discounts', icon: '🏷️', data: roi.discount, marginRate: roi.marginRate }),
          h('div', { style: { fontSize: 9, color: 'var(--text3)', lineHeight: 1.6, marginTop: 6 } },
            '⚙ Matched-day design controls for weekday and for promos-run-on-slow-days, but it is association-with-controls, not a randomized experiment — treat verdicts as a screen for where to dig, not proof. Incremental margin is a district assumption you set above; per-store product mix varies.')))));
}
