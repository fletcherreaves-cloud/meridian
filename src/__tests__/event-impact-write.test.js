// @ts-nocheck
// scripts/lib/event-impact-write.mjs's mergeSalesAndGcWrites had zero test coverage despite
// being live-consumed by all three event-impact measurement scripts (measure-retail-impact.mjs,
// measure-holiday-impact.mjs, measure-tagged-event-impact.mjs). Pure merge/gating logic: a store
// can carry sales lift without GC lift or vice versa depending on which source covers its dates
// (dispatch #108's verification bar), gated independently per metric by minN.
import { describe, it, expect } from 'vitest';
import { mergeSalesAndGcWrites } from '../../scripts/lib/event-impact-write.mjs';

const salesShrunk = { '3708': { shrunk: 0.05, measured: 0.06, n: 10 } };
const gcShrunk = { '3708': { shrunk: 0.03, measured: 0.04, n: 8 } };

describe('mergeSalesAndGcWrites', () => {
  it('returns null when neither metric meets the minN bar for that loc', () => {
    const row = mergeSalesAndGcWrites({ loc: '9999', eventType: 'holiday', salesShrunk, gcShrunk, minN: 5, note: 'x' });
    expect(row).toBeNull();
  });

  it('returns null when the loc meets minN on neither map even though both maps have other locs', () => {
    const row = mergeSalesAndGcWrites({ loc: '3708', eventType: 'holiday', salesShrunk: {}, gcShrunk: {}, minN: 5, note: 'x' });
    expect(row).toBeNull();
  });

  it('writes sales-only when only sales meets minN (gc missing for this loc)', () => {
    const row = mergeSalesAndGcWrites({ loc: '3708', eventType: 'holiday', salesShrunk, gcShrunk: {}, minN: 5, note: 'x' });
    expect(row.home_impact).toBe(0.05);
    expect(row.measured_home).toBe(0.06);
    expect(row.n_home).toBe(10);
    expect(row.gc_home_impact).toBeNull();
    expect(row.measured_gc_home).toBeNull();
    expect(row.n_gc_home).toBeNull();
  });

  it('writes gc-only when only gc meets minN (sales n below the bar)', () => {
    const thinSales = { '3708': { shrunk: 0.05, measured: 0.06, n: 2 } };
    const row = mergeSalesAndGcWrites({ loc: '3708', eventType: 'holiday', salesShrunk: thinSales, gcShrunk, minN: 5, note: 'x' });
    expect(row.home_impact).toBeNull();
    expect(row.n_home).toBeNull();
    expect(row.gc_home_impact).toBe(0.03);
    expect(row.n_gc_home).toBe(8);
  });

  it('writes both when both meet minN', () => {
    const row = mergeSalesAndGcWrites({ loc: '3708', eventType: 'holiday', salesShrunk, gcShrunk, minN: 5, note: 'x' });
    expect(row.home_impact).toBe(0.05);
    expect(row.gc_home_impact).toBe(0.03);
  });

  it('respects the minN boundary — n exactly equal to minN counts, n one below does not', () => {
    const atBar = { '3708': { shrunk: 0.05, measured: 0.06, n: 5 } };
    const belowBar = { '3708': { shrunk: 0.05, measured: 0.06, n: 4 } };
    expect(mergeSalesAndGcWrites({ loc: '3708', eventType: 'holiday', salesShrunk: atBar, gcShrunk: {}, minN: 5, note: 'x' })).not.toBeNull();
    expect(mergeSalesAndGcWrites({ loc: '3708', eventType: 'holiday', salesShrunk: belowBar, gcShrunk: {}, minN: 5, note: 'x' })).toBeNull();
  });

  it('always nulls the away_impact/measured_away/n_away fields (home-only shape)', () => {
    const row = mergeSalesAndGcWrites({ loc: '3708', eventType: 'holiday', salesShrunk, gcShrunk, minN: 5, note: 'x' });
    expect(row.away_impact).toBeNull();
    expect(row.measured_away).toBeNull();
    expect(row.n_away).toBeNull();
    expect(row.gc_away_impact).toBeNull();
    expect(row.measured_gc_away).toBeNull();
    expect(row.n_gc_away).toBeNull();
  });

  it('carries loc, event_type, source, and note through to the output row', () => {
    const row = mergeSalesAndGcWrites({ loc: '3708', eventType: 'retail', salesShrunk, gcShrunk: {}, minN: 5, note: 'measured retail impact' });
    expect(row.loc).toBe('3708');
    expect(row.event_type).toBe('retail');
    expect(row.source).toBe('measured');
    expect(row.note).toBe('measured retail impact');
    expect(row.updated_at).toBeTruthy();
  });
});
