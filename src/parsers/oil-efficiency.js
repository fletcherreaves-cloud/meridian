// Oil Efficiency ("Oil Management Report") PDF parser — Cargill-generated monthly reports,
// same "Owner Operator Reports" email program as Conversion Efficiency Ratio (see
// conversion-efficiency.js's own header for the broader context). Owner request 2026-10-19:
// "I want to do the same for oil efficiency reports... build out to app."
//
// matplotlib-generated PDF (not Oracle Analytics Publisher like Conversion Efficiency), but the
// same core technique applies: each table cell is its own discrete text item, so columns are
// identified by X position, not by splitting on whitespace or assuming a fixed token order.
//
// Structure (measured directly against 18 real sample PDFs spanning 4 owners, Mar-Aug 2026):
// one summary page (owner-level + per-store 3-month headline table -- skipped here, it's fully
// redundant with each store's own TRENDS 3-month column, same "don't parse the recomputable
// Organization Totals" precedent as conversion-efficiency.js), then one page per restaurant with
// a TRENDS table: 3 metric rows (Oil Use vs. Target / Restaurant Impact / Filtration Compliance)
// x 3 trailing-average columns (3/6/12 MTH AVG). Oil Use and Filtration are always a signed/
// unsigned percent; Restaurant Impact is EITHER a $ amount (store is over target -- a real
// estimated cost) OR a categorical label ("Quality Concern", "Optimized") when there's no $
// figure -- both forms are real, measured values, not an error case.
//
// Row output: one row per (loc, period) -- no per-item dimension like Conversion Efficiency has,
// this report is store-level only.
//   { period, owner_name, loc, loc_name,
//     oil_use_3mo_pct, oil_use_6mo_pct, oil_use_12mo_pct,
//     impact_3mo_dollars, impact_3mo_label, impact_6mo_dollars, impact_6mo_label,
//     impact_12mo_dollars, impact_12mo_label,
//     filtration_3mo_pct, filtration_6mo_pct, filtration_12mo_pct,
//     source_file }

// X-range column boundaries for the TRENDS table, measured directly off real report PDFs
// (pdfjs-dist text item x-coordinates). Column header x~249/374/496; values right-align under
// short numeric text (x~260-270/388-391/502-518) but a long categorical label in an earlier
// column shifts left (e.g. "Quality Concern" in the 6mo column sits at x~362, well clear of the
// 3mo column's own max ~265) -- boundaries sit well inside the real gaps, not at the midpoints.
const COLS = [
  { field: 'col3mo', x0: 150, x1: 330 },
  { field: 'col6mo', x0: 330, x1: 460 },
  { field: 'col12mo', x0: 460, x1: 700 },
];

const MONTHS = ['january','february','march','april','may','june','july','august','september','october','november','december'];
// These reports use 3-letter month abbreviations ("Mar", "Apr", "Aug") rather than
// conversion-efficiency.js's full month names -- "May" being identical either way is exactly
// why a first pass against this real sample batch only parsed May correctly by coincidence.
const monthIndex = name => MONTHS.findIndex(m => m.startsWith(name.toLowerCase()));

// A TRENDS cell is either a signed/unsigned percent, a dollar amount, or (Restaurant Impact
// only) a categorical label -- never guess which, read what's actually there.
function parseCell(text) {
  if (text == null) return { num: null, label: null };
  const t = String(text).trim();
  if (t === '' || t === '-') return { num: null, label: null };
  if (/^[+-]?\$[\d,]+(\.\d+)?$/.test(t)) return { num: parseFloat(t.replace(/[$,]/g, '')), label: null };
  if (/^[+-]?\d+(\.\d+)?%$/.test(t)) return { num: parseFloat(t.replace('%', '')), label: null };
  return { num: null, label: t };
}

