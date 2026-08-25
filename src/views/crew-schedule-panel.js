// @ts-nocheck
// ── Crew Schedule Lookup (dispatch #123) ──────────────────────────────────────────────────────
// "search for an employee and see their upcoming schedule... date and location selectors,
// multi select by names" (owner's verbatim ask, memory/dispatch-123.md). The first Meridian
// panel that lets a user search/browse individual EMPLOYEES' schedules directly (not an
// aggregate) -- see this dispatch's PR body for the one adjacent, pre-existing exception this
// session found and deliberately did NOT touch (src/views/skills-matrix.js / employee_skills,
// which already stores + renders raw employee names with no tokenization -- out of scope here).
//
// RBAC decision (stated per the dispatch's explicit request, not defaulted silently): this panel
// reuses src/views/security-panel.js's securityPanelAccess() UNCHANGED -- admin/supervisor
// always allowed; manager allowed ONLY when org_config.gm_identity_reveal_enabled is true; every
// other role denied. The dispatch itself raised a real alternative ("maybe a GM should always
// see their OWN store's schedule without the reveal toggle") and this is the considered answer:
// NO, not implemented, for three reasons --
//   1. A per-store carve-out would need either a new SECURITY DEFINER RPC (reveal_employee_
//      identity() takes no location argument and checking one client-side is not a security
//      boundary -- RLS is) or a bespoke RLS predicate on this table alone. Both are new,
//      under-reviewed surface on the SAME identity-vault machinery that had a real NULL-role
//      bypass incident (schema-identity-vault.sql's own header) days before this dispatch.
//   2. security_findings' own RLS comment already reasons through this exact tension for
//      token-only (not even named) employee data -- "a token alone isn't PII, but ... a small-
//      store finding can be practically de-anonymizing even in token form" -- and lands on the
//      SAME conservative tier this panel uses. A GM carve-out here would be an inconsistency
//      with that precedent, not a natural extension of it.
//   3. RLS already scopes which ROWS a GM's client can even receive (accessible_locs), so a GM
//      without the reveal flag still sees their own crew's shifts in full (times/roles/store) --
//      just token/ID-labeled instead of named, identical to how RegisterAuditTab/Security panel
//      already present GM-visible employee data today. Nothing is hidden that isn't ALSO hidden
//      from a GM elsewhere in this app; this is not a new restriction, it's the existing one.
// Starting at the conservative, precedented tier and loosening later on an explicit owner
// decision is the safer default than the reverse -- same words security_findings' own SQL
// comment uses, applied consistently here.
//
// Name-search design decision (also stated explicitly, not defaulted): NO bulk/automatic reveal.
// Search operates over assigned_employment_id always, and over an employee's REAL name only
// once that employee has been individually revealed this session (RevealName's existing click +
// required-reason + logged path, same component Security/Register-Audit already use -- lifted
// here, not reimplemented). A bulk auto-reveal-everything-in-scope would make "search by name"
// fully work on first load, but would also flood identity_reveal_log -- an append-only,
// indefinite-retention, evidence-grade audit trail (schema-identity-vault.sql's own comment) --
// with routine convenience unlocks instead of the deliberate, investigative-lookup entries it's
// designed to hold. The realistic workflow this ships instead: open the panel scoped to a store,
// reveal that store's ~10-30 crew once (a few clicks, each logged with a reason), then search/
// filter freely for the rest of the session -- consistent with RevealName's own "blind mode
// default, not a data gap" philosophy (store-analytics.js's comment on the same component).
import * as React from 'react';
import { RoutePanelShell } from '../components/ModalShell.js';
import { DateRangeControl, LocationSelector, buildLocationHierarchy, locationSelectorLocs } from '../components/PanelControls.js';
import { securityPanelAccess } from './security-panel.js';
import { RevealName } from './store-analytics.js';
import { loadLifeLenzShiftAssignments, loadGmIdentityRevealEnabled } from '../lib/supabase.js';
import { INV_ORG_COORDS, STORE_NAMES } from '../constants.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);
const inp = (p, ...c) => h('input', p, ...c);

const EMPTY_STORES = [];

// ── Pure logic — exported and tested independently of any rendering ─────────────────────────────

// A short, stable display key for an employee with no resolvable name: last 5 chars of the
// LifeLenz employmentId, same "short-id fallback, never a raw guess" spirit as lifelenz-shift-
// jobs.js's own resolveRoleName().
export function shortEmployeeId(assignedEmploymentId) {
  const s = String(assignedEmploymentId || '');
  return s ? 'Employee #' + s.slice(-5) : 'Unknown';
}

