// @ts-nocheck
// ── Time Punches (dispatch #138) ──────────────────────────────────────────────────────────────
// "where do i find the time punches" (owner, 2026-08-25) -- qsr_punch_times (dispatch #124's
// automated pull, un-tokenized by dispatch #126) had ZERO files under src/views referencing it
// before this panel. Built as a companion to src/views/crew-schedule-panel.js (dispatch #123/
// #125's template, per this dispatch's own instruction) -- same RoutePanelShell/
// DateRangeControl/LocationSelector shape, same un-tokenized-name convention (names render
// directly, no reveal-click step), same ordinary panel RBAC (see panel-registry.js's
// 'time-punches' entry for the full reasoning).
//
// MEAL-PAIRING SHAPE -- determined from real rows via a live service-role read, not assumed
// (the dispatch's own instruction). Querying every punch for geid 200165491 @ loc 0024471
// (2026-08-25) across a 3-week window showed, for every business day that person worked: exactly
// one 'shift' row spanning the whole shift (e.g. 2026-05-27T15:00:00Z - 23:02:00Z) and exactly
// one 'meal' row whose start/end falls STRICTLY INSIDE that shift's [start,end] window
// (2026-05-27T20:22:00Z - 20:54:00Z). So pairPunchesByShift below nests a meal under the shift
// punch (same geid) whose window contains the meal's start time, as an indented sub-row -- never
// a sibling in the same list. A meal with no enclosing shift row in the fetched window (data gap)
// falls back to its own "Unmatched" entry rather than being silently dropped or misattributed.
//
// BUSINESS-DAY BUCKETING -- qsr_punch_times has no derived `dt` column (schema header: boundary
// NOT confirmed -- the punch endpoint takes no compType param). Bucketing here calls the ONE
// shared businessDate() helper (src/utils/date.js) on each punch's own start timestamp, per
// CLAUDE.md's standing rule ("never re-derive the cutover inline") -- this deliberately does NOT
// assume start_date_time's calendar date is the business day.
//
// RBAC: no client-side permission gate here, same as Crew Schedule Lookup -- src/app/App.js's
// onOpenModal already checks perm('analytics.store') before this panel can ever mount, backstopped
// by qsr_punch_times' own accessible_locs RLS (supabase/schema-qsr-punch-times.sql). No
// reveal-click/token step for names -- this data class is un-tokenized by explicit owner
// directive (dispatch #125/#126), same as Crew Schedule Lookup.
import * as React from 'react';
import { RoutePanelShell } from '../components/ModalShell.js';
import { DateRangeControl, LocationSelector, buildLocationHierarchy, locationSelectorLocs, resolveDatePreset } from '../components/PanelControls.js';
import { loadPunchTimes } from '../lib/supabase.js';
import { INV_ORG_COORDS, STORE_NAMES } from '../constants.js';
import { businessDate } from '../utils/date.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const inp = (p, ...c) => h('input', p, ...c);

const EMPTY_STORES = [];

// ── Pure logic — exported and tested independently of any rendering ─────────────────────────────

// A short, stable display key for a punch with no resolved name: last 5 chars of geid, same
// "short-id fallback, never a raw guess" spirit as Crew Schedule Lookup's shortEmployeeId().
export function shortEmployeeId(geid) {
  const s = String(geid || '');
  return s ? 'Employee #' + s.slice(-5) : 'Unknown';
}

// The business day a punch belongs to, via the one shared cutover helper applied to the punch's
// own start timestamp — see file header. Returns null for a missing/invalid timestamp rather
// than guessing.
export function punchBusinessDay(punch) {
  const t = punch?.startDateTime;
  if (!t) return null;
  const d = new Date(t);
  if (isNaN(d.getTime())) return null;
  return businessDate(d);
}

// A stable render key for a punch row — the table has no punch id (schema's own documented
// limitation), so this mirrors its natural key: loc+geid+punchType+startDateTime.
export function punchKey(p) {
  return [p?.loc, p?.geid, p?.punchType, p?.startDateTime].join('|');
}

