// @ts-nocheck
// #236 — parseSalesLedger stamped labor_pct/tpph/otHrs/otDollar/spph as literal 0 ("Sales Ledger
// has no labor data"). Those rows merge into ds.laborRows (pipeline.js) so their `sales` figure
// can supplement Labor Analysis history when that report lags, and App.js's manual-upload path
// used to push the merged rows straight to the labor_rows Supabase table. saveLaborRows's mapping
// is `labor_pct: r.laborPct ?? null` — 0 ?? null is 0, not null — so the stub got upserted
// (onConflict: loc,report_date) and silently overwrote or filled in real Labor Analysis
// percentages with a false zero. Measured: 994 (store,day) rows across all 27 stores,
// 2025-01-22..2026-07-23, every one also tpph=0/ot_hrs=0 (the pure-stub signature, no partial-data
// edge case swept in). A store cannot run 0% punched labor on a day with real sales, so this was
// never a legitimate value living convincingly next to real Labor Analysis rows in the same table.
//
// Fix: the labor fields are null now, not 0, and are tagged _salesLedgerSupplement so App.js can
// exclude them from ever reaching the labor_rows table at all (supplementLaborWithSched's
// DAR-based sales supplement already covers that need without persisting anything, so nothing is
// lost by keeping Sales-Ledger-only rows in-memory only). Full incident + measured counts in
// memory/project-labor-pct-tail-236.md.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import { parseSalesLedger } from '../parsers/index.js';

const PARSER_SRC = readFileSync('src/parsers/index.js', 'utf8');

function wbFromAOA(aoa) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sales Ledger');
  return wb;
}

describe('parseSalesLedger — labor fields are null, never a false 0 (#236)', () => {
  const aoa = [
    ['Loc', 'Date', 'All Net Sales', 'STW GC', 'Average Check'],
    ['3708', '2026-06-30', 15902.15, 923, 17.23],
    ['5183', '2026-06-30', 9849.69, 512, 19.24],
  ];
  const rows = parseSalesLedger(wbFromAOA(aoa), 'sales_ledger_daily_2026-06-30.csv');

  it('parses real sales rows for both stores', () => {
    expect(rows.length).toBe(2);
    expect(rows[0].loc).toBe('3708');
    expect(rows[0].sales).toBeCloseTo(15902.15);
    expect(rows[1].sales).toBeCloseTo(9849.69);
  });

  it('every labor field is null, not 0 — the exact bug that let a real percentage get overwritten', () => {
    for (const r of rows) {
      expect(r.laborPct).toBeNull();
      expect(r.actHrs).toBeNull();
      expect(r.otHrs).toBeNull();
      expect(r.tpph).toBeNull();
      expect(r.spph).toBeNull();
    }
  });

  it('is tagged _salesLedgerSupplement so it can be excluded from the labor_rows save path', () => {
    for (const r of rows) expect(r._salesLedgerSupplement).toBe(true);
  });

  it('regression guard: the parser source never reverts to a numeric-0 labor stub', () => {
    const fn = PARSER_SRC.slice(PARSER_SRC.indexOf('function parseSalesLedger'), PARSER_SRC.indexOf('function parseDailyGlimpse'));
    expect(fn).not.toMatch(/laborPct\s*:\s*0\b/);
    expect(fn).toMatch(/laborPct\s*:\s*null\b/);
  });
});
