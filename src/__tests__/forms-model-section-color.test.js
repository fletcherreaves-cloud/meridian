// @ts-nocheck
// forms-model.js's sectionColor had zero direct test coverage despite being live: called
// internally (forms-model.js:116) and used by src/views/forms-print.js/checklist-fill.js to
// resolve a section's card color.
import { describe, it, expect } from 'vitest';
import { sectionColor, SECTION_COLORS } from '../engine/forms-model.js';

describe('sectionColor', () => {
  it('returns the exact color pair for each known section key', () => {
    expect(sectionColor('danger-high')).toBe(SECTION_COLORS['danger-high']);
    expect(sectionColor('success-low')).toBe(SECTION_COLORS['success-low']);
  });

  it('falls back to grey-low for an unrecognized or missing key', () => {
    expect(sectionColor('not-a-real-key')).toBe(SECTION_COLORS['grey-low']);
    expect(sectionColor(null)).toBe(SECTION_COLORS['grey-low']);
    expect(sectionColor(undefined)).toBe(SECTION_COLORS['grey-low']);
  });
});
