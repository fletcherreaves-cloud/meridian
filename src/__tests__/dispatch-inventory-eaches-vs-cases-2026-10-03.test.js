// @ts-nocheck
// Owner-reported (2026-10-03), Overstock section screenshot: "Excess cases can't be correct.
// value looks ok, but cases way high. Maybe that's the eaches being displayed as cases." Example
// from the screenshot: SALT PACKETS at 5538.62 "cs" excess for a $16.09 excess value, PEPPER
// PACKETS/BLACK at 11091.01 "cs" for $54.96 -- both implausible case counts next to believable
// dollar figures.
//
// Root cause, confirmed against LIVE qsr_inventory_summary data (1000 real rows, 2026-10-03):
// `uom` is NEVER 'Case' -- only Each/Container/Bag/Gallon/Packet/Pouch/Box/Pound, the item's own
// natural count unit, reported separately from `case_sz` (eaches-per-case). So usagePerDay (and
// startInv/endInv/actualUsage) are ALWAYS in that natural unit, never pre-converted to cases --
// exactly the "Display as Each" shape the manual-upload parser (parseInventoryData,
// inventory-parse.js) already detects via filename and divides by caseSize for. cloudRowsToPanelShape
// had this hardcoded eachFmt:false (an explicitly-flagged "UNVERIFIED" guess before this fix),
// so computeInvSections's excessCases formula ((daysSupply-threshold)*usageDay / (eachFmt?caseSize:1))
// never divided by caseSize for any cloud-sourced row -- inflating excessCases by exactly a factor
// of caseSize. excessValue was unaffected (it never divides by caseSize at all), which is exactly
// why the owner saw a believable dollar figure next to an implausible case count for the same row.
import { describe, it, expect } from 'vitest';
import { cloudRowsToPanelShape, computeInvSections } from '../views/inventory.js';

describe('cloudRowsToPanelShape — eachFmt', () => {
  it('sets eachFmt:true for every cloud row (confirmed: qsr_inventory_summary never reports in cases)', () => {
    const { rows } = cloudRowsToPanelShape([
      { loc: '0003708', wrin: '00044-026', descr: 'PEPPER PACKETS/BLACK', cls: 'Condiment',
        uom: 'Packet', caseSz: 6000, cost: 0.00497, period: '2026-09',
        usagePerDay: 67.5146240234375, daysSupply: 42.39377825767637,
        actualUsage: 2025.4387, startInv: 4887.63, endInv: 2862.2 },
    ], {});
    expect(rows[0].eachFmt).toBe(true);
  });
});

describe('computeInvSections — Overstock excessCases, the exact reported incident', () => {
  // Real shape from qsr_inventory_summary (store 3708, PEPPER PACKETS/BLACK, Sep 2026 period).
  const pepperRow = {
    loc: '3708', wrin: '00044-026', description: 'PEPPER PACKETS/BLACK', class_: 'Condiment',
    uom: 'Packet', caseSize: 6000, cost: 0.004974166666666667,
    usageDay: 67.5146240234375, usage1000: 1, daysSupply: 42.393778257676374,
    area: 'Service', inactive: false, eachFmt: true,
    actualUsage: 2025.438720703125, startingInv: 4887.63, endingInv: 2862.2, source: 'cloud',
  };

  it('eachFmt:true (the fix) divides by caseSize -- excessCases lands in a believable sub-1-case range, not thousands', () => {
    const { overstk } = computeInvSections([pepperRow], 30, false, false);
    expect(overstk).toHaveLength(1);
    const expectedExcessCases = +(((42.393778257676374 - 30) * 67.5146240234375) / 6000).toFixed(2);
    expect(overstk[0].excessCases).toBeCloseTo(expectedExcessCases, 2);
    expect(overstk[0].excessCases).toBeLessThan(1); // sanity: a believable "slightly over" amount
  });

  it('regression: eachFmt:false (the old, now-wrong behavior) is what produced the implausible thousands-of-cases figure -- documents the bug this fix closes, not a desired behavior', () => {
    const { overstk } = computeInvSections([{ ...pepperRow, eachFmt: false }], 30, false, false);
    const buggyExcessCases = +(((42.393778257676374 - 30) * 67.5146240234375) / 1).toFixed(2);
    expect(overstk[0].excessCases).toBeCloseTo(buggyExcessCases, 2);
    expect(overstk[0].excessCases).toBeGreaterThan(800); // the implausible, pre-fix magnitude
  });

  it('excessValue is unaffected by eachFmt either way -- the $ figure was never the bug, only the case count', () => {
    const fixed = computeInvSections([pepperRow], 30, false, false).overstk[0];
    const buggy = computeInvSections([{ ...pepperRow, eachFmt: false }], 30, false, false).overstk[0];
    expect(fixed.excessValue).toBeCloseTo(buggy.excessValue, 6);
  });

  it('a manual-upload row (eachFmt driven by its own filename detection, unaffected by this cloud-path fix) still divides by caseSize when the workbook was "Display as Each"', () => {
    const manualRow = { ...pepperRow, source: 'manual', eachFmt: true, caseSize: 6000 };
    const { overstk } = computeInvSections([manualRow], 30, false, false);
    expect(overstk[0].excessCases).toBeLessThan(1);
  });
});
