// @vitest-environment happy-dom
// @ts-nocheck
// dispatch-113.md — replaces the dispatch #85 #5 "known-unreliable" banner/note (both intensity
// splits it warned about are now retired) with the real fix: an exogenous org_events promo-tag
// split. This file now exercises the NEW note constants and the NEW panel copy, not the old ones
// — reverting either the note text or the panel's methodology banner back toward the retired
// "known-unreliable, do not act on these" framing fails this file.
//
// Imports supabase/functions/sage-chat/promo-roi-note.js directly -- the same plain-JS constants
// index.ts's query_promo_roi tool returns as its literal promo_note/discount_note fields.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { PROMO_ROI_METHOD_NOTE, DISCOUNT_ROI_NO_SIGNAL_NOTE } from '../../supabase/functions/sage-chat/promo-roi-note.js';
import { PromoRoiPanel } from '../views/promo-roi.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('SAGE query_promo_roi notes -- exogenous-tag methodology (dispatch-113.md)', () => {
  it('promo note names the exogenous calendar-tag mechanism, not "be careful"', () => {
    expect(PROMO_ROI_METHOD_NOTE).toMatch(/exogenous/i);
    expect(PROMO_ROI_METHOD_NOTE).toMatch(/org_events/);
    expect(PROMO_ROI_METHOD_NOTE).toMatch(/national marketing/i);
  });

  it('promo note documents the coverage-window exclusion rule (unknown days are excluded, not assumed untagged)', () => {
    expect(PROMO_ROI_METHOD_NOTE).toMatch(/coverage/i);
    expect(PROMO_ROI_METHOD_NOTE).toMatch(/excluded/i);
  });

  it('promo note still cites the original finding, for anyone tracing why the split changed', () => {
    expect(PROMO_ROI_METHOD_NOTE).toContain('finding-promo-roi-denominator-bias-2026-08-23.md');
  });

  it('discount note states plainly that discount ROI cannot be measured, and why', () => {
    expect(DISCOUNT_ROI_NO_SIGNAL_NOTE).toMatch(/cannot be determined/i);
    expect(DISCOUNT_ROI_NO_SIGNAL_NOTE).toMatch(/no exogenous/i);
    expect(DISCOUNT_ROI_NO_SIGNAL_NOTE).toMatch(/cannot determine.*not.*finding of zero/i);
  });
});

describe('Promo/Discount ROI panel -- honest methodology banner (dispatch-113.md)', () => {
  let container, root;
  afterEach(() => {
    if (root) act(() => root.unmount());
    if (container) container.remove();
    container = null; root = null;
  });

  function renderPanel(props) {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(React.createElement(PromoRoiPanel, { onClose: () => {}, ...props })); });
    return container;
  }

  it('shows the methodology banner (not the retired "known-unreliable" warning) when there is enough data to render', () => {
    const glimpseRows = [];
    for (let i = 0; i < 30; i++) {
      const date = new Date(2026, 3, 1 + i);
      glimpseRows.push({ loc: '3708', date, allNetSales: 10000 + (i % 2) * 500, gc: 900, promoAmt: (i % 2) ? 300 : 100, promoPct: 0.02 });
    }
    const el = renderPanel({ ds: { glimpseRows, ctrlRows: [] } });
    expect(el.textContent).toMatch(/Methodology/i);
    expect(el.textContent).toMatch(/national promo calendar/i);
    expect(el.textContent).not.toMatch(/known-unreliable/i);
    expect(el.textContent).not.toMatch(/do not act on them yet/i);
  });

  it('does not show the methodology banner on the empty-state screen (nothing to explain yet)', () => {
    const el = renderPanel({ ds: { glimpseRows: [], ctrlRows: [] } });
    expect(el.textContent).not.toMatch(/Methodology/i);
  });
});
