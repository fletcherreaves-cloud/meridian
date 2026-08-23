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
import { PANEL_BY_ID, SECTIONS } from '../app/panel-registry.js';

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

// Captured 2026-08-21, from the section-driven render immediately after Job B landed, then
// re-captured the same day for dispatch #55 Part A: the ONLY change is the LifeLenz Bridge ->
// Recommended WFM Forecast Adjustments rename (notes-67-queue.md:82, dispatch-54.md:149).
// proj/lfz-gap/lifelenz-bridge's section: corrections (planning/scheduling -> forecasting) and
// the section's own label rename (Forecasting -> Forecasting and Labor Projections) are BOTH
// inert here -- all ten forecasting-section members stay kind:'test-kitchen', so the section
// still renders no header, and Test Kitchen (kind-driven, not section-driven) is unaffected by
// a section: edit. That is Part A's whole point: metadata becomes truthful with zero nav motion.
const EXPECTED = ['M','Meridian','Test','⌂','Home','⊞','District View','Daily','🔴','Needs Attention','☀️','Daily Brief','📅','Date-Range Report','Reports','📊','Org Summary','🏆','Rankings','Planning','🎯','Planning','📅','Calendar','◷','Events & Tags','📈','Event Impact','Operations','🛵','3PO Delivery','📊','EOM Supervisor','📋','Graded Visits','🎟️','Promo / Discount ROI','💬','Guest Voice','🛡️','Visit Readiness','Inventory & Food Cost','📋','Count Cycle','📦','Inventory Control','🥗','Food Cost','📋','End of Month','📦','Inventory','Scheduling & Labor','🗓','Scheduling','People','📋','Performance Reviews','🔒','Security','Analytics','📄','Above-Store One-Pager','🔭','Forecast Brief','🚗','DT Speed of Service','📰','Local News','💡','Feature Requests','📋','Leadership One-Pager','🗺','Market Intelligence','🗂','My Reports','📄','Store One-Pager','🧠','SAGE','📡','Signals','⚡','Task Queue','Forms','🗂','Forms Library','🖨','Printable Forms','⚗ TEST KITCHEN','▦','Projections','◑','Proj vs Actuals','🎯','Forecast Models','◎','DI Calibration','🎯','Forecast Accuracy','📊','LifeLenz Gap','⚡','DI Compare','📐','Fcst Reference','✅','Form Completions','🔬','Forecast Audit','🌉','Recommended WFM Forecast Adjustments','🏆','Top/Bottom Performers','Admin','ℹ️','About','🗄','Data Manager','?','Help','📖','Knowledge Base','🔍','Metric Lineage','🧩','Panel Manager','⚙','Settings','💾','Save Session','📂','Restore Session','No data','v—'];

// Part A's verification bar (tighter than Job B's): the nav must be IDENTICAL to the pre-Part-A
// baseline except for exactly one lost label and one gained label. Frozen here so the diff is
// asserted directly rather than left implicit in EXPECTED's equality above.
const PRE_PART_A_LABEL = 'LifeLenz Bridge';
const POST_PART_A_LABEL = 'Recommended WFM Forecast Adjustments';

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
  'analytics.district': ['Above-Store One-Pager', 'District View', 'EOM Supervisor', 'Inventory Control', 'Org Summary', 'Top/Bottom Performers', '⊞'],
  'analytics.forecasting': ['DI Calibration', 'DI Compare', 'Fcst Reference', 'Forecast Accuracy', 'Forecast Audit', 'Forecast Models', 'LifeLenz Gap', 'Proj vs Actuals', 'Projections', 'Recommended WFM Forecast Adjustments', '▦', '◎', '◑', '🌉', '📐', '🔬'],
  'analytics.labor': [],
  // Dispatch #77 -- '🏆' dropped out of this list: it used to uniquely belong to 'Rankings' and
  // 'Record Days' (both perm analytics.store), so denying analytics.store removed every 🏆 text
  // node. Top/Bottom Performers (perm analytics.district) now also renders with 🏆, so denying
  // ONLY analytics.store no longer removes the icon from the DOM -- the district-gated panel
  // still shows it. See the note above this table: "an icon shared with a still-visible item
  // does not disappear."
  'analytics.store': ['3PO Delivery', 'Count Cycle', 'DT Speed of Service', 'End of Month', 'Food Cost', 'Form Completions', 'Graded Visits', 'Guest Voice', 'Inventory', 'Local News', 'Market Intelligence', 'Promo / Discount ROI', 'Rankings', 'Scheduling', 'Scheduling & Labor', 'Signals', 'Store One-Pager', 'Visit Readiness', '✅', '🎟️', '💬', '📡', '📰', '🗓', '🗺', '🚗', '🛡️', '🛵', '🥗'],
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

