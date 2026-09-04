// @ts-nocheck
// ── Events (unified panel) — Phase 3 (a) of memory/project-events-calendar-redesign-2026-09-04.md ──
// "One panel, five views" (design doc §3.5): Upcoming | Calendar | Log | Impact | Rules, replacing
// the separate Events & Tags / Event Impact nav entries (panel-registry.js).
//
// SCOPE OF THIS PASS, stated plainly (owner decision, 2026-09-04, "thin shell now, full merge
// later" over "strip outer backdrop" or "full rebuild"): CalendarManagerPanel (src/features/
// calendar.js, ~1850 lines) and EventImpactPanel (./event-impact.js, ~150 lines) are each a fully
// self-contained component -- own full-screen backdrop, own header/title/close button, own
// internal controls (Calendar's grid/rules/pending tabs + import buttons, Impact's type/scope
// pickers). Neither was built as an embeddable body. Rebuilding both to share one header/shell
// (matching the design doc's flat-5-tab mockup exactly) is real, valuable follow-on work, but it
// means touching ~2000 lines of working, tested UI this environment cannot visually verify (no
// live browser + authenticated Supabase session here -- same gap dispatch27-routing-vs-modals.md
// hit). So THIS pass ships the two genuinely new views (Upcoming, Log) as real flat tab content
// under one RoutePanelShell, and Calendar/Impact/Rules stay their existing components, opened as
// an overlay ON TOP of this shell when their pill is clicked -- functionally identical to today
// (EventsAndTagsPanel already did exactly this for Calendar), just reached from one URL-addressable
// panel instead of three separate nav entries. The fully-flat 5-tab visual is a clearly scoped
// follow-on, not silently dropped.
//
// groupKeyOf/groupEvents below intentionally DUPLICATE store-dash.js's EventCalendar (Phase 0)
// and calendar.js's monthAgenda (their own header comment already notes this is the third
// independent implementation of the same (date,label,type) dedup key) rather than extracting a
// shared helper -- keeping this pass's blast radius to new files + additive wiring, not a refactor
// of two other panels' internals. A fourth copy joining three pre-existing ones is consistent with
// that file's own precedent, not a new problem introduced here.
import * as React from 'react';
import { RoutePanelShell } from '../components/ModalShell.js';
import { DateRangeControl, LocationSelector, buildLocationHierarchy, locationSelectorLocs } from '../components/PanelControls.js';
import { CalendarManagerPanel } from '../features/calendar.js';
import { EventImpactPanel } from './event-impact.js';
// EventCalendar (the old "List" ledger -- search/filter/sort/inline-edit/CSV export, still the
// only place that functionality lives; Upcoming/Log above are read-only summaries, not a
// replacement for it) stays reachable as a 'ledger' overlay pill, same treatment as Calendar/
// Rules/Impact. Loaded via React.lazy rather than a static `import ... from './store-dash.js'` --
// that file is a large, separately-chunked module already reached through App.js's own dynamic
// `_storeDash()` import elsewhere; a static import here risks either duplicating it into this
// lazy chunk or (per the changelog/index.js warning on mixed static+dynamic imports) pulling it
// into the eager entry chunk. This keeps store-dash.js single-sourced regardless of which path
// reaches it.
const EventCalendarLazy = React.lazy(() => import('./store-dash.js').then(m => ({ default: m.EventCalendar })));
import { loadEventImpact } from '../lib/supabase.js';
import { EVENT_TYPES, defaultVisibilityFor, STORE_NAMES, INV_ORG_COORDS, sName } from '../constants.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const EMPTY_STORES = [];
export const EVENTS_TAB_IDS = ['upcoming', 'calendar', 'log', 'impact', 'rules'];

const TAB_STYLE = active => ({
  background: active ? '#f5bc00' : 'var(--surf3)', color: active ? '#0f1117' : 'var(--text2)',
  border: 'none', borderRadius: 'var(--r)', padding: '6px 12px', fontSize: 12, fontWeight: 700, cursor: 'pointer',
});

const normLabel = s => String(s || '').replace(/\s*\(Day \d+ of \d+\)\s*$/i, '').trim().toLowerCase();

