// @ts-nocheck
// ── Promo / Discount ROI panel ────────────────────────────────────────────────
// "Are our promos and discounts paying for themselves?" Answered with a matched-
// day analysis (engine in ../engine/promo-roi.js): per store, days a REAL national
// promo-calendar tag covers (org_events, exogenous -- set months ahead by
// McDonald's corporate, not derived from that day's sales) are compared against
// untagged days WITHIN the same day-of-week (controls for the weekly pattern), and
// the sales / guest lift is weighed against the give-away. Framed as a directional
// readout — association with controls, not a randomized trial.
//
// dispatch-113.md — this used to split on same-day promo INTENSITY (percentage or
// dollar give-away). Both were measured endogenous (memory/finding-promo-roi-
// denominator-bias-2026-08-23.md): give-away dollars scale with traffic, so the
// split itself sorted busy days into "heavy" regardless of any real effect. The
// discount lever has no equivalent exogenous signal (no calendar tells us when a
// register-level comp will happen) and now honestly reports "cannot determine"
// instead of reusing an endogenous split a third time.
import * as React from 'react';
import { computePromoDiscountRoi } from '../engine/promo-roi.js';
import { STORE_NAMES } from '../constants.js';

const h = React.createElement;
const f$ = n => (n == null ? '—' : (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString());
const fPct = n => (n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(2) + '%');
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

// Reasons LeverSection can't score anything, and the honest copy for each — dispatch-113.md item
// 4: never silently keep displaying "not enough data" when the real reason is "no exogenous
// signal exists at all", which is a different, narrower claim the reader needs to know.
const NO_DATA_COPY = {
  no_exogenous_tag_data: {
    icon: '🗓️',
    text: 'Cannot determine — no verified national promo-calendar tag (org_events) covers the stores/dates currently loaded. This lever only scores days a real, exogenous calendar fact covers, never same-day promo spend (that split was measured biased — see the note below). Tag/confirm promo windows in Calendar Manager, or load a broader date range, to enable this.',
  },
  no_signal_exists: {
    icon: '🚫',
    text: 'Cannot determine — there is no exogenous signal for when this happens. A national promo runs on a corporate calendar set months ahead; a register-level discount is a same-day, reactive decision with no equivalent calendar fact. Any matched-day split here would repeat the exact bias this screen was fixed to remove, so this lever is intentionally left unscored rather than showing a plausible-but-wrong number.',
  },
};

function LeverSection({ title, icon, data, marginRate }) {
  const d = data?.district;
  const rows = data?.byStore || [];
  const th = (t, r) => h('th', { style: { textAlign: r ? 'right' : 'left', padding: '5px 8px', fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', position: 'sticky', top: 0, background: 'var(--surf2)' } }, t);
  const td = (c, r, col) => h('td', { style: { textAlign: r ? 'right' : 'left', padding: '5px 8px', fontSize: 11, fontFamily: r ? 'var(--mono)' : 'inherit', color: col || 'var(--text)', whiteSpace: 'nowrap' } }, c);

  const scoredNote = data?.nCandidates > rows.length
    ? `Scored ${rows.length} of ${data.nCandidates} stores with a known calendar window — the rest had too few matched days at this split (see below).`
    : null;

  const noData = NO_DATA_COPY[data?.reason];

  return h('div', { style: { marginBottom: 22 } },
    h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 } },
      h('span', { style: { fontSize: 15 } }, icon),
      h('div', { style: { fontSize: 13, fontWeight: 800 } }, title),
      d && h(VerdictChip, { v: d.verdict })),

    scoredNote && h('div', { style: { fontSize: 10, color: 'var(--text3)', marginBottom: 8 } }, scoredNote),

    !rows.length && noData && h('div', { style: { padding: 18, border: '1px dashed var(--bdr)', borderRadius: 8, color: 'var(--text2)', fontSize: 12, lineHeight: 1.6 } },
      h('div', { style: { fontSize: 22, marginBottom: 8 } }, noData.icon),
      noData.text),

    !rows.length && !noData && h('div', { style: { padding: 18, border: '1px dashed var(--bdr)', borderRadius: 8, color: 'var(--text3)', fontSize: 12 } },
      'Not enough daily data with a ' + title.toLowerCase() + ' signal yet (needs ~4+ weeks per store within a known calendar window, across both tagged and untagged days).'),

    d && rows.length ? h('div', { style: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 } },
      statCard('District verdict', VERDICT[d.verdict]?.label || '—', VERDICT[d.verdict]?.col),
      statCard('Sales lift / heavy day', f$(d.extraSalesPerDay), d.extraSalesPerDay >= 0 ? '#10b981' : '#ef4444'),
      statCard('Give-away / heavy day', f$(d.extraSpendPerDay), '#f59e0b'),
      statCard('Gross-profit Δ / day', f$(d.grossProfitDelta), d.grossProfitDelta >= 0 ? '#10b981' : '#ef4444'),
    ) : null,

    rows.length ? h('div', { style: { border: '.5px solid var(--bdr)', borderRadius: 8, overflow: 'hidden', maxHeight: 300, overflowY: 'auto', overflowX: 'auto' } },
      h('table', { style: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse' } },
        h('thead', null, h('tr', null, th('Store'), th('Days', 1), th('Lift %', 1), th('Sales/day', 1), th('Give-away/day', 1), th('GP Δ/day', 1), th('Verdict', 1))),
        h('tbody', null, rows.map(s => h('tr', { key: s.loc, style: { borderTop: '.5px solid var(--bdr)' } },
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

export function PromoRoiPanel({ ds, userEvents, onClose }) {
  const { useState, useMemo } = React;
  const [marginPct, setMarginPct] = useState(35);
  const roi = useMemo(() => computePromoDiscountRoi(ds, userEvents, { marginRate: marginPct / 100 }), [ds, userEvents, marginPct]);
  const cov = roi?.promo?.coverage;
  const covWindow = cov && Object.keys(cov.covStart || {}).length
    ? [...new Set(Object.values(cov.covStart))].sort()[0] + ' → ' + [...new Set(Object.values(cov.covEnd))].sort().slice(-1)[0]
    : null;

  return h('div', { style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 460, display: 'flex', flexDirection: 'column', paddingTop: 20 } },
    h('div', { style: { flex: '0 0 20px', cursor: 'pointer' }, onClick: onClose }),
    h('div', { style: { flex: 1, background: 'var(--surf)', maxWidth: 1080, margin: '0 auto', width: 'calc(100% - 24px)', borderRadius: 'var(--rl) var(--rl) 0 0', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 -8px 40px rgba(0,0,0,.4)' } },
      // Header
      h('div', { style: { padding: '10px 16px', borderBottom: '.5px solid var(--bdr)', flexShrink: 0, background: 'var(--surf2)', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
        h('span', { style: { fontSize: 18 } }, '🎟️'),
        h('div', { style: { flex: 1, minWidth: 180 } },
          h('div', { style: { fontSize: 14, fontWeight: 800, color: 'var(--text)' } }, 'Promo / Discount ROI'),
          h('div', { style: { fontSize: 9, color: 'var(--text3)' } }, 'Matched-day lift — real calendar-tagged promo days vs untagged days within each weekday. Directional, not a controlled trial.')),
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
          // dispatch-113.md — replaced the "known-unreliable" banner (percentage/dollar intensity
          // splits, both measured endogenous — memory/finding-promo-roi-denominator-bias-
          // 2026-08-23.md) with the real fix: split on whether a REAL org_events 'promo' tag (the
          // national marketing calendar, set months ahead by McDonald's corporate — verified
          // 2026-08-25 against production to be independent of any store's own sales) covers that
          // date, not on same-day promo spend. Validated against the finding's own "spend scales
          // with traffic" construction: at a true effect of 0%, this split now measures ≈0%
          // (memory/data/promo-roi-bias-sim-exogenous-tag-zero-effect.mjs), vs. +16.5% for the
          // retired dollar split on the identical generator.
          h('div', { style: { fontSize: 11, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 14, padding: '10px 12px', background: 'rgba(96,165,250,.08)', border: '1px solid rgba(96,165,250,.3)', borderRadius: 8 } },
            h('b', null, '📅 Methodology: '), 'Promotions is now matched against a real national promo calendar (org_events), not same-day promo spend — the earlier splits were measured to fabricate a positive lift even with zero true effect (finding: memory/finding-promo-roi-denominator-bias-2026-08-23.md). ',
            covWindow ? h('span', null, 'Currently tagged calendar coverage: ', h('b', null, covWindow), '. Only days inside a store\'s own known calendar window can be scored — days outside it are excluded, never assumed untagged.') : h('span', null, 'No tagged calendar coverage is loaded for the currently-loaded stores — see below.'),
            ' Discounts has no equivalent exogenous signal (register-level comps are a same-day decision, not on a calendar) and is intentionally left unscored rather than repeating the same bias.'),
          h('div', { style: { fontSize: 11, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 14, padding: '10px 12px', background: 'var(--surf2)', border: '.5px solid var(--bdr)', borderRadius: 8 } },
            'How to read this: on ', h('b', null, 'tagged'), ' days (a real calendar promo window) a store rings ', h('b', null, 'Sales/day'), ' more than its matched ', h('b', null, 'untagged'),
            ' days (same weekday, same known calendar window), while giving away ', h('b', null, 'Give-away/day'), ' more. ',
            h('b', null, 'GP Δ/day'), ' = that sales lift × your incremental margin (', marginPct, '%) − the extra give-away. ',
            h('b', { style: { color: '#10b981' } }, 'Pays'), ' means the lift more than covers the give-away; ',
            h('b', { style: { color: '#ef4444' } }, 'Costs'), ' means it doesn\'t. Stores are sorted worst-ROI first — coach those.'),
          h(LeverSection, { title: 'Promotions', icon: '🎉', data: roi.promo, marginRate: roi.marginRate }),
          h(LeverSection, { title: 'Discounts', icon: '🏷️', data: roi.discount, marginRate: roi.marginRate }),
          h('div', { style: { fontSize: 9, color: 'var(--text3)', lineHeight: 1.6, marginTop: 6 } },
            '⚙ Matched-day design controls for weekday; the tagged/untagged split is a verified-exogenous calendar fact, not a function of the sales it measures. Still association with controls, not a randomized trial — treat as a directional screen for where to dig. Incremental margin is a district assumption you set above; per-store product mix varies.')))));
}
