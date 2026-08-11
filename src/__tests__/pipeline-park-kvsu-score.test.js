import { describe, it, expect } from 'vitest';
import { DEF_SETTINGS } from '../constants.js';

// pipeline.js transitively imports morning-brief.js, which assigns `window.onerror` at module
// top level — harmless in a browser, but this suite runs under vitest's `node` environment
// (vite.config.ts), so `window` doesn't exist yet. Stub it before a dynamic import (NOT hoisted,
// unlike a static import) so that assignment has somewhere to land. Same pattern as the other
// pipeline-*.test.js files.
globalThis.window = globalThis.window || {};
const { computeOpsScore } = await import('../engine/pipeline.js');

// #150/#178 item 6 gave kvsu a presence check instead of a truthy check (a genuine 0% — never
// used the 2nd-side KVS window — is a real failing value, not "no data"). #181 (2026-08-11) then
// REMOVED park from scoring entirely, reverting #150/#178 item 6's asymmetric park band (and a
// taper design that never shipped) — the owner's own explanation of what parking is FOR ("keep
// the wheels moving... park cars with complex orders") means park% can't be judged on one axis:
// a measured park%-vs-OEPE quadrant (engine/park-oepe-quadrant.js) showed the district's
// heaviest parkers also beat the median on flow (the tool working as intended), while several
// near-zero parkers sat at or below median flow — a band would have scored both as failures.
const sc = DEF_SETTINGS.scoring;
const t = { tPark: 0.15, tKvsu: 0.7 };

describe('computeOpsScore — park is NOT a scored component (#181)', () => {
  it('park data present, target present — score is identical to park being entirely absent', () => {
    const withPark = computeOpsScore({ park: 0.15 }, t, sc);
    const withoutPark = computeOpsScore({}, t, sc);
    expect(withPark).toBe(withoutPark);
  });

  it('any park value — 0%, at target, wildly over target — never changes the score', () => {
    const base = computeOpsScore({ tpph: 5 }, { ...t, tTpph: 5 }, sc);
    for (const park of [0, 0.05, 0.15, 0.3, 0.9]) {
      expect(computeOpsScore({ tpph: 5, park }, { ...t, tTpph: 5 }, sc)).toBe(base);
    }
  });

  it('a store with ONLY park data (no other scored metric) gets the neutral no-data fallback', () => {
    const s = computeOpsScore({ park: 0.15 }, t, sc);
    expect(s).toBe(50); // max stays 0 — same neutral convention as every other absent component
  });
});

describe('computeOpsScore — kvsu presence check (#150/#178 item 6)', () => {
  it('a genuine 0% kvsu (never uses the 2nd side) now scores as a real failing value', () => {
    const s = computeOpsScore({ kvsu: 0 }, t, sc);
    expect(s).toBe(0); // 0 < tKvsu*0.8 (0.56) → 0 of 6 points
  });

  it('kvsu at or above target scores full credit', () => {
    const s = computeOpsScore({ kvsu: 0.75 }, t, sc);
    expect(s).toBe(100);
  });

  it('a missing (null) kvsu contributes nothing — max stays 0', () => {
    const s = computeOpsScore({ kvsu: null }, t, sc);
    expect(s).toBe(50);
  });

  it('an undefined kvsu (field absent entirely) is treated the same as null', () => {
    const s = computeOpsScore({}, t, sc);
    expect(s).toBe(50);
  });
});
