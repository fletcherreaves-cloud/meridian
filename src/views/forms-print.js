// @ts-nocheck
// ── Printable Forms ────────────────────────────────────────────────────────────
// Blank, fill-by-hand printable versions of the QSRSoft Shift-Management forms
// (Pre-Shift Checklists per daypart + Travel Paths). Templates are captured once
// from QSRSoft by scripts/qsrsoft-forms-pull.mjs into public/forms/*.json (no live
// data — reusable blanks). This panel lists them, previews on-screen (dark theme),
// and prints a clean black-on-white sheet with checkboxes to mark by hand.
import * as React from 'react';
import { normalizeForm, buildFormPrintHTML, sectionColor, CARD_COLOR, parseOptionBadge, formatOptionBadge } from '../engine/forms-model.js';
import { printHtml } from '../utils/print-html.js';
import { ModalShell } from '../components/ModalShell.js';
import { triggerSync } from '../lib/supabase.js';

const h = React.createElement;
const { useMemo, useState, useEffect } = React;
const div = (p, ...c) => h('div', p, ...c);
const span = (p, ...c) => h('span', p, ...c);

// A normalized form JSON may already be section-shaped (written by the pull
// script) or a raw questions array — accept both.
function asModel(json, meta) {
  if (Array.isArray(json)) return normalizeForm(json, meta);
  if (json && Array.isArray(json.sections)) return json;
  if (json && Array.isArray(json.questions)) return normalizeForm(json.questions, { ...meta, ...json });
  return normalizeForm([], meta);
}

const slugOf = s => String(s || 'form').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'form';
const escapeRegex = s => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Open a print window → the browser print dialog also offers "Save as PDF".
function openPrint(model, storeLabel, style) {
  printHtml(buildFormPrintHTML(model, { storeLabel, style }));
}

