// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #129 — FOB Analysis print output.
//
// Dispatch #116 (this same session, merged earlier) wrapped FOBAnalysisPanel's KPI cards +
// Root-Cause Priority Matrix + Waste-Entry Discipline + Contributors table in one shared
// flex:1,overflowY:'auto' scroll region so mobile users could scroll to see everything on
// screen. The dispatch's hypothesis was that this recreates the same print-clipping trap
// dispatch #122 (Events & Tags) diagnosed: a bare window.print() against a scrolled
// overflow:auto container only captures whatever happened to be scrolled into view.
//
// Per CLAUDE.md's "measure it, don't reason about it" / "a reviewer's root cause is a
// hypothesis — reproduce it before fixing it" standing rules, that hypothesis was checked
// against a real Chromium print-media render (faithful DOM+CSS reproduction of this panel's
// exact structure, outside this test file — see the PR body) before writing any fix. It did
// NOT reproduce: meridian.css's existing global @media print rules (added 2026-08-23, predating
// both #116 and #122 — `[style*="overflow-y: auto"]`/`*{overflow:visible!important}`) already
// un-scroll this exact shape today. A control run with those rules stripped DID reproduce
// genuine clipping, confirming the harness can detect the bug and that the app's own CSS is
// what prevents it here.
//
// The fix implemented anyway, matching dispatch #122's established (and more robust — CSS/
// scroll/browser-independent) precedent: FOBAnalysisPanel's own native "🖨 Print" button
// (window.print()) is removed, and ExportDropdown's "HTML Report / Print" (extraHTML prop) now
// builds the full printable report straight from the same computed data (metrics,
// rootCauseItems, worstDiscipline) the screen renders from — independent of scroll position,
// viewport height, or any one browser/device's print-reflow behavior. It also fixes a second,
// independently-real gap: browsers do not print background colors by default
// (print-color-adjust defaults to 'economy', confirmed live; meridian.css sets it nowhere), so
// the on-screen severity coding (rgba background tints) would have printed nearly blank even if
// clipping were never a problem — the new report codes severity via text color instead.
//
// This test renders the ACTUAL FOBAnalysisPanel component against a 5-store fixture sized to
// generate content that — per the real-browser reproduction — exceeds a normal viewport height
// (5 KPI cards + audit badge, an 8-row-capped Root-Cause Matrix, an 8-row-capped Waste-Entry
// Discipline block, and a full 10-row Contributors table), and confirms the print report
// contains the FULL current result set, not a scroll-visible subset.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let resolveLoadQsrFob;
vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadQsrFob: () => new Promise((resolve) => { resolveLoadQsrFob = resolve; }) };
});

// Waste-Entry Discipline: bypass the real lazy-fill/8-week-pattern machinery (irrelevant to
// this dispatch) with a fixed, deterministic result so the section renders immediately and
// predictably, the same way loadQsrFob is mocked above rather than exercised for real.
vi.mock('../engine/metric-source.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, ensureLazyFill: () => false, isLazyFillPending: () => false, isLazyFillError: () => false };
});
const DISCIPLINE_FIXTURE = [
  { loc: '3708', raw: { missingCount: 4 }, completed: { missingCount: 1 }, totalMissing: 5, estImpact: 812.5 },
  { loc: '5183', raw: { missingCount: 2 }, completed: { missingCount: 0 }, totalMissing: 2, estImpact: 340 },
];
vi.mock('../engine/waste-discipline.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    computeStoreDataDiscipline: () => DISCIPLINE_FIXTURE,
    disciplineSummary: () => ({ stores: 2, totalMissing: 7, totalEstImpact: 1152.5, storesWithMissing: 2, storesWithoutPattern: 0 }),
  };
});

const { FOBAnalysisPanel } = await import('../views/analytics.js');
const h = React.createElement;

// 5 real store loc codes carried in DEFAULT_TARGETS (constants.js) so the panel's own
// allLocs filter (`DEFAULT_TARGETS[s.loc]`) includes them.
const STORES = [{ loc: '3708' }, { loc: '5183' }, { loc: '5985' }, { loc: '6178' }, { loc: '6838' }];

// One row per store for the same month, with compWaste/rawWaste/condiment pushed well past
// their per-store targets (constants.js's tCompWaste/tRawWaste/tCondiment, all ~0.001-0.02) so
// every store breaches on 3 components -- 15 root-cause candidates, exercising the top-8 cap
// the same way the on-screen matrix already caps at 8. All 10 FOB_COMP ratio fields are
// supplied so the Contributors table's full 10 rows compute (none read as "no data").
function fobRow(loc) {
  return {
    loc, date: new Date('2026-08-20T00:00:00'), sales: 200000,
    compWaste: 0.02, rawWaste: 0.025, condiment: 0.06, empMeal: 0.002, statVar: 0.01,
    unexplained: 0, fobPct: 0.09, baseFoodPct: 0.04, discCoupon: 0.013, pLFoodPct: 0.29,
  };
}

