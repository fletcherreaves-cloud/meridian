// @ts-nocheck
// Owner-reported 2026-11-09: store 44689's lifelenz_schedule rows were coming back with every
// forecast/hours field null, despite a real LifeLenz export (Labor_Analysis_Summary_Report.csv)
// showing real values for the same week. Reproducing that real CSV through parseCSV() (see
// scripts/lifelenz-pull.mjs's own fc() comment) surfaced a SEPARATE, pre-existing bug affecting
// every store, not just 44689: the `tcs` (actual transaction count) column was silently
// resolving to the "Fcst. TCs" (forecast) column instead, because a pure substring match on
// 'TCs' matches "Fcst. TCs"/"Adj. TCs."/"TCs +/-" too, and those sit BEFORE the real "TCs"
// header in this report's own column order -- findIndex's first match won. Fixed generically
// (exact match tried first, substring only as a fallback) rather than special-cased to `tcs`.
import { describe, it, expect } from 'vitest';
import { parseCSV } from '../../scripts/lifelenz-pull.mjs';

// Verbatim shape of the real exported report (headers + one representative data row), store
// 44689, week of 2026-11-11 -- the exact CSV the owner captured and shared this session.
const REAL_CSV = [
  '"","","","",Store,0044689',
  'Date,Fcst.$,Adj. Fcst.$,Sales,Sales +/-,Fcst. TCs,Adj. TCs.,TCs,TCs +/-,Labor %,Proj. VLH,Sch. VLH,Need. VLH,VLH,VLH +/-,Fix.Guide.Hrs,Sch.Fix.Hrs.,Proj.Floor,Sch.Floor,Need.Floor,Ideal Tot.Hrs,Sal.Mgr.Hrs,Crew Hrs,Total Hrs +/-,TPMH',
  '11/11/2026,6786.48,0,,-6786.48,739,2,,-2,,0.5,,0,,,0,,24,,24,24,,,,',
].join('\n');

describe('lifelenz-pull parseCSV — TCs column fix (dispatch 2026-11-09)', () => {
  it('resolves fcst_tcs (forecast) and tcs (actual) to their own distinct columns, not the same one', () => {
    const rows = parseCSV(REAL_CSV);
    expect(rows).toHaveLength(1);
    // Real header-row values: "Fcst. TCs"=739 (index 5), "Adj. TCs."=2 (index 6), "TCs"=blank
    // (index 7, no actual transactions yet for a future date), "TCs +/-"=-2 (index 8).
    expect(rows[0].fcst_tcs).toBe(739);
    // The real "TCs" column is blank for this future date -- correctly null, not 739.
    expect(rows[0].tcs).toBeNull();
    expect(rows[0].tcs).not.toBe(rows[0].fcst_tcs);
  });

  it('still parses fcst_sales correctly (regression guard -- this field already worked)', () => {
    const rows = parseCSV(REAL_CSV);
    expect(rows[0].fcst_sales).toBe(6786.48);
    expect(rows[0].loc).toBe('0044689');
    expect(rows[0].date).toBe('2026-11-11');
  });

  it('TCs resolves to the real actual-TCs value when one is present (not blank)', () => {
    const csvWithActual = [
      '"","","","",Store,0005183',
      'Date,Fcst.$,Adj. Fcst.$,Sales,Sales +/-,Fcst. TCs,Adj. TCs.,TCs,TCs +/-,Labor %,Proj. VLH,Sch. VLH,Need. VLH,VLH,VLH +/-,Fix.Guide.Hrs,Sch.Fix.Hrs.,Proj.Floor,Sch.Floor,Need.Floor,Ideal Tot.Hrs,Sal.Mgr.Hrs,Crew Hrs,Total Hrs +/-,TPMH',
      '11/01/2026,8000,8000,8123.45,123.45,850,850,861,11,21.5,90,88,85,-3,0.5,0,0,25,25,25,25,24,61,2,9.4',
    ].join('\n');
    const rows = parseCSV(csvWithActual);
    expect(rows[0].fcst_tcs).toBe(850);
    expect(rows[0].tcs).toBe(861); // the real actual-TCs column, not 850 again
  });
});
