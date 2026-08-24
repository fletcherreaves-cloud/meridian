// @ts-nocheck
// Dispatch #88 item 3 -- notes-67 flagged "Forecast Audit appears greyed out" as a possible
// gating bug. It isn't: panel-registry.js declares disabledWhen:'noStore' by design (dispatch
// #61), and shell.js's navItem ALREADY carries `title:disabled?'Select a store first':label`
// -- shipped in v4.945 (PR #120, 2026-08-10), which is BEFORE this dispatch was written. Verified
// by actually rendering the sidebar with and without a selected store (not by reading the code):
// without one, the Forecast Audit nav item's title attribute reads "Select a store first"; with
// one, it reads the normal label "Forecast Audit". The real defect this dispatch named -- silence
// about WHY the panel is disabled -- was already fixed; what was missing was a regression test
// pinning it, which is what this file is.
//
// Revert-sensitive at the call site per the dispatch's own verification bar: renders the actual
// AppSidebar consumer (not just panel-registry.js's disabledWhen field), so a future edit that
// breaks the DISABLED_WHEN -> navPBeta -> navItem wiring, or drops the title prop, fails this test
// even though the registry's own field would still read correctly.
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import ReactDOMServer from 'react-dom/server';

global.window = global.window || {
  innerWidth: 1200, addEventListener(){}, removeEventListener(){}, dispatchEvent(){},
};
global.performance = global.performance || { now: () => 0 };

const { AppSidebar } = await import('../app/shell.js');
const h = React.createElement;

function renderSidebar(selStore) {
  const props = {
    view: 'command', setView: () => {}, selStore, stores: [], ds: {},
    settings: { districtName: 'Test' }, onOpenModal: () => {}, onLoadFiles: () => {},
    onSaveSession: () => {}, onRestoreSession: () => {}, loadMsg: '', perm: () => true,
    betaMode: false, panelVis: {},
  };
  return ReactDOMServer.renderToStaticMarkup(h(AppSidebar, props));
}

// Pull the full opening <div ...> tag that immediately precedes a given label's <span>, so the
// assertion reads the REAL title attribute on the REAL nav item, not just "the string appears
// somewhere in the page" (which the label text itself would already satisfy).
function navItemTag(html, label) {
  const spanIdx = html.indexOf(`>${label}<`);
  expect(spanIdx, `could not find nav label "${label}"`).toBeGreaterThan(-1);
  const tagStart = html.lastIndexOf('<div', spanIdx);
  const tagEnd = html.indexOf('>', tagStart);
  return html.slice(tagStart, tagEnd + 1);
}

describe('Forecast Audit disabled-state hint (dispatch #88 item 3)', () => {
  it('explains WHY the panel is disabled when no store is selected, not just that it is', () => {
    const html = renderSidebar(null);
    const tag = navItemTag(html, 'Forecast Audit');
    expect(tag).toContain('title="Select a store first"');
    expect(tag).not.toContain('title="Forecast Audit"');
    // Also disabled in the ways a user would actually perceive, not just the tooltip.
    expect(tag).toContain('cursor:not-allowed');
    expect(tag).toContain('opacity:0.45');
  });

  it('shows the normal label as the tooltip once a store IS selected, and is clickable', () => {
    const html = renderSidebar('3708');
    const tag = navItemTag(html, 'Forecast Audit');
    expect(tag).toContain('title="Forecast Audit"');
    expect(tag).toContain('cursor:pointer');
    expect(tag).toContain('opacity:1');
  });
});
