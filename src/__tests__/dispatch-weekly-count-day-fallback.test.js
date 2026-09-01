// @ts-nocheck
// Owner-directed 2026-09-01: "utilize both" -- the qsr_onhand-derived detectWeeklyCountDay()
// (src/engine/count-cycle.js) is precise but sparse (cross-checked against real ground truth on
// 2026-09-01: only 6/20 OK stores agreed under the earlier, broader basis); Organization
// Structure's own "Weekly Inventory Count Day" column (Locations sheet) is real, owner-entered
// ground truth for those same 20 stores. This covers the new fallback layer:
//  1. parseOrgStructureCountDays — reads the Locations sheet's real per-store count day.
//  2. A real-file check against the committed data/org-structure/Organization_Structure.xlsx.
// mergeWeeklyCountDay() itself (the derived+fallback precedence) is covered in count-cycle.test.js.
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseOrgStructureCountDays, ensureParsersXLSXReady } from '../parsers/index.js';

await ensureParsersXLSXReady();

// Header row 2 (index 1), Location Name col 0, "Weekly Inventory Count Day" col 19 -- matching
// the real file's confirmed layout (see data/org-structure/README.md).
function makeLocationsWb({ withBlank = true } = {}) {
  const header = new Array(20).fill(null);
  header[0] = 'Location Name'; header[19] = 'Weekly Inventory Count Day';
  const row = (loc, day) => {
    const r = new Array(20).fill(null);
    r[0] = loc; if (day != null) r[19] = day;
    return r;
  };
  const aoa = [
    new Array(20).fill(null), // row 0 — banner row, same as the real file
    header,
    row(3708, 'Tuesday'),
    row(5183, 'Thursday'),
    withBlank ? row(6178, null) : row(6178, 'Monday'), // FL store — real file has this blank
    row('Above Store', 'Friday'), // legend/non-store row — must be skipped
    row(99999, 'Funday'), // unresolvable weekday string — must be skipped, not crash
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Locations');
  return wb;
}

describe('parseOrgStructureCountDays', () => {
  it('reads real per-store weekday values, skipping blanks, non-store rows, and unrecognized values', () => {
    const rows = parseOrgStructureCountDays(makeLocationsWb());
    const byLoc = {}; for (const r of rows) byLoc[r.loc] = r;
    expect(byLoc['3708']).toMatchObject({ weekday: 2, weekdayName: 'Tuesday' });
    expect(byLoc['5183']).toMatchObject({ weekday: 4, weekdayName: 'Thursday' });
    expect(byLoc['6178']).toBeUndefined();   // blank cell — no fallback signal, not a null row
    expect(byLoc['99999']).toBeUndefined();  // "Funday" doesn't resolve to a weekday
    expect(rows.some(r => r.loc === 'Above Store')).toBe(false); // legend row, not a real store
    expect(rows).toHaveLength(2);
  });

  it('a workbook with no Locations sheet returns empty, not a throw', () => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'Other');
    expect(parseOrgStructureCountDays(wb)).toEqual([]);
  });

  it('a Locations sheet with no "Weekly Inventory Count Day" column returns empty, not a throw', () => {
    const ws = XLSX.utils.aoa_to_sheet([['Location Name'], [3708]]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Locations');
    expect(parseOrgStructureCountDays(wb)).toEqual([]);
  });
});

// Real-file check, same pattern as dispatch-146-org-structure-import.test.js's own real-file
// case: computes expected values from the file's own known contents (verified live 2026-09-01),
// not a hardcoded snapshot that would silently go stale if the file changes.
describe('parseOrgStructureCountDays — real committed file', () => {
  const filePath = join(process.cwd(), 'data/org-structure/Organization_Structure.xlsx');

  it('extracts the real 20-store weekly count day set, FL stores blank', () => {
    if (!existsSync(filePath)) return; // skip in an environment without the data file checked out
    const wb = XLSX.read(readFileSync(filePath));
    const rows = parseOrgStructureCountDays(wb);
    const byLoc = {}; for (const r of rows) byLoc[r.loc] = r.weekdayName;
    // Verified live 2026-09-01 against the committed file.
    expect(byLoc['3708']).toBe('Tuesday');
    expect(byLoc['6972']).toBe('Thursday');
    expect(byLoc['43380']).toBe('Saturday');
    expect(rows).toHaveLength(20); // all 20 OK stores, zero FL stores (never populated there)
    expect(byLoc['6178']).toBeUndefined(); // FL store — no fallback signal from this file
  });
});
