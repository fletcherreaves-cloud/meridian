// @ts-nocheck
// Dispatch #54 Job A wired shell.js's AppSidebar to read label/icon/perm from panel-registry.js
// as a pure refactor (nav rendered identically). Job B adopted section-driven rendering for
// real: AppSidebar now iterates SECTIONS + panelsForSection() instead of a hand-built literal
// list, and the owner's regroup decisions (memory/dispatch54-job-b.md) landed as section: edits
// -- so THIS baseline is the real visual change Job B intentionally ships (Visit Readiness/
// Graded Visits -> Operations; Calendar/Events & Tags/Event Impact folded into Planning behind
// the hub, in the owner's own stated order; a new Inventory & Food Cost section; Forms Library/
// Printable Forms -> Forms; Org Summary/Rankings -> Reports). A test only asserting the
// registry's own shape (panel-registry.test.js) would pass unchanged even if shell.js never
// picked up any of this -- this one renders the actual consumer via react-dom/server (no jsdom
// needed for static markup) and asserts the exact ordered text content.
import { describe, it, expect } from 'vitest';
import * as React from 'react';
import ReactDOMServer from 'react-dom/server';
import { PANEL_BY_ID } from '../app/panel-registry.js';

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

// Captured 2026-08-21, from the section-driven render immediately after Job B landed. This is
// the intended post-regroup layout, not a "preserve exactly" baseline the way Job A's was.
const EXPECTED = ['M','Meridian','Test','⌂','Home','⊞','District View','Daily','🔴','Needs Attention','☀️','Daily Brief','📅','Date-Range Report','Reports','📊','Org Summary','🏆','Rankings','Planning','🎯','Planning','📅','Calendar','◷','Events & Tags','📈','Event Impact','Operations','🛵','3PO Delivery','📊','EOM Supervisor','📋','Graded Visits','🎟️','Promo / Discount ROI','💬','Guest Voice','🛡️','Visit Readiness','Inventory & Food Cost','📋','Count Cycle','📦','Inventory Control','🥗','Food Cost','📋','End of Month','📦','Inventory','Scheduling & Labor','🗓','Scheduling','People','📋','Performance Reviews','🔒','Security','Analytics','📄','Above-Store One-Pager','🔭','Forecast Brief','🚗','DT Speed of Service','📰','Local News','💡','Feature Requests','📋','Leadership One-Pager','🗺','Market Intelligence','🗂','My Reports','📄','Store One-Pager','🧠','SAGE','📡','Signals','⚡','Task Queue','Forms','🗂','Forms Library','🖨','Printable Forms','⚗ TEST KITCHEN','▦','Projections','◑','Proj vs Actuals','🎯','Forecast Models','◎','DI Calibration','🎯','Forecast Accuracy','📊','LifeLenz Gap','⚡','DI Compare','📐','Fcst Reference','🔬','Forecast Audit','🌉','LifeLenz Bridge','Admin','ℹ️','About','🗄','Data Manager','?','Help','📖','Knowledge Base','🔍','Metric Lineage','🧩','Panel Manager','⚙','Settings','💾','Save Session','📂','Restore Session','No data','v—'];

describe('AppSidebar renders the section-driven nav (dispatch #54 Job B)', () => {
  it('produces the exact post-regroup text content, in order', () => {
    expect(renderNavTexts()).toEqual(EXPECTED);
  });

  it('the Planning section is exactly the owner\'s four links, hub first -- not five exploded tabs', () => {
    const texts = renderNavTexts();
    const start = texts.indexOf('Planning'); // the section header
    const slice = texts.slice(start, start + 9);
    expect(slice).toEqual(['Planning', '🎯', 'Planning', '📅', 'Calendar', '◷', 'Events & Tags', '📈', 'Event Impact']);
  });

  it('Inventory & Food Cost holds all six named panels -- five real nav entries plus Product Mix reachable once enabled', () => {
    const invFoodCost = ['fob-analysis', 'fob-eom', 'eom-dashboard', 'count-cycle', 'inventory', 'pmix']
      .map(id => PANEL_BY_ID[id].section);
    expect(invFoodCost.every(s => s === 'inventory-food-cost')).toBe(true);
    // Only pmix stays kind:'optional' (Panel Manager toggle) -- the other five are ordinary
    // always-visible nav entries, confirmed present in the rendered text above.
    const texts = renderNavTexts();
    for (const label of ['Food Cost', 'End of Month', 'Inventory Control', 'Count Cycle', 'Inventory']) {
      expect(texts).toContain(label);
    }
  });
});

