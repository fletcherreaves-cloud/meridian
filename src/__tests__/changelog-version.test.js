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
// entry is byte-for-byte the same as whichever entry in the full array carries the highest
// version number (the "keep them in sync" contract changelog-data.js's own header comment
// documents).
//
// Changelog-restructure fix (2026-08-12): changelog-data.js is now append-only — a new entry
// lands at the END of the array, not interleaved into version order, so four PRs open at once
// stop colliding on the same top-of-array insertion line. That means the array is no longer
// guaranteed sorted, so "matches the newest entry" is found by MAX version, not by position
// (first or last), and changelog-panel.js is responsible for sorting newest-first at render —
// guarded below by a source-parse check that it actually does.

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

  it('LATEST_CHANGELOG_ENTRY (changelog-latest.js) matches the MAX-version entry in MERIDIAN_CHANGELOG (changelog-data.js) exactly', () => {
    // The two are maintained as separate literals on purpose (see changelog-data.js's header) —
    // this is the guard that catches drift between them, the same class of bug this whole file
    // exists to prevent for MERIDIAN_VERSION vs the footer. Found by MAX version, not by array
    // position (first or last) — the array is append-only now (see changelog-data.js's header),
    // so the newest entry's physical position isn't guaranteed.
    const latestBlock = (() => {
      const marker = 'export const LATEST_CHANGELOG_ENTRY = ';
      const i = LATEST_SRC.indexOf(marker);
      expect(i, 'LATEST_CHANGELOG_ENTRY not found in changelog-latest.js').toBeGreaterThan(-1);
      return LATEST_SRC.slice(i + marker.length).replace(/;\s*$/, '');
    })();
    const maxVersion = versions.reduce((best, v) => {
      const [bMaj, bMin] = asNum(best);
      const [vMaj, vMin] = asNum(v);
      return (vMaj > bMaj || (vMaj === bMaj && vMin > bMin)) ? v : best;
    });
    const dataMaxEntryBlock = (() => {
      const marker = `{version:'${maxVersion}',`;
      const entryStart = DATA_SRC.indexOf(marker);
      expect(entryStart, `entry for max version ${maxVersion} not found`).toBeGreaterThan(-1);
      const entryEnd = DATA_SRC.indexOf('\n  ]},', entryStart) + '\n  ]}'.length;
      return DATA_SRC.slice(entryStart, entryEnd);
    })();
    expect(latestBlock.trim()).toBe(dataMaxEntryBlock.trim());
  });

  it('changelog-panel.js sorts MERIDIAN_CHANGELOG newest-first before rendering', () => {
    // The array itself is append-only (no longer guaranteed sorted) — this is the guard that
    // display order still comes out newest-first, since the raw array can't be trusted to.
    const PANEL_SRC = readFileSync('src/app/changelog-panel.js', 'utf8');
    expect(PANEL_SRC, 'changelog-panel.js must sort MERIDIAN_CHANGELOG before rendering it')
      .toMatch(/MERIDIAN_CHANGELOG\.slice\(\)\.sort\(/);
  });

  it('has no duplicate versions', () => {
    const dupes = versions.filter((v, i) => versions.indexOf(v) !== i);
    expect([...new Set(dupes)], 'duplicate changelog versions').toEqual([]);
  });

  // Dispatch14 — four PRs independently picked v5.029 and CI was green on every one of them,
  // because this file only ever checked the two files agree with EACH OTHER, never that the
  // version actually moved forward. A duplicate-versus-itself is invisible to a same-file dupe
  // check when the collision is between BRANCHES, not within one branch's own array — each PR's
  // CI only ever saw its own single new entry, and "no duplicate versions" only catches a repeat
  // that's already IN that one array — it says nothing about whether the newest entry actually
  // advanced past the one before it.
  //
  // Scoped to the LAST TWO entries only, not the whole array: the append-only convention (#230,
  // 2026-08-12) guarantees the newest entry is always the last one, so that's the only pair that
  // matters for "did this addition move the version forward" — and checking the whole array
  // instead is actively wrong here, since real pre-#230 history is NOT in strictly increasing
  // array order (confirmed: the unmodified array fails a whole-array monotonic check at entry 1,
  // v5.003 after v5.004 — version numbers moved around before appends were ordered).
  //
  // Verified this goes red: temporarily appended a second entry with the SAME version as the
  // (then-)newest one and confirmed this assertion fails (v5.031 not strictly greater than
  // v5.031) — then reverted.
  it('the newest MERIDIAN_CHANGELOG entry is strictly greater than the one before it', () => {
    expect(versions.length, 'need at least 2 entries to check monotonicity').toBeGreaterThanOrEqual(2);
    const prev = versions[versions.length - 2], newest = versions[versions.length - 1];
    const [prevMaj, prevMin] = asNum(prev);
    const [newMaj, newMin] = asNum(newest);
    const increasing = newMaj > prevMaj || (newMaj === prevMaj && newMin > prevMin);
    expect(increasing,
      `newest entry v${newest} is not strictly greater than the previous entry v${prev} — ` +
      'a duplicate or backwards version landed at the end of the append-only array'
    ).toBe(true);
  });

  it('LATEST_CHANGELOG_ENTRY.version equals the LAST entry in MERIDIAN_CHANGELOG (append-only, so last == newest)', () => {
    const latestVersionMatch = LATEST_SRC.match(/LATEST_CHANGELOG_ENTRY\s*=\s*\{version:'([0-9.]+)'/);
    expect(latestVersionMatch, 'could not find LATEST_CHANGELOG_ENTRY.version').toBeTruthy();
    expect(latestVersionMatch[1]).toBe(versions[versions.length - 1]);
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
