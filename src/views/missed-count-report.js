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
import { computeMissedCountItems, missedItemsFromSessions } from '../engine/eom-inventory.js';
import { DIGEST_CLASS_ORDER, DIGEST_CLASS_LABELS } from '../engine/eom-digest.js';
import { groupRowsByLocationThenKey } from './eom-report-grouping.js';
import { openPrintWindow } from './eom-supervisor.js';
import { loadInvCountSessions } from '../lib/supabase.js';

const { useState, useMemo, useCallback, useEffect, useRef } = React;
const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);
const CLASS_FILTER_KEY = 'mf_missed_count_classes';
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
      if (g.note) {
        lines.push([loc.storeName, loc.org === 'emerald' ? 'FL' : 'OK', g.label, '(no session data)', '', '', '', '', g.note, '']
          .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
      }
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
      html += `<div class="grp">${esc(g.label)}</div>`;
      if (g.note) html += `<p style="color:#b45309"><em>${esc(g.note)}</em></p>`;
      if (g.items.length) {
        html += `<table><thead><tr><th>Item</th><th>Last Counted</th><th>Last Submitted</th><th>Expected</th><th>Reason</th><th>$ On Hand</th></tr></thead><tbody>`;
        for (const r of g.items) {
          html += `<tr><td>${esc(r.descr || r.wrin || '—')}${r.wrin ? ` <span class="mono" style="color:#999">(${esc(r.wrin)})</span>` : ''}</td>`
            + `<td>${esc(fmtD(r.lastCounted))}</td><td>${esc(fmtD(r.lastSubmitted))}</td><td>${esc(fmtD(r.expectedDate))}</td>`
            + `<td>${esc(r.reason)}</td><td>${esc(money(r.onHandAmt))}</td></tr>`;
        }
        html += `</tbody></table>`;
      }
    }
    html += `</div>`;
  }
  return html;
}

// Adds note-only groups (no inv_count_sessions row at all, or a legacy row with no item-level
// detail) into the already-grouped real-item structure, including new loc blocks for a store that
// has nothing MISSED but still has a class with no session on file for the picked date — a real
// finding (see missedItemsFromSessions), not nothing to report.
function mergeNotes(grouped, notes) {
  if (!notes.length) return grouped;
  const byLoc = new Map(grouped.map(l => [l.loc, l]));
  for (const n of notes) {
    let locEntry = byLoc.get(n.loc);
    if (!locEntry) { locEntry = { loc: n.loc, storeName: n.storeName, org: n.org, groups: [] }; byLoc.set(n.loc, locEntry); }
    let grp = locEntry.groups.find(g => g.label === n.clsLabel);
    if (!grp) { grp = { label: n.clsLabel, items: [] }; locEntry.groups.push(grp); }
    grp.note = n.kind === 'no-session'
      ? `No count session on file for ${n.clsLabel} on ${fmtD(n.asOf)} — can't confirm what was missed that day.`
      : `A count session is on file for ${n.clsLabel} on ${fmtD(n.asOf)}, but it predates per-item tracking (shipped 2026-11-08) — only the counted/total tally survived, not which items.`;
  }
  const labelOrder = DIGEST_CLASS_ORDER.map(c => DIGEST_CLASS_LABELS[c]);
  const rank = label => { const i = labelOrder.indexOf(label); return i < 0 ? labelOrder.length : i; };
  for (const locEntry of byLoc.values()) locEntry.groups.sort((a, b) => rank(a.label) - rank(b.label));
  const order = grouped.map(l => l.loc);
  for (const loc of byLoc.keys()) if (!order.includes(loc)) order.push(loc);
  return order.map(loc => byLoc.get(loc));
}

