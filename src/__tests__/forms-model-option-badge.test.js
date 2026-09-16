// @ts-nocheck
// "Scored-form field renderers" (Task #59, Printable Forms expansion) — a background audit
// (2026-09-16) confirmed the 53 captured QSRSoft forms (public/forms/*.json) include real
// point-weighted and percentage-banded rubric options (e.g. general-manager-weekly-scorecard,
// peak-shift-performance-verification-tool, cash-audit) that render today as plain, unweighted
// circle-and-label rows — indistinguishable from a bare Yes/No checklist item. The exact
// examples below are copied verbatim from that audit's findings.
//
// parseOptionBadge/formatOptionBadge deliberately do NOT classify an option as good/bad or
// compute a total score (see forms-model.js's own header comment on why) — these tests confirm
// that restraint too: no badge, and no color judgement, for options this function can't safely
// interpret.
import { describe, it, expect } from 'vitest';
import { parseOptionBadge, formatOptionBadge, normalizeForm, buildFormPrintHTML } from '../engine/forms-model.js';

describe('parseOptionBadge — real QSRSoft rubric option text', () => {
  it('a flat point value at the end of a measurement band', () => {
    expect(parseOptionBadge('135" or less - 8 pts')).toEqual({ points: 8 });
    expect(parseOptionBadge('136”-162” - 7 pts')).toEqual({ points: 7 });
    expect(parseOptionBadge('241” or greater - 0 pts')).toEqual({ points: 0 });
  });

  it('a point range plus a percent range in the same band label', () => {
    expect(parseOptionBadge('OUTSTANDING  21-30 POINTS / 70% - 100%'))
      .toEqual({ pointsLow: 21, pointsHigh: 30, pctLow: 70, pctHigh: 100 });
    expect(parseOptionBadge('GOOD 15-18  POINTS / 50%-60%'))
      .toEqual({ pointsLow: 15, pointsHigh: 18, pctLow: 50, pctHigh: 60 });
  });

  it('a "below N points" band with no upper bound (single flat threshold, no range)', () => {
    // 'NEEDS IMPROVEMENT  BELOW 15 POINTS / 49%' has no "X-Y points" range and no "%-%" range —
    // falls through to the flat 49% and no points figure (there IS no points range to parse; "15
    // POINTS" alone with no leading number-dash-number is correctly left unparsed as a range).
    expect(parseOptionBadge('NEEDS IMPROVEMENT  BELOW 15 POINTS / 49%')).toEqual({ pct: 49 });
  });

  it('a point-threshold condition embedded in a pass/fail option', () => {
    expect(parseOptionBadge('Passed (23+ points AND 100% critical behaviors)'))
      .toEqual({ pointsMin: 23, pct: 100 });
  });

  it('plain Yes/No-style options with no embedded score parse to null, never a false badge', () => {
    expect(parseOptionBadge('Pass')).toBeNull();
    expect(parseOptionBadge('Fail')).toBeNull();
    expect(parseOptionBadge('Complete')).toBeNull();
    expect(parseOptionBadge('Needs Action')).toBeNull();
    expect(parseOptionBadge('Exceeds Standard')).toBeNull();
    expect(parseOptionBadge('Schedule Another Verification')).toBeNull();
    expect(parseOptionBadge('')).toBeNull();
    expect(parseOptionBadge(null)).toBeNull();
  });
});

describe('formatOptionBadge', () => {
  it('formats every shape parseOptionBadge can produce', () => {
    expect(formatOptionBadge({ points: 8 })).toBe('8 pts');
    expect(formatOptionBadge({ points: 1 })).toBe('1 pt'); // singular
    expect(formatOptionBadge({ pointsLow: 21, pointsHigh: 30 })).toBe('21-30 pts');
    expect(formatOptionBadge({ pointsMin: 23 })).toBe('23+ pts');
    expect(formatOptionBadge({ pctLow: 70, pctHigh: 100 })).toBe('70-100%');
    expect(formatOptionBadge({ pct: 49 })).toBe('49%');
  });

  it('combines points and percent when a band label carries both', () => {
    expect(formatOptionBadge({ pointsLow: 21, pointsHigh: 30, pctLow: 70, pctHigh: 100 })).toBe('21-30 pts · 70-100%');
    expect(formatOptionBadge({ pointsMin: 23, pct: 100 })).toBe('23+ pts · 100%');
  });

  it('null/empty badge formats to an empty string, never "undefined" or a crash', () => {
    expect(formatOptionBadge(null)).toBe('');
    expect(formatOptionBadge(undefined)).toBe('');
    expect(formatOptionBadge({})).toBe('');
  });
});

describe('buildFormPrintHTML — the badge reaches the actual printed sheet, both style variants', () => {
  const RAW = [
    { id: 'r1', formId: 'F', title: 'Overall score', type: 'radio', order: 1, options: [
      { title: 'OUTSTANDING  21-30 POINTS / 70% - 100%', id: 'a' },
      { title: 'NEEDS IMPROVEMENT  BELOW 15 POINTS / 49%', id: 'b' },
    ] },
    { id: 'r2', formId: 'F', title: 'Windows clean', type: 'radio', order: 2, options: [
      { title: 'Complete', id: 'c' }, { title: 'Needs Action', id: 'd' },
    ] },
  ];
  const form = normalizeForm(RAW, { formId: 'F', title: 'Scorecard Test' });

  it('QSRSoft-styled (colored) print HTML shows a badge for scored options, none for plain ones', () => {
    const html = buildFormPrintHTML(form, { style: 'qsrsoft' });
    expect(html).toContain('21-30 pts &middot; 70-100%'.replace('&middot;', '·')); // badge text present verbatim
    expect(html).toMatch(/class="badge"[^<]*49%/);
    // 'Complete'/'Needs Action' options render with no badge markup at all around them.
    const completeIdx = html.indexOf('Complete</div>');
    expect(completeIdx).toBeGreaterThan(-1);
  });

  it('compact black-on-white print HTML also carries the badge', () => {
    const html = buildFormPrintHTML(form, { style: 'compact' });
    expect(html).toContain('21-30 pts · 70-100%');
    expect(html).toContain('49%');
  });
});
