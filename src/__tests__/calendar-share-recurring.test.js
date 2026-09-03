// @vitest-environment happy-dom
// @ts-nocheck
// features/calendar.js's share-code encode/decode and recurring-rule expansion/confirmation
// helpers had zero test coverage despite being live: App.js imports expandRecurringRule/
// getRecurringInstancesNeedingConfirm/decodeShareCode directly (the pending-review useEffect
// that drives the "confirm this recurring event" prompt), and encodeShareCode/decodeShareCode
// are the whole share-link mechanism (btoa/atob round-trip with UTF-8 support so an apostrophe
// in a store name survives).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { encodeShareCode, decodeShareCode, expandRecurringRule, getRecurringInstancesNeedingConfirm } from '../features/calendar.js';

describe('encodeShareCode / decodeShareCode', () => {
  it('round-trips a payload exactly, including a UTF-8 apostrophe in a store name', () => {
    const payload = { v: 1, from: "Mario's-3708", locs: ['3708', '6178'], start: '2026-09-01', end: '2026-09-03', type: 'promo', label: "Manager's Special", notes: 'test', ts: 123456 };
    const code = encodeShareCode(payload);
    expect(code).toBeTruthy();
    expect(decodeShareCode(code)).toEqual(payload);
  });

  it('produces a URL-safe code with no +, /, or trailing =', () => {
    const code = encodeShareCode({ v: 1, locs: ['3708'], start: '2026-09-01', type: 'promo', label: 'x' });
    expect(code).not.toMatch(/[+/=]/);
  });

  it('decodeShareCode returns null for malformed input', () => {
    expect(decodeShareCode('not-valid-base64!!!')).toBeNull();
  });

  it('decodeShareCode returns null when a required field (v/locs/start/type/label) is missing', () => {
    const noLabel = encodeShareCode({ v: 1, locs: ['3708'], start: '2026-09-01', type: 'promo' });
    expect(decodeShareCode(noLabel)).toBeNull();

    const emptyLocs = encodeShareCode({ v: 1, locs: [], start: '2026-09-01', type: 'promo', label: 'x' });
    // locs must be an Array (it is, even empty) -- this should still decode successfully;
    // the null-guard only checks Array.isArray, not non-empty. Confirms the exact guard shape.
    expect(decodeShareCode(emptyLocs)).not.toBeNull();
  });
});

describe('expandRecurringRule', () => {
  it('returns null when the rule or its month/day is missing', () => {
    expect(expandRecurringRule(null, 2026)).toBeNull();
    expect(expandRecurringRule({ day: 15 }, 2026)).toBeNull();
    expect(expandRecurringRule({ month: 6 }, 2026)).toBeNull();
  });

  it('computes a single-day span when durationDays is 1 or omitted', () => {
    const span = expandRecurringRule({ month: 6, day: 1 }, 2026);
    expect(span.start.getFullYear()).toBe(2026);
    expect(span.start.getMonth()).toBe(5); // 0-indexed
    expect(span.start.getDate()).toBe(1);
    expect(span.end.getDate()).toBe(1);
  });

  it('computes a multi-day span extending durationDays-1 days past start', () => {
    const span = expandRecurringRule({ month: 6, day: 1, durationDays: 3 }, 2026);
    expect(span.start.getDate()).toBe(1);
    expect(span.end.getDate()).toBe(3);
  });

  it('floors durationDays at 1 (never a zero/negative-length span)', () => {
    const span = expandRecurringRule({ month: 6, day: 1, durationDays: 0 }, 2026);
    expect(span.start.getDate()).toBe(span.end.getDate());
  });
});

describe('getRecurringInstancesNeedingConfirm', () => {
  const FROZEN_NOW = new Date('2026-03-15T12:00:00');
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(FROZEN_NOW); });
  afterEach(() => { vi.useRealTimers(); });

  it('returns [] when there are no rules', () => {
    expect(getRecurringInstancesNeedingConfirm([], {})).toEqual([]);
  });

  it('skips a rule explicitly marked inactive, even with no tagged days', () => {
    const rules = [{ id: 'r1', label: 'Summer Promo', type: 'promo', locs: ['3708'], month: 6, day: 1, durationDays: 1, active: false }];
    expect(getRecurringInstancesNeedingConfirm(rules, {})).toEqual([]);
  });

  it('does not flag a rule whose target days are already fully tagged for all its locs', () => {
    const rules = [{ id: 'r1', label: 'Summer Promo', type: 'promo', locs: ['3708'], month: 6, day: 1, durationDays: 1, active: true }];
    const userEvents = { '3708': { '2026-06-01': true, '2027-06-01': true } };
    expect(getRecurringInstancesNeedingConfirm(rules, userEvents)).toEqual([]);
  });

  it('flags a rule with an untagged loc, naming that loc as needing confirmation', () => {
    const rules = [{ id: 'r1', label: 'Summer Promo', type: 'promo', locs: ['3708'], month: 6, day: 1, durationDays: 1, active: true }];
    const out = getRecurringInstancesNeedingConfirm(rules, {});
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].ruleId).toBe('r1');
    expect(out[0].locs).toContain('3708');
  });

  it('only lists the untagged loc when one of two locs is already fully tagged', () => {
    const rules = [{ id: 'r1', label: 'Summer Promo', type: 'promo', locs: ['3708', '6178'], month: 6, day: 1, durationDays: 1, active: true }];
    const userEvents = { '3708': { '2026-06-01': true, '2027-06-01': true } }; // 6178 untagged
    const out = getRecurringInstancesNeedingConfirm(rules, userEvents);
    const flaggedLocs = out.flatMap(o => o.locs);
    expect(flaggedLocs).toContain('6178');
    expect(flaggedLocs).not.toContain('3708');
  });
});
