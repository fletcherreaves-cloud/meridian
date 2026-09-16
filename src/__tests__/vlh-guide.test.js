// @ts-nocheck
// Task #56 — VLH guide engine. Fixture tiers below are a small hand-built guide (not the
// full 4,592-row seed) so each assertion is easy to verify by eye; the real seed data's
// own structural integrity (every daypart covers 0-9999 contiguously, no gaps, no
// duplicate configs) was validated separately while extracting it — see
// memory/finding-vlh-guide-tables-2026-09-16.md.
import { describe, it, expect } from 'vitest';
import {
  buildVlhGuideIndex, lookupTierHours, guideNeededHoursForRow, guideVsReportedByStoreDaypart,
} from '../engine/vlh-guide.js';

const CFG_WITH_DT = { vlh_guide: 'standard', aot: false, dt_type: 'side_tandem', in_store: 'self_serve', kitchen: 'fryer_same' };
const CFG_NO_DT = { vlh_guide: 'standard', aot: false, dt_type: 'no_dt', in_store: 'self_serve', kitchen: 'fryer_same' };
const CFG_HPG = { vlh_guide: 'hpg', aot: false, dt_type: 'side_tandem', in_store: 'self_serve', kitchen: 'fryer_same' };

// Mirrors the real table's row shape (snake_case, as Supabase returns it).
const RAW_ROWS = [
  // standard / side_tandem / self_serve / fryer_same / drive_thru / breakfast
  { guide: 'standard', aot: false, dt_type: 'side_tandem', in_store: 'self_serve', kitchen: 'fryer_same', position: 'drive_thru', daypart: 'breakfast', tier: 1, guest_start: 0, guest_end: 9 },
  { guide: 'standard', aot: false, dt_type: 'side_tandem', in_store: 'self_serve', kitchen: 'fryer_same', position: 'drive_thru', daypart: 'breakfast', tier: 2, guest_start: 10, guest_end: 43 },
  { guide: 'standard', aot: false, dt_type: 'side_tandem', in_store: 'self_serve', kitchen: 'fryer_same', position: 'drive_thru', daypart: 'breakfast', tier: 8, guest_start: 190, guest_end: 9999 },
  // standard / side_tandem / self_serve / fryer_same / in_store / breakfast
  { guide: 'standard', aot: false, dt_type: 'side_tandem', in_store: 'self_serve', kitchen: 'fryer_same', position: 'in_store', daypart: 'breakfast', tier: 0, guest_start: 0, guest_end: 4 },
  { guide: 'standard', aot: false, dt_type: 'side_tandem', in_store: 'self_serve', kitchen: 'fryer_same', position: 'in_store', daypart: 'breakfast', tier: 1, guest_start: 5, guest_end: 70 },
  { guide: 'standard', aot: false, dt_type: 'side_tandem', in_store: 'self_serve', kitchen: 'fryer_same', position: 'in_store', daypart: 'breakfast', tier: 3, guest_start: 146, guest_end: 9999 },
  // standard / no_dt / self_serve / fryer_same / in_store / breakfast (no drive_thru rows at all)
  { guide: 'standard', aot: false, dt_type: 'no_dt', in_store: 'self_serve', kitchen: 'fryer_same', position: 'in_store', daypart: 'breakfast', tier: 0, guest_start: 0, guest_end: 32 },
  { guide: 'standard', aot: false, dt_type: 'no_dt', in_store: 'self_serve', kitchen: 'fryer_same', position: 'in_store', daypart: 'breakfast', tier: 5, guest_start: 272, guest_end: 9999 },
  // hpg / side_tandem / self_serve / fryer_same / drive_thru / breakfast (different numbers than standard)
  { guide: 'hpg', aot: false, dt_type: 'side_tandem', in_store: 'self_serve', kitchen: 'fryer_same', position: 'drive_thru', daypart: 'breakfast', tier: 1, guest_start: 0, guest_end: 20 },
];

describe('buildVlhGuideIndex', () => {
  it('groups rows by guide+aot+dtType+inStore+kitchen+position+daypart, sorted by guestStart', () => {
    const idx = buildVlhGuideIndex(RAW_ROWS);
    expect(idx.size).toBe(4); // 4 distinct (config,position,daypart) combos above
    const dtStd = idx.get('standard|false|side_tandem|self_serve|fryer_same|drive_thru|breakfast');
    expect(dtStd.map(t => t.tier)).toEqual([1, 2, 8]);
    expect(dtStd[0].guestStart).toBe(0);
  });
});

