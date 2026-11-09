// @ts-nocheck
// ── The Spot-Check Ruler — UI surface (task #129) ───────────────────────────────────────────────
// memory/plan-count-cycle-surfaces-and-spotcheck-ruler-2026-11-08.md §B. Pure presentation +
// on-demand data assembly over src/engine/spot-check-ruler.js's buildSpotCheckRuler(). Two call
// sites wire into this file: count-cycle-panel.js (an on-demand "📋 Ruler" button per store, the
// standing/re-visitable surface) and curated-home.js (the timed prompt when a fresh count session
// lands). Both read the SAME underlying worksheet data — a delivery-surface decision, not two
// computations (owner's own framing, 2026-11-08).
import * as React from 'react';
import { ModalShell } from '../components/ModalShell.js';
import { buildSpotCheckRuler } from '../engine/spot-check-ruler.js';
import { fobSnapshotByStore } from '../engine/eom-inventory.js';
import {
  loadQsrVarianceStat, loadQsrFob, loadInvCountSessions, loadMonthlyTargets, createEomShareLink,
  saveSpotCheckRulerNote, loadSpotCheckRulerNote,
  loadSpotCheckRulerConfig, saveSpotCheckRulerConfig, DEFAULT_SPOT_CHECK_RULER_CONFIG,
} from '../lib/supabase.js';
import { DEFAULT_TARGETS, unpadLoc } from '../constants.js';
import { shareOrCopy } from '../utils/share.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

const DOW_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ── Pure data assembly (no React) — given raw loaded rows, builds the ruler for one store ──────
// Exported so the weekly digest UI preview (if ever added) and tests can call the SAME assembly
// the on-demand modal uses, without duplicating the FOB-snapshot-as-of-date logic.
export function assembleRulerInputs({ loc, countDate, periodType, fobRows = [], varianceRows = [], sessionLogRows = [], targets = {} }) {
  // qsr_fob components are cumulative-MTD-as-of-date (QSRSoft's own convention, see
  // eom-inventory.js's fobSnapshotByStore) — there is no separate "weekly FOB"; a weekly count's
  // Q1 answer is simply "FOB as of the count date", the same figure an EOM count reads on the
  // last day of the month. Filtering to rows on/before countDate and taking fobSnapshotByStore's
  // latest-row-in-period gives exactly that for either period type, with zero new aggregation.
  const upTo = (fobRows || []).filter(r => !countDate || String(r.date).slice(0, 10) <= countDate);
  const period = countDate ? countDate.slice(0, 7) : null;
  const byLoc = period ? fobSnapshotByStore(upTo, period) : {};
  const padded = String(loc).padStart(7, '0');
  const fobSnap = byLoc[padded] || byLoc[String(parseInt(loc, 10))] || null;
  return { fobSnap, varianceRows, sessionLogRows, targets };
}

