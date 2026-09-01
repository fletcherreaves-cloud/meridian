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
// re-captured the same day for dispatch #55 Part A: the ONLY change was the LifeLenz Bridge ->
// Recommended WFM Forecast Adjustments rename (notes-67-queue.md:82, dispatch-54.md:149).
// proj/lfz-gap/lifelenz-bridge's section: corrections (planning/scheduling -> forecasting) and
// the section's own label rename (Forecasting -> Forecasting and Labor Projections) are BOTH
// inert here -- all ten forecasting-section members stay kind:'test-kitchen', so the section
// still renders no header, and Test Kitchen (kind-driven, not section-driven) is unaffected by
// a section: edit. That is Part A's whole point: metadata becomes truthful with zero nav motion.
// Re-captured again 2026-08-24 for dispatch #105's correction: the SAME panel (lifelenz-bridge)
// renamed a second time, "Recommended WFM Forecast Adjustments" -> "MBI vs LifeLenz Accuracy"
// -- owner-confirmed replacing the earlier "Forecast Reconciliation" proposal -- as the tool grew
// a real date-range control plus a genuine backward-looking accuracy view. Only that one label
// text changed; position (tkOrder 11, still kind:'test-kitchen') is untouched.
// Re-captured again 2026-08-24 for dispatch #106 Phase B: fcst-accuracy ("Forecast Accuracy")
// and lifelenz-bridge ("MBI vs LifeLenz Accuracy") merged into one new test-kitchen entry,
// forecast-reports ("Forecast Reports", tkOrder 5 -- fcst-accuracy's old slot). Both former
// entries flipped to kind:'hub-tab', which renders NOWHERE in the sidebar (same as
// sched-summary/labor-analytics), so their old labels/icons ('Forecast Accuracy', 🌉/'MBI vs
// LifeLenz Accuracy') drop out of this snapshot entirely, replaced by one 'Forecast Reports'
// entry at Test Kitchen's tkOrder-5 slot.
// Re-captured again 2026-08-25 for dispatch #123: 'Crew Schedule' (Crew Schedule Lookup) added
// as a new kind:'nav', section:'people', route:true entry -- lands first in the People section
// (PANELS' declaration order is alphabetical by id, and 'crew-schedule' sorts before
// 'perf-reviews'/'security'). Re-captured again same day for dispatch #125's RBAC re-decision:
// perm flipped from 'security.view' to 'analytics.store' (ordinary panel RBAC, once the panel
// stopped gating on an identity reveal) -- text content unaffected, only the permission-gate
// tables below change.
// Re-captured again 2026-08-25 for dispatch #140 item 1: 'sched-retention' (Training Retention)
// moved from a standalone kind:'nav' sidebar entry into the Scheduling & Labor hub as a tab
// (kind:'hub-tab', same demotion #106 did for fcst-accuracy/lifelenz-bridge) -- 'Training
// Retention' and its unique 🎓 icon drop out of the sidebar snapshot entirely, same as
// 'sched-summary'/'labor-analytics' render nowhere today.
// Re-captured again 2026-08-25 for dispatch #138: 'time-punches' (Time Punches) added as a new
// kind:'nav', section:'people', route:true entry, companion to 'crew-schedule'. It lands LAST in
// the People section -- panelsForSection() preserves PANELS' declaration order, and 'time-punches'
// is declared alphabetically after 'targets-editor'/'task-queue' (i.e. after 'security', the
// section's other two nav members), not adjacent to 'crew-schedule'.
// Re-captured again 2026-08-28 for dispatch #188, #189, #190 and #191, landing together:
// 'fob-eom' (End of Month) converted from a standalone kind:'nav'/route:true entry to
// kind:'internal' (folded into Food Cost as an EOM mode, dispatch #188); 'count-cycle' (Count
// Cycle) converted from a standalone kind:'nav'/route:true entry to kind:'hub-tab' (folded into
// Inventory Control as a tab, dispatch #189) -- same demotion #106/#140 did for fcst-accuracy/
// lifelenz-bridge/sched-retention; 'leader-one-pager' (Leadership One-Pager) retired entirely
// (folded into Above-Store One-Pager behind a Rollup/Leadership scope selector, dispatch #190);
// and 'calendar-manager' ('Calendar', 📅) merged into Events & Tags as a Calendar mode (App.js's
// EventsAndTagsPanel) and flipped to kind:'internal' (dispatch #191). All four drop out of this
// snapshot entirely; their shared icons (📋 for the first three) stay in the DOM via other
// owners (Graded Visits/Performance Reviews), just not via any of these labels any more. Planning
// is three links now, not four (hub · Events & Tags · Event Impact).
// Re-captured 2026-08-28 for dispatch #196: the former single 'help' entry (Admin section,
// '?' icon) split in two, BOTH now under a real 'Help' section header (SECTIONS has always
// declared this section id -- it just had zero members until now, an inert-section pattern
// CLAUDE.md's kind/section rule flags). 'Workflow' (was 'help', same "Workflow Guide" modal
// content, new '🧭' icon) and 'Troubleshooting' (genuinely new panel, inherits the old '?'
// icon) render together right after Forms, in that order -- the section sits where SECTIONS
// declares it (right before Admin), and Forms is the section immediately before it that
// actually renders anything (Forecasting/Intelligence between them are both all-hidden/
// all-test-kitchen, same as before this dispatch). Admin loses its '?'/'Help' pair, since
// 'help' no longer has a section:'admin' member.
// Re-captured again 2026-08-28 for dispatch #194: 'feature-requests' ('Feature Requests', 💡)
// retired entirely -- merged into Task Queue with a `type` field (harvest-then-remove, per the
// owner's 2026-08-10 decision). 💡 had no other owner, so both the label and the icon drop out
// of this snapshot; 'Task Queue'/'⚡' stays exactly where it was (same id, same slot).
// Re-captured again 2026-08-28 for dispatch #197: 'time-punches' ('Time Punches', 🕐) merged into
// 'crew-schedule' (Crew Schedule Lookup) as a Punches tab (owner, live in session: "Crew Schedule
// and Time punches can be merged to same page also"). kind:'nav' -> kind:'internal', so the
// People section loses this entry entirely -- 🕐 had no other owner, so both the label and the
// icon drop out of this snapshot, same "harvest, no other icon claims it" shape as #194's 💡
// above. 'Crew Schedule'/'🗓' (People section) is unchanged -- same id, same slot, now a
// Schedule/Punches tab strip internally.
// Re-captured again 2026-08-28 for dispatch #202: 'eom-summary' ('EOM Supervisor', 📊) folded
// into the Inventory Control hub as a Supervisor Rollup tab, kind:'nav' -> kind:'internal', same
// demotion #189 gave 'count-cycle' above. 'EOM Supervisor' drops out of the Operations section
// entirely -- Operations is now just the 3PO Delivery/Graded Visits/Promo/Guest Voice/Visit
// Readiness five, all analytics.store. Its 📊 icon stays in the DOM via Org Summary
// (operator-summary, still kind:'nav') and LifeLenz Gap (still kind:'test-kitchen'), neither
// affected by this retirement -- same "shared icon, other owner survives" shape as #188/#189's
// own 📋 note above.
// Re-captured again 2026-08-28 for dispatch #203 (landed same session as #202 above, on top of
// its Operations-section change): 'ranking' relabeled 'Rankings' -> 'Leaderboards' (Reports
// section, unchanged slot) now that it covers all three merged questions. 'top-bottom'
// ('Top/Bottom Performers', 🏆, Test Kitchen) is RETIRED (kind:'test-kitchen' -> kind:'internal',
// folded into 'ranking' as a mode) -- both the label and its 🏆 drop out of ⚗ TEST KITCHEN
// entirely (🏆 is still present once, on Leaderboards in the Reports section, from 'ranking'
// itself -- same "harvest, no other icon claims it in THIS section" shape as #194/#197's drops).
const EXPECTED = ['M','Meridian','Test','⌂','Home','⊞','District View','Daily','🔴','Needs Attention','☀️','Daily Brief','📅','Date-Range Report','Notifications','📧','Email Digests','Reports','📊','Org Summary','🏆','Leaderboards','Planning','🎯','Planning','◷','Events & Tags','📈','Event Impact','Operations','🛵','3PO Delivery','📋','Graded Visits','🎟️','Promo / Discount ROI','💬','Guest Voice','🛡️','Visit Readiness','Inventory & Food Cost','📦','Inventory Control','🥗','Food Cost','📦','Inventory','Scheduling & Labor','🗓','Scheduling','People','🗓','Crew Schedule','📋','Performance Reviews','🔒','Security','Analytics','📄','Above-Store One-Pager','🔭','Forecast Brief','🚗','DT Speed of Service','📰','Local News','🗺','Market Intelligence','🗂','My Reports','📄','Store One-Pager','🧠','SAGE','📡','Signals','⚡','Task Queue','Forms','🗂','Forms Library','🖨','Printable Forms','📝','Digital Checklists','Help','🧭','Workflow','?','Troubleshooting','⚗ TEST KITCHEN','▦','Projections','◑','Proj vs Actuals','🎯','Forecast Models','◎','DI Calibration','🎯','Forecast Reports','📊','LifeLenz Gap','⚡','DI Compare','📐','Fcst Reference','✅','Form Completions','🔬','Forecast Audit','💰','Opportunity $','💲','Pricing Engine','Admin','ℹ️','About','🗄','Data Manager','📖','Knowledge Base','🔍','Metric Lineage','🧩','Panel Manager','⚙','Settings','💾','Save Session','📂','Restore Session','No data','v—'];

