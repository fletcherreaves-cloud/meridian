// @ts-nocheck
// R4 (dispatch16, 2026-08-18) — no new color+hex-suffix string concatenation.
//
// The bug shape: code does 'var(--crit)' + '18' expecting a translucent color. That trick
// only produces valid CSS when the LEFT side is a hex literal ('#f87171' + '18' ->
// '#f8717118', a real 8-digit hex color). The moment a color gets converted from a hex
// literal to a CSS custom-property reference (var(--crit)), the identical concat produces
// the literal, INVALID string "var(--crit)18" — the browser silently drops it, no console
// error, and the element just loses its background/border. This shipped twice in one day as
// #351 and #368.
//
// src/utils/fmt.js#withAlpha(color, hexSuffix) is the fix (moved there under #368 so
// model-health-badge.js, a component split out of analytics.js specifically to stay small in
// the eager bundle, doesn't have to statically import all of patch-heatmap.js just to reach it;
// re-exported unchanged from patch-heatmap.js for its own existing call sites): a hex literal
// keeps the old suffix-concat behavior unchanged; a var() reference goes through color-mix()
// instead. See src/__tests__/patch-heatmap-alpha.test.js and
// src/__tests__/dispatch-368-model-health-badge-alpha.test.js for withAlpha's own unit coverage.
//
// NOT a mandate to convert everything below. Most of the 93 sites counted here concatenate
// onto a hex literal today (harmless — #10b981+'22' is valid CSS) and only become a live bug
// the day someone converts THAT PARTICULAR color constant to a var() token, per #351's own
// history. This ratchet exists so the count of "sites at risk of that conversion" can only go
// DOWN from here (converted to withAlpha), never creep back up unnoticed with a new call site
// that will silently break on the same day.
//
// src/views/smg-voice.js was investigated by name per this ratchet's own dispatch — it has two
// sites shaped exactly like the dispatch's suspected-live-bug example (col === 'var(--text3)' ?
// 'transparent' : col + '22', lines 670 and 857). Traced both to their color source
// (metricColor/vpColor, lines 216-222 and 577-583): each returns EITHER a hex literal OR the
// exact literal string 'var(--text3)' -- no other var() shape is reachable from either function.
// The ternary already intercepts that one var() case before the concat runs, so `col`/
// `vpColor(val, m)` is provably a hex literal on every path that reaches the `+ '18'`/`+ '22'`.
// Confirmed false alarm, not a live bug -- left as two of the counted sites below rather than
// "fixed," per this ratchet's own scope (a false alarm is counted like the rest, not
// special-cased just because it was investigated).
//
// BOTH DIRECTIONS matter, same as sync-failure-watch.test.js and light-mode-white-alpha.test.js
// (the only two ratchets in this repo whose class has never recurred):
//   - count > CEILING → FAIL, naming the new file:line (a violation crept in)
//   - count < CEILING → FAIL, saying "lower the ceiling to N" (a stale ceiling is silent loss
//     of protection — a check that runs, passes, and cannot fail in the case it exists for)
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = 'src';
// Measured fresh against this branch, 2026-08-18; lowered 89->87 under #368 (dispatch fixing
// model-health-badge.js's own #351-shaped bug converted its 2 sites to withAlpha()). Fuzzy
// pattern (unlike R1/R3's clean literal matches) — hand-reviewed every candidate hit before
// trusting this number. See PATTERN below for exactly what counts as a hit.
const CEILING = 87;

// Matches `<value> + '<2 hex chars>'` (any quote style). Two shapes for <value>, alternated:
//   1. A literal var() reference — 'var(--crit)' + '18' — the dispatch's own #351/#368 example.
//   2. A bare identifier or the tail of a member/index chain (col, m.color, mCol[m]), or a
//      function call / parenthesized ternary of hex literals (vpColor(val, m),
//      (isRGR ? '#a78bfa' : '#60a5fa')) — i.e. the char immediately before the `+` is a word
//      character, `)`, or `]`. Covers every real shape found by hand-review: plain vars,
//      member/index chains, color-lookup function calls, and ternaries of hex literals.
// The trailing (['"`])[0-9a-fA-F]{2}\k<sq> requires the quoted suffix be EXACTLY 2 hex chars
// (the closing quote must land right after them) — '18px'/'6px'-style CSS lengths can't match.
// Shape 2 deliberately does NOT require the left side to already BE a var() reference: today's
// hex-literal sites are exactly the ones one config edit away from becoming tomorrow's
// #351/#368 (see header) — that's why they're counted here rather than excluded as
// "currently safe."
const PATTERN = /(?:(?<vq>['"`])var\(--[\w-]+\)\k<vq>|[)\]\w])\s*\+\s*(?<sq>['"`])[0-9a-fA-F]{2}\k<sq>/g;

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'changelog') return []; // __tests__: this file's own
      return walk(p);                                              // prose would self-match;
    }                                                               // changelog/: prose entries
    return name.endsWith('.js') && !name.endsWith('.test.js') ? [p] : [];
  });
}

function findHits() {
  const hits = [];
  for (const file of walk(ROOT)) {
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/^\s*\/\//.test(line)) return; // full-line comment — descriptive prose, not live code
      const matches = line.match(PATTERN);
      if (matches) for (const m of matches) hits.push(`${file}:${i + 1}  ${m.trim()}`);
    });
  }
  return hits;
}

describe('R4: no new color+hex-suffix string concatenation (var() silently drops, see #351/#368)', () => {
  it(`stays at exactly the measured ceiling (${CEILING}) — use withAlpha() (src/utils/fmt.js) for new alpha-tinted colors instead`, () => {
    const hits = findHits();
    if (hits.length > CEILING) {
      throw new Error(
        `${hits.length} color+hex-suffix concatenations in src/, ${hits.length - CEILING} more than ` +
        `the ceiling of ${CEILING}. New site(s):\n${hits.join('\n')}\n\n` +
        `Use withAlpha(color, hexSuffix) (src/utils/fmt.js) instead of concatenating a ` +
        `hex alpha suffix onto a color by hand — it handles both hex-literal and var() colors ` +
        `correctly. See #351/#368: the same concat trick that works on a hex literal produces the ` +
        `literal invalid string "var(--x)XX" on a var() reference, and the browser drops it silently.`
      );
    }
    if (hits.length < CEILING) {
      throw new Error(
        `Only ${hits.length} color+hex-suffix concatenations remain in src/ (ceiling was ${CEILING}) — ` +
        `some site(s) were converted to withAlpha() since the ceiling was last set. Lower CEILING to ` +
        `${hits.length} in this file so the ratchet doesn't leave slack for the class to regrow into. ` +
        `This is not a bug in your change; it's this ratchet's own upkeep.`
      );
    }
    expect(hits.length).toBe(CEILING);
  });

  it('sanity: the pattern actually matches something (would false-pass if the regex broke)', () => {
    expect(findHits().length).toBeGreaterThan(0);
  });
});