/** One printable, shareable worksheet for a single store + count period. */
export function SpotCheckRulerWorksheet({ ruler, note, onNoteChange, readOnly = false }) {
  if (!ruler) return null;
  const cf = ruler.counterfactual || {};
  const money = n => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n || 0)).toLocaleString();
  const pct = n => n == null ? '—' : `${(n * 100).toFixed(2)}%`;

  return div({ className: 'scr-worksheet', style: { fontSize: 13, lineHeight: 1.55 } },
    div({ style: { marginBottom: 10, color: 'var(--text3,#6b7280)', fontSize: 11.5 } },
      `${ruler.storeName || ruler.loc} · ${ruler.periodType === 'eom' ? 'End-of-Month' : 'Weekly'} count · ${ruler.countDate || ruler.period || ''}`),

    // ── The 7 questions ──────────────────────────────────────────────────────────────────────
    div({ className: 'scr-questions' },
      ruler.questions.map((qq, i) => div({
        key: qq.id, className: 'scr-q', 'data-qid': qq.id,
        style: { padding: '9px 0', borderBottom: i < ruler.questions.length - 1 ? '1px solid var(--bdr,#e5e7eb)' : 'none' },
      },
        div({ style: { fontWeight: 700, marginBottom: 3 } }, `${i + 1}. ${qq.q}`),
        qq.answer
          ? div({ className: 'scr-answer', style: { color: 'var(--text,#111827)' } }, qq.answer)
          : div({ className: 'scr-no-answer', style: { color: 'var(--text3,#6b7280)', fontStyle: 'italic' } }, qq.note || 'Ask directly.'),
        (!qq.answer && qq.note && qq.answer !== null && qq.auto) ? div({ style: { fontSize: 11, color: 'var(--text3,#6b7280)', marginTop: 2 } }, qq.note) : null,
        (qq.auto && qq.note && qq.answer) ? div({ style: { fontSize: 11, color: 'var(--text3,#6b7280)', marginTop: 2 } }, qq.note) : null,
        qq.link ? h('a', { href: qq.link, target: '_blank', rel: 'noreferrer', style: { fontSize: 11.5, display: 'inline-block', marginTop: 4 } }, '🔗 Open the real FOB / On-Hand / Variance reports') : null,
      ))),

    // ── The counterfactual box — the real insight ───────────────────────────────────────────
    div({
      className: 'scr-counterfactual',
      style: {
        marginTop: 14, padding: 12, borderRadius: 10,
        background: cf.flagged ? 'var(--amber-bg,#fff8e1)' : 'var(--surf2,#f3f4f6)',
        border: cf.flagged ? '1px solid var(--gold,#f5bc00)' : '1px solid var(--bdr,#e5e7eb)',
      },
    },
      div({ style: { fontWeight: 700, marginBottom: 6 } }, 'Counterfactual — what if those items had been ±$0?'),
      cf.topMovers && cf.topMovers.length ? div(null,
        div({ style: { marginBottom: 4 } },
          `Top ${cf.topMovers.length} mover${cf.topMovers.length === 1 ? '' : 's'}: `,
          cf.topMovers.map(v => `${v.descr} (${v.dolDiff < 0 ? '-' : '+'}${money(Math.abs(v.dolDiff))}${v.rolledUpWrins ? `, net of ${v.rolledUpWrins.length} WRINs` : ''})`).join(', '),
          ` — combined ${money(cf.combinedDollars)}, ${cf.swingPts != null ? `${cf.swingPts > 0 ? '+' : ''}${cf.swingPts.toFixed(2)}pp` : '—'} of sales.`),
        div({ className: 'scr-fob-compare', style: { display: 'flex', gap: 18, margin: '6px 0' } },
          div(null, span({ style: { color: 'var(--text3,#6b7280)' } }, 'FOB as reported: '), span({ style: { fontWeight: 700 } }, pct(cf.fobAsReportedPct))),
          div(null, span({ style: { color: 'var(--text3,#6b7280)' } }, 'FOB without them: '), span({ style: { fontWeight: 700 } }, pct(cf.fobWithoutMoversPct))),
          cf.targetPct != null ? div(null, span({ style: { color: 'var(--text3,#6b7280)' } }, 'Target: '), span(null, pct(cf.targetPct))) : null,
        ),
        div({ className: 'scr-flag', style: { fontWeight: cf.flagged ? 700 : 400, color: cf.flagged ? '#92400e' : 'var(--text3,#6b7280)' } },
          cf.flagged ? `⚠ ${cf.flagReason}` : 'Gap is small — the count and the report agree on their own merits.'),
      ) : div({ style: { color: 'var(--text3,#6b7280)' } }, 'No variance/stat data on record for this period yet.'),
    ),

    // ── Hard impossibilities ────────────────────────────────────────────────────────────────
    ruler.impossibilities && ruler.impossibilities.length ? div({
      className: 'scr-impossibilities',
      style: { marginTop: 10, padding: 10, borderRadius: 8, background: 'var(--crit-bg,#fef2f2)', border: '1px solid var(--crit,#dc2626)' },
    },
      div({ style: { fontWeight: 700, color: 'var(--crit,#dc2626)', marginBottom: 4 } }, `🚫 ${ruler.impossibilities.length} value${ruler.impossibilities.length === 1 ? '' : 's'} that cannot be correct`),
      ruler.impossibilities.map((f, i) => div({ key: i, style: { fontSize: 12, marginBottom: 2 } }, `${f.descr || f.wrin}: ${f.detail}`)),
    ) : null,

    // ── DO/supervisor notes (Q5/Q6/Q7 answers + free text) ──────────────────────────────────
    div({ className: 'scr-notes', style: { marginTop: 14, borderTop: '1px solid var(--bdr,#e5e7eb)', paddingTop: 10 } },
      div({ style: { fontWeight: 700, marginBottom: 6, fontSize: 12 } }, 'From the actual conversation'),
      readOnly
        ? div({ style: { fontSize: 12.5, color: 'var(--text2,#4b5563)', whiteSpace: 'pre-wrap' } }, note?.notes || 'No notes logged yet.')
        : div(null,
            ratingScale('Q5 — confidence (1 = not confident, 5 = very confident)', note?.confidenceRating, v => onNoteChange?.({ ...note, confidenceRating: v })),
            yesNo('Q6 — did they review the reports?', note?.reportsReviewed, v => onNoteChange?.({ ...note, reportsReviewed: v })),
            note?.reportsReviewed === true
              ? labeledTextarea('Q7 — what did they find?', note?.reportsReviewedAnswer, v => onNoteChange?.({ ...note, reportsReviewedAnswer: v }))
              : null,
            labeledTextarea('Notes', note?.notes, v => onNoteChange?.({ ...note, notes: v })),
          ),
    ),
  );
}

