// @ts-nocheck
// ── Form Completions — QSRSoft Forms dashboard, Slice 2 of 3 ─────────────────────────────────────
// Owner's ask, verbatim (memory/finding-qsrsoft-forms-completion-endpoint-2026-08-21.md): "how many
// forms completed vs missed per day per store... manager submitting and completion percent."
// "Maybe include an in-app threshold. Ideally they complete them all, realistically, they need to
// complete at least 80%."
//
// Reads qsr_forms_completion (Slice 1) via loadQsrFormsCompletion(), rolls it up with the Slice 1/2
// pure engine (src/engine/forms-completion.js) -- this file owns NO business logic beyond rendering
// what the engine computes, matching this repo's own standing rule that panels don't reimplement
// math the engine already owns.
//
// normalizeFormsCompletionRow is NOT called here -- it turns a RAW completionDetail API row
// (raw.location/raw.status/raw.scheduledAt) into the table's shape, and that normalization already
// happened once, at ingest, in Slice 3's pull script. loadQsrFormsCompletion reads the ALREADY-
// NORMALIZED qsr_forms_completion columns back out (loc/occurrenceKey/statusState) -- feeding that
// back through the raw-payload normalizer would look for fields under the wrong names (raw.location
// vs the loader's .loc) and silently drop every row. computeFormStoreDayRollup takes normalized
// rows directly, which is exactly what the loader already returns.
//
// Dispatch #71: Slice 3's pull script has shipped and is scheduled -- an empty table here now
// means the pull genuinely returned nothing for the window, not that it was never built. See
// dispatch-71.md for the bug that made "genuinely nothing" and "the pull silently failed"
// indistinguishable, and the escalate-to-Playwright fix in the pull script itself.
//
// Slice 4 (dispatch #101): surfaces the per-occurrence detail loadQsrFormsCompletion already
// returns (store/form/date/completion%/time-to-complete/status) below each form's rollup row, a
// standard LocationSelector/DateRangeControl (src/components/PanelControls.js -- the same shared
// controls opportunity-dollars.js/top-bottom-performers.js already use, per
// feedback-selector-ui-standard.md), and a "completed by" resolution. That last one turned out to
// be a non-resolution, on purpose -- see the completedByCell() comment below for the measured
// reason `userId` cannot route through Security panel's RevealName/reveal_employee_identity()
// vault: Forms' completedBy name is never tokenized into it at ingest (normalizeFormsCompletionRow's
// own header comment), so there is nothing there to reveal.
import * as React from 'react';
import { loadQsrFormsCompletion } from '../lib/supabase.js';
import {
  computeFormStoreDayRollup, computeFormSummary, apiWindowForDays,
  formatDuration, sortOccurrencesForDisplay, localDayKey,
} from '../engine/forms-completion.js';
import { LocationSelector, buildLocationHierarchy, locationSelectorLocs, DateRangeControl } from '../components/PanelControls.js';
import { STORE_NAMES, INV_ORG_COORDS, sName } from '../constants.js';
// WARN_GRACE_DAYS/CRIT_GRACE_DAYS reused from stream-freshness.js rather than re-deriving new
// grace numbers -- same "a daily stream silent 2 days is an incident" calibration every other
// auto-pulled stream uses. This panel does its OWN per-stream check (below), not a pooled
// Math.max with anything else -- the #171 lesson this stream's pull script's own header
// comment cites ("standing checklist" item 2): pooling one dead feed behind fresh siblings is
// exactly what let LifeLenz go dark 6 days unnoticed.
import { WARN_GRACE_DAYS, CRIT_GRACE_DAYS } from '../engine/stream-freshness.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const DEFAULT_THRESHOLD = 0.8;
const THRESHOLDS_KEY = 'mf_forms_thresholds_v1';
const WINDOW_OPTIONS = [7, 14, 30];
// buildLocationHierarchy/locationSelectorLocs re-run every render `stores` is falsy (tests, or an
// App.js call site that hasn't wired the prop yet) -- a `stores = []` DEFAULT PARAMETER would
// allocate a fresh array on every call with no argument, giving useMemo's [treeStores] dependency
// a new reference every render and re-triggering the data-fetch effect in an infinite loop. One
// stable module-level empty array sidesteps that entirely.
const EMPTY_STORES = [];
// Occurrence detail render cap -- Travel Path alone is scheduled 27-45x/store/day (the finding
// file's own measurement), so an "All Locations" + 30d expand can be several thousand rows. Cap
// the DOM, not the underlying data -- the rollup above already reflects the full set either way.
const MAX_OCCURRENCE_ROWS = 300;

