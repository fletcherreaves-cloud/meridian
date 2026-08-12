// @ts-nocheck
// #232 — analytics.js (316 KB raw), projections.js, and pace-to-target.js were all pulled into
// the entry chunk by a plain `import {...} from '...'` in App.js that co-existed with (or stood
// in for) a lazyPanel() registration. A module reached by any static path is bundled eagerly
// regardless of how many dynamic import() paths also reach it — the same INEFFECTIVE_DYNAMIC_IMPORT
// class of bug #207 fixed for inventory.js/one-pager.js/above-store-onepager.js and #230 fixed for
// changelog-data.js. This guards the invariant going forward: once a source file is wrapped in
// lazyPanel() (referenced via a bare `import('./x.js')` or a shared `_group()` loader function),
// App.js must never also reach that same file through a static top-level import.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/app/App.js', 'utf8');

// Resolve `_analytics`/`_laborTools`/etc. group loaders: `const _x = () => import('path.js');`
const GROUP_LOADERS = {};
for (const m of SRC.matchAll(/const\s+(_\w+)\s*=\s*\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)/g)) {
  GROUP_LOADERS[m[1]] = m[2];
}

// Every lazyPanel(...) call resolves to a source path, either directly:
//   lazyPanel(() => import('../views/x.js').then(...))
// or via a group loader:
//   lazyPanel(() => _analytics().then(...))
const lazyPaths = new Set();
for (const m of SRC.matchAll(/lazyPanel\(\(\)\s*=>\s*import\(['"]([^'"]+)['"]\)/g)) {
  lazyPaths.add(m[1]);
}
for (const m of SRC.matchAll(/lazyPanel\(\(\)\s*=>\s*(_\w+)\(\)/g)) {
  const path = GROUP_LOADERS[m[1]];
  if (path) lazyPaths.add(path);
}

// Every static top-level import: `import ... from '../views/x.js';` (not import(...))
const staticPaths = new Set();
for (const m of SRC.matchAll(/^import\s+[^(][^;]*\sfrom\s+['"]([^'"]+)['"]/gm)) {
  staticPaths.add(m[1]);
}

// Normalize both sets to a comparable form (relative to src/app/, resolved to src/...)
function resolve(p) {
  // App.js lives in src/app/ — '../views/x.js' -> 'src/views/x.js', './x.js' -> 'src/app/x.js'
  const parts = ('src/app/' + p).split('/');
  const out = [];
  for (const part of parts) {
    if (part === '.') continue;
    if (part === '..') out.pop();
    else out.push(part);
  }
  return out.join('/');
}

describe('lazyPanel() modules are never also statically imported by App.js (#232)', () => {
  it('found at least one lazy-loaded panel group (sanity check the parser above still works)', () => {
    expect(lazyPaths.size).toBeGreaterThan(10);
  });

  it('analytics.js, projections.js, and pace-to-target.js are lazy-loaded, not static', () => {
    const resolvedLazy = [...lazyPaths].map(resolve);
    expect(resolvedLazy).toContain('src/views/analytics.js');
    expect(resolvedLazy).toContain('src/features/projections.js');
    expect(resolvedLazy).toContain('src/views/pace-to-target.js');
  });

  it('no lazyPanel()-registered source file is also a static import target', () => {
    const resolvedStatic = new Set([...staticPaths].map(resolve));
    const violations = [...lazyPaths]
      .map(resolve)
      .filter(p => resolvedStatic.has(p));
    expect(violations, `these lazy-registered modules are ALSO statically imported, which defeats the split: ${violations.join(', ')}`).toEqual([]);
  });
});
