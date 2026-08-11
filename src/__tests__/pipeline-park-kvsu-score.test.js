import { describe, it, expect } from 'vitest';
import { DEF_SETTINGS } from '../constants.js';

// pipeline.js transitively imports morning-brief.js, which assigns `window.onerror` at module
// top level — harmless in a browser, but this suite runs under vitest's `node` environment
// (vite.config.ts), so `window` doesn't exist yet. Stub it before a dynamic import (NOT hoisted,
// unlike a static import) so that assignment has somewhere to land. Same pattern as the other
// pipeline-*.test.js files.
globalThis.window = globalThis.window || {};
const { computeOpsScore } = await import('../engine/pipeline.js');

// #150/#178 item 6: park and kvsu were both gated on `p.X>0`, which rejects a genuine 0 (never
// parked a car / never used the 2nd-side KVS window) the same way METRIC_SOURCES' old
// mode:'pos' did — a real, bad value discarded as "no data" instead of graded on its merits.
// park was ALSO graded strictly lower-is-better (<=target always full credit, however far
// below) when it should be a BAND: under-parking backs up the physical drive-thru line, so it's
// now penalized on a tighter tolerance than over-parking.
const sc = DEF_SETTINGS.scoring;
const t = { tPark: 0.15, tKvsu: 0.7 };

describe('computeOpsScore — park is a band, not a slope (#150/#178 item 6)', () => {
  it('at target scores full credit', () => {
    const s = computeOpsScore({ park: 0.15 }, t, sc);
    expect(s).toBe(100);
  });

  it('a genuine 0% park (never parks a car) is the WORST case, not a perfect score', () => {
    // Under the old lower-is-better formula, park<=tPark (0<=0.15) scored FULL credit — the
    // exact inversion of what #150 flags. Backing up the whole DT line every time is bad.
    const s = computeOpsScore({ park: 0 }, t, sc);
    expect(s).toBe(0);
  });

  it('slightly under target (within the tighter under-tolerance) still scores full credit', () => {
    const s = computeOpsScore({ park: 0.13 }, t, sc); // 2pp under, underTol = 0.15*0.3/2 = 2.25pp
    expect(s).toBe(100);
  });

  it('moderately under target (beyond under-tolerance) scores partial, not zero', () => {
    const s = computeOpsScore({ park: 0.12 }, t, sc); // 3pp under, beyond 2.25pp underTol
    expect(s).toBeGreaterThan(0);
    expect(s).toBeLessThan(100);
  });

  it('over target within the wider over-tolerance still scores full credit', () => {
    const s = computeOpsScore({ park: 0.19 }, t, sc); // 4pp over, overTol = 0.15*0.3 = 4.5pp
    expect(s).toBe(100);
  });

  it('under-tolerance is tighter than over-tolerance — same distance from target scores worse below', () => {
    const under3pp = computeOpsScore({ park: 0.12 }, t, sc); // 3pp under
    const over3pp = computeOpsScore({ park: 0.18 }, t, sc);  // 3pp over
    expect(under3pp).toBeLessThanOrEqual(over3pp);
  });

  it('no park points scored when the target is missing — max stays 0', () => {
    const s = computeOpsScore({ park: 0.15 }, {}, sc);
    expect(s).toBe(50); // neutral fallback, matching computeCtrlScore's own no-data convention
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
