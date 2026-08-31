// @ts-nocheck
// ── EOM Team Snapshot (dispatch #227, Report 2) ──────────────────────────────────────────────────
// Owner request, verbatim (2026-08-30): "the EOM Count panel without the columns on the right
// beginning with diagnosis. It would give a quick and easy snapshot to send out teams to help
// them. Include usual top components as above (pic for ref.) You can include the chips at the top
// of the panel as well. Just roll up to selections."
//
// Folded into the Inventory Control hub as a new "Team Snapshot" tab. Columns are literally the
// first 5 of the Scoreboard tab's own CSV export (Store/State/Count%/FOB%/FOB$, dropping
// Diagnosis/Communication) — read via scoreboardRowFields() (src/engine/eom-inventory.js), the
// SAME accessor exportCSV itself now calls, so this view can never drift from the Scoreboard's own
// numbers (the "two panels disagree on one number" trap CLAUDE.md's Dev Rules calls out). `rows`
// is the SAME already-scoped array every other tab reads — no second fetch, no second filter.
//
// Chips-at-top: dispatch #227's own text says "pick one [chip style] and say which" — this uses
// the PERCENT-primary convention `FobStripLite` established in eom-share-view.js (v5.272, same
// session) rather than eom-dashboard.js's older $-primary `FobStrip`, because this report shares
// FobStripLite's exact purpose: a plain, read-only, printable/share-able view for a store team, not
// an internal diagnosis workspace. FobStripLite itself isn't exported from eom-share-view.js, so
// this is a new lightweight component matching its visual convention — for >1 store in scope it
// dollar-weights the roll-up (Σ$ ÷ Σ product sales, never a mean of store %ages, per CLAUDE.md's
// standing aggregation rule) instead of showing one store's vs-target delta (a single target
// wouldn't mean anything once multiple stores/targets are blended).
//
// Print mechanism reused verbatim from eom-supervisor.js (PRINT_STYLE, exported dispatch #227).
import * as React from 'react';
import { DEFAULT_TARGETS } from '../constants.js';
import { fobComponentDeltas } from '../engine/eom-diagnosis.js';
import { scoreboardRowFields } from '../engine/eom-inventory.js';
import { openPrintWindow } from './eom-supervisor.js';

const { useCallback } = React;
const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const unpad = l => String(l || '').replace(/^0+/, '') || String(l || '');
const $ = v => (v == null || isNaN(v)) ? '—' : '$' + Math.round(v).toLocaleString();
const pct2 = v => (v == null || isNaN(v)) ? '—' : (v * 100).toFixed(2) + '%';

const COMPS = [
  ['comp', 'Comp Waste'], ['raw', 'Raw Waste'], ['cond', 'Condiments'],
  ['emp', 'Emp Meals'], ['statv', 'Stat Var'], ['unex', 'Unexplained'],
];

