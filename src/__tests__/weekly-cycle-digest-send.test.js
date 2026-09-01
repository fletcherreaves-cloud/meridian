// @ts-nocheck
// 2026-09-01 (owner req, verbatim): "I would also like to see the automatic emails work with
// weekly counts." Real behavioral tests of scripts/weekly-cycle-digest-send.mjs's pure functions
// (not source-text regexes), per CLAUDE.md's "would this verification still pass if reverted"
// standing rule.
//
// No dummy env vars needed: the script's module-scope `supabase` const goes through
// safeCreateClient (scripts/lib/safe-supabase-client.mjs), which never throws regardless of what's
// in process.env at import time.
import { describe, it, expect } from 'vitest';
import { hourGatePasses, buildWeeklyDigestEmail, DEFAULT_WEEKLY_DIGEST_CONFIG } from '../../scripts/weekly-cycle-digest-send.mjs';
import { cycleCompliance } from '../engine/count-cycle.js';

describe('hourGatePasses — self-gate on the configured send hour (mirrors eom-digest-send.mjs)', () => {
  it('true when the current UTC hour matches', () => {
    expect(hourGatePasses(23, new Date('2026-09-01T23:15:00Z'))).toBe(true);
  });
  it('false when it does not match', () => {
    expect(hourGatePasses(23, new Date('2026-09-01T10:00:00Z'))).toBe(false);
  });
  it('force=true always passes regardless of the hour', () => {
    expect(hourGatePasses(23, new Date('2026-09-01T10:00:00Z'), true)).toBe(true);
  });
  it('DEFAULT_WEEKLY_DIGEST_CONFIG has a real sendHourUtc, not left undefined', () => {
    expect(Number.isInteger(DEFAULT_WEEKLY_DIGEST_CONFIG.sendHourUtc)).toBe(true);
  });
});

describe('buildWeeklyDigestEmail — real cycleCompliance() rows, not a hand-built shape', () => {
  const mk = (loc, cls, n, date) => Array.from({ length: n }, (_, i) => ({ loc, cls, wrin: `${cls}-${i}`, last_counted: date }));

  it('a mix of statuses sorts critical first, tallies the header counts, and includes each store\'s own compliance line', () => {
    // Store A: full weekly count today -> on cycle.
    const rowsA = [...mk('A', 'Food', 118, '2026-09-01'), ...mk('A', 'Condiment', 36, '2026-09-01')];
    // Store B: only a stale count nearly two weeks ago -> overdue/critical.
    const rowsB = [...mk('B', 'Food', 118, '2026-08-19'), ...mk('B', 'Condiment', 36, '2026-08-19')];
    const compliance = cycleCompliance([...rowsA, ...rowsB], { asOf: '2026-09-01' });
    const byLoc = {}; for (const c of compliance) byLoc[c.loc] = c;

    const storesToday = [
      { name: 'Store A', c: byLoc['A'] },
      { name: 'Store B', c: byLoc['B'] },
    ];
    const { subject, html } = buildWeeklyDigestEmail(storesToday, '2026-09-01');

    expect(subject).toMatch(/2 stores today/);
    expect(html).toMatch(/1 critical/);
    expect(html).toMatch(/1 on cycle/);
    // Critical store (B) must be listed before the on-cycle store (A) -- worth chasing first.
    expect(html.indexOf('Store B')).toBeLessThan(html.indexOf('Store A'));
    expect(html).toMatch(/Store A/);
    expect(html).toMatch(/Store B/);
    expect(html).toMatch(/On cycle/);
    expect(html).toMatch(/Critical/);
  });

  it('zero stores expected today still produces a valid, non-crashing email body', () => {
    const { subject, html } = buildWeeklyDigestEmail([], '2026-09-01');
    expect(subject).toMatch(/0 stores today/);
    expect(html).toMatch(/No store.s detected weekly count day is today/);
  });
});
