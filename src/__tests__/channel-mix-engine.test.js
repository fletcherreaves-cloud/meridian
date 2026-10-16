// Reports redesign Phase 5 -- engine/channel-mix.js
import { describe, it, expect } from 'vitest';
import { buildChannelMixReport, CHANNEL_MIX_METRICS } from '../engine/channel-mix.js';

const D = (d) => new Date(2026, 9, 1 + d); // Oct 1, 2026 + d days

describe('buildChannelMixReport', () => {
  const range = { s: '2026-10-01', e: '2026-10-10' };
  const ds = {
    salesLedgerRows: [
      // DT % rises from .50 (first half) to .60 (second half) -- a real +10pt trend
      ...[0, 1, 2, 3, 4].map(d => ({ loc: '3708', date: D(d), dtPctTotal: 0.50, delivPctTotal: 0.10, mopPctTotal: 0.05, kioskPctTotal: 0.02, fcPctTotal: 0.33 })),
      ...[5, 6, 7, 8, 9].map(d => ({ loc: '3708', date: D(d), dtPctTotal: 0.60, delivPctTotal: 0.10, mopPctTotal: 0.05, kioskPctTotal: 0.02, fcPctTotal: 0.23 })),
    ],
    storeIds: ['3708'],
  };

  it('returns [] when range is missing', () => {
    expect(buildChannelMixReport(ds, { locs: ['3708'], range: null })).toEqual([]);
  });

  it('resolves the period average for every channel metric', () => {
    const rows = buildChannelMixReport(ds, { locs: ['3708'], range });
    expect(rows).toHaveLength(1);
    const r = rows[0];
    expect(r.name).toBe('Ardmore-Broadway');
    expect(r.slDtPct).toBeCloseTo(0.55, 5); // mean of .50*5 + .60*5
    expect(r.slDelivPct).toBeCloseTo(0.10, 5);
  });

  it('computes a real first-half-vs-second-half trend, in percentage points', () => {
    const rows = buildChannelMixReport(ds, { locs: ['3708'], range });
    const r = rows[0];
    expect(r.slDtPctTrendPts).toBeCloseTo(10, 1); // .50 -> .60 = +10 points
    expect(r.slDelivPctTrendPts).toBeCloseTo(0, 5); // flat
    expect(r.slFcPctTrendPts).toBeCloseTo(-10, 1); // .33 -> .23 = -10 points
  });

  it('falls back to ds.storeIds when no locs given', () => {
    const rows = buildChannelMixReport(ds, { locs: [], range });
    expect(rows.map(r => r.loc)).toEqual(['3708']);
  });

  it('every channel metric key appears on the row, with its own Trend key', () => {
    const rows = buildChannelMixReport(ds, { locs: ['3708'], range });
    for (const m of CHANNEL_MIX_METRICS) {
      expect(rows[0]).toHaveProperty(m.key);
      expect(rows[0]).toHaveProperty(m.key + 'TrendPts');
    }
  });
});
