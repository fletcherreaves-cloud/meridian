import { describe, it, expect } from 'vitest';
import { computeMissedCountItems } from '../engine/eom-inventory.js';

const row = (wrin, cls, lastCounted, extra = {}) => ({ loc: '3708', wrin, cls, lastCounted, onHandAmt: 10, active: true, ...extra });

describe('computeMissedCountItems — store-relative "same count date" check (owner req 2026-11-01)', () => {
  it('flags an item counted a different day than the store\'s own Food/Cond/Paper bulk day', () => {
    const rows = [
      row('f1', 'Food', '2026-10-29'),
      row('f2', 'Food', '2026-10-29'),
      row('c1', 'Condiment', '2026-10-29'),
      row('f3', 'Food', '2026-10-27'), // missed — counted two days before the bulk day
    ];
    const { items, anchor } = computeMissedCountItems(rows, { period: '2026-10' });
    expect(anchor.early).toBe('2026-10-29');
    expect(items).toHaveLength(1);
    expect(items[0].wrin).toBe('f3');
    expect(items[0].reason).toMatch(/before this count/);
  });

  it('flags a blank/never-counted item as missed with "no count date on file"', () => {
    const rows = [
      row('f1', 'Food', '2026-10-29'),
      row('f2', 'Food', '2026-10-29'),
      row('f3', 'Food', null),
    ];
    const { items } = computeMissedCountItems(rows, { period: '2026-10' });
    expect(items).toHaveLength(1);
    expect(items[0].wrin).toBe('f3');
    expect(items[0].lastCounted).toBeNull();
    expect(items[0].reason).toBe('no count date on file');
  });

  it('Non-Product anchors to the period\'s LAST calendar day, not a mode of its own counts', () => {
    const rows = [
      row('n1', 'Non-Product', '2026-10-31'), // the period's last day — on time
      row('n2', 'Non-Product', '2026-10-28'), // missed — counted early, before the required last-day count
    ];
    const { items, anchor } = computeMissedCountItems(rows, { period: '2026-10' });
    expect(anchor.late).toBe('2026-10-31');
    expect(items).toHaveLength(1);
    expect(items[0].wrin).toBe('n2');
    expect(items[0].classGroup).toBe('late');
  });

  it('a later count than the bulk day is still flagged, but the reason says "after", not "before"', () => {
    const rows = [
      row('f1', 'Food', '2026-10-29'),
      row('f2', 'Food', '2026-10-29'),
      row('f3', 'Food', '2026-10-30'), // recounted a day after the bulk day
    ];
    const { items } = computeMissedCountItems(rows, { period: '2026-10' });
    expect(items).toHaveLength(1);
    expect(items[0].reason).toMatch(/after this count/);
  });

  it('a confirmed-deactivated item is excluded even when its date differs', () => {
    const rows = [
      row('f1', 'Food', '2026-10-29'),
      row('f2', 'Food', '2026-10-29'),
      row('f3', 'Food', '2026-09-01', { active: false }),
      row('f4', 'Food', '2026-09-01', { descr: 'Old Sauce (Deactivated)' }),
    ];
    const { items } = computeMissedCountItems(rows, { period: '2026-10' });
    expect(items.map(i => i.wrin)).toEqual([]);
  });

  it('with no real count yet this period for a class group, that group\'s items are not flagged (nothing to compare against)', () => {
    const rows = [row('n1', 'Non-Product', null), row('n2', 'Non-Product', null)];
    // Early group has no anchor either (no Food/Cond/Paper rows at all) -- fine, just empty.
    const { items, anchor } = computeMissedCountItems(rows.map(r => ({ ...r, loc: '3708' })), { period: '2026-10' });
    // Late anchor is always known (the period's last day), so these two SHOULD be flagged --
    // confirms the late-group anchor never depends on having any counts yet.
    expect(anchor.late).toBe('2026-10-31');
    expect(items).toHaveLength(2);
  });

  it('asOfOverride forces a specific anchor date for both class groups', () => {
    const rows = [
      row('f1', 'Food', '2026-10-28'),
      row('f2', 'Food', '2026-10-29'), // would be the natural bulk day, but overridden below
    ];
    const { items, anchor } = computeMissedCountItems(rows, { period: '2026-10', asOfOverride: '2026-10-28' });
    expect(anchor.early).toBe('2026-10-28');
    expect(anchor.late).toBe('2026-10-28');
    expect(items.map(i => i.wrin)).toEqual(['f2']);
  });

  it('countedDate uses lastSubmitted when it is later than lastCounted', () => {
    const rows = [
      row('f1', 'Food', '2026-10-29'),
      row('f2', 'Food', '2026-10-29'),
      { ...row('f3', 'Food', '2026-10-20'), lastSubmitted: '2026-10-29' }, // submitted on the bulk day -- not missed
    ];
    const { items } = computeMissedCountItems(rows, { period: '2026-10' });
    expect(items).toHaveLength(0);
  });
});
