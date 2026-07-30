import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseYearlyTargets } from '../parsers/index.js';

// Mirrors the real "2026 Restaurant Targets - Table 1" layout: a category/title row that
// carries the word OEPE/Park (but no store column), then the real header row with an "Index"
// row-counter column BEFORE the "Restaurant" store column, then data. Regression guard: the
// parser must anchor on Restaurant (the "3708 - …" store), not Index (1,2,3…), and must pick
// the real header row (not the title row) — the two bugs that left OSAT B2B blank (v4.622).
function wbFromAOA(aoa) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Table 1');
  return wb;
}

describe('parseYearlyTargets — Table 1 (Index + Restaurant layout)', () => {
  const aoa = [
    ['2026 Restaurant Targets', null, null, null, null, null, null, null],   // title
    ['Speed', 'OEPE', 'Park', null, null, null, null, 'Voice'],              // category row (has OEPE/Park, no store col)
    ['Index', 'Organization', 'Owner', 'Patch', null, 'Restaurant', 'OEPE PACE', 'Park %', 'KVS PACE', 'Overall Satisfaction B2B'],
    [1, 'MCDOK', 'Ryan', 'Robert', null, '3708 - ARDMORE', 140, 0.15, 45, 0.04],
    [2, 'MCDOK', 'Gary', 'Krys',   null, '5183 - CHICKASHA', 145, 0.14, 60, 0.015],
  ];
  const y = parseYearlyTargets(wbFromAOA(aoa));

  it('anchors on Restaurant (not the Index row-counter) → real store keys', () => {
    expect(Object.keys(y).sort()).toEqual(['3708', '5183']);
  });
  it('captures the OSAT B2B (Overall Satisfaction B2B) target', () => {
    expect(y['3708'].tOsatB2B).toBeCloseTo(0.04, 5);
    expect(y['5183'].tOsatB2B).toBeCloseTo(0.015, 5);
  });
  it('still reads the other yearly targets from the correct header row', () => {
    expect(y['3708'].tOepe).toBe(140);
    expect(y['3708'].tKvst).toBe(45);
  });
});
