// @ts-nocheck
// ── MCDOK People Review Forms — UI (reads qsr_forms_reviews via loadQsrFormsReviews) ────────────
// Crew Review / Crew Trainer Review / Maintenance Review / Shift Manager Review. See
// src/engine/forms-reviews.js's header and memory/finding-qsrsoft-review-forms-schedules-
// endpoint-2026-10-08.md for the full capture this is built from -- a SEPARATE source from
// forms-panel.js's Form Completions (qsr_forms_completion), not an extension of it.
//
// This file owns NO business logic beyond rendering what the engine computes
// (computeReviewFormSummary/sortReviewOccurrencesForDisplay), matching forms-panel.js's own
// standing rule that panels don't reimplement math the engine already owns.
//
// 🔴 The real Score here is POINTS-WEIGHTED (Σ pointsReceived / Σ pointsPossible), NOT
// completion_ratio (answered/total question count) -- measured two reviews both ~97% answered-
// by-count scoring 29% and 91% respectively by points. Both numbers are shown, never just one,
// per CLAUDE.md's "say the number AND the decision" rule -- a reader who only saw "97% complete"
// would draw exactly the wrong conclusion about review quality.
//
// 🔴 Crew Review's score/content is genuinely unavailable to this account (measured 11/11 denied
// -- CONTENT_ACCESSIBLE_FORM_IDS in forms-reviews.js), not a loading bug. The occurrence list
// still shows Crew Review rows (location, date, answered/total) -- only the score and the
// drill-down content are replaced with an explicit "Confidential — not viewable" state, so a
// reader can't mistake "no data yet" for "this will never be available."
import * as React from 'react';
import { loadQsrFormsReviews } from '../lib/supabase.js';
import {
  computeReviewFormSummary, sortReviewOccurrencesForDisplay, CONTENT_ACCESSIBLE_FORM_IDS,
} from '../engine/forms-reviews.js';
import { LocationSelector, buildLocationHierarchy, locationSelectorLocs, DateRangeControl } from '../components/PanelControls.js';
import { STORE_NAMES, INV_ORG_COORDS, sName } from '../constants.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const LazyExportDropdown = React.lazy(() =>
  import('./store-dash.js').then(m => ({ default: m.ExportDropdown })));

const WINDOW_OPTIONS = [14, 30, 90];
// These forms run per-store, not daily (far lower cadence than a shift checklist) -- same
// thresholds the pull script's own checkFreshness() call uses (qsrsoft-forms-reviews-pull.mjs),
// so the UI and the pipeline agree on what "stale" means for this specific stream. Reusing
// stream-freshness.js's daily WARN_GRACE_DAYS/CRIT_GRACE_DAYS here would be the wrong fit --
// that file's own calibration is explicitly for daily streams.
const WARN_HOURS = 72, CRIT_HOURS = 168;
// EMPTY_STORES: one stable module-level reference, same reason forms-panel.js keeps one -- a
// `stores = []` default parameter would allocate fresh on every render with no prop, re-triggering
// the data-fetch effect via useMemo's dependency array.
const EMPTY_STORES = [];
const MAX_OCCURRENCE_ROWS = 300;

const fPct = v => v == null ? '—' : v.toFixed(1) + '%';
const fRatio = v => v == null ? '—' : (v * 100).toFixed(1) + '%';
const barColor = pct => pct == null ? 'var(--text3)' : pct >= 80 ? 'var(--ok,#10b981)' : pct >= 60 ? 'var(--warn,#f59e0b)' : 'var(--crit,#ef4444)';

// Same NaN-sentinel handling as forms-panel.js's occurrenceStoreLabel -- normalizeLoc's 'NOLOC'
// (a real, documented sentinel for a response with no store attached) round-trips through
// loadQsrFormsReviews's `String(parseInt(r.loc,10))` as the literal string "NaN".
function occurrenceStoreLabel(loc) {
  if (!loc || loc === 'NaN') return 'No location';
  return sName(loc);
}

function freshnessOf(rows, now) {
  let latestMs = null;
  for (const r of rows) {
    const t = r.startedAt ? new Date(r.startedAt).getTime() : NaN;
    if (!Number.isNaN(t) && (latestMs === null || t > latestMs)) latestMs = t;
  }
  if (latestMs == null) return null;
  const ageHours = (now.getTime() - latestMs) / 3_600_000;
  const severity = ageHours > CRIT_HOURS ? 'crit' : ageHours > WARN_HOURS ? 'warn' : 'ok';
  return { ageHours, severity };
}
const FRESH_COLOR = { ok: 'var(--ok,#10b981)', warn: 'var(--warn,#f59e0b)', crit: 'var(--crit,#ef4444)' };