function labeledTextarea(label, value, onChange) {
  return div({ style: { marginBottom: 8 } },
    div({ style: { fontSize: 11, color: 'var(--text3,#6b7280)', marginBottom: 2 } }, label),
    h('textarea', {
      value: value || '', onChange: e => onChange(e.target.value), rows: 2,
      style: { width: '100%', fontSize: 12.5, padding: 6, borderRadius: 6, border: '1px solid var(--bdr,#e5e7eb)', background: 'var(--surf,#fff)', color: 'var(--text,#111827)', resize: 'vertical' },
    }),
  );
}

// 1-5 click scale (owner-directed 2026-11-09: "give a rating scale for them to choose their
// confidence level"). A plain number, not a text answer — the worksheet's own point is an honest,
// low-friction answer, and a 5-button row is as fast to fill in as it gets.
function ratingScale(label, value, onChange) {
  return div({ style: { marginBottom: 8 } },
    div({ style: { fontSize: 11, color: 'var(--text3,#6b7280)', marginBottom: 3 } }, label),
    div({ style: { display: 'flex', gap: 5 } },
      [1, 2, 3, 4, 5].map(n => h('button', {
        key: n, type: 'button', onClick: () => onChange(n),
        style: {
          width: 32, height: 28, borderRadius: 6, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
          border: `1px solid ${value === n ? 'var(--amber,#f5bc00)' : 'var(--bdr,#e5e7eb)'}`,
          background: value === n ? 'var(--amber,#f5bc00)' : 'var(--surf,#fff)',
          color: value === n ? '#1a1200' : 'var(--text,#111827)',
        },
      }, n)),
    ),
  );
}

// Yes/No click answer (owner-directed 2026-11-09: "can be a yes or no selection, easy to click
// answer"). `value` is a tri-state boolean (true/false/null-unanswered), not a string, so it saves
// straight into spot_check_ruler_notes' own `reports_reviewed boolean` column.
function yesNo(label, value, onChange) {
  const opt = (v, text) => h('button', {
    type: 'button', onClick: () => onChange(v),
    style: {
      padding: '5px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 11.5, fontWeight: 700,
      border: `1px solid ${value === v ? 'var(--amber,#f5bc00)' : 'var(--bdr,#e5e7eb)'}`,
      background: value === v ? 'var(--amber,#f5bc00)' : 'var(--surf,#fff)',
      color: value === v ? '#1a1200' : 'var(--text,#111827)',
    },
  }, text);
  return div({ style: { marginBottom: 8 } },
    div({ style: { fontSize: 11, color: 'var(--text3,#6b7280)', marginBottom: 3 } }, label),
    div({ style: { display: 'flex', gap: 6 } }, opt(true, 'Yes'), opt(false, 'No')),
  );
}

