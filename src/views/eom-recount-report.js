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
//
// 2026-08-31 (owner request) — location scope is already provided by the shared EOMDashboardPanel
// chrome (LocationSelector, all → state → patch → store), confirmed still doing its job; this
// added a "📋 Copy" button and grouped items by RESULT (verdictText) within each location (was a
// flat table repeating a similar helped/hurt sentence once per row). groupRowsByLocationThenKey()
// is shared with eom-missing-items-report.js so the two reports can't grow two different groupings
// of the same idea.
//
// 2026-10-03 (owner req, verbatim: "determine which locations performed any recounts for weekly
// and eom inventory... simple recounts performed or not... whether the recount helped or hurt...
// FOB at time of original count and then after recount occurred and assign a dollar and percent
// to it") — three additions, all presentation-only over data eom-dashboard.js already computes:
//   1. `locationSummary` prop (recountLocationSummary, eom-dashboard.js) — every in-scope store,
//      including ones with ZERO recounts this period, which the item list below can never show
//      (it only ever lists stores that HAD a recount).
//   2. `basePct`/`curPct`/`dPct` on each row (recountImpactRows, eom-dashboard.js — baseVar/curVar/
//      dMag divided by that store's period sales, already loaded) — moneyPct() combines $ and %
//      in one cell rather than doubling the column count.
//   3. `mode`/`onModeChange` props — EOM (default, the last 3 calendar days of the month) vs.
//      Weekly (autoWindowDays clustering, the SAME recount-detection already proven live on the
//      At-A-Glance "Items Recounted" tile) — owner: "EOM actually matters, weekly would be nice
//      but needs to begin mattering as well," so EOM stays primary and Weekly is a real toggle,
//      not a separate report.
import * as React from 'react';
import { DIGEST_CLASS_LABELS } from '../engine/eom-digest.js';
import { crossStoreConsistencyText } from '../engine/eom-ledger-baseline.js';
import { openPrintWindow } from './eom-supervisor.js';
import { groupRowsByLocationThenKey } from './eom-report-grouping.js';

const { useState, useCallback } = React;
const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const money = v => (v == null || isNaN(v)) ? '—' : '$' + Number(v).toLocaleString(undefined, { maximumFractionDigits: 0 });
const pct = v => (v == null || isNaN(v)) ? null : (v * 100).toFixed(2) + '%';
// Dollar AND percent in one cell (owner req, 2026-10-02: "assign a dollar and percent to it") --
// combined rather than doubling the column count, which would crowd a table already showing
// Baseline/Post-Recount/Delta per item.
const moneyPct = (v, p) => { const m = money(v); const pc = pct(p); return pc ? `${m} (${pc})` : m; };

const VERDICT_COLOR = { helping: '#4ade80', hurting: 'var(--crit)', flat: 'var(--text3)', unknown: 'var(--text3)' };

// Plain-text export (the "📋 Copy" button) — a pure function of the SAME grouped structure the
// screen renders, so copied text can't disagree with what's on screen.
export function formatRecountImpactText(rows, crossStore, { period, scopeLabel, locationSummary, mode } = {}) {
  const list = rows || [];
  const nHelped = list.filter(r => r.verdict === 'helping').length;
  const nHurt = list.filter(r => r.verdict === 'hurting').length;
  const windowLabel = mode === 'weekly' ? 'Weekly (any recent recount)' : 'EOM close window (last 3 days)';
  const lines = [];
  lines.push(`Recount-Impact Report — ${scopeLabel || 'all stores'} — ${period}`);
  lines.push(`${list.length} recounted item${list.length === 1 ? '' : 's'} · ${nHelped} helped · ${nHurt} hurt · ${windowLabel}`);
  if (locationSummary && locationSummary.length) {
    const nDid = locationSummary.filter(s => s.recounted).length;
    lines.push('', `Locations — ${nDid} of ${locationSummary.length} recounted something this period:`);
    for (const s of locationSummary) {
      lines.push(s.recounted
        ? `  ✓ ${s.storeName} — ${s.nItems} item${s.nItems === 1 ? '' : 's'} (${s.nHelped} helped ${money(s.helpedDol)}, ${s.nHurt} hurt ${money(s.hurtDol)}, net ${money(s.netDol)})`
        : `  — ${s.storeName} — no recounts this period`);
    }
  }
  if (crossStore && crossStore.length) {
    lines.push('', `⚠ Cross-Store Inconsistency — ${crossStore.length} item${crossStore.length === 1 ? '' : 's'}`);
    for (const x of crossStore) {
      lines.push(`  ${x.descr || x.wrin} — ${x.nStores} stores, ${x.nHelped} helped (${money(x.helpedDol)}), ${x.nHurt} hurt (${money(x.hurtDol)})`);
      for (const s of x.stores) lines.push(`    - ${s.storeName}: ${money(s.baseVar)} → ${money(s.curVar)} (${s.verdict})`);
    }
  }
  if (!list.length) { lines.push('', 'No recounted items in this close window for the current scope.'); return lines.join('\n'); }
  const byLoc = groupRowsByLocationThenKey(list, { key: 'verdictText' });
  for (const loc of byLoc) {
    lines.push('', `${loc.storeName} (${loc.org === 'emerald' ? 'FL' : 'OK'})`);
    for (const g of loc.groups) {
      lines.push(`  ${g.label}`);
      for (const it of g.items) {
        lines.push(`    - ${it.descr || it.wrin} (${DIGEST_CLASS_LABELS[it.cls] || it.cls}, ${moneyPct(it.baseVar, it.basePct)} → ${moneyPct(it.curVar, it.curPct)})`);
      }
    }
  }
  return lines.join('\n');
}