describe('lookupTierHours', () => {
  const idx = buildVlhGuideIndex(RAW_ROWS);

  it('finds the tier whose [guestStart,guestEnd] contains the guest count', () => {
    expect(lookupTierHours(idx, CFG_WITH_DT, 'drive_thru', 'Breakfast', 0)).toBe(1);
    expect(lookupTierHours(idx, CFG_WITH_DT, 'drive_thru', 'Breakfast', 9)).toBe(1);
    expect(lookupTierHours(idx, CFG_WITH_DT, 'drive_thru', 'Breakfast', 10)).toBe(2);
    expect(lookupTierHours(idx, CFG_WITH_DT, 'drive_thru', 'Breakfast', 9999)).toBe(8);
  });

  it('accepts either daypart spelling (capitalized labor-standard.js label or lowercase guide-table label)', () => {
    expect(lookupTierHours(idx, CFG_WITH_DT, 'in_store', 'Breakfast', 50)).toBe(1);
    expect(lookupTierHours(idx, CFG_WITH_DT, 'in_store', 'breakfast', 50)).toBe(1);
  });

  it('returns null for a config with no guide row for that position (Drive Thru on a no_dt store)', () => {
    expect(lookupTierHours(idx, CFG_NO_DT, 'drive_thru', 'Breakfast', 50)).toBe(null);
  });

  it('returns null for a negative or missing guest count -- never guesses', () => {
    expect(lookupTierHours(idx, CFG_WITH_DT, 'drive_thru', 'Breakfast', -1)).toBe(null);
    expect(lookupTierHours(idx, CFG_WITH_DT, 'drive_thru', 'Breakfast', null)).toBe(null);
  });

  it('returns null when the store_vlh_config row is incomplete', () => {
    expect(lookupTierHours(idx, { vlh_guide: 'standard' }, 'drive_thru', 'Breakfast', 5)).toBe(null);
    expect(lookupTierHours(idx, null, 'drive_thru', 'Breakfast', 5)).toBe(null);
  });

  it('different guide (standard vs hpg) resolves to a different table for the identical config axes', () => {
    expect(lookupTierHours(idx, CFG_WITH_DT, 'drive_thru', 'Breakfast', 15)).toBe(2);   // standard: 10-43 -> tier 2
    expect(lookupTierHours(idx, CFG_HPG, 'drive_thru', 'Breakfast', 15)).toBe(1);        // hpg: 0-20 -> tier 1
  });
});

describe('guideNeededHoursForRow', () => {
  const idx = buildVlhGuideIndex(RAW_ROWS);

  it('sums Drive Thru + In-Store for a DAR row with both guest counts', () => {
    const row = { hour_slot: '06:00', dt_transactions: 5, is_transactions: 50 };
    const out = guideNeededHoursForRow(idx, CFG_WITH_DT, row);
    expect(out.driveThruHours).toBe(1);
    expect(out.inStoreHours).toBe(1);
    expect(out.totalHours).toBe(2);
    expect(out.daypart).toBe('Breakfast');
  });

  it('a no_dt config contributes 0 (not null) for the Drive Thru leg -- genuinely needs zero hours', () => {
    const row = { hour_slot: '06:00', dt_transactions: 0, is_transactions: 10 };
    const out = guideNeededHoursForRow(idx, CFG_NO_DT, row);
    expect(out.driveThruHours).toBe(0);
    expect(out.inStoreHours).toBe(0);
    expect(out.totalHours).toBe(0);
  });

  it('totalHours is null (not a silent 0) when a leg cannot be looked up', () => {
    const row = { hour_slot: '06:00', dt_transactions: 5, is_transactions: null };
    const out = guideNeededHoursForRow(idx, CFG_WITH_DT, row);
    expect(out.driveThruHours).toBe(1);
    expect(out.inStoreHours).toBe(null);
    expect(out.totalHours).toBe(null);
  });

  it('returns null for a row with no hour_slot or an incomplete config', () => {
    expect(guideNeededHoursForRow(idx, CFG_WITH_DT, { dt_transactions: 5 })).toBe(null);
    expect(guideNeededHoursForRow(idx, null, { hour_slot: '06:00' })).toBe(null);
  });
});

describe('guideVsReportedByStoreDaypart', () => {
  const idx = buildVlhGuideIndex(RAW_ROWS);
  const storeConfigs = { '3708': CFG_WITH_DT, '9999': CFG_NO_DT };

  it('sums guide-derived and reported hours per (loc, daypart)', () => {
    const rows = [
      { loc: '0003708', hour_slot: '06:00', dt_transactions: 5, is_transactions: 50, total_needed_hours: 1.5 },
      { loc: '0003708', hour_slot: '07:00', dt_transactions: 5, is_transactions: 50, total_needed_hours: 1.5 },
    ];
    const out = guideVsReportedByStoreDaypart(idx, storeConfigs, rows);
    expect(out['3708'].Breakfast.guideHours).toBe(4); // (1+1) + (1+1)
    expect(out['3708'].Breakfast.reportedHours).toBe(3);
    expect(out['3708'].Breakfast.diffHours).toBeCloseTo(1);
    expect(out['3708'].Breakfast.rowsMissingGuide).toBe(0);
  });

  it('skips stores with no store_vlh_config entry rather than guessing a config', () => {
    const rows = [{ loc: '0005555', hour_slot: '06:00', dt_transactions: 5, is_transactions: 50, total_needed_hours: 1 }];
    const out = guideVsReportedByStoreDaypart(idx, storeConfigs, rows);
    expect(out['5555']).toBeUndefined();
  });

  it('counts rows where the guide total is unresolvable, without corrupting the summed hours', () => {
    const rows = [
      { loc: '0003708', hour_slot: '06:00', dt_transactions: 5, is_transactions: 50, total_needed_hours: 1.5 },
      { loc: '0003708', hour_slot: '07:00', dt_transactions: 5, is_transactions: null, total_needed_hours: 1.0 },
    ];
    const out = guideVsReportedByStoreDaypart(idx, storeConfigs, rows);
    expect(out['3708'].Breakfast.rowsMissingGuide).toBe(1);
    expect(out['3708'].Breakfast.guideHours).toBe(2); // only the first row's total (1+1) counted
    expect(out['3708'].Breakfast.reportedHours).toBe(2.5); // both rows' reported hours still summed
  });
});