// One form's summary row -- score bar (points-weighted) + the raw occurrence count, and an
// "▸ Occurrences" toggle mirroring forms-panel.js's FormSummaryRow shape.
function FormSummaryRow({ f, expanded, onToggleExpand }) {
  const contentEligible = CONTENT_ACCESSIBLE_FORM_IDS.has(f.formId);
  const pct = f.avgScorePct == null ? 0 : Math.max(0, Math.min(100, f.avgScorePct));
  return div({ style: { padding: '10px 14px', borderBottom: expanded ? 'none' : '1px solid var(--bdr)' } },
    div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' } },
      div({ style: { display: 'flex', alignItems: 'center', gap: 8 } },
        span({ style: { fontWeight: 700, fontSize: 13, color: 'var(--text)' } }, f.formTitle),
        btn({
          onClick: onToggleExpand,
          style: {
            fontSize: 10.5, padding: '2px 8px', borderRadius: 999, cursor: 'pointer',
            border: '1px solid ' + (expanded ? 'var(--accent)' : 'var(--bdr)'),
            background: expanded ? 'rgba(245,188,0,.12)' : 'transparent', color: 'var(--text2)',
          },
        }, expanded ? `▾ Occurrences (${f.occurrenceCount})` : `▸ Occurrences (${f.occurrenceCount})`),
      ),
      !contentEligible && span({
        style: { fontSize: 10, color: 'var(--text3)', fontStyle: 'italic' },
        title: 'Measured 2026-10-08: this form\'s score/content is not reachable by this account (403, confidential).',
      }, 'Confidential — score not viewable'),
    ),
    contentEligible && div({ style: { display: 'flex', alignItems: 'center', gap: 10, marginTop: 6 } },
      div({ style: { flex: 1, height: 8, borderRadius: 4, background: 'var(--surf2)', overflow: 'hidden' } },
        div({ style: { width: `${pct}%`, height: '100%', background: barColor(f.avgScorePct), borderRadius: 4 } })),
      span({ style: { fontSize: 12.5, fontWeight: 700, color: 'var(--text)', minWidth: 52, textAlign: 'right' } }, fPct(f.avgScorePct)),
    ),
    contentEligible && div({ style: { fontSize: 10.5, color: 'var(--text3)', marginTop: 4 } },
      `Score: Σ points earned / Σ points possible across ${f.scoredCount} of ${f.occurrenceCount} occurrences with content fetched`,
    ),
  );
}