export function MissedCountReportModal({ stores, onHand, period, onClose }) {
  const [locValue, setLocValue] = useState({ level: 'all', id: null });
  const [asOfOverride, setAsOfOverride] = useState('');
  // Class filter (print, copy, CSV + the on-screen grouped view) — same shape as FOBEOMPanel's
  // "Class Filter (view & print)" (src/views/fob-eom.js: selClasses/updateSelClasses). Empty Set =
  // no filter (show every class); FOBEOMPanel's own convention, reused so the two panels' class
  // filters behave identically. Persisted to localStorage like FOBEOMPanel does — this is a
  // per-user print preference ("Food only" today probably means "Food only" again tomorrow), and
  // nothing in this file's own history suggests the owner wants it to reset every session.
  const [selClasses, setSelClasses] = useState(() => {
    try { const s = JSON.parse(localStorage.getItem(CLASS_FILTER_KEY) || '[]'); return new Set(Array.isArray(s) ? s : []); } catch { return new Set(); }
  });
  const updateSelClasses = (next) => { setSelClasses(next); try { localStorage.setItem(CLASS_FILTER_KEY, JSON.stringify([...next])); } catch {} };
  const clsAllowed = cls => !selClasses.size || selClasses.has(cls);

  const scope = locValue.level === 'state' ? locValue.id.toLowerCase()
    : locValue.level === 'patch' ? 'grp:' + locValue.id
    : locValue.level === 'store' ? locValue.id : 'all';
  const groups = useMemo(() => { try { return supervisorGroups() || {}; } catch { return {}; } }, []);
  const locs = useMemo(() => {
    // multi (2026-11-02, owner ask -- "multi-select any combination of locations for reporting
    // and viewing") is an explicit loc list straight off locValue, bypassing the scope-string
    // translation entirely -- an arbitrary combination has no single state/patch/store token to
    // encode it as.
    if (locValue.level === 'multi') return (locValue.ids || []).map(l => unpad(l));
    if (String(scope).startsWith('grp:')) return (groups[scope.slice(4)] || []).map(l => unpad(l));
    return Object.keys(STORE_NAMES).filter(l =>
      scope === 'all' ? true : scope === 'ok' ? (INV_ORG_COORDS[l] || {}).state === 'OK'
        : scope === 'fl' ? (INV_ORG_COORDS[l] || {}).state === 'FL' : l === scope);
  }, [scope, groups, locValue]);
  const scopeLabel = locValue.level === 'multi' ? `Custom (${locs.length} store${locs.length === 1 ? '' : 's'})`
    : scope === 'all' ? 'All stores' : scope === 'ok' ? 'Oklahoma' : scope === 'fl' ? 'Florida'
    : String(scope).startsWith('grp:') ? ('Patch ' + scope.slice(4)) : (sName(scope) || scope);

  const byLoc = useMemo(() => groupByLoc(onHand), [onHand]);

  // Historical mode: asOfOverride set to ANY date is "looking backward for trend analysis" (owner,
  // 2026-11-09) — qsr_onhand is rolling-latest (overwritten by every later recount), so re-anchoring
  // IT against a past date only relabels today's state, it can't recover what was actually missed
  // as of that past date. inv_count_sessions freezes that per (loc, count_date, cls) and survives a
  // later recount — see missedItemsFromSessions's own header. Fetched lazily (only once a date is
  // actually picked, never eagerly on mount) — same on-demand discipline as
  // loadSecurityFindingsForSubject, scoped to the picked date's own 'YYYY-MM' period (not
  // necessarily this modal's `period` prop — a past-trend date can land in an earlier month).
  const isHistorical = !!asOfOverride;
  const historicalPeriod = isHistorical ? asOfOverride.slice(0, 7) : null;
  const [sessionRows, setSessionRows] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsErr, setSessionsErr] = useState(null);
  const fetchedPeriodRef = useRef(null);
  useEffect(() => {
    if (!historicalPeriod || fetchedPeriodRef.current === historicalPeriod) return;
    let live = true;
    setSessionsLoading(true); setSessionsErr(null);
    loadInvCountSessions({ period: historicalPeriod }).then(rows => {
      if (!live) return;
      fetchedPeriodRef.current = historicalPeriod;
      setSessionRows(rows || []);
      setSessionsLoading(false);
    }).catch(e => { if (!live) return; setSessionsErr(e && e.message || 'failed to load count sessions'); setSessionsLoading(false); });
    return () => { live = false; };
  }, [historicalPeriod]);

  const { allItems, notes, anchorByLoc } = useMemo(() => {
    const items = [];
    const notesOut = [];
    const anchors = {};
    for (const loc of locs) {
      const storeName = sName(loc) || loc;
      const org = getStoreOrg(loc);
      if (!isHistorical) {
        const { items: locItems, anchor } = computeMissedCountItems(byLoc[loc] || [], { period, asOfOverride: null });
        anchors[loc] = anchor;
        for (const it of locItems) if (clsAllowed(it.cls)) items.push({ ...it, storeName, org, loc, clsLabel: DIGEST_CLASS_LABELS[it.cls] || it.cls });
        continue;
      }
      // Historical: the picked date applies uniformly to every class group (same convention the
      // live path's asOfOverride already had), so the displayed "count date" is just the pick.
      anchors[loc] = { early: asOfOverride, late: asOfOverride };
      if (historicalPeriod !== fetchedPeriodRef.current) continue;   // still loading this period — body shows a loading state, not premature "no session" notes
      const byCls = missedItemsFromSessions(sessionRows, { loc, asOf: asOfOverride });
      for (const cls of DIGEST_CLASS_ORDER) {
        if (!clsAllowed(cls)) continue;
        const clsLabel = DIGEST_CLASS_LABELS[cls];
        const slot = byCls[cls];
        if (!slot) { notesOut.push({ loc, storeName, org, cls, clsLabel, kind: 'no-session', asOf: asOfOverride }); continue; }
        if (slot.legacy && !slot.items.length) { notesOut.push({ loc, storeName, org, cls, clsLabel, kind: 'legacy', asOf: asOfOverride }); continue; }
        for (const it of slot.items) {
          items.push({
            loc, wrin: it.wrin, descr: it.descr, cls, storeName, org, clsLabel,
            lastCounted: null, lastSubmitted: null, actualDate: null, expectedDate: asOfOverride,
            reason: `not counted in the ${asOfOverride} session`, onHandAmt: 0,
          });
        }
      }
    }
    const rank = c => { const i = DIGEST_CLASS_ORDER.indexOf(c); return i < 0 ? DIGEST_CLASS_ORDER.length : i; };
    items.sort((a, b) => a.storeName.localeCompare(b.storeName) || rank(a.cls) - rank(b.cls) || (a.descr || '').localeCompare(b.descr || ''));
    return { allItems: items, notes: notesOut, anchorByLoc: anchors };
  }, [locs, byLoc, period, asOfOverride, isHistorical, historicalPeriod, sessionRows, selClasses]);

  const grouped = useMemo(() => mergeNotes(groupRowsByLocationThenKey(allItems, { key: 'clsLabel' }), notes), [allItems, notes]);

  const doPrint = useCallback(() => {
    openPrintWindow(`Missed on Current Count — ${scopeLabel}`, reportHTML(grouped, { period, scopeLabel, nItems: allItems.length }));
  }, [grouped, period, scopeLabel, allItems.length]);
  const [copied, setCopied] = useState(false);
  const doCsv = () => downloadCsv(reportCSV(grouped, period), `missed-count-${scopeLabel.replace(/\s+/g, '-').toLowerCase()}-${period}.csv`);

  const headerRow = div({ style: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 10 } },
    h(LocationSelector, { stores: Object.keys(STORE_NAMES).map(l => ({ loc: l })), invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, value: locValue, onChange: setLocValue, mode: 'full', variant: 'dropdown', multi: true }),
    div({ style: { display: 'flex', alignItems: 'center', gap: 6 } },
      span({ style: { fontSize: 10.5, color: 'var(--text3)' } }, 'Force count date:'),
      h('input', {
        type: 'date', value: asOfOverride, onChange: e => setAsOfOverride(e.target.value),
        title: 'Leave blank for today\'s live count state (auto-detects each store\'s own count date). Pick a past date to see the SNAPSHOT as of that day — sourced from the frozen count-session record, not today\'s current counts, so a later recount can\'t hide what that day actually missed.',
        style: { fontSize: 11, padding: '4px 6px', border: '.5px solid var(--bdr)', borderRadius: 6, background: 'var(--surf2)', color: 'var(--text)' },
      }),
      asOfOverride && h('button', { onClick: () => setAsOfOverride(''), style: { fontSize: 10, color: 'var(--text3)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' } }, 'clear')),
    span({ style: { fontSize: 9.5, color: 'var(--text3)' } },
      `${scopeLabel} · ${period} · ${allItems.length} item${allItems.length === 1 ? '' : 's'} missed`
      + (notes.length ? ` · ${notes.length} class${notes.length === 1 ? '' : 'es'} w/ no session data` : '')),
    span({ style: { flex: 1 } }),
    h('button', { className: 'btn btn-sm', style: { fontSize: 10 }, onClick: doPrint }, '🖨 Print'),
    h('button', {
      onClick: async () => { try { await navigator.clipboard.writeText(reportHTML(grouped, { period, scopeLabel, nItems: allItems.length }).replace(/<[^>]+>/g, s => /^<\/?(tr|table|div|br)/i.test(s) ? '\n' : '')); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch {} },
      className: 'btn btn-sm', style: { fontSize: 10 },
    }, copied ? '✓ Copied' : '📋 Copy'),
    h('button', { className: 'btn btn-sm', style: { fontSize: 10 }, onClick: doCsv }, '⬇ CSV'));

  const classFilterRow = div({ style: { display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 } },
    span({ style: { fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--text3)', marginRight: 4, whiteSpace: 'nowrap' } }, 'Class Filter (view & print):'),
    btn({
      onClick: () => updateSelClasses(new Set()),
      style: { padding: '2px 9px', borderRadius: 20, fontSize: 9, cursor: 'pointer', whiteSpace: 'nowrap',
        background: !selClasses.size ? 'rgba(245,188,0,.18)' : 'transparent', color: !selClasses.size ? 'var(--amber)' : 'var(--text3)',
        border: !selClasses.size ? '1px solid rgba(245,188,0,.4)' : '.5px solid var(--bdr)', fontWeight: !selClasses.size ? 700 : 400 },
    }, `All (${DIGEST_CLASS_ORDER.length})`),
    ...DIGEST_CLASS_ORDER.map(cls => {
      const active = selClasses.has(cls);
      return btn({
        key: cls, onClick: () => updateSelClasses((prev => { const n = new Set(prev); active ? n.delete(cls) : n.add(cls); return n; })(selClasses)),
        style: { padding: '2px 9px', borderRadius: 20, fontSize: 9, cursor: 'pointer', whiteSpace: 'nowrap',
          background: active ? 'rgba(96,165,250,.15)' : 'transparent', color: active ? 'var(--accent)' : 'var(--text3)',
          border: active ? '1px solid rgba(96,165,250,.4)' : '.5px solid var(--bdr)', fontWeight: active ? 700 : 400 },
      }, DIGEST_CLASS_LABELS[cls]);
    }));

  const explainer = div({ style: { fontSize: '11.5px', color: 'var(--text3)', marginBottom: 10 } },
    isHistorical
      ? `Showing the SNAPSHOT as of ${fmtD(asOfOverride)} — sourced from that date's own frozen count-session record (inv_count_sessions), not today's current on-hand counts, so a later recount can't erase what this date actually missed. A class with no session on file for this exact date says so plainly below rather than guessing. Confirmed-deactivated items are excluded.`
      : 'An item is flagged when its own last-counted / last-submitted date doesn\'t match the exact day this store\'s current count happened — stricter than the Missing Items tab\'s window-based check. Food/Condiment/Paper anchor to the store\'s own bulk-count day; Non-Product anchors to the period\'s last day (when it\'s due). Confirmed-deactivated items are excluded.');

  const th = (t) => h('th', { key: t, style: { textAlign: 'left', padding: '5px 8px', borderBottom: '1px solid var(--bdr2)', fontSize: '10.5px', textTransform: 'uppercase', color: 'var(--text3)', whiteSpace: 'nowrap' } }, t);
  const td = (content, extra) => h('td', { style: { padding: '5px 8px', verticalAlign: 'top', ...(extra || {}) } }, content);

  const body = (isHistorical && sessionsLoading) ? div({ style: { color: 'var(--text3)', fontSize: '13px', padding: '20px 4px', textAlign: 'center' } }, `Loading count sessions for ${fmtD(asOfOverride)}…`)
    : (isHistorical && sessionsErr) ? div({ style: { color: '#fb923c', fontSize: '13px', padding: '20px 4px', textAlign: 'center' } }, `Couldn't load count sessions: ${sessionsErr}`)
    : !grouped.length
    ? div({ style: { color: 'var(--text3)', fontSize: '13px', padding: '20px 4px', textAlign: 'center' } }, 'Nothing missed in the current scope — every item lines up with its store\'s current count date. ✓')
    : div({ style: { overflowX: 'auto' } }, ...grouped.map(loc => {
        const a = anchorByLoc[loc.loc] || {};
        return div({ key: loc.loc, style: { marginBottom: '16px' } },
          div({ style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' } },
            span({ style: { fontWeight: 700, color: 'var(--text)', fontSize: '13px' } }, loc.storeName),
            span({ style: { fontSize: '10px', color: loc.org === 'emerald' ? '#38bdf8' : '#f5bc00' } }, loc.org === 'emerald' ? 'FL' : 'OK'),
            span({ style: { fontSize: '10px', color: 'var(--text3)' } }, isHistorical ? `as of: ${fmtD(a.early)}` : `this store's count date: ${fmtD(a.early)}${a.late && a.late !== a.early ? ` (Non-Product ${fmtD(a.late)})` : ''}`)),
          ...loc.groups.map((g, gi) => div({ key: gi, style: { marginBottom: '8px' } },
            div({ style: { fontSize: '11.5px', fontWeight: 600, color: 'var(--text2)', marginBottom: '3px' } }, g.label),
            g.note && div({ style: { fontSize: '11px', color: '#b45309', marginBottom: '4px', fontStyle: 'italic' } }, g.note),
            g.items.length > 0 && h('table', { style: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '12.5px' } }, [
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
    headerRow, classFilterRow, explainer, body);
}
