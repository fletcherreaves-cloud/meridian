// @ts-nocheck
// Owner-observed 2026-11-09 (At A Glance screenshot): the Action Checklist flagged "1 store at
// red model health — Lindsay" the same day 44689 (Lindsay, relocated from 18213) was added to
// the app and backfilled from a single owner-provided LifeLenz export. Measured: DEFAULT_MODEL_
// ASSIGNMENTS (constants.js) had NO entry at all for '44689' -- every other new/sparse-data
// store (Ponce de Leon 43701, Tishomingo 43380, Elgin 33222, Mossy Head 37566) has a recentOnly
// entry that exempts it from modelHealthScore()'s full scoring algorithm via the
// `if(_masgn&&_masgn.recentOnly...)` guard at forecast.js's modelHealthScore. With `_masgn`
// undefined for 44689, that guard never fired, so a store with a week of backfilled history fell
// straight into real scoring and predictably came back red -- same precedent as
// model-health-recentonly-mislabel.test.js's Ponce de Leon case, applied to the newest store.
import { describe, it, expect } from 'vitest';
import { modelHealthScore } from '../engine/forecast.js';
import { DEFAULT_MODEL_ASSIGNMENTS } from '../constants.js';

const ds = { loaded: true, laborRows: [], opsRows: [], ctrlRows: [], weatherRows: [] };
const settingsNoDialedIn = { weekStartDay: 3, dialedInEnabled: true, dialedIn: {} };

describe('modelHealthScore — Lindsay (44689) New Store exemption (dispatch 2026-11-09)', () => {
  it('44689 has a DEFAULT_MODEL_ASSIGNMENTS entry with recentOnly:true, same shape as every other genuinely new store', () => {
    expect(DEFAULT_MODEL_ASSIGNMENTS['44689']).toBeTruthy();
    expect(DEFAULT_MODEL_ASSIGNMENTS['44689'].recentOnly).toBe(true);
    expect(DEFAULT_MODEL_ASSIGNMENTS['44689'].monthly.n).toBe(0);
    expect(DEFAULT_MODEL_ASSIGNMENTS['44689'].yearly.n).toBe(0);
  });

  it('is labeled "New Store" (score null), not scored red, same as Ponce de Leon (43701)', () => {
    const h = modelHealthScore('44689', ds, settingsNoDialedIn);
    expect(h.score).toBeNull(); // never a numeric grade -- can't satisfy the <50 red filter
    expect(h.longRunCalibrated).toBe(false);
    expect(h.grade.label).toBe('New Store');
    expect(h.statement).toMatch(/new or recently opened/i);
  });

  it('is excluded by the exact redStores filter at-a-glance.js uses (score!=null && score<50)', () => {
    const h = modelHealthScore('44689', ds, settingsNoDialedIn);
    const countsAsRed = h.score != null && h.score < 50;
    expect(countsAsRed).toBe(false);
  });
});
