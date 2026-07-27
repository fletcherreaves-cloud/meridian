// @ts-nocheck
// ── Printable Forms ────────────────────────────────────────────────────────────
// Blank, fill-by-hand printable versions of the QSRSoft Shift-Management forms
// (Pre-Shift Checklists per daypart + Travel Paths). Templates are captured once
// from QSRSoft by scripts/qsrsoft-forms-pull.mjs into public/forms/*.json (no live
// data — reusable blanks). This panel lists them, previews on-screen (dark theme),
// and prints a clean black-on-white sheet with checkboxes to mark by hand.
import * as React from 'react';
import { normalizeForm, buildFormPrintHTML } from '../engine/forms-model.js';

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

// Open a print window → the browser print dialog also offers "Save as PDF".
function openPrint(model, storeLabel) {
  const w = window.open('', '_blank', 'width=850,height=1000');
  if (!w) return;
  w.document.write(buildFormPrintHTML(model, { storeLabel }));
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* window closed */ } }, 350);
}

// Download the blank form as a standalone .html file.
function downloadHTML(model, storeLabel) {
  try {
    const blob = new Blob([buildFormPrintHTML(model, { storeLabel })], { type: 'text/html;charset=utf-8' });
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

  // Group manifest by category for the picker.
  const groups = useMemo(() => {
    const g = {};
    for (const row of (index || [])) {
      const k = row.category || 'Forms';
      (g[k] || (g[k] = [])).push(row);
    }
    for (const k in g) g[k].sort((a, b) => String(a.title).localeCompare(b.title));
    return g;
  }, [index]);

  const btn = { padding: '5px 10px', borderRadius: 6, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 700 };

  return h('div', { style: { position: 'fixed', inset: 0, zIndex: 4000, background: 'rgba(0,0,0,.55)', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', overflow: 'auto', padding: 20 }, onClick: onClose },
    div({ onClick: e => e.stopPropagation(), style: { width: 'min(1000px,100%)', background: 'var(--bg)', border: '1px solid var(--bdr)', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,.5)', overflow: 'hidden' } },
      // Header
      div({ style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', borderBottom: '1px solid var(--bdr)', background: 'var(--surf)' } },
        div({},
          div({ style: { fontSize: 15, fontWeight: 800, color: 'var(--text)' } }, '🖨 Printable Forms'),
          div({ style: { fontSize: 11, color: 'var(--text2)', marginTop: 2 } }, 'Pre-Shift Checklists & Travel Paths — blank, fill by hand'),
        ),
        h('button', { onClick: onClose, style: { ...btn, fontSize: 16, lineHeight: 1, padding: '4px 9px' } }, '✕'),
      ),
      div({ style: { display: 'flex', minHeight: 380, maxHeight: '76vh' } },
        // ── Left: form picker ──
        div({ style: { width: 300, borderRight: '1px solid var(--bdr)', overflow: 'auto', padding: 10, background: 'var(--surf)' } },
          index == null
            ? div({ style: { color: 'var(--text2)', fontSize: 12, padding: 10 } }, 'Loading forms…')
            : (index.length === 0
              ? div({ style: { color: 'var(--text2)', fontSize: 12, padding: 10, lineHeight: 1.5 } },
                  div({ style: { fontWeight: 700, color: 'var(--text)', marginBottom: 4 } }, 'No forms captured yet'),
                  'Run the one-time pull to populate templates:',
                  h('code', { style: { display: 'block', marginTop: 6, padding: 8, background: 'var(--bg)', border: '1px solid var(--bdr)', borderRadius: 6, fontSize: 10.5, whiteSpace: 'pre-wrap', color: 'var(--text)' } },
                    'node scripts/qsrsoft-forms-pull.mjs'),
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
      ),
    ),
  );
}

function FormPreview({ model }) {
  const btn = { padding: '6px 12px', borderRadius: 7, border: '1px solid var(--accent,#f5bc00)', background: 'var(--accent,#f5bc00)', color: '#111', cursor: 'pointer', fontSize: 12, fontWeight: 800 };
  const ghost = { padding: '6px 12px', borderRadius: 7, border: '1px solid var(--bdr)', background: 'var(--surf)', color: 'var(--text)', cursor: 'pointer', fontSize: 12, fontWeight: 700 };
  return div({},
    div({ style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 10, flexWrap: 'wrap' } },
      div({},
        div({ style: { fontSize: 15, fontWeight: 800, color: 'var(--text)' } }, model.title),
        div({ style: { fontSize: 11, color: 'var(--text2)', marginTop: 2 } },
          `${model.itemCount} items · ${(model.sections || []).length} sections` + (model.lastEditedAt ? ` · edited ${String(model.lastEditedAt).slice(0, 10)}` : '')),
      ),
      div({ style: { display: 'flex', gap: 6, flexWrap: 'wrap' } },
        h('button', { onClick: () => openPrint(model, ''), style: btn, title: 'Print — the dialog also offers Save as PDF' }, '🖨 Print / PDF'),
        h('button', { onClick: () => downloadHTML(model, ''), style: ghost, title: 'Download a standalone .html file' }, '⬇ HTML'),
      ),
    ),
    (model.sections || []).map((sec, si) =>
      div({ key: si, style: { marginBottom: 14 } },
        sec.title ? div({ style: { fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.4px', color: '#111', background: 'var(--accent,#f5bc00)', padding: '4px 8px', borderRadius: 4 } }, sec.title) : null,
        (sec.items || []).map((it, ii) => h(PreviewItem, { key: ii, it })),
      ),
    ),
  );
}

function PreviewItem({ it }) {
  const rowBase = { display: 'flex', justifyContent: 'space-between', gap: 12, padding: '5px 6px', borderBottom: '.5px solid var(--bdr)', fontSize: 12.5, color: 'var(--text)' };
  if (it.kind === 'check') {
    const opts = (it.options && it.options.length ? it.options : ['Complete', 'Needs Action', 'Action Taken']);
    return div({ style: rowBase },
      span({ style: { flex: 1 } }, it.title),
      span({ style: { color: 'var(--text2)', whiteSpace: 'nowrap', fontSize: 11 } }, opts.map((o, i) => span({ key: i, style: { marginLeft: i ? 10 : 0 } }, '☐ ' + o))),
    );
  }
  if (it.kind === 'field') {
    return div({ style: rowBase },
      span({ style: { flex: 1 } }, it.title),
      span({ style: { color: 'var(--text2)', fontSize: 11 } }, it.field === 'time' ? '⌚ ____' : '📅 ______'),
    );
  }
  return div({ style: { ...rowBase, flexDirection: 'column', gap: 4 } },
    span({}, it.title),
    span({ style: { borderBottom: '1px solid var(--bdr)', height: (it.lines > 1 ? it.lines * 16 : 14) } }),
  );
}