export async function parseOilEfficiencyPDF(arrayBuffer, filename = '') {
  // Lazy-load pdfjs-dist — legacy build, same reason conversion-efficiency.js/voice-performance.js give.
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

    // "Oil Management Report" appears on every restaurant page (unlike "Oil Summary Report",
    // which is page-1 only) -- the more robust routing-safety gate.
    if (items.some(i => i.text.includes('Oil Management Report'))) sawTitle = true;

    if (!ownerName) {
      const ow = items.find(i => /^Owner:\s*/i.test(i.text));
      if (ow) ownerName = ow.text.replace(/^Owner:\s*/i, '').trim() || null;
    }
    if (!period) {
      const tf = items.find(i => /Ending\s+\w+\s+\d{1,2},?\s+\d{4}/i.test(i.text));
      if (tf) {
        const m = tf.text.match(/Ending\s+(\w+)\s+\d{1,2},?\s+(\d{4})/i);
        if (m) {
          const mi = monthIndex(m[1]);
          if (mi >= 0) period = `${m[2]}-${String(mi + 1).padStart(2, '0')}`;
        }
      }
    }

    // Walk restaurant sections on this page — a page can hold one or more "Restaurant: NNNNN-NAME"
    // headers (observed: always one per page in practice, same defensive Y-range slicing as
    // conversion-efficiency.js in case that's not guaranteed for every real capture).
    const restaurantItems = items
      .filter(i => /^Restaurant:\s*\d{4,6}-/.test(i.text))
      .sort((a, b) => b.y - a.y);

    for (let r = 0; r < restaurantItems.length; r++) {
      const header = restaurantItems[r];
      const m = header.text.match(/^Restaurant:\s*(\d{4,6})-(.+)/);
      if (!m) continue;
      const loc = m[1].replace(/^0+/, '') || m[1];
      const locName = m[2].trim();

      const yTop = header.y;
      const yBottom = r + 1 < restaurantItems.length ? restaurantItems[r + 1].y : -Infinity;
      const sectionItems = items.filter(i => i.y < yTop && i.y > yBottom);

      const metricRows = {};
      for (const label of ['Oil Use vs. Target', 'Restaurant Impact', 'Filtration Compliance']) {
        const labelItem = sectionItems.find(i => i.text === label);
        if (!labelItem) continue;
        const rowItems = sectionItems.filter(i => Math.abs(i.y - labelItem.y) < 4 && i.x > labelItem.x);
        const cells = {};
        for (const col of COLS) {
          const match = rowItems.find(i => i.x >= col.x0 && i.x < col.x1);
          cells[col.field] = parseCell(match?.text ?? null);
        }
        metricRows[label] = cells;
      }

      // No TRENDS table found in this section at all (e.g. a malformed/partial page) — skip
      // rather than save a row of all-nulls.
      if (!Object.keys(metricRows).length) continue;

      const oilUse = metricRows['Oil Use vs. Target'] || {};
      const impact = metricRows['Restaurant Impact'] || {};
      const filtration = metricRows['Filtration Compliance'] || {};

      rows.push({
        period, owner_name: ownerName, loc, loc_name: locName || null, source_file: filename,
        oil_use_3mo_pct: oilUse.col3mo?.num ?? null,
        oil_use_6mo_pct: oilUse.col6mo?.num ?? null,
        oil_use_12mo_pct: oilUse.col12mo?.num ?? null,
        impact_3mo_dollars: impact.col3mo?.num ?? null,
        impact_3mo_label: impact.col3mo?.label ?? null,
        impact_6mo_dollars: impact.col6mo?.num ?? null,
        impact_6mo_label: impact.col6mo?.label ?? null,
        impact_12mo_dollars: impact.col12mo?.num ?? null,
        impact_12mo_label: impact.col12mo?.label ?? null,
        filtration_3mo_pct: filtration.col3mo?.num ?? null,
        filtration_6mo_pct: filtration.col6mo?.num ?? null,
        filtration_12mo_pct: filtration.col12mo?.num ?? null,
      });
    }
  }

  // Not this report type at all (wrong PDF routed here) — return nothing rather than a
  // partial/garbage parse the caller might silently save.
  if (!sawTitle) return [];
  return rows;
}
