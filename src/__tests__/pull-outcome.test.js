// @ts-nocheck
// scripts/lib/pull-outcome.mjs (#263) is the shared failure-tracker every QSRSoft/
// LifeLenz pull script now uses to decide its own exit code. It has no supabase/fetch
// dependency, so it's cheap to test directly rather than trusting seven hand-wired
// call sites to each get the three exit conditions right.
import { describe, it, expect } from 'vitest';
import { makeOutcomeTracker } from '../../scripts/lib/pull-outcome.mjs';

describe('makeOutcomeTracker', () => {
  it('exits 0 when nothing failed and rows were saved', () => {
    const t = makeOutcomeTracker('test');
    const code = t.finalize({ requestedUnits: ['a', 'b', 'c'], totalSaved: 10 });
    expect(code).toBe(0);
  });

  it('exits 0 on an empty requested scope (nothing to fail)', () => {
    const t = makeOutcomeTracker('test');
    const code = t.finalize({ requestedUnits: [], totalSaved: 0 });
    expect(code).toBe(0);
  });

  it('exits 1 when zero rows saved across a non-empty scope, even with no tracked failures', () => {
    const t = makeOutcomeTracker('test');
    const code = t.finalize({ requestedUnits: ['a', 'b'], totalSaved: 0 });
    expect(code).toBe(1);
  });

  it('tolerates a low failure rate under the threshold (rows still saved)', () => {
    const t = makeOutcomeTracker('test');
    t.fail('a', 'flaky timeout');
    const code = t.finalize({ requestedUnits: Array.from({ length: 10 }, (_, i) => i), totalSaved: 50 });
    expect(code).toBe(0); // 1/10 = 10%, under the 25% default
  });

  it('exits 1 when the failure rate exceeds the threshold', () => {
    const t = makeOutcomeTracker('test');
    for (const u of ['a', 'b', 'c']) t.fail(u, 'error');
    const code = t.finalize({ requestedUnits: ['a', 'b', 'c', 'd'], totalSaved: 5 });
    expect(code).toBe(1); // 3/4 = 75%
  });

  it('respects a custom failThresholdPct', () => {
    const t = makeOutcomeTracker('test', { failThresholdPct: 0.5 });
    t.fail('a', 'error');
    const code = t.finalize({ requestedUnits: ['a', 'b'], totalSaved: 5 });
    expect(code).toBe(0); // 1/2 = 50%, not > 50%
  });

  it('formatRerun is only invoked when something failed, and receives the failed units', () => {
    const t = makeOutcomeTracker('test');
    t.fail('2026-08-10', 'HTTP 500');
    t.fail('2026-08-11', 'timeout');
    let seen = null;
    t.finalize({
      requestedUnits: ['2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12', '2026-08-13'],
      totalSaved: 100,
      formatRerun: units => { seen = units; return units.join(','); },
    });
    expect(seen).toEqual(['2026-08-10', '2026-08-11']);
  });

  it('failedUnits() exposes the recorded failures for callers that need them directly', () => {
    const t = makeOutcomeTracker('test');
    t.fail('x', 'boom');
    expect(t.failedUnits()).toEqual(['x']);
  });
});