/** On-demand container: loads the real data for one store + count date, builds the ruler, renders
 *  it inside ModalShell with a notes field and Save/Share actions. */
export function SpotCheckRulerModal({ loc, storeName, periodType = 'weekly', countDate, onClose }) {
  const [state, setState] = React.useState({ loading: true, ruler: null, error: null });
  const [note, setNote] = React.useState({ confidenceRating: null, reportsReviewed: null, reportsReviewedAnswer: '', notes: '' });
  const [saveMsg, setSaveMsg] = React.useState('');
  const period = periodType === 'eom' ? String(countDate).slice(0, 7) : `wk:${countDate}`;

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const monthPeriod = String(countDate).slice(0, 7);
        const [varianceAll, fobRows, sessionsNow, sessionsPrior, monthlyTargets, savedNote] = await Promise.all([
          loadQsrVarianceStat({ period: monthPeriod }),
          loadQsrFob({ daysBack: 45 }),
          loadInvCountSessions({ period: monthPeriod }),
          loadInvCountSessions({ period: priorPeriod(monthPeriod) }),
          loadMonthlyTargets(Number(monthPeriod.slice(0, 4)), Number(monthPeriod.slice(5, 7))),
          loadSpotCheckRulerNote({ loc, period, periodType }),
        ]);
        if (cancelled) return;
        const u = unpadLoc(loc);
        const varianceRows = varianceAll.filter(v => v.loc === String(parseInt(loc, 10)) || v.loc === u);
        const fobForStore = fobRows.filter(r => String(parseInt(r.loc, 10)) === String(parseInt(loc, 10)));
        const sessionLogRows = [...sessionsNow, ...sessionsPrior];
        const targets = (monthlyTargets && monthlyTargets[u]) || DEFAULT_TARGETS[u] || {};

        const { fobSnap } = assembleRulerInputs({ loc, countDate, periodType, fobRows: fobForStore, varianceRows, sessionLogRows, targets });
        const ruler = buildSpotCheckRuler({
          loc, storeName, period, periodType, countDate, fobSnap, targets, varianceRows, sessionLogRows,
        });
        setState({ loading: false, ruler, error: null });
        if (savedNote) setNote({ confidenceRating: savedNote.confidenceRating ?? null, reportsReviewed: savedNote.reportsReviewed ?? null, reportsReviewedAnswer: savedNote.reportsReviewedAnswer || '', notes: savedNote.notes || '' });
      } catch (e) {
        if (!cancelled) setState({ loading: false, ruler: null, error: e?.message || String(e) });
      }
    })();
    return () => { cancelled = true; };
  }, [loc, countDate, periodType]);

  const generateLink = React.useCallback(async () => {
    if (!state.ruler) return;
    const md = `Count Follow-Up — ${storeName || loc} (${period})\n\n` +
      state.ruler.questions.map((qq, i) => `${i + 1}. ${qq.q}\n${qq.answer || qq.note || ''}`).join('\n\n');
    const { token, error } = await createEomShareLink({ loc, period, storeName, title: `Count Follow-Up — ${storeName || loc}`, fob: null, recapMd: md, fullMd: md });
    if (error || !token) { setSaveMsg(`Link failed: ${error || 'no token'}`); return; }
    const url = `${location.origin}${import.meta.env.BASE_URL || '/'}`.replace(/\/+$/, '/') + `?share=${token}`;
    setState(s => ({ ...s, ruler: { ...s.ruler, questions: s.ruler.questions.map(q => q.id === 'reports-reviewed' ? { ...q, link: url } : q) } }));
    const result = await shareOrCopy({ url, title: `Count Follow-Up — ${storeName || loc}` });
    setSaveMsg(result.ok ? '✓ Link ready' : `Link: ${url}`);
  }, [state.ruler, loc, storeName, period]);

  const saveNote = React.useCallback(async () => {
    setSaveMsg('Saving…');
    const res = await saveSpotCheckRulerNote({
      loc, period, periodType, countDate,
      confidenceRating: note.confidenceRating, reportsReviewed: note.reportsReviewed, reportsReviewedAnswer: note.reportsReviewedAnswer, notes: note.notes,
      flagged: state.ruler?.counterfactual?.flagged ?? null, swingPts: state.ruler?.counterfactual?.swingPts ?? null,
    });
    setSaveMsg(res.saved ? '✓ Saved' : `Not saved — ${res.error || 'unknown error'}`);
  }, [loc, period, periodType, countDate, note, state.ruler]);

  return h(ModalShell, {
    title: `📋 Count Follow-Up — ${storeName || loc}`,
    subtitle: periodType === 'eom' ? 'End-of-Month count' : 'Weekly count',
    onClose, maxWidth: 680, scroll: true,
    footer: div({ style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
      h('button', { className: 'btn btn-sm', onClick: generateLink, disabled: !state.ruler }, '🔗 Generate report link'),
      h('button', { className: 'btn btn-sm', onClick: saveNote, disabled: !state.ruler }, '💾 Save notes'),
      saveMsg ? span({ style: { fontSize: 11.5, color: 'var(--text3,#6b7280)' } }, saveMsg) : null,
    ),
  },
    state.loading ? div({ style: { padding: 20, textAlign: 'center', color: 'var(--text3,#6b7280)' } }, 'Loading…')
      : state.error ? div({ style: { padding: 20, color: 'var(--crit,#dc2626)' } }, `Could not build the Count Follow-Up: ${state.error}`)
      : h(SpotCheckRulerWorksheet, { ruler: state.ruler, note, onNoteChange: setNote }),
  );
}

