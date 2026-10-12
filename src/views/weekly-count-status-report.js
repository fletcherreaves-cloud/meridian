// @ts-nocheck
// ── Weekly Count Status — standalone, printable district roster ────────────────
// Owner req (2026-10-11): "something showing perhaps last full count, regular count day and
// whether the locations completed their count or not... modeled off the data from Count
// Cycle and be in a clean and easy to understand format for dispersal to the teams." Also:
// "cross reference each location's count day of week with what we have in settings... if it
// is obvious it is not a one off, let's... visualize that."
//
// This is a flat, full-roster SIBLING of Count Cycle's own exceptions-first compliance view
// (count-cycle-panel.js, a tab inside Inventory Control) — same underlying engine
// (src/engine/count-cycle.js: cadenceFromOnHand/cycleCompliance/detectWeeklyCountDay/
// countDayDrift), but meant to be opened on its own, printed, and handed to a team rather
// than drilled into for troubleshooting. Linked from Count Cycle's own "🗓 Weekly Count
// Status report" button and from My Reports (report-subscriptions.js).
//
// Self-contained fetch (own loadQsrOnHand calls) rather than reading Inventory Control's
// already-loaded state, because this panel is meant to be opened independently (its own
// route, its own My Reports entry) — the same tradeoff Count Cycle's own retirement from a
// standalone panel (dispatch #189) went the OTHER way on, but for the opposite reason: that
// merge was about not duplicating a troubleshooting job; this is deliberately a separate,
// shareable artifact.
import * as React from 'react';
import { RoutePanelShell } from '../components/ModalShell.js';
import { LocationSelector } from '../components/PanelControls.js';
import { STORE_NAMES, INV_ORG_COORDS, sName, sNameC, supervisorGroups } from '../constants.js';
import { loadQsrOnHand, loadWeeklyCountDayOverrides } from '../lib/supabase.js';
import { cycleCompliance, diffNewWrins, detectWeeklyCountDay,
         mergeWeeklyCountDay, countDayDrift } from '../engine/count-cycle.js';
import { periodKey } from '../engine/eom-inventory.js';
import { printHtml } from '../utils/print-html.js';

