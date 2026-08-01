import { describe, it, expect } from 'vitest';
import { verifyClearItems } from '../engine/eom-verify-clear.js';

describe('verifyClearItems', () => {
  it('flags deactivated items that still carry inventory (submit zero / waste)', () => {
    const rows = [
      { wrin: '00004-849', descr: 'BREADED CHICKEN STRIP (Deactivated)', onHandAmt: 238, totalUnits: 40, lastCounted: '2026-06-29' },
      { wrin: '00005-086', descr: '100% PURE BEEF (Deactivated)', onHandAmt: 0 },   // zeroed already → skip
      { wrin: '00007-111', descr: 'FRIES', onHandAmt: 500 },                          // active → skip
    ];
    const vc = verifyClearItems(rows);
    expect(vc.deactivated).toHaveLength(1);
    expect(vc.deactivated[0].wrin).toBe('00004-849');
    expect(vc.deactivatedTotal).toBe(238);
  });

  it('flags a duplicate WRIN by DESCRIPTION (same item, two WRINs, both with inventory)', () => {
    const rows = [
      { wrin: '00010-100', descr: 'BIG MAC SAUCE CUP', onHandAmt: 120 },
      { wrin: '00010-200', descr: 'Big Mac Sauce Cup', onHandAmt: 40 },   // same item, new WRIN — old not zeroed
    ];
    const vc = verifyClearItems(rows);
    expect(vc.duplicates).toHaveLength(1);
    expect(vc.duplicates[0].items).toHaveLength(2);
    expect(vc.duplicateTotal).toBe(160);
  });

  it('does NOT treat different items sharing a WRIN family prefix as duplicates (the false-positive guard)', () => {
    const rows = [
      { wrin: '20073-004', descr: 'KETCHUP PACKET', onHandAmt: 217 },
      { wrin: '20073-008', descr: 'MUSTARD PACKET', onHandAmt: 127 },   // different item, same prefix
    ];
    const vc = verifyClearItems(rows);
    expect(vc.duplicates).toHaveLength(0);
  });

  it('ignores a deactivated tag on the description when matching duplicates', () => {
    const rows = [
      { wrin: '00010-100', descr: 'LEMONS', onHandAmt: 30 },
      { wrin: '00010-200', descr: 'LEMONS (Deactivated)', onHandAmt: 12 },
    ];
    const vc = verifyClearItems(rows);
    expect(vc.duplicates).toHaveLength(1);       // same underlying item
    expect(vc.deactivated).toHaveLength(1);      // and the deactivated one flags for clearing too
  });
});
