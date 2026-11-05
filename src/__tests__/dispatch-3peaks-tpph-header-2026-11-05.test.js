// @ts-nocheck
// Owner-caught live (screenshot, Harrah #34222, 2026-11-05): the 3 Peaks tab's per-daypart
// card grid (store-dash.js's PeaksTab/analyzePeaks) showed OEPE/R2P/KVS Time all real for
// every daypart, but TPPH rendered "-" (blank) for all three, even though its target still
// resolved. Root cause measured directly against parse3PeaksSales (not reasoned about): the
// dedicated 3-Peaks Sales parser's TPPH column lookup only ever checked the literal header
// 'TPPH' (parsers/index.js's parse3PeaksSales, `tpph:findCol(h,'TPPH')`) -- the one TPPH
// lookup in this file missing the 'Trans Per Person Hour' spelled-out alias that every other
// TPPH-reading parser in this same file carries (see parseMbiLaborAnalysis's
// `fc(h,'TPPH','Trans Per Person Hour')` and the FOB parser's `fc('TPPH','Trans Per Person
// Hour')`). QSRSoft's 3 Peaks Sales export spells the column out instead of abbreviating it,
// same header-name-mismatch failure class as dispatch #172's cashOS/cashRefAmt bugs
// (cash-handling-header-match.test.js) -- a real column silently parses as 0 on every row,
// not a missing/zero value in the source data. netSales/gc/avgCheck sit on the SAME row and
// use multi-alias fc()/findCol() lookups that already matched, which is why they kept showing
// real numbers while TPPH alone went blank.
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parse3PeaksSales, parse3PeaksService, ensureParsersXLSXReady } from '../parsers/index.js';

await ensureParsersXLSXReady();

function wbFromAOA(aoa, sheetName) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

describe('parse3PeaksSales — TPPH header (dispatch 2026-11-05, Harrah #34222)', () => {
  // Real-shaped header: QSRSoft's 3 Peaks Sales export spells TPPH out, same as the FOB and
  // MBI Labor Analysis reports elsewhere in this app.
  // Values are plain numbers (how xlsx hands back a currency-formatted numeric cell via
  // raw:true), not '$'-prefixed strings -- a '$1,234.56' TEXT cell would itself break
  // netSales/avgCheck too (parse3PeaksSales reads them with bare parseFloat, not the
  // $-stripping parseNum), which is not what's observed live: only TPPH is blank.
  const HEADER = ['Loc', 'Business Date', 'Time Slice', 'All Net Sales', 'STW GC', 'Average Check', 'Trans Per Person Hour'];
  const ROW = [34222, '2026-11-02', '7am-9am', 1234.56, 110, 11.22, 5.2];
  const rows = parse3PeaksSales(wbFromAOA([HEADER, ROW], 'Sales'));

  it('parses one row', () => { expect(rows.length).toBe(1); });

  it('tpph reads the real spelled-out "Trans Per Person Hour" header, not 0', () => {
    expect(rows[0].tpph).toBeCloseTo(5.2, 2);
  });

  it('sibling fields that already matched (netSales, gc, avgCheck) keep working', () => {
    expect(rows[0].netSales).toBeCloseTo(1234.56, 2);
    expect(rows[0].gc).toBe(110);
    expect(rows[0].avgCheck).toBeCloseTo(11.22, 2);
  });

  it('the abbreviated "TPPH" header (already-matching case) keeps working', () => {
    const HEADER2 = ['Loc', 'Business Date', 'Time Slice', 'All Net Sales', 'STW GC', 'Average Check', 'TPPH'];
    const ROW2 = [34222, '2026-11-02', '11am-2pm', 2000, 150, 13.33, 6.1];
    const rows2 = parse3PeaksSales(wbFromAOA([HEADER2, ROW2], 'Sales'));
    expect(rows2[0].tpph).toBeCloseTo(6.1, 2);
  });
});
