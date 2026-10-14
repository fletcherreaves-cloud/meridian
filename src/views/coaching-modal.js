// @ts-nocheck
// ── Coaching modal (#208) ─────────────────────────────────────────────────────
// Two taps, not a form (design-doc rule 3): store + metric are always caller-supplied, never
// chosen here. mode:'start' fires from an existing finding (Patch Heatmap's "Coach this"
// button); mode:'review' fires from a due Needs Attention item ("Log Verdict →"). Baseline and
// result are ALWAYS auto-captured (rule 1) — the only field a user ever types is the note.
import * as React from 'react';
import { ModalShell } from '../components/ModalShell.js';
import { STORE_NAMES } from '../constants.js';
import { COACHING_METRICS, REVIEW_WINDOW_DAYS, snapshotMetricValue, startCoachingCycle, recordCoachingResult } from '../engine/coaching-loop.js';
import { saveCoachingCycle, updateCoachingCycleResult } from '../lib/supabase.js';
import { dKey, addD } from '../utils/date.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);
const btn = (p, ...c) => h('button', p, ...c);

const pct = (v) => v == null ? '—' : (v * 100).toFixed(2) + '%';
const VERDICT_COLOR = { improved: '#34d399', worse: 'var(--crit)', 'no change': 'var(--text3)' };

/**
 * mode:'start'  — props: { loc, metricKey, ds, onClose, onSaved }
 * mode:'review' — props: { cycle, ds, onClose, onSaved }
 */
