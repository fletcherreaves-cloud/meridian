// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #85 #5 -- memory/finding-promo-roi-denominator-bias-2026-08-23.md's later measurement
// found the #599/#601 "fix" is ALSO biased (endogenous: promo spend that scales with traffic
// sorts busy days into "heavy", reproducing +16.5% mean lift / 27 of 27 "pays" at a TRUE effect of
// zero). The real fix (an exogenous treatment indicator) is a design task, not a quick win --
// dispatch #85 asks for a visible, unmissable caveat on the panel AND in the tool's note instead,
// saying the verdicts are known-unreliable and why.
//
// Imports supabase/functions/sage-chat/promo-roi-note.js directly -- the same plain-JS constant
// index.ts's query_promo_roi tool returns as its literal `note` field. Reverting the note back to
// its old (pre-#85) text fails this test, since it exercises that exact string.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PROMO_ROI_UNRELIABLE_NOTE } from '../../supabase/functions/sage-chat/promo-roi-note.js';
import { PromoRoiPanel } from '../views/promo-roi.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('SAGE query_promo_roi note -- known-unreliable warning (dispatch #85 #5)', () => {
  it('states the verdicts are unreliable, not just a caveat about being directional', () => {
    expect(PROMO_ROI_UNRELIABLE_NOTE).toMatch(/known.unreliable/i);
    expect(PROMO_ROI_UNRELIABLE_NOTE).toMatch(/do not present these verdicts as findings/i);
  });

  it('names the actual mechanism (endogenous split / spend scales with traffic), not just "be careful"', () => {
    expect(PROMO_ROI_UNRELIABLE_NOTE).toMatch(/scales with traffic/i);
    expect(PROMO_ROI_UNRELIABLE_NOTE).toMatch(/heavy.*before sales is ever compared/i);
  });

  it('carries the measured numbers, not a vague qualifier', () => {
    expect(PROMO_ROI_UNRELIABLE_NOTE).toMatch(/\+16\.5%/);
    expect(PROMO_ROI_UNRELIABLE_NOTE).toMatch(/27\/27/);
  });

  it('cites the finding file so a reader can find the full evidence', () => {
    expect(PROMO_ROI_UNRELIABLE_NOTE).toContain('finding-promo-roi-denominator-bias-2026-08-23.md');
  });
});

describe('Promo/Discount ROI panel -- visible warning banner (dispatch #85 #5)', () => {
  let container, root;
  afterEach(() => {
    if (root) act(() => root.unmount());
    if (container) container.remove();
    container = null; root = null;
  });

  function renderPanel(ds) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(React.createElement(PromoRoiPanel, { ds, onClose: () => {} })); });
    return container;
  }

  it('shows an unmissable "known-unreliable" warning when there is enough data to render verdicts', () => {
    // Minimal fixture large enough to clear PromoRoiPanel's nRecords >= 20 gate.
    const glimpseRows = [];
    for (let i = 0; i < 30; i++) {
      const date = new Date(2026, 3, 1 + i);
      glimpseRows.push({ loc: '3708', date, allNetSales: 10000 + (i % 2) * 500, gc: 900, promoAmt: (i % 2) ? 300 : 100, promoPct: 0.02 });
    }
    const el = renderPanel({ glimpseRows, ctrlRows: [] });
    expect(el.textContent).toMatch(/known-unreliable/i);
    expect(el.textContent).toMatch(/do not act on them yet/i);
  });

  it('does not show the warning on the empty-state screen (nothing to warn about yet)', () => {
    const el = renderPanel({ glimpseRows: [], ctrlRows: [] });
    expect(el.textContent).not.toMatch(/known-unreliable/i);
  });
});
