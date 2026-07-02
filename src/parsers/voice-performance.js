// SMG VOICE Operator Performance Report PDF parser
// Handles the monthly PDF mailed from SMGMailMgr@whysmg.com — "Voice Performance Report"
// Each PDF covers one operator, 3 report types (Monthly / Trailing 90 Day / YTD).
// Operators with many stores get overflow pages (6 pages instead of 3).
//
// Row output: { period, report_type, operator_id, operator_name, loc, loc_name,
//               dt_sat, dt_dissat, ir_sat, ir_dissat, accuracy_b2b, quality_b2b,
//               fries_b2b, snack_wrap_b2b, source_file }

// X ranges for the 8 metric columns in the Restaurant Performance table.
// Derived from pdfplumber text extraction; X coords are consistent across all operator PDFs.
const METRIC_COLS = [
  { field: 'dt_sat',          x0: 172, x1: 220 },  // Drive Thru Overall Satisfaction
  { field: 'dt_dissat',       x0: 228, x1: 266 },  // Drive Thru Dissatisfaction B2B
  { field: 'ir_sat',          x0: 278, x1: 325 },  // In Restaurant Satisfaction
  { field: 'ir_dissat',       x0: 338, x1: 382 },  // In Restaurant Dissatisfaction B2B
  { field: 'accuracy_b2b',    x0: 390, x1: 430 },  // Accuracy B2B
  { field: 'quality_b2b',     x0: 440, x1: 482 },  // Overall Quality B2B
  { field: 'fries_b2b',       x0: 486, x1: 535 },  // Fries Quality B2B
  { field: 'snack_wrap_b2b',  x0: 542, x1: 595 },  // Snack Wrap Quality B2B
];

const MONTHS = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];

function parsePct(str) {
  if (!str || str.toLowerCase() === 'n/a') return null;
  const n = parseInt(str.replace('%', ''), 10);
  return isNaN(n) ? null : n;
}

export async function parseVoicePerformancePDF(arrayBuffer, filename = '') {
  // Lazy-load pdfjs-dist — it's large; only pay the cost when parsing PDFs.
  const pdfjsLib = await import('pdfjs-dist');
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.mjs',
      import.meta.url
    ).toString();
  }

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const rows = [];

  let currentReportType = null;  // 'monthly' | 'trailing90' | 'ytd'
  let operatorId   = null;
  let operatorName = null;
  let period       = null;  // '2026-06'

  for (let pg = 1; pg <= pdf.numPages; pg++) {
    const page   = await pdf.getPage(pg);
    const pageH  = page.view[3];  // page height in PDF units (for Y flip)
    const content = await page.getTextContent();

    // Convert all text items to { text, x, y } with top-down Y
    const words = content.items
      .filter(item => item.str && item.str.trim())
      .map(item => ({
        text: item.str.trim(),
        x:   item.transform[4],
        y:   pageH - item.transform[5],  // flip to top-down
      }));

    // ── Header analysis (first 70 Y units) ────────────────────────────────────
    const headerWords = words.filter(w => w.y < 70);
    const headerText  = headerWords.map(w => w.text).join(' ');

    // Detect report type — only on pages with a full header
    if (headerText.includes('Monthly Report')) {
      currentReportType = 'monthly';
    } else if (headerText.includes('Trailing 90 Day') || headerText.includes('90 Day')) {
      currentReportType = 'trailing90';
    } else if (headerText.includes('Year-to-Date') || headerText.includes('Year to Date')) {
      currentReportType = 'ytd';
    }
    // Overflow pages (no report type in header) keep the previous page's type.

    // Extract operator name + ID once.
    // PDF.js may return "Operator: NAME - ID" as a single text item or split across items.
    if (!operatorId) {
      const opItem = headerWords.find(w => /operator:/i.test(w.text));
      if (opItem) {
        const m = opItem.text.match(/Operator:\s+(.+?)\s+-\s+(\d{10})/i);
        if (m) { operatorName = m[1].trim(); operatorId = m[2]; }
      }
      if (!operatorId) {
        // Fallback: "Operator:" as a separate token, name/ID in following tokens
        const opIdx = headerWords.findIndex(w => w.text.trim() === 'Operator:');
        if (opIdx >= 0) {
          const opLine = headerWords.filter(w => Math.abs(w.y - headerWords[opIdx].y) < 3 && w.x > headerWords[opIdx].x);
          const m = opLine.map(w => w.text).join(' ').match(/^(.+?)\s+-\s+(\d{10})/);
          if (m) { operatorName = m[1].trim(); operatorId = m[2]; }
        }
      }
    }

    // Extract period once — handles "Jun 2026" as one item OR as two separate items.
    if (!period) {
      for (const w of headerWords) {
        const m = w.text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+(20\d{2})\b/i);
        if (m) {
          const mIdx = MONTHS.indexOf(m[1].toLowerCase().slice(0, 3));
          if (mIdx >= 0) { period = `${m[2]}-${String(mIdx + 1).padStart(2, '0')}`; break; }
        }
      }
      if (!period) {
        // Fallback: month and year as separate tokens
        for (let i = 0; i < headerWords.length; i++) {
          const mIdx = MONTHS.indexOf(headerWords[i].text.toLowerCase().slice(0, 3));
          if (mIdx >= 0) {
            const yr = headerWords.find(w => /^20\d{2}$/.test(w.text) && Math.abs(w.y - headerWords[i].y) < 3 && w.x > headerWords[i].x);
            if (yr) { period = `${yr.text}-${String(mIdx + 1).padStart(2, '0')}`; break; }
          }
        }
      }
    }

    // ── Store table extraction ──────────────────────────────────────────────────
    // PDF.js returns store rows as combined items: "#05985 - DURANT-US HWY 70"
    // at X < 35. Match that pattern to extract loc and locName together.
    const storeItems = words.filter(w => w.x < 35 && /^#?\d{5}\s*-/.test(w.text));

    for (const sidItem of storeItems) {
      const rowY = sidItem.y;
      const storeMatch = sidItem.text.match(/^#?(\d{5})\s*-\s*(.+)/);
      if (!storeMatch) continue;

      const loc     = storeMatch[1];
      const locName = storeMatch[2].trim();

      // All words within ±4 Y units of this store row (excluding the ID/name item itself)
      const rowWords = words.filter(w => Math.abs(w.y - rowY) < 4 && w.x >= 35);

      // Extract 8 metrics by column X range
      const metrics = {};
      for (const col of METRIC_COLS) {
        const match = rowWords.find(w => w.x >= col.x0 && w.x <= col.x1);
        metrics[col.field] = parsePct(match?.text ?? null);
      }

      rows.push({
        period,
        report_type:   currentReportType,
        operator_id:   operatorId,
        operator_name: operatorName,
        loc,
        loc_name:      locName || null,
        source_file:   filename,
        ...metrics,
      });
    }
  }

  return rows;
}
