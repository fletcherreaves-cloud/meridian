// @ts-nocheck
// dispatch 2026-10-14 (Lindsay 18213 -> 44689 relocation, owner: "give me a way to toggle it or
// set it when needed") -- storeLifecycle: a settable {loc: closedDate} map + isStoreClosedOn/
// activeStoreIds resolvers (constants.js), wired into Smart Targets' roster (the first real
// consumer; see src/features/smart-targets.js's own comment on why it's scoped to just this one
// consumer rather than a sweep of every STORE_NAMES-reading call site in the app).
import { describe, it, expect } from 'vitest';
import { isStoreClosedOn, activeStoreIds } from '../constants.js';

describe('isStoreClosedOn()', () => {
  it('a store with no entry in storeLifecycle is never closed', () => {
    expect(isStoreClosedOn('18213', {}, '2099-01-01')).toBe(false);
    expect(isStoreClosedOn('18213', { '44689': '2026-11-14' }, '2099-01-01')).toBe(false);
  });
  it('closed as of its closedDate, not before', () => {
    const lifecycle = { '18213': '2026-11-10' };
    expect(isStoreClosedOn('18213', lifecycle, '2026-11-09')).toBe(false);
    expect(isStoreClosedOn('18213', lifecycle, '2026-11-10')).toBe(true);
    expect(isStoreClosedOn('18213', lifecycle, '2026-11-11')).toBe(true);
  });
  it('a future closedDate lets the owner set it ahead of time without it applying early -- "time it right" without a same-day toggle', () => {
    const lifecycle = { '18213': '2026-11-10' };
    expect(isStoreClosedOn('18213', lifecycle, '2026-10-14')).toBe(false); // set weeks ahead, not yet effective
  });
  it('unpads a zero-padded loc the same way whoRan/groupsAt do', () => {
    expect(isStoreClosedOn('018213', { '18213': '2026-11-10' }, '2026-11-10')).toBe(true);
  });
});

describe('activeStoreIds()', () => {
  it('drops a closed-as-of-date store, keeps everything else', () => {
    const lifecycle = { '18213': '2026-11-10' };
    const ids = ['3708', '18213', '44689'];
    expect(activeStoreIds(ids, lifecycle, '2026-11-10')).toEqual(['3708', '44689']);
    expect(activeStoreIds(ids, lifecycle, '2026-11-09')).toEqual(['3708', '18213', '44689']);
  });
  it('accepts {loc,...} objects, not just bare id strings', () => {
    const lifecycle = { '18213': '2026-11-10' };
    const rows = [{ loc: '3708' }, { loc: '18213' }];
    expect(activeStoreIds(rows, lifecycle, '2026-11-10')).toEqual([{ loc: '3708' }]);
  });
  it('an empty storeLifecycle (the default) filters nothing -- no behavior change for every store today', () => {
    expect(activeStoreIds(['3708', '18213'], {}, '2026-11-10')).toEqual(['3708', '18213']);
  });
});
