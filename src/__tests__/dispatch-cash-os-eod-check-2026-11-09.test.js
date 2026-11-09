// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-11-09, prompted by a real "Today's One Thing" card showing "Cash O/S short
// by $3147.59": "make sure to point out that End of Business Day is the first thing to verify
// has been completed, first. Then follow with regular recommendations/suggestions." The CASH_OS
// rule (src/features/morning-brief.js MORNING_RULES) feeds every altitude of Curated Home
// (src/engine/curated-home.js reuses `detail`/`action` verbatim) plus the Morning Brief panel
// itself, so fixing it at the rule's own definition is the single point of truth -- same
// reasoning that file's own header comment states for why detail/action are written generically.
// Drives the real computeMorningBrief() end to end (not the private MORNING_RULES array), per
// this repo's "would this verification still pass if reverted?" standing rule.
import { describe, it, expect } from 'vitest';
import { computeMorningBrief } from '../features/morning-brief.js';

const d = s => new Date(s + 'T00:00:00');
const LOC = '3708'; // real seed store (constants.js STORE_NAMES), Ardmore-Broadway OK
const TARGET = d('2026-09-10');

function storeFrom(brief) {
  const s = brief.stores.find(st => st.loc === LOC);
  expect(s, `store ${LOC} not found in brief.stores`).toBeTruthy();
  return s;
}

describe('CASH_OS rule — verify End of Business Day first (owner request 2026-11-09)', () => {
  it('a cash short names the End of Business Day check first, in both detail and action', () => {
    const ds = { opsCashRows: [{ loc: LOC, date: TARGET, cashOSAmt: -3147.59 }] };
    const brief = computeMorningBrief(ds, TARGET, {});
    const flag = storeFrom(brief).flags.find(f => f.id === 'CASH_OS');
    expect(flag, 'CASH_OS flag did not fire').toBeTruthy();
    expect(flag.headline).toBe('Cash O/S short by $3147.59');
    expect(flag.detail).toMatch(/^First, confirm End of Business Day has been completed in QSRSoft/);
    expect(flag.action).toMatch(/^First, confirm End of Business Day has been completed in QSRSoft/);
    // The regular recommendations still follow, not replaced.
    expect(flag.detail).toMatch(/Cash shorts are more concerning than overs/);
    expect(flag.action).toMatch(/reconcile drawer counts/i);
  });

  it('a cash over gets the same EOD-first framing', () => {
    const ds = { opsCashRows: [{ loc: LOC, date: TARGET, cashOSAmt: 60 }] };
    const brief = computeMorningBrief(ds, TARGET, {});
    const flag = storeFrom(brief).flags.find(f => f.id === 'CASH_OS');
    expect(flag).toBeTruthy();
    expect(flag.detail).toMatch(/^First, confirm End of Business Day has been completed/);
    expect(flag.detail).toMatch(/Cash overs can indicate pricing errors/);
  });

  it('a small, below-threshold variance does not fire the rule at all (unaffected by this change)', () => {
    const ds = { opsCashRows: [{ loc: LOC, date: TARGET, cashOSAmt: -5 }] };
    const brief = computeMorningBrief(ds, TARGET, {});
    expect(storeFrom(brief).flags.find(f => f.id === 'CASH_OS')).toBeFalsy();
  });
});