export function CoachingModal({ mode, loc, metricKey, cycle, ds, onClose, onSaved }) {
  const { useState, useMemo } = React;
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);
  // "When did this happen?" (owner, live, 2026-10-14): a cycle logged today but describing
  // training that happened weeks earlier captured its baseline from the WRONG window -- the
  // trailing 14 days ending TODAY, entirely AFTER the real intervention, silently erasing the
  // measured effect at review. Defaults to today (unchanged one-tap flow for the common case),
  // but is now editable backward -- never forward, startCoachingCycle() itself rejects a future
  // date. Still auto-captured, never a typed VALUE (rule 1 intact) -- this only lets the caller
  // say which date's trailing window to auto-capture.
  const today = dKey(new Date());
  const [coachedAt, setCoachedAt] = useState(today);

  const effLoc = mode === 'start' ? loc : cycle?.loc;
  const effMetric = mode === 'start' ? metricKey : cycle?.metric;
  const spec = COACHING_METRICS[effMetric];
  const storeName = STORE_NAMES[effLoc] || effLoc;

  const baseline = useMemo(
    // T12:00:00 (noon), not midnight -- matches startCoachingCycle()'s own anchor exactly, so
    // this live preview never disagrees with what the actual save computes. See that function's
    // comment: midnight falls inside the app's 4am-business-day cutover and can silently shift
    // the trailing window back a day.
    () => mode === 'start' ? snapshotMetricValue(ds, effLoc, effMetric, coachedAt + 'T12:00:00') : cycle?.baseline,
    [mode, ds, effLoc, effMetric, cycle, coachedAt]
  );
  const reviewAtPreview = useMemo(() => dKey(addD(new Date(coachedAt + 'T00:00:00'), REVIEW_WINDOW_DAYS)), [coachedAt]);
  // Live preview for mode:'review' — the SAME auto-capture the actual save will use, shown
  // before saving so the number displayed is never a guess at what will be recorded.
  const preview = useMemo(
    () => mode === 'review' ? recordCoachingResult(ds, cycle, null) : null,
    [mode, ds, cycle]
  );

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      if (mode === 'start') {
        const newCycle = startCoachingCycle(ds, { loc: effLoc, metricKey: effMetric, note, coachedAt });
        const { error } = await saveCoachingCycle(newCycle);
        if (error) throw new Error(error);
      } else {
        const { error } = await updateCoachingCycleResult(cycle.id, { result: preview.result, verdict: preview.verdict });
        if (error) throw new Error(error);
      }
      onSaved && onSaved();
      onClose && onClose();
    } catch (e) {
      setErr(String(e?.message || e));
    } finally { setSaving(false); }
  };

  if (!spec) return null;

  return h(ModalShell, {
    title: mode === 'start' ? `Coach ${spec.label} — ${storeName}` : `Follow-up — ${spec.label} at ${storeName}`,
    subtitle: mode === 'start'
      ? `Baseline is auto-captured as of the date below. Review lands in Needs Attention on ${reviewAtPreview}.`
      : `Coached ${cycle?.coachedAt}${cycle?.note ? ': "' + cycle.note + '"' : ''}`,
    icon: '🎯',
    maxWidth: 460,
    onClose,
  },
    div({ style: { padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 } },
      mode === 'start' && div({ style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        span({ style: { fontSize: '9px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px' } }, 'When did this happen?'),
        h('input', {
          type: 'date', value: coachedAt, max: today,
          onChange: e => e.target.value && setCoachedAt(e.target.value),
          style: { background: 'var(--surf3)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: '11px', padding: '5px 8px', fontFamily: 'inherit', width: 150 },
        }),
      ),
      mode === 'start' && div({ style: { display: 'flex', gap: 10, alignItems: 'baseline' } },
        span({ style: { fontSize: '9px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px' } }, 'Baseline (14 days ending that date, auto)'),
        span({ style: { fontSize: '14px', fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--mono)' } }, pct(baseline)),
      ),
      mode === 'review' && div({ style: { display: 'flex', flexDirection: 'column', gap: 6 } },
        div({ style: { display: 'flex', gap: 10 } },
          div(null,
            span({ style: { fontSize: '9px', color: 'var(--text3)', display: 'block' } }, 'Baseline'),
            span({ style: { fontSize: '13px', fontWeight: 700, fontFamily: 'var(--mono)' } }, pct(cycle?.baseline))),
          span({ style: { fontSize: '14px', color: 'var(--text3)', alignSelf: 'center' } }, '→'),
          div(null,
            span({ style: { fontSize: '9px', color: 'var(--text3)', display: 'block' } }, 'Result (last 14 days, auto)'),
            span({ style: { fontSize: '13px', fontWeight: 700, fontFamily: 'var(--mono)' } }, pct(preview?.result))),
        ),
        div({ style: { fontSize: '10px', fontWeight: 700, color: preview?.verdict ? VERDICT_COLOR[preview.verdict] : 'var(--text3)' } },
          preview?.verdict ? preview.verdict.toUpperCase()
            : 'Not enough measured data yet to verdict — recorded as a raw before/after only.'),
      ),
      mode === 'start' && div({ style: { display: 'flex', flexDirection: 'column', gap: 4 } },
        span({ style: { fontSize: '9px', color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '.4px' } }, 'What was said (optional)'),
        h('textarea', {
          value: note, onChange: e => setNote(e.target.value), rows: 3,
          placeholder: 'e.g. talked to GM about condiment portioning on the line',
          style: { background: 'var(--surf3)', border: '.5px solid var(--bdr)', borderRadius: 'var(--r)', color: 'var(--text)', fontSize: '11px', padding: '6px 8px', resize: 'vertical', fontFamily: 'inherit' },
        }),
      ),
      err && div({ style: { fontSize: '9px', color: 'var(--crit)' } }, '⚠ ' + err),
      div({ style: { display: 'flex', gap: 8, justifyContent: 'flex-end' } },
        btn({ className: 'btn btn-sm', onClick: onClose, disabled: saving }, 'Cancel'),
        btn({ className: 'btn btn-sm btn-primary', onClick: save, disabled: saving || (mode === 'start' && baseline == null) },
          saving ? 'Saving…' : mode === 'start' ? 'Start Coaching' : 'Record Follow-up'),
      ),
    ),
  );
}
