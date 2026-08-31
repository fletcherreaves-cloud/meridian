// @ts-nocheck
// ── EOM Count-Swing Ledger (Report 4, owner request 2026-08-31) ────────────────────────────────────
// Owner, verbatim: "take all the items that where lost during the month, which little hope of
// recovering by a recount at eom and add a section to the recap reports outlining those and when
// they occurred while also positively encouraging teams to recount top items (based on our rules)
// at the time of the count (daily or weekly). Show a total +/- variance dollar amount for clarity
// and how it played into eom results." Then, expanding the ask: "I really want to see the total
// derived +/- across any item that took a swing in a inter-month count... I want to see the
// accumulative total of those and what they were and when it happened along with if a recount took
// place at the time or not and who the counting manager was." Confirmed scope: per-store report
// tab, same pattern as Missing Items/Team Snapshot/Recount Impact.
//
// `rows` (from EOMDashboardPanel's `swingLedgerRows` useMemo) is a flat list of one row per material
// count-event across the WHOLE period (not just the EOM close window) — storeSwingLedger()
// (eom-item-journey.js) flattens buildStoreJourneys()'s existing per-item counts[]. No new engine,
// no new pull. Each row already carries `recovered` (a later count this period superseded it — the
// swing "washes out" per QSRSoft's own period-to-period anchoring) and `locked` (this is the item's
// FINAL count, and it landed before the close window — nothing left to recover this period).
//
// Print mechanism reused verbatim from eom-supervisor.js (PRINT_STYLE, exported dispatch #227).
// Copy button + location-then-group structure follows the SAME pattern as Missing Items/Recount
// Impact (groupRowsByLocationThenKey) so the three reports don't grow three different groupings.
import * as React from 'react';
import { DIGEST_CLASS_LABELS } from '../engine/eom-digest.js';
import { ensureEomPrintStyleInjected } from './eom-supervisor.js';
import { groupRowsByLocationThenKey } from './eom-report-grouping.js';

const { useEffect, useState, useCallback } = React;
const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const money = v => (v == null || isNaN(v)) ? '—' : (v < 0 ? '-$' : '$') + Math.abs(Number(v)).toLocaleString(undefined, { maximumFractionDigits: 0 });
const fmtDate = d => {
  if (!d) return '—';
  const dt = d instanceof Date ? d : new Date(/T/.test(String(d)) ? d : d + 'T00:00:00');
  return isNaN(dt) ? String(d) : dt.toLocaleDateString([], { month: 'short', day: 'numeric' });
};
const cases = r => (r.cases != null ? ` (${r.cases.toFixed(2)} cs)` : '');
const statusLabel = r => r.locked ? '🔒 Locked — real loss, no recovery chance this period' : r.recovered ? '↩ Recovered — a later count this period washed it out' : '⏳ Still open — more counts may follow';

