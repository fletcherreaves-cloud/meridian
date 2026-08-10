import { describe, it, expect } from 'vitest';
import { DEFAULT_TARGETS, DEF_SETTINGS } from '../constants.js';

// pipeline.js transitively imports morning-brief.js, which assigns `window.onerror` at module
// top level — stub before the dynamic import, same pattern as the other pipeline-*.test.js files.
globalThis.window = globalThis.window || {};
const { computeOpsScore } = await import('../engine/pipeline.js');

// #153 defect 2: computeOpsScore used to grade labor against t.tLabor, a field the monthly
// approval cycle never populates. This locks in that it now grades against the resolver's
// output (tCrewLabor) instead — using store 33222 (Elgin), whose real DEFAULT_TARGETS fixture
// has the two fields 1.75pp apart (tLabor 21.50%, tCrewLabor 23.25%), the largest measured gap
// in the issue's 27-store baseline.
const t = DEFAULT_TARGETS['33222'];
const sc = DEF_SETTINGS.scoring;

describe('computeOpsScore — labor component grades on the resolver (#153 defect 2)', () => {
  it('a laborPct that is within T1 of tLabor but only T2 of tCrewLabor scores the LOWER tier', () => {
    // laborPct 0.22: |0.22-tLabor(0.215)|=0.005 (T1, full points) vs |0.22-tCrewLabor(0.2325)|=0.0125 (T2).
    expect(t.tLabor).toBe(0.215);
    expect(t.tCrewLabor).toBe(0.2325);
    const p = { laborPct: 0.22 };
    const preFixLaborPoints = sc.laborMaxPts; // what the old t.tLabor read would have scored (T1, full points)
    const score = computeOpsScore(p, t, sc);
    // Only the labor component is present, so score === that component's points/max*100.
    expect(score).toBe(+(sc.laborT1pts / sc.laborMaxPts * 100).toFixed(1));
    expect(score).not.toBe(+(preFixLaborPoints / sc.laborMaxPts * 100).toFixed(1));
  });

  it('no labor points awarded when tCrewLabor is missing, even if tLabor is present', () => {
    const p = { laborPct: 0.22 };
    const score = computeOpsScore(p, { tLabor: 0.215 }, sc); // no tCrewLabor
    expect(score).toBe(50); // max stays 0 → neutral fallback, matching computeCtrlScore's convention
  });
});
