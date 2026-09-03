// @ts-nocheck
// signal-registry.js's getConditionLabel had zero direct test coverage despite being live:
// called twice from src/views/signals.js to render the human-readable x/y condition badges
// in the Signal Lab UI, and once internally (signal-registry.js) for the same purpose.
import { describe, it, expect } from 'vitest';
import { getConditionLabel } from '../engine/signal-registry.js';

describe('getConditionLabel', () => {
  it('returns null for a falsy condition or "all" (no filter applied)', () => {
    expect(getConditionLabel(null, 'median', {})).toBeNull();
    expect(getConditionLabel(undefined, 'median', {})).toBeNull();
    expect(getConditionLabel('all', 'median', {})).toBeNull();
  });

  it('labels positive/negative conditions independent of reference or metric direction', () => {
    expect(getConditionLabel('positive', 'median', {})).toBe('> 0');
    expect(getConditionLabel('negative', 'average', { better: 'lower' })).toBe('< 0');
  });

  it('labels "high" against the median by default', () => {
    expect(getConditionLabel('high', 'median', {})).toBe('Above median');
  });

  it('labels "high" against the average when reference is "average"', () => {
    expect(getConditionLabel('high', 'average', {})).toBe('Above avg');
  });

  it('appends "(worse)" to "high" when the metric is better-when-lower', () => {
    expect(getConditionLabel('high', 'average', { better: 'lower' })).toBe('Above avg (worse)');
  });

  it('labels "low" against the median by default, with no "(worse)" suffix for a better-lower metric', () => {
    expect(getConditionLabel('low', 'median', { better: 'lower' })).toBe('Below median');
  });

  it('appends "(worse)" to "low" when the metric is better-when-higher', () => {
    expect(getConditionLabel('low', 'median', { better: 'higher' })).toBe('Below median (worse)');
  });

  it('falls back to the raw condition string for an unrecognized condition', () => {
    expect(getConditionLabel('weird', 'median', {})).toBe('weird');
  });
});
