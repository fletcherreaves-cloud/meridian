// @ts-nocheck
// Structural guard for the standing auto-first rule.
//
// The rule (CLAUDE.md, memory/data-sourcing-standard.md): every metric must be fed by an
// auto-pulled or emailed cloud stream. Manual uploads are LAST-RESORT FILL ONLY — they may
// fill a (loc, date) the cloud does not cover yet, but must NEVER override auto data.
//
// On 2026-08-08 the resolver violated this in 30 of its 35 multi-source chains, and the
// file header documented the inverted doctrine as if it were intended. The violation was
// invisible because it only shows up as wrongness when both tiers cover the same day —
// measured live: labor_rows stopped at 2026-07-23 while qsr_daily_activity_rollup ran
// through 2026-08-08, so 16 days resolved to nothing at all and the days before that
// silently preferred the manual value.
//
// A one-time reorder does not hold. This test makes the ordering structural: adding a chain
// with a manual source ahead of an auto one fails the build.

import { describe, it, expect } from 'vitest';
import { METRIC_SOURCES, MANUAL_FED_SOURCES } from '../engine/metric-source.js';

const isManual = s => MANUAL_FED_SOURCES.includes(s);

describe('METRIC_SOURCES — auto-first ordering', () => {
  it('no chain places a manual-fed stream ahead of an auto stream', () => {
    const violations = [];

    for (const [metric, def] of Object.entries(METRIC_SOURCES)) {
      const chain = (def.srcs || []).map(([s]) => s);
      const firstAuto  = chain.findIndex(s => !isManual(s));
      const lastManual = chain.map(isManual).lastIndexOf(true);

      if (firstAuto >= 0 && lastManual >= 0 && lastManual < firstAuto) {
        violations.push(`${metric}: ${chain.map(s => isManual(s) ? `[${s}]` : s).join(' -> ')}`);
      }
    }

    expect(violations, `manual stream ordered ahead of auto ([brackets] = manual):\n  ${violations.join('\n  ')}`)
      .toEqual([]);
  });

  it('every source named in a chain is classified — no unknown streams', () => {
    // If a new stream is added and nobody decides whether it is auto or manual, the test
    // above would silently treat it as auto and pass. Force the decision.
    const KNOWN_AUTO = [
      'qsrActSummaryRows', 'glimpseRows', 'cashRows', 'salesLedgerRows',
      'opsCashRows', 'opsLaborRows', 'opsServiceRows', 'schedRows',
    ];
    const classified = new Set([...KNOWN_AUTO, ...MANUAL_FED_SOURCES]);

    const unknown = new Set();
    for (const def of Object.values(METRIC_SOURCES))
      for (const [s] of (def.srcs || [])) if (!classified.has(s)) unknown.add(s);

    expect([...unknown], 'unclassified stream(s) — add to MANUAL_FED_SOURCES or KNOWN_AUTO here')
      .toEqual([]);
  });

  it('the manual-fed list itself is non-empty and frozen', () => {
    // A well-meaning "cleanup" that empties this list would make the ordering test vacuous:
    // with nothing classified as manual there can be no violation, and it would pass forever.
    expect(MANUAL_FED_SOURCES.length).toBeGreaterThan(0);
    expect(Object.isFrozen(MANUAL_FED_SOURCES)).toBe(true);
    expect(MANUAL_FED_SOURCES).toContain('laborRows');
    expect(MANUAL_FED_SOURCES).toContain('ctrlRows');
  });

  it('auto sources keep their deliberate relative order (labour % stays Glimpse-first)', () => {
    // The reorder was a stable partition, so ordering AMONG auto sources is untouched. That
    // matters: laborPct prefers Glimpse because Glimpse is confirmed PUNCHED, while a manual
    // Controls upload from before the 2026-08-03 parser fix can hold a non-punched value.
    const chain = METRIC_SOURCES.laborPct.srcs.map(([s]) => s);
    const autoOnly = chain.filter(s => !isManual(s));

    expect(autoOnly[0]).toBe('glimpseRows');
    expect(chain.filter(isManual).every((_, i) => chain.indexOf(chain.filter(isManual)[i]) >= autoOnly.length)).toBe(true);
  });
});
