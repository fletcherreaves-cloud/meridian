// @ts-nocheck
import { describe, it, expect } from 'vitest';
import {
  parseEmployeeRoster, parseEmployeeRosterApi, rosterCounts, shiftCertifiedByLoc, bucketForJob,
  parseRosterStatistics, parseRosterStatisticsApi, headcountFromStats, parseTurnover,
  parseDigitalApp, parseMcDelivery3PO, hmsToSec,
} from '../engine/people-reports.js';

describe('bucketForJob', () => {
  it('maps real QSRSoft codes/descriptions to buckets', () => {
    expect(bucketForJob(650, 'CREW PERSON')).toBe('crew');
    expect(bucketForJob(648, 'CREW TRAINER')).toBe('crew');
    expect(bucketForJob(647, 'CERT. SWING MGR.')).toBe('shiftMgr');
    expect(bucketForJob(845, 'DEPARTMENT MANAGER I')).toBe('shiftMgr');
    expect(bucketForJob(641, 'GENERAL MANAGER')).toBe('gm');
    expect(bucketForJob(671, 'PRIMARY MAIN. PERSON')).toBe('maintenance');
    // unknown code falls back to the description regex
    expect(bucketForJob(99999, 'CERT. SWING MGR.')).toBe('shiftMgr');
    expect(bucketForJob(99999, 'MYSTERY ROLE')).toBe('other');
  });
});

describe('parseEmployeeRoster + counts', () => {
  const header = ['Loc', 'Home Location', 'GEID', 'Start Date', 'End Date', 'Employment Status',
    'Location Type', 'Employee Name', 'Termination Date', 'Termination Reason',
    'Primary Job Title Code', 'Job Code Type', 'Primary Job Title Code Description', 'Job Title Code Start Date'];
  const rows = [header,
    ['3708', '3708', '1', '2020-11-12', '0000-00-00', 'Active', 'Home', 'A Crew', '0000-00-00', '', '650', 'Primary', 'CREW PERSON', '2025-12-09'],
    ['3708', '3708', '2', '2019-12-23', '0000-00-00', 'Active', 'Home', 'B Swing', '0000-00-00', '', '647', 'Primary', 'CERT. SWING MGR.', '2024-01-01'],
    ['3708', '3708', '3', '2021-01-01', '0000-00-00', 'Active', 'Home', 'C GM', '0000-00-00', '', '641', 'Primary', 'GENERAL MANAGER', '2021-01-01'],
    ['3708', '3708', '4', '2022-01-01', '2026-06-01', 'Terminated', 'Home', 'D Gone', '2026-06-01', 'QUIT', '647', 'Primary', 'CERT. SWING MGR.', '2022-01-01'],
  ];
  it('normalizes employees, cleans 0000 dates, tags buckets', () => {
    const recs = parseEmployeeRoster(rows);
    expect(recs).toHaveLength(4);
    expect(recs[0]).toMatchObject({ loc: '3708', primaryCode: 650, bucket: 'crew', endDate: null });
    expect(recs[3]).toMatchObject({ employmentStatus: 'Terminated', terminationDate: '2026-06-01', terminationReason: 'QUIT' });
  });
  it('counts active by bucket and shift-certified managers (terminated excluded)', () => {
    const c = rosterCounts(parseEmployeeRoster(rows));
    expect(c['3708']).toMatchObject({ crew: 1, shiftMgr: 1, gm: 1, total: 3 }); // D excluded (terminated)
    expect(shiftCertifiedByLoc(parseEmployeeRoster(rows))['3708']).toBe(1);
    expect(shiftCertifiedByLoc(parseEmployeeRoster(rows), { includeGM: true })['3708']).toBe(2);
  });
});