// rows (loadLifeLenzShiftAssignments' shape) -> one entry per DISTINCT person, keyed on
// empToken when present (so the SAME real person is one entry even if LifeLenz ever assigns a
// second employmentId to them), falling back to assignedEmploymentId when no token was resolved
// (dispatch #123's explicit graceful-degradation case). Sorted by shift count desc, then key --
// the busiest people first, deterministic ordering for a stable UI/test snapshot either way.
export function groupShiftAssignmentsByEmployee(rows) {
  const byKey = new Map();
  for (const r of rows || []) {
    const key = r.empToken ? 'tok:' + r.empToken : 'eid:' + r.assignedEmploymentId;
    let e = byKey.get(key);
    if (!e) {
      e = { key, empToken: r.empToken || null, assignedEmploymentId: r.assignedEmploymentId, shifts: [] };
      byKey.set(key, e);
    }
    e.shifts.push(r);
  }
  const out = [...byKey.values()];
  for (const e of out) e.shifts.sort((a, b) => String(a.shiftStart).localeCompare(String(b.shiftStart)));
  return out.sort((a, b) => b.shifts.length - a.shifts.length || a.key.localeCompare(b.key));
}

// query matches assigned_employment_id (always searchable) OR the employee's revealed name
// (revealedNames: token -> name, from RevealName's own onReveal cache) -- never an unrevealed
// name, per this panel's own stated no-bulk-reveal decision above. Empty query matches everyone.
export function filterEmployeeDirectory(directory, query, revealedNames) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return directory;
  return (directory || []).filter(e => {
    if (String(e.assignedEmploymentId || '').toLowerCase().includes(q)) return true;
    const name = e.empToken ? revealedNames?.[e.empToken] : null;
    return name ? name.toLowerCase().includes(q) : false;
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

export function CrewSchedulePanel({ onClose, stores, userRole }) {
  const [permState, setPermState] = React.useState('checking'); // checking | denied | allowed
  const [dataState, setDataState] = React.useState('idle');     // idle | loading | loaded | error
  const [rows, setRows] = React.useState([]);
  const [scope, setScope] = React.useState({ level: 'all', id: null });
  const [dateRange, setDateRange] = React.useState(defaultUpcomingRange);
  const [query, setQuery] = React.useState('');
  const [selected, setSelected] = React.useState(() => new Set());
  const [revealed, setRevealed] = React.useState({});
  const onReveal = React.useCallback((token, name) => setRevealed(r => ({ ...r, [token]: name })), []);

  const treeStores = stores || EMPTY_STORES;
  const tree = React.useMemo(() => buildLocationHierarchy(treeStores, INV_ORG_COORDS, STORE_NAMES), [treeStores]);
  const locs = React.useMemo(() => locationSelectorLocs(scope, tree), [scope, tree]);

  // Same two-effect permission-then-data shape as security-panel.js's SecurityPanel, deliberately
  // -- this panel reuses that EXACT gate (securityPanelAccess), so the loading choreography that
  // gate depends on (permState settles before any data fetch starts) has to match too.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      if (userRole === 'admin' || userRole === 'supervisor') { if (!cancelled) setPermState('allowed'); return; }
      if (userRole !== 'manager') { if (!cancelled) setPermState('denied'); return; }
      const enabled = await loadGmIdentityRevealEnabled();
      if (!cancelled) setPermState(securityPanelAccess(userRole, enabled));
    })();
    return () => { cancelled = true; };
  }, [userRole]);

  React.useEffect(() => {
    if (permState !== 'allowed') return;
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
  }, [permState, dateRange, locs]);

  const directory = React.useMemo(() => groupShiftAssignmentsByEmployee(rows), [rows]);
  const filtered = React.useMemo(() => filterEmployeeDirectory(directory, query, revealed), [directory, query, revealed]);
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

  let body;
  if (permState === 'checking') {
    body = div({ style: { padding: '40px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 } }, 'Checking access…');
  } else if (permState === 'denied') {
    body = div({ style: { padding: '40px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 } },
      'Not permitted — Crew Schedule requires admin/supervisor access, or a manager role with identity reveal enabled for this org.');
  } else {
    body = div(null,
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
            type: 'text', placeholder: 'Search employee # or a revealed name…', value: query,
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
              span({ style: { fontSize: 12, fontWeight: selected.has(e.key) ? 700 : 400, display: 'flex', alignItems: 'center', gap: 6 } },
                e.empToken
                  ? h(RevealName, { token: e.empToken, cache: revealed, onReveal })
                  : span(null, shortEmployeeId(e.assignedEmploymentId)),
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
  }

  return h(RoutePanelShell, {
    title: 'Crew Schedule', icon: '🗓',
    subtitle: permState === 'allowed' ? `${directory.length} employee${directory.length === 1 ? '' : 's'} in scope · ${rows.length} shift${rows.length === 1 ? '' : 's'}` : undefined,
    onBack: onClose,
  }, body);
}
