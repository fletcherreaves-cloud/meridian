// @ts-nocheck
// Dispatch #54 Job A: shell.js's AppSidebar was rewired to read label/icon/perm from
// panel-registry.js instead of duplicating them as literal strings, as a pure refactor --
// the rendered nav must look identical before and after. A test that only asserts the
// registry's own shape (panel-registry.test.js) would pass unchanged even if shell.js were
// left fully hardcoded, or if the refactor silently dropped/reordered an item -- it never
// renders the actual consumer. This one does: it renders AppSidebar with a fixed, full-access
// prop set via react-dom/server (no jsdom needed for static markup) and asserts the exact
// ordered text content, captured from the nav BEFORE this refactor landed.
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import ReactDOMServer from 'react-dom/server';

// AppSidebar reads window.innerWidth/addEventListener at mount and performance.now() for a
// render-time instrumentation mark -- neither exists in vitest's node environment.
global.window = global.window || {
  innerWidth: 1200, addEventListener(){}, removeEventListener(){}, dispatchEvent(){},
};
global.performance = global.performance || { now: () => 0 };

const { AppSidebar } = await import('../app/shell.js');

const h = React.createElement;

// Every visible text node in DOM order, full permissions + betaMode off (so both the regular
// sections AND ⚗ Test Kitchen render), no optional panels shown (panelVis:{}) and no stores
// (so the Needs Attention badge is 0 -- deterministic, no badge span rendered).
function renderNavTexts() {
  const props = {
    view: 'command', setView: () => {}, selStore: 'X', stores: [], ds: {},
    settings: { districtName: 'Test' }, onOpenModal: () => {}, onLoadFiles: () => {},
    onSaveSession: () => {}, onRestoreSession: () => {}, loadMsg: '', perm: () => true,
    betaMode: false, panelVis: {},
  };
  const html = ReactDOMServer.renderToStaticMarkup(h(AppSidebar, props));
  return html.replace(/<[^>]+>/g, '|').split('|')
    .map(s => s.trim().replace(/&amp;/g, '&'))
    .filter(Boolean);
}

// Captured 2026-08-21, immediately before the Job A refactor, from this exact prop set --
// this IS "before"; the render above is "after". They must match.
const EXPECTED = ['M','Meridian','Test','DAILY','⌂','Home','🔴','Needs Attention','☀️','Daily Brief','📅','Date-Range Report','◷','Events & Tags','📅','Calendar','📈','Event Impact','PERFORMANCE','📊','Org Summary','🏆','Rankings','🎯','Planning','LABOR & SCHEDULING','🗓','Scheduling','PEOPLE / HR','📋','Performance Reviews','🛡️','Visit Readiness','📋','Graded Visits','🔒','Security','OPERATIONS','🥗','Food Cost','📋','End of Month','📊','EOM Supervisor','📦','Inventory Control','📋','Count Cycle','💬','Guest Voice','🛵','3PO Delivery','🎟️','Promo / Discount ROI','ANALYTICS','📡','Signals','🚗','DT Speed of Service','📰','Local News','🧠','SAGE','💡','Feature Requests','⚡','Task Queue','🖨','Printable Forms','📋','Leadership One-Pager','📄','Above-Store One-Pager','🗂','My Reports','🗂','Forms Library','🔭','Forecast Brief','🗺','Market Intelligence','⊞','District View','📄','Store One-Pager','⚗ TEST KITCHEN','▦','Projections','◑','Proj vs Actuals','🎯','Forecast Models','◎','DI Calibration','🎯','Forecast Accuracy','📊','LifeLenz Gap','⚡','DI Compare','📐','Fcst Reference','🔬','Forecast Audit','🌉','LifeLenz Bridge','ADMIN','⚙','Settings','🧩','Panel Manager','ℹ️','About','📖','Knowledge Base','🔍','Metric Lineage','🗄','Data Manager','💾','Save Session','📂','Restore Session','?','Help','No data','v—'];

describe('AppSidebar renders identically after the registry refactor (dispatch #54 Job A)', () => {
  it('produces the exact pre-refactor text content, in order', () => {
    expect(renderNavTexts()).toEqual(EXPECTED);
  });
});