describe('parseEmployeeRosterApi (JSON endpoint)', () => {
  // Synthetic rows (NO real PII) mirroring /reporting/v2/people/employee-roster shape.
  // Covers every job-code family seen in the field so the shift-cert bucket is exact.
  const payload = { result: [
    { storeNum: 35064, homeLocation: 35064, geid: 1, fullEmployeeName: 'A Crew', storeStartDate: '2025-01-01', storeEndDate: '0000-00-00', employmentStatus: 'Active', locationType: 'Home', terminationEntryDate: '0000-00-00', terminationReason: 'ACTIVE', jobTitleCode: '650', jobCodeType: 'Primary', jobTitleCodeDescription: 'CREW PERSON', jobTitleCodeStartDate: '2025-01-01' },
    { storeNum: 35064, homeLocation: 35064, geid: 2, fullEmployeeName: 'B Swing', storeStartDate: '2024-01-01', storeEndDate: '0000-00-00', employmentStatus: 'Active', locationType: 'Home', terminationEntryDate: '0000-00-00', terminationReason: 'ACTIVE', jobTitleCode: '647', jobCodeType: 'Primary', jobTitleCodeDescription: 'CERT. SWING MGR.', jobTitleCodeStartDate: '2025-01-01' },
    { storeNum: 35064, homeLocation: 35064, geid: 3, fullEmployeeName: 'C Dept', storeStartDate: '2024-01-01', storeEndDate: '0000-00-00', employmentStatus: 'Active', locationType: 'Home', terminationEntryDate: '0000-00-00', terminationReason: 'ACTIVE', jobTitleCode: '10002', jobCodeType: 'Primary', jobTitleCodeDescription: 'DEPT MGR II W/ CREW PUNCHES', jobTitleCodeStartDate: '2025-01-01' },
    { storeNum: 35064, homeLocation: 35064, geid: 4, fullEmployeeName: 'D GM', storeStartDate: '2023-01-01', storeEndDate: '0000-00-00', employmentStatus: 'Active', locationType: 'Home', terminationEntryDate: '0000-00-00', terminationReason: 'ACTIVE', jobTitleCode: '641', jobCodeType: 'Primary', jobTitleCodeDescription: 'GENERAL MANAGER', jobTitleCodeStartDate: '2023-01-01' },
    { storeNum: 35064, homeLocation: 35064, geid: 5, fullEmployeeName: 'E Maint', storeStartDate: '2023-01-01', storeEndDate: '0000-00-00', employmentStatus: 'Active', locationType: 'Home', terminationEntryDate: '0000-00-00', terminationReason: 'ACTIVE', jobTitleCode: '671', jobCodeType: 'Primary', jobTitleCodeDescription: 'PRIMARY MAIN. PERSON', jobTitleCodeStartDate: '2023-01-01' },
  ] };
  it('normalizes JSON to the parseEmployeeRoster record shape', () => {
    const recs = parseEmployeeRosterApi(payload);
    expect(recs).toHaveLength(5);
    expect(recs[0]).toMatchObject({ loc: '35064', primaryCode: 650, bucket: 'crew', endDate: null, terminationDate: null });
    expect(recs[1].bucket).toBe('shiftMgr');   // 647 Cert Swing
    expect(recs[2].bucket).toBe('shiftMgr');   // 10002 Dept Mgr II
    expect(recs[3].bucket).toBe('gm');         // 641 GM
    expect(recs[4].bucket).toBe('maintenance');// 671
  });
  it('rosterCounts yields shift-cert = Cert Swing + Dept Mgrs (GM excluded)', () => {
    const c = rosterCounts(parseEmployeeRosterApi(payload));
    expect(c['35064']).toMatchObject({ crew: 1, shiftMgr: 2, gm: 1, maintenance: 1, total: 5 });
    expect(shiftCertifiedByLoc(parseEmployeeRosterApi(payload))['35064']).toBe(2);
  });
});

