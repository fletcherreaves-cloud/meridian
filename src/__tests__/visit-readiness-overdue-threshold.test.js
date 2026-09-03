// @ts-nocheck
// visit-readiness.js's overdueThresholdDays had zero direct test coverage despite being live:
// called internally (visit-readiness.js:662) so the panel can label what the "overdue" color
// means without re-deriving the number.
import { describe, it, expect } from 'vitest';
import { overdueThresholdDays } from '../engine/visit-readiness.js';

describe('overdueThresholdDays', () => {
  it('returns 2x the expected CFV cadence (121d) for a CFV report type', () => {
    expect(overdueThresholdDays('CFV')).toBe(242);
  });

  it('returns 2x the expected EcoSure cadence (182d), matching on "food safety" too', () => {
    expect(overdueThresholdDays('EcoSure')).toBe(364);
    expect(overdueThresholdDays('Food Safety')).toBe(364);
  });

  it('returns 2x the expected RGR cadence (365d)', () => {
    expect(overdueThresholdDays('RGR')).toBe(730);
  });

  it('is case-insensitive', () => {
    expect(overdueThresholdDays('cfv')).toBe(242);
    expect(overdueThresholdDays('rgr')).toBe(730);
  });

  it('defaults to CFV when reportType is falsy', () => {
    expect(overdueThresholdDays(null)).toBe(242);
    expect(overdueThresholdDays('')).toBe(242);
  });

  it('returns null for an instrument with no owner-confirmed cadence, rather than guessing', () => {
    expect(overdueThresholdDays('SomeOtherReport')).toBeNull();
  });
});
