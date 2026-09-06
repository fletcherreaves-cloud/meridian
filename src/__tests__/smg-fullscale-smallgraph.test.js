// @ts-nocheck
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseSMGFullScale, ensureParsersXLSXReady } from '../parsers/index.js';

await ensureParsersXLSXReady();

// Mirrors the real SMG "Small Graph" export layout measured against two real Export-button
// files (2026-09-05/06): a 5-row rating(1-5) block per store, with FIVE metric groups (OSAT/
// osatB2B/accuracyB2B/dtProblem/overallProblem) all landing at a fixed +22 column stride
// (22/44/66/88/110) regardless of how the sheet's trailing columns happen to be trimmed by
// sheet_to_json. Real files also list operator/regional rollup rows (e.g. "0218 - WICHITA OK
// CITY TULSA FT SMITH") that happen to satisfy the store-number regex but are not real stores.
function row(len, entries) {
  const r = new Array(len).fill(null);
  for (const [idx, v] of Object.entries(entries)) r[Number(idx)] = v;
  return r;
}

function storeBlock(label, { osat5, osat4, osat3, osat2, osat1, osatB2B, accuracyB2B, dtProblem, overallProblem }) {
  return [
    row(111, { 0: label, 1: '5', 22: osat5, 44: overallProblem, 66: 0, 88: dtProblem, 110: overallProblem }),
    row(111, { 1: '4', 22: osat4, 44: osatB2B, 66: accuracyB2B }),
    row(111, { 1: '3', 22: osat3 }),
    row(111, { 1: '2', 22: osat2 }),
    row(111, { 1: '1', 22: osat1 }),
  ];
}

function makeWb() {
  const aoa = [
    ['Full Scale Report: 8/1/2026 - 8/31/2026'],
    [null, '1', null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, 0.04],
    // Phantom operator/regional-code row — matches STORE_PAT but is not a real store.
    ...storeBlock('0218 - WICHITA OK CITY TULSA FT SMITH', {
      osat5: 0.81, osat4: 0.1, osat3: 0.05, osat2: 0.02, osat1: 0.02,
      osatB2B: 0.9, accuracyB2B: 0.9, dtProblem: 0.1, overallProblem: 0.1,
    }),
    ...storeBlock('03708 - ARDMORE-BROADWAY', {
      osat5: 0.7571, osat4: 0.0714, osat3: 0.0286, osat2: 0.0714, osat1: 0.0714,
      osatB2B: 0.8571, accuracyB2B: 0.9286, dtProblem: 0.09375, overallProblem: 0.142857,
    }),
    ...storeBlock('05183 - CHICKASHA-SO 4TH', {
      osat5: 0.6167, osat4: 0.3, osat3: 0.0333, osat2: 0.0167, osat1: 0.0333,
      osatB2B: 0.95, accuracyB2B: 0.9831, dtProblem: 0.0769, overallProblem: 0.1167,
    }),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Small Graph');
  return wb;
}

describe('parseSMGFullScale — legacy Small Graph layout', () => {
  const rows = parseSMGFullScale(makeWb());

  it('excludes operator/regional-code rows that match the store regex but are not real stores', () => {
    expect(rows.length).toBe(2);
    expect(rows.some(r => r.loc === '218')).toBe(false);
  });

  it('parses the real stores', () => {
    expect(rows.map(r => r.loc).sort()).toEqual(['3708', '5183']);
  });

  it('reads the period from the title', () => {
    expect(rows[0].year).toBe(2026);
    expect(rows[0].month).toBe(8);
  });

  // Locks in the fixed-stride column fix (22/44/66/88/110) — the previous
  // `Math.round((rowLength - osatCol) / 5)` heuristic depended on how many trailing columns
  // sheet_to_json happened to keep for the sampled row, and produced wrong offsets that
  // silently nulled every one of these four fields on real production files.
  it('maps osatB2B/accuracyB2B/dtProblem/overallProblem to the correct fixed-stride columns', () => {
    const a = rows.find(r => r.loc === '3708');
    expect(a.osat5).toBeCloseTo(0.7571, 3);
    expect(a.osatB2B).toBeCloseTo(0.8571, 3);
    expect(a.accuracyB2B).toBeCloseTo(0.9286, 3);
    expect(a.dtProblem).toBeCloseTo(0.09375, 3);
    expect(a.overallProblem).toBeCloseTo(0.142857, 3);

    const c = rows.find(r => r.loc === '5183');
    expect(c.osatB2B).toBeCloseTo(0.95, 3);
    expect(c.accuracyB2B).toBeCloseTo(0.9831, 3);
    expect(c.dtProblem).toBeCloseTo(0.0769, 3);
    expect(c.overallProblem).toBeCloseTo(0.1167, 3);
  });
});
