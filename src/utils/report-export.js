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
import { loadHtml2Canvas } from '../lib/html2canvas-lazy.js';
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

// ⚠️ BUG FIXED 2026-11-15 (owner report, live, after two rounds of Print-view fixes that never
// touched PDF): "⬇ PDF" always called exportReportPDF() above -- a jsPDF+autoTable render of the
// generic FLAT {headers,rows} contract -- even for a report that supplies a bespoke getPrintHTML()
// for its "🖨 Print" button. Print and PDF were two completely independent renderers that had
// never been wired together, so every fix made to a report's bespoke print HTML (the FOB-leg
// visual grouping, the cross-month "Blended:" label, the corrected Variance column, all landed
// earlier today) only ever reached Print -- PDF kept rendering the OLD flat-table layout with none
// of it, which is why the owner kept reporting "print/pdf still not fixed" even after Print itself
// visibly improved. Fixed by rendering the SAME bespoke HTML a report already built for Print into
// a real, downloaded PDF -- one PDF page per `.store-page` section (mirroring Print's own
// one-page-per-store design, driven by the exact same markup, not a second hand-built layout) --
// via html2canvas (rasterize each section, same library + off-screen-not-display:none technique
// panel-screenshot.js's proven "📸 Share" button already uses, for the same reason: display:none
// content cannot be captured) + jsPDF's addImage (fit each page's image into a standard PDF page).
// Report-level opt-in: a report with no getPrintHTML() (the ReportShell default) is completely
// unaffected -- this only ever replaces the flat-table PDF for a report that already built bespoke
// HTML for Print, which is exactly the set of reports where the two could visibly disagree.
export async function exportReportPDFFromHTML({ filename, html }) {
  const [{ jsPDF }, html2canvas] = await Promise.all([loadJsPDF(), loadHtml2Canvas()]);
  const container = document.createElement('div');
  // Off-screen, not display:none -- html2canvas (like its "📸 Share" sibling) cannot rasterize an
  // element the browser never actually lays out and paints.
  container.style.cssText = 'position:fixed;left:-99999px;top:0;z-index:-1;';
  document.body.appendChild(container);
  try {
    // Parse the print HTML's own <style> + body markup into our live container so the SAME rules
    // buildPrintHTML() wrote (the FOB accent colors, the per-row shading, the table layout) apply
    // exactly as they do in the real print preview window -- this is the identical document, not
    // a re-derived approximation of it.
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    for (const styleEl of parsed.querySelectorAll('style')) container.appendChild(styleEl.cloneNode(true));
    const body = document.createElement('div');
    body.innerHTML = parsed.body.innerHTML;
    container.appendChild(body);

    // One PDF page per `.store-page` section (buildPrintHTML's own per-store page-break unit) --
    // falls back to the whole body as a single page for a report with no such sections, so this
    // stays general-purpose rather than assuming every bespoke print HTML is per-store.
    const sections = [...body.querySelectorAll('.store-page')];
    const pages = sections.length ? sections : [body];

    const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margin = 24;
    for (let i = 0; i < pages.length; i++) {
      const canvas = await html2canvas(pages[i], { backgroundColor: '#ffffff', useCORS: true, scale: 2 });
      // JPEG, not PNG -- MEASURED live against a real 28-store "All Stores" export (2026-11-15):
      // PNG produced a 164 MB file (~5.9 MB/page) for a plain white-background table report, an
      // unusable attachment/download size. The page has no transparency (backgroundColor:
      // '#ffffff' above guarantees that), so PNG's lossless alpha channel buys nothing here --
      // JPEG at 0.85 is visually indistinguishable for flat table/text content and cut the same
      // export to low single-digit MB.
      const imgData = canvas.toDataURL('image/jpeg', 0.85);
      const availW = pageW - margin * 2, availH = pageH - margin * 2;
      const ratio = Math.min(availW / canvas.width, availH / canvas.height, 1);
      const w = canvas.width * ratio, h = canvas.height * ratio;
      if (i > 0) doc.addPage();
      doc.addImage(imgData, 'JPEG', (pageW - w) / 2, margin, w, h);
    }
    doc.save(_withExt(filename, 'pdf'));
  } finally {
    container.remove();
  }
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