// Download the blank form as a standalone .html file.
function downloadHTML(model, storeLabel, style) {
  try {
    const blob = new Blob([buildFormPrintHTML(model, { storeLabel, style })], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${slugOf(model.title)}.html`;
    document.body.appendChild(a); a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 300);
  } catch (e) { console.error('form download failed', e); }
}

export function FormsPrintPanel({ onClose }) {
  const [index, setIndex] = useState(null);     // manifest rows
  const [err, setErr] = useState(null);
  const [sel, setSel] = useState(null);         // selected manifest row
  const [model, setModel] = useState(null);     // normalized selected form
  const [loadingForm, setLoadingForm] = useState(false);
  const [query, setQuery] = useState('');       // form-title search/filter
  // Self-serve "add form" (Task #59) -- dispatches scripts/qsrsoft-forms-pull.mjs via the
  // trigger-dar-sync Edge Function's 'forms' workflow entry, scoped to a title match, instead
  // of requiring someone to run the script locally with QSRSoft credentials and commit
  // public/forms/*.json by hand. requestStatus: null | 'busy' | 'done' | 'error'.
  const [requestStatus, setRequestStatus] = useState(null);
  const [requestMsg, setRequestMsg] = useState('');

  // Load the manifest of captured forms.
  useEffect(() => {
    let live = true;
    fetch('/forms/index.json', { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('index ' + r.status))))
      .then(rows => { if (live) setIndex(Array.isArray(rows) ? rows : (rows.forms || [])); })
      .catch(e => { if (live) { setErr(e.message); setIndex([]); } });
    return () => { live = false; };
  }, []);

  // Load + normalize the selected form.
  useEffect(() => {
    if (!sel) { setModel(null); return; }
    let live = true;
    setLoadingForm(true); setModel(null);
    fetch(`/forms/${sel.slug}.json`, { cache: 'no-cache' })
      .then(r => (r.ok ? r.json() : Promise.reject(new Error('form ' + r.status))))
      .then(json => { if (live) setModel(asModel(json, sel)); })
      .catch(e => { if (live) setErr(e.message); })
      .finally(() => { if (live) setLoadingForm(false); });
    return () => { live = false; };
  }, [sel]);

  // Group manifest by category for the picker, filtered by the search query when one is typed.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return index || [];
    return (index || []).filter(row => String(row.title || '').toLowerCase().includes(q));
  }, [index, query]);
  const groups = useMemo(() => {
    const g = {};
    for (const row of filtered) {
      const k = row.category || 'Forms';
      (g[k] || (g[k] = [])).push(row);
    }
    for (const k in g) g[k].sort((a, b) => String(a.title).localeCompare(b.title));
    return g;
  }, [filtered]);

  const requestPull = async () => {
    const q = query.trim();
    setRequestStatus('busy'); setRequestMsg('');
    const res = await triggerSync('forms', q ? { forms_match: escapeRegex(q) } : {});
    if (res.error) { setRequestStatus('error'); setRequestMsg(res.error); }
    else { setRequestStatus('done'); setRequestMsg(res.message || 'Pull requested — check back in a few minutes and refresh.'); }
  };

  const btn = { padding: '5px 10px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 700 };
  const gold = { ...btn, border: '1px solid var(--accent,#f5bc00)' };
  const hasIndex = index != null && index.length > 0;
  const noMatches = hasIndex && query.trim() && filtered.length === 0;

  const requestRow = div({ style: { padding: '8px 12px', borderTop: '1px solid var(--bdr)', background: 'var(--surf)' } },
    requestStatus === 'busy'
      ? div({ style: { fontSize: 11, color: 'var(--text2)' } }, '⏳ Requesting pull…')
      : requestStatus === 'done'
        ? div({ style: { fontSize: 11, color: 'var(--ok,#10b981)', lineHeight: 1.5 } }, '✓ ' + requestMsg)
        : div({ style: { fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 } },
            noMatches
              ? `No captured form matches "${query.trim()}".`
              : 'Don’t see a form, or a form changed in QSRSoft?',
            ' ',
            h('button', { onClick: requestPull, style: { ...gold, fontSize: 10.5, padding: '3px 9px', marginLeft: 4 } },
              '🔄 Request pull' + (query.trim() ? ` for "${query.trim()}"` : ' (all forms)')),
            requestStatus === 'error' ? div({ style: { marginTop: 4, color: 'var(--warn,#f59e0b)' } }, '⚠ ' + requestMsg) : null,
            div({ style: { marginTop: 4, color: 'var(--text3,var(--text2))', fontSize: 10 } },
              'Pulls fresh templates from QSRSoft in the background (~a few minutes), then refresh this page.'),
          ));

  return h(ModalShell, {
    icon: '🖨', title: 'Printable Forms', subtitle: `${index == null ? '…' : index.length} captured template${index && index.length === 1 ? '' : 's'} — blank, fill by hand`,
    onClose, maxWidth: 1000,
    bodyStyle: { padding: 0, display: 'flex', minHeight: 380, maxHeight: '64vh' },
    subHeader: div({ style: { padding: '8px 16px', borderBottom: '1px solid var(--bdr)', background: 'var(--surf)' } },
      h('input', {
        value: query, onChange: e => setQuery(e.target.value), placeholder: '🔎 Search forms by title…',
        style: { width: '100%', maxWidth: 340, background: 'var(--bg)', border: '1px solid var(--bdr)', borderRadius: 6, color: 'var(--text)', fontSize: 12, padding: '5px 9px' },
      })),
  },
    // ── Left: form picker ──
    div({ style: { width: 300, flexShrink: 0, borderRight: '1px solid var(--bdr)', display: 'flex', flexDirection: 'column', background: 'var(--surf)' } },
      div({ style: { flex: 1, overflow: 'auto', padding: 10, minHeight: 0 } },
        index == null
          ? div({ style: { color: 'var(--text2)', fontSize: 12, padding: 10 } }, 'Loading forms…')
          : (index.length === 0
            ? div({ style: { color: 'var(--text2)', fontSize: 12, padding: 10, lineHeight: 1.5 } },
                div({ style: { fontWeight: 700, color: 'var(--text)', marginBottom: 4 } }, 'No forms captured yet'),
                err ? div({ style: { marginTop: 8, color: 'var(--warn,#f59e0b)' } }, 'Note: ' + err) : null,
              )
            : Object.keys(groups).sort().map(cat =>
                div({ key: cat, style: { marginBottom: 12 } },
                  div({ style: { fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', color: 'var(--text2)', margin: '2px 4px 6px' } }, cat),
                  groups[cat].map(row =>
                    h('button', {
                      key: row.slug,
                      onClick: () => { setErr(null); setSel(row); },
                      style: {
                        display: 'block', width: '100%', textAlign: 'left', marginBottom: 4,
                        padding: '7px 9px', borderRadius: 7, cursor: 'pointer', fontSize: 12,
                        border: '1px solid ' + (sel && sel.slug === row.slug ? 'var(--accent,#f5bc00)' : 'var(--bdr)'),
                        background: sel && sel.slug === row.slug ? 'var(--accent-dim,rgba(245,188,0,.12))' : 'var(--bg)',
                        color: 'var(--text)', fontWeight: sel && sel.slug === row.slug ? 700 : 500,
                      },
                    },
                      div({}, row.title),
                      row.itemCount ? div({ style: { fontSize: 10, color: 'var(--text2)', marginTop: 1 } }, row.itemCount + ' items') : null,
                    ),
                  ),
                ),
              )),
      ),
      requestRow,
    ),
    // ── Right: preview ──
    div({ style: { flex: 1, overflow: 'auto', padding: 16 } },
      !sel
        ? div({ style: { color: 'var(--text2)', fontSize: 13, padding: 24, textAlign: 'center' } }, 'Select a form to preview and print.')
        : (loadingForm
          ? div({ style: { color: 'var(--text2)', fontSize: 12 } }, 'Loading ' + sel.title + '…')
          : (model
            ? h(FormPreview, { model })
            : div({ style: { color: 'var(--warn,#f59e0b)', fontSize: 12 } }, 'Could not load this form' + (err ? ': ' + err : '.')))),
    ),
  );
}

function FormPreview({ model }) {
  const [compact, setCompact] = useState(false);   // false = QSRSoft styled (default)
  const style = compact ? 'compact' : 'qsrsoft';
  const btn = { padding: '6px 12px', borderRadius: 7, border: '1px solid var(--accent,#f5bc00)', background: 'var(--accent,#f5bc00)', color: '#111', cursor: 'pointer', fontSize: 12, fontWeight: 800 };
  const ghost = { padding: '6px 12px', borderRadius: 7, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 700 };
  return div({},
    div({ style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10, flexWrap: 'wrap' } },
      div({},
        div({ style: { fontSize: 15, fontWeight: 800, color: 'var(--text)' } }, model.title),
        div({ style: { fontSize: 11, color: 'var(--text2)', marginTop: 2 } },
          `${model.itemCount} items · ${(model.sections || []).length} sections` + (model.lastEditedAt ? ` · edited ${String(model.lastEditedAt).slice(0, 10)}` : '')),
      ),
      div({ style: { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' } },
        h('label', { style: { fontSize: 11, color: 'var(--text2)', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }, title: 'Ink-light black-on-white version' },
          h('input', { type: 'checkbox', checked: compact, onChange: e => setCompact(e.target.checked) }), 'Compact B&W'),
        h('button', { onClick: () => openPrint(model, '', style), style: btn, title: 'Print — the dialog also offers Save as PDF' }, '🖨 Print / PDF'),
        h('button', { onClick: () => downloadHTML(model, '', style), style: ghost, title: 'Download a standalone .html file' }, '⬇ HTML'),
      ),
    ),
    // On-screen preview mirrors the QSRSoft look: colored section banners + navy cards.
    (model.sections || []).map((sec, si) => {
      const c = sectionColor(sec.color);
      return div({ key: si, style: { marginBottom: 12 } },
        sec.title ? div({ style: { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', color: c.fg, background: c.bg, padding: '5px 9px', borderRadius: 4, marginBottom: 5 } }, sec.title) : null,
        (sec.items || []).map((it, ii) => h(PreviewItem, { key: ii, it })),
      );
    }),
  );
}

function PreviewItem({ it }) {
  const card = { background: CARD_COLOR.bg, color: CARD_COLOR.fg, borderRadius: 6, padding: '7px 9px', marginBottom: 5 };
  const title = { fontWeight: 600, marginBottom: it.kind === 'section' ? 0 : 5, fontSize: 12.5 };
  const optRow = { background: '#fff', color: '#111', border: '1px solid #cbd2e0', borderRadius: 4, padding: '3px 8px', marginTop: 3, display: 'flex', alignItems: 'center', gap: 7, fontSize: 12 };
  const circle = { width: 11, height: 11, border: '1.5px solid #333', borderRadius: '50%', flex: 'none', display: 'inline-block' };
  if (it.kind === 'check') {
    const opts = (it.options && it.options.length ? it.options : ['Complete', 'Action Needed']);
    const badgeStyle = { marginLeft: 'auto', fontSize: 9, fontWeight: 700, color: '#555', background: '#eef0f4', borderRadius: 3, padding: '1px 6px', whiteSpace: 'nowrap' };
    return div({ style: card },
      div({ style: title }, it.title),
      opts.map((o, i) => {
        const badge = formatOptionBadge(parseOptionBadge(o));
        return div({ key: i, style: optRow }, span({ style: circle }), o, badge ? span({ style: badgeStyle }, badge) : null);
      }),
    );
  }
  if (it.kind === 'field') {
    return div({ style: card },
      div({ style: title }, it.title),
      div({ style: { background: '#fff', borderRadius: 4, height: 18, maxWidth: it.field === 'time' ? 110 : 160 } }),
    );
  }
  const lines = Math.max(1, it.lines || 1);
  return div({ style: card },
    div({ style: title }, it.title),
    div({ style: { background: '#fff', borderRadius: 4, padding: '4px 6px' } },
      Array.from({ length: lines }, (_, i) => div({ key: i, style: { borderBottom: '1px solid #999', height: 18, marginTop: i ? 6 : 0 } }))),
  );
}
