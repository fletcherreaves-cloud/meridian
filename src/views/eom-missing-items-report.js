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
//
// 2026-08-31 (owner request) — location scope is already provided by the shared EOMDashboardPanel
// chrome (LocationSelector, all → state → patch → store), confirmed still doing its job; this
// added a "📋 Copy" button and grouped items by RECOMMENDATION within each location (was a flat
// table repeating the same recommendation text once per row — noisy once a store has several items
// with the identical action). groupRowsByLocationThenKey() is shared with eom-recount-report.js so
// the two reports can't grow two different groupings of the same idea.
import * as React from 'react';
import { DIGEST_CLASS_LABELS } from '../engine/eom-digest.js';
import { openPrintWindow } from './eom-supervisor.js';
import { groupRowsByLocationThenKey } from './eom-report-grouping.js';

const { useState, useCallback } = React;
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

// Plain-text export (the "📋 Copy" button) — a pure function of the SAME grouped structure the
// screen renders, so copied text can't disagree with what's on screen. One recommendation stated
// once per group, not once per item.
export function formatMissingItemsText(rows, { period, scopeLabel, reportAsOf } = {}) {
  const list = rows || [];
  const totalValue = list.reduce((s, r) => s + (r.valueAtRisk || 0), 0);
  const lines = [];
  lines.push(`Missing / Uncounted Items — ${scopeLabel || 'all stores'} — ${period}`);
  lines.push(`${list.length} item${list.length === 1 ? '' : 's'} · ${money(totalValue)} at risk · as of ${fmtDate(reportAsOf)}`);
  if (!list.length) { lines.push('', 'No uncounted items in the current scope.'); return lines.join('\n'); }
  const byLoc = groupRowsByLocationThenKey(list, { key: 'recommendation' });
  for (const loc of byLoc) {
    lines.push('', `${loc.storeName} (${loc.org === 'emerald' ? 'FL' : 'OK'})`);
    for (const g of loc.groups) {
      lines.push(`  ${g.label}`);
      for (const it of g.items) {
        const last = it.lastCounted ? fmtDate(it.lastCounted) : 'never counted';
        lines.push(`    - ${it.descr || it.wrin} (${DIGEST_CLASS_LABELS[it.cls] || it.cls}, ${money(it.onHandAmt)}, last ${last})`);
      }
    }
  }
  return lines.join('\n');
}

// HTML export for the "🖨 Print" button (2026-08-31, real bug fix — see openPrintWindow's own
// comment in eom-supervisor.js for the full story: toggling body.eom-printing + window.print()
// against the live app DOM reproducibly came back blank for the owner, so these reports print an
// isolated window instead).
export function formatMissingItemsHtml(rows, { period, scopeLabel, reportAsOf } = {}) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const list = rows || [];
  const totalValue = list.reduce((s, r) => s + (r.valueAtRisk || 0), 0);
  let html = `<h1>Missing / Uncounted Items — ${esc(scopeLabel || 'all stores')}</h1>`;
  html += `<div class="sub">${esc(period)} · ${list.length} item${list.length === 1 ? '' : 's'} · ${esc(money(totalValue))} at risk · as of ${esc(fmtDate(reportAsOf))}</div>`;
  if (!list.length) return html + '<p>No uncounted items in the current scope.</p>';
  const byLoc = groupRowsByLocationThenKey(list, { key: 'recommendation' });
  for (const loc of byLoc) {
    html += `<div class="block"><div class="loc-hdr">${esc(loc.storeName)} (${loc.org === 'emerald' ? 'FL' : 'OK'})</div>`;
    for (const g of loc.groups) {
      html += `<div class="grp">${esc(g.label)}</div><table><thead><tr><th>Class</th><th>Item</th><th>Last Counted</th><th>$ On Hand</th></tr></thead><tbody>`;
      for (const r of g.items) {
        const last = r.lastCounted ? fmtDate(r.lastCounted) : 'Never';
        const stateLabel = STATE_LABEL[r.state] || r.state || '';
        html += `<tr><td>${esc(DIGEST_CLASS_LABELS[r.cls] || r.cls || '—')}</td>`
          + `<td>${esc(r.descr || r.wrin || '—')}${r.wrin ? ` <span class="mono" style="color:#999">(${esc(r.wrin)})</span>` : ''}</td>`
          + `<td>${esc(last)}${stateLabel ? `<br><span style="font-size:9.5px;font-weight:700;color:#666">${esc(stateLabel)}</span>` : ''}</td>`
          + `<td>${esc(money(r.onHandAmt))}</td></tr>`;
      }
      html += `</tbody></table>`;
    }
    html += `</div>`;
  }
  return html;
}

