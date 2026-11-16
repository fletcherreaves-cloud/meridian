// @ts-nocheck
// QSRSoft emails a "Labor Exceptions" report daily (owner-forwarded real sample,
// labor_exceptions_daily_2026-11-15.csv, 2026-11-16 — see memory/finding-qsrsoft-security-
// notice-2026-11-16.md). parseLaborExceptions previously assumed a per-LOCATION summary shape
// with count-per-type columns ("Total Exceptions", "Missed Break", ...) and was never actually
// exercised against a real file — those column names turn out to be the vocabulary of the
// real `Exception` field's VALUES on a PER-EMPLOYEE detail row, not separate summary columns.
// This test is built from the real file's exact header and two real data rows, not a
// convenient fixture, so it can't pass by accidentally matching an invented shape.
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseLaborExceptions, parseLaborExceptionsDetail, ensureParsersXLSXReady } from '../parsers/index.js';

await ensureParsersXLSXReady();

// Verbatim from the owner-forwarded labor_exceptions_daily_2026-11-15.csv.
const REAL_CSV = `"Loc","GEID","Employee","First Name","Last Name","Age","Act Start","Act End","Sch Start","Sch End","Act Shift Length","Exception","Exception Time","Is Manager Authorized","Punches 1","Punches 2","Punches 3","Punches 4","Punches 5","Punches 6"
24471,20530902,"Samuel Rodriguez","Samuel","rodriguez","","05:58","12:36:00","06:00:00","14:00:00","06:38:00","Overtime - Time Clock","2026-11-15 05:58:00","Y","shift 05:58 - 12:36",,,,,
24471,26100737,"Sanja Knezevic","Sanja","knezevic","","04:00","11:27:00","04:00:00","12:00:00","06:27:00","Overtime - Time Clock","2026-11-15 04:00:00","","shift 04:00 - 11:27","meal 08:17 - 09:17",,,,`;

function wbFromCsv(csv) {
  return XLSX.read(csv, { type: 'string' });
}

describe('parseLaborExceptions — real per-employee shape, aggregated to (loc,date) counts', () => {
  it('aggregates both real rows into one (loc,date) summary row with the right counts', () => {
    const wb = wbFromCsv(REAL_CSV);
    const rows = parseLaborExceptions(wb, 'labor_exceptions_daily_2026-11-15.csv');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      loc: '24471',
      totalExceptions: 2,
      otExceptions: 2,
      missedBreaks: 0, earlyOut: 0, lateIn: 0, minorExceptions: 0,
    });
  });

  it('the summary date is the noon-anchored calendar day, never the raw exception timestamp', () => {
    const wb = wbFromCsv(REAL_CSV);
    const rows = parseLaborExceptions(wb, 'labor_exceptions_daily_2026-11-15.csv');
    expect(rows[0].date.toISOString()).toBe('2026-11-15T12:00:00.000Z');
  });

  it('classifies exception types by keyword, case-insensitively, independent of the "- Time Clock" suffix', () => {
    const csv = `"Loc","GEID","Employee","Exception","Exception Time","Is Manager Authorized"
3708,1,"A","Missed Break - Time Clock","2026-11-15 10:00:00","Y"
3708,2,"B","Early Out","2026-11-15 11:00:00","Y"
3708,3,"C","Late In - Manual","2026-11-15 12:00:00","N"
3708,4,"D","Minor Hours Violation","2026-11-15 13:00:00",""`;
    const wb = wbFromCsv(csv);
    const rows = parseLaborExceptions(wb, 'labor_exceptions_daily_2026-11-15.csv');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      totalExceptions: 4, missedBreaks: 1, earlyOut: 1, lateIn: 1, minorExceptions: 1, otExceptions: 0,
    });
  });

  it('separates two different stores and two different dates into separate aggregate rows', () => {
    const csv = `"Loc","GEID","Employee","Exception","Exception Time","Is Manager Authorized"
3708,1,"A","Overtime - Time Clock","2026-11-14 10:00:00","Y"
3708,2,"B","Overtime - Time Clock","2026-11-15 10:00:00","Y"
5183,3,"C","Overtime - Time Clock","2026-11-15 10:00:00","Y"`;
    const wb = wbFromCsv(csv);
    const rows = parseLaborExceptions(wb, 'f.csv').sort((a, b) => a.loc.localeCompare(b.loc) || a.date - b.date);
    expect(rows).toHaveLength(3);
    expect(rows.map(r => [r.loc, r.date.toISOString().slice(0, 10), r.totalExceptions])).toEqual([
      ['3708', '2026-11-14', 1],
      ['3708', '2026-11-15', 1],
      ['5183', '2026-11-15', 1],
    ]);
  });

  it('returns an empty array when the sheet is not this real shape (no Exception column)', () => {
    const csv = `"Loc","Date","Sales"\n3708,2026-11-15,100`;
    expect(parseLaborExceptions(wbFromCsv(csv), 'f.csv')).toEqual([]);
  });
});

describe('parseLaborExceptionsDetail — per-employee records, including the compliance flag', () => {
  it('preserves both real rows with their manager-authorization flag read correctly', () => {
    const wb = wbFromCsv(REAL_CSV);
    const rows = parseLaborExceptionsDetail(wb, 'labor_exceptions_daily_2026-11-15.csv');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      loc: '24471', geid: '20530902', employee: 'Samuel Rodriguez',
      exception: 'Overtime - Time Clock', isManagerAuthorized: true,
    });
    // Second real row's "Is Manager Authorized" cell is blank — null, not false (a blank
    // field is "not recorded," not "authorization was denied").
    expect(rows[1]).toMatchObject({
      loc: '24471', geid: '26100737', employee: 'Sanja Knezevic',
      isManagerAuthorized: null,
    });
  });

  it('date is the calendar day; exceptionTime keeps the exact timestamp separately', () => {
    const wb = wbFromCsv(REAL_CSV);
    const rows = parseLaborExceptionsDetail(wb, 'labor_exceptions_daily_2026-11-15.csv');
    for (const r of rows) {
      expect(r.date.toISOString()).toBe('2026-11-15T12:00:00.000Z');
      expect(r.exceptionTime).toBeInstanceOf(Date);
    }
  });
});
