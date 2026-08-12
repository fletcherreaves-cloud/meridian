// @ts-nocheck
// Companion to changelog-version.test.js's source-parse guard (which only asserts the sort call
// exists in changelog-panel.js) — this exercises versionSort's actual comparator behavior, since
// changelog-data.js's array is append-only now and display order depends entirely on this
// function being correct, not on storage order. See changelog-data.js's header for why.
import { describe, it, expect } from 'vitest';
import { versionSort } from '../app/changelog-panel.js';

const e = version => ({ version, date: '2026-01-01', changes: [] });

describe('changelog-panel versionSort', () => {
  it('sorts descending by major version', () => {
    const sorted = [e('4.999'), e('5.002'), e('5.000')].sort(versionSort);
    expect(sorted.map(x => x.version)).toEqual(['5.002', '5.000', '4.999']);
  });

  it('compares minor version numerically, not lexicographically (5.10 > 5.9)', () => {
    const sorted = [e('5.9'), e('5.10')].sort(versionSort);
    expect(sorted.map(x => x.version)).toEqual(['5.10', '5.9']);
  });

  it('is stable-safe for equal versions (no crash, order unchanged for duplicates)', () => {
    const sorted = [e('5.001'), e('5.001')].sort(versionSort);
    expect(sorted.map(x => x.version)).toEqual(['5.001', '5.001']);
  });

  it('handles an already-append-only (unsorted) array correctly', () => {
    // The exact shape this fix targets: entries land in commit order, not version order.
    const appendOrder = [e('5.000'), e('5.004'), e('5.001'), e('5.003'), e('5.002')];
    const sorted = appendOrder.sort(versionSort);
    expect(sorted.map(x => x.version)).toEqual(['5.004', '5.003', '5.002', '5.001', '5.000']);
  });
});
