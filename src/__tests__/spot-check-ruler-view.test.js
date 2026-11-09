// @vitest-environment happy-dom
// @ts-nocheck
// Task #129 — real-render test of SpotCheckRulerWorksheet (the printable worksheet itself) and
// assembleRulerInputs (the FOB-as-of-count-date assembly the on-demand modal relies on). Mounts
// the actual component against the engine's real output, per CLAUDE.md's "would this
// verification still pass if reverted" rule.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { SpotCheckRulerWorksheet, assembleRulerInputs } from '../views/spot-check-ruler-view.js';
import { buildSpotCheckRuler } from '../engine/spot-check-ruler.js';

let container, root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

describe('assembleRulerInputs — FOB as of the count date', () => {
  // qsr_fob rows are cumulative MTD snapshots; a weekly count mid-month should read the latest
  // row ON OR BEFORE its own count date, never a later date within the same month.
  const fobRows = [
    { loc: '0013113', date: '2026-11-01', prodSalesAmt: 10000, compWasteAmt: 100, rawWasteAmt: 50, condimentsAmt: 20, empMgrMealsAmt: 10, statVarianceAmt: 30, unexplainedAmt: 5 },
    { loc: '0013113', date: '2026-11-05', prodSalesAmt: 46511.63, compWasteAmt: 500, rawWasteAmt: 300, condimentsAmt: 200, empMgrMealsAmt: 100, statVarianceAmt: 400, unexplainedAmt: 68.6 },
    { loc: '0013113', date: '2026-11-12', prodSalesAmt: 90000, compWasteAmt: 900, rawWasteAmt: 600, condimentsAmt: 400, empMgrMealsAmt: 200, statVarianceAmt: 800, unexplainedAmt: 100 }, // AFTER countDate — must be excluded
  ];
  it('picks the latest row on/before countDate, ignoring later-dated rows in the same month', () => {
    const { fobSnap } = assembleRulerInputs({ loc: '0013113', countDate: '2026-11-05', fobRows });
    expect(fobSnap.sales).toBeCloseTo(46511.63, 1);
    expect(fobSnap.comp).toBe(500);
  });
  it('returns null fobSnap with no countDate', () => {
    const { fobSnap } = assembleRulerInputs({ loc: '0013113', countDate: null, fobRows });
    expect(fobSnap).toBeNull();
  });
});

describe('SpotCheckRulerWorksheet — real render of the owner\'s own example', () => {
  const SALES = 46511.63;
  const varianceRows = [
    { wrin: '10001', descr: 'Nuggets', cls: 'Food', dolDiff: 400 },
    { wrin: '10002', descr: 'Espresso Beans', cls: 'Food', dolDiff: 250 },
    { wrin: '10003', descr: 'Beef Steak', cls: 'Food', dolDiff: 150 },
  ];
  const fobSnap = { sales: SALES, comp: 500, raw: 300, cond: 200, emp: 100, statv: 400, unex: 68.6, fob: 1568.6, fobPct: 1568.6 / SALES };

  const targetsWithComponents = { tFOBTarget: 0.04, tCompWaste: 0.008, tRawWaste: 0.01, tCondiment: 0.01, tStatLoss: 0.003 };

  it('renders all 7 questions, the counterfactual box, and the flag reason', async () => {
    const ruler = buildSpotCheckRuler({
      loc: '13113', storeName: 'Madill', period: '2026-11', periodType: 'weekly', countDate: '2026-11-05',
      fobSnap, targets: targetsWithComponents, varianceRows, topN: 3,
      reportLink: 'https://meridianbi.vercel.app/?share=abc',
    });
    await act(async () => { root.render(React.createElement(SpotCheckRulerWorksheet, { ruler })); });

    expect(container.textContent).toContain('What was FOB after you counted?');
    expect(container.textContent).toContain('3.37%');
    expect(container.textContent).toContain('What FOB component has the most opportunity for the current count?');
    expect(container.textContent).toContain('Stat Variance');
    expect(container.textContent).toContain('Nuggets');
    expect(container.textContent).toContain('Espresso Beans');
    expect(container.textContent).toContain('Beef Steak');
    expect(container.textContent).toContain('FOB without them');
    expect(container.textContent).toContain('5.09%');
    expect(container.textContent).toContain('Only at/under the 4.00% FOB target');
    expect(container.textContent).toContain('Did you review the reports (FOB, On Hand, Variance/Stat)?');
    expect(container.textContent).toContain('If yes, what did you find?');
    expect(container.querySelector('a[href="https://meridianbi.vercel.app/?share=abc"]')).toBeTruthy();
  });

  it('renders nothing (null) with no ruler yet', async () => {
    await act(async () => { root.render(React.createElement(SpotCheckRulerWorksheet, { ruler: null })); });
    expect(container.textContent).toBe('');
  });

  it('shows the honest "no data" state rather than a fabricated answer', async () => {
    const ruler = buildSpotCheckRuler({ loc: '13113', storeName: 'Madill', period: '2026-11', periodType: 'eom' });
    await act(async () => { root.render(React.createElement(SpotCheckRulerWorksheet, { ruler })); });
    expect(container.textContent).toContain('No FOB data on record for this period yet.');
    expect(container.textContent).toContain('No variance/stat data on record for this period yet.');
  });
});

describe('SpotCheckRulerWorksheet — Q5/Q6/Q7 note controls (owner-directed 2026-11-09)', () => {
  const ruler = buildSpotCheckRuler({ loc: '13113', storeName: 'Madill', period: '2026-11', periodType: 'eom' });

  it('Q5 rating scale renders 1-5 buttons and reports the clicked value', async () => {
    const calls = [];
    await act(async () => {
      root.render(React.createElement(SpotCheckRulerWorksheet, {
        ruler, note: {}, onNoteChange: n => calls.push(n),
      }));
    });
    const buttons = Array.from(container.querySelectorAll('button')).filter(b => b.textContent === '4');
    expect(buttons.length).toBe(1);
    await act(async () => { buttons[0].click(); });
    expect(calls).toHaveLength(1);
    expect(calls[0].confidenceRating).toBe(4);
  });

  it('Q6 yes/no reports a real boolean, not a string', async () => {
    const calls = [];
    await act(async () => {
      root.render(React.createElement(SpotCheckRulerWorksheet, {
        ruler, note: {}, onNoteChange: n => calls.push(n),
      }));
    });
    const yesBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Yes');
    await act(async () => { yesBtn.click(); });
    expect(calls[0].reportsReviewed).toBe(true);
  });

  it('Q7 ("what did they find?") only renders once Q6 is answered Yes', async () => {
    await act(async () => {
      root.render(React.createElement(SpotCheckRulerWorksheet, { ruler, note: { reportsReviewed: false } }));
    });
    expect(container.textContent).not.toContain('Q7 — what did they find?');

    await act(async () => {
      root.render(React.createElement(SpotCheckRulerWorksheet, { ruler, note: { reportsReviewed: true } }));
    });
    expect(container.textContent).toContain('Q7 — what did they find?');
  });

  it('readOnly mode shows the saved notes text, not the editable controls', async () => {
    await act(async () => {
      root.render(React.createElement(SpotCheckRulerWorksheet, {
        ruler, note: { notes: 'Confirmed with Ashley.' }, readOnly: true,
      }));
    });
    expect(container.textContent).toContain('Confirmed with Ashley.');
    expect(container.querySelector('textarea')).toBeFalsy();
  });
});
