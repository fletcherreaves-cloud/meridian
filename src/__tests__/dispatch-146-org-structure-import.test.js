// @ts-nocheck
// Dispatch #146 — pre-populate Retention Rollup workshop-week marks from the Organization
// Structure workbook's "1st Schedule Week" column (memory/dispatch-146.md).
//
// Covers three layers:
//  1. parseOrgStructure — reads Scheduling Setup's OWN "1st Schedule Week" column (not the
//     Locations sheet's mirrored, formula-cached-empty copy), skips orphan/legend rows.
//  2. detectType — filename + sheet-name-fallback routing to type:'org-structure'.
//  3. classifyOrgStructureImport — the pure date-gate + skip-if-already-marked bucketing that
//     App.js's handleFiles calls before issuing any saveRetentionMark writes.
//  4. A real-file check against the committed data/org-structure/Organization_Structure.xlsx —
//     computes expected marked/skipped-future counts from the file's own known dates vs
//     "today" (not a hardcoded count) so this stays correct no matter when it's run.
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  parseOrgStructure, classifyOrgStructureImport, detectType, ensureParsersXLSXReady,
} from '../parsers/index.js';
import { weekStartOf } from '../engine/schedule-summary.js';

await ensureParsersXLSXReady();

// ── Synthetic workbook mirroring the real file's confirmed structure ───────────────────────
// Header on row 2 (index 1); Location col 0; "1st Schedule Week" col 11 (col L). Includes:
//  - two real stores with past-dated schedule weeks (3708, 5183 — real STORE_NAMES keys)
//  - one real store with a future-dated schedule week (6972)
//  - one real store with NO schedule-week value at all (24471)
//  - orphan/legend rows past the real stores with no LocationName (46237-style stray rows)
// Also builds a companion "Locations" sheet carrying the SAME header with a null cached value,
// to prove the parser does not read that sheet's mirrored (formula-cached-empty) column.
function makeOrgStructureWb({ past, future, blankHeaderPad = 20 } = {}) {
  const header = new Array(21).fill(null);
  header[0] = 'Location'; header[1] = 'LocationName'; header[11] = '1st Schedule Week';
  const row = (loc, name, dateSerial) => {
    const r = new Array(21).fill(null);
    r[0] = loc; r[1] = name; if (dateSerial != null) r[11] = dateSerial;
    return r;
  };
  const aoa = [
    new Array(21).fill(null), // row 0 — "Use" banner row in the real file
    header,                    // row 1 (row 2, 1-based) — real header row
    row(3708, ' ARDMORE', past),
    row(5183, ' CHICKASHA', past),
    row(6972, ' ADA', future),
    row(24471, ' ARDMORE, OK', null), // no schedule-week date at all
    new Array(21).fill(null),
    row(46237, 'Setup/Mgr Sched', null), // orphan/legend row — not a real store
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Scheduling Setup');
  // Locations sheet: same header, but the "1st Schedule Week" cell is null in every row —
  // simulating the real file's cross-sheet formula whose cached value never recomputed.
  const locHeader = new Array(15).fill(null);
  locHeader[0] = 'Location'; locHeader[1] = 'LocationName'; locHeader[11] = '1st Schedule Week';
  const locsAoa = [locHeader, [3708, ' ARDMORE', ...new Array(9).fill(null), null]];
  const locsWs = XLSX.utils.aoa_to_sheet(locsAoa);
  XLSX.utils.book_append_sheet(wb, locsWs, 'Locations');
  return wb;
}

// Excel serial for a calendar (Y,M,D) — computed from that day's UTC midnight, the inverse of
// parseXLDate's `(v-25569)*86400000+43200000` (which always decodes back to noon UTC of the
// SAME calendar day, so this round-trips regardless of the test runner's local timezone or the
// time-of-day `new Date()` happened to return).
function serialFor(date) {
  const utcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.round(utcMidnight / 86400000) + 25569;
}
function ymd(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

describe('parseOrgStructure', () => {
  const today = new Date();
  const pastDate = new Date(today); pastDate.setDate(pastDate.getDate() - 14);
  const futureDate = new Date(today); futureDate.setDate(futureDate.getDate() + 14);
  const wb = makeOrgStructureWb({ past: serialFor(pastDate), future: serialFor(futureDate) });
  const rows = parseOrgStructure(wb);

  it('reads Scheduling Setup, not the Locations sheet mirror', () => {
    // 4 real stores (3708, 5183, 6972, 24471); the orphan 46237 row is excluded.
    expect(rows.length).toBe(4);
    expect(rows.every(r => r.loc !== '46237')).toBe(true);
  });

  it('decodes dates via parseXLDate (real Date objects, correct day)', () => {
    const r3708 = rows.find(r => r.loc === '3708');
    expect(r3708.scheduleWeekDate).toBeInstanceOf(Date);
    expect(r3708.scheduleWeekDate.toISOString().slice(0, 10)).toBe(ymd(pastDate));
  });

  it('returns scheduleWeekDate:null for a real store with a blank cell (no-date bucket)', () => {
    const r24471 = rows.find(r => r.loc === '24471');
    expect(r24471).toBeTruthy();
    expect(r24471.scheduleWeekDate).toBeNull();
  });

  it('skips orphan/legend rows that do not resolve to a real store', () => {
    expect(rows.find(r => r.loc === '46237')).toBeUndefined();
  });
});

describe('detectType — org-structure routing', () => {
  it('routes by filename', () => {
    expect(detectType('Organization_Structure.xlsx', null).type).toBe('org-structure');
    expect(detectType('org structure 2026.xlsx', null).type).toBe('org-structure');
    expect(detectType('org_structure_v2.xlsx', null).type).toBe('org-structure');
  });

  it('routes by sheet-name fallback when the filename does not match', () => {
    const wb = makeOrgStructureWb({ past: 46000, future: 46999 });
    const t = detectType('some_other_filename.xlsx', wb);
    expect(t.type).toBe('org-structure');
  });

  it('does not misroute an unrelated workbook', () => {
    const ws = XLSX.utils.aoa_to_sheet([['Loc', 'Date'], [3708, '2026-01-01']]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    expect(detectType('random_file.xlsx', wb).type).not.toBe('org-structure');
  });
});

describe('classifyOrgStructureImport', () => {
  const today = new Date('2026-08-26T12:00:00');
  const orgRows = [
    { loc: '3708', scheduleWeekDate: new Date('2026-08-12T12:00:00') },   // past
    { loc: '5183', scheduleWeekDate: new Date('2026-08-26T12:00:00') },   // today — counts as past
    { loc: '6972', scheduleWeekDate: new Date('2026-09-02T12:00:00') },   // future
    { loc: '24471', scheduleWeekDate: null },                             // no date
    { loc: '13113', scheduleWeekDate: new Date('2026-08-19T12:00:00') },  // past, but already marked
  ];

  it('marks past/today rows, skips future-dated and no-date rows', () => {
    const { toMark, skippedFuture, skippedExisting, noDate } = classifyOrgStructureImport(orgRows, {}, today);
    expect(toMark.map(m => m.loc).sort()).toEqual(['13113', '3708', '5183']);
    expect(skippedFuture).toBe(1);
    expect(noDate).toBe(1);
    expect(skippedExisting).toBe(0);
  });

  it('computes weekKey via weekStartOf, matching the shared helper directly', () => {
    const { toMark } = classifyOrgStructureImport(orgRows, {}, today);
    const r3708 = toMark.find(m => m.loc === '3708');
    expect(r3708.weekKey).toBe(weekStartOf(new Date('2026-08-12T12:00:00')).toISOString().slice(0, 10));
  });

  it('never overwrites an existing mark — skip-if-already-marked default', () => {
    const existing = { '13113': '2026-07-01' }; // a differing manual mark from the Training Retention tab
    const { toMark, skippedExisting } = classifyOrgStructureImport(orgRows, existing, today);
    expect(toMark.some(m => m.loc === '13113')).toBe(false);
    expect(skippedExisting).toBe(1);
    // The other past-dated, unmarked stores are unaffected by an unrelated existing mark.
    expect(toMark.map(m => m.loc).sort()).toEqual(['3708', '5183']);
  });

  it('a future-dated row is never marked even if it happens to already carry a stale mark', () => {
    const existing = { '6972': '2026-01-01' };
    const { toMark, skippedFuture, skippedExisting } = classifyOrgStructureImport(orgRows, existing, today);
    expect(toMark.some(m => m.loc === '6972')).toBe(false);
    expect(skippedFuture).toBe(1); // counted as future, not as skipped-existing
    expect(skippedExisting).toBe(0);
  });
});

// ── Real committed file ─────────────────────────────────────────────────────────────────────
const REAL_FILE = join(process.cwd(), 'data/org-structure/Organization_Structure.xlsx');

describe.skipIf(!existsSync(REAL_FILE))('parseOrgStructure — real committed file', () => {
  const wb = XLSX.read(readFileSync(REAL_FILE), { type: 'buffer' });
  const rows = parseOrgStructure(wb);

  // Ground truth read directly from the sheet's raw serials (independent of parseOrgStructure,
  // so this is a real cross-check, not a tautology) — the 20 OK stores and their "1st Schedule
  // Week" Excel serials, as measured live 2026-08-26 (memory/dispatch-146.md).
  const KNOWN = {
    20475: 46246, 34222: 46246, 10422: 46246, 43380: 46246,
    33704: 46253, 35064: 46253, 18213: 46253,
    5183: 46260, 5985: 46260, 10915: 46260, 33109: 46260,
    32525: 46267, 11657: 46267, 6972: 46267, 31357: 46267, 29760: 46267,
    33222: 46274, 13113: 46274, 3708: 46274, 24471: 46274,
  };
  const serialToDate = s => new Date((s - 25569) * 86400000 + 43200000);

  it('finds all 20 Oklahoma stores with a real, non-orphan Location', () => {
    expect(rows.length).toBe(20);
    expect(new Set(rows.map(r => r.loc)).size).toBe(20);
    for (const loc of Object.keys(KNOWN)) expect(rows.some(r => r.loc === loc)).toBe(true);
  });

  it('decodes every date to match the known raw serial (Scheduling Setup, not Locations)', () => {
    for (const r of rows) {
      const expected = serialToDate(KNOWN[r.loc]);
      expect(r.scheduleWeekDate.toISOString().slice(0, 10)).toBe(expected.toISOString().slice(0, 10));
    }
  });

  it('classifyOrgStructureImport buckets match today vs. the known dates, recomputed live (not hardcoded)', () => {
    const today = new Date();
    const { toMark, skippedFuture, noDate } = classifyOrgStructureImport(rows, {}, today);
    const _today = new Date(today); _today.setHours(23, 59, 59, 999);
    const expectedPast = Object.entries(KNOWN).filter(([, s]) => serialToDate(s) <= _today).length;
    const expectedFuture = Object.entries(KNOWN).filter(([, s]) => serialToDate(s) > _today).length;
    expect(toMark.length).toBe(expectedPast);
    expect(skippedFuture).toBe(expectedFuture);
    expect(noDate).toBe(0); // measured: all 20 OK stores carry a date in the committed file
    expect(toMark.length + skippedFuture).toBe(20);
  });
});
