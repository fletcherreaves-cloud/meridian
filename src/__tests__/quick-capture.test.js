// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { buildQuickCaptureEvent, impactLookupKey, lookupMeasuredImpact } from '../engine/quick-capture.js';

describe('buildQuickCaptureEvent', () => {
  it('builds the exact shape saveOrgEvents() expects', () => {
    const ev = buildQuickCaptureEvent({
      loc: '3708', type: 'staffing', label: 'Called out sick', note: 'AM crew short',
      dateStart: '2026-11-06', enteredBy: 'gm@example.com',
    });
    expect(ev).toEqual({
      loc: '3708', dateStart: '2026-11-06', dateEnd: '2026-11-06', span: false,
      type: 'staffing', label: 'Called out sick', scope: 'store',
      note: 'AM crew short', enteredBy: 'gm@example.com', method: 'quick-capture',
    });
  });

  it('defaults type to "other" and note to null', () => {
    const ev = buildQuickCaptureEvent({ loc: '3708', label: 'Street festival downtown', dateStart: '2026-11-06' });
    expect(ev.type).toBe('other');
    expect(ev.note).toBeNull();
    expect(ev.enteredBy).toBeNull();
  });

  it('returns null when loc, label, or dateStart is missing', () => {
    expect(buildQuickCaptureEvent({ label: 'x', dateStart: '2026-11-06' })).toBeNull();
    expect(buildQuickCaptureEvent({ loc: '3708', dateStart: '2026-11-06' })).toBeNull();
    expect(buildQuickCaptureEvent({ loc: '3708', label: 'x' })).toBeNull();
    expect(buildQuickCaptureEvent({ loc: '3708', label: '   ', dateStart: '2026-11-06' })).toBeNull();
  });

  it('trims label and note', () => {
    const ev = buildQuickCaptureEvent({ loc: '3708', label: '  Called out sick  ', note: '  detail  ', dateStart: '2026-11-06' });
    expect(ev.label).toBe('Called out sick');
    expect(ev.note).toBe('detail');
  });
});

describe('impactLookupKey', () => {
  it('strips leading zeros from loc, matching events-panel.js impactGlyph()', () => {
    expect(impactLookupKey('0003708', 'staffing')).toBe('3708|staffing');
    expect(impactLookupKey('3708', 'staffing')).toBe('3708|staffing');
  });
  it('defaults type to "other" when missing', () => {
    expect(impactLookupKey('3708', null)).toBe('3708|other');
  });
});

describe('lookupMeasuredImpact', () => {
  const rows = [
    { loc: '0003708', eventType: 'staffing', homeImpact: -0.032, nHome: 6, source: 'measured' },
    { loc: '3708', eventType: 'weather', homeImpact: null, nHome: 0, source: null },
  ];

  it('finds a real measured row regardless of loc zero-padding', () => {
    const r = lookupMeasuredImpact(rows, '3708', 'staffing');
    expect(r).toEqual({ pct: -0.032, n: 6, measured: true });
  });

  it('returns null for a store/type with no measured impact value', () => {
    expect(lookupMeasuredImpact(rows, '3708', 'weather')).toBeNull();
  });

  it('returns null when no row exists at all for this store/type (first occurrence)', () => {
    expect(lookupMeasuredImpact(rows, '3708', 'power')).toBeNull();
    expect(lookupMeasuredImpact(rows, '5183', 'staffing')).toBeNull();
  });

  it('treats a null/undefined source as measured (matches events-panel.js impactGlyph())', () => {
    const r = lookupMeasuredImpact([{ loc: '3708', eventType: 'event', homeImpact: 0.05, nHome: 3, source: null }], '3708', 'event');
    expect(r.measured).toBe(true);
  });

  it('handles an empty/missing rows array', () => {
    expect(lookupMeasuredImpact(null, '3708', 'staffing')).toBeNull();
    expect(lookupMeasuredImpact([], '3708', 'staffing')).toBeNull();
  });
});
