// @ts-nocheck
// Dispatch #72 A2 -- fob-eom.js's analyzeData({contributors, onHand, summary, variance, pl})
// returned `{ ..., period, ... }` without `period` ever being a parameter or a local: an
// unconditional ReferenceError on every call (analyzeData has no early return before that
// line -- confirmed by reading the full function body). The calling component (FOBEOMPanel)
// already computes its OWN `period` via filename-parsing, so the fix is to thread it through
// as an explicit parameter rather than reading an outer scope that never existed inside
// analyzeData's own closure.
//
// analyzeData is exported solely for this test (see fob-eom.js) -- it's a pure function and
// this is the exact call the ReferenceError lived in; the single call site inside FOBEOMPanel
// (the `analysis` useMemo) was read directly to confirm it now passes `period` explicitly and
// carries it in its dependency array, since simulating a real .xlsx upload through
// FileReader/XLSX.read to reach the same line via the full UI would test file-parsing, not
// this fix.
import { describe, it, expect } from 'vitest';
import { analyzeData } from '../views/fob-eom.js';

describe('analyzeData period threading (dispatch #72 A2)', () => {
  it('does not throw and echoes the passed-in period', () => {
    const contributors = [{ cat: 'Food Over Base', val: 1.2 }, { cat: 'Total Food Cost', val: 30.1 }];
    expect(() => analyzeData({
      contributors, onHand: [], summary: [], variance: [], pl: null, period: 'July 2026',
    })).not.toThrow();
    const out = analyzeData({
      contributors, onHand: [], summary: [], variance: [], pl: null, period: 'July 2026',
    });
    expect(out.period).toBe('July 2026');
  });

  it('still returns a usable analysis when no files carried a parseable period (falls back upstream, not here)', () => {
    const out = analyzeData({
      contributors: [], onHand: [], summary: [], variance: [], pl: null, period: 'Current Month',
    });
    expect(out.period).toBe('Current Month');
    expect(out.recountList).toEqual([]);
  });
});
