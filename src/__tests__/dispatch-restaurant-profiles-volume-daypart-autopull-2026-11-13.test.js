// @ts-nocheck
// Restaurant Profiles (StoreKBEditor, labor-tools.js) — owner req 2026-11-13: correct Volume
// Tier's stale bands (Low <$1.2M/Mid $1.2-2M/High $2-3M/Very High >$3M, replaced with Low <$2M/
// Mid $2-3.5M/High $3.5-6M/Very High >$6M) and auto-populate Volume Tier + Primary Daypart from
// real data, while leaving both editable (same manual-overrides-auto shape the 4 VLH-backed
// fields already use).
import { describe, it, expect } from 'vitest';
import { volumeTierForAnnualSales, primaryDaypartFromMix } from '../views/labor-tools.js';

describe('volumeTierForAnnualSales — corrected bands (2026-11-13)', () => {
  it('returns undefined with no data', () => {
    expect(volumeTierForAnnualSales(null)).toBeUndefined();
  });
  it('Low: under $2M', () => {
    expect(volumeTierForAnnualSales(1_999_999)).toBe('Low (<$2M/yr)');
  });
  it('Mid: $2M up to (not including) $3.5M', () => {
    expect(volumeTierForAnnualSales(2_000_000)).toBe('Mid ($2–3.5M)');
    expect(volumeTierForAnnualSales(3_499_999)).toBe('Mid ($2–3.5M)');
  });
  it('High: $3.5M up to (not including) $6M', () => {
    expect(volumeTierForAnnualSales(3_500_000)).toBe('High ($3.5–6M)');
    expect(volumeTierForAnnualSales(5_999_999)).toBe('High ($3.5–6M)');
  });
  it('Very High: $6M and up', () => {
    expect(volumeTierForAnnualSales(6_000_000)).toBe('Very High (>$6M)');
    expect(volumeTierForAnnualSales(9_000_000)).toBe('Very High (>$6M)');
  });
});

describe('primaryDaypartFromMix', () => {
  it('returns undefined with no data', () => {
    expect(primaryDaypartFromMix({})).toBeUndefined();
  });

  it('a clear plurality daypart wins', () => {
    const mix = { Breakfast: 1000, Lunch: 4000, Afternoon: 500, Dinner: 2000, 'Late Night': 500 };
    expect(primaryDaypartFromMix(mix)).toBe('Lunch');
  });

  it('a near-even split reads as Balanced, not a false plurality', () => {
    const mix = { Breakfast: 2000, Lunch: 2200, Afternoon: 1000, Dinner: 2100, 'Late Night': 700 };
    expect(primaryDaypartFromMix(mix)).toBe('Balanced');
  });

  it('Afternoon dominance reads as Balanced -- no matching dropdown option', () => {
    const mix = { Breakfast: 500, Lunch: 1000, Afternoon: 5000, Dinner: 1000, 'Late Night': 200 };
    expect(primaryDaypartFromMix(mix)).toBe('Balanced');
  });

  it('a below-30%-share leader is still Balanced even with a real gap to 2nd', () => {
    const mix = { Breakfast: 2500, Lunch: 2000, Afternoon: 1800, Dinner: 1700, 'Late Night': 2000 };
    // top share here is 2500/10000 = 25%, under the 30% floor
    expect(primaryDaypartFromMix(mix)).toBe('Balanced');
  });
});