// userEvents ({[loc]:{[dk]:info}}) -> flat event rows, same expansion EventCalendar uses (issue
// #142's combinedEvents same-day-multi-event shape included, so a school-closure-AND-game day
// still surfaces as two rows here, not a silently dropped one).
export function flattenUserEvents(userEvents) {
  const ev = [];
  for (const [loc, dkMap] of Object.entries(userEvents || {})) {
    for (const [dk, info] of Object.entries(dkMap)) {
      if (info.combinedEvents && info.combinedEvents.length > 1) {
        info.combinedEvents.forEach((sub, i) => ev.push({ loc, dk, date: new Date(dk + 'T12:00:00'), ...info, ...sub, combinedIdx: i, combinedOf: info.combinedEvents.length }));
      } else {
        ev.push({ loc, dk, date: new Date(dk + 'T12:00:00'), ...info });
      }
    }
  }
  return ev;
}

// Groups by (date, normalized label, type) -- the master-entry-with-scope-chip pattern (design
// doc §2.3/§3.5): one Thanksgiving is one row with a "27 stores" chip, not 27 identical rows.
export function groupEventsByDayLabelType(evs) {
  const byKey = new Map();
  for (const e of evs || []) {
    const k = e.dk + '|' + normLabel(e.label) + '|' + (e.type || 'other');
    if (!byKey.has(k)) byKey.set(k, { ...e, locs: [e.loc], items: [e] });
    else { const g = byKey.get(k); g.locs.push(e.loc); g.items.push(e); }
  }
  return Array.from(byKey.values());
}

// Confidence glyph + a plain-language impact line, sourced from the Event Impact Registry
// (event_impact table -- the MEASURED tier of forecast.js's 3-tier precedence ladder). Grouped
// events read the registry per-loc and report the group's own home/away split; a group with no
// registry rows at all (nothing measured for this type anywhere in scope) shows "assumed".
function impactGlyph(group, impactByKey) {
  const type = group.type || 'other';
  const rows = group.locs.map(loc => impactByKey[String(loc).replace(/^0+/, '') + '|' + type]).filter(Boolean);
  if (!rows.length) return { glyph: '○', label: 'assumed', text: null };
  const measured = rows.some(r => r.source === 'measured' || r.source == null);
  const label = String(group.label || '');
  const away = /\(away\)/i.test(label);
  const vals = rows.map(r => (away ? r.awayImpact : r.homeImpact)).filter(v => v != null);
  if (!vals.length) return { glyph: measured ? '◐' : '○', label: measured ? 'estimated' : 'assumed', text: null };
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const n = rows.reduce((a, r) => a + (away ? (r.nAway || 0) : (r.nHome || 0)), 0);
  return {
    glyph: measured ? '⬤' : '◐',
    label: measured ? `measured n=${n}` : 'estimated',
    text: (avg >= 0 ? '+' : '') + (avg * 100).toFixed(1) + '% sales',
  };
}

function scopeChip(group, expanded, onToggle) {
  const n = group.locs.length;
  if (n <= 1) return span({ style: { fontSize: 10.5, color: 'var(--text3)' } }, '● ' + (sName(group.loc) || STORE_NAMES[group.loc] || group.loc));
  return btn({
    onClick: onToggle,
    style: { fontSize: 10.5, color: 'var(--text2)', background: 'transparent', border: '1px solid var(--bdr2)', borderRadius: 5, padding: '1px 6px', cursor: 'pointer' },
  }, (n >= 25 ? '◉ all ' : '◍ ') + n + ' stores ' + (expanded ? '▾' : '▸'));
}

