// @ts-nocheck
// Notes 61 District View punch-list #12: Tishomingo (43380) showed "New Store"/model health null
// despite being open >1 year. Measured 2026-09-06: `recentOnly` in DEFAULT_MODEL_ASSIGNMENTS
// (constants.js) conflates two different situations — a genuinely new/ramp-up location with too
// little history for DI (Ponce de Leon, 43701, opened 2026-03-13, monthly/yearly n:0) and a
// long-open store where DI specifically isn't viable but real AE/DOW/LY calibration exists with
// n in the hundreds (Elgin 33222, Mossy Head 37566, Tishomingo 43380). modelHealthScore/
// computeModelHealth previously labeled all four "New Store" alike. This locks in the fix:
// only a store with zero real monthly/yearly calibration sample gets the "New Store" label;
// an established recentOnly store gets a distinct "DI N/A" label and a statement that doesn't
// claim it's new.
import { describe, it, expect } from 'vitest';
import { modelHealthScore, computeModelHealth } from '../engine/forecast.js';
import { DEFAULT_MODEL_ASSIGNMENTS } from '../constants.js';

const ds = { loaded: true, laborRows: [], opsRows: [], ctrlRows: [], weatherRows: [] };
const settingsNoDialedIn = { weekStartDay: 3, dialedInEnabled: true, dialedIn: {} };

describe('modelHealthScore — recentOnly stores with real long-run calibration', () => {
  it('Tishomingo (established, real monthly/yearly calibration) is NOT labeled New Store', () => {
    expect(DEFAULT_MODEL_ASSIGNMENTS['43380'].recentOnly).toBe(true);
    expect(DEFAULT_MODEL_ASSIGNMENTS['43380'].yearly.n).toBeGreaterThan(0);
    const h = modelHealthScore('43380', ds, settingsNoDialedIn);
    expect(h.score).toBeNull();               // still N/A — no numeric grade fabricated
    expect(h.longRunCalibrated).toBe(true);
    expect(h.grade.label).not.toBe('New Store');
    expect(h.statement).not.toMatch(/new or recently opened/i);
  });

  it('Elgin and Mossy Head (also established recentOnly stores) are NOT labeled New Store', () => {
    for (const loc of ['33222', '37566']) {
      expect(DEFAULT_MODEL_ASSIGNMENTS[loc].monthly.n).toBeGreaterThan(0);
      const h = modelHealthScore(loc, ds, settingsNoDialedIn);
      expect(h.longRunCalibrated).toBe(true);
      expect(h.grade.label).not.toBe('New Store');
    }
  });

  it('Ponce de Leon (genuinely new, zero monthly/yearly samples) still IS labeled New Store', () => {
    expect(DEFAULT_MODEL_ASSIGNMENTS['43701'].monthly.n).toBe(0);
    expect(DEFAULT_MODEL_ASSIGNMENTS['43701'].yearly.n).toBe(0);
    const h = modelHealthScore('43701', ds, settingsNoDialedIn);
    expect(h.score).toBeNull();
    expect(h.longRunCalibrated).toBe(false);
    expect(h.grade.label).toBe('New Store');
    expect(h.statement).toMatch(/new or recently opened/i);
  });

  it('computeModelHealth forwards the corrected label/note instead of its own hardcoded string', () => {
    const established = computeModelHealth('43380', settingsNoDialedIn, ds);
    expect(established.gradeLabel).not.toBe('New Store');
    expect(established.longRunCalibrated).toBe(true);
    expect(established.notes.cal).toMatch(/DI not viable/);

    const genuinelyNew = computeModelHealth('43701', settingsNoDialedIn, ds);
    expect(genuinelyNew.gradeLabel).toBe('New Store');
    expect(genuinelyNew.longRunCalibrated).toBe(false);
  });
});
