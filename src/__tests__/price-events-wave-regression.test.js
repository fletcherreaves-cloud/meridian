// @ts-nocheck
// Dispatch21's one optional ask: price-events.js reproduced the exact 14-store/13-store
// June 2026 district repricing wave split against 763k real qsr_product_mix rows with zero
// tuning (see src/engine/price-events.js's header + PR #411). That's worth protecting with a
// regression pinned to the real split, not just "the engine returns something" -- so a future
// change to the pull scripts, the parser, or the step-detection window that silently drifts
// off this exact number gets caught by the suite instead of by someone noticing a chart looks
// different months from now.
//
// The fixture (fixtures/price-wave-2026-06.json) is REAL qsr_product_mix data, pulled live
// from Supabase 2026-08-19 for the window 2026-05-28..2026-07-12 (which covers both wave
// dates with >=14 days of margin on every side). The full window pull was 501,684 rows --
// far too large to commit -- so it's trimmed to exactly ONE anchor (loc, item) pair per
// store: whichever item's confirmed step (per detectPriceSteps, run against the FULL
// untrimmed pull) landed on 2026-06-13 or 2026-06-26 for that store. Trimming to one item
// per store is safe here specifically because priceChangeEvents() has no minimum-items
// floor (see price-events.js) -- a single confirmed step is enough to produce a dated event,
// so cutting the other ~280 items/store/day changes nothing about which store repriced on
// which date. Verified empirically when the fixture was built: running priceChangeEvents()
// against the trimmed 1,608-row fixture reproduces the identical 14/13 split, zero other
// event dates, exactly matching the full 501,684-row pull.
import { describe, it, expect } from 'vitest';
import { priceChangeEvents } from '../engine/price-events.js';
import waveRows from './fixtures/price-wave-2026-06.json';

const WAVE_1_DATE = '2026-06-13';
const WAVE_2_DATE = '2026-06-26';

const WAVE_1_LOCS = [
  '10422', '11657', '13113', '18213', '20475', '33109', '33704',
  '34222', '35242', '38609', '5183', '5985', '6178', '6838',
].sort();

const WAVE_2_LOCS = [
  '10034', '10915', '24471', '29760', '31357', '32525', '33222',
  '35064', '3708', '37566', '43380', '43701', '6972',
].sort();

describe('price-events real-data regression: the June 2026 district repricing wave split', () => {
  it('confirms exactly 14 stores repriced on 2026-06-13', () => {
    const events = priceChangeEvents(waveRows);
    const w1 = events.filter(e => e.date === WAVE_1_DATE).map(e => e.loc).sort();
    expect(w1).toEqual(WAVE_1_LOCS);
  });

  it('confirms exactly 13 stores repriced on 2026-06-26', () => {
    const events = priceChangeEvents(waveRows);
    const w2 = events.filter(e => e.date === WAVE_2_DATE).map(e => e.loc).sort();
    expect(w2).toEqual(WAVE_2_LOCS);
  });

  it('the two waves are disjoint and together cover exactly the 27-store district', () => {
    const events = priceChangeEvents(waveRows);
    const w1 = new Set(events.filter(e => e.date === WAVE_1_DATE).map(e => e.loc));
    const w2 = new Set(events.filter(e => e.date === WAVE_2_DATE).map(e => e.loc));
    const overlap = [...w1].filter(loc => w2.has(loc));
    expect(overlap).toEqual([]);
    expect(w1.size + w2.size).toBe(27);
  });

  it('produces no confirmed events on any date other than the two known wave dates', () => {
    const events = priceChangeEvents(waveRows);
    const otherDates = events.map(e => e.date).filter(d => d !== WAVE_1_DATE && d !== WAVE_2_DATE);
    expect(otherDates).toEqual([]);
  });
});