function priorPeriod(period) {
  const [y, m] = period.split('-').map(Number);
  const d = new Date(y, m - 2, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Small inline schedule editor for the weekly "needs a deep dive" digest (owner req 2026-11-09).
 *  Same shape as eom-dashboard.js's EOM-digest schedule control — an org_config-backed setting,
 *  not a hardcoded cron (see scripts/spot-check-ruler-digest.mjs's own header for why). */
export function SpotCheckRulerDigestSettings() {
  const [cfg, setCfg] = React.useState(null);
  const [msg, setMsg] = React.useState('');
  React.useEffect(() => { loadSpotCheckRulerConfig().then(setCfg).catch(() => setCfg(DEFAULT_SPOT_CHECK_RULER_CONFIG)); }, []);
  if (!cfg) return null;

  const save = async (next) => {
    setCfg(next);
    const res = await saveSpotCheckRulerConfig(next);
    setMsg(res.saved ? '✓ Saved' : `Not saved — ${res.error || 'unknown error'}`);
  };

  return div({ className: 'scr-digest-settings', style: { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', fontSize: 11.5 } },
    span({ style: { color: 'var(--text3,#6b7280)' } }, '⏰ Deep-dive digest fires'),
    h('select', {
      value: cfg.enabled ? '1' : '0', onChange: e => save({ ...cfg, enabled: e.target.value === '1' }),
      style: { fontSize: 11.5 },
    }, h('option', { value: '1' }, 'on'), h('option', { value: '0' }, 'off')),
    h('select', {
      value: cfg.dowUtc, onChange: e => save({ ...cfg, dowUtc: Number(e.target.value) }),
      style: { fontSize: 11.5 },
    }, DOW_LABELS.map((d, i) => h('option', { key: i, value: i }, d))),
    span({ style: { color: 'var(--text3,#6b7280)' } }, 'at'),
    h('select', {
      value: cfg.hourUtc, onChange: e => save({ ...cfg, hourUtc: Number(e.target.value) }),
      style: { fontSize: 11.5 },
    }, Array.from({ length: 24 }, (_, i) => h('option', { key: i, value: i }, `${String(i).padStart(2, '0')}:00 UTC`))),
    msg ? span({ style: { color: 'var(--text3,#6b7280)' } }, msg) : null,
  );
}
