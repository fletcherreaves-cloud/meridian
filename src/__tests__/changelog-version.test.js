// @ts-nocheck
// The version in the app footer and the changelog were two hand-maintained values, and by
// 2026-08-08 they had drifted 20 versions apart: the footer read 4.881 while 4.909 was deployed.
// That is worse than having no version at all — the owner hard-refreshed to pick up a fix, saw
// 4.881, and reasonably concluded the refresh had failed.
//
// MERIDIAN_VERSION is derived from LATEST_CHANGELOG_ENTRY, never typed separately, so adding a
// changelog entry IS the version bump and the two cannot disagree.
//
// #230 (2026-08-12) split what used to be one array in App.js into three files, to get the
// ~98 KB-gzipped, 366-entry changelog OUT of the entry chunk without losing that guarantee:
//   - changelog-latest.js  — LATEST_CHANGELOG_ENTRY only, statically imported by App.js
//   - changelog-data.js    — the full MERIDIAN_CHANGELOG array, imported only by the lazy
//                            changelog-panel.js (About modal) — App.js must NOT import this
//                            file, or the "same module reached both statically and dynamically"
//                            chunking hazard pulls the whole 98 KB back into the entry chunk
//   - App.js               — derives MERIDIAN_VERSION/MERIDIAN_BUILD_DATE from
//                            LATEST_CHANGELOG_ENTRY, never a literal
// These tests parse all three as text (App.js is a huge React module that can't be imported in
// a bare node environment) and enforce every property that split depends on: the two changelog
// files exist and are well-formed, App.js derives from the small one only, and the small one's
// entry is byte-for-byte the same as the full array's first entry (the "keep them in sync"
// contract changelog-data.js's own header comment documents).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const APP_SRC = readFileSync('src/app/App.js', 'utf8');
const DATA_SRC = readFileSync('src/app/changelog-data.js', 'utf8');
const LATEST_SRC = readFileSync('src/app/changelog-latest.js', 'utf8');

const DATA_BLOCK = (() => {
  const marker = 'export const MERIDIAN_CHANGELOG = [';
  const i = DATA_SRC.indexOf(marker);
  expect(i, 'MERIDIAN_CHANGELOG not found in changelog-data.js').toBeGreaterThan(-1);
  return DATA_SRC.slice(i, DATA_SRC.indexOf('\n];', i));
})();

const versions = [...DATA_BLOCK.matchAll(/version:'([0-9.]+)'/g)].map(m => m[1]);
const asNum = v => v.split('.').map(Number);

describe('changelog / version', () => {
  it('App.js derives MERIDIAN_VERSION from LATEST_CHANGELOG_ENTRY, never types it separately', () => {
    // A literal here is the exact failure mode this guards: it compiles, ships, and lies.
    expect(APP_SRC).toMatch(/const MERIDIAN_VERSION\s*=\s*LATEST_CHANGELOG_ENTRY\.version;/);
    expect(APP_SRC).toMatch(/const MERIDIAN_BUILD_DATE\s*=\s*LATEST_CHANGELOG_ENTRY\.date;/);
    expect(APP_SRC, 'MERIDIAN_VERSION must not be a hardcoded string')
      .not.toMatch(/const MERIDIAN_VERSION\s*=\s*'[0-9]/);
  });

  it('App.js imports LATEST_CHANGELOG_ENTRY from changelog-latest.js, never from changelog-data.js', () => {
    // The whole point of the split (#230): changelog-data.js (the 98 KB array) must have
    // exactly one importer (the lazy changelog-panel.js). If App.js ever imports it directly —
    // even just for LATEST_CHANGELOG_ENTRY — the module is reached by both a static and a
    // dynamic import path, and bundlers pull it into the eager entry chunk regardless of which
    // export is used, silently undoing the whole fix.
    expect(APP_SRC).toMatch(/import\s*\{\s*LATEST_CHANGELOG_ENTRY\s*\}\s*from\s*'\.\/changelog-latest\.js'/);
    expect(APP_SRC, "App.js must not import changelog-data.js — that reintroduces the chunking hazard this split exists to avoid")
      .not.toMatch(/from\s*'\.\/changelog-data\.js'/);
  });

  it('changelog-panel.js (the About modal, lazy) is the only static importer of changelog-data.js', () => {
    const PANEL_SRC = readFileSync('src/app/changelog-panel.js', 'utf8');
    expect(PANEL_SRC).toMatch(/import\s*\{\s*MERIDIAN_CHANGELOG\s*\}\s*from\s*'\.\/changelog-data\.js'/);
  });

  it('changelog-latest.js does not import from changelog-data.js (would defeat the split)', () => {
    expect(LATEST_SRC).not.toMatch(/from\s*'\.\/changelog-data\.js'/);
  });

  it('LATEST_CHANGELOG_ENTRY (changelog-latest.js) matches MERIDIAN_CHANGELOG[0] (changelog-data.js) exactly', () => {
    // The two are maintained as separate literals on purpose (see changelog-data.js's header) —
    // this is the guard that catches drift between them, the same class of bug this whole file
    // exists to prevent for MERIDIAN_VERSION vs the footer.
    const latestBlock = (() => {
      const marker = 'export const LATEST_CHANGELOG_ENTRY = ';
      const i = LATEST_SRC.indexOf(marker);
      expect(i, 'LATEST_CHANGELOG_ENTRY not found in changelog-latest.js').toBeGreaterThan(-1);
      return LATEST_SRC.slice(i + marker.length).replace(/;\s*$/, '');
    })();
    const dataFirstEntryBlock = (() => {
      const marker = 'export const MERIDIAN_CHANGELOG = [';
      const i = DATA_SRC.indexOf(marker) + marker.length;
      const entryStart = DATA_SRC.indexOf('{version:', i);
      const entryEnd = DATA_SRC.indexOf('\n  ]},', entryStart) + '\n  ]}'.length;
      return DATA_SRC.slice(entryStart, entryEnd);
    })();
    expect(latestBlock.trim()).toBe(dataFirstEntryBlock.trim());
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
    const entries = [...DATA_BLOCK.matchAll(/\{version:'([0-9.]+)', date:'([^']*)'/g)];
    expect(entries.length).toBe(versions.length);
    for (const [, v, d] of entries) {
      expect(d, `entry ${v} has a malformed date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    // Each entry opens a changes array. Count only those bound to a version header, since the
    // surrounding file legitimately contains other `changes:[` occurrences.
    const withChanges = [...DATA_BLOCK.matchAll(/\{version:'[0-9.]+', date:'[^']*',\s*changes:\s*\[/g)];
    expect(withChanges.length).toBe(versions.length);
  });
});