describe('parseRosterStatistics + headcount', () => {
  const rows = [
    ['Loc', 'Crew (Staff size)', 'Shift (Staff size)', 'GM & DM (Staff size)', 'Crew Active', 'Shift Active', 'Roster Size', 'Roster Active'],
    ['3708', 63, 7, 2, 55, 7, 72, 64],
  ];
  it('maps the composition columns', () => {
    const s = parseRosterStatistics(rows)['3708'];
    expect(s).toMatchObject({ crewActive: 55, shiftActive: 7, gmdmStaff: 2, rosterActive: 64 });
  });
  it('headcount = roster active for all buckets; crew-only when narrowed', () => {
    const s = parseRosterStatistics(rows)['3708'];
    expect(headcountFromStats(s)).toBe(64);                              // all → exact roster active
    expect(headcountFromStats(s, { include: ['crew'] })).toBe(55);       // crew only
    expect(headcountFromStats(s, { include: ['crew', 'shift'] })).toBe(62);
  });
});

describe('parseRosterStatisticsApi (JSON endpoint)', () => {
  // Real /reporting/v2/people/roster-statistics response for store 3708 — same
  // numbers as the validated xlsx export, so the API path must yield the same record.
  const payload = { result: {
    resp: [{
      nsn: 3708, crewSize: 63, swingSize: 7, managerSize: 2, crewActive: 55, swingActive: 7,
      under18: 10, under17: 5, under16: 0, totalStaff: 72, totalActiveStaff: 64,
      crewInactive: 8, swingInactive: 0, totalStaffInactive: 8, totalRosterActivePct: 0.8889,
    }],
    totals: { nsn: 'Grand Total', crewSize: 63, totalStaff: 72 },
  } };
  it('normalizes to the parseRosterStatistics shape and drops Grand Total', () => {
    const byLoc = parseRosterStatisticsApi(payload);
    expect(Object.keys(byLoc)).toEqual(['3708']);            // Grand Total skipped
    expect(byLoc['3708']).toEqual({
      crewStaff: 63, shiftStaff: 7, gmdmStaff: 2, crewActive: 55, shiftActive: 7,
      rosterSize: 72, rosterActive: 64, under18: 10,
    });
  });
  it('matches the xlsx parser + feeds headcountFromStats identically', () => {
    const fromApi = parseRosterStatisticsApi(payload)['3708'];
    const fromXlsx = parseRosterStatistics([
      ['Loc', 'Crew (Staff size)', 'Shift (Staff size)', 'GM & DM (Staff size)', 'Crew Active', 'Shift Active', 'Roster Size', 'Roster Active', 'Under 18 (Staff size)'],
      ['3708', 63, 7, 2, 55, 7, 72, 64, 10],
    ])['3708'];
    expect(fromApi).toEqual(fromXlsx);
    expect(headcountFromStats(fromApi)).toBe(64);
  });
  it('accepts a bare resp array too', () => {
    expect(parseRosterStatisticsApi(payload.result.resp)['3708'].rosterActive).toBe(64);
  });
});

describe('parseTurnover', () => {
  const rows = [
    ['Loc', 'Month', 'Hires', 'Roster Size', 'Terms', 'Terms < 90', 'Retained > 90', 'Retained > 90 Pct', 'Monthly Annual Turnover', 'TTM Turnover', '3-Month Turnover'],
    ['3708', '2026-06', 16, 61, 16, 6, 10, 0.625, 3.1475, 2.7049, 0.6429],
  ];
  it('captures every column and derives a 0-90 proxy (1 − retained>90%)', () => {
    const t = parseTurnover(rows)['3708'];
    expect(t).toMatchObject({ hires: 16, termsUnder90: 6, retainedOver90Pct: 0.625, ttmTurnover: 2.7049 });
    expect(t.turnover090Pct).toBeCloseTo(0.375, 6);
  });
});

