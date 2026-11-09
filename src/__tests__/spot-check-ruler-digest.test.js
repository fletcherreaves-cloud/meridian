// @ts-nocheck
// Task #129 — scripts/spot-check-ruler-digest.mjs's pure functions. Real behavioral tests, not
// source-text regexes, per CLAUDE.md's "would this verification still pass if reverted" rule.
//
// No dummy env vars needed: the script's module-scope `supabase` const goes through
// safeCreateClient (scripts/lib/safe-supabase-client.mjs), which never throws regardless of what's
// in process.env at import time — same precedent weekly-cycle-digest-send.test.js already relies on.
import { describe, it, expect } from 'vitest';
import { scheduleGatePasses, buildDigestEmailHtml, buildStoreRuler } from '../../scripts/spot-check-ruler-digest.mjs';

describe('scheduleGatePasses — the SAGE-pattern configurable schedule gate', () => {
  const cfg = { enabled: true, dowUtc: 1, hourUtc: 12, topN: 3 }; // Monday 12:00 UTC

  it('true when both the day-of-week and hour match', () => {
    // 2026-11-09 is a Monday.
    expect(scheduleGatePasses(cfg, new Date('2026-11-09T12:30:00Z'))).toBe(true);
  });
  it('false when the hour matches but the day does not', () => {
    expect(scheduleGatePasses(cfg, new Date('2026-11-10T12:30:00Z'))).toBe(false); // Tuesday
  });
  it('false when the day matches but the hour does not', () => {
    expect(scheduleGatePasses(cfg, new Date('2026-11-09T09:00:00Z'))).toBe(false);
  });
  it('false when disabled, even at the exact configured moment', () => {
    expect(scheduleGatePasses({ ...cfg, enabled: false }, new Date('2026-11-09T12:30:00Z'))).toBe(false);
  });
  it('force=true always passes regardless of day/hour/enabled', () => {
    expect(scheduleGatePasses({ ...cfg, enabled: false }, new Date('2026-11-10T09:00:00Z'), true)).toBe(true);
  });
  it('a changed dowUtc/hourUtc (the whole point — no YAML edit needed) takes effect immediately', () => {
    const tuesdayNoon = { enabled: true, dowUtc: 2, hourUtc: 14 };
    expect(scheduleGatePasses(tuesdayNoon, new Date('2026-11-10T14:05:00Z'))).toBe(true);
    expect(scheduleGatePasses(cfg, new Date('2026-11-10T14:05:00Z'))).toBe(false);
  });
});

describe('buildDigestEmailHtml — the ranked deep-dive list', () => {
  const ruler = (loc, storeName, swingPts, flagged, impossibleCount = 0) => ({
    loc, storeName, periodType: 'weekly', countDate: '2026-11-07',
    counterfactual: { swingPts, flagged, topMovers: [{ descr: 'Nuggets' }, { descr: 'Beef Steak' }] },
    impossibilities: Array.from({ length: impossibleCount }, (_, i) => ({ rule: 'negative-on-hand', wrin: `x${i}` })),
  });

  it('lists every store with its swing, flag word, and top movers', () => {
    const { subject, html } = buildDigestEmailHtml([ruler('13113', 'Madill', 1.72, true)], '2026-10');
    expect(subject).toMatch(/2026-10/);
    expect(html).toContain('Madill');
    expect(html).toContain('+1.72pp');
    expect(html).toContain('⚠ flagged');
    expect(html).toContain('Nuggets');
  });
  it('a hard impossibility reads distinctly from a target-masking flag', () => {
    const { html } = buildDigestEmailHtml([ruler('13113', 'Madill', 0.2, false, 1)], '2026-10');
    expect(html).toContain('🚫 impossible value');
  });
  it('a quiet store (no flag, small swing) still renders without crashing', () => {
    const { html } = buildDigestEmailHtml([ruler('13113', 'Madill', 0.05, false)], '2026-10');
    expect(html).toContain('Madill');
    expect(html).toContain('—'); // flag column reads as a plain dash, not fabricated
  });
});

describe('buildStoreRuler — returns null when there is nothing to spot-check yet', () => {
  it('no qualifying session on record this period -> null, not a fabricated worksheet', async () => {
    const result = await buildStoreRuler('0013113', '2026-10', {
      varianceByLoc: {}, sessionLogRows: [], topN: 3,
    });
    expect(result).toBeNull();
  });

  // Code-review finding (2026-11-09): a qualifying session from a DIFFERENT, older period must
  // never be accepted as this period's own worksheet — sessionLogRows carries the prior month
  // too (for recount-detection's own lookback), and pairing a prior-month countDate with this
  // period's FOB window would produce an internally inconsistent row.
  it('a qualifying session that lands in the PRIOR period only is not mistaken for this period\'s', async () => {
    const sessionLogRows = [
      { loc: '0013113', countDate: '2026-09-28', cls: 'Food', period: '2026-09', itemsCounted: 50, classTotal: 50, covered: true },
      { loc: '0013113', countDate: '2026-09-28', cls: 'Condiment', period: '2026-09', itemsCounted: 20, classTotal: 20, covered: true },
    ];
    const result = await buildStoreRuler('0013113', '2026-10', { varianceByLoc: {}, sessionLogRows, topN: 3 });
    expect(result).toBeNull();
  });
});