function loadThresholds() {
  try { return JSON.parse(localStorage.getItem(THRESHOLDS_KEY)) || {}; } catch { return {}; }
}
function saveThresholds(t) {
  try { localStorage.setItem(THRESHOLDS_KEY, JSON.stringify(t)); } catch { /* per-device preference only -- not worth surfacing a write failure */ }
}

const fPct = v => v == null ? '—' : (v * 100).toFixed(1) + '%';
const barColor = pass => pass === true ? 'var(--ok,#10b981)' : pass === false ? 'var(--crit,#ef4444)' : 'var(--text3)';

// Per-stream freshness for THIS panel alone -- Slice 3's pull runs daily, same cadence as
// every other QSRSoft auto-pull, so it reuses the same grace window rather than a bespoke one.
const CADENCE_DAYS = 1;
function latestOccurrenceMs(rows) {
  let best = null;
  for (const r of rows) {
    const t = r.occurrenceKey ? new Date(r.occurrenceKey).getTime() : NaN;
    if (!Number.isNaN(t) && (best === null || t > best)) best = t;
  }
  return best;
}
function freshnessOf(rows, now) {
  const latestMs = latestOccurrenceMs(rows);
  if (latestMs == null) return null; // no usable occurrence date in this window -- nothing to report
  const staleDays = Math.floor((now.getTime() - latestMs) / 864e5);
  const warnAt = CADENCE_DAYS + WARN_GRACE_DAYS, critAt = CADENCE_DAYS + CRIT_GRACE_DAYS;
  const severity = staleDays > critAt ? 'crit' : staleDays > warnAt ? 'warn' : 'ok';
  return { latestMs, staleDays, severity };
}
const FRESH_COLOR = { ok: 'var(--ok,#10b981)', warn: 'var(--warn,#f59e0b)', crit: 'var(--crit,#ef4444)' };

// One form's summary row: threshold input (per-form, owner-stated -- never a single global bar),
// the aggregate pass rate (beside the bar, never hidden behind it), and the store-days reading.
// `onToggleExpand`/`expanded` (dispatch #101) add a drill-down into that SAME form's individual
// occurrences (OccurrenceDetailTable, below) -- additive only, none of the existing markup above
// this bar changed shape.
function FormSummaryRow({ f, onThresholdChange, expanded, onToggleExpand }) {
  const pct = f.passRate == null ? 0 : Math.max(0, Math.min(1, f.passRate));
  return div({ style: { padding: '10px 14px', borderBottom: expanded ? 'none' : '1px solid var(--bdr)' } },
    div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 } },
      div({ style: { display: 'flex', alignItems: 'center', gap: 8 } },
        span({ style: { fontWeight: 700, fontSize: 13, color: 'var(--text)' } }, f.formTitle),
        btn({
          onClick: onToggleExpand,
          style: {
            fontSize: 10.5, padding: '2px 8px', borderRadius: 999, cursor: 'pointer',
            border: '1px solid ' + (expanded ? 'var(--accent)' : 'var(--bdr)'),
            background: expanded ? 'rgba(245,188,0,.12)' : 'transparent', color: 'var(--text2)',
          },
        }, expanded ? '▾ Occurrences' : '▸ Occurrences'),
      ),
      div({ style: { display: 'flex', alignItems: 'center', gap: 8 } },
        span({ style: { fontSize: 10.5, color: 'var(--text3)' } }, 'Threshold'),
        h('input', {
          type: 'number', min: 0, max: 100, step: 1,
          value: Math.round(f.threshold * 100),
          onChange: e => {
            const pct = Number(e.target.value);
            if (Number.isFinite(pct)) onThresholdChange(f.formId, Math.max(0, Math.min(100, pct)) / 100);
          },
          style: { width: 52, fontSize: 11.5, padding: '2px 5px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text)' },
        }),
        span({ style: { fontSize: 10.5, color: 'var(--text3)' } }, '%'),
      ),
    ),
    // The bar, and the pass rate BESIDE it -- CLAUDE.md's standing "say the number AND the
    // decision," sharpened: never make a reader infer the number from the bar's width alone.
    div({ style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 } },
      div({ style: { flex: 1, height: 8, borderRadius: 4, background: 'var(--surf2)', overflow: 'hidden' } },
        div({ style: { width: `${(pct * 100).toFixed(1)}%`, height: '100%', background: barColor(f.passRate >= f.threshold), borderRadius: 4 } })),
      span({ style: { fontSize: 12.5, fontWeight: 700, color: 'var(--text)', minWidth: 52, textAlign: 'right' } }, fPct(f.passRate)),
    ),
    div({ style: { fontSize: 10.5, color: 'var(--text3)', marginTop: 4 } },
      `${f.completedCount} of ${f.resolvedCount} resolved occurrences completed`,
      ` · ${f.storeDaysPassed} of ${f.storeDaysTotal} store-days ≥${Math.round(f.threshold * 100)}%`,
    ),
  );
}