describe('parseDigitalApp', () => {
  const rows = [
    ['Loc', 'Digital App Sales', 'Digital App GCs', 'Digital App Average', 'Digital App % of T', 'Digital App GC/R/D'],
    ['3708', 2985.18, 283, 10.55, 0.2777, 283],
  ];
  it('pulls sales + GCs (GC/Rest/Day derived downstream from daily sums)', () => {
    const d = parseDigitalApp(rows)['3708'];
    expect(d).toMatchObject({ sales: 2985.18, gcs: 283 });
  });
});

describe('parseMcDelivery3PO + hmsToSec', () => {
  it('converts H:MM:SS to seconds', () => {
    expect(hmsToSec('0:12:16')).toBe(736);
    expect(hmsToSec('0:04:02')).toBe(242);
    expect(hmsToSec(90)).toBe(90);
    expect(hmsToSec('')).toBeNull();
  });
  it('pulls 3PO GC + delivery-experience fields', () => {
    const rows = [
      ['Loc', 'Vendor', 'POS McDelivery GC', 'POS 3PO Delivery Sales', 'McDelivery Time', 'Restaurant Time', 'Orders with Missing Items', 'CSAT', '3PO GC', 'Total Experience Time'],
      ['3708', 'Combined Vendors', 69, 1182.92, '0:12:16', '0:04:02', 0.0633, 4.5, 79, '0:16:17'],
    ];
    const m = parseMcDelivery3PO(rows)['3708'];
    expect(m).toMatchObject({ threePoGC: 79, csat: 4.5, posMcDeliveryGC: 69 });
    expect(m.restaurantTimeSec).toBe(242);
    expect(m.totalExperienceTimeSec).toBe(977);
    expect(m.ordersMissingItemsPct).toBeCloseTo(0.0633, 6);
  });
});

import { parseTurnoverApi } from '../engine/people-reports.js';
describe('parseTurnoverApi (JSON endpoint, per-loc × month)', () => {
  // Real field keys from /reporting/v2/people/turnover-report result.resp[]; nsn set to a
  // numeric store (nsd=d) plus the aggregate rows that must be skipped.
  const payload = { result: {
    resp: [
      { nsn: '3708', month: '2026-06', totalHire: 16, totalStaff: 61, terminations: 16, term90: 6,
        retained90Days: 10, term90Pct: 0.375, retained90Pct: 0.625, monthlyAnnualTurnOver: 3.1475,
        ttmTurnover: 2.7049, threeMonthTurnover: 0.6429 },
      { nsn: 'All Selected', month: '2026-06', totalHire: 211, retained90Pct: 0.6682 },     // skip (nsd=s row)
    ],
    totals: { nsn: 'Grand Total', month: '13', totalHire: 2551, retained90Pct: 0.4943 },     // skip
  } };
  it('maps store-month rows, derives 0-90 = 1 − retained90Pct, drops aggregates', () => {
    const rows = parseTurnoverApi(payload);
    expect(rows).toHaveLength(1);                         // "All Selected" + "Grand Total" dropped
    expect(rows[0]).toMatchObject({
      loc: '3708', month: '2026-06', hires: 16, rosterSize: 61, terms: 16,
      termsUnder90: 6, retainedOver90: 10, retainedOver90Pct: 0.625,
      monthlyAnnualTurnover: 3.1475, ttmTurnover: 2.7049, threeMonthTurnover: 0.6429,
    });
    expect(rows[0].turnover090Pct).toBeCloseTo(0.375, 6); // == the report's term90Pct
  });
});

