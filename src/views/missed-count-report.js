// @ts-nocheck
// ── Missed on Current Count — Inventory Control → Reports ──────────────────────────────────────
// Owner req (2026-11-01): "a report to list out by location any items missed on the current
// count... date selectable as well as... location selectable as we generally do... All current
// counts should have the same count date, therefore if a date for last counted or last submitted
// is different or blank or n/a that would indicate it was not physically counted on the current
// count cycle... display grouped by class of product as well."
//
// Deliberately a DIFFERENT, stricter lens than the existing "Missing Items" tab
// (eom-missing-items-report.js, diagnoseIncompleteCount's window-based never/early/stale read):
// this asks "does this item's own count date match the exact day this store's current count
// actually happened on," not "was it counted somewhere inside the last few days of the period."
// Engine: computeMissedCountItems (src/engine/eom-inventory.js) — per store, per class group
// (Food/Cond/Paper vs. Non-Product, which legitimately have different real count days), detects
// the store's own anchor date and flags any item that doesn't match it. Reuses the already-loaded
// `onHand` for the dashboard's current period — no refetch. Location grouping reuses
// groupRowsByLocationThenKey (eom-report-grouping.js), the same shared helper Missing Items and
// Recount Impact already use, keyed on class instead of recommendation text.
import * as React from 'react';
import { ModalShell } from '../components/ModalShell.js';
import { LocationSelector } from '../components/PanelControls.js';
import { STORE_NAMES, INV_ORG_COORDS, sName, supervisorGroups, getStoreOrg } from '../constants.js';
import { computeMissedCountItems } from '../engine/eom-inventory.js';
import { DIGEST_CLASS_ORDER, DIGEST_CLASS_LABELS } from '../engine/eom-digest.js';
import { groupRowsByLocationThenKey } from './eom-report-grouping.js';
import { openPrintWindow } from './eom-supervisor.js';

const { useState, useMemo, useCallback } = React;
const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const unpad = l => String(l || '').replace(/^0+/, '') || String(l || '');
const money = v => (v == null || isNaN(v)) ? '—' : '$' + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtD = iso => { if (!iso) return '—'; const d = new Date(iso + 'T00:00:00'); return isNaN(d) ? iso : d.toLocaleDateString([], { month: 'short', day: 'numeric' }); };

function groupByLoc(onHandRows) {
  const m = {};
  for (const r of (onHandRows || [])) { const loc = unpad(r.loc); (m[loc] || (m[loc] = [])).push(r); }
  return m;
}

