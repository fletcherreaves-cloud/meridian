// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #72 C2 -- src/engine/pipeline.js's buildDS(workbooks) read `filename` (projections,
// inventory) and `file.name` (dar, pmix) without either ever being destructured from a
// `workbooks` entry (`for(const{wb,type}of workbooks)` -- no `filename`, and `file` was never
// a binding at all). Read the caller this codebase actually uses -- mergeDS(existing, wb,
// type, filename) (line ~478) -- which takes `filename` as an explicit parameter and handles
// these same four types identically. buildDS is its from-scratch-rebuild counterpart and is
// currently only ever invoked with an empty array (App.js:2066), so these branches are
// unreachable today, but the loop's own try/catch (line ~94) would silently swallow the
// ReferenceError/TypeError and drop the file the moment anything calls buildDS with real
// workbooks -- exactly the "quietly doesn't work" signature this whole dispatch chases.
//
// buildDS is exported. This calls it directly with one workbook entry per fixed type (an
// empty-but-well-formed SheetNames/Sheets shape, which every parser involved already handles
// gracefully with no data -- confirmed by reading parseDARData/parsePMixData/
// parseProjectionsFile/parseInventoryData), spies on console.warn (the catch's own logger,
// which only fires on a real exception), and asserts it's never called -- plus checks
// ds.pmixData actually keys off the real filename, not just "didn't throw".
import { describe, it, expect, vi } from 'vitest';
import { buildDS } from '../engine/pipeline.js';

const emptyWb = () => ({ SheetNames: [], Sheets: {} });

describe('buildDS threads filename through instead of reading a free variable (dispatch #72 C2)', () => {
  it('parses projections/inventory/dar/pmix entries without hitting the catch-all warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const workbooks = [
      { wb: emptyWb(), type: 'projections', filename: 'July 2026 - Restaurant Projections.xlsx' },
      { wb: emptyWb(), type: 'inventory',   filename: '10422 - Inventory.xlsx' },
      { wb: emptyWb(), type: 'dar',         filename: 'Daily_Activity_Report_20260310.xlsx' },
      { wb: emptyWb(), type: 'pmix',        filename: 'Product_Mix_20260310.xlsx' },
    ];

    let ds;
    expect(() => { ds = buildDS(workbooks); }).not.toThrow();

    expect(warnSpy).not.toHaveBeenCalled();
    expect(ds.pmixData['Product_Mix_20260310.xlsx']).toBeTruthy();

    warnSpy.mockRestore();
  });
});
