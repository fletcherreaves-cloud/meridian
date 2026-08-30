// @ts-nocheck
// ── EOM Recount-Impact Report (dispatch #227, Report 3) ──────────────────────────────────────────
// Owner request, verbatim (2026-08-30): "the recount report we have been discussing. Just a report
// stating how many and which products were recounted and whether they improved or hurt final
// result. Sort by class here as well."
//
// Reuses the SAME engine dispatch #226 (SAGE tool `query_eom_recount_impact`, memory/dispatch-226.md)
// was asked to reuse: src/engine/eom-ledger-baseline.js's ledgerBaselineDiff()/itemCloseWindowRecount()
// — same-store/same-item, session-count-vs-final-count-in-the-close-window methodology, no new pull,
// no second grading of helped/hurt. As of this dispatch, #226 had NOT merged to main (only its own
// doc commit, a08013e, was on main — checked via `git log origin/main | grep 226` before starting
// this report) — there is no shared formatting/summarization helper yet to reuse, so this file wraps
// the raw engine functions directly. If #226 lands a shared helper later, a follow-up dedup pass
// should point this file at it instead of its own `verdictText`/row-flattening (recountVerdictText()
// itself already lives in eom-ledger-baseline.js precisely so that pass has one place to look).
//
// `rows` arrives already built + sorted by EOMDashboardPanel's `recountImpactRows` useMemo (class
// order, then |Δ| descending within class) — this file is purely presentational. Each row already
// carries `verdictText` (recountVerdictText(), plain-language "helped: corrected a $X undercount" /
// "hurt: moved further from expected usage" — a statement about food-cost ACCURACY, not raw dollar
// direction, per the owner's own "whether they improved or hurt final result" framing).
//
// Print mechanism reused verbatim from eom-supervisor.js (PRINT_STYLE, exported dispatch #227).
import * as React from 'react';
import { DIGEST_CLASS_LABELS } from '../engine/eom-digest.js';
import { ensureEomPrintStyleInjected } from './eom-supervisor.js';

const { useEffect, useState, useCallback } = React;
const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const money = v => (v == null || isNaN(v)) ? '—' : '$' + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });

const VERDICT_COLOR = { helping: '#4ade80', hurting: 'var(--crit)', flat: 'var(--text3)', unknown: 'var(--text3)' };

export function EOMRecountImpactPanel({ rows, period, scopeLabel }) {
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
  const nHelped = list.filter(r => r.verdict === 'helping').length;
  const nHurt = list.filter(r => r.verdict === 'hurting').length;

  const th = (t) => h('th', { key: t, style: { textAlign: 'left', padding: '5px 8px', borderBottom: '1px solid var(--bdr2)', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text3)', whiteSpace: 'nowrap' } }, t);
  const tdR = (content) => h('td', { style: { padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }, content);

  return div({ style: { padding: '16px', maxWidth: '1100px', margin: '0 auto' } },

    div({ className: 'eom-no-print' },
      div({ style: { marginBottom: '14px' } },
        div({ style: { fontSize: '11px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#f5bc00', marginBottom: '4px' } }, 'Recount-Impact Report'),
        div({ style: { fontSize: '20px', fontWeight: 800, color: 'var(--text)' } }, `${scopeLabel || 'all stores'} — ${period}`),
        div({ style: { fontSize: '11px', color: 'var(--text3)', marginTop: '3px' } },
          `${list.length} recounted item${list.length === 1 ? '' : 's'} · `,
          span({ style: { color: '#4ade80', fontWeight: 700 } }, `${nHelped} helped`), ' · ',
          span({ style: { color: 'var(--crit)', fontWeight: 700 } }, `${nHurt} hurt`),
          ' · EOM close window (last 3 days)')),
      div({ style: { display: 'flex', justifyContent: 'flex-end', marginBottom: '10px' } },
        h('button', {
          onClick: doPrint,
          title: 'Print this report — every item recounted in the close window, sorted by class.',
          style: { background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.3)', color: '#4ade80', borderRadius: '7px', padding: '6px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
        }, '🖨 Print')),
    ),

    div({ className: 'eom-print-area' },
      div({ className: 'eom-print-title', style: { marginBottom: '10px' } },
        div({ style: { fontSize: '15px', fontWeight: 800, color: '#111' } }, `Recount-Impact Report — ${scopeLabel || 'all stores'}`),
        div({ style: { fontSize: '11px', color: '#555' } }, `${period} · ${list.length} recounted item${list.length === 1 ? '' : 's'} · ${nHelped} helped · ${nHurt} hurt`)),

      list.length === 0
        ? div({ style: { color: 'var(--text3)', fontSize: '13px', padding: '20px 4px' } }, 'No recounted items in this close window for the current scope — either nothing was recounted, or the raw item-detail pull has not landed for these stores/period yet.')
        : div({ className: 'eom-block', style: { overflowX: 'auto' } },
            h('table', { style: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '12.5px' } }, [
              h('thead', { key: 'h' }, h('tr', null, [
                th('Item'), th('Class'), th('# Recounted'), th('Baseline'), th('Post-Recount'), th('Δ'), th('Result'), th('Store'),
              ])),
              h('tbody', { key: 'b' }, list.map((r, i) => h('tr', { key: i, style: { borderBottom: '1px solid var(--bdr)' } }, [
                h('td', { style: { padding: '5px 8px' } },
                  div({ style: { color: 'var(--text)' } }, r.descr || r.wrin || '—'),
                  r.wrin ? span({ style: { fontSize: '10px', color: 'var(--text3)', fontFamily: 'ui-monospace,Menlo,monospace' } }, r.wrin) : null),
                h('td', { style: { padding: '5px 8px', color: 'var(--text2)' } }, DIGEST_CLASS_LABELS[r.cls] || r.cls || '—'),
                tdR(r.nRecounts != null ? `↻ ${r.nRecounts}` : '—'),
                tdR(r.baseVar != null ? money(r.baseVar) : '—'),
                tdR(r.curVar != null ? money(r.curVar) : '—'),
                tdR(r.dMag != null ? h('span', { style: { fontWeight: 700, color: VERDICT_COLOR[r.verdict] } }, `${r.dMag > 0 ? '+' : ''}${money(r.dMag)}`) : '—'),
                h('td', { style: { padding: '5px 8px', maxWidth: '340px', color: VERDICT_COLOR[r.verdict] || 'var(--text2)', fontWeight: 600 } }, r.verdictText),
                h('td', { style: { padding: '5px 8px', color: 'var(--text2)', whiteSpace: 'nowrap' } }, r.storeName, span({ style: { fontSize: '10px', color: r.org === 'emerald' ? '#38bdf8' : '#f5bc00', marginLeft: '5px' } }, r.org === 'emerald' ? 'FL' : 'OK')),
              ]))),
            ])),
    ),
  );
}
