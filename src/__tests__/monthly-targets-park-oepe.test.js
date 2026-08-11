// @ts-nocheck
// #174 (#184 dispatch item 2, priority pair): parseMonthlyTargets previously had no
// column-detection for Park %/OEPE at all, so those fields never reached ds.monthlyTargets and
// saveMonthlyTargets had nothing to persist. This is the parser half; the persistence half
// (schema + saveMonthlyTargets + loaders) is covered by monthly-targets-null-strip.test.js's
// sibling round-trip test below.
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseMonthlyTargets } from '../parsers/index.js';

function wbFromAOA(aoa) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Table 1 (2)');
  return wb;
}

describe('parseMonthlyTargets — Park %/OEPE column detection (#174)', () => {
  const aoa = [
    ['Restaurant', 'Base Food\n%', 'Crew Labor %', 'Park %', 'OEPE\nPACE'],
    ['3708 - ARDMORE', 0.335, 0.24, 0.15, 140],
    ['5183 - CHICKASHA', 0.34, 0.235, 0.14, 145],
  ];
  const t = parseMonthlyTargets(wbFromAOA(aoa));

  it('extracts tPark and tOepe when the sheet has those columns', () => {
    expect(t['3708'].tPark).toBeCloseTo(0.15, 5);
    expect(t['3708'].tOepe).toBe(140);
    expect(t['5183'].tPark).toBeCloseTo(0.14, 5);
    expect(t['5183'].tOepe).toBe(145);
  });

  it('still extracts the pre-existing fields unaffected', () => {
    expect(t['3708'].tCrewLabor).toBeCloseTo(0.24, 5);
    expect(t['3708'].tFOBBase).toBeCloseTo(0.335, 5);
  });

  it('is a no-op (no tPark/tOepe key) when the sheet lacks those columns, same as every other optional field here', () => {
    const noParkOepe = parseMonthlyTargets(wbFromAOA([
      ['Restaurant', 'Base Food\n%', 'Crew Labor %'],
      ['3708 - ARDMORE', 0.335, 0.24],
    ]));
    expect('tPark' in noParkOepe['3708']).toBe(false);
    expect('tOepe' in noParkOepe['3708']).toBe(false);
  });
});