import { parseMcDelivery3POApi } from '../engine/people-reports.js';
import { parseDigitalAppApi } from '../engine/people-reports.js';
describe('parseDigitalAppApi (JSON endpoint, composed rollup)', () => {
  // Real 3708 qtr-hr-sales components for 2026-07-27. Digital App = MOA + Scanned
  // Offers (3) + Loyalty Self-ID Earn + Internal Delivery — reconciled to the xlsx
  // export (Sales 2985.18, GCs 283, GC/R/D 283).
  const payload = { result: [{
    storeNum: 3708, numberOfStores: 1, numberOfDays: 1, qualifiedDay: 1, allNetSales: 10254.4,
    mobileOrderAheadAllNetSales: 1690.3, scannedOfferOnlyRewardsAllNetSales: 61.09,
    scannedOfferNoRewardsAllNetSales: 880.17, scannedOfferRewardsAndOfferAllNetSales: 0,
    loyaltySelfIDEarnAllNetSales: 228.11, intDeliveryAllNetSales: 125.51,
    mobileOrderAheadTransactions: 180, scannedOfferOnlyRewardsTransactions: 13,
    scannedOfferNoRewardsTransactions: 61, scannedOfferRewardsAndOfferTransactions: 0,
    loyaltySelfIDEarnTransactions: 23, intDeliveryTransactions: 6,
  }] };
  it('composes Digital App Sales/GCs and GC/R/D matching the QSRSoft rollup', () => {
    const d = parseDigitalAppApi(payload)['3708'];
    expect(d.sales).toBeCloseTo(2985.18, 2);
    expect(d.gcs).toBe(283);
    expect(d.avgCheck).toBeCloseTo(10.55, 2);
    expect(d.pctOfSales).toBeCloseTo(0.2911, 4);
    expect(d.gcPerRestDay).toBe(283);         // qualifiedDay = 1
  });
});

describe('parseMcDelivery3POApi (JSON endpoint)', () => {
  // Real /reports/mcd/sales/mcDeliveryReport resp[] — same store/values as the validated
  // xlsx sample, so the API path must reproduce parseMcDelivery3PO's numbers.
  const payload = { resp: [
    { nsn: 3708, vendor: 'Combined Vendors', deliveryTransactions: 69, deliveryAllNetSales: 1182.92,
      avgDeliveryTime: 12.26, avgRestaurantTime: 4.03, avgTotalTime: 16.291139240506325,
      ordersMissingItemsPct: 0.0633, '3POTrans': 79, avgCSat: 4.5, entireOrderIncorrect: 0,
      csat: 4.5, qualifiedReviews: 1 },
  ], totals: { vendor: 'All Selected', deliveryTransactions: 175, '3POTrans': 187, avgCSat: 4.67 } };
  it('maps 3PO GC + delivery-experience fields; minutes→seconds; drops totals', () => {
    const m = parseMcDelivery3POApi(payload);
    expect(Object.keys(m)).toEqual(['3708']);                 // "All Selected" totals dropped
    expect(m['3708']).toMatchObject({
      vendor: 'Combined Vendors', posMcDeliveryGC: 69, pos3poSales: 1182.92,
      threePoGC: 79, csat: 4.5, incorrectOrders: 0, qualifiedReviews: 1,
    });
    expect(m['3708'].mcDeliveryTimeSec).toBe(736);            // 12.26 min → "0:12:16"
    expect(m['3708'].restaurantTimeSec).toBe(242);            // 4.03 min → "0:04:02"
    expect(m['3708'].totalExperienceTimeSec).toBe(977);       // 16.29 min → "0:16:17"
    expect(m['3708'].ordersMissingItemsPct).toBeCloseTo(0.0633, 6);
  });
});

import { parseTurnoverWide } from '../engine/people-reports.js';
describe('parseTurnoverWide (annual org rollup)', () => {
  it('pivots category rows × month columns', () => {
    const rows = [
      [null, '2025-06', '2025-07', 'Total'],
      ['Category', 'Value', 'Value', 'Value'],
      ['Hires', 202, 215, 2551],
      ['Terms < 90', 97, 103, 1290],
    ];
    const w = parseTurnoverWide(rows);
    expect(w.months).toEqual(['2025-06', '2025-07', 'Total']);
    expect(w.byCategory['Hires']['2025-06']).toBe(202);
    expect(w.byCategory['Terms < 90']['Total']).toBe(1290);
  });
});
