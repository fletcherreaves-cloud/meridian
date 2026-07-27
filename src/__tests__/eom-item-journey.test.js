import { describe, it, expect } from 'vitest';
import { buildItemJourney, buildStoreJourneys, SOURCE_LANE } from '../engine/eom-item-journey.js';

// A raw-item detail shaped like mapRawItemHistory() output.
const detail = (history) => ({ wrin: '00005-086', descr: '100% PURE BEEF', itemClass: 'Food', uom: 'CS', history });
const h = (dt, source, qtyChange, extra = {}) => ({
  dt, source, qtyChange, isCount: source === 'inventory', ...extra,
});

describe('buildItemJourney', () => {
  it('classifies sources into lanes and sorts chronologically', () => {
    const j = buildItemJourney(detail([
      h('2026-07-10', 'pos_sales', -40),
      h('2026-07-01', 'invoice', 100, { invoice: 'INV-1' }),
      h('2026-07-05', 'waste', -10),
    ]), { period: '2026-07' });
    expect(j.events.map(e => e.dt)).toEqual(['2026-07-01', '2026-07-05', '2026-07-10']);
    expect(j.events.map(e => e.lane)).toEqual(['received', 'waste', 'used']);
    expect(SOURCE_LANE.comp_waste).toBe('waste');
  });

  it('surfaces a count variance as a FACT attributed to date + counter', () => {
    const j = buildItemJourney(detail([
      h('2026-07-05', 'inventory', 0, { difference: -900, variance: -20, manager: 'Cinthya a' }),
    ]), { period: '2026-07' });
    const fact = j.signals.find(s => s.kind === 'fact');
    expect(fact.text).toMatch(/900 short at the 2026-07-05 count/);
    expect(fact.text).toMatch(/Cinthya a/);
  });

  it('judges an EARLY break-point as locked (recount won\'t recover)', () => {
    const j = buildItemJourney(detail([
      h('2026-07-05', 'inventory', 0, { difference: -900, variance: -20 }),
    ]), { period: '2026-07' }); // window starts 07-29 → 07-05 is early
    const inf = j.signals.find(s => s.kind === 'inference' && s.lane === 'count');
    expect(inf.text).toMatch(/locked|won't recover/i);
    expect(j.verdict.tone).toBe('bad');
  });

  it('judges a LATE break-point (in window) as recoverable', () => {
    const j = buildItemJourney(detail([
      h('2026-07-30', 'inventory', 0, { difference: -900, variance: -20 }),
    ]), { period: '2026-07' }); // 07-30 is inside the 07-29+ window
    const inf = j.signals.find(s => s.kind === 'inference' && s.lane === 'count');
    expect(inf.text).toMatch(/recover it|recount .* resubmit/i);
  });

  it('flags waste-dominated outflow as an inference', () => {
    const j = buildItemJourney(detail([
      h('2026-07-01', 'invoice', 100),
      h('2026-07-10', 'pos_sales', -50),
      h('2026-07-12', 'waste', -40),
    ]), { period: '2026-07' });
    const w = j.signals.find(s => s.kind === 'inference' && s.lane === 'waste');
    expect(w).toBeTruthy();
    expect(w.text).toMatch(/Waste is \d+%/);
  });

  it('nets counts to a clean verdict when variance is immaterial', () => {
    const j = buildItemJourney(detail([
      h('2026-07-30', 'inventory', 0, { difference: -10 }),
    ]), { period: '2026-07' });
    expect(j.verdict.tone).toBe('good');
    expect(j.verdict.text).toMatch(/On track/);
  });

  it('handles an item with no count', () => {
    const j = buildItemJourney(detail([h('2026-07-01', 'invoice', 100)]), { period: '2026-07' });
    expect(j.counts).toHaveLength(0);
    expect(j.verdict.text).toMatch(/No physical count/);
  });
});

describe('buildStoreJourneys', () => {
  it('orders items worst-net-variance first', () => {
    const items = [
      detail([h('2026-07-05', 'inventory', 0, { difference: -100 })]),
      { ...detail([h('2026-07-05', 'inventory', 0, { difference: -800 })]), wrin: 'BIG' },
    ];
    const js = buildStoreJourneys(items, { period: '2026-07' });
    expect(js[0].wrin).toBe('BIG');
  });
});
