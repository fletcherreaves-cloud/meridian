// @ts-nocheck
// Dispatch #172 — glimpseRows.cashOS vs qsr_cash_sheet.cash_over_or_short reconciled at
// only 1/135 (0.7%) sampled store-days in dispatch #165's audit, and cashRows.cashRefAmt
// at 44/135. Live measurement (SUPABASE_SERVICE_ROLE_KEY, 2026-08-27) found both were
// mechanical header-name bugs, not a real data discrepancy: parseDailyGlimpse's cashOS/
// cashOSPct candidates never matched the real Daily Glimpse column ("Over/Short $"/"Over/
// Short %", confirmed from a real ingested daily_glimpse_daily_*.csv), and parseCashSheet's
// cash/cashless-refund + POS-over-count candidates used singular "Refund"/"Count" while the
// real Cash Sheet Extract report uses plural "Refunds"/"Qty" (confirmed from a real ingested
// cash_sheet_extract_daily_*.csv) — so both fields silently defaulted to 0 on every row ever
// parsed (measured: 0 of 1,431 live daily_glimpse_daily rows had a nonzero cash_os; 0 of 135
// sampled cash_sheet_daily rows had a nonzero cash_ref_amt). Full writeup:
// memory/finding-cash-handling-discrepancy-2026-08-27.md
//
// These fixtures reproduce the REAL header text observed live, so a future header-name
// regression here is caught by a parse producing 0 (or an unmatched -1 column index) again,
// not by trusting the candidate list is right.
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseDailyGlimpse, parseCashSheet, ensureParsersXLSXReady } from '../parsers/index.js';

await ensureParsersXLSXReady();

function wbFromAOA(aoa, sheetName) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  return wb;
}

describe('parseDailyGlimpse — Over/Short header (dispatch #172)', () => {
  // Trimmed real header row from a live daily_glimpse_daily_2026-08-19.csv (2-row header;
  // row 0 = section labels, row 1 = column names — autoHdrRow finds row 1 via 'Loc').
  const HEADER = [
    'Loc', 'All Net Sales', 'STW GC', 'DT Sales', 'DT GC', 'Punch Labor %',
    'Promo Amt', 'Promo Pct', 'Over/Short $', 'Over/Short %',
    'POS Overrings Cnt', 'POS Overrings Amt', 'Cash Refund Cnt', 'Cash Refund Amt',
  ];
  const ROW = [3708, '$10,394.52', 1040, '$7,463.14', 799, '23.01%', '$434.01', '4.18%',
    '-$2,889.99', '-27.80%', 10, '$65.98', 2, '$5.44'];
  const aoa = [['section'], HEADER, ROW];
  const rows = parseDailyGlimpse(wbFromAOA(aoa, 'Glimpse'), new Date('2026-08-19T12:00:00Z'));

  it('parses one store row', () => { expect(rows.length).toBe(1); });

  it('cashOS reads the real "Over/Short $" column, not 0', () => {
    expect(rows[0].cashOS).toBeCloseTo(-2889.99, 2);
  });

  it('cashOSPct reads the real "Over/Short %" column, not 0', () => {
    expect(rows[0].cashOSPct).toBeCloseTo(-0.278, 3);
  });

  it('sibling fields (promoAmt, posOverAmt) that already matched keep working', () => {
    expect(rows[0].promoAmt).toBeCloseTo(434.01, 2);
    expect(rows[0].posOverAmt).toBeCloseTo(65.98, 2);
  });
});

describe('parseCashSheet — plural Refunds/Qty headers (dispatch #172)', () => {
  // Trimmed real header row from a live cash_sheet_extract_daily_2026-08-19.csv.
  const HEADER = [
    'Loc', 'Net Sales', 'Average Check', 'STW GC',
    'Cash Over/Short', 'POS Overring Amt', 'POS Overring Qty',
    'Cash Refunds Qty', 'Cash Refunds Amt', 'Cashless Refunds Qty', 'Cashless Refunds Amt',
  ];
  const ROW = ['3708', '$9,852.18', '$9.47', 1040,
    '-$15.98', '$44.10', 7,
    2, '$22.57', 1, '$14.18'];
  const aoa = [HEADER, ROW];
  const rows = parseCashSheet(wbFromAOA(aoa, 'Cash Sheet'), 'cash_sheet_extract_daily_2026-08-19.csv');

  it('parses one store row', () => { expect(rows.length).toBe(1); });

  it('cashOS reads "Cash Over/Short" (this header always matched — not the bug)', () => {
    expect(rows[0].cashOS).toBeCloseTo(-15.98, 2);
  });

  it('cashRefAmt reads the real plural "Cash Refunds Amt", not 0', () => {
    expect(rows[0].cashRefAmt).toBeCloseTo(22.57, 2);
  });

  it('cashRefCnt reads the real "Cash Refunds Qty", not 0', () => {
    expect(rows[0].cashRefCnt).toBe(2);
  });

  it('cashlessRefAmt reads the real plural "Cashless Refunds Amt", not 0', () => {
    expect(rows[0].cashlessRefAmt).toBeCloseTo(14.18, 2);
  });

  it('cashlessRefCnt reads the real "Cashless Refunds Qty", not 0', () => {
    expect(rows[0].cashlessRefCnt).toBe(1);
  });

  it('posOverCnt reads the real "POS Overring Qty", not 0', () => {
    expect(rows[0].posOverCnt).toBe(7);
  });

  it('posOverAmt (already-matching header) keeps working', () => {
    expect(rows[0].posOverAmt).toBeCloseTo(44.10, 2);
  });
});
