// @ts-nocheck
// Notes 61 #5: "Intelligence Brief > just make the results easier to read. It is all pastel,
// including the text."
//
// It was not that panel. Measured 2026-08-08 across all 4 themes x 2 modes, --text3 (used for
// nearly every label and secondary line in the app) failed WCAG AA body-text contrast in 6 of 8
// combinations, worst at 2.4:1 against a 4.5:1 standard. --amber failed in 3 of 4 light themes.
// So "all pastel" was a THEME TOKEN problem showing up in whichever panel the owner happened to
// be reading, and fixing one panel would have left the other 70.
//
// This guards the tokens rather than any panel: a new theme, or a "let's soften that grey"
// tweak, fails the build instead of quietly shipping unreadable text.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const CSS = readFileSync('src/meridian.css', 'utf8');

/** WCAG relative luminance. */
function luminance(hex) {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map(c => c + c).join('');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255);
  const f = c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

function themeBlocks() {
  const out = [];
  for (const mode of ['light', 'dark']) {
    const re = new RegExp(`html\\[data-theme="(\\w+)"\\]\\[data-mode="${mode}"\\]\\{([^}]*)\\}`, 'g');
    for (const m of CSS.matchAll(re)) {
      const tokens = Object.fromEntries([...m[2].matchAll(/--([a-z0-9]+):\s*(#[0-9A-Fa-f]{3,6})/g)].map(x => [x[1], x[2]]));
      out.push({ theme: m[1], mode, tokens });
    }
  }
  return out;
}

const AA_BODY = 4.5;

describe('theme contrast (WCAG AA)', () => {
  const blocks = themeBlocks();

  it('finds all 4 themes in both modes', () => {
    expect(blocks.length).toBeGreaterThanOrEqual(8);
  });

  it('every text token meets 4.5:1 against its own surface', () => {
    const failures = [];
    for (const { theme, mode, tokens } of blocks) {
      const bg = tokens.surf || tokens.bg;
      if (!bg) continue;
      for (const t of ['text', 'text2', 'text3', 'amber']) {
        if (!tokens[t]) continue;
        const r = contrast(tokens[t], bg);
        if (r < AA_BODY) failures.push(`${mode}/${theme} --${t}=${tokens[t]} on ${bg} = ${r.toFixed(1)}:1`);
      }
    }
    expect(failures, `below WCAG AA ${AA_BODY}:1:\n  ${failures.join('\n  ')}`).toEqual([]);
  });

  it('--text3 specifically passes — it labels nearly everything', () => {
    // Called out on its own because it is the token the owner was actually seeing: it carries
    // tile labels, table captions, footnotes and metadata across every panel.
    for (const { theme, mode, tokens } of blocks) {
      const bg = tokens.surf || tokens.bg;
      if (!bg || !tokens.text3) continue;
      expect(contrast(tokens.text3, bg), `${mode}/${theme} --text3`).toBeGreaterThanOrEqual(AA_BODY);
    }
  });

  it('primary text stays far above the floor, not merely at it', () => {
    for (const { theme, mode, tokens } of blocks) {
      const bg = tokens.surf || tokens.bg;
      if (!bg || !tokens.text) continue;
      expect(contrast(tokens.text, bg), `${mode}/${theme} --text`).toBeGreaterThan(10);
    }
  });
});
