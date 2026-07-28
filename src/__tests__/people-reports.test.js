// @ts-nocheck
import { describe, it, expect } from 'vitest';
import {
  parseEmployeeRoster, rosterCounts, shiftCertifiedByLoc, bucketForJob,
  parseRosterStatistics, headcountFromStats, parseTurnover,
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