const { useState, useEffect, useMemo } = React;
const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const unpad = l => String(l || '').replace(/^0+/, '') || String(l || '');
const WD_FULL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Same tiny helper eom-dashboard.js/store-cockpit.js each already carry their own copy of —
// not worth a shared export for a 10-line date-math utility (see those files' own comments).
function lastPeriods(period, n = 6) {
  const m = /^(\d{4})-(\d{2})$/.exec(period || '');
  if (!m) return period ? [period] : [];
  let y = +m[1], mo = +m[2] - 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(y, mo - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out.reverse();
}

function openPrint(html) { printHtml(html); }
function downloadCsv(text, filename) {
  const blob = new Blob([text], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  a.click(); URL.revokeObjectURL(url);
}
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** One row per store, ready for both the on-screen table and the print/CSV export.
 *  All of a store's compliance facts come from ONE cycleCompliance() row (count-cycle.js) --
 *  the SAME engine Count Cycle's own exceptions view reads, so the two can never disagree. */
function buildRows(locs, { complianceByLoc, mergedDayByLoc, driftByLoc }) {
  return locs.map(loc => {
    const comp = complianceByLoc[loc] || null;
    const day = mergedDayByLoc[loc] || null;
    const drift = driftByLoc[loc] || null;
    const status = !comp || comp.daysSinceWeekly == null ? 'never'
      : comp.overdue ? 'overdue' : 'complete';
    return {
      loc, name: sName(loc) || loc,
      regularDay: day ? day.weekdayName : null,
      regularDaySource: day ? day.source : null,
      drift,
      lastFullCount: comp && comp.lastWeekly ? comp.lastWeekly.date : null,
      daysSinceWeekly: comp ? comp.daysSinceWeekly : null,
      status,
      newItemsCount: comp && comp.newItems ? comp.newItems.length : 0,
      newItems: comp ? comp.newItems : [],
      staleItemsCount: comp && comp.staleItems ? comp.staleItems.length : 0,
      staleItems: comp ? comp.staleItems : [],
    };
  });
}

const STATUS_LABEL = { complete: '✅ Complete', overdue: '⚠ Overdue', never: '— No full weekly yet' };
const STATUS_COLOR = { complete: '#4ade80', overdue: '#f59e0b', never: 'var(--text3)' };

function reportHTML(rows, { scopeLabel, asOf }) {
  const trs = rows.map(r => `<tr>
    <td>${esc(r.name)} <span style="color:#888;font-family:monospace;font-size:10px">#${esc(r.loc)}</span></td>
    <td>${esc(r.regularDay || '—')}${r.drift ? ` <span style="color:#0ea5e9;font-weight:700">⚠ was ${esc(r.drift.configuredWeekdayName)}</span>` : ''}</td>
    <td>${esc(r.lastFullCount || '—')}${r.daysSinceWeekly != null ? ` (${r.daysSinceWeekly}d ago)` : ''}</td>
    <td style="color:${STATUS_COLOR[r.status]};font-weight:700">${esc(STATUS_LABEL[r.status])}</td>
    <td>${r.newItemsCount ? `🆕 ${r.newItemsCount}` : '—'}</td>
    <td>${r.staleItemsCount ? `🧹 ${r.staleItemsCount}` : '—'}</td>
  </tr>`).join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Weekly Count Status — ${esc(scopeLabel)}</title>
  <style>
    body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;margin:24px;color:#1a1a1a}
    h1{font-size:18px;margin:0 0 2px}
    .sub{color:#666;font-size:12px;margin-bottom:16px}
    table{border-collapse:collapse;width:100%;font-size:12px}
    th{text-align:left;padding:6px 10px;background:#f5f5f7;font-size:10px;text-transform:uppercase;letter-spacing:.03em;border-bottom:2px solid #ddd}
    td{padding:6px 10px;border-bottom:1px solid #eee}
    @media print{button{display:none}}
  </style></head><body>
  <h1>🗓 Weekly Count Status — ${esc(scopeLabel)}</h1>
  <div class="sub">As of ${esc(asOf)} · every weekly count requires a full Food and Condiment count · new items are excepted their first period but still need counting · stale pre-period rows are excepted too but need cleanup, not counting</div>
  <table><thead><tr><th>Store</th><th>Regular count day</th><th>Last full count</th><th>This week</th><th>New items</th><th>Stale items</th></tr></thead>
  <tbody>${trs}</tbody></table>
  </body></html>`;
}

function reportCSV(rows) {
  const cols = ['Store', 'Loc', 'Regular count day', 'Day drift (configured)', 'Last full count', 'Days since', 'Status', 'New items pending', 'Stale items (needs cleanup)'];
  const lines = [cols.map(c => `"${c}"`).join(',')];
  for (const r of rows) {
    lines.push([r.name, r.loc, r.regularDay || '', r.drift ? r.drift.configuredWeekdayName : '',
      r.lastFullCount || '', r.daysSinceWeekly ?? '', STATUS_LABEL[r.status].replace(/^[^\w]+/, ''), r.newItemsCount, r.staleItemsCount]
      .map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  }
  return lines.join('\n');
}

export function WeeklyCountStatusPanel({ stores, ds, settings, onClose, initialScope }) {
  // Scope follows the app-wide selector standard (All → State → Patch → Store), same
  // translation visit-readiness.js's own panel uses, so a saved My Reports scope round-trips
  // identically.
  const [locScope, setLocScope] = useState(() => {
    const iv = initialScope || 'all';
    if (iv === 'ok' || iv === 'fl') return { level: 'state', id: iv.toUpperCase() };
    if (String(iv).startsWith('grp:')) return { level: 'patch', id: iv.slice(4) };
    if (iv !== 'all') return { level: 'store', id: iv };
    return { level: 'all', id: null };
  });
  const scope = locScope.level === 'state' ? locScope.id.toLowerCase()
    : locScope.level === 'patch' ? 'grp:' + locScope.id
    : locScope.level === 'store' ? locScope.id : 'all';
  const groups = useMemo(() => { try { return supervisorGroups() || {}; } catch { return {}; } }, []);
  const locs = useMemo(() => {
    if (String(scope).startsWith('grp:')) return (groups[scope.slice(4)] || []).map(l => unpad(l));
    return Object.keys(STORE_NAMES).filter(l =>
      scope === 'all' ? true : scope === 'ok' ? (INV_ORG_COORDS[l] || {}).state === 'OK'
        : scope === 'fl' ? (INV_ORG_COORDS[l] || {}).state === 'FL' : l === scope);
  }, [scope, groups]);
  const scopeLabel = scope === 'all' ? 'All stores' : scope === 'ok' ? 'Oklahoma' : scope === 'fl' ? 'Florida'
    : String(scope).startsWith('grp:') ? ('Patch ' + scope.slice(4)) : (sNameC(scope) || sName(scope));

  // Period selector — which month's on-hand snapshot to view (mirrors Inventory Control's
  // own period dropdown). "This week" status/day-detection always reads the CURRENTLY loaded
  // period's sessions, same as Cadence Monitor's own asOf-anchored design; this is a
  // period-anchored control per panel-contract.md, not a day-count DateRangeControl, since the
  // underlying data is a monthly snapshot, not a trailing-window query.
  const [period, setPeriod] = useState(() => periodKey(new Date()));
  // asOf — the date "days since last count"/overdue math is measured against. Defaults to
  // today; lets a store manager check what the roster would have said on an earlier date.
  const [asOf, setAsOf] = useState(() => new Date().toISOString().slice(0, 10));

  // Trailing periods to load — current + 3 prior (oldest→newest). The new-WRIN diff only
  // needs the immediately-prior one, but detectWeeklyCountDay()'s drift sample needs several
  // (its own doc comment recommends up to 10; countDayDrift's default minSample=3 would never
  // fire off just 2 periods, defeating the owner's "is this a real, sustained change" ask).
  const TREND_PERIODS = 4;
  const [periodRows, setPeriodRows] = useState([]);   // [oldest, ..., current] on-hand row-arrays
  const [overridesByLoc, setOverridesByLoc] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const periods = lastPeriods(period, TREND_PERIODS);
    Promise.all([
      ...periods.map(p => loadQsrOnHand({ period: p }).catch(() => [])),
      loadWeeklyCountDayOverrides().catch(() => ({})),
    ]).then((results) => {
      if (!live) return;
      const ov = results[results.length - 1];
      setPeriodRows(results.slice(0, -1).map(r => r || []));
      setOverridesByLoc(ov || {});
      setLoading(false);
    });
    return () => { live = false; };
  }, [period]);

  const onHand = periodRows.length ? periodRows[periodRows.length - 1] : [];
  const prevOnHand = periodRows.length > 1 ? periodRows[periodRows.length - 2] : [];

  // New-this-period WRINs (owner-directed 2026-10-11) — excluded from the coverage math,
  // surfaced separately. See count-cycle.js's diffNewWrins()/COVER_FRAC comments. Compares
  // only against the IMMEDIATELY prior period, not the whole trend window.
  const newWrinsByLoc = useMemo(() => diffNewWrins(onHand, prevOnHand), [onHand, prevOnHand]);
  const complianceByLoc = useMemo(() => {
    const m = {};
    try { for (const c of cycleCompliance(onHand, { asOf, newWrinsByLoc })) m[c.loc] = c; } catch { /* leave empty */ }
    return m;
  }, [onHand, newWrinsByLoc, asOf]);

  // Count-day drift (owner req, 2026-10-11) — detectWeeklyCountDay() wants several trailing
  // periods for a trustworthy sample (its own doc comment, and countDayDrift's minSample=3
  // would never clear just 2), so this reads the FULL trend window fetched above, not just
  // the single prior period the new-WRIN diff needs.
  const derivedDayByLoc = useMemo(() => detectWeeklyCountDay(periodRows), [periodRows]);
  const fallbackDayByLoc = useMemo(() => {
    const out = {};
    for (const [loc, name] of Object.entries(overridesByLoc)) {
      const wd = WD_FULL.indexOf(String(name || '').trim());
      if (wd >= 0) out[unpad(loc)] = { weekday: wd, weekdayName: WD_FULL[wd] };
    }
    return out;
  }, [overridesByLoc]);
  const mergedDayByLoc = useMemo(() => mergeWeeklyCountDay(derivedDayByLoc, fallbackDayByLoc), [derivedDayByLoc, fallbackDayByLoc]);
  const driftByLoc = useMemo(() => {
    const out = {};
    for (const r of countDayDrift(derivedDayByLoc, overridesByLoc)) out[r.loc] = r;
    return out;
  }, [derivedDayByLoc, overridesByLoc]);

  const rows = useMemo(() => {
    const r = buildRows(locs, { complianceByLoc, mergedDayByLoc, driftByLoc });
    r.sort((a, b) => (a.status === 'overdue' ? 0 : a.status === 'never' ? 1 : 2) - (b.status === 'overdue' ? 0 : b.status === 'never' ? 1 : 2)
      || a.name.localeCompare(b.name));
    return r;
  }, [locs, complianceByLoc, mergedDayByLoc, driftByLoc]);

  const driftCount = Object.keys(driftByLoc).length;
  const nComplete = rows.filter(r => r.status === 'complete').length;
  const nOverdue = rows.filter(r => r.status === 'overdue').length;
  const nNever = rows.filter(r => r.status === 'never').length;

  const doPrint = () => openPrint(reportHTML(rows, { scopeLabel, asOf }));
  const doCsv = () => downloadCsv(reportCSV(rows), `weekly-count-status-${scopeLabel.replace(/\s+/g, '-').toLowerCase()}-${asOf}.csv`);

  return h(RoutePanelShell, {
    icon: '🗓',
    title: 'Weekly Count Status',
    subtitle: 'Last full count, regular count day, and this-week status — per store, for sharing with the team',
    onBack: onClose,
    headerExtra: div({ style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
      h('button', { className: 'btn btn-sm', style: { fontSize: 10 }, onClick: doPrint }, '🖨 Print'),
      h('button', { className: 'btn btn-sm', style: { fontSize: 10 }, onClick: doCsv }, '⬇ CSV')),
  },
    div({ style: { padding: '0 0 10px', borderBottom: '.5px solid var(--bdr)', marginBottom: 12, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' } },
      h(LocationSelector, { stores: Object.keys(STORE_NAMES).map(l => ({ loc: l })), invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, value: locScope, onChange: setLocScope, mode: 'full' }),
      h('input', {
        type: 'date', value: asOf, onChange: e => setAsOf(e.target.value),
        title: 'Check this roster as of an earlier date',
        style: { fontSize: 11, padding: '4px 6px', border: '.5px solid var(--bdr)', borderRadius: 6, background: 'var(--surf2)', color: 'var(--text)' },
      }),
      span({ style: { fontSize: 9.5, color: 'var(--text3)' } }, `${scopeLabel} · ${rows.length} stores`),
      span({ style: { flex: 1 } })),

    loading
      ? div({ style: { padding: 40, textAlign: 'center', color: 'var(--text3)' } }, 'Loading…')
      : div(null,
          div({ style: { display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap', fontSize: 11, color: 'var(--text3)' } },
            span(null, `✅ ${nComplete} complete`), span(null, '·'),
            span(null, `⚠ ${nOverdue} overdue`), span(null, '·'),
            span(null, `— ${nNever} no full weekly yet`),
            driftCount ? span({ style: { color: '#0ea5e9', fontWeight: 700 } }, `· ⚠ ${driftCount} store${driftCount === 1 ? '' : 's'} may have changed their count day — update settings + QSRSoft`) : null),
          div({ style: { overflowX: 'auto' } },
            h('table', { style: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: '12.5px' } },
              h('thead', null, h('tr', { style: { textAlign: 'left', color: 'var(--text3)', fontSize: '10px', textTransform: 'uppercase' } },
                ['Store', 'Regular count day', 'Last full count', 'This week', 'New items', 'Stale items'].map(t =>
                  h('th', { key: t, style: { padding: '4px 10px', borderBottom: '1px solid var(--bdr)', whiteSpace: 'nowrap' } }, t)))),
              h('tbody', null, rows.map(r => h('tr', { key: r.loc, style: { borderBottom: '1px solid var(--bdr)' } },
                h('td', { style: { padding: '6px 10px', fontWeight: 600, color: 'var(--text)' } }, r.name,
                  span({ style: { fontSize: '10px', color: 'var(--text3)', marginLeft: '5px', fontFamily: 'ui-monospace,Menlo,monospace' } }, `#${r.loc}`)),
                h('td', { style: { padding: '6px 10px', color: 'var(--text2)' } },
                  r.regularDay ? `${r.regularDay}s` : '—',
                  r.drift ? span({
                    style: { marginLeft: 6, fontSize: 10, color: '#0ea5e9', fontWeight: 700, cursor: 'help' },
                    title: `Settings/QSRSoft say ${r.drift.configuredWeekdayName}, but the last ${r.drift.sampleSize} qualifying counts mostly landed on ${r.drift.derivedWeekdayName} (${Math.round(r.drift.confidence * 100)}% agreement, last ${r.drift.lastSeenDate}). Looks like a real change, not a one-off — update the setting and QSRSoft to match.`,
                  }, '⚠ changed?') : null),
                h('td', { style: { padding: '6px 10px', color: 'var(--text2)', whiteSpace: 'nowrap' } },
                  r.lastFullCount ? `${r.lastFullCount}${r.daysSinceWeekly != null ? ` · ${r.daysSinceWeekly}d ago` : ''}` : '—'),
                h('td', { style: { padding: '6px 10px' } },
                  span({ style: { color: STATUS_COLOR[r.status], fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' } }, STATUS_LABEL[r.status])),
                h('td', { style: { padding: '6px 10px' } },
                  r.newItemsCount
                    ? span({
                        style: { fontSize: 10.5, color: '#38bdf8', fontWeight: 700, cursor: 'help' },
                        title: r.newItems.map(it => it.descr || it.wrin).join(', '),
                      }, `🆕 ${r.newItemsCount} pending`)
                    : span({ style: { color: 'var(--text3)' } }, '—')),
                h('td', { style: { padding: '6px 10px' } },
                  r.staleItemsCount
                    ? span({
                        style: { fontSize: 10.5, color: '#f59e0b', fontWeight: 700, cursor: 'help' },
                        title: r.staleItems.map(it => it.descr || it.wrin).join(', '),
                      }, `🧹 ${r.staleItemsCount} needs cleanup`)
                    : span({ style: { color: 'var(--text3)' } }, '—')),
              )))))));
}