// HTML export for the "🖨 Print" button (2026-08-31, real bug fix) — a pure function of the SAME
// grouped structure formatRecountImpactText() and the on-screen render use, so it can't disagree
// with either. Handed to openPrintWindow() (eom-supervisor.js), which opens a FRESH, isolated
// window with plain static CSS and prints THAT instead of the live app — see openPrintWindow's own
// comment for why: toggling body.eom-printing + window.print() against the live interactive DOM
// reproducibly came back blank for the owner (single store AND all-locations both), and a real
// investigation (Chromium reproduction at realistic scale, a CSS-custom-property-cascade
// benchmark) found no structural bug and no measurable cost, so this sidesteps the mechanism
// instead of chasing an unproven cause further.
export function formatRecountImpactHtml(rows, crossStore, { period, scopeLabel, locationSummary, mode } = {}) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const list = rows || [];
  const nHelped = list.filter(r => r.verdict === 'helping').length;
  const nHurt = list.filter(r => r.verdict === 'hurting').length;
  const windowLabel = mode === 'weekly' ? 'Weekly (any recent recount)' : 'EOM close window (last 3 days)';
  let html = `<h1>Recount-Impact Report — ${esc(scopeLabel || 'all stores')}</h1>`;
  html += `<div class="sub">${esc(period)} · ${list.length} recounted item${list.length === 1 ? '' : 's'} · ${nHelped} helped · ${nHurt} hurt · ${esc(windowLabel)}</div>`;
  if (locationSummary && locationSummary.length) {
    const nDid = locationSummary.filter(s => s.recounted).length;
    html += `<div class="block"><div class="grp">Locations — ${nDid} of ${locationSummary.length} recounted something this period</div>`
      + `<table><thead><tr><th>Store</th><th>Recounted?</th><th>Items</th><th>Helped</th><th>Hurt</th><th>Net</th></tr></thead><tbody>`
      + locationSummary.map(s => `<tr><td>${esc(s.storeName)}</td><td>${s.recounted ? '✓ Yes' : '— No'}</td>`
        + `<td>${s.nItems || '—'}</td><td>${s.nHelped ? esc(money(s.helpedDol)) : '—'}</td><td>${s.nHurt ? esc(money(s.hurtDol)) : '—'}</td>`
        + `<td class="${s.netDol > 0 ? 'g' : s.netDol < 0 ? 'r' : ''}">${s.recounted ? esc(money(s.netDol)) : '—'}</td></tr>`).join('')
      + `</tbody></table></div>`;
  }
  if (crossStore && crossStore.length) {
    html += `<div class="block"><div class="grp">⚠ Cross-Store Inconsistency — ${crossStore.length} item${crossStore.length === 1 ? '' : 's'}</div>`;
    for (const x of crossStore) {
      html += `<div style="margin-bottom:8px"><b>${esc(x.descr || x.wrin)}</b> — ${x.nStores} stores, ${x.nHelped} helped (${esc(money(x.helpedDol))}), ${x.nHurt} hurt (${esc(money(x.hurtDol))})<br>`
        + x.stores.map(s => `${esc(s.storeName)}: ${esc(money(s.baseVar))} → ${esc(money(s.curVar))} (${esc(s.verdict)})`).join(' &middot; ')
        + `</div>`;
    }
    html += `</div>`;
  }
  if (!list.length) return html + '<p>No recounted items in this close window for the current scope.</p>';
  const byLoc = groupRowsByLocationThenKey(list, { key: 'verdictText' });
  for (const loc of byLoc) {
    html += `<div class="block"><div class="loc-hdr">${esc(loc.storeName)} (${loc.org === 'emerald' ? 'FL' : 'OK'})</div>`;
    for (const g of loc.groups) {
      html += `<div class="grp">${esc(g.label)}</div><table><thead><tr><th>Item</th><th>Class</th><th># Recounted</th><th>Baseline ($ / %)</th><th>Post-Recount ($ / %)</th><th>&Delta;</th></tr></thead><tbody>`;
      for (const r of g.items) {
        html += `<tr><td>${esc(r.descr || r.wrin || '—')}${r.wrin ? ` <span class="mono" style="color:#999">(${esc(r.wrin)})</span>` : ''}</td>`
          + `<td>${esc(DIGEST_CLASS_LABELS[r.cls] || r.cls || '—')}</td>`
          + `<td>${r.nRecounts != null ? `&#8635; ${r.nRecounts}` : '—'}</td>`
          + `<td>${r.baseVar != null ? esc(moneyPct(r.baseVar, r.basePct)) : '—'}</td>`
          + `<td>${r.curVar != null ? esc(moneyPct(r.curVar, r.curPct)) : '—'}</td>`
          + `<td class="${r.dMag > 0 ? 'g' : (r.verdict === 'hurting' ? 'r' : '')}">${r.dMag != null ? `${r.dMag > 0 ? '+' : ''}${esc(moneyPct(r.dMag, r.dPct))}` : '—'}</td></tr>`;
      }
      html += `</tbody></table>`;
    }
    html += `</div>`;
  }
  return html;
}

