// @ts-nocheck
// A leftover merge-conflict marker (`>>>>>>> ...`) almost shipped in changelog-latest.js during
// the 2026-08-12 rebase cycle, landing at STATEMENT level (outside any string) — that's what
// actually breaks the parse. `>>>>>>>` INSIDE a string literal is valid JS and always will be;
// it is not itself a syntax error and this guard doesn't need to (and can't meaningfully) catch
// that shape. `npm test` passed clean at the incident's commit anyway: changelog-version.test.js
// only ever reads these two files with `readFileSync` + regex, never as real JS, so nothing in
// the suite ever asked a parser to look at them. Only `npm run build` (which actually asks
// vite/rolldown to parse the module) caught it, and only because build happened to run after the
// bad commit rather than before. That's ordering luck, not a guard.
//
// The conflict marker was a one-off rebase accident, but it's not the standing risk this guard
// earns its keep on — an UNESCAPED APOSTROPHE is. Every entry here is a single-quoted string full
// of prose (`App.js's`, `SAGE's`, `the issue's`, `today's`, …), and each one is one missed
// backslash away from terminating its string early — a real syntax error, unlike the marker case
// above. That risk exists on every commit that adds a changelog entry, not just rebases.
//
// This file closes the gap: a real `import` forces the same parse a bundler would do, so a
// broken string literal (from a missed escape, most likely, or any other malformed entry) fails
// `npm test` immediately instead of waiting for someone to run a build. Both modules are plain
// data (no DOM/browser APIs), so importing them in a bare Vitest environment is safe — unlike
// App.js, which changelog-version.test.js's own header explains can't be imported directly.
import { describe, it, expect } from 'vitest';
import { LATEST_CHANGELOG_ENTRY } from '../app/changelog-latest.js';
import { MERIDIAN_CHANGELOG } from '../app/changelog/index.js';

describe('changelog modules actually parse as JS, not just as regex-matchable text', () => {
  it('changelog-latest.js imports cleanly and exports the expected shape', () => {
    // R6 (dispatch16): changelog-latest.js is generated and deliberately carries only
    // version+date now, not the newest entry's prose — App.js never read .changes (that was
    // #234: dead weight in the entry chunk every version file already carries once, correctly,
    // for the lazy changelog panel).
    expect(LATEST_CHANGELOG_ENTRY).toBeTruthy();
    expect(typeof LATEST_CHANGELOG_ENTRY.version).toBe('string');
    expect(LATEST_CHANGELOG_ENTRY.version).toMatch(/^\d+\.\d+$/);
    expect(LATEST_CHANGELOG_ENTRY.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('src/app/changelog/index.js (via import.meta.glob) imports cleanly and exports a well-formed array', () => {
    expect(Array.isArray(MERIDIAN_CHANGELOG)).toBe(true);
    // A parse failure in any one of the 400+ version files (most likely an unescaped apostrophe
    // terminating a string early, or a leftover conflict marker landing at statement level)
    // throws at import time, before this line ever runs — the count check below is just a
    // sanity floor on top of that. Each version file is independently tiny now, so this test
    // also proves the glob actually discovers all of them, not just a subset.
    expect(MERIDIAN_CHANGELOG.length).toBeGreaterThan(300);
    for (const entry of MERIDIAN_CHANGELOG) {
      expect(typeof entry.version).toBe('string');
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Array.isArray(entry.changes)).toBe(true);
      expect(entry.changes.length).toBeGreaterThan(0);
    }
  });
});
