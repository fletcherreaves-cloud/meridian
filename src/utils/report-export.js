// @ts-nocheck
// ── Shared report export actions (Reports redesign Phase 2, 2026-10-15) ──────────────────────
// One data contract every export action consumes: {title, subtitle?, headers, rows}, where
// `headers` is a string[] and `rows` is an array of same-length arrays of string|number|null.
// Every report built on ReportShell.js produces this shape once and gets all four actions for
// free, instead of each report hand-rolling its own CSV-via-Blob (the ~20-copy pattern this
// phase is meant to stop growing) and inventing a fifth shape for PDF/XLSX that nothing else
// shares. Existing hand-rolled exporters elsewhere in the app are untouched -- this is the
// shape NEW reports built on the shell use, not a retrofit.
import { loadXLSX } from '../lib/xlsx-lazy.js';
import { loadJsPDF } from '../lib/jspdf-lazy.js';
import { printHtml } from './print-html.js';

// Matches DateRangeReport's own existing convention (src/views/analytics.js exportCSV) --
// "<ReportName>_<start>_<end>_<scope>.<ext>", scope/dates already caller-sanitized text.
export function buildReportFilename({ name, start, end, scope }) {
  const parts = [name.replace(/[^A-Za-z0-9]/g, '')];
  if (start) parts.push(start);
  if (end) parts.push(end);
  if (scope) parts.push(String(scope).replace(/[^A-Za-z0-9]/g, '_'));
  return parts.join('_');
}

function _withExt(filename, ext) {
  return filename.toLowerCase().endsWith('.' + ext) ? filename : filename + '.' + ext;
}

function _csvCell(v) {
  if (v == null) return '';
  return '"' + String(v).replace(/"/g, '""') + '"';
}

/** Builds the CSV string and triggers a browser download. Synchronous -- no library to load. */
export function exportReportCSV({ filename, headers, rows }) {
  const csv = [headers, ...rows].map(r => r.map(_csvCell).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = _withExt(filename, 'csv');
  a.click();
}

/** Builds a real .xlsx workbook (one sheet) and triggers a browser download. */
export async function exportReportXLSX({ filename, sheetName, headers, rows }) {
  const XLSX = await loadXLSX();
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  // Excel sheet names are capped at 31 chars and can't be empty.
  XLSX.utils.book_append_sheet(wb, ws, (sheetName || 'Report').slice(0, 31) || 'Report');
  XLSX.writeFile(wb, _withExt(filename, 'xlsx'));
}

// McDonald's gold accent (#f5bc00, CLAUDE.md's UI Conventions) as an RGB triple -- jsPDF's
// fillColor takes [r,g,b], not a hex string.
const _PDF_ACCENT_RGB = [245, 188, 0];

/** Builds a real, generated PDF (jsPDF + autoTable, not browser print-to-PDF) and downloads it. */
export async function exportReportPDF({ filename, title, subtitle, headers, rows }) {
  const { jsPDF, autoTable } = await loadJsPDF();
  const doc = new jsPDF({ orientation: headers.length > 6 ? 'landscape' : 'portrait' });
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  if (subtitle) {
    doc.setFontSize(9);
    doc.setTextColor(120);
    doc.text(subtitle, 14, 22);
  }
  autoTable(doc, {
    head: [headers], body: rows,
    startY: subtitle ? 27 : 22,
    styles: { fontSize: 8 },
    headStyles: { fillColor: _PDF_ACCENT_RGB, textColor: [20, 20, 20] },
  });
  doc.save(_withExt(filename, 'pdf'));
}

function _esc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Renders the report as a printable HTML document via the shared printHtml() overlay. */
export function printReportHTML({ title, subtitle, headers, rows }) {
  const html = `<!DOCTYPE html><html><head><title>${_esc(title)}</title><style>
    body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:24px}
    h1{font-size:18px;margin:0 0 4px}
    .sub{color:#666;font-size:10px;margin:0 0 14px}
    table{border-collapse:collapse;width:100%;font-size:10px}
    th{background:#f5bc00;color:#111;padding:5px 8px;text-align:left;font-weight:700;white-space:nowrap}
    td{border:1px solid #ddd;padding:4px 8px}
    tr:nth-child(even){background:#f9f9f9}
    @media print{body{margin:10px}}
  </style></head><body>
    <h1>${_esc(title)}</h1>
    ${subtitle ? `<p class="sub">${_esc(subtitle)}</p>` : ''}
    <table><thead><tr>${headers.map(h => `<th>${_esc(h)}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(r => `<tr>${r.map(c => `<td>${_esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
  </body></html>`;
  printHtml(html);
}
