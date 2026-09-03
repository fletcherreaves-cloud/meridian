// @vitest-environment happy-dom
// @ts-nocheck
// engine/monthly-targets-v2.js had zero test coverage despite being live, unconditionally-mounted
// code: App.js imports ymKey/loadTargetsV2/migrateTargetsToV2 directly into a mount-time migration
// effect (see the file's own header comment on why it was split out of store-dash.js), and
// store-dash.js reuses the same functions for its targets CRUD. Pure localStorage helpers,
// deterministic, no owner input needed.
import { describe, it, expect, beforeEach } from 'vitest';
import { ymKey, loadTargetsV2, saveTargetsV2, migrateTargetsToV2 } from '../engine/monthly-targets-v2.js';

beforeEach(() => { localStorage.clear(); });

describe('ymKey', () => {
  it('formats a Date as YYYY-MM, zero-padding single-digit months', () => {
    expect(ymKey(new Date('2026-01-15T12:00:00'))).toBe('2026-01');
    expect(ymKey(new Date('2026-11-03T12:00:00'))).toBe('2026-11');
  });

  it('accepts a date string or timestamp, not just a Date object', () => {
    expect(ymKey('2026-03-05T00:00:00')).toBe('2026-03');
  });

  it('defaults to the current date when called with no argument', () => {
    const now = new Date();
    const expected = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
    expect(ymKey()).toBe(expected);
  });
});

describe('loadTargetsV2 / saveTargetsV2', () => {
  it('returns {} when nothing has been saved yet', () => {
    expect(loadTargetsV2()).toEqual({});
  });

  it('round-trips data written by saveTargetsV2', () => {
    const data = { '2026-08': { '3708': { tOepe: 110 } } };
    expect(saveTargetsV2(data)).toBe(true);
    expect(loadTargetsV2()).toEqual(data);
  });

  it('returns {} instead of throwing when localStorage holds malformed JSON', () => {
    localStorage.setItem('mf_targets_v2', 'not valid json{{{');
    expect(loadTargetsV2()).toEqual({});
  });
});

describe('migrateTargetsToV2', () => {
  it('migrates a flat userTargets object into the v2 shape for the given month', () => {
    migrateTargetsToV2({ '3708': { tOepe: 110 }, '6178': { tOepe: 95 } }, '2026-08');
    expect(loadTargetsV2()).toEqual({
      '2026-08': { '3708': { tOepe: 110 }, '6178': { tOepe: 95 } },
    });
  });

  it('does nothing when userTargets is empty or missing', () => {
    migrateTargetsToV2({}, '2026-08');
    expect(loadTargetsV2()).toEqual({});
    migrateTargetsToV2(null, '2026-08');
    expect(loadTargetsV2()).toEqual({});
    migrateTargetsToV2(undefined, '2026-08');
    expect(loadTargetsV2()).toEqual({});
  });

  it('is a no-op (does not overwrite) when that month already has v2 data', () => {
    saveTargetsV2({ '2026-08': { '3708': { tOepe: 999 } } });
    migrateTargetsToV2({ '3708': { tOepe: 110 } }, '2026-08');
    expect(loadTargetsV2()['2026-08']['3708'].tOepe).toBe(999);
  });

  it('skips falsy or non-object per-loc target entries', () => {
    migrateTargetsToV2({ '3708': { tOepe: 110 }, '9999': null, '': { tOepe: 50 } }, '2026-08');
    const v2 = loadTargetsV2();
    expect(Object.keys(v2['2026-08'])).toEqual(['3708']);
  });

  it('copies each loc\'s targets object rather than aliasing the input reference', () => {
    const original = { tOepe: 110 };
    migrateTargetsToV2({ '3708': original }, '2026-08');
    const stored = loadTargetsV2()['2026-08']['3708'];
    expect(stored).toEqual(original);
    expect(stored).not.toBe(original);
  });
});
