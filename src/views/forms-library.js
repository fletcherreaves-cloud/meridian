// @ts-nocheck
// ── Forms Library ─────────────────────────────────────────────────────────────
// The catalog of leadership review forms, organized by cascade level (Owner→DO,
// DO→Supervisor, Supervisor→GM). Each form prints to PDF and downloads as an editable
// Word (.doc). BLANK forms need no live data — they generate straight from the cascade
// level here. FILLED / live-data versions come from the One-Pager (which owns the scope +
// range picker); this panel links there. Owner iterates a Word doc and re-uploads edits
// for us to fold into the template. Reuses the One-Pager's builders (single source).
import * as React from 'react';
import { CASCADE_LEVELS, cascadeOf, weeklyReviewHtml, printWeeklyReview, downloadDoc } from './one-pager.js';

const h = React.createElement;
const { useState } = React;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

// A minimal page object for BLANK generation — the blank form ignores actuals/data.
const blankPage = levelId => ({ cascade: cascadeOf(levelId), currentState: [], perLocation: [], rangeLabel: '', scopeLabel: '' });

// Form catalog. `blankFor(levelId)` builds the blank HTML for a level.
const FORMS = [
  {
    id: 'weekly-review',
    name: 'Weekly Business Review',
    desc: 'Leader-led checkpoint the leader completes before the discussion — Wins, performance scorecard, level-specific deep dive, and commitments.',
    perLevel: {
      o_d: 'District scorecard · outliers (top / watch) · opportunities · supervisor accountability.',
      d_s: 'Patch scorecard · store-by-store · GM coaching focus.',
      s_g: 'Store scorecard · speed / food / labor deep dive · shift-manager tracking.',
    },
    blankHtml: levelId => weeklyReviewHtml(blankPage(levelId), { blank: true }),
  },
];

export function FormsLibraryPanel({ onClose }) {
  const [busy, setBusy] = useState('');
  const btn = { padding: '5px 11px', borderRadius: 7, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text)', cursor: 'pointer', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' };
  const gold = { ...btn, border: '1px solid var(--accent,#f5bc00)' };

  const doPrint = (form, levelId) => printWeeklyReview(blankPage(levelId), { blank: true });
  const doWord = (form, levelId) => {
    const lvl = cascadeOf(levelId);
    const fn = `${form.name.replace(/[^\w]+/g, '-')}-${lvl.label.replace(/[^\w]+/g, '-')}-BLANK.doc`;
    setBusy(form.id + levelId);
    downloadDoc(fn, form.blankHtml(levelId));
    setTimeout(() => setBusy(''), 600);
  };

  const levelCard = (lvl) => div({ key: lvl.id, style: { border: '1px solid var(--bdr)', borderRadius: 10, overflow: 'hidden', marginBottom: 12 } },
    div({ style: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', background: 'var(--surf)', borderBottom: '1px solid var(--bdr)' } },
      span({ style: { fontSize: 11, fontWeight: 800, color: '#111', background: 'var(--accent,#f5bc00)', borderRadius: 5, padding: '1px 6px' } }, lvl.tag),
      span({ style: { fontSize: 13, fontWeight: 800, color: 'var(--text)' } }, lvl.label),
      span({ style: { fontSize: 10.5, color: 'var(--text2)', marginLeft: 4 } }, lvl.focus)),
    FORMS.filter(f => !f.perLevel || f.perLevel[lvl.id]).map(form => div({ key: form.id, style: { display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', borderTop: '.5px solid var(--bdr)', flexWrap: 'wrap' } },
      div({ style: { flex: 1, minWidth: 220 } },
        div({ style: { fontSize: 12.5, fontWeight: 700, color: 'var(--text)' } }, form.name),
        div({ style: { fontSize: 10.5, color: 'var(--text2)', marginTop: 1 } }, (form.perLevel && form.perLevel[lvl.id]) || form.desc)),
      div({ style: { display: 'flex', gap: 6 } },
        h('button', { onClick: () => doPrint(form, lvl.id), style: btn, title: 'Print the blank form (→ PDF via the dialog)' }, '📋 Print (blank)'),
        h('button', { onClick: () => doWord(form, lvl.id), style: gold, title: 'Download the blank form as an editable Word (.doc)' }, busy === form.id + lvl.id ? '⬇ …' : '⬇ Word (blank)')))));

  return div({ style: { position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,.55)', overflow: 'auto', padding: 18 }, onClick: onClose },
    div({ onClick: e => e.stopPropagation(), style: { width: 'min(940px,100%)', margin: '0 auto', background: 'var(--bg)', border: '1px solid var(--bdr)', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,.5)' } },
      // Header
      div({ style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '12px 16px', borderBottom: '1px solid var(--bdr)', background: 'var(--surf)' } },
        div({},
          div({ style: { fontSize: 15, fontWeight: 800, color: 'var(--text)' } }, '🗂 Forms Library'),
          div({ style: { fontSize: 11, color: 'var(--text2)', marginTop: 2 } }, 'Leadership review forms by cascade level — print to PDF or download as editable Word')),
        h('button', { onClick: onClose, style: { ...btn, fontWeight: 800 } }, '✕')),

      div({ style: { padding: 16 } },
        div({ style: { fontSize: 11.5, color: 'var(--text2)', marginBottom: 12, lineHeight: 1.5 } },
          'Blank, leader-led forms — completed before each discussion to encourage looking at results and taking action. ',
          span({ style: { fontWeight: 700, color: 'var(--text)' } }, 'Want live numbers pre-filled?'),
          ' Open the Leadership One-Pager, set your scope + level, and use its Weekly Review / Word buttons — same forms, auto-filled.'),
        CASCADE_LEVELS.map(levelCard),
        div({ style: { fontSize: 10, color: 'var(--text3,var(--text2))', marginTop: 6, lineHeight: 1.5 } },
          'Tuned one of these in Word and like it? Send it back and we\'ll fold your changes into the template. New forms slot in here as they\'re built.'))));
}
