// @ts-nocheck
// Intelligence Brief body text (.bt-crit/.bt-watch/.bt-ok/.bt-fc, meridian.css) — owner report
// (Notes 61, District View #5): "all pastel, including the text -- unreadable." Measured: the
// base rule's Tailwind-300 pastel tones (#fca5a5/#fdba74/#6ee7b7/#c7d2fe) were tuned for the dark
// surface (~9-12:1 contrast there) but only clear ~1.5-1.9:1 against light mode's white --surf --
// well under WCAG AA's 4.5:1 floor for normal text, i.e. effectively unreadable in the SHIPPED
// DEFAULT theme (CLAUDE.md: "LIGHT is the shipped default; dark is a selectable mode"). Fixed
// with a light-mode override reusing the same darker tones already vetted for @media print.
//
// This reads the actual CSS text (not a hand-copied expectation) and computes real WCAG relative
// luminance / contrast ratios -- so a revert of the override, or a drift back toward a
// low-contrast value, fails this rather than a string-match alone.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const css = readFileSync(join(process.cwd(), 'src/meridian.css'), 'utf8');

function hexToRgb(hex) {
  hex = hex.replace('#', '');
  return [parseInt(hex.slice(0, 2), 16), parseInt(hex.slice(2, 4), 16), parseInt(hex.slice(4, 6), 16)];
}
function relLum([r, g, b]) {
  const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const [R, G, B] = [f(r), f(g), f(b)];
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}
function contrastRatio(hex1, hex2) {
  const L1 = relLum(hexToRgb(hex1)), L2 = relLum(hexToRgb(hex2));
  const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (hi + 0.05) / (lo + 0.05);
}

const WHITE = '#FFFFFF'; // command/dualbrand light --surf; golden/refined are near-white variants, close enough that passing here implies passing there.
const WCAG_AA_NORMAL_TEXT = 4.5;

describe('Intelligence Brief severity text — light-mode contrast', () => {
  it('a light-mode override exists for every severity class, distinct from the dark-tuned base rule', () => {
    const m = css.match(/html\[data-mode="light"\]\s*\.bt-crit\{color:(#[0-9a-fA-F]{6})\}/);
    expect(m, '.bt-crit light-mode override not found').toBeTruthy();
  });

  it.each([
    ['bt-crit', /html\[data-mode="light"\]\s*\.bt-crit\{color:(#[0-9a-fA-F]{6})\}/],
    ['bt-watch', /html\[data-mode="light"\]\s*\.bt-watch\{color:(#[0-9a-fA-F]{6})\}/],
    ['bt-ok', /html\[data-mode="light"\]\s*\.bt-ok\{color:(#[0-9a-fA-F]{6})\}/],
    ['bt-fc', /html\[data-mode="light"\]\s*\.bt-fc\{color:(#[0-9a-fA-F]{6})\}/],
  ])('%s clears WCAG AA (4.5:1) against a white light-mode surface', (name, re) => {
    const m = css.match(re);
    expect(m, `${name} light-mode override not found`).toBeTruthy();
    const ratio = contrastRatio(m[1], WHITE);
    expect(ratio).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
  });

  it('the dark-mode base rule is unchanged (already measured at ~9-12:1 against the dark surface, not the bug)', () => {
    const m = css.match(/\.bt-crit\{color:(#[0-9a-fA-F]{6})\}\.bt-watch\{color:(#[0-9a-fA-F]{6})\}\.bt-ok\{color:(#[0-9a-fA-F]{6})\}\.bt-fc\{color:(#[0-9a-fA-F]{6})\}/);
    expect(m, 'base .bt-* rule not found').toBeTruthy();
    const DARK_SURF = '#111822';
    for (const hex of m.slice(1)) {
      expect(contrastRatio(hex, DARK_SURF)).toBeGreaterThanOrEqual(WCAG_AA_NORMAL_TEXT);
    }
  });
});
