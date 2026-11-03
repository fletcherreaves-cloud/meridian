// @ts-nocheck
// Owner-reported 2026-11-03: new-store 44689 (Lindsay-standalone, see
// dispatch-store-lifecycle-2026-10-14.test.js for its predecessor 18213's close-date sibling)
// was showing up with a real sales target on the October Pace-to-Target view, weeks before its
// planned November open -- STORE_NAMES has carried it since the relocation was announced, so
// every roster call site that reads STORE_NAMES directly had no way to know it wasn't trading
// yet. storeOpenDates/isStoreNotYetOpenOn (constants.js) is the opening-side counterpart to
// storeLifecycle/isStoreClosedOn, wired into CurrentMonthPaceSection (analytics.js).
import { describe, it, expect } from 'vitest';
import { isStoreNotYetOpenOn } from '../constants.js';

describe('isStoreNotYetOpenOn()', () => {
  it('a store with no entry in storeOpenDates is never "not yet open" (unchanged default behavior)', () => {
    expect(isStoreNotYetOpenOn('18213', {}, '2026-10-01')).toBe(false);
    expect(isStoreNotYetOpenOn('44689', { '18213': '2026-11-10' }, '2026-10-01')).toBe(false);
  });
  it('not yet open strictly before its openDate, open on and after', () => {
    const openDates = { '44689': '2026-11-14' };
    expect(isStoreNotYetOpenOn('44689', openDates, '2026-11-13')).toBe(true);
    expect(isStoreNotYetOpenOn('44689', openDates, '2026-11-14')).toBe(false);
    expect(isStoreNotYetOpenOn('44689', openDates, '2026-11-15')).toBe(false);
  });
  it('unpads a zero-padded loc the same way isStoreClosedOn does', () => {
    expect(isStoreNotYetOpenOn('044689', { '44689': '2026-11-14' }, '2026-11-01')).toBe(true);
  });
});
