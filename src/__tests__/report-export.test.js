// @vitest-environment happy-dom
// @ts-nocheck
// Reports redesign Phase 2 -- the shared export actions every new report built on ReportShell.js
// gets for free. Real data contract: {title, subtitle?, headers, rows}. Verifies each action
// actually produces a real artifact (a real .xlsx workbook, a real generated PDF with real
// bytes -- not browser print-to-PDF) rather than just not-throwing, since "it ran" and "it
// produced the right file" are different claims (CLAUDE.md's own "measure it" standing rule).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import {
  buildReportFilename, exportReportCSV, exportReportXLSX, exportReportPDF, printReportHTML,
} from '../utils/report-export.js';

describe('buildReportFilename', () => {
  it('matches DateRangeReport\'s own existing naming convention', () => {
    expect(buildReportFilename({ name: 'Loss Prevention', start: '2026-10-01', end: '2026-10-14', scope: 'AllStores' }))
      .toBe('LossPrevention_2026-10-01_2026-10-14_AllStores');
  });

  it('sanitizes a scope with special characters (a store name, not just the AllStores sentinel)', () => {
    expect(buildReportFilename({ name: 'Report', scope: 'Freeport, FL' }))
      .toBe('Report_Freeport__FL');
  });

  it('omits missing pieces rather than inserting empty segments', () => {
    expect(buildReportFilename({ name: 'Report' })).toBe('Report');
  });
});

describe('exportReportCSV', () => {
  let origClick, clicks;
  beforeEach(() => {
    clicks = [];
    origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicks.push(this.download); };
  });
  afterEach(() => { HTMLAnchorElement.prototype.click = origClick; });

  it('downloads a real CSV with escaped quotes and a .csv extension appended', () => {
    exportReportCSV({
      filename: 'Report_2026-10-01',
      headers: ['Store', 'Note'],
      rows: [['Freeport', 'Has a "quoted" word'], ['Chipley', null]],
    });
    expect(clicks).toEqual(['Report_2026-10-01.csv']);
  });

  it('does not double the extension when the caller already included it', () => {
    exportReportCSV({ filename: 'Report.csv', headers: ['A'], rows: [[1]] });
    expect(clicks).toEqual(['Report.csv']);
  });
});

describe('exportReportXLSX', () => {
  let origClick, clicks;
  beforeEach(() => {
    clicks = [];
    origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () { clicks.push(this.download); };
  });
  afterEach(() => { HTMLAnchorElement.prototype.click = origClick; });

  it('builds a real workbook with the right headers/rows and downloads a .xlsx file', async () => {
    await exportReportXLSX({
      filename: 'Report', sheetName: 'Loss Prevention',
      headers: ['Store', 'Discount %'], rows: [['Freeport', 2.1], ['Chipley', 1.8]],
    });
    expect(clicks).toEqual(['Report.xlsx']);
  });

  it('caps a too-long sheet name at Excel\'s 31-char limit instead of throwing', async () => {
    await expect(exportReportXLSX({
      filename: 'Report', sheetName: 'A Very Long Sheet Name That Exceeds The Excel Limit',
      headers: ['A'], rows: [[1]],
    })).resolves.not.toThrow();
  });
});

describe('exportReportPDF', () => {
  // jsPDF's own .save() detects its runtime, and this test environment (happy-dom layered on
  // real Node, per vitest's own docs) still exposes Node's `require`/`fs` alongside the DOM
  // polyfills -- so jsPDF's UMD build picks the NODE path here (confirmed live: it called
  // fs.writeFileSync with the real filename, not a browser Blob+anchor-click), which a real
  // browser bundle never would (no `require`/`fs` exist there, so jsPDF's own runtime check
  // falls through to the Blob+anchor path -- the exact mechanism CSV/XLSX export already use
  // and already test). Rather than fight the harness's own Node/DOM hybrid, this test uses the
  // side effect: read back the REAL file jsPDF wrote and verify real PDF bytes (the %PDF magic
  // header, a non-trivial size) -- a stronger check than "the call didn't throw," and always
  // cleaned up in afterEach so no stray file survives the test run.
  const _written = [];
  afterEach(() => {
    for (const f of _written) { try { fs.unlinkSync(f); } catch { /* already gone */ } }
    _written.length = 0;
  });

  it('generates a real PDF (via jsPDF + autoTable, not printHtml) with real PDF bytes', async () => {
    _written.push('Report.pdf');
    await exportReportPDF({
      filename: 'Report', title: 'Loss Prevention Summary', subtitle: 'Oct 1 - Oct 14',
      headers: ['Store', 'Discount %'], rows: [['Freeport', '2.1%'], ['Chipley', '1.8%']],
    });
    const bytes = fs.readFileSync('Report.pdf');
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(bytes.length).toBeGreaterThan(500); // a real multi-row table, not an empty shell
  });

  it('switches to landscape orientation for a wide table (>6 columns) without throwing', async () => {
    _written.push('Wide.pdf');
    const headers = ['Store', 'A', 'B', 'C', 'D', 'E', 'F'];
    await expect(exportReportPDF({ filename: 'Wide', title: 'Wide Report', headers, rows: [] }))
      .resolves.not.toThrow();
    const bytes = fs.readFileSync('Wide.pdf');
    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });
});