function EventRow({ group, impactByKey, expanded, onToggleExpand }) {
  const et = EVENT_TYPES[group.type] || EVENT_TYPES.other;
  const imp = impactGlyph(group, impactByKey);
  return div({ style: { display: 'flex', flexDirection: 'column', gap: 4 } },
    div({ style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 'var(--r)', border: '.5px solid var(--bdr)', background: 'var(--surf2)' } },
      span({ style: { fontSize: 14 } }, group.icon || et.icon),
      div({ style: { flex: 1, minWidth: 0 } },
        div({ style: { fontSize: 12, fontWeight: 700, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, group.label || et.label),
        div({ style: { fontSize: 9.5, color: 'var(--text3)', marginTop: 1 } }, et.label)),
      scopeChip(group, expanded, onToggleExpand),
      div({ style: { display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 } },
        span({ title: imp.label, style: { fontSize: 11 } }, imp.glyph),
        imp.text && span({ style: { fontSize: 10.5, color: 'var(--text2)', fontWeight: 600 } }, imp.text))),
    expanded && div({ style: { display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 10px 6px 30px' } },
      ...group.locs.map(loc => span({ key: loc, style: { fontSize: 10, color: 'var(--text3)', border: '.5px solid var(--bdr2)', borderRadius: 4, padding: '1px 6px' } },
        sName(loc) || STORE_NAMES[loc] || loc))));
}

// ── Shared date-grouped ledger body, used by both Upcoming (all visible types) and Log
//    (visibility:'log' only). `filterFn` narrows the flat event list before grouping/date-bucketing.
function EventLedgerBody({ userEvents, stores, locs, dateRange, filterFn, impactByKey, emptyText }) {
  const [expanded, setExpanded] = React.useState({});
  const flat = React.useMemo(() => flattenUserEvents(userEvents), [userEvents]);
  const scoped = React.useMemo(() => {
    const locSet = locs && locs.length ? new Set(locs.map(String)) : null;
    const s = dateRange?.s, e = dateRange?.e;
    return flat.filter(ev => {
      if (locSet && !locSet.has(String(ev.loc))) return false;
      if (s && ev.dk < s) return false;
      if (e && ev.dk > e) return false;
      return filterFn ? filterFn(ev) : true;
    });
  }, [flat, locs, dateRange, filterFn]);

  const byDay = React.useMemo(() => {
    const groups = groupEventsByDayLabelType(scoped);
    const days = new Map();
    for (const g of groups) { if (!days.has(g.dk)) days.set(g.dk, []); days.get(g.dk).push(g); }
    return [...days.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [scoped]);

  if (!byDay.length) return div({ style: { padding: '30px 14px', textAlign: 'center', color: 'var(--text3)', fontSize: 12 } }, emptyText || 'No events in this window.');

  return div({ style: { display: 'flex', flexDirection: 'column', gap: 12, padding: '10px 14px' } },
    ...byDay.map(([dk, groups]) => {
      const dObj = new Date(dk + 'T12:00:00');
      return div({ key: dk },
        div({ style: { fontSize: 10.5, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 4 } },
          dObj.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })),
        div({ style: { display: 'flex', flexDirection: 'column', gap: 4 } },
          ...groups.map((g, i) => {
            const key = dk + '|' + i;
            return h(EventRow, { key, group: g, impactByKey, expanded: !!expanded[key], onToggleExpand: () => setExpanded(x => ({ ...x, [key]: !x[key] })) });
          })));
    }));
}

const _pad = n => String(n).padStart(2, '0');
const _dstr = d => `${d.getFullYear()}-${_pad(d.getMonth() + 1)}-${_pad(d.getDate())}`;
// "Upcoming" defaults forward (today .. +29 days), not DateRangeControl's usual trailing preset —
// same reasoning + same custom-range seed trick as crew-schedule-panel.js's defaultUpcomingRange.
function defaultUpcomingRange() {
  const s = new Date(); const e = new Date(s); e.setDate(e.getDate() + 29);
  return { id: 'custom', s: _dstr(s), e: _dstr(e) };
}
function defaultTrailingRange() {
  const e = new Date(); const s = new Date(e); s.setDate(s.getDate() - 29);
  return { id: 'custom', s: _dstr(s), e: _dstr(e) };
}

// EventsPanel — the route:true shell (panel-registry.js's 'events' entry). `initialView` seeds
// the active pill (set by App.js's onOpenModal dispatcher before goRoute('events'), same "raw
// value once" shape as CrewSchedulePanel's initialTab); falls back to 'upcoming'.
export function EventsPanel({ stores, ds, settings, userEvents, onUpdate, onClose, initialView, initialCalendarScope }) {
  const [tab, setTab] = React.useState(EVENTS_TAB_IDS.includes(initialView) ? initialView : 'upcoming');
  const [overlay, setOverlay] = React.useState(
    initialView === 'calendar' ? 'calendar' : initialView === 'rules' ? 'rules' : initialView === 'impact' ? 'impact' : null);
  const [scope, setScope] = React.useState({ level: 'all', id: null });
  const [upcomingRange, setUpcomingRange] = React.useState(defaultUpcomingRange);
  const [logRange, setLogRange] = React.useState(defaultTrailingRange);
  const [impactRows, setImpactRows] = React.useState(null);

  React.useEffect(() => { let live = true; loadEventImpact().then(r => { if (live) setImpactRows(r || []); }).catch(() => { if (live) setImpactRows([]); }); return () => { live = false; }; }, []);
  const impactByKey = React.useMemo(() => { const m = {}; for (const r of (impactRows || [])) m[r.loc + '|' + r.eventType] = r; return m; }, [impactRows]);

  const treeStores = stores || EMPTY_STORES;
  const tree = React.useMemo(() => buildLocationHierarchy(treeStores, INV_ORG_COORDS, STORE_NAMES), [treeStores]);
  const locs = React.useMemo(() => locationSelectorLocs(scope, tree), [scope, tree]);

  const openTab = id => {
    setTab(id);
    if (id === 'calendar' || id === 'rules' || id === 'impact') setOverlay(id);
  };
  const openLedger = () => setOverlay('ledger');

  const logFilter = React.useCallback(ev => (ev.visibility || defaultVisibilityFor(ev.type)) === 'log', []);

  const pills = div({ style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
    ...[['upcoming', '📋 Upcoming'], ['calendar', '📆 Calendar'], ['log', '📝 Log'], ['impact', '📈 Impact'], ['rules', '🔁 Rules']].map(([id, l]) =>
      btn({ key: id, onClick: () => openTab(id), style: TAB_STYLE(tab === id) }, l)));

  const body = div(null,
    div({ style: { display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 14px', borderBottom: '.5px solid var(--bdr)' } },
      pills,
      (tab === 'upcoming' || tab === 'log') && h(LocationSelector, { stores: treeStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, value: scope, onChange: setScope, mode: 'progressive' }),
      tab === 'upcoming' && div({ style: { display: 'flex', alignItems: 'center', gap: 8 } },
        span({ style: { fontSize: 11, color: 'var(--text3)' } }, 'Window:'),
        h(DateRangeControl, { value: upcomingRange, onChange: setUpcomingRange, allowCustom: true })),
      tab === 'log' && div({ style: { display: 'flex', alignItems: 'center', gap: 8 } },
        span({ style: { fontSize: 11, color: 'var(--text3)' } }, 'Window:'),
        h(DateRangeControl, { value: logRange, onChange: setLogRange, allowCustom: true })),
      (tab === 'upcoming' || tab === 'log') && btn({
        onClick: openLedger, title: 'Search, filter, sort, inline-edit, or CSV/print export the full event ledger',
        style: { alignSelf: 'flex-start', fontSize: 10, color: 'var(--text3)', background: 'transparent', border: '1px solid var(--bdr2)', borderRadius: 5, padding: '2px 8px', cursor: 'pointer' },
      }, '✎ Full ledger (search / edit / export)')),
    tab === 'upcoming' && h(EventLedgerBody, {
      userEvents, stores: treeStores, locs, dateRange: upcomingRange, impactByKey,
      filterFn: ev => (ev.visibility || defaultVisibilityFor(ev.type)) !== 'log',
      emptyText: 'No calendar-visible events in this window.',
    }),
    tab === 'log' && h(EventLedgerBody, {
      userEvents, stores: treeStores, locs, dateRange: logRange, impactByKey,
      filterFn: logFilter,
      emptyText: 'No log-only events in this window — store incidents, competition notes, staffing/training entries land here.',
    }),
    (tab === 'calendar' || tab === 'rules') && overlay && overlay !== 'ledger' && h(CalendarManagerPanel, {
      stores, ds, settings, userEvents, onUpdate,
      initialScope: initialCalendarScope, initialTab: overlay === 'rules' ? 'rules' : 'grid',
      // Closing the overlay while its own pill is active would otherwise leave the panel showing
      // a highlighted pill over an empty body (overlay cleared, but tab still 'calendar'/'rules'/
      // 'impact' so neither the ledger body nor the overlay guard render anything) — fall back to
      // Upcoming, same as this panel's own default landing tab.
      onClose: () => { setOverlay(null); setTab('upcoming'); },
    }),
    tab === 'impact' && overlay === 'impact' && h(EventImpactPanel, { onClose: () => { setOverlay(null); setTab('upcoming'); } }),
    overlay === 'ledger' && h(React.Suspense, { fallback: div({ style: { padding: 30, textAlign: 'center', color: 'var(--text3)', fontSize: 12 } }, 'Loading…') },
      h(EventCalendarLazy, { userEvents, onUpdate, stores: treeStores, onClose: () => setOverlay(null) })));

  return h(RoutePanelShell, { title: 'Events', icon: '◷', subtitle: 'Community & business calendar, incident log, measured impact, and recurring rules — one home', onBack: onClose }, body);
}
