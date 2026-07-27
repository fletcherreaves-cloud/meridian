// @ts-nocheck
// ── QSRSoft Forms model ────────────────────────────────────────────────────────
// Normalizes the raw QSRSoft "form questions" payload
// (GET forms.home.myqsrsoft.com/api/forms/questions?formId=…) into a compact,
// print-friendly section/item model, and renders a clean BLANK printable HTML
// document (fill-by-hand). No live data — these are reusable templates captured
// once by scripts/qsrsoft-forms-pull.mjs into public/forms/*.json.
//
// Raw question types seen in the Pre-Shift / Travel Path forms:
//   header      → section divider (or the form's title banner at order 0)
//   radio       → a checklist item; top-level options are the hand-mark choices
//                 (Complete / Needs Action / Action Taken). Nested corrective
//                 "Follow Up" checkboxes hang off the "Needs Action" option — we
//                 intentionally drop those (dozens per item) for a blank sheet.
//   checkbox    → multi-select item (rare at top level)
//   textShort   → single-line write-in (e.g. Name)
//   textLong    → multi-line write-in (e.g. the #1–#4 priority notes)
//   datePicker  → date write-in (Today's Date)
//   timePicker  → time write-in (Start Time)
import { escapeHtml } from '../utils/fmt.js';

const TEXT_LINES = { textLong: 3, textShort: 1 };

// Normalize a raw questions array (+ optional form metadata) into a section model.
export function normalizeForm(rawQuestions, meta = {}) {
  const rows = (rawQuestions || [])
    .filter(q => q && q.title != null)
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  const sections = [];
  let current = null;
  const ensureSection = (title = '') => {
    // Reuse a leading untitled section rather than spawning duplicates.
    if (!current) { current = { title, items: [] }; sections.push(current); }
    return current;
  };

  for (const q of rows) {
    const type = q.type;
    if (type === 'header') {
      current = { title: String(q.title || '').trim(), items: [] };
      sections.push(current);
      continue;
    }
    const item = mapItem(q);
    if (item) ensureSection().items.push(item);
  }

  // Drop empty trailing/leading sections (a header with no items still prints as
  // a labeled divider, which is desirable, so only drop genuinely empty+untitled).
  const cleaned = sections.filter(s => s.title || s.items.length);

  return {
    formId: meta.formId || (rows[0] && rows[0].formId) || '',
    title: (meta.title || '').trim() || 'QSRSoft Form',
    description: (meta.description || '').trim(),
    category: meta.category || meta.categoryTitle || '',
    lastEditedAt: meta.lastEditedAt || '',
    itemCount: cleaned.reduce((n, s) => n + s.items.length, 0),
    sections: cleaned,
  };
}

function mapItem(q) {
  const title = String(q.title || '').trim();
  if (!title) return null;
  switch (q.type) {
    case 'radio':
    case 'checkbox': {
      const options = (q.options || [])
        .map(o => String(o && o.title || '').trim())
        .filter(Boolean);
      return { kind: 'check', title, options };
    }
    case 'datePicker': return { kind: 'field', title, field: 'date' };
    case 'timePicker': return { kind: 'field', title, field: 'time' };
    case 'textShort':
    case 'textLong': return { kind: 'text', title, lines: TEXT_LINES[q.type] || 1 };
    default:          return { kind: 'text', title, lines: 1 };
  }
}

// Build a standalone, print-ready BLANK HTML document (black-on-white, checkboxes
// to mark by hand). `opts.storeLabel` optionally stamps a store name in the header.
export function buildFormPrintHTML(form, opts = {}) {
  const esc = escapeHtml;
  const storeLine = opts.storeLabel ? `<span class="meta">Store: ${esc(opts.storeLabel)}</span>` : '';

  const sectionsHTML = (form.sections || []).map(sec => {
    const head = sec.title
      ? `<tr><td colspan="2" class="sec">${esc(sec.title)}</td></tr>`
      : '';
    const items = (sec.items || []).map(it => renderItemRow(it, esc)).join('');
    return head + items;
  }).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(form.title)}</title>
<style>
  @page { margin: 0.5in; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; color: #000; margin: 0; font-size: 11px; line-height: 1.35; }
  h1 { font-size: 16px; margin: 0 0 2px; }
  .sub { color: #333; font-size: 10px; margin: 0 0 4px; }
  .hdr { display: flex; flex-wrap: wrap; gap: 14px; align-items: baseline; border-bottom: 2px solid #000; padding-bottom: 6px; margin-bottom: 8px; }
  .fill { border-bottom: 1px solid #000; display: inline-block; min-width: 120px; height: 1em; }
  .meta { font-size: 10px; }
  table { width: 100%; border-collapse: collapse; }
  td { vertical-align: top; padding: 3px 4px; border-bottom: .5px solid #bbb; }
  td.item { width: 58%; }
  td.opts { width: 42%; white-space: nowrap; }
  tr.sec td { background: #111; color: #fff; font-weight: 700; text-transform: uppercase; letter-spacing: .4px; font-size: 10px; padding: 4px 6px; border: none; }
  .box { display: inline-block; margin-right: 3px; }
  .opt { margin-right: 12px; display: inline-block; }
  .writein { border-bottom: 1px solid #000; display: block; height: 1.25em; margin-top: 2px; }
  .writein + .writein { margin-top: 6px; }
  @media print { tr.sec td { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
  <div class="hdr">
    <div>
      <h1>${esc(form.title)}</h1>
      ${form.description ? `<div class="sub">${esc(form.description)}</div>` : ''}
    </div>
    ${storeLine}
    <span class="meta">Date: <span class="fill"></span></span>
    <span class="meta">By: <span class="fill"></span></span>
  </div>
  <table><tbody>${sectionsHTML}</tbody></table>
</body></html>`;
}

function renderItemRow(it, esc) {
  if (it.kind === 'check') {
    const opts = (it.options && it.options.length ? it.options : ['Complete', 'Needs Action', 'Action Taken'])
      .map(o => `<span class="opt"><span class="box">&#9744;</span>${esc(o)}</span>`).join('');
    return `<tr><td class="item">${esc(it.title)}</td><td class="opts">${opts}</td></tr>`;
  }
  if (it.kind === 'field') {
    const w = it.field === 'time' ? '90px' : '140px';
    return `<tr><td class="item">${esc(it.title)}</td><td class="opts"><span class="fill" style="min-width:${w}"></span></td></tr>`;
  }
  // text write-in (1 or more lines) spans the full width
  const lines = Math.max(1, it.lines || 1);
  const blanks = Array.from({ length: lines }, () => '<span class="writein"></span>').join('');
  return `<tr><td colspan="2" class="item">${esc(it.title)}${blanks}</td></tr>`;
}