export function EOMRecountImpactPanel({ rows, crossStore, period, scopeLabel, locationSummary, mode = 'eom', onModeChange }) {
  const windowLabel = mode === 'weekly' ? 'Weekly (any recent recount)' : 'EOM close window (last 3 days)';
  const doPrint = useCallback(() => {
    openPrintWindow(`Recount-Impact Report — ${scopeLabel || 'all stores'}`, formatRecountImpactHtml(rows, crossStore, { period, scopeLabel, locationSummary, mode }));
  }, [rows, crossStore, period, scopeLabel, locationSummary, mode]);
  const [copied, setCopied] = useState(false);
  const doCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatRecountImpactText(rows, crossStore, { period, scopeLabel, locationSummary, mode }));
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard permission denied — silently a no-op, matches other panels' best-effort copy */ }
  }, [rows, crossStore, period, scopeLabel, locationSummary, mode]);

  const list = rows || [];
  const nHelped = list.filter(r => r.verdict === 'helping').length;
  const nHurt = list.filter(r => r.verdict === 'hurting').length;
  const grouped = React.useMemo(() => groupRowsByLocationThenKey(list, { key: 'verdictText' }), [list]);
  const locs = locationSummary || [];
  const nLocRecounted = locs.filter(s => s.recounted).length;

  // Fixed column widths (owner req, 2026-08-31: "need to align column headers and data please") —
  // each location/verdict group renders its OWN <table> (so the "Helped: corrected a $X…" label can
  // sit directly above just that group's rows), and under the default table-layout:auto every one of
  // those tables sizes its columns independently off its OWN longest cell content. A short item name
  // in one group and a long one in the next then push the SAME column to two different x-positions,
  // so the report reads as misaligned even though each table is internally consistent. table-layout:
  // fixed + a shared <colgroup> pins the 5 non-Item columns to the same width in every group's table;
  // Item is left un-pinned (gets whatever's left) since it's the one column whose natural length
  // varies most and shouldn't be truncated.
  const COL_W = { cls: '70px', recounted: '96px', baseline: '126px', post: '132px', delta: '126px' };
  const colgroup = () => h('colgroup', null,
    h('col', { key: 'item' }),
    h('col', { key: 'cls', style: { width: COL_W.cls } }),
    h('col', { key: 'recounted', style: { width: COL_W.recounted } }),
    h('col', { key: 'baseline', style: { width: COL_W.baseline } }),
    h('col', { key: 'post', style: { width: COL_W.post } }),
    h('col', { key: 'delta', style: { width: COL_W.delta } }));
  const th = (t) => h('th', { key: t, style: { textAlign: 'left', padding: '5px 8px', borderBottom: '1px solid var(--bdr2)', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, t);
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
          ` · ${windowLabel}`)),
      div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' } },
        // EOM is the primary/default view (owner-stated 2026-10-03); Weekly reuses the same
        // autoWindowDays recount-clustering already proven on the At-A-Glance tile, so weekly
        // coverage exists here as a real option rather than a separate, narrower surface.
        onModeChange
          ? div({ style: { display: 'flex', gap: '4px', background: 'var(--surf3)', borderRadius: '8px', padding: '3px' } },
              ['eom', 'weekly'].map(m => h('button', {
                key: m,
                onClick: () => onModeChange(m),
                title: m === 'eom' ? 'Last 3 calendar days of the month — the primary EOM view' : 'Any recent recount, not just month-end (same detection as the At-A-Glance tile)',
                style: { background: mode === m ? '#f5bc00' : 'transparent', color: mode === m ? '#111' : 'var(--text2)', border: 'none', borderRadius: '6px', padding: '5px 12px', cursor: 'pointer', fontSize: '11.5px', fontWeight: 700 },
              }, m === 'eom' ? 'EOM' : 'Weekly')))
          : div(),
        div({ style: { display: 'flex', gap: '8px' } },
          h('button', {
            onClick: doCopy,
            title: 'Copy this report as text — grouped by location, then by result.',
            style: { background: 'var(--surf3)', border: '1px solid var(--bdr2)', color: 'var(--text2)', borderRadius: '7px', padding: '6px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
          }, copied ? '✓ Copied' : '📋 Copy'),
          h('button', {
            onClick: doPrint,
            title: 'Print this report — every item recounted in the window, sorted by class.',
            style: { background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.3)', color: '#4ade80', borderRadius: '7px', padding: '6px 14px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 },
          }, '🖨 Print'))),
    ),

    div({ className: 'eom-print-area' },
      div({ className: 'eom-print-title', style: { marginBottom: '10px' } },
        div({ style: { fontSize: '15px', fontWeight: 800, color: '#111' } }, `Recount-Impact Report — ${scopeLabel || 'all stores'}`),
        div({ style: { fontSize: '11px', color: '#555' } }, `${period} · ${list.length} recounted item${list.length === 1 ? '' : 's'} · ${nHelped} helped · ${nHurt} hurt`)),

      // Location summary (owner req, 2026-10-02: "determine which locations performed any
      // recounts... simple recounts performed or not") — every in-scope store, including ones
      // with ZERO recounted items this period (recountLocationSummary, eom-dashboard.js), which
      // the item table below can never show since it only ever lists stores WITH a recount.
      locs.length > 0
        ? div({ className: 'eom-block eom-recount-location-summary', style: { marginBottom: '16px', overflowX: 'auto' } },
            div({ style: { fontSize: '11px', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#f5bc00', marginBottom: '8px' } },
              `Locations — ${nLocRecounted} of ${locs.length} recounted something this period`),
            h('table', { style: { width: '100%', minWidth: '520px', borderCollapse: 'collapse', fontSize: '12.5px' } },
              h('thead', null, h('tr', null, [th('Store'), th('Recounted?'), th('Items'), th('Helped'), th('Hurt'), th('Net')])),
              h('tbody', null, locs.map((s, i) => h('tr', { key: i, style: { borderBottom: '1px solid var(--bdr)' } },
                h('td', { style: { padding: '5px 8px', color: 'var(--text)' } }, s.storeName),
                h('td', { style: { padding: '5px 8px', color: s.recounted ? '#4ade80' : 'var(--text3)', fontWeight: s.recounted ? 700 : 400 } }, s.recounted ? '✓ Yes' : '— No'),
                tdR(s.nItems || '—'),
                tdR(s.nHelped ? money(s.helpedDol) : '—'),
                tdR(s.nHurt ? money(s.hurtDol) : '—'),
                tdR(s.recounted ? h('span', { style: { fontWeight: 700, color: s.netDol > 0 ? '#4ade80' : s.netDol < 0 ? 'var(--crit)' : 'var(--text2)' } }, money(s.netDol)) : '—'))))))
        : null,

      // Cross-store consistency (2026-08-31) — the SAME item recounted at multiple stores this period
      // with SOME recounts helping and OTHERS hurting: a crew-technique/UOM gap at specific stores, not
      // independent noise. See crossStoreRecountConsistency()'s own header comment for the real example
      // (Chicken McNuggets, July) that motivated this. Quiet when nothing qualifies — most periods won't.
      (crossStore && crossStore.length > 0)
        ? div({ className: 'eom-block', style: { marginBottom: '16px' } },
            div({ style: { fontSize: '11px', fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: '#f5bc00', marginBottom: '8px' } },
              `⚠ Cross-Store Inconsistency — ${crossStore.length} item${crossStore.length === 1 ? '' : 's'}`),
            ...crossStore.map(x => div({ key: x.wrin, style: { border: '1px solid var(--bdr)', borderLeft: '3px solid #f5bc00', borderRadius: '7px', padding: '10px 12px', marginBottom: '8px', background: 'var(--surf2)' } },
              div({ style: { display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' } },
                span({ style: { fontWeight: 700, color: 'var(--text)' } }, x.descr || x.wrin),
                span({ style: { fontSize: '10px', color: 'var(--text3)', fontFamily: 'ui-monospace,Menlo,monospace' } }, x.wrin),
                span({ style: { fontSize: '11px', color: 'var(--text3)' } }, `${x.nStores} stores`),
                span({ style: { fontSize: '11px', color: '#4ade80', fontWeight: 600 } }, `${x.nHelped} helped (${money(x.helpedDol)})`),
                span({ style: { fontSize: '11px', color: 'var(--crit)', fontWeight: 600 } }, `${x.nHurt} hurt (${money(x.hurtDol)})`)),
              div({ style: { fontSize: '11.5px', color: 'var(--text2)', marginBottom: '6px' } }, crossStoreConsistencyText(x)),
              div({ style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
                ...x.stores.map((s, i) => span({ key: i, style: { fontSize: '11px', padding: '3px 8px', borderRadius: '5px', background: 'var(--surf3)', color: VERDICT_COLOR[s.verdict] || 'var(--text2)', fontWeight: 600 } },
                  `${s.storeName}: ${money(s.baseVar)} → ${money(s.curVar)}`))))))
        : null,

      list.length === 0
        ? div({ style: { color: 'var(--text3)', fontSize: '13px', padding: '20px 4px' } }, `No recounted items in this ${mode === 'weekly' ? 'window' : 'close window'} for the current scope — either nothing was recounted, or the raw item-detail pull has not landed for these stores/period yet.`)
        : div(null, ...grouped.map(loc => div({ key: loc.loc, className: 'eom-block', style: { marginBottom: '16px', overflowX: 'auto' } },
            div({ style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px' } },
              span({ style: { fontWeight: 700, color: 'var(--text)', fontSize: '13px' } }, loc.storeName),
              span({ style: { fontSize: '10px', color: loc.org === 'emerald' ? '#38bdf8' : '#f5bc00' } }, loc.org === 'emerald' ? 'FL' : 'OK')),
            ...loc.groups.map((g, gi) => div({ key: gi, style: { marginBottom: '8px' } },
              div({ style: { fontSize: '11.5px', fontWeight: 600, color: VERDICT_COLOR[g.items[0]?.verdict] || 'var(--text2)', marginBottom: '3px' } }, g.label),
              h('table', { style: { width: '100%', minWidth: '720px', tableLayout: 'fixed', borderCollapse: 'collapse', fontSize: '12.5px' } }, [
                colgroup(),
                h('thead', { key: 'h' }, h('tr', null, [th('Item'), th('Class'), th('# Recounted'), th('Baseline ($ / %)'), th('Post-Recount ($ / %)'), th('Δ')])),
                h('tbody', { key: 'b' }, g.items.map((r, i) => h('tr', { key: i, style: { borderBottom: '1px solid var(--bdr)' } }, [
                  h('td', { style: { padding: '5px 8px', overflow: 'hidden' } },
                    div({ style: { color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, r.descr || r.wrin || '—'),
                    r.wrin ? span({ style: { fontSize: '10px', color: 'var(--text3)', fontFamily: 'ui-monospace,Menlo,monospace' } }, r.wrin) : null),
                  h('td', { style: { padding: '5px 8px', color: 'var(--text2)' } }, DIGEST_CLASS_LABELS[r.cls] || r.cls || '—'),
                  tdR(r.nRecounts != null ? `↻ ${r.nRecounts}` : '—'),
                  tdR(r.baseVar != null ? moneyPct(r.baseVar, r.basePct) : '—'),
                  tdR(r.curVar != null ? moneyPct(r.curVar, r.curPct) : '—'),
                  tdR(r.dMag != null ? h('span', { style: { fontWeight: 700, color: VERDICT_COLOR[r.verdict] } }, `${r.dMag > 0 ? '+' : ''}${moneyPct(r.dMag, r.dPct)}`) : '—'),
                ]))),
              ])))),
          )),
    ),
  );
}
