// @ts-nocheck
// ── Count Cycle compliance panel ─────────────────────────────────────────────
// Notes 58 #1. Surfaces the owner's count rules per store: every weekly count needs a
// full Food AND Condiment count, and Paper is mandatory on the floating mid-month count.
//
// Exceptions lead. A compliance screen that opens on 23 green rows buries the four
// stores that actually need chasing, so the default view is the exceptions and the clean
// stores collapse behind a toggle.
//
// Reads qsr_onhand (the full item universe) rather than qsr_raw_item_detail, which
// carries zero Condiment rows by design — see src/engine/count-cycle.js for why.

import * as React from 'react';
import { cycleCompliance, cycleSummary, WEEKLY_CLASSES } from '../engine/count-cycle.js';
import { loadQsrOnHand } from '../lib/supabase.js';
import { sName } from '../constants.js';

const h = React.createElement;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

const SEV = {
  crit: { col: '#ef4444', word: 'Critical' },
  warn: { col: '#f59e0b', word: 'Watch' },
  ok:   { col: '#10b981', word: 'On cycle' },
};
const CLS_COL = { Food: '#60a5fa', Condiment: '#f5bc00', Paper: '#a78bfa', 'Non-Product': '#6b7280' };
const KIND_LABEL = {
  eom: 'End of month', weekly: 'Weekly', 'mid-paper': 'Mid-month paper',
  partial: 'Partial', spot: 'Spot check',
};