// Rolled-up FOB chips for the current scope. One store → its own components + vs-target (mirrors
// FobStripLite's own single-store math via fobComponentDeltas()). Multiple stores → dollar-weighted
// aggregate ($ summed across scope, % = the sum, never a mean of per-store %ages) with no target
// line (a single target has no meaning once stores/targets are blended).
function FobChipsRollup({ rows, period, monthlyOverrideFor }) {
  const box = { padding: '5px 10px', background: 'var(--surf3)', border: '1px solid var(--bdr2)', borderRadius: '7px', display: 'flex', flexDirection: 'column', gap: '2px', minWidth: '90px' };
  const lab = { fontSize: '8.5px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.05em', whiteSpace: 'nowrap' };
  const big = (c) => ({ fontSize: '13px', fontWeight: 700, color: c || 'var(--text)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' });
  const sub = { fontSize: '8.5px', color: 'var(--text3)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

  const withFob = (rows || []).filter(r => r.components && (r.components.fob != null || r.components.fobPct != null));
  if (!withFob.length) return null;

  if (withFob.length === 1) {
    const r = withFob[0];
    const f = r.components;
    // 2026-08-31 fix -- layer this period's monthly_targets override on top of the hardcoded
    // DEFAULT_TARGETS seed (same pattern as eom-dashboard.js's FobStrip / eom-share-view.js's
    // FobStripLite -- see either's comment for the full 2026-08-30 finding).
    const targets = { ...(DEFAULT_TARGETS[unpad(r.loc)] || {}), ...((monthlyOverrideFor && monthlyOverrideFor(r.loc, period)) || {}) };
    const fobTgt = targets.tFOBTarget != null ? Number(targets.tFOBTarget) : null;
    const deltas = fobComponentDeltas(f, targets);
    const byKey = {}; for (const d of deltas) byKey[d.key] = d;
    const fobOver = fobTgt != null && f.fobPct != null && f.fobPct > fobTgt;
    const cell = (label, key) => {
      const d = byKey[key];
      const over = d && d.deltaPp != null && d.deltaPp > 0.005;
      const color = d && d.deltaPp != null ? (over ? 'var(--crit)' : '#4ade80') : undefined;
      const tgtLine = d && d.tgtPct != null ? `${d.deltaPp >= 0 ? '+' : ''}${d.deltaPp.toFixed(2)}pp (tgt ${(d.tgtPct * 100).toFixed(2)}%)` : null;
      return div({ key, style: box }, span({ style: lab }, label), span({ style: big(color) }, d && d.pct != null ? pct2(d.pct) : (f.sales ? pct2((f[key] || 0) / f.sales) : '—')),
        div({ style: { display: 'flex', gap: '4px' } }, span({ style: sub }, $(f[key])), tgtLine ? span({ style: sub }, `· ${tgtLine}`) : null));
    };
    return div({ style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' } },
      div({ style: box }, span({ style: lab }, 'FOB'), span({ style: big(fobTgt != null ? (fobOver ? 'var(--crit)' : '#4ade80') : '#f5bc00') }, pct2(f.fobPct)),
        div({ style: { display: 'flex', gap: '4px' } }, span({ style: sub }, $(f.fob)),
          fobTgt != null ? span({ style: sub }, `· ${f.fobPct >= fobTgt ? '+' : ''}${((f.fobPct - fobTgt) * 100).toFixed(2)}pp (tgt ${(fobTgt * 100).toFixed(2)}%)`) : null)),
      ...COMPS.map(([key, label]) => cell(label, key)),
      f.sales ? div({ style: box }, span({ style: lab }, 'Prod Sales'), span({ style: big() }, $(f.sales))) : null);
  }

  // Multi-store — dollar-weighted rollup (sum $, then % = sum ÷ sum sales; never average the
  // per-store %ages, CLAUDE.md's standing aggregation rule).
  const sum = { sales: 0, comp: 0, raw: 0, cond: 0, emp: 0, statv: 0, unex: 0 };
  for (const r of withFob) { const f = r.components; for (const k of Object.keys(sum)) sum[k] += Number(f[k]) || 0; }
  const fob = sum.comp + sum.raw + sum.cond + sum.emp + sum.statv + sum.unex;
  const fobPct = sum.sales ? fob / sum.sales : null;
  return div({ style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '14px' } },
    div({ style: box }, span({ style: lab }, 'FOB (scope)'), span({ style: big('#f5bc00') }, pct2(fobPct)), span({ style: sub }, $(fob))),
    ...COMPS.map(([key, label]) => div({ key, style: box }, span({ style: lab }, label),
      span({ style: big() }, sum.sales ? pct2(sum[key] / sum.sales) : '—'), span({ style: sub }, $(sum[key])))),
    sum.sales ? div({ style: box }, span({ style: lab }, 'Prod Sales'), span({ style: big() }, $(sum.sales))) : null,
    div({ style: { ...box, minWidth: '70px' } }, span({ style: lab }, 'Stores'), span({ style: big() }, String(withFob.length))));
}

// HTML export for the "🖨 Print" button (2026-08-31, real bug fix — see openPrintWindow's own
// comment in eom-supervisor.js for the full story: toggling body.eom-printing + window.print()
// against the live app DOM reproducibly came back blank for the owner, so these reports print an
// isolated window instead). This report had no Copy button / plain-text export to mirror, so this
// mirrors FobChipsRollup's own math directly (single-store components + vs-target, or a
// dollar-weighted multi-store rollup — never a mean of per-store %ages) rather than duplicating a
// second copy of that logic that could drift from the on-screen version.
function fobRollupHtml(rows, period, monthlyOverrideFor) {
  const $$ = v => (v == null || isNaN(v)) ? '—' : '$' + Math.round(v).toLocaleString();
  const withFob = (rows || []).filter(r => r.components && (r.components.fob != null || r.components.fobPct != null));
  if (!withFob.length) return '';
  if (withFob.length === 1) {
    const r = withFob[0], f = r.components;
    const targets = { ...(DEFAULT_TARGETS[unpad(r.loc)] || {}), ...((monthlyOverrideFor && monthlyOverrideFor(r.loc, period)) || {}) };
    const fobTgt = targets.tFOBTarget != null ? Number(targets.tFOBTarget) : null;
    const deltas = fobComponentDeltas(f, targets);
    const byKey = {}; for (const d of deltas) byKey[d.key] = d;
    let cells = `<b>FOB ${pct2(f.fobPct)}</b> (${$$(f.fob)}${fobTgt != null ? `, tgt ${(fobTgt * 100).toFixed(2)}%` : ''})`;
    for (const [key, label] of COMPS) {
      const d = byKey[key];
      const pct = d && d.pct != null ? pct2(d.pct) : (f.sales ? pct2((f[key] || 0) / f.sales) : '—');
      cells += ` &middot; ${label} ${pct} (${$$(f[key])})`;
    }
    if (f.sales) cells += ` &middot; Prod Sales ${$$(f.sales)}`;
    return `<div class="block">${cells}</div>`;
  }
  const sum = { sales: 0, comp: 0, raw: 0, cond: 0, emp: 0, statv: 0, unex: 0 };
  for (const r of withFob) { const f = r.components; for (const k of Object.keys(sum)) sum[k] += Number(f[k]) || 0; }
  const fob = sum.comp + sum.raw + sum.cond + sum.emp + sum.statv + sum.unex;
  const fobPct = sum.sales ? fob / sum.sales : null;
  let cells = `<b>FOB (scope) ${pct2(fobPct)}</b> (${$$(fob)})`;
  for (const [key, label] of COMPS) cells += ` &middot; ${label} ${sum.sales ? pct2(sum[key] / sum.sales) : '—'} (${$$(sum[key])})`;
  if (sum.sales) cells += ` &middot; Prod Sales ${$$(sum.sales)}`;
  cells += ` &middot; ${withFob.length} stores`;
  return `<div class="block">${cells}</div>`;
}
export function formatTeamSnapshotHtml(rows, { period, scopeLabel, monthlyOverrideFor } = {}) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const list = rows || [];
  let html = `<h1>EOM Team Snapshot — ${esc(scopeLabel || 'all stores')}</h1>`;
  html += `<div class="sub">${esc(period)} · ${list.length} store${list.length === 1 ? '' : 's'}</div>`;
  html += fobRollupHtml(list, period, monthlyOverrideFor);
  if (!list.length) return html + '<p>No stores in the current scope.</p>';
  html += '<table><thead><tr><th>Store</th><th>State</th><th>Count %</th><th>FOB %</th><th>FOB $</th></tr></thead><tbody>';
  for (const r of list) {
    const f = scoreboardRowFields(r);
    html += `<tr><td>${esc(f.store)}</td><td>${esc(f.state)}</td><td>${f.countPct != null ? esc(pct2(f.countPct)) : '—'}</td>`
      + `<td>${f.fobPct != null ? esc(pct2(f.fobPct)) : '—'}</td><td>${f.fobDollar != null ? esc('$' + Math.round(f.fobDollar).toLocaleString()) : '—'}</td></tr>`;
  }
  return html + '</tbody></table>';
}