const STATUS_LABEL = { completed: 'Completed', missed: 'Missed', open: 'Open' };
const STATUS_COLOR = { completed: 'var(--ok,#10b981)', missed: 'var(--crit,#ef4444)', open: 'var(--text3)' };

// Resolved store name (this repo's standard -- sName/STORE_NAMES, not a bare loc code).
// loadQsrFormsCompletion's own mapping does `String(parseInt(r.loc,10))` on the padded DB value,
// so the 'NOLOC' no-store sentinel (normalizeFormsCompletionRow's own comment: a real, documented
// completionDetail request member, not a data error) comes back as the STRING "NaN" here, not a
// real loc -- surfaced as "No location" rather than fed into sName(), which would otherwise print
// the literal, confusing "NaN — NaN".
function occurrenceStoreLabel(loc) {
  if (!loc || loc === 'NaN') return 'No location';
  return sName(loc);
}

// "Completed by" (dispatch #101 part 2) -- MEASURED, not guessed: a live pull of qsr_forms_completion
// (service-role, 2026-08-24) shows `user_id` on completed rows is a QSRSoft/Cognito account UUID
// (e.g. shape "848854c8-30f1-7076-c6f7-dcf35091bd06"), never a name or email. It is NOT already
// human-readable, so it cannot be displayed as-is (CLAUDE.md: "never display a raw ID as if it
// were a name").
//
// It also does NOT resolve through Security panel's RevealName / reveal_employee_identities_bulk
// path, and this was checked rather than assumed: that RPC reads Meridian's OWN
// employee_identity_vault, which is populated ONLY by routing a plaintext name through
// get_or_create_employee_token() at ingest (src/engine/identity-vault.js) -- e.g. register-audit
// rows, which carry a plaintext `emp` name to tokenize. Forms' ingest never does this:
// normalizeFormsCompletionRow's own header comment states `completedBy` (the plaintext name QSRSoft
// actually returns) "is deliberately never read here and never appears in the output" -- so no
// vault row keyed on Forms' userId, or on any name behind it, has ever been created. Calling the
// reveal RPC with a Forms userId would just find nothing; that is a wrong identity system, not a
// permission the caller lacks. Building a NEW resolution (tokenizing completedBy into the vault at
// Forms-pull time, or joining the QSRSoft employee-roster's `geid` -- a still-unconfirmed different
// ID space, see memory/finding-qsrsoft-employee-roster-endpoint-2026-08-21.md) is an ingest/schema
// change, out of scope for this additive UI dispatch -- flagged as follow-up in the dispatch
// resolution rather than built unreviewed here.
//
// So: never a name. The opaque UUID is shown ONLY to the privileged tier (admin/developer collapse
// to the DB role 'admin', same tier Security panel's dispatch #50 Part B gives frictionless
// identity access to) as a short, explicitly-labeled diagnostic reference -- clearly not a name,
// usable to cross-reference in QSRSoft directly if ever needed. Every other role sees the same '—'
// a row with no userId gets, matching Security's discipline of not exposing a person-key to a role
// that would not get identity information there either.
function completedByCell(userId, isPrivileged) {
  if (!userId) return span({ style: { color: 'var(--text3)' } }, '—');
  if (!isPrivileged) return span({ style: { color: 'var(--text3)' } }, '—');
  return span({
    title: `QSRSoft user ID ${userId} -- no name on file (see completedByCell's own comment, forms-panel.js)`,
    style: { fontFamily: 'var(--mono, monospace)', fontSize: 10, color: 'var(--text3)' },
  }, `ID ${userId.slice(0, 8)}…`);
}