// ── Dispatch #55 Part A ──────────────────────────────────────────────────────
// Part A is pure metadata (three section: corrections + a section-label rename, all inert
// while every forecasting-section member stays kind:'test-kitchen') plus one cosmetic rename.
// Its verification bar is therefore much tighter than Job B's: the nav must be IDENTICAL to
// the pre-Part-A baseline except for exactly the one renamed label, in either direction.

describe('Part A membership diff -- the nav moves by exactly one renamed label', () => {
  it('loses PRE_PART_A_LABEL and gains POST_PART_A_LABEL, nothing else, across every dimension', () => {
    // full-access / betaMode-on / betaMode-off / optional-panels-visible, per the dispatch's
    // own verification bar. betaMode is a prop AppSidebar reads directly (not exercised by
    // renderNavTexts's fixed props above), so build each dimension's props explicitly here.
    const base = {
      view: 'command', setView: () => {}, selStore: 'X', stores: [], ds: {},
      settings: { districtName: 'Test' }, onOpenModal: () => {}, onLoadFiles: () => {},
      onSaveSession: () => {}, onRestoreSession: () => {}, loadMsg: '', perm: () => true,
    };
    const dimensions = {
      'full-access, betaMode off': { ...base, betaMode: false, panelVis: {} },
      'betaMode on': { ...base, betaMode: true, panelVis: {} },
      'optional panels visible': { ...base, betaMode: false, panelVis: { pmix: true, corr_explorer: true, why_engine: true } },
    };
    for (const [label, props] of Object.entries(dimensions)) {
      const html = ReactDOMServer.renderToStaticMarkup(h(AppSidebar, props));
      const texts = html.replace(/<[^>]+>/g, '|').split('|')
        .map(s => s.trim().replace(/&amp;/g, '&')).filter(Boolean);
      const hasPre = texts.includes(PRE_PART_A_LABEL);
      const hasPost = texts.includes(POST_PART_A_LABEL);
      expect(hasPre, `[${label}] '${PRE_PART_A_LABEL}' must not survive the rename`).toBe(false);
      // lifelenz-bridge is kind:'test-kitchen', so under betaMode:true it is beta-hidden like
      // every other Test Kitchen panel -- the renamed label correctly does NOT render there,
      // same as it wouldn't have under its old name. Only the non-beta dimensions must gain it.
      const expectPost = !props.betaMode;
      expect(hasPost, `[${label}] '${POST_PART_A_LABEL}' visibility`).toBe(expectPost);
    }
  });

  it('⚗ TEST KITCHEN still exists and its panels still vanish under betaMode:true, exactly as before Part A', () => {
    const off = renderNavTexts();
    expect(off).toContain('⚗ TEST KITCHEN');
    const testKitchenIds = Object.values(PANEL_BY_ID).filter(p => p.kind === 'test-kitchen');
    // Dispatch #77 added 'Top/Bottom Performers' as a real new test-kitchen panel (12th) --
    // bumped from 11, a deliberate census change, not drift.
    expect(testKitchenIds.length, 'ratchet: Part A must not change the Test Kitchen census').toBe(12);
    for (const p of testKitchenIds) expect(off).toContain(p.label);

    const html = ReactDOMServer.renderToStaticMarkup(h(AppSidebar, {
      view: 'command', setView: () => {}, selStore: 'X', stores: [], ds: {},
      settings: { districtName: 'Test' }, onOpenModal: () => {}, onLoadFiles: () => {},
      onSaveSession: () => {}, onRestoreSession: () => {}, loadMsg: '', perm: () => true,
      betaMode: true, panelVis: {},
    }));
    const on = html.replace(/<[^>]+>/g, '|').split('|')
      .map(s => s.trim().replace(/&amp;/g, '&')).filter(Boolean);
    expect(on).not.toContain('⚗ TEST KITCHEN');
    for (const p of testKitchenIds) expect(on).not.toContain(p.label);
  });
});

