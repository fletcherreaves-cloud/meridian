// @ts-nocheck
// ── Crew Schedule Lookup (dispatch #123) ──────────────────────────────────────────────────────
// "search for an employee and see their upcoming schedule... date and location selectors,
// multi select by names" (owner's verbatim ask, memory/dispatch-123.md). The first Meridian
// panel that lets a user search/browse individual EMPLOYEES' schedules directly (not an
// aggregate) -- see this dispatch's PR body for the one adjacent, pre-existing exception this
// session found and deliberately did NOT touch (src/views/skills-matrix.js / employee_skills,
// which already stores + renders raw employee names with no tokenization -- out of scope here).
//
// 🔄 DISPATCH #125 (owner directive, 2026-08-25, sent while this PR was open for review):
// "I flagged the PII/privacy considerations to you upfront via the scope question, and both
// #123 and #124 are built around the existing tokenized-identity-vault pattern rather than
// storing raw names > Let's update this > there is no reason to hide names for scheduling and
// punch times > everyone can see this data as-is." This rewrites the panel's original design:
//   - Names render DIRECTLY. No click-to-reveal step, no RevealName component, no
//     identity_reveal_log write for viewing a name here -- that entire flow is gone.
//   - RBAC re-decision (stated explicitly, not a rubber stamp, per the dispatch's request): this
//     panel dropped src/views/security-panel.js's securityPanelAccess() gate (admin/supervisor
//     always; manager only with org_config.gm_identity_reveal_enabled) and now uses ORDINARY
//     panel RBAC -- nav-level perm:'analytics.store' in src/app/panel-registry.js (the same key
//     Labor Tools/Scheduling/Calendar Manager use) plus the table's own accessible_locs RLS
//     scoping (supabase/schema-lifelenz-shift-assignments.sql). Reasoning: the security-tier gate
//     existed ONLY because a name was being revealed behind it -- with names no longer hidden,
//     "who's on shift Tuesday" is core scheduling data, the same category as the Scheduling/
//     Schedule Summary panels already open to any manager, not a security investigation. Keeping
//     the identity-reveal-specific gate after removing the thing it protected would have left
//     most managers (and every gm/office_staff/DO/VP/owner role) locked out of an ordinary
//     schedule lookup for no remaining reason. This is NOT "no RBAC": every other operational
//     panel in this app (Labor Tools, Calendar Manager) has exactly this much gating -- role-
//     appropriate nav visibility + RLS loc scoping -- and none of them layer a second,
//     panel-specific permission check on top, so this panel no longer does either. Matching that
//     precedent is the considered choice here, not an oversight.
//   - Consequently the panel no longer takes a userRole prop or does its own permission check;
//     src/app/App.js's onOpenModal already gates entry via perm('analytics.store') before this
//     ever mounts, same as every sibling panel.
import * as React from 'react';
import { RoutePanelShell } from '../components/ModalShell.js';
import { DateRangeControl, LocationSelector, buildLocationHierarchy, locationSelectorLocs } from '../components/PanelControls.js';
import { loadLifeLenzShiftAssignments } from '../lib/supabase.js';
import { INV_ORG_COORDS, STORE_NAMES } from '../constants.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const inp = (p, ...c) => h('input', p, ...c);

const EMPTY_STORES = [];

// ── Pure logic — exported and tested independently of any rendering ─────────────────────────────

// A short, stable display key for an employee with no resolved name: last 5 chars of the
// LifeLenz employmentId, same "short-id fallback, never a raw guess" spirit as lifelenz-shift-
// jobs.js's own resolveRoleName().
export function shortEmployeeId(assignedEmploymentId) {
  const s = String(assignedEmploymentId || '');
  return s ? 'Employee #' + s.slice(-5) : 'Unknown';
}

