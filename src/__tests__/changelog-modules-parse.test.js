// @ts-nocheck
// A leftover merge-conflict marker (`>>>>>>> ...`) almost shipped in changelog-latest.js during
// the 2026-08-12 rebase cycle. `npm test` passed clean at the time — changelog-version.test.js
// only ever reads these two files with `readFileSync` + regex, never as real JS, so a syntax
// error inside a string literal (an unescaped apostrophe, a stray conflict marker) is invisible
// to the whole suite. Only `npm run build` (which actually asks vite/rolldown to parse the
// module) caught it, and only because build happened to run after the bad commit rather than
// before. That's ordering luck, not a guard.
//
// This file closes the gap: a real `import` forces the same parse a bundler would do, so a
// broken string literal fails `npm test` immediately instead of waiting for someone to run a
// build. Both modules are plain data (no DOM/browser APIs), so importing them in a bare Vitest
// environment is safe — unlike App.js, which changelog-version.test.js's own header explains
// can't be imported directly.
import { describe, it, expect } from 'vitest';
import { LATEST_CHANGELOG_ENTRY } from '../app/changelog-latest.js';
import { MERIDIAN_CHANGELOG } from '../app/changelog-data.js';

describe('changelog modules actually parse as JS, not just as regex-matchable text', () => {
  it('changelog-latest.js imports cleanly and exports the expected shape', () => {
    expect(LATEST_CHANGELOG_ENTRY).toBeTruthy();
    expect(typeof LATEST_CHANGELOG_ENTRY.version).toBe('string');
    expect(LATEST_CHANGELOG_ENTRY.version).toMatch(/^\d+\.\d+$/);
    expect(LATEST_CHANGELOG_ENTRY.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(LATEST_CHANGELOG_ENTRY.changes)).toBe(true);
    expect(LATEST_CHANGELOG_ENTRY.changes.length).toBeGreaterThan(0);
    for (const c of LATEST_CHANGELOG_ENTRY.changes) expect(typeof c).toBe('string');
  });

  it('changelog-data.js imports cleanly and exports a well-formed array', () => {
    expect(Array.isArray(MERIDIAN_CHANGELOG)).toBe(true);
    // A parse failure (syntax error, stray conflict marker) throws at import time, before this
    // line ever runs — the count check below is just a sanity floor on top of that.
    expect(MERIDIAN_CHANGELOG.length).toBeGreaterThan(300);
    for (const entry of MERIDIAN_CHANGELOG) {
      expect(typeof entry.version).toBe('string');
      expect(entry.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Array.isArray(entry.changes)).toBe(true);
      expect(entry.changes.length).toBeGreaterThan(0);
    }
  });
});
