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
function renderNavTexts(permFn) {
  const props = {
    view: 'command', setView: () => {}, selStore: 'X', stores: [], ds: {},
    settings: { districtName: 'Test' }, onOpenModal: () => {}, onLoadFiles: () => {},
    onSaveSession: () => {}, onRestoreSession: () => {}, loadMsg: '', perm: permFn || (() => true),
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

// ── Permission dimension ─────────────────────────────────────────────────────
// The snapshot above renders with perm:()=>true, so it CANNOT see a permission gate being
// dropped -- a nav item that should vanish for a GM would still render identically under full
// access and the test would stay green. That is the failure this refactor could most plausibly
// have introduced (navP reads `perm` from the registry instead of the literal that used to sit
// at the call site), and it is the one Jobs B and C are most likely to introduce next, since
// both keep rewriting this same nav.
//
// So: for each permission the registry uses, deny exactly that one and assert the exact SET of
// text nodes that disappear. This table was captured from the PRE-refactor shell.js -- the same
// external oracle the snapshot above uses -- so it is not derived from the code it checks.
// Verified 2026-08-21 by rendering both versions across all 17 configurations (full access,
// betaMode on/off, all-denied, one per permission, each crossed with optional panels visible):
// zero differences.
//
// Two permissions legitimately hide nothing in the sidebar (analytics.ai, analytics.labor) --
// they gate panels reached elsewhere. Empty arrays record that on purpose; if one of them
// suddenly starts hiding a nav item, that is a real change worth failing on.
//
// Note the sets are text nodes, not panels: an icon shared with a still-visible item does not
// disappear, which is why some entries list a label without its icon.
const HIDDEN_WHEN_DENIED = {
  'analytics.ai': [],
  'analytics.brief': ['Daily Brief', 'Forecast Brief', '☀️', '🔭'],
  'analytics.dashboard': ['Calendar', 'Event Impact', 'My Reports', '📈'],
  'analytics.district': ['Above-Store One-Pager', 'District View', 'EOM Supervisor', 'Inventory Control', 'Org Summary', '⊞', '📦'],
  'analytics.forecasting': ['DI Calibration', 'DI Compare', 'Fcst Reference', 'Forecast Accuracy', 'Forecast Audit', 'Forecast Models', 'LifeLenz Bridge', 'LifeLenz Gap', 'Proj vs Actuals', 'Projections', '▦', '◎', '◑', '🌉', '📐', '🔬'],
  'analytics.labor': [],
  'analytics.store': ['3PO Delivery', 'ANALYTICS', 'Count Cycle', 'DT Speed of Service', 'End of Month', 'Food Cost', 'Graded Visits', 'Guest Voice', 'LABOR & SCHEDULING', 'Local News', 'Market Intelligence', 'OPERATIONS', 'PERFORMANCE', 'Planning', 'Promo / Discount ROI', 'Rankings', 'Scheduling', 'Signals', 'Store One-Pager', 'Visit Readiness', '🎟️', '🏆', '💬', '📡', '📰', '🗓', '🗺', '🚗', '🛡️', '🛵', '🥗'],
  'data.upload': ['Data Manager', '🗄'],
  'reviews.view': ['Performance Reviews'],
  'security.view': ['Security', '🔒'],
  'settings.view': ['Panel Manager', 'Settings', '⚙', '🧩'],};

describe('AppSidebar permission gates survive the registry refactor (dispatch #54 Job A)', () => {
  it('denying each permission hides exactly the pre-refactor set of nav text', () => {
    const all = new Set(renderNavTexts());
    const actual = {};
    for (const perm of Object.keys(HIDDEN_WHEN_DENIED)) {
      const shown = new Set(renderNavTexts(x => x !== perm));
      actual[perm] = [...all].filter(t => !shown.has(t)).sort();
    }
    const expected = Object.fromEntries(
      Object.entries(HIDDEN_WHEN_DENIED).map(([k, v]) => [k, [...v].sort()]));
    expect(actual).toEqual(expected);
  });
});
