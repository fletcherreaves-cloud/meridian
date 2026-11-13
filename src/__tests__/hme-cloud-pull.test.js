// @ts-nocheck
// Tests of hme-cloud-pull.mjs's exported pure helpers (task #105). padLoc() is the one piece
// of real, test-worthy logic a dry run against real stores confirmed live 2026-11-12
// (24-store getAllStores/getDashboardData responses, e.g. storeNumber "6838" -> Meridian's
// own 7-char zero-padded "0006838"). hmeLogin/getDashboardData hit the real HME Cloud API and
// are not called here -- that live chain was validated manually against real credentials
// before this script was committed; see memory/finding-hme-squadle-integration-2026-11-06.md.
import { describe, it, expect } from 'vitest';
import { padLoc } from '../../scripts/hme-cloud-pull.mjs';

describe('padLoc (hme-cloud-pull.mjs)', () => {
  it('zero-pads a real HME storeNumber to Meridian\'s 7-char loc convention', () => {
    expect(padLoc('6838')).toBe('0006838');
    expect(padLoc('43380')).toBe('0043380');
    expect(padLoc(5183)).toBe('0005183');
  });
  it('strips any non-digit characters before padding', () => {
    expect(padLoc('  6838 ')).toBe('0006838');
  });
  it('returns null for empty/missing input rather than a misleading "0000000"', () => {
    expect(padLoc(null)).toBeNull();
    expect(padLoc(undefined)).toBeNull();
    expect(padLoc('')).toBeNull();
  });
});
