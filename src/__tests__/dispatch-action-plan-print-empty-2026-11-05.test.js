// @vitest-environment happy-dom
// @ts-nocheck
// Owner-caught live (2 screenshots, store Harrah #34222): the on-screen Action Plan tab shows a
// real, detailed plan (a "Drive-Thru Speed" item with target/gap, 5 action steps, 4-week
// checkpoints), but clicking "⎙ Print Plan" produced a page with only the header (Ops
// Health/Controls/Status) + "Overall Outlook" + an EMPTY "Priority Action Items" box -- the
// actions the live tab rendered never appeared in the print output.
//
// Measured root cause (not reasoned -- per CLAUDE.md's "measure it, don't reason about it"):
// ActionPlanTab's printPlan() built each priority badge as
//   <span style='background:${...};...;border-radius:3px">${a.priority}</span>
// -- the style attribute OPENS with a single quote (') but CLOSES with a double quote ("). An
// HTML parser matches an attribute value by its opening quote character, so the stray `"` does
// not close the attribute; nothing in the actually-emitted HTML (the JS string literals inside
// the template expression never reach the output) contains a literal `'` to close it either. The
// parser therefore folds everything after that span -- Issue/Target/Gap/Impact paragraphs, the
// Action Steps <ol>, the Checkpoints block, every subsequent action item, even the AI coaching
// section and the closing tags -- into that one attribute's value, and renders none of it. A
// standalone happy-dom repro of exactly this markup shape confirmed: real issue text present in
// the DOM with matching quotes, textContent entirely missing with the mismatched pair.
//
// Fix: matching double quotes on the span's style attribute (src/views/store-dash.js,
// ActionPlanTab's printPlan). This test renders the real ActionPlanTab component against a
// fixture engineered to trigger generatePlan's "Drive-Thru Speed" (OEPE) action item -- the exact
// one in the owner's screenshot -- clicks the real "⎙ Print Plan" button, and reads the HTML back
// out of the printHtml() overlay iframe (same pattern as dispatch-129-fob-print.test.js), so a
// revert of the quote fix fails this test the same way it failed for the owner.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ActionPlanTab, generatePlan } from '../views/store-dash.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

// Mirrors store-analytics.js's real shape for the `store` prop ActionPlanTab/generatePlan read
// (p/t/findings/opsScore/ctrlScore/pSales/pLY/loc/name). OEPE pushed well past target so
// generatePlan's "Drive-Thru Speed" rule fires -- the same action item in the owner's screenshot.
function harrahStore() {
  return {
    loc: '34222', name: 'Harrah',
    p: { laborPct: 0.26, oepe: 210, tpph: 90, cashOSPct: 0.0005, otHrs: 0.5 },
    t: { tOepe: 180, tTpph: 90, tCrewLabor: 0.25 },
    findings: [], opsScore: 72, ctrlScore: 81, pSales: 50000, pLY: 48000,
  };
}

function lastPrintedHtml() {
  const iframes = [...document.querySelectorAll('iframe')];
  const iframe = iframes[iframes.length - 1];
  expect(iframe, 'printHtml overlay iframe not found').toBeTruthy();
  return '<!doctype html>' + iframe.contentDocument.documentElement.outerHTML;
}

describe('Action Plan print output (owner-reported empty Priority Action Items)', () => {
  let container, root;

  afterEach(() => {
    if (root) act(() => root.unmount());
    if (container) container.remove();
    document.querySelectorAll('iframe').forEach(f => f.parentElement && f.parentElement.remove());
    container = null; root = null;
  });

  it('sanity: the fixture actually produces a Drive-Thru Speed action item (so this test exercises the real bug, not an empty plan)', () => {
    const plan = generatePlan(harrahStore(), {});
    const action = plan.actions.find(a => a.category === 'Drive-Thru Speed');
    expect(action).toBeTruthy();
    expect(action.issue).toContain('210');
    expect(action.steps.length).toBe(5);
  });

  it('Print Plan output contains the real action item content, not an empty Priority Action Items box', async () => {
    const store = harrahStore();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => { root.render(h(ActionPlanTab, { store, ds: {}, settings: {}, dateRange: null })); });

    const printBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Print Plan'));
    expect(printBtn).toBeTruthy();
    act(() => { printBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    const html = lastPrintedHtml();
    expect(html).toContain('PRIORITY ACTION ITEMS');

    // The actual bug: these strings were present in the template's input but never reached the
    // parsed, rendered output because the malformed quote swallowed them into an attribute.
    expect(html).toContain('Drive-Thru Speed');
    expect(html).toContain('OEPE at 210s');
    expect(html).toContain('Action Steps');
    expect(html).toContain('Checkpoints');
    expect(html).toContain('Week 1:');

    // Confirm it's real DOM content (iframe document), not just a byte match on the raw string.
    const doc = [...document.querySelectorAll('iframe')].pop().contentDocument;
    expect(doc.body.textContent).toContain('Drive-Thru Speed');
    expect(doc.body.textContent).toContain('OEPE at 210s');
  });
});