// rows (loadPunchTimes' shape) -> { shifts, unmatchedMeals }. Nests each 'meal' punch under the
// 'shift' punch (same geid) whose [start,end] window contains the meal's start time — see file
// header for how this pairing rule was determined from real data. A meal with no enclosing shift
// in the given rows is returned separately, never dropped.
export function pairPunchesByShift(rows) {
  const shifts = (rows || [])
    .filter(r => r.punchType === 'shift')
    .map(s => ({ ...s, meals: [] }))
    .sort((a, b) => String(a.startDateTime).localeCompare(String(b.startDateTime)));
  const unmatched = [];
  for (const m of (rows || []).filter(r => r.punchType !== 'shift')) {
    const host = shifts.find(s =>
      s.geid === m.geid &&
      String(s.startDateTime) <= String(m.startDateTime) &&
      (!s.endDateTime || String(m.startDateTime) <= String(s.endDateTime)));
    if (host) host.meals.push(m); else unmatched.push(m);
  }
  for (const s of shifts) s.meals.sort((a, b) => String(a.startDateTime).localeCompare(String(b.startDateTime)));
  unmatched.sort((a, b) => String(a.startDateTime).localeCompare(String(b.startDateTime)));
  return { shifts, unmatchedMeals: unmatched };
}

// rows -> one entry per DISTINCT geid, each carrying its paired shifts (with nested .meals) and
// any unmatched meals. Sorted busiest (most shifts) first, then key — same convention as Crew
// Schedule Lookup's groupShiftAssignmentsByEmployee.
export function groupPunchesByEmployee(rows) {
  const byGeid = new Map();
  for (const r of rows || []) {
    const key = 'geid:' + r.geid;
    let e = byGeid.get(key);
    if (!e) { e = { key, geid: r.geid, employeeName: r.employeeName || null, rows: [] }; byGeid.set(key, e); }
    // A later row's non-null name wins over an earlier null, never the reverse — same rule as
    // Crew Schedule Lookup (name resolution can vary row to row if a tenure pull partially failed).
    if (!e.employeeName && r.employeeName) e.employeeName = r.employeeName;
    e.rows.push(r);
  }
  const out = [...byGeid.values()].map(e => {
    const { shifts, unmatchedMeals } = pairPunchesByShift(e.rows);
    return { key: e.key, geid: e.geid, employeeName: e.employeeName, shifts, unmatchedMeals };
  });
  return out.sort((a, b) => (b.shifts.length - a.shifts.length) || a.key.localeCompare(b.key));
}

// query matches geid OR the resolved employee name directly — no reveal gate (dispatch #126).
// Empty query matches everyone.
export function filterPunchDirectory(directory, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return directory;
  return (directory || []).filter(e => {
    if (String(e.geid || '').toLowerCase().includes(q)) return true;
    return e.employeeName ? e.employeeName.toLowerCase().includes(q) : false;
  });
}

// Flattened, start-time-sorted punch list for the selected employee keys — what actually renders
// once one or more employees are picked. Each shift entry carries its own .meals; unmatched meals
// ride along as their own pseudo-entries (unmatched:true) so nothing is silently dropped.
export function punchesForSelected(directory, selectedKeys) {
  const sel = new Set(selectedKeys || []);
  const out = [];
  for (const e of directory || []) {
    if (!sel.has(e.key)) continue;
    for (const s of e.shifts) out.push({ ...s, employeeKey: e.key, employeeName: e.employeeName, geid: e.geid });
    for (const m of e.unmatchedMeals) out.push({ ...m, meals: [], employeeKey: e.key, employeeName: e.employeeName, geid: e.geid, unmatched: true });
  }
  return out.sort((a, b) => String(a.startDateTime).localeCompare(String(b.startDateTime)));
}

const fmtPunchTime = iso => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' });
  } catch { return '—'; }
};

// The loss-prevention signal the schema flags as "real, unconsumed today" — surfaced as a visible
// flag on an edited punch rather than dropped from the query (dispatch #138 scope item 4).
function ModifiedFlag({ inModified, outModified }) {
  if (!inModified && !outModified) return null;
  const label = inModified && outModified ? 'IN+OUT edited' : inModified ? 'IN edited' : 'OUT edited';
  return span({
    style: {
      fontSize: 9.5, fontWeight: 700, color: 'var(--amber,#f59e0b)',
      border: '.5px solid var(--amber,#f59e0b)', borderRadius: 4, padding: '1px 5px', whiteSpace: 'nowrap',
    },
    title: 'This punch was edited after the original clock-in/out.',
  }, '✏ ' + label);
}