export function EOMMissingItemsReportPanel({ rows, period, reportAsOf, scopeLabel }) {
  const doPrint = useCallback(() => {
    openPrintWindow(`Missing / Uncounted Items — ${scopeLabel || 'all stores'}`, formatMissingItemsHtml(rows, { period, scopeLabel, reportAsOf }));
  }, [rows, period, scopeLabel, reportAsOf]);
  const [copied, setCopied] = useState(false);
  const doCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatMissingItemsText(rows, { period, scopeLabel, reportAsOf }));
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard permission denied — silently a no-op, matches other panels' best-effort copy */ }
  }, [rows, period, scopeLabel, reportAsOf]);

  const list = rows || [];
  const totalValue = list.reduce((s, r) => s + (r.valueAtRisk || 0), 0);
  const grouped = React.useMemo(() => groupRowsByLocationThenKey(list, { key: 'recommendation' }), [list]);

  const th = (t) => h('th', { key: t, style: { textAlign: 'left', padding: '5px 8px', borderBottom: '1px solid var(--bdr2)', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text3)', whiteSpace: 'nowrap' } }, t);
  const td = (content, extra) => h('td', { style: { padding: '5px 8px', verticalAlign: 'top', ...(extra || {}) } }, content);

  return div({ style: { padding: '16px', maxWidth: '1100px', margin: '0 auto' } },

    div({ className: 'eom-no-print' },
      div({ style: { marginBottom: '14px' } },
        div({ style: { fontSize: '11px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#f5bc00', marginBottom: '4px' } }, 'Missing / Uncounted Items'),
        div({ style: { fontSize: '20px', fontWeight: 800, color: 'var(--text)' } }, `${scopeLabel || 'all stores'} — ${period}`),
        div({ style: { fontSize: '11px', color: 'var(--text3)', marginTop: '3px' } },
          `${list.length} item${list.length === 1 ? '' : 's'} · ${money(totalValue)} at risk · as of ${fmtDate(reportAsOf)}`)),
      div({ style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '10px' } },
        h('button', {
          onClick: doCopy,
          title: 'Copy this report as text — grouped by location, then by recommendation.',
          style: { background: 'var(--surf3)', border: '1px solid var(--bdr2)', color: 'var(--text2)', borderRadius: '7px', padding: '6px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
        }, copied ? '✓ Copied' : '📋 Copy'),
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
        : div(null, ...grouped.map(loc => div({ key: loc.loc, className: 'eom-block', style: { marginBottom: '16px', overflowX: 'auto' } },
            div({ style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' } },
              span({ style: { fontWeight: 700, color: 'var(--text)', fontSize: '13px' } }, loc.storeName),
              span({ style: { fontSize: '10px', color: loc.org === 'emerald' ? '#38bdf8' : '#f5bc00' } }, loc.org === 'emerald' ? 'FL' : 'OK')),
            ...loc.groups.map((g, gi) => div({ key: gi, style: { marginBottom: '8px' } },
              div({ style: { fontSize: '11.5px', fontWeight: 600, color: 'var(--text2)', marginBottom: '3px' } }, g.label),
              h('table', { style: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '12.5px' } }, [
                h('thead', { key: 'h' }, h('tr', null, [th('Class'), th('Item'), th('Last Counted'), th('$ On Hand')])),
                h('tbody', { key: 'b' }, g.items.map((r, i) => h('tr', { key: i, style: { borderBottom: '1px solid var(--bdr)' } }, [
                  td(DIGEST_CLASS_LABELS[r.cls] || r.cls),
                  td(div(null,
                    div({ style: { color: 'var(--text)' } }, r.descr || r.wrin || '—'),
                    r.wrin ? span({ style: { fontSize: '10px', color: 'var(--text3)', fontFamily: 'ui-monospace,Menlo,monospace' } }, r.wrin) : null)),
                  td(div(null,
                    span(null, r.lastCounted ? fmtDate(r.lastCounted) : 'Never'),
                    span({ style: { display: 'block', fontSize: '9.5px', fontWeight: 700, color: STATE_BADGE[r.state] || 'var(--text3)' } }, STATE_LABEL[r.state] || r.state || ''))),
                  td(money(r.onHandAmt), { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }),
                ]))),
              ])))),
          )),
    ),
  );
}
