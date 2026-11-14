// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), batch 21 — 2026-11-14.
//
// Re-measured the real unwired-key gap fresh (whitespace-tolerant `articleKey:\s*['"]<key>['"]`
// regex across all of src/, not a brittle literal-string grep — the earlier no-space-only check
// undercounted "wired" by missing several real `articleKey: '...'` (WITH a space) call sites).
// 119 distinct KB_ARTICLES keys, 25 unwired before this batch. Of those, the Forecast Engine
// internals (oepe/tpph/labor_pct/forecast_formula/model_types/etc., 18 keys) and panel_index
// remain the same deliberately-permanent exceptions every prior batch has already documented —
// NOT re-litigated here. The 5 genuinely open candidates named in the batch-20/20-follow-up
// notes were: cash_os, drawer_open, condiment_pct, data_collection_bounds, count_cycle_guide.
//
// Resolved 3 of the 5:
//
// - cash_os -> CashControlsCockpitTab's HeroNumber (src/views/store-cockpit.js), the real
//   "Cash Over/Short % — trailing 6 weeks" hero label. HeroNumber's own `label` prop renders
//   straight into a div with no string method applied to it, confirmed by reading the component
//   before passing a composite node -- safe, same as every other Card-title/label wiring so far.
// - drawer_open -> the same tab's "Drawer Opens/Day" DriverRow (Loss Prevention Signals card).
//   DriverRow's `label` prop is the same safe shape.
// - data_collection_bounds -> Data Manager's Overview-tab per-source coverage table
//   (src/views/analytics.js) previously had NO header text of its own above the raw table --
//   added one ("DATA COVERAGE"), same "added a subtitle where none existed" precedent batch 19
//   established for settings_guide. This is the article data_manager_guide's own prose already
//   points readers to by name ("see the Data Collection Bounds article") for genuine data floors
//   vs. backfill artifacts, so the coverage table that shows Earliest/Latest per source is
//   exactly the real UI it's about.
//
// Deliberately NOT resolved, same "needs more than mechanical wiring" standard as batch 20:
// - condiment_pct: checked a SECOND file beyond store-cockpit.js's own chart-legend-only mention
//   (at-a-glance.js's FOB COMPONENTS grid) -- Condiment only ever renders as one row inside a
//   generic .map() over 6 sibling waste components (Unexplained/Comp Waste/Raw Waste/Condiment/
//   Emp Meal/Stat Var), never with its own standalone labeled header. Singling one row out of
//   six for an icon (without the other five) would read as arbitrary, not a real fix -- the same
//   conclusion batch 20 already reached in store-cockpit.js, now confirmed in a second file too.
// - count_cycle_guide: re-confirmed again (5th time, batches 16-20) -- CountCycleSection
//   (src/views/eom-dashboard.js) is still a body-only component inside a tabbed hub with no
//   dedicated per-tab header of its own.
//
// Also fixed, found while re-measuring the real key count (not a hypothesis -- grepped the
// literal key name and found it defined twice): KB_ARTICLES had a genuine duplicate top-level
// key, `graded_visits_guide`, defined once near performance_reviews_guide (a thinner, now-dead
// draft, silently shadowed at runtime by JS's own last-key-wins object-literal semantics) and
// again near customer_complaints_guide (the real, richer, currently-displayed one referencing
// parseGradedVisit/parseEcoSureVisit and PeakDetailBlock). Deleted the dead shadowed copy; the
// live one (and its own existing wiring, if any) is untouched. This is the same class of bug
// `file_import_guide`'s deletion caught in batch 20's follow-up, just a duplicate key instead of
// a stale one.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { lastClosedBusinessDay } from '../utils/date.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

let container, root;
afterEach(() => {
  if (root) act(() => root.unmount());
  if (container) container.remove();
  container = null; root = null;
});

function mountEl(el) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(el); });
}

// Same disambiguating helper as dispatch-kb-panel-guide-batch17-2026-11-11.test.js -- with two
// InfoIcons mounted on one page (CashControlsCockpitTab renders both cash_os and drawer_open at
// once), pick whichever icon's nearest matching ancestor (fewest hops) contains `near`.
function clickInfoIcon(near) {
  const icons = Array.from(container.querySelectorAll('span[title^="Click for details"]'));
  const depthOf = (el) => {
    for (let node = el, hops = 0; node && hops < 8; node = node.parentElement, hops++) {
      if (node.textContent?.includes(near)) return hops;
    }
    return Infinity;
  };
  const icon = near
    ? icons.map(el => ({ el, d: depthOf(el) })).sort((a, b) => a.d - b.d)[0]?.el
    : icons[0];
  expect(icon, 'InfoIcon "?" control not found').toBeTruthy();
  act(() => { icon.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('InfoIcon rollout batch 21 (2026-11-14)', () => {
  const CASH_STORE = {
    loc: '10422', name: 'Atoka-Mississippi', org: 'MCDOK',
    t: { tCashOSPct: -0.0005, tRedAPct: 0.002, tRedBPct: 0.03, tDiscCoupPct: 0.008, tPosOverPct: 0.003, tPromoPct: 0.03, tDrawer: 50 },
  };

  it('Cash Controls Cockpit tab: Cash O/S hero (cash_os) and Drawer Opens driver row (drawer_open)', async () => {
    const { CashControlsCockpitTab } = await import('../views/store-cockpit.js');
    const row = {
      loc: '10422', date: lastClosedBusinessDay(),
      netSalesAmt: 100000, cashOSAmt: -100, tRedAAmt: 300, tRedBAmt: 3000, discAmt: 1000,
      posOverAmt: 400, promoPct: 0.025, drawerOpens: 60, cashRefCnt: 4,
    };
    mountEl(h(CashControlsCockpitTab, { store: CASH_STORE, ds: { opsCashRows: [row] } }));
    expect(container.textContent).toContain('Cash Over/Short');

    clickInfoIcon('Cash Over/Short');
    expect(container.textContent).toContain('Cash O/S — Cash Over/Short');
  });

  it('Cash Controls Cockpit tab: Drawer Opens/Day driver row opens drawer_open', async () => {
    const { CashControlsCockpitTab } = await import('../views/store-cockpit.js');
    const row = {
      loc: '10422', date: lastClosedBusinessDay(),
      netSalesAmt: 100000, cashOSAmt: -100, tRedAAmt: 300, tRedBAmt: 3000, discAmt: 1000,
      posOverAmt: 400, promoPct: 0.025, drawerOpens: 60, cashRefCnt: 4,
    };
    mountEl(h(CashControlsCockpitTab, { store: CASH_STORE, ds: { opsCashRows: [row] } }));
    expect(container.textContent).toContain('Drawer Opens/Day');

    clickInfoIcon('Drawer Opens/Day');
    expect(container.textContent).toContain('Drawer Open');
  });

  it('Data Manager Overview tab coverage table (data_collection_bounds)', async () => {
    const { DataManagerPanel } = await import('../views/analytics.js');
    mountEl(h(DataManagerPanel, { ds: { loaded: true }, idbCoverage: {}, onClose: () => {}, onLoad: () => {} }));
    expect(container.textContent).toContain('DATA COVERAGE');

    clickInfoIcon('DATA COVERAGE');
    expect(container.textContent).toContain('Data Collection Bounds');
  });
});