// Plain-text export (the "📋 Copy" button) — a pure function of the SAME grouped structure the
// screen renders, so copied text can't disagree with what's on screen.
export function formatSwingLedgerText(rows, { period, scopeLabel, totalDollars, topSwingers, reconstructions } = {}) {
  const list = rows || [];
  const locked = list.filter(r => r.locked);
  const lockedTotal = locked.reduce((s, r) => s + r.dollars, 0);
  const lines = [];
  lines.push(`Count-Swing Ledger — ${scopeLabel || 'all stores'} — ${period}`);
  lines.push(`${list.length} count swing${list.length === 1 ? '' : 's'} · net ${money(totalDollars)} · ${locked.length} locked real loss${locked.length === 1 ? '' : 'es'} (${money(lockedTotal)})`);
  if (topSwingers && topSwingers.length) {
    lines.push('', '🎯 Top items to recount at count time (biggest swingers this period):');
    for (const t of topSwingers) lines.push(`  - ${t.descr || t.wrin} (${DIGEST_CLASS_LABELS[t.cls] || t.cls}, net ${money(t.netCountDollars)} across ${t.nCounts} count${t.nCounts === 1 ? '' : 's'})`);
  }
  if (reconstructions && reconstructions.length) {
    lines.push('', '🍔 Possible product reconstruction (basic recipe lookup, not a confirmed finding):');
    for (const store of reconstructions) {
      lines.push(`  ${store.storeName} (${store.org === 'emerald' ? 'FL' : 'OK'})`);
      for (const c of store.candidates.slice(0, 8)) {
        lines.push(`    - ≈${Math.round(c.estimatedUnits)} ${c.description} (${c.tight ? 'tight fit' : 'loose fit'}, ${c.contributors.length} ingredients agree)`);
        for (const ct of c.contributors) lines.push(`        · ${ct.descr || ct.wrin}: ${Math.round(ct.missingUnits)} missing → ≈${ct.impliedServings.toFixed(1)}`);
      }
    }
  }
  if (!list.length) { lines.push('', 'No material count swings this period for the current scope.'); return lines.join('\n'); }
  const byLoc = groupRowsByLocationThenKey(list.map(r => ({ ...r, _status: statusLabel(r) })), { key: '_status' });
  for (const loc of byLoc) {
    lines.push('', `${loc.storeName} (${loc.org === 'emerald' ? 'FL' : 'OK'})`);
    for (const g of loc.groups) {
      lines.push(`  ${g.label}`);
      for (const it of g.items) {
        lines.push(`    - ${fmtDate(it.dt)}: ${it.descr || it.wrin} ${it.dollars > 0 ? '+' : ''}${money(it.dollars)}${cases(it)} — ${it.manager || 'unknown counter'}`);
      }
    }
  }
  return lines.join('\n');
}

