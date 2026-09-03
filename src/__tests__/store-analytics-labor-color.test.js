// @vitest-environment happy-dom
// @ts-nocheck
// views/store-analytics.js's laborColor() had zero test coverage despite being live -- it drives
// the Labor % KPI card's color/arrow/label in the Store Analytics KPI grid (store-analytics.js
// line ~2140), which is imported by App.js.
import { describe, it, expect } from 'vitest';
import { laborColor } from '../views/store-analytics.js';

// Default settings: laborGreenPct=0.5, laborYellowPct=1.5 (percentage points), applied as
// fractions of laborPct/tLabor (both expressed 0-1, e.g. 0.25 = 25%).
describe('laborColor', () => {
  it('returns the neutral placeholder when laborPct or tLabor is falsy (no data/no target)', () => {
    expect(laborColor(0, 0.25, {})).toEqual({ color: '#94a3b8', arrow: '', label: '—' });
    expect(laborColor(0.25, 0, {})).toEqual({ color: '#94a3b8', arrow: '', label: '—' });
    expect(laborColor(null, 0.25, {})).toEqual({ color: '#94a3b8', arrow: '', label: '—' });
  });

  it('is "On Target" (green, no arrow) when exactly at target', () => {
    const out = laborColor(0.25, 0.25, {});
    expect(out.color).toBe('#10b981');
    expect(out.label).toBe('On Target');
    expect(out.arrow).toBe('');
  });

  it('is "On Target" within the green band (default 0.5pts = 0.005)', () => {
    const out = laborColor(0.254, 0.25, {}); // +0.4pts, under the 0.5pt green band
    expect(out.color).toBe('#10b981');
    expect(out.label).toBe('On Target');
  });

  it('is "Slightly High" (amber, up arrow) just over the green band but within yellow', () => {
    const out = laborColor(0.256, 0.25, {}); // +0.6pts
    expect(out.color).toBe('#f59e0b');
    expect(out.label).toBe('Slightly High');
    expect(out.arrow).toBe(' ▲');
  });

  it('is "Slightly Low" (amber, down arrow) symmetrically under target', () => {
    const out = laborColor(0.244, 0.25, {}); // -0.6pts
    expect(out.color).toBe('#f59e0b');
    expect(out.label).toBe('Slightly Low');
    expect(out.arrow).toBe(' ▼');
  });

  it('is "Over Target" (red) beyond the yellow band (default 1.5pts = 0.015)', () => {
    const out = laborColor(0.27, 0.25, {}); // +2pts
    expect(out.color).toBe('#ef4444');
    expect(out.label).toBe('Over Target');
    expect(out.arrow).toBe(' ▲');
  });

  it('is "Under Target" (red) symmetrically beyond the yellow band on the low side', () => {
    const out = laborColor(0.23, 0.25, {}); // -2pts
    expect(out.color).toBe('#ef4444');
    expect(out.label).toBe('Under Target');
    expect(out.arrow).toBe(' ▼');
  });

  it('respects custom laborGreenPct/laborYellowPct settings instead of the defaults', () => {
    // With a tight green band of 0.1pt, a 0.6pt overage that would be "Slightly High" under
    // defaults is now "Over Target".
    const out = laborColor(0.256, 0.25, { laborGreenPct: 0.1, laborYellowPct: 0.2 });
    expect(out.label).toBe('Over Target');
  });

  it('falls back to DEF_SETTINGS thresholds when settings is null/undefined', () => {
    const out = laborColor(0.25, 0.25, null);
    expect(out.label).toBe('On Target');
  });
});
