// @ts-nocheck
// scripts/_pipeline-contract.mjs (dispatch #32, Workstream C) — the two pieces of the
// pipeline contract that don't exist anywhere in this repo yet: unconditional per-
// partition success-coverage logging (pull-outcome.mjs's tracker only logs failures) and
// a freshness SLA checker (genuinely new). No supabase/fetch dependency, cheap to test
// directly — same reasoning pull-outcome.test.js already gives for testing its module.
import { describe, it, expect } from 'vitest';
import { logPartitionCoverage, checkFreshness } from '../../scripts/_pipeline-contract.mjs';

describe('logPartitionCoverage', () => {
  it('reports full coverage and no missing list when every partition had a row', () => {
    const covered = new Set(['a', 'b', 'c']);
    const r = logPartitionCoverage(covered, ['a', 'b', 'c'], { log: () => {}, warn: () => {} });
    expect(r).toEqual({ covered: 3, total: 3, missing: [] });
  });

  it('names the missing partitions on a partial run', () => {
    const covered = new Set(['a', 'c']);
    const warned = [];
    const r = logPartitionCoverage(covered, ['a', 'b', 'c', 'd'], { warn: m => warned.push(m), log: () => {} });
    expect(r).toEqual({ covered: 2, total: 4, missing: ['b', 'd'] });
    expect(warned.length).toBe(1);
    expect(warned[0]).toContain('b');
    expect(warned[0]).toContain('d');
  });

  it('does not warn when coverage is zero (that is assertNonZero/pull-outcome\'s job, not this one\'s)', () => {
    const covered = new Set();
    const warned = [];
    const r = logPartitionCoverage(covered, ['a', 'b'], { warn: m => warned.push(m), log: () => {} });
    expect(r).toEqual({ covered: 0, total: 2, missing: ['a', 'b'] });
    expect(warned.length).toBe(0);
  });

  it('always logs the coverage line, not just on partial/failed runs', () => {
    const logged = [];
    logPartitionCoverage(new Set(['a']), ['a'], { log: m => logged.push(m), warn: () => {} });
    expect(logged.length).toBe(1);
    expect(logged[0]).toContain('1/1');
  });
});

describe('checkFreshness', () => {
  const now = new Date('2026-08-19T12:00:00Z');

  it('is ok well within the warn threshold', () => {
    const r = checkFreshness('2026-08-19T00:00:00Z', { warnAfterHours: 24, errorAfterHours: 48, now });
    expect(r.status).toBe('ok');
    expect(r.message).toBeNull();
    expect(r.ageHours).toBeCloseTo(12, 1);
  });

  it('warns once past warnAfterHours but under errorAfterHours', () => {
    const r = checkFreshness('2026-08-18T06:00:00Z', { warnAfterHours: 24, errorAfterHours: 48, now });
    expect(r.status).toBe('warn');
    expect(r.message).toContain('warn');
    expect(r.ageHours).toBeCloseTo(30, 1);
  });

  it('errors past errorAfterHours', () => {
    const r = checkFreshness('2026-08-10T12:00:00Z', { warnAfterHours: 24, errorAfterHours: 48, now });
    expect(r.status).toBe('error');
    expect(r.message).toContain('error');
  });

  it('errors on null/undefined (no known-good data at all) instead of computing a bogus age', () => {
    const r = checkFreshness(null, { now });
    expect(r.status).toBe('error');
    expect(r.ageHours).toBeNull();
    expect(r.message).toContain('no known-good data');
  });

  it('errors on an unparseable timestamp rather than throwing or returning NaN silently', () => {
    const r = checkFreshness('not-a-date', { now });
    expect(r.status).toBe('error');
    expect(r.ageHours).toBeNull();
    expect(r.message).toContain('unparseable');
  });

  it('accepts a Date instance, not just an ISO string', () => {
    const r = checkFreshness(new Date('2026-08-19T00:00:00Z'), { warnAfterHours: 24, errorAfterHours: 48, now });
    expect(r.status).toBe('ok');
  });
});
