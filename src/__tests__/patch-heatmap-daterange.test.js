// @ts-nocheck
// #231 — Patch Heatmap accepted a `dateRange` prop and never referenced it again in the file;
// at-a-glance.js passed it in faithfully, the grid silently dropped it. Live evidence: an 8-day
// window and a 32-day window produced byte-identical output on every store (same worst
// dimension, same tally, down to the individual cell). Traced to root cause, not assumed: NONE
// of the 5 dimensions are actually period-scoped —
//   Sales             — pipeline.js buildStore's matched-day, fixed trailing 28 days
//   FOB               — fobByStoreLatest, latest snapshot only, not a window at all
//   Labor/Speed/Ctrl  — pipeline.js buildStore's compute6wk(), fixed trailing weeksBack weeks
// — all relative to "now," none to the page's date-range selector. The fix removes the dead
// prop entirely (both the component's destructure and at-a-glance.js's call site) rather than
// leaving a control that looks live and does nothing — the exact failure class this test
// guards against reintroducing.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { storeDimensions, patchDimensions, bandFromGap } from '../views/patch-heatmap.js';

const PATCH_SRC = readFileSync('src/views/patch-heatmap.js', 'utf8');
const AAG_SRC = readFileSync('src/views/at-a-glance.js', 'utf8');

describe('Patch Heatmap does not accept a dateRange prop (#231)', () => {
  it('PatchHeatmap\'s signature does not destructure dateRange', () => {
    const sig = PATCH_SRC.match(/export function PatchHeatmap\(\{([^}]*)\}\)/);
    expect(sig, 'PatchHeatmap export not found').not.toBeNull();
    expect(sig[1]).not.toMatch(/\bdateRange\b/);
  });

  it('at-a-glance.js does not pass dateRange to PatchHeatmap', () => {
    const call = AAG_SRC.match(/h\(PatchHeatmap,\s*\{([^}]*)\}\)/);
    expect(call, 'PatchHeatmap call site not found in at-a-glance.js').not.toBeNull();
    expect(call[1]).not.toMatch(/\bdateRange\b/);
  });

  it('no UI string in the file falsely claims period-scoping ("this period" / "selected period")', () => {
    // These exact phrases were the symptom: empty states and tooltips asserting a scoping
    // that didn't exist. Guards against the copy drifting back to implying it without the
    // component actually accepting a dateRange again.
    expect(PATCH_SRC).not.toMatch(/this period/i);
    expect(PATCH_SRC).not.toMatch(/selected period/i);
  });
});

describe('storeDimensions / patchDimensions are pure functions of store/fobRow, not of any external "current period"', () => {
  it('storeDimensions given the identical store+fobRow twice always returns identical bands', () => {
    // Simulates what "changing the date-range selector" now correctly does to this grid:
    // nothing, because there is no dateRange input to change. Before the fix this was true
    // for the WRONG reason (a silently dropped prop); now it's true because it's the honest
    // contract — these functions take no period argument at all.
    const store = {
      pSales: 86500, pLY: 100000,
      t: { tFOBTarget: 0.04, tOepe: 120 },
      p: { laborPct: 0.25, oepe: 130 },
      ctrlScore: 72,
    };
    const fobRow = { fobPct: 0.045 };
    const a = storeDimensions(store, fobRow);
    const b = storeDimensions(store, fobRow);
    expect(a).toEqual(b);
  });

  it('storeDimensions has no 3rd parameter for a period/dateRange argument', () => {
    expect(storeDimensions.length).toBe(2); // (store, fobRow) only
  });

  it('patchDimensions has no 2nd parameter for a period/dateRange argument', () => {
    expect(patchDimensions.length).toBe(1); // (members) only
  });

  it('bandFromGap has no period argument — it is a pure gap->band conversion', () => {
    expect(bandFromGap.length).toBe(2); // (gap, badAt) only
  });
});