// Part A's verification bar (tighter than Job B's): the nav must be IDENTICAL to the pre-Part-A
// baseline except for exactly one lost label and one gained label. Frozen here so the diff is
// asserted directly rather than left implicit in EXPECTED's equality above.
const PRE_PART_A_LABEL = 'LifeLenz Bridge';
const POST_PART_A_LABEL = 'MBI vs LifeLenz Accuracy';

describe('AppSidebar renders the section-driven nav (dispatch #54 Job B)', () => {
  it('produces the exact post-regroup text content, in order', () => {
    expect(renderNavTexts()).toEqual(EXPECTED);
  });

  it('the Planning section is exactly the owner\'s three links, hub first -- not five exploded tabs (dispatch #191: Calendar merged into Events & Tags)', () => {
    const texts = renderNavTexts();
    const start = texts.indexOf('Planning'); // the section header
    const slice = texts.slice(start, start + 7);
    expect(slice).toEqual(['Planning', '🎯', 'Planning', '◷', 'Events & Tags', '📈', 'Event Impact']);
  });

  it('Inventory & Food Cost holds all six named panels -- three real nav entries plus End of Month (internal) and Count Cycle (hub-tab) and Product Mix (reachable once enabled)', () => {
    // Dispatch #188 -- fob-eom dropped out of the sidebar: still section:'inventory-food-cost'
    // (truthful per CLAUDE.md's "section: must be truthful even when nothing renders it" rule)
    // but kind:'internal' now, not kind:'nav' -- it's reachable only via Food Cost's own EOM
    // mode / the ?panel=fob-eom redirect, never its own sidebar entry.
    // Dispatch #189 -- count-cycle dropped out of the sidebar too: kind:'hub-tab' (same
    // "section stays truthful even though nothing renders it" rule), reachable only via
    // Inventory Control's Count Cycle tab.
    const invFoodCost = ['fob-analysis', 'fob-eom', 'eom-dashboard', 'count-cycle', 'inventory', 'pmix']
      .map(id => PANEL_BY_ID[id].section);
    expect(invFoodCost.every(s => s === 'inventory-food-cost')).toBe(true);
    expect(PANEL_BY_ID['fob-eom'].kind).toBe('internal');
    expect(PANEL_BY_ID['count-cycle'].kind).toBe('hub-tab');
    // Only pmix stays kind:'optional' (Panel Manager toggle) -- the other three (fob-analysis,
    // eom-dashboard, inventory) are ordinary always-visible nav entries, confirmed present in
    // the rendered text above.
    const texts = renderNavTexts();
    for (const label of ['Food Cost', 'Inventory Control', 'Inventory']) {
      expect(texts).toContain(label);
    }
    // Neither End of Month nor Count Cycle has its own sidebar entry any more -- both reachable
    // only via their respective host panel's mode/tab.
    expect(texts).not.toContain('End of Month');
    expect(texts).not.toContain('Count Cycle');
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
  // dispatch #191 (2026-08-28): 'Calendar' dropped out of this list -- calendar-manager is
  // kind:'internal' now (merged into Events & Tags), no longer a sidebar entry to hide at all.
  'analytics.dashboard': ['Event Impact', 'My Reports', '📈'],
  // dispatch #202 (2026-08-28): 'EOM Supervisor' dropped out -- kind:'internal' now, renders
  // nowhere in the sidebar regardless of permission, so an analytics.district denial can't hide
  // text that was never rendered in the first place. 📊 stays absent from this list (unchanged --
  // it was never here even when EOM Supervisor carried it, since LifeLenz Gap, perm
  // analytics.forecasting, always kept it rendering under an analytics.district-only denial).
  // dispatch #203 (2026-08-28, same session) ALSO dropped 'Top/Bottom Performers' from this list
  // -- top-bottom is kind:'internal' now (merged into 'ranking'/Leaderboards as a mode), no longer
  // a sidebar entry to hide at all (same "renders nowhere in the sidebar any more" shape as
  // fob-eom/count-cycle/time-punches/eom-summary above).
  'analytics.district': ['Above-Store One-Pager', 'District View', 'Inventory Control', 'Opportunity $', 'Org Summary', '⊞', '💰'],
  // dispatch #106 Phase B (2026-08-24): 'Forecast Accuracy' and 'MBI vs LifeLenz Accuracy' no
  // longer render as their own nav text at all (both are now kind:'hub-tab', which renders
  // nowhere in the sidebar) -- replaced by the merged 'Forecast Reports' entry. '🌉' had no
  // other owner so it drops out of this hidden-set entirely, not just off this one label.
  'analytics.forecasting': ['DI Calibration', 'DI Compare', 'Fcst Reference', 'Forecast Audit', 'Forecast Models', 'Forecast Reports', 'LifeLenz Gap', 'Proj vs Actuals', 'Projections', '▦', '◎', '◑', '📐', '🔬'],
  'analytics.labor': [],
  // Dispatch #77 -- '🏆' dropped out of this list: it used to uniquely belong to 'Rankings' and
  // 'Record Days' (both perm analytics.store), so denying analytics.store removed every 🏆 text
  // node. Top/Bottom Performers (perm analytics.district) then also rendered with 🏆, so denying
  // ONLY analytics.store stopped removing the icon from the DOM -- the district-gated panel
  // still showed it.
  // Dispatch #203 (2026-08-28) REVERSES that: Top/Bottom Performers no longer has its own sidebar
  // entry at all (merged into 'ranking'/Leaderboards as a mode, kind:'internal'), so 🏆 is once
  // again uniquely owned by the single Leaderboards entry, perm analytics.store. '🏆' goes back
  // into this list, alongside the relabeled 'Leaderboards' ('Rankings' before this dispatch).
  // dispatch #123 (2026-08-25) briefly dropped '🗓' out of this list ('Crew Schedule' was gated
  // 'security.view' then, so 'Scheduling' alone kept the icon visible under an analytics.store
  // denial). Dispatch #125's RBAC re-decision (same day) moved 'Crew Schedule' to
  // perm:'analytics.store' too, so now BOTH 🗓-owning panels are gated by the same permission --
  // 🗓 (and 'Crew Schedule' itself) go back to disappearing when analytics.store is denied, same
  // as any icon with no other owner.
  // dispatch #134 (2026-08-25) added 'Training Retention' (perm analytics.store, unique 🎓 icon)
  // to the Scheduling & Labor section, joining this list; dispatch #140 item 1 (same day) moved
  // it into the hub as a kind:'hub-tab' tab, so it renders nowhere in the sidebar any more --
  // both 'Training Retention' and '🎓' drop back out, same as 'Sched Summary'/'Scheduling' (the
  // OTHER hub-tab siblings) never appeared here either.
  // dispatch #138 (2026-08-25) added 'Time Punches' (perm analytics.store, unique 🕐 icon) to the
  // People section, joining this list.
  // dispatch #188 (2026-08-28) dropped 'End of Month' from this list -- fob-eom is kind:'internal'
  // now (no sidebar entry of its own, folded into Food Cost as a mode), so denying
  // analytics.store no longer hides that text node; its shared 📋 icon stays (Graded Visits/
  // Performance Reviews still render it).
  // dispatch #189 (2026-08-28) converted 'Count Cycle' to kind:'hub-tab' (folded into
  // Inventory Control), same "renders nowhere in the sidebar any more" demotion as 'Training
  // Retention' above -- 'Count Cycle' also drops out of this list. Both landed together, so
  // this list loses both entries at once; the shared 📋 icon stays IN the DOM regardless
  // (Graded Visits and Performance Reviews carry it too, neither gated by analytics.store alone
  // -- Graded Visits IS, so 📋 was never removable by this denial in the first place; unaffected
  // either way).
  // dispatch #197 (2026-08-28) merged 'Time Punches' into 'Crew Schedule' as a Punches tab
  // (kind:'nav' -> kind:'internal') -- same "renders nowhere in the sidebar any more" demotion
  // as 'Count Cycle'/'Training Retention' above. Both 'Time Punches' and its unique 🕐 icon drop
  // out of this list; 'Crew Schedule' and 🗓 are unaffected (unique-owner reasoning already
  // covered by the dispatch #125 note above).
  // dispatch #202 (2026-08-28): 'Operations' (the section header itself) joins this list.
  // EOM Supervisor was the section's one non-analytics.store member -- with it gone, all five
  // remaining Operations members (3PO Delivery/Graded Visits/Promo/Guest Voice/Visit Readiness)
  // are perm:'analytics.store', so denying it now empties the section entirely and
  // panelsForSection()/renderSection() drop the header too, same "fully empty -> header vanishes"
  // behavior 'Scheduling & Labor' already demonstrates below (see the next test).
  // dispatch #203 (2026-08-28, same session) relabeled 'Rankings' -> 'Leaderboards' and added
  // '🏆' back into this list -- see the dispatch #77/#203 note above 'analytics.forecasting'.
  // 'Pricing Engine'/'💲' (dispatch #212, 2026-08-29) added -- kind:'test-kitchen',
  // perm:'analytics.store' (looser than 'Opportunity $'/'💰', which is analytics.district),
  // so it joins THIS hidden-set, same shape as every other analytics.store Test Kitchen
  // panel (e.g. 'Form Completions' above).
  'analytics.store': ['3PO Delivery', 'Crew Schedule', 'DT Speed of Service', 'Food Cost', 'Form Completions', 'Graded Visits', 'Guest Voice', 'Inventory', 'Leaderboards', 'Local News', 'Market Intelligence', 'Operations', 'Pricing Engine', 'Promo / Discount ROI', 'Scheduling', 'Scheduling & Labor', 'Signals', 'Store One-Pager', 'Visit Readiness', '✅', '🏆', '🎟️', '💬', '💲', '📡', '📰', '🗓', '🗺', '🚗', '🛡️', '🛵', '🥗'],
  'data.upload': ['Data Manager', '🗄'],
  // 'Targets Editor' (dispatch #132 item 3) is no longer a standalone nav entry as of dispatch
  // #135 item 3 -- it moved into Performance Review > Customize > Targets (converted to
  // kind:'hub-tab' in panel-registry.js, same "opens a hub and selects a tab" pattern as
  // fcst-accuracy/lifelenz-bridge). A reviews.customize denial therefore hides nothing in the
  // SIDEBAR any more -- the Customize tab itself (inside Performance Reviews) is where that
  // permission now gates visibility, which this nav-only snapshot doesn't reach.
  'reviews.customize': [],
  'reviews.view': ['Performance Reviews'],
  // 'Crew Schedule' no longer carries perm:'security.view' as of dispatch #125 (moved to
  // analytics.store, see above) -- 🔒 is unique to 'Security' so it disappears with it.
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

  it('denying analytics.store hides a whole empty section header too (Scheduling & Labor has no other-permission member)', () => {
    // sched-hub is the ONLY Scheduling & Labor nav member (sched-retention, dispatch #134,
    // moved into the hub as a tab under dispatch #140 item 1 and no longer renders in the
    // sidebar at all) -- gated on analytics.store, so denying it should make the "Scheduling &
    // Labor" header itself vanish (panelsForSection returns [], renderSection returns null), not
    // leave a bare empty header behind. A section-driven nav that only hid children would fail
    // this exact case, and a pure-registry test could not see it either way -- this is the
    // render-based check that can.
    const shown = renderNavTexts(x => x !== 'analytics.store');
    expect(shown).not.toContain('Scheduling & Labor');
    // Operations, by contrast, used to keep a member (EOM Supervisor, perm analytics.district)
    // whose header correctly SURVIVED an analytics.store-only denial. Dispatch #202 folded EOM
    // Supervisor into the Inventory Control hub, so Operations no longer has a non-store member
    // either -- re-measured fresh (not assumed): it now behaves exactly like 'Scheduling & Labor'
    // above, confirming this is still per-section-emptiness, not a special case for one section.
    expect(shown).not.toContain('Operations');
    expect(shown).not.toContain('EOM Supervisor');
    // Inventory & Food Cost takes over as the "keeps a member, header survives" contrast case --
    // Inventory Control (eom-dashboard, perm analytics.district) is its one non-store member,
    // alongside Food Cost/Inventory (both analytics.store).
    expect(shown).toContain('Inventory & Food Cost');
    expect(shown).toContain('Inventory Control');
  });
});

// ── Dispatch #55 Part A (SUPERSEDED 2026-08-24 by dispatch #106 Phase B) ─────────────────────
// Part A was pure metadata (three section: corrections + a section-label rename, all inert
// while every forecasting-section member stayed kind:'test-kitchen') plus one cosmetic rename,
// verified below by "the nav moves by exactly one renamed label, in either direction." That
// bar no longer describes live behavior: dispatch #106 Phase B converted lifelenz-bridge from
// kind:'test-kitchen' to kind:'hub-tab', which renders in NEITHER the regular sections NOR
// Test Kitchen (see panelsForSection/testKitchenPanels in panel-registry.js) -- so
// POST_PART_A_LABEL ('MBI vs LifeLenz Accuracy') no longer renders standalone in ANY
// dimension, not just under betaMode. The panel itself is unchanged and still reachable, now
// as one of ForecastReportsPanel's two internal tabs (exercised by App.js-level tests, not
// this sidebar-only render). Updated to assert the new invariant rather than delete the
// history -- PRE_PART_A_LABEL and POST_PART_A_LABEL constants are kept for their doc value.

describe('Part A membership diff (superseded) -- neither the old nor the renamed label renders standalone any more', () => {
  it('PRE_PART_A_LABEL and POST_PART_A_LABEL are both absent, across every dimension', () => {
    // full-access / betaMode-on / betaMode-off / optional-panels-visible -- same four
    // dimensions Part A's own verification bar used, kept for continuity.
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
      expect(hasPre, `[${label}] '${PRE_PART_A_LABEL}' must not render standalone`).toBe(false);
      // dispatch #106 Phase B: kind:'hub-tab' renders nowhere in the sidebar, in every
      // dimension -- unlike the old kind:'test-kitchen' behavior this block used to assert.
      expect(hasPost, `[${label}] '${POST_PART_A_LABEL}' must not render standalone (folded into 'Forecast Reports')`).toBe(false);
    }
  });

  it('⚗ TEST KITCHEN still exists and its panels still vanish under betaMode:true, exactly as before Part A', () => {
    const off = renderNavTexts();
    expect(off).toContain('⚗ TEST KITCHEN');
    const testKitchenIds = Object.values(PANEL_BY_ID).filter(p => p.kind === 'test-kitchen');
    // Dispatch #77 added 'Top/Bottom Performers' as a real new test-kitchen panel (12th) --
    // bumped from 11, a deliberate census change, not drift. Opportunity $ v1 adds a 13th,
    // same reasoning (memory/design-opportunity-dollars.md). Dispatch #106 Phase B (2026-08-24)
    // then merged fcst-accuracy + lifelenz-bridge into one new test-kitchen entry,
    // forecast-reports -- 13 - 2 + 1 = 12. This test's own name ("Part A must not change...")
    // predates that merge; the ratchet still belongs here as the single place the current
    // census is asserted. Dispatch #203 (2026-08-28) promoted 'Top/Bottom Performers' OUT of
    // Test Kitchen entirely (kind:'test-kitchen' -> kind:'internal', merged into 'ranking'/
    // Leaderboards as a mode) -- 12 - 1 = 11, a deliberate shrink, not drift. Dispatch #212
    // (2026-08-29) added 'pricing-engine' (Pricing Engine, 💲) as a new kind:'test-kitchen'
    // panel -- 11 + 1 = 12, a deliberate growth, not drift.
    expect(testKitchenIds.length, 'ratchet: ids may change (dispatch #212 added one), the CENSUS must not drift silently').toBe(12);
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
    // 13 -> 12: dispatch #106 Phase B merged fcst-accuracy + lifelenz-bridge (both
    // kind:'test-kitchen') into one new kind:'test-kitchen' entry, forecast-reports.
    // 12 -> 11: dispatch #203 promoted 'top-bottom' OUT of Test Kitchen (kind:'test-kitchen' ->
    // kind:'internal'), merged into 'ranking'/Leaderboards as a mode.
    // 11 -> 12: dispatch #212 (2026-08-29) added 'pricing-engine' (Pricing Engine) as a new
    // kind:'test-kitchen' panel.
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