describe('FOBAnalysisPanel print report (Dispatch #129)', () => {
  let container, root, openSpy, openedWindows;

  afterEach(() => {
    if (root) act(() => root.unmount());
    if (container) container.remove();
    if (openSpy) openSpy.mockRestore();
    container = null; root = null; openSpy = null; openedWindows = null; resolveLoadQsrFob = undefined;
  });

  async function renderAndSettle() {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    openedWindows = [];
    openSpy = vi.spyOn(window, 'open').mockImplementation(() => {
      const w = { document: { write: vi.fn(), close: vi.fn() } };
      openedWindows.push(w);
      return w;
    });

    act(() => {
      root.render(h(FOBAnalysisPanel, {
        stores: STORES,
        ds: { fobRows: STORES.map(s => fobRow(s.loc)), wasteRows: [], targets: {}, monthlyTargets: {} },
        settings: {}, onClose: () => {},
      }));
    });

    // Empty cloud stream -> fobRowsEff falls back entirely to the manual ds.fobRows fixture above.
    await act(async () => {
      resolveLoadQsrFob([]);
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
  }

  function openPrintReport() {
    const exportBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('⬇ Export'));
    expect(exportBtn).toBeTruthy();
    act(() => { exportBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const printBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('HTML Report / Print'));
    expect(printBtn).toBeTruthy();
    act(() => { printBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(openedWindows.length).toBe(1);
    return openedWindows[0].document.write.mock.calls[0][0];
  }

  it('the native window.print() button is gone -- print no longer depends on the scrolled DOM', async () => {
    await renderAndSettle();
    const printBtns = [...container.querySelectorAll('button')].filter(b => b.textContent.trim() === '🖨 Print');
    expect(printBtns.length).toBe(0);
  });

  it('the print report contains the FULL current result set: all 5 KPI cards + audit badge', async () => {
    await renderAndSettle();
    const html = openPrintReport();
    for (const label of ['Total Food Cost', 'Food Over Base', 'Base Food', 'Components Over Target', 'Net Sales (Period)', 'Self-Audit']) {
      expect(html).toContain(label);
    }
  });

  it('the print report\'s Root-Cause Priority Matrix has the full top-8 (not a scroll-visible subset), matching the on-screen cap', async () => {
    await renderAndSettle();
    // On-screen matrix also caps at 8 -- confirm it's actually present so this fixture is
    // exercising the matrix at all before checking the print output mirrors it.
    expect(container.textContent).toContain('Root-Cause Priority Matrix');
    const html = openPrintReport();
    expect(html).toContain('Root-Cause Priority Matrix');
    const matrixMatch = html.match(/Root-Cause Priority Matrix[\s\S]*?<\/table>/);
    expect(matrixMatch).toBeTruthy();
    const rowCount = (matrixMatch[0].match(/<tbody>([\s\S]*)<\/tbody>/)[1].match(/<tr/g) || []).length;
    expect(rowCount).toBe(8); // 15 candidates (5 stores x 3 breached components), capped at 8
  });

  it('the print report includes Waste-Entry Discipline in full, not truncated', async () => {
    await renderAndSettle();
    const html = openPrintReport();
    expect(html).toContain('Waste-Entry Discipline');
    const discMatch = html.match(/Waste-Entry Discipline[\s\S]*?<\/table>/);
    expect(discMatch).toBeTruthy();
    const rowCount = (discMatch[0].match(/<tbody>([\s\S]*)<\/tbody>/)[1].match(/<tr/g) || []).length;
    expect(rowCount).toBe(DISCIPLINE_FIXTURE.length);
    expect(discMatch[0]).toContain('~$813'); // Math.round(812.5)
  });

  it('the print report\'s Contributors table has ALL 10 FOB categories, never a scroll-clipped subset', async () => {
    await renderAndSettle();
    const html = openPrintReport();
    const contribMatch = html.match(/Contributors[\s\S]*$/);
    expect(contribMatch).toBeTruthy();
    const rowCount = (contribMatch[0].match(/<tbody>([\s\S]*)<\/tbody>/)[1].match(/<tr/g) || []).length;
    expect(rowCount).toBe(10); // FOB_COMP.length -- every category has data in this fixture
  });

  it('does not change CSV/JSON export -- both options remain on the same ExportDropdown', async () => {
    await renderAndSettle();
    const exportBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('⬇ Export'));
    act(() => { exportBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    const labels = [...container.querySelectorAll('button')].map(b => b.textContent);
    expect(labels.some(t => t.includes('Download CSV'))).toBe(true);
    expect(labels.some(t => t.includes('Download JSON'))).toBe(true);
  });
});