// Per-occurrence detail (dispatch #101 part 1) -- the individual rows loadQsrFormsCompletion
// already returns for this form, discarded today after computeFormStoreDayRollup consumes them.
// Sorting is sortOccurrencesForDisplay's job (forms-completion.js), not this component's -- per
// this file's own header comment, panels don't reimplement math/ordering the engine already owns.
function OccurrenceDetailTable({ occurrences, isPrivileged }) {
  if (!occurrences.length) {
    return div({ style: { padding: '10px 14px', fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' } },
      'No occurrences in the current window/location scope.');
  }
  const shown = occurrences.slice(0, MAX_OCCURRENCE_ROWS);
  const cols = ['Store', 'Form', 'Date', 'Status', 'Completion %', 'Time to Complete', 'Completed By'];
  return div({ style: { padding: '0 14px 10px', overflowX: 'auto' } },
    occurrences.length > shown.length && div({ style: { fontSize: 10, color: 'var(--text3)', margin: '4px 0' } },
      `Showing first ${shown.length} of ${occurrences.length} occurrences — narrow the location or date range for the rest.`),
    h('table', { style: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: 11 } },
      h('thead', null, h('tr', null, ...cols.map(c => h('th', {
        key: c, style: { textAlign: 'left', padding: '4px 8px', color: 'var(--text3)', fontWeight: 600, fontSize: 10, borderBottom: '1px solid var(--bdr)' },
      }, c)))),
      h('tbody', null, ...shown.map((r, i) => h('tr', { key: r.loc + '|' + r.occurrenceKey + '|' + i, style: { borderBottom: '1px solid var(--bdr)' } },
        h('td', { style: { padding: '4px 8px', whiteSpace: 'nowrap' } }, occurrenceStoreLabel(r.loc)),
        h('td', { style: { padding: '4px 8px' } }, r.formTitle),
        h('td', { style: { padding: '4px 8px', whiteSpace: 'nowrap', fontFamily: 'var(--mono, monospace)' } }, r.occurrenceKey ? localDayKey(r.occurrenceKey) : '—'),
        h('td', { style: { padding: '4px 8px', color: STATUS_COLOR[r.statusState] || 'var(--text)', fontWeight: 600 } }, STATUS_LABEL[r.statusState] || r.statusState || '—'),
        h('td', { style: { padding: '4px 8px', textAlign: 'right' } }, fPct(r.completionRatio)),
        h('td', { style: { padding: '4px 8px', textAlign: 'right' } }, formatDuration(r.timeToCompleteMs)),
        h('td', { style: { padding: '4px 8px' } }, completedByCell(r.userId, isPrivileged)),
      ))),
    ),
  );
}

export function FormsCompletionPanel({ onClose, stores, userRole }) {
  const [dataState, setDataState] = React.useState('idle'); // idle | loading | loaded | error
  const [rows, setRows] = React.useState([]);
  const [windowDays, setWindowDays] = React.useState(14);
  const [thresholds, setThresholds] = React.useState(loadThresholds);
  // Location scope (dispatch #101 part 3) -- the shared LocationSelector/{level,id} shape every
  // other 4-level panel already uses (opportunity-dollars.js, top-bottom-performers.js), not a
  // bespoke re-implementation. {level:'all', id:null} is its own "no filter" default.
  const [scope, setScope] = React.useState({ level: 'all', id: null });
  // Real date-range control (dispatch #101 part 4) -- null means "use the windowDays pill above,"
  // {id:'custom', s, e} (DateRangeControl's own shape, calendar-day strings) overrides it. The
  // pills stay a working, unchanged shortcut on top of this, per the dispatch's explicit "keep
  // the quick-window buttons, don't remove them."
  const [customRange, setCustomRange] = React.useState(null);
  const [expandedFormId, setExpandedFormId] = React.useState(null);

  const treeStores = stores || EMPTY_STORES;
  const tree = React.useMemo(() => buildLocationHierarchy(treeStores, INV_ORG_COORDS, STORE_NAMES), [treeStores]);
  const locs = React.useMemo(() => locationSelectorLocs(scope, tree), [scope, tree]);

  React.useEffect(() => {
    let cancelled = false;
    setDataState('loading');
    let start, end;
    if (customRange && customRange.s && customRange.e) {
      // apiWindowForDays (forms-completion.js) -- the SAME America/Chicago local-midnight boundary
      // computeFormStoreDayRollup buckets days on, not a naive UTC day. Reused rather than a second
      // inline offset, per this file's own header comment.
      const w = apiWindowForDays(customRange.s, customRange.e);
      start = w.startDate; end = w.endDate;
    } else {
      const endD = new Date();
      const startD = new Date(endD.getTime() - windowDays * 24 * 60 * 60 * 1000);
      start = startD.toISOString(); end = endD.toISOString();
    }
    (async () => {
      const loaded = await loadQsrFormsCompletion({ start, end, locs: locs.length ? locs : undefined });
      if (cancelled) return;
      setRows(Array.isArray(loaded) ? loaded : []);
      setDataState('loaded');
    })().catch(() => { if (!cancelled) setDataState('error'); });
    return () => { cancelled = true; };
  }, [windowDays, customRange, locs]);

  const onThresholdChange = React.useCallback((formId, pct) => {
    setThresholds(prev => {
      const next = { ...prev, [formId]: pct };
      saveThresholds(next);
      return next;
    });
  }, []);

  const rollup = React.useMemo(() => computeFormStoreDayRollup(rows, { thresholds, defaultThreshold: DEFAULT_THRESHOLD }), [rows, thresholds]);
  const summary = React.useMemo(() => computeFormSummary(rollup), [rollup]);
  const freshness = React.useMemo(() => dataState === 'loaded' ? freshnessOf(rows, new Date()) : null, [rows, dataState]);
  // Developer/Admin/Owner collapse to the single real DB role value 'admin' (CLAUDE.md's own
  // documented finding, same tier Security panel's dispatch #50 Part B frictionless-reveal uses).
  const isPrivileged = userRole === 'admin';

  return div({ style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
    div({ style: { display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--bdr)', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' } },
      div({ style: { display: 'flex', gap: 8, alignItems: 'center' } },
        span({ style: { fontSize: 11, color: 'var(--text3)' } }, 'Window:'),
        WINDOW_OPTIONS.map(d => btn({
          key: d, onClick: () => { setCustomRange(null); setWindowDays(d); },
          style: {
            padding: '4px 10px', borderRadius: 999, border: '1px solid ' + (!customRange && windowDays === d ? 'var(--accent)' : 'var(--bdr)'),
            background: !customRange && windowDays === d ? 'rgba(245,188,0,.14)' : 'transparent', color: 'var(--text)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          },
        }, `${d}d`)),
      ),
      freshness && span({ style: { fontSize: 10.5, color: FRESH_COLOR[freshness.severity] } },
        freshness.staleDays <= 0 ? 'Synced today' : `Last synced ${freshness.staleDays}d ago`),
    ),
    // Real date-range control (dispatch #101 part 4), alongside the pills above.
    div({ style: { display: 'flex', gap: 8, padding: '8px 14px', borderBottom: '1px solid var(--bdr)', alignItems: 'center', flexWrap: 'wrap' } },
      span({ style: { fontSize: 11, color: 'var(--text3)' } }, 'Date range:'),
      h(DateRangeControl, { presets: [], allowCustom: true, value: customRange, onChange: setCustomRange }),
      customRange && btn({
        onClick: () => setCustomRange(null),
        style: { fontSize: 10.5, color: 'var(--text3)', background: 'none', border: '1px solid var(--bdr)', borderRadius: 999, padding: '3px 9px', cursor: 'pointer' },
      }, `Using ${customRange.s} → ${customRange.e} — Clear`),
    ),
    // Location selector (dispatch #101 part 3) -- All -> State -> Patch -> Store, the shared
    // control per feedback-selector-ui-standard.md.
    div({ style: { padding: '8px 14px', borderBottom: '1px solid var(--bdr)' } },
      h(LocationSelector, { stores: treeStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, value: scope, onChange: setScope }),
    ),
    div({ style: { flex: 1, overflowY: 'auto', minHeight: 0 } },
      dataState === 'loading' && div({ style: { padding: '40px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 } }, 'Loading form completions…'),
      dataState === 'error' && div({ style: { padding: '40px 20px', textAlign: 'center', color: 'var(--crit,#ef4444)', fontSize: 13 } }, 'Could not load form completions — try again.'),
      dataState === 'loaded' && summary.length === 0 && div({ style: { padding: '40px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 } },
        'No form completions synced for this window yet.'),
      dataState === 'loaded' && summary.map(f => h(React.Fragment, { key: f.formId },
        h(FormSummaryRow, {
          f, onThresholdChange,
          expanded: expandedFormId === f.formId,
          onToggleExpand: () => setExpandedFormId(id => id === f.formId ? null : f.formId),
        }),
        expandedFormId === f.formId && div({ style: { borderBottom: '1px solid var(--bdr)' } },
          h(OccurrenceDetailTable, { occurrences: sortOccurrencesForDisplay(rows.filter(r => r.formId === f.formId)), isPrivileged }),
        ),
      )),
    ),
  );
}
