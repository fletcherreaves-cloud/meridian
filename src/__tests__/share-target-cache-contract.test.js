// @ts-nocheck
// Guards a real, confirmed 4-month-silent regression (fixed 2026-11-17): public/sw.js's
// SHARE_CACHE constant and src/app/App.js's Web Share Target pickup code both hardcode the
// SAME Cache Storage name as a cross-file contract (a service worker can't be imported by the
// app bundle, so there's no shared source of truth short of a literal). sw.js's cache name got
// bumped from 'mf-share-v1' to 'mf-share-v4276' in v4.276 to force an unrelated SW re-install,
// and App.js was never updated to match -- every mobile share into Meridian silently vanished
// (no error, no visible failure) from 2026-07-03 until this test's own fix. Both sides now use
// a version-free name specifically so a future "just bump the SW version" edit can't collide
// with it again -- this test is what actually enforces that, since nothing else would catch a
// one-sided rename.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const swSrc = fs.readFileSync(path.join(process.cwd(), 'public', 'sw.js'), 'utf8');
const appSrc = fs.readFileSync(path.join(process.cwd(), 'src', 'app', 'App.js'), 'utf8');

describe('Web Share Target cache-name contract (public/sw.js <-> src/app/App.js)', () => {
  it('sw.js declares a SHARE_CACHE constant', () => {
    const m = swSrc.match(/const SHARE_CACHE\s*=\s*'([^']+)'/);
    expect(m).not.toBeNull();
  });

  it("App.js's pickup code opens the exact same cache name sw.js writes to", () => {
    const swName = swSrc.match(/const SHARE_CACHE\s*=\s*'([^']+)'/)?.[1];
    const appName = appSrc.match(/caches\.open\('(mf-share[^']*)'\)/)?.[1];
    expect(swName).toBeTruthy();
    expect(appName).toBeTruthy();
    expect(appName).toBe(swName);
  });
});