export function TimePunchesPanel({ onClose, stores }) {
  const [dataState, setDataState] = React.useState('idle'); // idle | loading | loaded | error
  const [rows, setRows] = React.useState([]);
  const [scope, setScope] = React.useState({ level: 'all', id: null });
  const [dateRange, setDateRange] = React.useState(() => resolveDatePreset('7d'));
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState(() => new Set());

  const treeStores = stores || EMPTY_STORES;
  const tree = React.useMemo(() => buildLocationHierarchy(treeStores, INV_ORG_COORDS, STORE_NAMES), [treeStores]);
  const locs = React.useMemo(() => locationSelectorLocs(scope, tree), [scope, tree]);

  // No client-side permission gate here (same as Crew Schedule Lookup) — App.js's onOpenModal
  // already checked perm('analytics.store') before this panel could ever mount. Load starts
  // immediately on mount/scope/range change.
  React.useEffect(() => {
    let cancelled = false;
    setDataState('loading');
    (async () => {
      const data = await loadPunchTimes({
        start: dateRange?.s, end: dateRange?.e,
        locs: locs.length ? locs : undefined,
      });
      if (cancelled) return;
      setRows(data);
      setDataState('loaded');
    })().catch(() => { if (!cancelled) setDataState('error'); });
    return () => { cancelled = true; };
  }, [dateRange, locs]);

  // Exact business-day filter — loadPunchTimes widens its raw-timestamp query by a day on each
  // side (no dt column to filter on server-side), so narrow back down to the requested range here
  // via the same shared businessDate() bucketing every punch is grouped by (see file header).
  const scoped = React.useMemo(() => {
    if (!dateRange?.s || !dateRange?.e) return rows;
    return rows.filter(r => {
      const bd = punchBusinessDay(r);
      return bd && bd >= dateRange.s && bd <= dateRange.e;
    });
  }, [rows, dateRange]);

  const directory = React.useMemo(() => groupPunchesByEmployee(scoped), [scoped]);
  const filtered = React.useMemo(() => filterPunchDirectory(directory, query), [directory, query]);
  const selectedPunches = React.useMemo(() => punchesForSelected(directory, selected), [directory, selected]);
  const toggleSelected = key => setSelected(s => {
    const n = new Set(s);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });
  const totalShifts = React.useMemo(() => directory.reduce((n, e) => n + e.shifts.length, 0), [directory]);

  // Per-stream freshness, shown right here rather than pooled into At-A-Glance's own banner
  // (standing rule: never pool a new stream's staleness into an existing Math.max check).
  const freshness = React.useMemo(() => {
    if (!scoped.length) return null;
    let max = null;
    for (const r of scoped) if (r.updatedAt && (!max || r.updatedAt > max)) max = r.updatedAt;
    return max;
  }, [scoped]);

  const body = div(null,
    div({ style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 14px', borderBottom: '.5px solid var(--bdr)' } },
      div({ style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        span({ style: { fontSize: 11, color: 'var(--text3)' } }, 'Date range:'),
        h(DateRangeControl, { value: dateRange, onChange: setDateRange, allowCustom: true }),
      ),
      h(LocationSelector, { stores: treeStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, value: scope, onChange: setScope, mode: 'progressive' }),
      freshness && span({ style: { fontSize: 10, color: 'var(--text3)' } }, `Punch data as of ${new Date(freshness).toLocaleString('en-US', { hourCycle: 'h23' })}`),
    ),
    div({ style: { display: 'flex', gap: 12, padding: '10px 14px', flexWrap: 'wrap' } },
      div({ style: { flex: '1 1 260px', minWidth: 240 } },
        inp({
          type: 'text', placeholder: 'Search employee name or geid…', value: query,
          onChange: e => setQuery(e.target.value),
          style: { width: '100%', padding: '6px 10px', borderRadius: 'var(--r)', border: '.5px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text)', fontSize: 12, boxSizing: 'border-box' },
        }),
        div({ style: { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 360, overflowY: 'auto' } },
          dataState === 'loading' && div({ style: { color: 'var(--text3)', fontSize: 12, padding: '8px 0' } }, 'Loading punches…'),
          dataState === 'error' && div({ style: { color: 'var(--crit,#ef4444)', fontSize: 12, padding: '8px 0' } }, 'Could not load punch data — try again.'),
          dataState === 'loaded' && !filtered.length && div({ style: { color: 'var(--text3)', fontSize: 12, padding: '8px 0' } }, 'No punches match this scope.'),
          dataState === 'loaded' && filtered.map(e => div({
            key: e.key,
            onClick: () => toggleSelected(e.key),
            style: {
              display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
              padding: '6px 9px', borderRadius: 'var(--r)', cursor: 'pointer',
              border: '.5px solid ' + (selected.has(e.key) ? 'var(--accent,#f5bc00)' : 'var(--bdr)'),
              background: selected.has(e.key) ? 'rgba(245,188,0,.10)' : 'transparent',
            },
          },
            span({ style: { fontSize: 12, fontWeight: selected.has(e.key) ? 700 : 400 } },
              e.employeeName || shortEmployeeId(e.geid),
            ),
            span({ style: { fontSize: 10.5, color: 'var(--text3)' } }, `${e.shifts.length} shift${e.shifts.length === 1 ? '' : 's'}`),
          )),
        ),
      ),
      div({ style: { flex: '2 1 380px', minWidth: 280 } },
        span({ style: { fontSize: 11, color: 'var(--text3)' } }, 'Punches:'),
        !selected.size
          ? div({ style: { padding: '18px 0', color: 'var(--text3)', fontSize: 12 } }, 'Select one or more employees to see their punches.')
          : div({ style: { marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' } },
              selectedPunches.map(p => p.unmatched
                ? div({
                    key: punchKey(p),
                    style: { padding: '7px 10px', borderRadius: 'var(--r)', border: '.5px dashed var(--amber,#f59e0b)', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 },
                  },
                    div({ style: { display: 'flex', justifyContent: 'space-between', gap: 8 } },
                      span({ style: { fontWeight: 700 } }, punchBusinessDay(p) || '—'),
                      span({ style: { color: 'var(--text3)' } }, `${STORE_NAMES?.[p.loc] || p.loc}`),
                    ),
                    div({ style: { display: 'flex', justifyContent: 'space-between', gap: 8, color: 'var(--text2)' } },
                      span(null, `🍔 Meal (unmatched) ${fmtPunchTime(p.startDateTime)} – ${fmtPunchTime(p.endDateTime)}`),
                      h(ModifiedFlag, { inModified: p.inModified, outModified: p.outModified }),
                    ),
                  )
                : div({
                    key: punchKey(p),
                    style: { padding: '7px 10px', borderRadius: 'var(--r)', border: '.5px solid var(--bdr)', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 },
                  },
                    div({ style: { display: 'flex', justifyContent: 'space-between', gap: 8 } },
                      span({ style: { fontWeight: 700 } }, punchBusinessDay(p) || '—'),
                      span({ style: { color: 'var(--text3)' } }, `${STORE_NAMES?.[p.loc] || p.loc}`),
                    ),
                    div({ style: { display: 'flex', justifyContent: 'space-between', gap: 8, color: 'var(--text2)' } },
                      span(null, `${fmtPunchTime(p.startDateTime)} – ${fmtPunchTime(p.endDateTime)}`),
                      h(ModifiedFlag, { inModified: p.inModified, outModified: p.outModified }),
                    ),
                    p.meals.length > 0 && div({ style: { marginLeft: 14, marginTop: 2, display: 'flex', flexDirection: 'column', gap: 3, borderLeft: '2px solid var(--bdr)', paddingLeft: 8 } },
                      p.meals.map(m => div({ key: punchKey(m), style: { fontSize: 11, display: 'flex', justifyContent: 'space-between', gap: 8, color: 'var(--text2)' } },
                        span(null, `🍔 Meal ${fmtPunchTime(m.startDateTime)} – ${fmtPunchTime(m.endDateTime)}${m.isPaidBreak ? ' (paid)' : ''}`),
                        h(ModifiedFlag, { inModified: m.inModified, outModified: m.outModified }),
                      )),
                    ),
                  ),
              ),
            ),
      ),
    ),
  );

  return h(RoutePanelShell, {
    title: 'Time Punches', icon: '🕐',
    subtitle: `${directory.length} employee${directory.length === 1 ? '' : 's'} in scope · ${totalShifts} shift${totalShifts === 1 ? '' : 's'}`,
    onBack: onClose,
  }, body);
}
