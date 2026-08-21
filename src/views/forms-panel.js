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
// Table is empty until Slice 3's pull script ships -- rendered as an honest "no data synced yet"
// state, not hidden or faked.
import * as React from 'react';
import { loadQsrFormsCompletion } from '../lib/supabase.js';
import { computeFormStoreDayRollup, computeFormSummary } from '../engine/forms-completion.js';
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
function FormSummaryRow({ f, onThresholdChange }) {
  const pct = f.passRate == null ? 0 : Math.max(0, Math.min(1, f.passRate));
  return div({ style: { padding: '10px 14px', borderBottom: '1px solid var(--bdr)' } },
    div({ style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 } },
      span({ style: { fontWeight: 700, fontSize: 13, color: 'var(--text)' } }, f.formTitle),
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

export function FormsCompletionPanel({ onClose }) {
  const [dataState, setDataState] = React.useState('idle'); // idle | loading | loaded | error
  const [rows, setRows] = React.useState([]);
  const [windowDays, setWindowDays] = React.useState(14);
  const [thresholds, setThresholds] = React.useState(loadThresholds);

  React.useEffect(() => {
    let cancelled = false;
    setDataState('loading');
    const end = new Date();
    const start = new Date(end.getTime() - windowDays * 24 * 60 * 60 * 1000);
    (async () => {
      const loaded = await loadQsrFormsCompletion({ start: start.toISOString(), end: end.toISOString() });
      if (cancelled) return;
      setRows(Array.isArray(loaded) ? loaded : []);
      setDataState('loaded');
    })().catch(() => { if (!cancelled) setDataState('error'); });
    return () => { cancelled = true; };
  }, [windowDays]);

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

  return div({ style: { display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 } },
    div({ style: { display: 'flex', gap: 8, padding: '10px 14px', borderBottom: '1px solid var(--bdr)', alignItems: 'center', justifyContent: 'space-between' } },
      div({ style: { display: 'flex', gap: 8, alignItems: 'center' } },
        span({ style: { fontSize: 11, color: 'var(--text3)' } }, 'Window:'),
        WINDOW_OPTIONS.map(d => btn({
          key: d, onClick: () => setWindowDays(d),
          style: {
            padding: '4px 10px', borderRadius: 999, border: '1px solid ' + (windowDays === d ? 'var(--accent)' : 'var(--bdr)'),
            background: windowDays === d ? 'rgba(245,188,0,.14)' : 'transparent', color: 'var(--text)', fontSize: 11, fontWeight: 600, cursor: 'pointer',
          },
        }, `${d}d`)),
      ),
      freshness && span({ style: { fontSize: 10.5, color: FRESH_COLOR[freshness.severity] } },
        freshness.staleDays <= 0 ? 'Synced today' : `Last synced ${freshness.staleDays}d ago`),
    ),
    div({ style: { flex: 1, overflowY: 'auto', minHeight: 0 } },
      dataState === 'loading' && div({ style: { padding: '40px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 } }, 'Loading form completions…'),
      dataState === 'error' && div({ style: { padding: '40px 20px', textAlign: 'center', color: 'var(--crit,#ef4444)', fontSize: 13 } }, 'Could not load form completions — try again.'),
      dataState === 'loaded' && summary.length === 0 && div({ style: { padding: '40px 20px', textAlign: 'center', color: 'var(--text3)', fontSize: 13 } },
        'No form completions synced for this window yet.'),
      dataState === 'loaded' && summary.map(f => h(FormSummaryRow, { key: f.formId, f, onThresholdChange })),
    ),
  );
}