// rows (loadLifeLenzShiftAssignments' shape) -> one entry per DISTINCT employmentId. Dispatch
// #125: grouping key is assignedEmploymentId ONLY now (the stable LifeLenz identifier) -- the
// prior emp_token grouping key is gone along with the token itself. Sorted by shift count desc,
// then key -- the busiest people first, deterministic ordering for a stable UI/test snapshot.
export function groupShiftAssignmentsByEmployee(rows) {
  const byKey = new Map();
  for (const r of rows || []) {
    const key = 'eid:' + r.assignedEmploymentId;
    let e = byKey.get(key);
    if (!e) {
      e = { key, assignedEmploymentId: r.assignedEmploymentId, employeeName: r.employeeName || null, shifts: [] };
      byKey.set(key, e);
    }
    // A later row's non-null name wins over an earlier null (roster resolution can vary shift to
    // shift if the roster fetch partially failed) -- never overwrite a resolved name with a null.
    if (!e.employeeName && r.employeeName) e.employeeName = r.employeeName;
    e.shifts.push(r);
  }
  const out = [...byKey.values()];
  for (const e of out) e.shifts.sort((a, b) => String(a.shiftStart).localeCompare(String(b.shiftStart)));
  return out.sort((a, b) => b.shifts.length - a.shifts.length || a.key.localeCompare(b.key));
}

// query matches assigned_employment_id OR the employee's resolved name directly -- dispatch #125
// removed the "unrevealed names never match" restriction along with the reveal step itself.
// Empty query matches everyone.
export function filterEmployeeDirectory(directory, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return directory;
  return (directory || []).filter(e => {
    if (String(e.assignedEmploymentId || '').toLowerCase().includes(q)) return true;
    return e.employeeName ? e.employeeName.toLowerCase().includes(q) : false;
  });
}

// Flattened, date/time-sorted shift list for the selected employee keys — what actually renders
// under "Upcoming schedule" once one or more employees are picked.
export function shiftsForSelected(directory, selectedKeys) {
  const sel = new Set(selectedKeys || []);
  const out = [];
  for (const e of directory || []) {
    if (!sel.has(e.key)) continue;
    for (const s of e.shifts) out.push({ ...s, employeeKey: e.key });
  }
  return out.sort((a, b) => String(a.shiftStart).localeCompare(String(b.shiftStart)));
}

const _pad = n => String(n).padStart(2, '0');
const _dstr = d => `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`;
// Default range: TODAY through +13 days (14 days total, matching lifelenz-pull.mjs's own
// LIFELENZ_DAYS_FWD=14 pull window) — "upcoming schedule" is forward-looking, unlike
// DateRangeControl's preset pills (trailing N days ending at the last CLOSED business day,
// resolveDatePreset's own doc comment), so this seeds the CUSTOM range instead of a preset id.
// The Custom… date inputs (unconstrained, plain <input type=date>) are what actually let this
// panel reach future dates without any change to the shared PanelControls.js component.
function defaultUpcomingRange() {
  const s = new Date();
  const e = new Date(s); e.setDate(e.getDate() + 13);
  return { id: 'custom', s: _dstr(s), e: _dstr(e) };
}

const fmtShiftTime = iso => {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hourCycle: 'h12' });
  } catch { return '—'; }
};