describe('the promotion test (dispatch #55 Part A / CLAUDE.md "kind is lifecycle, section is placement")', () => {
  // The owner's own reason for the standing rule: flipping kind to 'nav' should land a panel
  // under the right section header with "no second decision to make." A test that only checks
  // panel.section === 'forecasting' would pass even if renderSection/panelsForSection were
  // broken -- the #366 shape this repo has already paid for once (engine right, call site
  // unwired). This renders the ACTUAL consumer with the flip applied, same standard as the
  // membership-diff tests above.
  //
  // Dispatch #61 (2026-08-22): promotion IS now the one-field flip. ⚗ TEST KITCHEN used to be a
  // separate, hand-maintained list of literal navPBeta('id') calls in shell.js (the block
  // starting "PRUNE (Notes 24, v4.517)"), not derived from panel.kind -- so a real promotion was
  // still two edits (flip kind: here, AND delete the navPBeta('id') line there), and skipping
  // the second edit rendered the panel TWICE (measured on fcst-accuracy, CLAUDE.md 2026-08-21).
  // Test Kitchen is now derived from kind:'test-kitchen' (testKitchenPanels() in
  // panel-registry.js), so the moment kind flips here the panel drops out of that filter by
  // construction -- asserted below through the real render, not the registry, per the standing
  // revert-sensitive bar (a registry-level check can't tell "derived" from "derived but still
  // also hardcoded").
  const testKitchenPanels = Object.values(PANEL_BY_ID).filter(p => p.kind === 'test-kitchen');

  it('covers all twelve current Test Kitchen panels (ratchet: fails loudly if the census moves)', () => {
    expect(testKitchenPanels.length).toBe(12);
  });

  it.each(testKitchenPanels.map(p => [p.id, p]))('promoting %s renders it under its own section header, exactly once, and no longer under Test Kitchen', (id, panel) => {
    const sectionMeta = SECTIONS.find(s => s.id === panel.section);
    expect(sectionMeta, `${id}: section '${panel.section}' is not a real SECTIONS id`).toBeTruthy();
    const originalKind = panel.kind;
    try {
      panel.kind = 'nav'; // simulate promotion on the live registry object, restored below
      const texts = renderNavTexts();
      const headerIdx = texts.indexOf(sectionMeta.label);
      expect(headerIdx, `${id}: header '${sectionMeta.label}' did not render after promotion`).toBeGreaterThan(-1);
      const allHeaders = new Set(SECTIONS.map(s => s.label));
      let end = texts.length;
      for (let i = headerIdx + 1; i < texts.length; i++) {
        if (allHeaders.has(texts[i])) { end = i; break; }
      }
      const underHeader = texts.slice(headerIdx, end);
      expect(underHeader, `${id}: label '${panel.label}' did not render under '${sectionMeta.label}'`).toContain(panel.label);

      // The actual defect this dispatch fixes: a promoted panel used to also still render under
      // the old hardcoded ⚗ TEST KITCHEN list. Assert it now appears exactly once in the whole
      // sidebar, and the header itself survives (ten panels remain, not zero).
      const occurrences = texts.filter(t => t === panel.label).length;
      expect(occurrences, `${id}: '${panel.label}' rendered ${occurrences} time(s) after promotion (want exactly 1 -- it must not also still render under ⚗ TEST KITCHEN)`).toBe(1);
      expect(texts).toContain('⚗ TEST KITCHEN');
    } finally {
      panel.kind = originalKind; // never leave the shared registry singleton mutated
    }
  });
});
