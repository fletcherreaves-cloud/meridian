// @ts-nocheck
// R6 (dispatch16, 2026-08-17). scripts/gen-changelog-latest.mjs derives changelog-latest.js from
// the highest version under src/app/changelog/ — this test runs it in check mode (no --write) so
// a forgotten regen after adding a new version file fails the suite immediately, the same shape
// as gen-loader-emits.mjs's own drift protection. This is the "keep the two in sync" guard that
// used to live in changelog-version.test.js as a byte-for-byte comparison against one big array;
// splitting the changelog into one file per version made that comparison meaningless (there is no
// longer one array to diff against), so the sync check now runs the actual generator instead of
// re-deriving its logic a second time in test code.
import { describe, it, expect } from 'vitest';
import { execSync } from 'node:child_process';

describe('changelog-latest.js is derived and in sync with src/app/changelog/', () => {
  it('gen-changelog-latest.mjs (check mode) reports the committed file up to date', () => {
    let out, failed = false;
    try {
      out = execSync('node scripts/gen-changelog-latest.mjs', { encoding: 'utf8' });
    } catch (e) {
      failed = true;
      out = (e.stdout || '') + (e.stderr || '');
    }
    expect(failed, `changelog-latest.js is stale — run 'node scripts/gen-changelog-latest.mjs --write'.\n${out}`).toBe(false);
  });
});
