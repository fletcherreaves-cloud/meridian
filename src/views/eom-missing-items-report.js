// @ts-nocheck
// ── EOM Missing/Uncounted-Items Report (dispatch #227, Report 1) ────────────────────────────────
// Owner request, verbatim (2026-08-30): "a report that has all our usual components with date,
// location, print, etc for missing items or uncounted items sorted by location and class. Include
// last count data and logical recommendations as appropriate."
//
// Folded into the Inventory Control hub (src/views/eom-dashboard.js) as a new "Missing Items" tab,
// same "harvest into a sibling file, render as a tab" shape as EOMSupervisorPanel/CountCycleSection.
// This file is PURELY presentational — `rows` arrives already built + sorted by EOMDashboardPanel's
// `missingItemsRows` useMemo, which reuses `rows[].uncountedByClass` (itself the SAME
// diagnoseIncompleteCount() call the Scoreboard/EOM Count tabs already make per store, minValue:0,
// see eom-inventory.js) — no second diagnosis run happens here. Each row already carries
// `recommendation` (recommendationForState(), the exact never/early/stale phrasing
// buildIncompleteCountMessage() already proved) and is pre-sorted location → class
// (DIGEST_CLASS_ORDER) → valueAtRisk descending.
//
// Print mechanism reused verbatim from eom-supervisor.js (dispatch #202's PRINT_STYLE, exported
// dispatch #227): same class hooks (.eom-block/.eom-no-print/.eom-print-area/.eom-print-title),
// same body.eom-printing scoping, same doPrint()/afterprint pattern — no second print mechanism.
import * as React from 'react';
import { DIGEST_CLASS_LABELS } from '../engine/eom-digest.js';
import { ensureEomPrintStyleInjected } from './eom-supervisor.js';

const { useEffect, useState, useCallback } = React;
const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const money = v => (v == null || isNaN(v)) ? '—' : '$' + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtDate = d => {
  const dt = d instanceof Date ? d : new Date(d);
  return isNaN(dt) ? '—' : dt.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
};

const STATE_BADGE = { never: '#fb923c', early: '#f5bc00', stale: '#78839a' };
const STATE_LABEL = { never: 'Never counted', early: 'Early count', stale: 'Stale (prior period)' };

export function EOMMissingItemsReportPanel({ rows, period, reportAsOf, scopeLabel }) {
  useEffect(() => { ensureEomPrintStyleInjected(); }, []);
  const [forPrint, setForPrint] = useState(false);
  useEffect(() => {
    const after = () => { setForPrint(false); document.body.classList.remove('eom-printing'); };
    window.addEventListener('afterprint', after);
    return () => window.removeEventListener('afterprint', after);
  }, []);
  const doPrint = useCallback(() => {
    setForPrint(true);
    document.body.classList.add('eom-printing');
    setTimeout(() => window.print(), 60);
  }, []);

  const list = rows || [];
  const totalValue = list.reduce((s, r) => s + (r.valueAtRisk || 0), 0);

  const th = (t) => h('th', { key: t, style: { textAlign: 'left', padding: '5px 8px', borderBottom: '1px solid var(--bdr2)', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text3)', whiteSpace: 'nowrap' } }, t);
  const td = (content, extra) => h('td', { style: { padding: '5px 8px', verticalAlign: 'top', ...(extra || {}) } }, content);

  return div({ style: { padding: '16px', maxWidth: '1100px', margin: '0 auto' } },

    div({ className: 'eom-no-print' },
      div({ style: { marginBottom: '14px' } },
        div({ style: { fontSize: '11px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#f5bc00', marginBottom: '4px' } }, 'Missing / Uncounted Items'),
        div({ style: { fontSize: '20px', fontWeight: 800, color: 'var(--text)' } }, `${scopeLabel || 'all stores'} — ${period}`),
        div({ style: { fontSize: '11px', color: 'var(--text3)', marginTop: '3px' } },
          `${list.length} item${list.length === 1 ? '' : 's'} · ${money(totalValue)} at risk · as of ${fmtDate(reportAsOf)}`)),
      div({ style: { display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' } },
        h('button', {
          onClick: doPrint,
          title: 'Print this report — every scoped store\'s uncounted items, sorted by location then class.',
          style: { background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.3)', color: '#4ade80', borderRadius: '7px', padding: '6px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
        }, '🖨 Print')),
    ),

    div({ className: 'eom-print-area' },
      div({ className: 'eom-print-title', style: { marginBottom: '10px' } },
        div({ style: { fontSize: '15px', fontWeight: 800, color: '#111' } }, `Missing / Uncounted Items — ${scopeLabel || 'all stores'}`),
        div({ style: { fontSize: '11px', color: '#555' } }, `${period} · ${list.length} item${list.length === 1 ? '' : 's'} · ${money(totalValue)} at risk · as of ${fmtDate(reportAsOf)}`)),

      list.length === 0
        ? div({ style: { color: 'var(--text3)', fontSize: '13px', padding: '20px 4px' } }, 'No uncounted items in the current scope — every item on record has a count inside its window. ✓')
        : div({ className: 'eom-block', style: { overflowX: 'auto' } },
            h('table', { style: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '12.5px' } }, [
              h('thead', { key: 'h' }, h('tr', null, [th('Location'), th('Class'), th('Item'), th('Last Counted'), th('$ On Hand'), th('Recommendation')])),
              h('tbody', { key: 'b' }, list.map((r, i) => h('tr', { key: i, style: { borderBottom: '1px solid var(--bdr)' } }, [
                td(div(null,
                  span({ style: { fontWeight: 600, color: 'var(--text)' } }, r.storeName),
                  span({ style: { fontSize: '10px', color: 'var(--text3)', marginLeft: '5px' } }, r.org === 'emerald' ? 'FL' : 'OK'))),
                td(DIGEST_CLASS_LABELS[r.cls] || r.cls),
                td(div(null,
                  div({ style: { color: 'var(--text)' } }, r.descr || r.wrin || '—'),
                  r.wrin ? span({ style: { fontSize: '10px', color: 'var(--text3)', fontFamily: 'ui-monospace,Menlo,monospace' } }, r.wrin) : null)),
                td(div(null,
                  span(null, r.lastCounted ? fmtDate(r.lastCounted) : 'Never'),
                  span({ style: { display: 'block', fontSize: '9.5px', fontWeight: 700, color: STATE_BADGE[r.state] || 'var(--text3)' } }, STATE_LABEL[r.state] || r.state || ''))),
                td(money(r.onHandAmt), { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }),
                td(div({ style: { maxWidth: '360px', color: 'var(--text2)' } }, r.recommendation)),
              ]))),
            ])),
    ),
  );
}
