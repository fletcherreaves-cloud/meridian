// @ts-nocheck
// #156 (memory/project-scoring-revisit.md) — App.js's startup hydration used to build
// `ds.monthlyTargets` by spreading the freshly-loaded CLOUD data first, then `prev.monthlyTargets`
// (device-local IDB cache, or {} on a fresh device) on TOP of it -- so a stale device cache
// silently beat a corrected cloud value for any store present in both. Confirmed not deliberate:
// saveMonthlyTargets()/loadAllMonthlyTargets() already round-trip correctly both ways, this was
// only ever a precedence bug, backwards from CLAUDE.md's cloud-first architecture rule ("Data
// saved to Supabase on upload -> loaded from Supabase on login... Supabase is the source of
// truth"). Fixed by inverting the spread order so cloud wins per store; a store only present in
// the device cache (cloud fetch hasn't reached it yet) is still preserved as a fallback.
//
// Per CLAUDE.md's "would this verification still pass if the change were reverted?" rule, this
// reads App.js's ACTUAL source text (not a hand-copied re-implementation) so a regression on the
// real call site fails this test, not just an isolated re-derivation of the intended semantics.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/app/App.js', 'utf8');

describe('#156 — monthly-target startup hydration is cloud-first, not device-cache-first', () => {
  it('the real App.js _stMonthlyTargets merge spreads prev.monthlyTargets FIRST, cloud data SECOND (cloud wins on overlap)', () => {
    const m = SRC.match(/monthlyTargets:\s*\{\s*\.\.\.prev\.monthlyTargets\s*,\s*\.\.\.\(all\[latestKey\]\s*\|\|\s*\{\}\)\s*\}/);
    expect(m).toBeTruthy();
  });

  it('the pre-fix (device-cache-wins) spread order is no longer present anywhere in App.js', () => {
    const stale = /monthlyTargets:\s*\{\s*\.\.\.\(all\[latestKey\]\s*\|\|\s*\{\}\)\s*,\s*\.\.\.prev\.monthlyTargets\s*\}/;
    expect(stale.test(SRC)).toBe(false);
  });

  it('functionally: a fresh cloud value overrides a stale device-cached value for the same store', () => {
    const prevMonthlyTargets = { '1001': { tCrewLabor: 0.30, tTpph: 5.0 } }; // stale device cache
    const cloudLatest = { '1001': { tCrewLabor: 0.24 } }; // owner corrected it in the cloud
    // Mirrors the fixed App.js expression: { ...prev.monthlyTargets, ...(all[latestKey]||{}) }
    const merged = { ...prevMonthlyTargets, ...(cloudLatest || {}) };
    expect(merged['1001'].tCrewLabor).toBe(0.24); // cloud wins, not the stale 0.30
  });

  it('functionally: a store present only in the device cache (cloud fetch has not reached it) is preserved, not dropped', () => {
    const prevMonthlyTargets = { '2002': { tCrewLabor: 0.28 } };
    const cloudLatest = { '1001': { tCrewLabor: 0.24 } };
    const merged = { ...prevMonthlyTargets, ...(cloudLatest || {}) };
    expect(merged['2002'].tCrewLabor).toBe(0.28);
    expect(merged['1001'].tCrewLabor).toBe(0.24);
  });

  it('functionally: an empty cloud response leaves the device cache untouched, never wipes it', () => {
    const prevMonthlyTargets = { '2002': { tCrewLabor: 0.28 } };
    const cloudLatest = {};
    const merged = { ...prevMonthlyTargets, ...(cloudLatest || {}) };
    expect(merged).toEqual(prevMonthlyTargets);
  });
});
