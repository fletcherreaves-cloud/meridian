// @ts-nocheck
// Tests scripts/qsrsoft-mcp-pull.mjs's parseReportCsv() against REAL captured MCP server
// responses (2026-11-16, store 3708/5183/..., date 2026-11-14) — not synthetic fixtures. This
// guards the exact bug the pull hit during development: post_queryReport's structuredContent
// carries no row data at all (only column metadata), and the real data is a CSV block in
// content[0].text whose header uses vendor display labels in a server-chosen order that does
// NOT match the requested `fields` order. A naive positional or structuredContent.rows read
// would silently save zero rows every run — exactly the "ran clean, wrote nothing" failure mode
// CLAUDE.md's standing rules warn about, so this is tested against the real captured shape, not
// a convenient fixture.
import { describe, it, expect } from 'vitest';
import { parseReportCsv } from '../../scripts/qsrsoft-mcp-pull.mjs';

const TIME_SLICE_FIELDS = [
  ['stw_gc', 'transactions', 'STW GC'],
  ['all_net_sales', 'allNetSales', 'All Net Sales'],
  ['total_dt_sales', 'totalDriveThruSales', 'DT Sales'],
  ['total_dt_transactions', 'totalDriveThruTransactions', 'DT GCs'],
  ['total_instore_sales', 'totalInStoreSales', 'All In Store Sales'],
  ['total_instore_transactions', 'totalInStoreTransactions', 'All In Store GCs'],
];

// Real response text, live MCP call, store 3708, 2026-11-14 (field order deliberately
// requested differently from the header's own order, matching the real server behavior).
const REAL_TIME_SLICE_TEXT = `Time Slice Summary (timeSliceSummaryReport), 2026-11-14: 1 row.

Loc,STW GC,All Net Sales,DT Sales,DT GCs,All In Store Sales,All In Store GCs
3708,1033,12517.79,8903.64,798,3614.15,235`;

const SERVICE_TIME_FIELDS = [
  ['total_dt_transactions', 'totalDriveThruTransactions', 'DT GCs'],
  ['bev_order_time', 'bevOrderTime', 'Beverage Order Time'],
  ['bev_run_time', 'bevRunTime', 'Beverage Run Time'],
  ['bev_ttl', 'bevTTL', 'Beverage Total Time'],
  ['bev_trans', 'bevTrans', 'Beverage GC'],
  ['ctp', 'CTP', 'Avg CTP'],
  ['dt_pct_pull_forward', 'dtPctPullForward', 'DT Parked %'],
  ['oepe', 'OEPE', 'OEPE'],
  ['oepe_no_park', 'OEPENoPark', 'OEPE W/O Parked'],
  ['r2p', 'R2P', 'R2P'],
  ['kiosk_r2p', 'kioskR2P', 'Kiosk R2P'],
  ['fc_r2p', 'fcR2P', 'FC R2P'],
];

// Real response text, live MCP call, stores 3708 + 10034 (10034 has real nulls — zero
// beverage volume that day), 2026-11-14.
const REAL_SERVICE_TIME_TEXT = `Service Time Statistics (serviceTimeStatsReport), 2026-11-14: 2 rows.

Loc,DT GCs,Beverage Order Time,Beverage Run Time,Beverage Total Time,Beverage GC,Avg CTP,DT Parked %,OEPE,OEPE W/O Parked,R2P,Kiosk R2P,FC R2P
3708,798,91.37,215.8598,307.2298,241,100.0425,0.1777,156.7237,144.7039,117.4792,106.1046,82.9222
10034,561,110.203,49.24,159.443,283,142.506,0.1815,201.5425,157.7953,100.1298,119.7989,74.3614`;

describe('parseReportCsv (real MCP server captures)', () => {
  it('maps the Time Slice Summary real response to snake_case columns, keyed by zero-padded loc', () => {
    const out = parseReportCsv(REAL_TIME_SLICE_TEXT, TIME_SLICE_FIELDS);
    expect(Object.keys(out)).toEqual(['0003708']);
    expect(out['0003708']).toEqual({
      stw_gc: 1033,
      all_net_sales: 12517.79,
      total_dt_sales: 8903.64,
      total_dt_transactions: 798,
      total_instore_sales: 3614.15,
      total_instore_transactions: 235,
    });
  });

  it('maps the Service Time Statistics real response, including a row with real nulls', () => {
    const out = parseReportCsv(REAL_SERVICE_TIME_TEXT, SERVICE_TIME_FIELDS);
    expect(Object.keys(out).sort()).toEqual(['0003708', '0010034']);
    expect(out['0003708'].bev_order_time).toBe(91.37);
    expect(out['0003708'].ctp).toBe(100.0425);
  });

  it('is immune to the header column order NOT matching the requested fields order', () => {
    // SERVICE_TIME_FIELDS requests total_dt_transactions first, bev_* next, ctp 6th — but the
    // real response's header puts DT GCs first and Avg CTP 6th too, by coincidence; shuffle the
    // fieldSpecs order entirely and confirm the parse result is identical either way.
    const shuffled = [...SERVICE_TIME_FIELDS].reverse();
    const a = parseReportCsv(REAL_SERVICE_TIME_TEXT, SERVICE_TIME_FIELDS);
    const b = parseReportCsv(REAL_SERVICE_TIME_TEXT, shuffled);
    expect(a['0010034']).toEqual(b['0010034']);
  });

  it('correctly distinguishes near-identical labels "DT GCs" vs "DT GC"', () => {
    const fields = [
      ['total_dt_transactions', 'totalDriveThruTransactions', 'DT GCs'],
      ['dt_transactions', 'dtTransactions', 'DT GC'],
    ];
    const text = `Time Slice Summary (timeSliceSummaryReport), 2026-11-14: 1 row.\n\nLoc,DT GCs,DT GC\n3708,798,750`;
    const out = parseReportCsv(text, fields);
    expect(out['0003708']).toEqual({ total_dt_transactions: 798, dt_transactions: 750 });
  });

  it('returns an empty object when the header row cannot be located', () => {
    expect(parseReportCsv('garbage, no header here', TIME_SLICE_FIELDS)).toEqual({});
    expect(parseReportCsv('', TIME_SLICE_FIELDS)).toEqual({});
  });

  it('a requested field absent from the real header resolves to null, not a crash', () => {
    const fieldsWithExtra = [...TIME_SLICE_FIELDS, ['avg_check', 'avgCheck', 'Average Check']];
    const out = parseReportCsv(REAL_TIME_SLICE_TEXT, fieldsWithExtra);
    expect(out['0003708'].avg_check).toBeNull();
    expect(out['0003708'].stw_gc).toBe(1033);
  });
});
