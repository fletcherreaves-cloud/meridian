// @ts-nocheck
// why.js's classifyMissCauses had zero direct test coverage despite being live: called
// internally by runWhyEngineScan (same file, real call sites in analytics.js/coaching.js/
// lifelenz.js) to bucket a day's diagnoseMiss() causes into one aggregate label.
import { describe, it, expect } from 'vitest';
import { classifyMissCauses } from '../engine/why.js';

describe('classifyMissCauses', () => {
  it('returns "unexplained" for no causes at all', () => {
    expect(classifyMissCauses(null)).toBe('unexplained');
    expect(classifyMissCauses([])).toBe('unexplained');
  });

  it('classifies a tagged event as "event"', () => {
    expect(classifyMissCauses([{ text: 'Tagged event: parade', weight: 'PRIMARY' }])).toBe('event');
  });

  it('classifies a district-wide/multi-store/regional weight as "regional"', () => {
    expect(classifyMissCauses([{ text: 'x', weight: 'DISTRICT-WIDE' }])).toBe('regional');
    expect(classifyMissCauses([{ text: 'x', weight: 'MULTI-STORE' }])).toBe('regional');
    expect(classifyMissCauses([{ text: 'x', weight: 'REGIONAL' }])).toBe('regional');
  });

  it('classifies a PRIMARY weather cause as "weather"', () => {
    expect(classifyMissCauses([{ text: 'Weather likely a factor', weight: 'PRIMARY' }])).toBe('weather');
  });

  it('classifies a PRIMARY store-specific anomaly as "isolated_anomaly"', () => {
    expect(classifyMissCauses([{ text: 'Store-specific anomaly detected', weight: 'PRIMARY' }])).toBe('isolated_anomaly');
  });

  it('classifies an UNKNOWN-weight cause as "unexplained"', () => {
    expect(classifyMissCauses([{ text: 'no idea', weight: 'UNKNOWN' }])).toBe('unexplained');
  });

  it('falls back to "contributing_factors" for causes that match none of the specific buckets', () => {
    expect(classifyMissCauses([{ text: 'Minor ops slip', weight: 'SECONDARY' }])).toBe('contributing_factors');
  });

  it('checks "event" before every other bucket, even when a regional cause is also present', () => {
    const causes = [{ text: 'x', weight: 'REGIONAL' }, { text: 'Tagged event: promo', weight: 'PRIMARY' }];
    expect(classifyMissCauses(causes)).toBe('event');
  });
});
