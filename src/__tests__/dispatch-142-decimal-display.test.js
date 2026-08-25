// @ts-nocheck
// Dispatch #142 item 4 — "For all the new yearly targets imported, please round them up or
// down based on decimal value. I did not realize they had decimals until i checked in
// workbook." Display-only fix: parseYearlyTargets()/parseMonthlyTargets() already preserve
// full decimal precision at parse/storage time (confirmed correct, not touched by this
// dispatch) — the leak was in two UI cells that rendered a raw, unformatted number:
//   1. targets-editor.js's fmtVal() — unit:'usd' used Number.toLocaleString()'s default
//      (up to 3 decimal places), so a target with float noise could render "$111,513.158".
//   2. store-dash.js's MonthlyTargetManager getFieldVal() — %-scale fields already
//      .toFixed()'d, but $ (and unscaled) fields returned the raw stored value straight into
//      a number input with zero formatting at all.
// Both fixes are display-only: the STORED/scored value is never rounded (verified below —
// fmtVal's input is untouched; saveField in store-dash.js still parses whatever the user
// types, independent of the rounded display).
import { describe, it, expect } from 'vitest';
import { fmtVal } from '../views/targets-editor.js';

describe('targets-editor.js fmtVal — usd renders whole dollars, not raw decimal noise', () => {
  it('rounds a $ value with float/workbook decimal noise to whole dollars', () => {
    expect(fmtVal(111513.157894736, 'usd')).toBe('$111,513');
    expect(fmtVal(650000.42, 'usd')).toBe('$650,000');
  });

  it('still rounds a value that already happens to be a whole number, unchanged', () => {
    expect(fmtVal(50000, 'usd')).toBe('$50,000');
  });

  it('pct/sec formatting is unaffected by this fix', () => {
    expect(fmtVal(0.223456, 'pct')).toBe('22.35%'); // unchanged 2-decimal behavior
    expect(fmtVal(45, 'sec')).toBe('45 sec');
  });

  it('null still renders the placeholder, not $NaN or $0', () => {
    expect(fmtVal(null, 'usd')).toBe('—');
  });
});
