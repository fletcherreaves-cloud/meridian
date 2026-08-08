// @ts-nocheck
// The version in the app footer and the changelog were two hand-maintained values, and by
// 2026-08-08 they had drifted 20 versions apart: the footer read 4.881 while 4.909 was deployed.
// That is worse than having no version at all — the owner hard-refreshed to pick up a fix, saw
// 4.881, and reasonably concluded the refresh had failed.
//
// MERIDIAN_VERSION is now DERIVED from MERIDIAN_CHANGELOG[0], so adding a changelog entry IS the
// version bump and the two cannot disagree. These tests parse App.js as text (it is a ~3800-line
// React module that cannot be imported in a bare node environment) and enforce the properties
// that derivation depends on: the list exists, is well-formed, and is sorted newest-first.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/app/App.js', 'utf8');
const BLOCK = (() => {
  const i = SRC.indexOf('const MERIDIAN_CHANGELOG  = [');
  expect(i, 'MERIDIAN_CHANGELOG not found in App.js').toBeGreaterThan(-1);
  return SRC.slice(i, SRC.indexOf('\n];', i));
})();

const versions = [...BLOCK.matchAll(/version:'([0-9.]+)'/g)].map(m => m[1]);
const asNum = v => v.split('.').map(Number);

describe('changelog / version', () => {
  it('MERIDIAN_VERSION is derived from the changelog, never typed separately', () => {
    // A literal here is the exact failure mode this guards: it compiles, ships, and lies.
    expect(SRC).toMatch(/const MERIDIAN_VERSION\s*=\s*MERIDIAN_CHANGELOG\[0\]\.version;/);
    expect(SRC).toMatch(/const MERIDIAN_BUILD_DATE\s*=\s*MERIDIAN_CHANGELOG\[0\]\.date;/);
    expect(SRC, 'MERIDIAN_VERSION must not be a hardcoded string')
      .not.toMatch(/const MERIDIAN_VERSION\s*=\s*'[0-9]/);
  });

  it('is derived AFTER the changelog is defined (temporal dead zone)', () => {
    // `const` is not hoisted with a value: referencing MERIDIAN_CHANGELOG above its declaration
    // is a runtime ReferenceError that builds perfectly cleanly. This ordering bug was made
    // twice in one day — here and in App.js's lazy panel declarations.
    expect(SRC.indexOf('const MERIDIAN_CHANGELOG  = ['))
      .toBeLessThan(SRC.indexOf('const MERIDIAN_VERSION    = MERIDIAN_CHANGELOG[0]'));
  });

  it('is sorted strictly newest-first', () => {
    for (let i = 1; i < versions.length; i++) {
      const [aMaj, aMin] = asNum(versions[i - 1]);
      const [bMaj, bMin] = asNum(versions[i]);
      const ok = aMaj > bMaj || (aMaj === bMaj && aMin > bMin);
      expect(ok, `out of order: ${versions[i - 1]} appears before ${versions[i]}`).toBe(true);
    }
  });

  it('has no duplicate versions', () => {
    const dupes = versions.filter((v, i) => versions.indexOf(v) !== i);
    expect([...new Set(dupes)], 'duplicate changelog versions').toEqual([]);
  });

  it('every entry has a version, an ISO date, and at least one change line', () => {
    const entries = [...BLOCK.matchAll(/\{version:'([0-9.]+)', date:'([^']*)'/g)];
    expect(entries.length).toBe(versions.length);
    for (const [, v, d] of entries) {
      expect(d, `entry ${v} has a malformed date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // Each entry opens a changes array. Count only those bound to a version header, since the
    // surrounding file legitimately contains other `changes:[` occurrences.
    const withChanges = [...BLOCK.matchAll(/\{version:'[0-9.]+', date:'[^']*',\s*changes:\s*\[/g)];
    expect(withChanges.length).toBe(versions.length);
  });
});
