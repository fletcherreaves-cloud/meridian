// @ts-nocheck
// Inventory Summary automation (memory/finding-inventory-summary-automation-2026-08-27.md,
// dispatch #178's open Lead A — endpoint owner-captured live 2026-09-04). Tests the pure mapper
// (mapInventorySummaryResponse, src/engine/eom-parsers.js) against a REAL captured API response
// fragment (not invented fixtures), plus the pull script's own pure derivation helpers
// (inclusiveDaySpan/deriveUsageRate, scripts/qsrsoft-inventory-summary-pull.mjs).
import { describe, it, expect } from 'vitest';
import { mapInventorySummaryResponse } from '../engine/eom-parsers.js';
import { inclusiveDaySpan, deriveUsageRate } from '../../scripts/qsrsoft-inventory-summary-pull.mjs';

// Real fragment from a live GET /api/inv/3708/inv_summary/rawitems?start_date=2026-09-01&end_date=2026-09-04
// response, captured by the owner 2026-09-04 (three representative items: a moving Food item with
// negative waste_qty, a zero-movement Ops Supplies item, and a Non-Product loyalty item).
const REAL_RESPONSE = {
  getInvSummaryInfo: [
    {
      store_rawitem_id: 1385961, full_wrin: '00004-849', long_desc: 'FRIES/440 NATURAL F16/6',
      invty_class: 'Food', uom_desc: 'Bag', uom_cost: 5.190333333333333, latest_case_price: 31.142,
      case_qty: 6, begin_inv_qty: 123.729, purchase_qty: 180, transfer_qty: 0,
      waste_qty: -5.56863009929657, end_inv_qty: 124.257, actual_usage: 179.4713134765625,
    },
    {
      store_rawitem_id: 1386187, full_wrin: '00830-003', long_desc: 'RESTROOM CLEANER',
      invty_class: 'Ops Supplies', uom_desc: 'Container', uom_cost: 4.7865, latest_case_price: 28.719,
      case_qty: 6, begin_inv_qty: 180, purchase_qty: 0, transfer_qty: 0,
      waste_qty: 0, end_inv_qty: 180, actual_usage: 0,
    },
    {
      store_rawitem_id: 19626776, full_wrin: '00955-000', long_desc: 'COFFEE CARE (New)',
      invty_class: 'Miscellaneous', uom_desc: 'Each', uom_cost: null, latest_case_price: null,
      case_qty: 1, begin_inv_qty: 0, purchase_qty: 0, transfer_qty: 0,
      waste_qty: 0, end_inv_qty: 0, actual_usage: 0,
    },
  ],
  getProductNetSales: [{ pns: 35719.12 }],
};

describe('mapInventorySummaryResponse', () => {
  it('maps every real field, camelCased, against the live-captured response shape', () => {
    const out = mapInventorySummaryResponse(REAL_RESPONSE);
    expect(out.length).toBe(3);
    expect(out[0]).toEqual({
      wrin: '00004-849', descr: 'FRIES/440 NATURAL F16/6', cls: 'Food', uom: 'Bag',
      caseSz: 6, cost: 5.190333333333333, startInv: 123.729, purchases: 180, transferQty: 0,
      wasteQty: -5.56863009929657, endInv: 124.257, actualUsage: 179.4713134765625,
    });
  });

  it('carries a null cost/case-price item through without throwing (a real "(New)" item with no pricing yet)', () => {
    const out = mapInventorySummaryResponse(REAL_RESPONSE);
    expect(out[2].wrin).toBe('00955-000');
    expect(out[2].cost).toBeNull();
  });

  it('a zero-movement item (no purchase, no waste, no usage) still maps cleanly, not filtered out', () => {
    const out = mapInventorySummaryResponse(REAL_RESPONSE);
    expect(out[1].actualUsage).toBe(0);
    expect(out[1].purchases).toBe(0);
  });

  it('returns [] for a missing/malformed getInvSummaryInfo, not a throw', () => {
    expect(mapInventorySummaryResponse({})).toEqual([]);
    expect(mapInventorySummaryResponse({ getInvSummaryInfo: null })).toEqual([]);
  });
});

describe('inclusiveDaySpan', () => {
  it('counts both endpoints inclusive — 2026-09-01..2026-09-04 is 4 days, not 3', () => {
    expect(inclusiveDaySpan('2026-09-01', '2026-09-04')).toBe(4);
  });
  it('a single-day window is 1 day', () => {
    expect(inclusiveDaySpan('2026-09-04', '2026-09-04')).toBe(1);
  });
});

describe('deriveUsageRate', () => {
  it('the real fries item: 179.4713.../4 days ≈ 44.87/day, days_supply = end_inv / that rate', () => {
    const { usagePerDay, daysSupply } = deriveUsageRate(179.4713134765625, 124.257, 4);
    expect(usagePerDay).toBeCloseTo(44.8678, 3);
    expect(daysSupply).toBeCloseTo(124.257 / 44.8678, 2);
  });

  it('zero usage over the window → usagePerDay 0, daysSupply null (not Infinity, not a crash)', () => {
    const { usagePerDay, daysSupply } = deriveUsageRate(0, 180, 4);
    expect(usagePerDay).toBe(0);
    expect(daysSupply).toBeNull();
  });

  it('null actualUsage (item never appeared in the report) → both null, not NaN', () => {
    const { usagePerDay, daysSupply } = deriveUsageRate(null, 100, 4);
    expect(usagePerDay).toBeNull();
    expect(daysSupply).toBeNull();
  });
});
