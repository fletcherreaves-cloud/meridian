// @ts-nocheck
// #dispatch11 — CRIT_COLOR became `var(--crit)` in v5.023 (#276/#286), but every severity-tinted
// background/border in this file was built by string-concatenating a 2-digit hex alpha suffix
// onto the color (e.g. `status.color + '18'`). That only produces valid CSS for a hex literal —
// concatenating onto a var() reference yields the literal invalid string "var(--crit)18", which
// the browser silently drops, so critical cells lost their tinted background/border entirely
// while amber (still a hex literal, WATCH_COLOR) kept working. withAlpha() normalizes both forms.
import { describe, it, expect } from 'vitest';
import { withAlpha } from '../views/patch-heatmap.js';

describe('withAlpha — hex-literal vs CSS var() alpha tinting', () => {
  it('a hex literal keeps the original suffix-concat behavior unchanged', () => {
    expect(withAlpha('#f5bc00', '18')).toBe('#f5bc0018');
    expect(withAlpha('#34d399', '45')).toBe('#34d39945');
  });

  it('a var() reference produces valid CSS via color-mix(), not an invalid concatenated string', () => {
    const result = withAlpha('var(--crit)', '18');
    expect(result).not.toContain('var(--crit)18'); // the exact invalid string this bug produced
    expect(result).toBe('color-mix(in srgb, var(--crit) 9%, transparent)');
  });

  it('converts the hex suffix to the correct percentage (0x18=24/255≈9%, 0x45=69/255≈27%)', () => {
    expect(withAlpha('var(--text3)', '18')).toBe('color-mix(in srgb, var(--text3) 9%, transparent)');
    expect(withAlpha('var(--crit)', '45')).toBe('color-mix(in srgb, var(--crit) 27%, transparent)');
    expect(withAlpha('var(--crit)', '35')).toBe('color-mix(in srgb, var(--crit) 21%, transparent)');
    expect(withAlpha('var(--crit)', '40')).toBe('color-mix(in srgb, var(--crit) 25%, transparent)');
  });
});