// One occurrence's content drill-down -- the actual review: question + the answer label it
// resolved to + points. PII allow-listed already at normalizeFormsReviewContent() time (free
// text, including the wage field these forms embed, never reaches `content` at all) -- this
// component has nothing left to filter, it only renders what already passed that gate.
function OccurrenceContent({ row }) {
  if (!CONTENT_ACCESSIBLE_FORM_IDS.has(row.formId)) {
    return div({ style: { padding: '8px 12px', fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' } },
      'Confidential — this form\'s content is not viewable by this account (measured, not a loading issue).');
  }
  if (!row.contentAvailable) {
    return div({ style: { padding: '8px 12px', fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' } },
      'Content not yet fetched for this occurrence — it will populate on the next sync.');
  }
  if (!row.content || row.content.length === 0) {
    return div({ style: { padding: '8px 12px', fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' } },
      'No rated questions answered yet for this occurrence.');
  }
  return div({ style: { padding: '6px 12px 10px' } },
    ...row.content.map((q, i) => div({
      key: q.questionId || i,
      style: { display: 'flex', justifyContent: 'space-between', gap: 10, padding: '5px 0', borderBottom: i < row.content.length - 1 ? '1px solid var(--bdr)' : 'none' },
    },
      span({ style: { fontSize: 11.5, color: 'var(--text2)', flex: 1 } }, q.title || '—'),
      div({ style: { display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 } },
        q.answerLabel != null && span({ style: { fontSize: 11.5, fontWeight: 600, color: 'var(--text)' } }, q.answerLabel),
        q.pointsPossible > 0 && span({ style: { fontSize: 10.5, color: 'var(--text3)', fontFamily: 'var(--mono, monospace)' } }, `${q.pointsReceived ?? 0}/${q.pointsPossible}`),
      ),
    )),
  );
}

function occurrenceKeyOf(r) { return `${r.loc}|${r.formId}|${r.startedAt}`; }

// Per-occurrence table (one form's rows) -- clicking a row toggles OccurrenceContent below it.
function OccurrenceDetailTable({ occurrences, expandedKey, onToggleRow }) {
  if (!occurrences.length) {
    return div({ style: { padding: '10px 14px', fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' } },
      'No occurrences in the current window/location scope.');
  }
  const shown = occurrences.slice(0, MAX_OCCURRENCE_ROWS);
  const cols = ['Store', 'Started', 'Answered', 'Score'];
  return div({ style: { padding: '0 14px 10px', overflowX: 'auto' } },
    occurrences.length > shown.length && div({ style: { fontSize: 10, color: 'var(--text3)', margin: '4px 0' } },
      `Showing first ${shown.length} of ${occurrences.length} occurrences — narrow the location or date range for the rest.`),
    h('table', { style: { width: 'max-content', minWidth: '100%', borderCollapse: 'collapse', fontSize: 11 } },
      h('thead', null, h('tr', null, ...cols.map(c => h('th', {
        key: c, style: { textAlign: 'left', padding: '4px 8px', color: 'var(--text3)', fontWeight: 600, fontSize: 10, borderBottom: '1px solid var(--bdr)' },
      }, c)))),
      h('tbody', null, ...shown.map(r => {
        const key = occurrenceKeyOf(r);
        const isOpen = expandedKey === key;
        return h(React.Fragment, { key },
          h('tr', {
            onClick: () => onToggleRow(key), style: { borderBottom: isOpen ? 'none' : '1px solid var(--bdr)', cursor: 'pointer' },
          },
            h('td', { style: { padding: '4px 8px', whiteSpace: 'nowrap' } }, (isOpen ? '▾ ' : '▸ ') + occurrenceStoreLabel(r.loc)),
            h('td', { style: { padding: '4px 8px', whiteSpace: 'nowrap', fontFamily: 'var(--mono, monospace)' } }, new Date(r.startedAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })),
            h('td', { style: { padding: '4px 8px', textAlign: 'right' } }, `${r.answeredQuestions ?? '—'}/${r.totalQuestions ?? '—'} (${fRatio(r.completionRatio)})`),
            h('td', { style: { padding: '4px 8px', textAlign: 'right', fontWeight: 600, color: r.scorePct != null ? barColor(r.scorePct) : 'var(--text3)' } },
              r.scorePct != null ? fPct(r.scorePct) : (CONTENT_ACCESSIBLE_FORM_IDS.has(r.formId) ? '—' : 'Confidential')),
          ),
          isOpen && h('tr', null, h('td', { colSpan: cols.length, style: { padding: 0, background: 'var(--surf2)' } }, h(OccurrenceContent, { row: r }))),
        );
      })),
    ),
  );
}

export function FormsReviewsPanel({ onClose, stores }) {
  const [dataState, setDataState] = React.useState('idle'); // idle | loading | loaded | error
  const [rows, setRows] = React.useState([]);
  const [windowDays, setWindowDays] = React.useState(30);
  const [scope, setScope] = React.useState({ level: 'all', id: null });
  const [customRange, setCustomRange] = React.useState(null);
  const [expandedFormId, setExpandedFormId] = React.useState(null);
  const [expandedOccurrenceKey, setExpandedOccurrenceKey] = React.useState(null);

  const treeStores = stores || EMPTY_STORES;
  const tree = React.useMemo(() => buildLocationHierarchy(treeStores, INV_ORG_COORDS, STORE_NAMES), [treeStores]);
  const locs = React.useMemo(() => locationSelectorLocs(scope, tree), [scope, tree]);

  React.useEffect(() => {
    let cancelled = false;
    setDataState('loading');
    let start, end;
    if (customRange && customRange.s && customRange.e) {
      start = new Date(`${customRange.s}T00:00:00.000Z`).toISOString();
      end = new Date(`${customRange.e}T23:59:59.999Z`).toISOString();
    } else {
      const endD = new Date();
      const startD = new Date(endD.getTime() - windowDays * 24 * 60 * 60 * 1000);
      start = startD.toISOString(); end = endD.toISOString();
    }
    (async () => {
      const loaded = await loadQsrFormsReviews({ start, end, locs: locs.length ? locs : undefined });
      if (cancelled) return;
      setRows(Array.isArray(loaded) ? loaded : []);
      setDataState('loaded');
    })().catch(() => { if (!cancelled) setDataState('error'); });
    return () => { cancelled = true; };
  }, [windowDays, customRange, locs]);

  const summary = React.useMemo(() => computeReviewFormSummary(rows), [rows]);
  const freshness = React.useMemo(() => dataState === 'loaded' ? freshnessOf(rows, new Date()) : null, [rows, dataState]);

  const exportRows = React.useMemo(() => sortReviewOccurrencesForDisplay(rows).map(r => ({
    Store: occurrenceStoreLabel(r.loc), Form: r.formTitle,
    Started: r.startedAt, Answered: r.answeredQuestions, Total: r.totalQuestions,
    'Score %': r.scorePct == null ? '' : r.scorePct.toFixed(1),
  })), [rows]);
  const exportCols = ['Store', 'Form', 'Started', 'Answered', 'Total', 'Score %'];

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
      div({ style: { display: 'flex', alignItems: 'center', gap: 10 } },
        freshness && span({ style: { fontSize: 10.5, color: FRESH_COLOR[freshness.severity] } },
          freshness.ageHours < 1 ? 'Synced within the hour' : `Last occurrence ${Math.round(freshness.ageHours / 24) || '<1'}d ago`),
        !dataState.match(/loading|idle/) && rows.length > 0 && h(React.Suspense, {
          fallback: h('button', { className: 'btn btn-sm', style: { opacity: .5 }, disabled: true }, '⬇ Export') },
          h(LazyExportDropdown, { rows: exportRows, columns: exportCols, title: 'MCDOK People Review Forms', filename: 'forms-reviews' }),
        ),
      ),
    ),
    div({ style: { display: 'flex', gap: 8, padding: '8px 14px', borderBottom: '1px solid var(--bdr)', alignItems: 'center', flexWrap: 'wrap' } },
      span({ style: { fontSize: 11, color: 'var(--text3)' } }, 'Date range:'),
      h(DateRangeControl, { presets: [], allowCustom: true, value: customRange, onChange: setCustomRange }),
      customRange && btn({
        onClick: () => setCustomRange(null),
        style: { fontSize: 10.5, color: 'var(--text3)', background: 'none', border: '1px solid var(--bdr)', borderRadius: 999, padding: '3px 9px', cursor: 'pointer' },
      }, `Using ${customRange.s} → ${customRange.e} — Clear`),
    ),
    div({ style: { padding: '8px 14px', borderBottom: '1px solid var(--bdr)' } },
      h(LocationSelector, { stores: treeStores, invOrgCoords: INV_ORG_COORDS, storeNames: STORE_NAMES, value: scope, onChange: setScope }),
    ),
    div({ style: { flex: 1, overflowY: 'auto', minHeight: 0 } },
      dataState === 'loading' && div({ style: { padding: '40px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 } }, 'Loading review forms…'),
      dataState === 'error' && div({ style: { padding: '40px 20px', textAlign: 'center', color: 'var(--crit,#ef4444)', fontSize: 13 } }, 'Could not load review forms — try again.'),
      dataState === 'loaded' && summary.length === 0 && div({ style: { padding: '40px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 } },
        'No reviews synced for this window yet.'),
      dataState === 'loaded' && summary.map(f => h(React.Fragment, { key: f.formId },
        h(FormSummaryRow, {
          f,
          expanded: expandedFormId === f.formId,
          onToggleExpand: () => setExpandedFormId(id => id === f.formId ? null : f.formId),
        }),
        expandedFormId === f.formId && div({ style: { borderBottom: '1px solid var(--bdr)' } },
          h(OccurrenceDetailTable, {
            occurrences: sortReviewOccurrencesForDisplay(rows.filter(r => r.formId === f.formId)),
            expandedKey: expandedOccurrenceKey,
            onToggleRow: key => setExpandedOccurrenceKey(k => k === key ? null : key),
          }),
        ),
      )),
    ),
  );
}