export function CrewSchedulePanel({ onClose, stores }) {
  const [dataState, setDataState] = React.useState('idle'); // idle | loading | loaded | error
  const [rows, setRows] = React.useState([]);
  const [scope, setScope] = React.useState({ level: 'all', id: null });
  const [dateRange, setDateRange] = React.useState(defaultUpcomingRange);
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState(() => new Set());

  const treeStores = stores || EMPTY_STORES;
  const tree = React.useMemo(() => buildLocationHierarchy(treeStores, INV_ORG_COORDS, STORE_NAMES), [treeStores]);
  const locs = React.useMemo(() => locationSelectorLocs(scope, tree), [scope, tree]);

  // No client-side permission gate here (dispatch #125 removed it, see file header) -- App.js's
  // onOpenModal already checked perm('analytics.store') before this panel could ever mount, same
  // as every sibling panel. The load starts immediately on mount/scope/range change.
  React.useEffect(() => {
    let cancelled = false;
    setDataState('loading');
    (async () => {
      const data = await loadLifeLenzShiftAssignments({
        start: dateRange?.s, end: dateRange?.e,
        locs: locs.length ? locs : undefined,
      });
      if (cancelled) return;
      setRows(data);
      setDataState('loaded');
    })().catch(() => { if (!cancelled) setDataState('error'); });
    return () => { cancelled = true; };
  }, [dateRange, locs]);

  const directory = React.useMemo(() => groupShiftAssignmentsByEmployee(rows), [rows]);
  const filtered = React.useMemo(() => filterEmployeeDirectory(directory, query), [directory, query]);
  const selectedShifts = React.useMemo(() => shiftsForSelected(directory, selected), [directory, selected]);
  const toggleSelected = key => setSelected(s => {
    const n = new Set(s);
    if (n.has(key)) n.delete(key); else n.add(key);
    return n;
  });
  // Per-stream freshness (standing rule: never pool a new stream's staleness into an existing
  // Math.max check) -- the newest updated_at across whatever's currently loaded, shown right
  // here rather than folded into At-A-Glance's own freshness banner.
  const freshness = React.useMemo(() => {
    if (!rows.length) return null;
    let max = null;
    for (const r of rows) if (r.updatedAt && (!max || r.updatedAt > max)) max = r.updatedAt;
    return max;
  }, [rows]);

  const body = div(null,
    div({ style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 14px', borderBottom: '.5px solid var(--bdr)' } },
      div({ style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' } },
        span({ style: { fontSize: 11, color: 'var(--text3)' } }, 'Date range:'),
        h(DateRangeControl, { value: dateRange, onChange: setDateRange, allowCustom: true }),
      ),
      h(LocationSelector, { stores: treeStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, value: scope, onChange: setScope, mode: 'progressive' }),
      freshness && span({ style: { fontSize: 10, color: 'var(--text3)' } }, `Schedule data as of ${new Date(freshness).toLocaleString('en-US', { hourCycle: 'h23' })}`),
    ),
    div({ style: { display: 'flex', gap: 12, padding: '10px 14px', flexWrap: 'wrap' } },
      div({ style: { flex: '1 1 260px', minWidth: 240 } },
        inp({
          type: 'text', placeholder: 'Search employee name or #…', value: query,
          onChange: e => setQuery(e.target.value),
          style: { width: '100%', padding: '6px 10px', borderRadius: 'var(--r)', border: '.5px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text)', fontSize: 12, boxSizing: 'border-box' },
        }),
        div({ style: { marginTop: 8, display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 360, overflowY: 'auto' } },
          dataState === 'loading' && div({ style: { color: 'var(--text3)', fontSize: 12, padding: '8px 0' } }, 'Loading schedule…'),
          dataState === 'error' && div({ style: { color: 'var(--crit,#ef4444)', fontSize: 12, padding: '8px 0' } }, 'Could not load schedule data — try again.'),
          dataState === 'loaded' && !filtered.length && div({ style: { color: 'var(--text3)', fontSize: 12, padding: '8px 0' } }, 'No shifts match this scope.'),
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
              e.employeeName || shortEmployeeId(e.assignedEmploymentId),
            ),
            span({ style: { fontSize: 10.5, color: 'var(--text3)' } }, `${e.shifts.length} shift${e.shifts.length === 1 ? '' : 's'}`),
          )),
        ),
      ),
      div({ style: { flex: '2 1 380px', minWidth: 280 } },
        span({ style: { fontSize: 11, color: 'var(--text3)' } }, 'Upcoming schedule:'),
        !selected.size
          ? div({ style: { padding: '18px 0', color: 'var(--text3)', fontSize: 12 } }, 'Select one or more employees to see their shifts.')
          : div({ style: { marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto' } },
              selectedShifts.map(s => div({
                key: s.shiftId,
                style: { padding: '7px 10px', borderRadius: 'var(--r)', border: '.5px solid var(--bdr)', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 2 },
              },
                div({ style: { display: 'flex', justifyContent: 'space-between', gap: 8 } },
                  span({ style: { fontWeight: 700 } }, s.date),
                  span({ style: { color: 'var(--text3)' } }, `${STORE_NAMES?.[s.loc] || s.loc}`),
                ),
                div({ style: { display: 'flex', justifyContent: 'space-between', gap: 8, color: 'var(--text2)' } },
                  span(null, `${fmtShiftTime(s.shiftStart)} – ${fmtShiftTime(s.shiftEnd)}`),
                  span(null, s.roleName || '—'),
                ),
                s.isAbsent && span({ style: { color: 'var(--amber,#f59e0b)', fontSize: 10.5 } }, 'Marked absent'),
              )),
            ),
      ),
    ),
  );

  return h(RoutePanelShell, {
    title: 'Crew Schedule', icon: '🗓',
    subtitle: `${directory.length} employee${directory.length === 1 ? '' : 's'} in scope · ${rows.length} shift${rows.length === 1 ? '' : 's'}`,
    onBack: onClose,
  }, body);
}