describe('exportReportPDFFromHTML', () => {
  // ⚠️ BUG FIXED 2026-11-15: "⬇ PDF" always rendered the generic flat {headers,rows} table even
  // when a report supplied bespoke getPrintHTML() for "🖨 Print", so Print and PDF silently
  // diverged. This fixes it by rasterizing the SAME print HTML into the PDF instead. html2canvas
  // needs a real browser paint engine happy-dom doesn't have, so (same as the "📸 Share" button's
  // own test) it's mocked at the module boundary -- real rasterization fidelity is a browser
  // concern, not something this suite can meaningfully assert on. jsPDF is mocked too, scoped to
  // just this block via vi.doMock + vi.resetModules (never a file-level vi.mock), so the
  // exportReportPDF describe block above keeps exercising the REAL jsPDF and its real PDF bytes.
  // This block's job is the WIRING the fix is actually about: one PDF page per `.store-page`
  // section, in document order, falling back to the whole body when a report has none.
  let capturedNodes, addImageCalls, addPageCalls, savedFilenames;

  beforeEach(() => {
    capturedNodes = [];
    addImageCalls = [];
    addPageCalls = 0;
    savedFilenames = [];
    vi.doMock('html2canvas', () => ({
      default: vi.fn((node) => {
        capturedNodes.push(node);
        return Promise.resolve({ width: 800, height: 600, toDataURL: () => 'data:image/png;base64,FAKE' });
      }),
    }));
    vi.doMock('jspdf', () => ({
      jsPDF: vi.fn().mockImplementation(function () {
        return {
          internal: { pageSize: { getWidth: () => 612, getHeight: () => 792 } },
          addPage: vi.fn(() => { addPageCalls++; }),
          addImage: vi.fn((...args) => { addImageCalls.push(args); }),
          save: vi.fn((filename) => { savedFilenames.push(filename); }),
        };
      }),
    }));
    vi.doMock('jspdf-autotable', () => ({ default: vi.fn() }));
  });

  afterEach(() => {
    vi.doUnmock('html2canvas');
    vi.doUnmock('jspdf');
    vi.doUnmock('jspdf-autotable');
    vi.resetModules();
  });

  it('rasterizes one page per .store-page section, in document order, adding a PDF page for every section after the first', async () => {
    vi.resetModules();
    const { exportReportPDFFromHTML } = await import('../utils/report-export.js');
    const html = '<html><body>' +
      '<div class="store-page" data-store="Freeport">A</div>' +
      '<div class="store-page" data-store="Chipley">B</div>' +
      '</body></html>';
    await exportReportPDFFromHTML({ filename: 'Report', html });
    expect(capturedNodes.length).toBe(2);
    expect(capturedNodes[0].getAttribute('data-store')).toBe('Freeport');
    expect(capturedNodes[1].getAttribute('data-store')).toBe('Chipley');
    expect(addPageCalls).toBe(1); // first section is the doc's own initial page; the 2nd needs one addPage
    expect(addImageCalls.length).toBe(2);
    expect(savedFilenames).toEqual(['Report.pdf']);
  });

  it('falls back to rasterizing the whole body as a single page when there is no .store-page section', async () => {
    vi.resetModules();
    const { exportReportPDFFromHTML } = await import('../utils/report-export.js');
    await exportReportPDFFromHTML({ filename: 'Flat', html: '<html><body><p>No sections here</p></body></html>' });
    expect(capturedNodes.length).toBe(1);
    expect(capturedNodes[0].textContent).toContain('No sections here');
    expect(addPageCalls).toBe(0);
    expect(addImageCalls.length).toBe(1);
    expect(savedFilenames).toEqual(['Flat.pdf']);
  });

  it('removes the off-screen capture container from the DOM after export', async () => {
    vi.resetModules();
    const { exportReportPDFFromHTML } = await import('../utils/report-export.js');
    await exportReportPDFFromHTML({ filename: 'Report', html: '<html><body><div class="store-page">A</div></body></html>' });
    expect(document.body.querySelectorAll('[style*="-99999px"]').length).toBe(0);
  });
});

describe('printReportHTML', () => {
  it('calls the shared printHtml overlay with an escaped, well-formed HTML document', async () => {
    const printHtmlMock = vi.fn(() => ({ close: () => {}, print: () => {} }));
    vi.doMock('../utils/print-html.js', () => ({ printHtml: printHtmlMock }));
    vi.resetModules();
    const { printReportHTML: printReportHTMLFresh } = await import('../utils/report-export.js');
    printReportHTMLFresh({
      title: 'Loss Prevention <Summary>', subtitle: 'Oct 1 - Oct 14',
      headers: ['Store', 'Note'], rows: [['Freeport', '<script>alert(1)</script>']],
    });
    expect(printHtmlMock).toHaveBeenCalledTimes(1);
    const html = printHtmlMock.mock.calls[0][0];
    expect(html).toContain('Loss Prevention &lt;Summary&gt;');
    expect(html).not.toContain('<script>alert(1)</script>'); // escaped, not injected raw
    expect(html).toContain('&lt;script&gt;');
    vi.doUnmock('../utils/print-html.js');
  });
});