// ── Permission dimension ─────────────────────────────────────────────────────
// The snapshot above renders with perm:()=>true, so it CANNOT see a permission gate being
// dropped -- a nav item that should vanish for a GM would still render identically under full
// access and the test would stay green. So: for each permission the registry uses, deny exactly
// that one and assert the exact SET of text nodes that disappear. Re-captured 2026-08-21
// alongside the Job B baseline above (same external-oracle render, not derived from the code it
// checks).
//
// Two permissions legitimately hide nothing in the sidebar (analytics.ai, analytics.labor) --
// they gate panels reached elsewhere. Empty arrays record that on purpose; if one of them
// suddenly starts hiding a nav item, that is a real change worth failing on.
//
// Note the sets are text nodes, not panels: an icon shared with a still-visible item does not
// disappear. Job B changed one of these on purpose -- 📦 no longer disappears when
// analytics.district is denied, because 'Inventory' (perm analytics.store, unaffected) now also
// renders and shares that icon with 'Inventory Control' (perm analytics.district). Before Job B,
// 'Inventory' had no sidebar entry at all, so this collision didn't exist.
const HIDDEN_WHEN_DENIED = {
  'analytics.ai': [],
  'analytics.brief': ['Daily Brief', 'Forecast Brief', '☀️', '🔭'],
  'analytics.dashboard': ['Calendar', 'Event Impact', 'My Reports', '📈'],
  'analytics.district': ['Above-Store One-Pager', 'District View', 'EOM Supervisor', 'Inventory Control', 'Org Summary', '⊞'],
  'analytics.forecasting': ['DI Calibration', 'DI Compare', 'Fcst Reference', 'Forecast Accuracy', 'Forecast Audit', 'Forecast Models', 'LifeLenz Bridge', 'LifeLenz Gap', 'Proj vs Actuals', 'Projections', '▦', '◎', '◑', '🌉', '📐', '🔬'],
  'analytics.labor': [],
  'analytics.store': ['3PO Delivery', 'Count Cycle', 'DT Speed of Service', 'End of Month', 'Food Cost', 'Graded Visits', 'Guest Voice', 'Inventory', 'Local News', 'Market Intelligence', 'Promo / Discount ROI', 'Rankings', 'Scheduling', 'Scheduling & Labor', 'Signals', 'Store One-Pager', 'Visit Readiness', '🎟️', '🏆', '💬', '📡', '📰', '🗓', '🗺', '🚗', '🛡️', '🛵', '🥗'],
  'data.upload': ['Data Manager', '🗄'],
  'reviews.view': ['Performance Reviews'],
  'security.view': ['Security', '🔒'],
  'settings.view': ['Panel Manager', 'Settings', '⚙', '🧩'],
};

describe('AppSidebar permission gates survive the Job B section-driven render', () => {
  it('denying each permission hides exactly the expected set of nav text', () => {
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

  it('denying analytics.store hides a whole empty section header too (Scheduling & Labor has no other member)', () => {
    // sched-hub is the ONLY Scheduling & Labor member, gated on analytics.store -- denying it
    // should make the "Scheduling & Labor" header itself vanish (panelsForSection returns [],
    // renderSection returns null), not leave a bare empty header behind. A section-driven nav
    // that only hid children would fail this exact case, and a pure-registry test could not see
    // it either way -- this is the render-based check that can.
    const shown = renderNavTexts(x => x !== 'analytics.store');
    expect(shown).not.toContain('Scheduling & Labor');
    // Operations, by contrast, keeps a member (EOM Supervisor, perm analytics.district) --
    // its header correctly SURVIVES, confirming the hide is per-section-emptiness, not a
    // blanket reaction to any permission denial anywhere in the nav.
    expect(shown).toContain('Operations');
    expect(shown).toContain('EOM Supervisor');
  });
});
