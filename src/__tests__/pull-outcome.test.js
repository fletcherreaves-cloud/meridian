// @ts-nocheck
// scripts/lib/pull-outcome.mjs (#263) is the shared failure-tracker every QSRSoft/
// LifeLenz pull script now uses to decide its own exit code. It has no supabase/fetch
// dependency, so it's cheap to test directly rather than trusting seven hand-wired
// call sites to each get the three exit conditions right.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, rmSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
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

describe('makeOutcomeTracker — QSRSOFT_BACKFILL_PROBE opt-in (dispatch 2026-10-17)', () => {
  afterEach(() => {
    delete process.env.QSRSOFT_BACKFILL_PROBE;
    delete process.env.QSRSOFT_BACKFILL_OUTCOME_FILE;
  });

  it('still exits 1 on zero rows when the probe flag is unset -- every existing scheduled pull is unaffected', () => {
    const t = makeOutcomeTracker('test');
    const code = t.finalize({ requestedUnits: ['a', 'b'], totalSaved: 0 });
    expect(code).toBe(1);
  });

  it('exits 0 on zero rows + zero failures when QSRSOFT_BACKFILL_PROBE=1 -- a confirmed-empty historical chunk', () => {
    process.env.QSRSOFT_BACKFILL_PROBE = '1';
    const t = makeOutcomeTracker('test');
    const code = t.finalize({ requestedUnits: ['2018-02-01', '2018-02-02'], totalSaved: 0 });
    expect(code).toBe(0);
  });

  it('still exits 1 when QSRSOFT_BACKFILL_PROBE=1 but real per-unit failures were recorded -- probe mode never masks a real error', () => {
    process.env.QSRSOFT_BACKFILL_PROBE = '1';
    const t = makeOutcomeTracker('test');
    t.fail('2018-02-01', 'HTTP 500');
    const code = t.finalize({ requestedUnits: ['2018-02-01', '2018-02-02'], totalSaved: 0 });
    expect(code).toBe(1);
  });

  it('still exits 1 on a non-empty-rows failure rate breach even with the probe flag set', () => {
    process.env.QSRSOFT_BACKFILL_PROBE = '1';
    const t = makeOutcomeTracker('test');
    for (const u of ['a', 'b', 'c']) t.fail(u, 'error');
    const code = t.finalize({ requestedUnits: ['a', 'b', 'c', 'd'], totalSaved: 5 });
    expect(code).toBe(1); // 75% failure rate, rows were saved so the zero-rows branch never applies
  });

  it('writes the outcome sidecar file with totalSaved when QSRSOFT_BACKFILL_OUTCOME_FILE is set', () => {
    const file = path.join(os.tmpdir(), `pull-outcome-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    process.env.QSRSOFT_BACKFILL_OUTCOME_FILE = file;
    try {
      const t = makeOutcomeTracker('test');
      t.finalize({ requestedUnits: ['a', 'b'], totalSaved: 42 });
      expect(existsSync(file)).toBe(true);
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      expect(parsed).toMatchObject({ label: 'test', requested: 2, failedCount: 0, totalSaved: 42 });
    } finally {
      rmSync(file, { force: true });
    }
  });

  it('writes totalSaved: 0 to the sidecar for a confirmed-empty probe chunk, distinguishing it from a real error exit', () => {
    const file = path.join(os.tmpdir(), `pull-outcome-test-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    process.env.QSRSOFT_BACKFILL_PROBE = '1';
    process.env.QSRSOFT_BACKFILL_OUTCOME_FILE = file;
    try {
      const t = makeOutcomeTracker('test');
      const code = t.finalize({ requestedUnits: ['2018-02-01'], totalSaved: 0 });
      expect(code).toBe(0);
      const parsed = JSON.parse(readFileSync(file, 'utf8'));
      expect(parsed.totalSaved).toBe(0);
    } finally {
      rmSync(file, { force: true });
    }
  });
});
