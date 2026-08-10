import { describe, it, expect } from 'vitest';

// pipeline.js transitively imports morning-brief.js, which assigns `window.onerror` at module
// top level — harmless in a browser, but this suite runs under vitest's `node` environment
// (vite.config.ts), so `window` doesn't exist yet. Stub it before a dynamic import (NOT hoisted,
// unlike a static import) so that assignment has somewhere to land. Same pattern as the other
// pipeline-*.test.js files.
globalThis.window = globalThis.window || {};
const { buildStore } = await import('../engine/pipeline.js');

// #153 defect 1: buildStore used to read ds.targets[loc], ignoring settings.targets entirely —
// so App.js's mergedTargets (DEFAULT_TARGETS < ds.targets < ds.monthlyTargets < Targets-panel
// overrides < v2 monthly overrides) was computed on every render and thrown away. Every score
// and finding buildStore produces graded against whatever ds.targets/DEFAULT_TARGETS held, never
// the owner's approved monthly targets or Targets-panel edits.
const loc = '99999'; // not in DEFAULT_TARGETS — isolates the fallback chain from real store data

describe('buildStore — target layer precedence (#153 defect 1)', () => {
  it('settings.targets[loc] wins over ds.targets[loc] and DEFAULT_TARGETS', () => {
    const ds = { targets: { [loc]: { tOepe: 111 } } };
    const settings = { targets: { [loc]: { tOepe: 222 } } };
    const store = buildStore(loc, ds, settings);
    expect(store.t.tOepe).toBe(222);
  });

  it('falls back to ds.targets[loc] when settings.targets has nothing for this store', () => {
    const ds = { targets: { [loc]: { tOepe: 111 } } };
    const settings = { targets: {} };
    const store = buildStore(loc, ds, settings);
    expect(store.t.tOepe).toBe(111);
  });

  it('falls back to DEFAULT_TARGETS (empty object for an unknown store) when neither layer has it', () => {
    const store = buildStore(loc, { targets: {} }, { targets: {} });
    expect(store.t).toEqual({});
  });

  it('a real store still resolves to DEFAULT_TARGETS when no override exists at any layer', () => {
    const realLoc = '3708';
    const store = buildStore(realLoc, { targets: {} }, { targets: {} });
    expect(store.t.tCrewLabor).toBe(0.21); // constants.js DEFAULT_TARGETS['3708'].tCrewLabor
  });
});