/** One store's session timeline — the evidence behind its status. */
function SessionRow({ s }) {
  const classes = Object.keys(s.counts).sort();
  return div({ style: { display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0', fontSize: 11 } },
    span({ style: { fontFamily: 'var(--mono)', color: 'var(--text3,#6b7280)', minWidth: 78 } }, s.date),
    span({ style: {
      fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.04em',
      padding: '1px 6px', borderRadius: 4, minWidth: 74, textAlign: 'center',
      color: s.kind === 'spot' ? 'var(--text3,#6b7280)' : 'var(--text2,#9aa4b2)',
      border: '.5px solid var(--bdr,#2a2f3a)',
    } }, KIND_LABEL[s.kind] || s.kind),
    div({ style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
      classes.map(c => span({
        key: c,
        title: `${s.counts[c]} of ${c} counted${s.covered.includes(c) ? ' — full' : ' — partial'}`,
        style: {
          fontSize: 10, fontFamily: 'var(--mono)',
          color: s.covered.includes(c) ? CLS_COL[c] || 'var(--text2)' : 'var(--text3,#6b7280)',
          opacity: s.covered.includes(c) ? 1 : .65,
        },
      }, `${c.slice(0, 4)} ${s.counts[c]}${s.covered.includes(c) ? '✓' : ''}`))));
}

function StoreCard({ c, expanded, onToggle }) {
  const meta = SEV[c.status] || SEV.ok;
  return div({ style: {
    border: '.5px solid var(--bdr,#2a2f3a)', borderLeft: `3px solid ${meta.col}`,
    borderRadius: 8, background: 'var(--surf2,#151821)', marginBottom: 6, overflow: 'hidden',
  } },
    div({ onClick: onToggle, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', cursor: 'pointer' } },
      div({ style: { flex: 1, minWidth: 0 } },
        div({ style: { fontSize: 12.5, fontWeight: 700, color: 'var(--text,#e8eaed)' } },
          `${sName(c.loc) || c.loc}`, span({ style: { color: 'var(--text3,#6b7280)', fontWeight: 400, marginLeft: 6, fontFamily: 'var(--mono)', fontSize: 10 } }, `#${c.loc}`)),
        c.exceptions.length
          ? div({ style: { fontSize: 11, color: meta.col, marginTop: 2 } }, c.exceptions[0].detail)
          : div({ style: { fontSize: 11, color: 'var(--text3,#6b7280)', marginTop: 2 } },
              c.lastWeekly ? `Last full count ${c.lastWeekly.date} · ${c.daysSinceWeekly}d ago` : 'No count on record')),
      c.paperMissing ? span({ style: { fontSize: 9, fontWeight: 700, color: '#a78bfa', border: '.5px solid #a78bfa66', borderRadius: 4, padding: '2px 6px' } }, 'PAPER DUE') : null,
      span({ style: { fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.05em', color: meta.col } }, meta.word),
      span({ style: { fontSize: 10, color: 'var(--text3,#6b7280)' } }, expanded ? '▾' : '▸')),

    expanded ? div({ style: { padding: '2px 12px 10px 12px', borderTop: '.5px solid var(--bdr,#2a2f3a)' } },
      c.exceptions.length ? div({ style: { margin: '8px 0' } },
        c.exceptions.map((e, i) => div({ key: i, style: {
          fontSize: 11, color: SEV[e.severity].col, padding: '5px 8px', marginBottom: 4,
          background: `${SEV[e.severity].col}12`, borderRadius: 6,
        } }, e.detail))) : null,
      div({ style: { fontSize: 9, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--text3,#6b7280)', margin: '6px 0 2px' } },
        'Count sessions on record'),
      c.sessions.length
        ? c.sessions.slice().reverse().map(s => h(SessionRow, { key: s.date, s }))
        : div({ style: { fontSize: 11, color: 'var(--text3,#6b7280)', padding: '6px 0' } }, 'None'),
      div({ style: { fontSize: 9.5, color: 'var(--text3,#6b7280)', marginTop: 8, fontStyle: 'italic', lineHeight: 1.5 } },
        `Item universe — ${Object.entries(c.classTotals).map(([k, v]) => `${k} ${v}`).join(' · ')}. `,
        'A class counts as fully counted at 75% coverage or above.')) : null);
}

export function CountCyclePanel({ onClose }) {
  const [rows, setRows] = React.useState(null);
  const [err, setErr] = React.useState(null);
  const [open, setOpen] = React.useState({});
  const [showClean, setShowClean] = React.useState(false);

  const period = new Date().toISOString().slice(0, 7);
  React.useEffect(() => {
    let live = true;
    loadQsrOnHand({ period })
      .then(r => { if (live) { setRows(r || []); setErr(null); } })
      .catch(e => { if (live) setErr(e?.message || 'load failed'); });
    return () => { live = false; };
  }, [period]);

  const comp = React.useMemo(() => (rows ? cycleCompliance(rows) : []), [rows]);
  const sum = React.useMemo(() => cycleSummary(comp), [comp]);
  const flagged = comp.filter(c => c.exceptions.length);
  const clean = comp.filter(c => !c.exceptions.length);

  const body = err
    ? div({ style: { padding: 30, textAlign: 'center', color: '#f59e0b', fontSize: 12 } },
        'Could not load on-hand data — ', err)
    : rows === null
      ? div({ style: { padding: 30, textAlign: 'center', color: 'var(--text3,#6b7280)', fontSize: 12 } }, 'Loading…')
      : !comp.length
        ? div({ style: { padding: 30, textAlign: 'center', color: 'var(--text3,#6b7280)', fontSize: 12 } },
            `No on-hand data for ${period} yet.`)
        : div(null,
            // Exceptions first — a screen that opens on green rows buries the ones to chase.
            flagged.length
              ? flagged.map(c => h(StoreCard, { key: c.loc, c, expanded: !!open[c.loc], onToggle: () => setOpen(o => ({ ...o, [c.loc]: !o[c.loc] })) }))
              : div({ style: { padding: '20px 12px', textAlign: 'center', color: '#10b981', fontSize: 12 } },
                  '✅ Every store is on cycle.'),
            clean.length ? div(null,
              h('button', {
                onClick: () => setShowClean(v => !v),
                style: { width: '100%', marginTop: 10, background: 'none', border: '.5px solid var(--bdr,#2a2f3a)', borderRadius: 7, color: 'var(--text3,#6b7280)', padding: '7px', cursor: 'pointer', fontSize: 11 },
              }, showClean ? `▾ Hide ${clean.length} stores on cycle` : `▸ Show ${clean.length} stores on cycle`),
              showClean ? div({ style: { marginTop: 6 } },
                clean.map(c => h(StoreCard, { key: c.loc, c, expanded: !!open[c.loc], onToggle: () => setOpen(o => ({ ...o, [c.loc]: !o[c.loc] })) }))) : null) : null);

  return div({
    style: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.75)', zIndex: 320, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '40px 20px', overflowY: 'auto' },
    onClick: onClose,
  },
    div({ onClick: e => e.stopPropagation(), style: {
      width: '100%', maxWidth: 780, background: 'var(--surf,#0f1117)', borderRadius: 12,
      border: '.5px solid var(--bdr,#2a2f3a)', overflow: 'hidden', boxShadow: '0 20px 60px rgba(0,0,0,.6)',
    } },
      div({ style: { display: 'flex', alignItems: 'center', gap: 10, padding: '14px 18px', borderBottom: '.5px solid var(--bdr,#2a2f3a)', background: 'var(--surf2,#151821)' } },
        span({ style: { fontSize: 16 } }, '📋'),
        div({ style: { flex: 1 } },
          div({ style: { fontSize: 14, fontWeight: 800, color: 'var(--text,#e8eaed)' } }, 'Count Cycle Compliance'),
          div({ style: { fontSize: 10, color: 'var(--text3,#6b7280)', marginTop: 2 } },
            rows === null ? period : `${sum.stores} stores · ${sum.crit} critical · ${sum.warn} watch · ${sum.ok} on cycle`)),
        h('button', { onClick: onClose, style: { background: 'none', border: '1px solid var(--bdr2,#3a4050)', borderRadius: 6, color: 'var(--text3,#6b7280)', padding: '5px 10px', cursor: 'pointer', fontSize: 12 } }, '✕ Close')),

      div({ style: { padding: 12 } }, body),

      div({ style: { padding: '9px 18px', borderTop: '.5px solid var(--bdr,#2a2f3a)', fontSize: 9.5, color: 'var(--text3,#6b7280)', fontStyle: 'italic', lineHeight: 1.5 } },
        `Every weekly count requires a full ${WEEKLY_CLASSES.join(' and ')} count. Paper is mandatory on the mid-month count, which floats with each store's count day.`)));
}
