// Conversion Efficiency Ratio PDF parser — "Owner Operator Reports" emailed monthly from
// McDonald's corporate (US Partners), one PDF per owner, one page per restaurant. Oracle
// Analytics Publisher output: each table cell is its own PDF text item, so columns are
// identified by X position (same technique as voice-performance.js's METRIC_COLS, not by
// splitting on whitespace) — a new-item row with no 2025 baseline can be MISSING up to 4 of
// the 8 numeric columns (e.g. "Ice Cream Mix" with no prior-year figure to compare against),
// so sequential positional parsing would silently misalign every column after the first gap.
//
// Row output: { period, owner_name, loc, loc_name, raw_item,
//               conv_eff_52wk, conv_eff_target, excess_cases_annual, financial_opportunity_annual,
//               conv_eff_2025_ye, conv_eff_ytd, conv_eff_pct_chg, financial_impact_ytd,
//               source_file }

// X-range column boundaries, measured directly off real report PDFs (pdfjs-dist text item
// x-coordinates) — see memory/finding-conversion-efficiency-pdf-structure-2026-10-19.md for the
// full measured cluster data this is derived from. Boundaries sit at the midpoint between two
// adjacent columns' observed centers, so a column's own right-aligned values (which shift left
// as digit count grows) still land inside their own bucket without reaching into the next one.
const COLS = [
  { field: 'conv_eff_52wk',               x0: 100, x1: 197 },
  { field: 'conv_eff_target',             x0: 197, x1: 253 },
  { field: 'excess_cases_annual',         x0: 253, x1: 313 },
  { field: 'financial_opportunity_annual',x0: 313, x1: 367 },
  { field: 'conv_eff_2025_ye',            x0: 367, x1: 413 },
  { field: 'conv_eff_ytd',                x0: 413, x1: 467 },
  { field: 'conv_eff_pct_chg',            x0: 467, x1: 507 },
  { field: 'financial_impact_ytd',        x0: 507, x1: 700 },
];

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];

function parseNum(text) {
  if (text == null) return null;
  const t = String(text).trim();
  if (t === '' || t === '%' || t === '-') return null;
  const n = parseFloat(t.replace(/[$,%]/g, ''));
  return isNaN(n) ? null : n;
}

export async function parseConversionEfficiencyPDF(arrayBuffer, filename = '') {
  // Lazy-load pdfjs-dist — legacy build, same reason voice-performance.js gives (iOS < 17.4 compat).
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/legacy/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  }

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const rows = [];
  let sawTitle = false;
  let ownerName = null;
  let period = null;

  for (let pg = 1; pg <= pdf.numPages; pg++) {
    const page = await pdf.getPage(pg);
    const content = await page.getTextContent();
    const items = content.items
      .filter(i => i.str && i.str.trim())
      .map(i => ({ text: i.str.trim(), x: i.transform[4], y: i.transform[5] }));

    if (items.some(i => i.text.includes('Conversion Efficiency'))) sawTitle = true;

    if (!ownerName) {
      const idx = items.findIndex(i => i.text === 'Owner:');
      if (idx >= 0) {
        const sameRow = items.filter(i => Math.abs(i.y - items[idx].y) < 3 && i.x > items[idx].x);
        if (sameRow.length) ownerName = sameRow.sort((a, b) => a.x - b.x).map(i => i.text).join(' ').trim();
      }
    }
    if (!period) {
      // Some reports repeat this label twice per page -- a bare "52 Weeks Ending" column
      // header (no month/year) at one position, and the real "52 Weeks Ending <Month> <Year>"
      // value at another. items.find() on a substring match alone can land on the bare label
      // first and silently leave period unset for the entire file. Require the month/year to
      // already be present in the matched item, not just the leading phrase.
      const tf = items.find(i => /52 Weeks Ending\s+\w+\s+\d{4}/i.test(i.text));
      if (tf) {
        const m = tf.text.match(/52 Weeks Ending\s+(\w+)\s+(\d{4})/i);
        if (m) {
          const mi = MONTHS.indexOf(m[1].toLowerCase());
          if (mi >= 0) period = `${m[2]}-${String(mi + 1).padStart(2, '0')}`;
        }
      }
    }

    // Walk restaurant sections on this page — a page can hold one or more "Restaurant: NNNNN-NAME"
    // headers (observed: always one per page in practice, but nothing guarantees that structurally).
    const restaurantItems = items
      .filter(i => /^Restaurant:\s*\d{4,6}-/.test(i.text))
      .sort((a, b) => b.y - a.y); // top of page first (PDF y grows upward)

    for (let r = 0; r < restaurantItems.length; r++) {
      const header = restaurantItems[r];
      const m = header.text.match(/^Restaurant:\s*(\d{4,6})-(.+)/);
      if (!m) continue;
      const loc = m[1].replace(/^0+/, '') || m[1]; // strip the report's zero-padding to match STORE_NAMES' unpadded keys
      const locName = m[2].trim();

      // This section's rows run from just below this header down to the next restaurant header
      // (or the bottom of the page).
      const yTop = header.y;
      const yBottom = r + 1 < restaurantItems.length ? restaurantItems[r + 1].y : -Infinity;
      const sectionItems = items.filter(i => i.y < yTop && i.y > yBottom);

      // Raw-item rows are identified by a label item sitting at the left margin (x < 100) that
      // isn't "Total" (the section's own trailing total row, $ columns only, no item name to key
      // on) and isn't the page's CONFIDENTIAL footer disclaimer, which also starts at x < 100 and
      // would otherwise be picked up as a bogus 19th "raw item" on every single page.
      const labelItems = sectionItems.filter(
        i => i.x < 100 && i.text !== 'Total' && i.text.length < 40 && !/confidential/i.test(i.text)
      );
      for (const label of labelItems) {
        const rowItems = sectionItems.filter(i => Math.abs(i.y - label.y) < 4 && i.x >= 100);
        const metrics = {};
        for (const col of COLS) {
          const match = rowItems.find(i => i.x >= col.x0 && i.x < col.x1);
          metrics[col.field] = parseNum(match?.text ?? null);
        }
        rows.push({
          period, owner_name: ownerName, loc, loc_name: locName || null,
          raw_item: label.text, source_file: filename,
          ...metrics,
        });
      }
    }
  }

  // Not this report type at all (wrong PDF routed here) — return nothing rather than a
  // partial/garbage parse the caller might silently save.
  if (!sawTitle) return [];
  return rows;
}
