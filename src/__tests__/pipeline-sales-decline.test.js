import { describe, it, expect } from 'vitest';
import { DEFAULT_TARGETS } from '../constants.js';

// pipeline.js transitively imports morning-brief.js, which assigns `window.onerror` at module
// top level — harmless in a browser, but this suite runs under vitest's `node` environment
// (vite.config.ts), so `window` doesn't exist yet. Stub it before a dynamic import (NOT hoisted,
// unlike a static import) so that assignment has somewhere to land. Same pattern as
// pipeline-ctrl-score.test.js.
globalThis.window = globalThis.window || {};
const { buildBrief } = await import('../engine/pipeline.js');

// Reported bug: a store on a bad, sustained sales decline (Atoka, loc 10422) never showed up
// in the Needs Attention panel. Root cause: buildBrief had no sales-decline finding type at
// all — the only sales-related line pushed t:'fc' (a forecast projection), and AttentionPanel
// only reads f.t==='crit'/'warn'/'watch', so a pure sales decline, however severe, could never
// surface there. Thresholds (-12% crit / -8% watch, both requiring a $3,000+ 28-day gap) were
// measured against the real district's 28-day sales-vs-LY distribution (2026-08-10, 26 of 27
// stores with LY coverage): p10 -9.9%, median -1.6%, Atoka the sole outlier at -15.4% vs the
// next-worst store's -11.1% — see the PR description for the full pulled distribution.

const loc = '10422';
const p = { r2p: 0 }; // no other findings should fire — keep every other buildBrief branch inert
const t = DEFAULT_TARGETS[loc] || {};

// Builds ds.qsrActSummaryRows for the trailing `days` days (relative to real "now", since
// buildBrief's new detector uses Date.now() directly, matching its sibling pSales/pLY
// calculation in buildStore) at a constant daily current/LY sales ratio.
function dsWithDailyRatio(pctVsLY, days = 28, dailyLY = 10000) {
  const rows = [];
  const today = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(today); d.setDate(d.getDate() - i);
    rows.push({ loc, date: d, sales: dailyLY * (1 + pctVsLY), lySales: dailyLY });
  }
  return { loaded: true, qsrActSummaryRows: rows, laborRows: [] };
}

describe('buildBrief — sales decline detector (Needs Attention fix)', () => {
  it('a severe, sustained decline (Atoka-shaped: -15.4%) fires CRITICAL', () => {
    const ds = dsWithDailyRatio(-0.154);
    const f = buildBrief(p, t, 80, 80, 0, 0, ds, loc);
    const hit = f.find(x => x.rule === 'salesCrit');
    expect(hit).toBeTruthy();
    expect(hit.t).toBe('crit');
    expect(hit.m).toMatch(/CRITICAL — SALES DECLINE/);
    expect(f.find(x => x.rule === 'salesWatch')).toBeFalsy(); // crit and watch are mutually exclusive
  });

  it('a moderate decline (-10%, between the two thresholds) fires WATCH, not critical', () => {
    const ds = dsWithDailyRatio(-0.10);
    const f = buildBrief(p, t, 80, 80, 0, 0, ds, loc);
    expect(f.find(x => x.rule === 'salesWatch')).toBeTruthy();
    expect(f.find(x => x.rule === 'salesCrit')).toBeFalsy();
  });

  it('a normal store tracking near LY (-2%, matching the measured district median) fires nothing', () => {
    const ds = dsWithDailyRatio(-0.02);
    const f = buildBrief(p, t, 80, 80, 0, 0, ds, loc);
    expect(f.find(x => x.rule === 'salesCrit' || x.rule === 'salesWatch')).toBeFalsy();
  });

  it('a store AHEAD of last year fires nothing', () => {
    const ds = dsWithDailyRatio(0.05);
    const f = buildBrief(p, t, 80, 80, 0, 0, ds, loc);
    expect(f.find(x => x.rule === 'salesCrit' || x.rule === 'salesWatch')).toBeFalsy();
  });

  it('a severe % decline on a tiny store (below the $3,000 gap floor) does not fire — no false-positive spam on low-volume stores', () => {
    const ds = dsWithDailyRatio(-0.30, 28, 50); // -30% of a $50/day LY average ≈ $420 total gap
    const f = buildBrief(p, t, 80, 80, 0, 0, ds, loc);
    expect(f.find(x => x.rule === 'salesCrit' || x.rule === 'salesWatch')).toBeFalsy();
  });

  it('sparse matched-day coverage (fewer than 14 of 28 days) does not fire, even at a severe rate', () => {
    const ds = dsWithDailyRatio(-0.20, 10); // only 10 days of data in the window
    const f = buildBrief(p, t, 80, 80, 0, 0, ds, loc);
    expect(f.find(x => x.rule === 'salesCrit' || x.rule === 'salesWatch')).toBeFalsy();
  });

  it('no data loaded (ds.loaded=false) does not throw and does not fire', () => {
    const ds = { loaded: false };
    expect(() => buildBrief(p, t, 80, 80, 0, 0, ds, loc)).not.toThrow();
    const f = buildBrief(p, t, 80, 80, 0, 0, ds, loc);
    expect(f.find(x => x.rule === 'salesCrit' || x.rule === 'salesWatch')).toBeFalsy();
  });
});