export function EOMSwingLedgerReportPanel({ rows, totalDollars, topSwingers, reconstructions, period, scopeLabel }) {
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
  const [copied, setCopied] = useState(false);
  const doCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatSwingLedgerText(rows, { period, scopeLabel, totalDollars, topSwingers, reconstructions }));
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard permission denied — silently a no-op, matches other panels' best-effort copy */ }
  }, [rows, period, scopeLabel, totalDollars, topSwingers, reconstructions]);

  const list = rows || [];
  const locked = list.filter(r => r.locked);
  const lockedTotal = locked.reduce((s, r) => s + r.dollars, 0);
  const grouped = React.useMemo(() => groupRowsByLocationThenKey(list.map(r => ({ ...r, _status: statusLabel(r) })), { key: '_status' }), [list]);

  const th = (t) => h('th', { key: t, style: { textAlign: 'left', padding: '5px 8px', borderBottom: '1px solid var(--bdr2)', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text3)', whiteSpace: 'nowrap' } }, t);
  const tdR = (content) => h('td', { style: { padding: '5px 8px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' } }, content);

  return div({ style: { padding: '16px', maxWidth: '1100px', margin: '0 auto' } },

    div({ className: 'eom-no-print' },
      div({ style: { marginBottom: '14px' } },
        div({ style: { fontSize: '11px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#f5bc00', marginBottom: '4px' } }, 'Count-Swing Ledger'),
        div({ style: { fontSize: '20px', fontWeight: 800, color: 'var(--text)' } }, `${scopeLabel || 'all stores'} — ${period}`),
        div({ style: { fontSize: '11px', color: 'var(--text3)', marginTop: '3px' } },
          `${list.length} count swing${list.length === 1 ? '' : 's'} · net `,
          span({ style: { fontWeight: 700, color: totalDollars < 0 ? 'var(--crit)' : totalDollars > 0 ? '#4ade80' : 'var(--text2)' } }, money(totalDollars)),
          ' · ',
          span({ style: { color: 'var(--crit)', fontWeight: 700 } }, `${locked.length} locked real loss${locked.length === 1 ? '' : 'es'}`),
          ` (${money(lockedTotal)}) — no recovery chance this period`)),
      div({ style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginBottom: '10px' } },
        h('button', {
          onClick: doCopy,
          title: 'Copy this report as text — grouped by location, then by recovery status.',
          style: { background: 'var(--surf3)', border: '1px solid var(--bdr2)', color: 'var(--text2)', borderRadius: '7px', padding: '6px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
        }, copied ? '✓ Copied' : '📋 Copy'),
        h('button', {
          onClick: doPrint,
          title: 'Print this report — every material count swing this period, sorted by class.',
          style: { background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.3)', color: '#4ade80', borderRadius: '7px', padding: '6px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
        }, '🖨 Print')),
    ),

    div({ className: 'eom-print-area' },
      div({ className: 'eom-print-title', style: { marginBottom: '10px' } },
        div({ style: { fontSize: '15px', fontWeight: 800, color: '#111' } }, `Count-Swing Ledger — ${scopeLabel || 'all stores'}`),
        div({ style: { fontSize: '11px', color: '#555' } }, `${period} · ${list.length} count swing${list.length === 1 ? '' : 's'} · net ${money(totalDollars)} · ${locked.length} locked (${money(lockedTotal)})`)),

      // Coaching list (owner: "positively encouraging teams to recount top items... at the time of
      // the count"). Independent of recovered/locked — the point is in-process discipline, catching
      // the swing AT the count rather than only diagnosing it after the fact.
      (topSwingers && topSwingers.length > 0)
        ? div({ className: 'eom-block', style: { marginBottom: '16px' } },
            div({ style: { fontSize: '11px', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#f5bc00', marginBottom: '8px' } },
              `🎯 Top items to recount at count time — biggest swings this period`),
            div({ style: { fontSize: '11.5px', color: 'var(--text2)', marginBottom: '8px' } },
              'These items moved the most this month. Double-checking them AT the count — not just after — catches the swing before it locks in.'),
            div({ style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
              ...topSwingers.map((t, i) => span({ key: i, style: { fontSize: '11px', padding: '4px 9px', borderRadius: '6px', background: 'var(--surf3)', border: '1px solid var(--bdr2)', color: 'var(--text)' } },
                `${t.descr || t.wrin} `, span({ style: { color: t.netCountDollars < 0 ? 'var(--crit)' : '#4ade80', fontWeight: 700 } }, money(t.netCountDollars))))))
        : null,

      // Product reconstruction (owner req, 2026-08-31, verbatim): "if i was missing 100 pieces of
      // fresh beef and 110 regular buns and 98 slices of cheese, i would envision that as either
      // 100 cheeseburgers or 50 McDoubles possibly unaccounted for... useful information to watch
      // on the floor for procedures and check for controls issues at the register." A "tight" fit
      // (all contributing ingredients agree) is the strong signal; a loose one still shows but
      // reads visually weaker (owner: "just do a basic lookup conversion" — show the candidates,
      // let the reader judge fit, don't hide the loose ones).
      (reconstructions && reconstructions.length > 0)
        ? div({ className: 'eom-block', style: { marginBottom: '16px' } },
            div({ style: { fontSize: '11px', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#f5bc00', marginBottom: '8px' } },
              `🍔 Possible product reconstruction`),
            div({ style: { fontSize: '11.5px', color: 'var(--text2)', marginBottom: '10px' } },
              'When 2+ ingredients are short this period in a ratio that matches a real recipe, the shortage may be a fully-assembled product that never got rung — worth watching the floor/register for the specific procedure or controls gap. A basic recipe lookup, not a confirmed finding.'),
            ...reconstructions.map(store => div({ key: store.loc, style: { marginBottom: '10px' } },
              div({ style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '5px' } },
                span({ style: { fontWeight: 700, color: 'var(--text)', fontSize: '12.5px' } }, store.storeName),
                span({ style: { fontSize: '10px', color: store.org === 'emerald' ? '#38bdf8' : '#f5bc00' } }, store.org === 'emerald' ? 'FL' : 'OK')),
              ...store.candidates.slice(0, 8).map((c, ci) => div({ key: ci, style: { border: '1px solid var(--bdr)', borderLeft: `3px solid ${c.tight ? '#4ade80' : 'var(--text3)'}`, borderRadius: '7px', padding: '8px 12px', marginBottom: '6px', background: 'var(--surf2)', opacity: c.tight ? 1 : 0.75 } },
                div({ style: { display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' } },
                  span({ style: { fontWeight: 700, color: 'var(--text)' } }, `≈${Math.round(c.estimatedUnits)} ${c.description}`),
                  span({ style: { fontSize: '10px', fontWeight: 700, color: c.tight ? '#4ade80' : '#f5bc00', textTransform: 'uppercase' } }, c.tight ? '✓ tight fit' : '~ loose fit'),
                  span({ style: { fontSize: '11px', color: 'var(--text3)' } }, `${c.contributors.length} ingredients agree`)),
                div({ style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
                  ...c.contributors.map((ct, i) => span({ key: i, style: { fontSize: '10.5px', padding: '2px 7px', borderRadius: '5px', background: 'var(--surf3)', color: 'var(--text2)' } },
                    `${ct.descr || ct.wrin}: ${Math.round(ct.missingUnits)} missing → ≈${ct.impliedServings.toFixed(1)}`))))))))
        : null,

      list.length === 0
        ? div({ style: { color: 'var(--text3)', fontSize: '13px', padding: '20px 4px' } }, 'No material count swings this period for the current scope.')
        : div(null, ...grouped.map(loc => div({ key: loc.loc, className: 'eom-block', style: { marginBottom: '16px', overflowX: 'auto' } },
            div({ style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' } },
              span({ style: { fontWeight: 700, color: 'var(--text)', fontSize: '13px' } }, loc.storeName),
              span({ style: { fontSize: '10px', color: loc.org === 'emerald' ? '#38bdf8' : '#f5bc00' } }, loc.org === 'emerald' ? 'FL' : 'OK')),
            ...loc.groups.map((g, gi) => div({ key: gi, style: { marginBottom: '8px' } },
              div({ style: { fontSize: '11.5px', fontWeight: 600, color: g.items[0]?.locked ? 'var(--crit)' : g.items[0]?.recovered ? 'var(--text2)' : '#f5bc00', marginBottom: '3px' } }, g.label),
              h('table', { style: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '12.5px' } }, [
                h('thead', { key: 'h' }, h('tr', null, [th('Date'), th('Item'), th('Class'), th('Qty / Cases'), th('$ Swing'), th('Counted by')])),
                h('tbody', { key: 'b' }, g.items.map((r, i) => h('tr', { key: i, style: { borderBottom: '1px solid var(--bdr)' } }, [
                  h('td', { style: { padding: '5px 8px', color: 'var(--text2)', whiteSpace: 'nowrap' } }, fmtDate(r.dt)),
                  h('td', { style: { padding: '5px 8px' } },
                    div({ style: { color: 'var(--text)' } }, r.descr || r.wrin || '—'),
                    r.wrin ? span({ style: { fontSize: '10px', color: 'var(--text3)', fontFamily: 'ui-monospace,Menlo,monospace' } }, r.wrin) : null),
                  h('td', { style: { padding: '5px 8px', color: 'var(--text2)' } }, DIGEST_CLASS_LABELS[r.cls] || r.cls || '—'),
                  tdR(r.unitVar != null ? `${r.unitVar > 0 ? '+' : ''}${Math.round(r.unitVar).toLocaleString()}${cases(r)}` : '—'),
                  tdR(h('span', { style: { fontWeight: 700, color: r.dollars < 0 ? 'var(--crit)' : '#4ade80' } }, `${r.dollars > 0 ? '+' : ''}${money(r.dollars)}`)),
                  h('td', { style: { padding: '5px 8px', color: 'var(--text2)', whiteSpace: 'nowrap' } }, r.manager || '—'),
                ]))),
              ])))),
          )),
    ),
  );
}