export function EOMTeamSnapshotPanel({ rows, period, scopeLabel, monthlyOverrideFor }) {
  const doPrint = useCallback(() => {
    openPrintWindow(`EOM Team Snapshot — ${scopeLabel || 'all stores'}`, formatTeamSnapshotHtml(rows, { period, scopeLabel, monthlyOverrideFor }));
  }, [rows, period, scopeLabel, monthlyOverrideFor]);

  const list = rows || [];
  const th = (t) => h('th', { key: t, style: { textAlign: 'left', padding: '6px 10px', borderBottom: '1px solid var(--bdr2)', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text3)', whiteSpace: 'nowrap' } }, t);

  return div({ style: { padding: '16px', maxWidth: '900px', margin: '0 auto' } },

    div({ className: 'eom-no-print' },
      div({ style: { marginBottom: '14px' } },
        div({ style: { fontSize: '11px', fontWeight: 700, letterSpacing: '.1em', textTransform: 'uppercase', color: '#f5bc00', marginBottom: '4px' } }, 'EOM Team Snapshot'),
        div({ style: { fontSize: '20px', fontWeight: 800, color: 'var(--text)' } }, `${scopeLabel || 'all stores'} — ${period}`),
        div({ style: { fontSize: '11px', color: 'var(--text3)', marginTop: '3px' } }, `${list.length} store${list.length === 1 ? '' : 's'} · read-only, for sharing`)),
      div({ style: { display: 'flex', justifyContent: 'flex-end', marginBottom: '4px' } },
        h('button', {
          onClick: doPrint,
          title: 'Print this snapshot to hand or send to a store team.',
          style: { background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.3)', color: '#4ade80', borderRadius: '7px', padding: '6px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
        }, '🖨 Print')),
    ),

    div({ className: 'eom-print-area' },
      div({ className: 'eom-print-title', style: { marginBottom: '10px' } },
        div({ style: { fontSize: '15px', fontWeight: 800, color: '#111' } }, `EOM Team Snapshot — ${scopeLabel || 'all stores'}`),
        div({ style: { fontSize: '11px', color: '#555' } }, `${period} · ${list.length} store${list.length === 1 ? '' : 's'}`)),

      h(FobChipsRollup, { rows: list, period, monthlyOverrideFor }),

      list.length === 0
        ? div({ style: { color: 'var(--text3)', fontSize: '13px', padding: '20px 4px' } }, 'No stores in the current scope.')
        : div({ className: 'eom-block', style: { overflowX: 'auto' } },
            h('table', { style: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '13px' } }, [
              h('thead', { key: 'h' }, h('tr', null, [th('Store'), th('State'), th('Count %'), th('FOB %'), th('FOB $')])),
              h('tbody', { key: 'b' }, list.map(r => {
                const f = scoreboardRowFields(r);
                return h('tr', { key: r.loc, style: { borderBottom: '1px solid var(--bdr)' } }, [
                  h('td', { style: { padding: '6px 10px', fontWeight: 600, color: 'var(--text)' } }, f.store),
                  h('td', { style: { padding: '6px 10px', color: 'var(--text2)' } }, f.state),
                  h('td', { style: { padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text2)' } }, f.countPct != null ? pct2(f.countPct) : '—'),
                  h('td', { style: { padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text2)' } }, f.fobPct != null ? pct2(f.fobPct) : '—'),
                  h('td', { style: { padding: '6px 10px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: 'var(--text2)' } }, f.fobDollar != null ? $(f.fobDollar) : '—'),
                ]);
              })),
            ])),
    ),
  );
}
