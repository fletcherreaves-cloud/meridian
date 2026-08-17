// @ts-nocheck
// The version in the app footer and the changelog were two hand-maintained values, and by
// 2026-08-08 they had drifted 20 versions apart: the footer read 4.881 while 4.909 was deployed.
// That is worse than having no version at all — the owner hard-refreshed to pick up a fix, saw
// 4.881, and reasonably concluded the refresh had failed.
//
// MERIDIAN_VERSION is derived from LATEST_CHANGELOG_ENTRY, never typed separately, so adding a
// changelog entry IS the version bump and the two cannot disagree.
//
// R6 (dispatch16, 2026-08-17) split what used to be one 1449-line changelog-data.js array into
// one file per version under src/app/changelog/ — every PR appending to the SAME array tail was
// the direct cause of five sequential rebases in one morning (dispatch15/16). This file now
// validates STRUCTURAL properties of that split (one version per file, filename matches the
// version it declares, no two files claim the same version, every entry well-formed). The
// "changelog-latest.js is in sync with the newest version" check — the direct descendant of what
// this file used to do as a byte-for-byte comparison against one big array — moved to
// changelog-latest-sync.test.js, since it now runs the real generator (scripts/gen-changelog-
// latest.mjs) instead of re-deriving max-version logic a second time here.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';

const DIR = 'src/app/changelog';
const files = readdirSync(DIR).filter(f => f !== 'index.js' && f.endsWith('.js'));

const entries = files.map(f => {
  const src = readFileSync(`${DIR}/${f}`, 'utf8');
  const m = src.match(/export default \{version:'([^']+)', date:'([^']*)',\s*changes:\s*\[/);
  return { file: f, src, version: m?.[1], date: m?.[2] };
});

describe('changelog / per-version files (R6)', () => {
  it('found a non-trivial number of version files (sanity check)', () => {
    expect(files.length).toBeGreaterThan(300);
  });

  it('every file parses a version, an ISO date, and opens a changes array', () => {
    for (const e of entries) {
      expect(e.version, `${e.file}: could not find version`).toBeTruthy();
      expect(e.date, `${e.file}: malformed or missing date`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('every file has at least one change line', () => {
    for (const e of entries) {
      const changesBlock = e.src.slice(e.src.indexOf('changes:['));
      const lines = [...changesBlock.matchAll(/^\s*'(?:[^'\\]|\\.)*',?\s*$/gm)];
      expect(lines.length, `${e.file}: no change lines found`).toBeGreaterThan(0);
    }
  });

  it("each file's name matches the version it declares (one file per version, structurally)", () => {
    const mismatches = entries
      .filter(e => e.file.replace(/\.js$/, '') !== e.version)
      .map(e => `${e.file} declares version:'${e.version}'`);
    expect(mismatches, 'filename must equal the declared version — this is what makes "one file per version" a guarantee rather than a convention').toEqual([]);
  });

  it('no two files declare the same version (a real version-picking collision, not just a filename clash)', () => {
    const seen = new Map();
    const dupes = [];
    for (const e of entries) {
      if (seen.has(e.version)) dupes.push(`${e.version}: ${seen.get(e.version)} and ${e.file}`);
      else seen.set(e.version, e.file);
    }
    expect(dupes, 'duplicate changelog versions across different files').toEqual([]);
  });

  it('App.js derives MERIDIAN_VERSION from LATEST_CHANGELOG_ENTRY, never types it separately', () => {
    const APP_SRC = readFileSync('src/app/App.js', 'utf8');
    // A literal here is the exact failure mode this guards: it compiles, ships, and lies.
    expect(APP_SRC).toMatch(/const MERIDIAN_VERSION\s*=\s*LATEST_CHANGELOG_ENTRY\.version;/);
    expect(APP_SRC).toMatch(/const MERIDIAN_BUILD_DATE\s*=\s*LATEST_CHANGELOG_ENTRY\.date;/);
    expect(APP_SRC, 'MERIDIAN_VERSION must not be a hardcoded string')
      .not.toMatch(/const MERIDIAN_VERSION\s*=\s*'[0-9]/);
  });

  it('App.js imports LATEST_CHANGELOG_ENTRY from changelog-latest.js, never from the per-version changelog directory', () => {
    const APP_SRC = readFileSync('src/app/App.js', 'utf8');
    // The whole point of the split: src/app/changelog/ (403+ files of prose) must have exactly
    // one importer, the lazy changelog-panel.js. If App.js ever reaches into that directory
    // directly — even just for one version's date — every file in it gets pulled into the eager
    // entry chunk regardless of which export is used (the INEFFECTIVE_DYNAMIC_IMPORT class of
    // bug #207/#230 both fixed).
    expect(APP_SRC).toMatch(/import\s*\{\s*LATEST_CHANGELOG_ENTRY\s*\}\s*from\s*'\.\/changelog-latest\.js'/);
    expect(APP_SRC, "App.js must not import from src/app/changelog/ — that reintroduces the chunking hazard this split exists to avoid")
      .not.toMatch(/from\s*'\.\/changelog\//);
  });

  it('changelog-panel.js (the About modal, lazy) is the only static importer of the changelog directory', () => {
    const PANEL_SRC = readFileSync('src/app/changelog-panel.js', 'utf8');
    expect(PANEL_SRC).toMatch(/import\s*\{\s*MERIDIAN_CHANGELOG\s*\}\s*from\s*'\.\/changelog\/index\.js'/);
  });

  it('changelog-latest.js does not import from the per-version changelog directory (would defeat the split)', () => {
    const LATEST_SRC = readFileSync('src/app/changelog-latest.js', 'utf8');
    expect(LATEST_SRC).not.toMatch(/from\s*'\.\/changelog\//);
  });

  it('changelog-panel.js sorts MERIDIAN_CHANGELOG newest-first before rendering', () => {
    // import.meta.glob's return order is not version order (it's whatever the glob mechanism
    // returns, typically path-sort order — '5.10.js' would sort before '5.9.js' as plain
    // strings) — this is the guard that display order still comes out newest-first regardless.
    const PANEL_SRC = readFileSync('src/app/changelog-panel.js', 'utf8');
    expect(PANEL_SRC, 'changelog-panel.js must sort MERIDIAN_CHANGELOG before rendering it')
      .toMatch(/MERIDIAN_CHANGELOG\.slice\(\)\.sort\(/);
  });
});
