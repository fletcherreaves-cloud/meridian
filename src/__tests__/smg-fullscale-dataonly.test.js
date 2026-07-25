// @ts-nocheck
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSMGFullScale } from '../parsers/index.js';

// Mirrors the real SMG "Data Only" export layout (one row per store, fixed cols),
// including the "**" suppressed-cell case (Cottondale DT) and the "Combined"
// district-total row that must be excluded.
function makeWb() {
  const aoa = [
    ['Full Scale Report: 1/1/2026 - 1/31/2026'],
    [],
    ['Restaurant','Overall Satisfaction',null,null,null,null,null,'Overall Satisfaction B2B',null,null,'Accuracy B2B',null,null,'DT Experiences a Problem (Yes)',null,null,'Experienced a Problem (Yes)',null,null],
    ['Combined',1873,0.7667,0.1463,0.0304,0.0288,0.0278,1873,0.0566,0.9434,1873,0.0411,0.9589,910,0.0769,0.9231,1872,0.0726,0.9274],
    ['03708 - ARDMORE-BROADWAY',95,0.7368,0.1368,0.0421,0.0526,0.0316,95,0.0842,0.9158,95,0.0737,0.9263,37,0.1351,0.8649,95,0.1158,0.8842],
    ['35242 - COTTONDALE',54,0.6111,0.2778,0,0.0741,0.0370,54,0.1111,0.8889,54,0.0556,0.9444,'**','**','**',54,0.0741,0.9259],
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data Only');
  return wb;
}

describe('parseSMGFullScale — Data Only layout', () => {
  const rows = parseSMGFullScale(makeWb());

  it('parses one row per store and excludes the Combined total', () => {
    expect(rows.length).toBe(2);
    expect(rows.some(r => /combined/i.test(r.storeName))).toBe(false);
  });

  it('reads the period from the title', () => {
    expect(rows[0].year).toBe(2026);
    expect(rows[0].month).toBe(1);
  });

  it('maps columns to the right metrics', () => {
    const a = rows.find(r => r.loc === '3708');
    expect(a).toBeTruthy();
    expect(a.osat5).toBeCloseTo(0.7368, 4);
    expect(a.osatTop2).toBeCloseTo(0.8736, 4);   // 5★ + 4★
    expect(a.osatB2B).toBeCloseTo(0.9158, 4);     // no-problem %
    expect(a.accuracyB2B).toBeCloseTo(0.9263, 4);
    expect(a.dtProblem).toBeCloseTo(0.1351, 4);   // problem %
    expect(a.overallProblem).toBeCloseTo(0.1158, 4);
  });

  it('treats suppressed "**" cells as null, keeps the rest', () => {
    const c = rows.find(r => r.loc === '35242');
    expect(c.dtProblem).toBeNull();               // "**" → null
    expect(c.osatB2B).toBeCloseTo(0.8889, 4);
    expect(c.overallProblem).toBeCloseTo(0.0741, 4);
  });
});