function downloadCsv(text, filename) {
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click(); URL.revokeObjectURL(url);
}
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function reportCSV(grouped, period) {
  const cols = ['Store', 'Org', 'Class', 'Item', 'WRIN', 'Last counted', 'Last submitted', 'Expected count date', 'Reason', '$ On Hand'];
  const lines = [cols.map(c => `"${c}"`).join(','), `"Period: ${period}"`];
  for (const loc of grouped) {
    for (const g of loc.groups) {
      for (const it of g.items) {
        lines.push([loc.storeName, loc.org === 'emerald' ? 'FL' : 'OK', g.label, it.descr || it.wrin, it.wrin,
          it.lastCounted || '', it.lastSubmitted || '', it.expectedDate || '', it.reason, it.onHandAmt]
          .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      }
    }
  }
  return lines.join('\n');
}

function reportHTML(grouped, { period, scopeLabel, nItems }) {
  let html = `<h1>Missed on Current Count — ${esc(scopeLabel)}</h1>`;
  html += `<div class="sub">${esc(period)} · ${nItems} item${nItems === 1 ? '' : 's'} not counted on the current count date</div>`;
  if (!grouped.length) return html + '<p>Nothing missed in the current scope. ✓</p>';
  for (const loc of grouped) {
    html += `<div class="block"><div class="loc-hdr">${esc(loc.storeName)} (${loc.org === 'emerald' ? 'FL' : 'OK'})</div>`;
    for (const g of loc.groups) {
      html += `<div class="grp">${esc(g.label)}</div><table><thead><tr><th>Item</th><th>Last Counted</th><th>Last Submitted</th><th>Expected</th><th>Reason</th><th>$ On Hand</th></tr></thead><tbody>`;
      for (const r of g.items) {
        html += `<tr><td>${esc(r.descr || r.wrin || '—')}${r.wrin ? ` <span class="mono" style="color:#999">(${esc(r.wrin)})</span>` : ''}</td>`
          + `<td>${esc(fmtD(r.lastCounted))}</td><td>${esc(fmtD(r.lastSubmitted))}</td><td>${esc(fmtD(r.expectedDate))}</td>`
          + `<td>${esc(r.reason)}</td><td>${esc(money(r.onHandAmt))}</td></tr>`;
      }
      html += `</tbody></table>`;
    }
    html += `</div>`;
  }
  return html;
}

export function MissedCountReportModal({ stores, onHand, period, onClose }) {
  const [locValue, setLocValue] = useState({ level: 'all', id: null });
  const [asOfOverride, setAsOfOverride] = useState('');

  const scope = locValue.level === 'state' ? locValue.id.toLowerCase()
    : locValue.level === 'patch' ? 'grp:' + locValue.id
    : locValue.level === 'store' ? locValue.id : 'all';
  const groups = useMemo(() => { try { return supervisorGroups() || {}; } catch { return {}; } }, []);
  const locs = useMemo(() => {
    if (String(scope).startsWith('grp:')) return (groups[scope.slice(4)] || []).map(l => unpad(l));
    return Object.keys(STORE_NAMES).filter(l =>
      scope === 'all' ? true : scope === 'ok' ? (INV_ORG_COORDS[l] || {}).state === 'OK'
        : scope === 'fl' ? (INV_ORG_COORDS[l] || {}).state === 'FL' : l === scope);
  }, [scope, groups]);
  const scopeLabel = scope === 'all' ? 'All stores' : scope === 'ok' ? 'Oklahoma' : scope === 'fl' ? 'Florida'
    : String(scope).startsWith('grp:') ? ('Patch ' + scope.slice(4)) : (sName(scope) || scope);

  const byLoc = useMemo(() => groupByLoc(onHand), [onHand]);

  const { allItems, anchorByLoc } = useMemo(() => {
    const items = [];
    const anchors = {};
    for (const loc of locs) {
      const { items: locItems, anchor } = computeMissedCountItems(byLoc[loc] || [], { period, asOfOverride: asOfOverride || null });
      anchors[loc] = anchor;
      const storeName = sName(loc) || loc;
      const org = getStoreOrg(loc);
      for (const it of locItems) items.push({ ...it, storeName, org, loc, clsLabel: DIGEST_CLASS_LABELS[it.cls] || it.cls });
    }
    const rank = c => { const i = DIGEST_CLASS_ORDER.indexOf(c); return i < 0 ? DIGEST_CLASS_ORDER.length : i; };
    items.sort((a, b) => a.storeName.localeCompare(b.storeName) || rank(a.cls) - rank(b.cls) || (a.descr || '').localeCompare(b.descr || ''));
    return { allItems: items, anchorByLoc: anchors };
  }, [locs, byLoc, period, asOfOverride]);

  const grouped = useMemo(() => groupRowsByLocationThenKey(allItems, { key: 'clsLabel' }), [allItems]);

  const doPrint = useCallback(() => {
    openPrintWindow(`Missed on Current Count — ${scopeLabel}`, reportHTML(grouped, { period, scopeLabel, nItems: allItems.length }));
  }, [grouped, period, scopeLabel, allItems.length]);
  const [copied, setCopied] = useState(false);
  const doCsv = () => downloadCsv(reportCSV(grouped, period), `missed-count-${scopeLabel.replace(/\s+/g, '-').toLowerCase()}-${period}.csv`);

  const headerRow = div({ style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 } },
    h(LocationSelector, { stores: Object.keys(STORE_NAMES).map(l => ({ loc: l })), invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, value: locValue, onChange: setLocValue, mode: 'full' }),
    div({ style: { display: 'flex', alignItems: 'center', gap: 6 } },
      span({ style: { fontSize: 10.5, color: 'var(--text3)' } }, 'Force count date:'),
      h('input', {
        type: 'date', value: asOfOverride, onChange: e => setAsOfOverride(e.target.value),
        title: 'Leave blank to auto-detect each store\'s own count date (the day most of its Food/Condiment/Paper items were counted). Set a date to check against that date for every store instead.',
        style: { fontSize: 11, padding: '4px 6px', border: '.5px solid var(--bdr)', borderRadius: 6, background: 'var(--surf2)', color: 'var(--text)' },
      }),
      asOfOverride && h('button', { onClick: () => setAsOfOverride(''), style: { fontSize: 10, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' } }, 'clear')),
    span({ style: { fontSize: 9.5, color: 'var(--text3)' } }, `${scopeLabel} · ${period} · ${allItems.length} item${allItems.length === 1 ? '' : 's'} missed`),
    span({ style: { flex: 1 } }),
    h('button', { className: 'btn btn-sm', style: { fontSize: 10 }, onClick: doPrint }, '🖨 Print'),
    h('button', {
      onClick: async () => { try { await navigator.clipboard.writeText(reportHTML(grouped, { period, scopeLabel, nItems: allItems.length }).replace(/<[^>]+>/g, s => /^<\/?(tr|table|div|br)/i.test(s) ? '\n' : '')); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} },
      className: 'btn btn-sm', style: { fontSize: 10 },
    }, copied ? '✓ Copied' : '📋 Copy'),
    h('button', { className: 'btn btn-sm', style: { fontSize: 10 }, onClick: doCsv }, '⬇ CSV'));

  const explainer = div({ style: { fontSize: '11.5px', color: 'var(--text3)', marginBottom: 10 } },
    'An item is flagged when its own last-counted / last-submitted date doesn\'t match the exact day this store\'s current count happened — stricter than the Missing Items tab\'s window-based check. Food/Condiment/Paper anchor to the store\'s own bulk-count day; Non-Product anchors to the period\'s last day (when it\'s due). Confirmed-deactivated items are excluded.');

  const th = (t) => h('th', { key: t, style: { textAlign: 'left', padding: '5px 8px', borderBottom: '1px solid var(--bdr2)', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text3)', whiteSpace: 'nowrap' } }, t);
  const td = (content, extra) => h('td', { style: { padding: '5px 8px', verticalAlign: 'top', ...(extra || {}) } }, content);

  const body = !grouped.length
    ? div({ style: { color: 'var(--text3)', fontSize: '13px', padding: '20px 4px', textAlign: 'center' } }, 'Nothing missed in the current scope — every item lines up with its store\'s current count date. ✓')
    : div({ style: { overflowX: 'auto' } }, ...grouped.map(loc => {
        const a = anchorByLoc[loc.loc] || {};
        return div({ key: loc.loc, style: { marginBottom: '16px' } },
          div({ style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' } },
            span({ style: { fontWeight: 700, color: 'var(--text)', fontSize: '13px' } }, loc.storeName),
            span({ style: { fontSize: '10px', color: loc.org === 'emerald' ? '#38bdf8' : '#f5bc00' } }, loc.org === 'emerald' ? 'FL' : 'OK'),
            span({ style: { fontSize: '10px', color: 'var(--text3)' } }, `this store's count date: ${fmtD(a.early)}${a.late && a.late !== a.early ? ` (Non-Product ${fmtD(a.late)})` : ''}`)),
          ...loc.groups.map((g, gi) => div({ key: gi, style: { marginBottom: '8px' } },
            div({ style: { fontSize: '11.5px', fontWeight: 600, color: 'var(--text2)', marginBottom: '3px' } }, g.label),
            h('table', { style: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '12.5px' } }, [
              h('thead', { key: 'h' }, h('tr', null, [th('Item'), th('Last Counted'), th('Last Submitted'), th('Reason'), th('$ On Hand')])),
              h('tbody', { key: 'b' }, g.items.map((r, i) => h('tr', { key: i, style: { borderBottom: '1px solid var(--bdr)' } }, [
                td(div(null, div({ style: { color: 'var(--text)' } }, r.descr || r.wrin || '—'),
                  r.wrin ? span({ style: { fontSize: '10px', color: 'var(--text3)', fontFamily: 'ui-monospace,Menlo,monospace' } }, r.wrin) : null)),
                td(fmtD(r.lastCounted)), td(fmtD(r.lastSubmitted)),
                td(span({ style: { color: r.actualDate == null ? '#fb923c' : 'var(--text2)' } }, r.reason)),
                td(money(r.onHandAmt), { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }),
              ]))),
            ]))));
      }));

  return h(ModalShell, { title: '🗓 Missed on Current Count', subtitle: 'Items whose own count date doesn\'t match this store\'s current count — grouped by location, then class', onClose, maxWidth: 1100, closeOnBackdrop: true },
    headerRow, explainer, body);
}
