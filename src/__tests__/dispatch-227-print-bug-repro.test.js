// @vitest-environment happy-dom
// @ts-nocheck
// Root-caused (2026-08-31): owner reported printing from the Missing Items / Team Snapshot /
// Recount Impact tabs (dispatch #227) — and, by the same mechanism, the older Supervisor Rollup
// print — produced a BLANK page. Reading App.js's actual render tree (not the bare document.body
// dispatch-227-eom-reports.test.js mounts into) found the real shape: `.mf-app-root`'s direct
// children include an UNMARKED "Main content" scroll wrapper (App.js ~3252), and EVERY routePanel
// — including EOMDashboardPanel, whose RoutePanelShell gets `.mf-eom-print-modal` for print —
// renders INSIDE that wrapper, not directly under `.mf-app-root`. PRINT_STYLE's original rule
// (`.mf-app-root > *:not(.mf-eom-print-modal) { display:none }`) only inspected `.mf-app-root`'s
// DIRECT children, so it hid the wrapper itself (a direct child with no exempting class) — and
// display:none on that ancestor blanks the print modal nested inside it too, regardless of the
// modal's own class. That's a BLANK page, not a truncated one, matching the report exactly.
//
// Fix (first pass): App.js's wrapper now carries `className:'mf-main-content'`, and PRINT_STYLE
// exempts it at the .mf-app-root level and repeats the same "hide every other direct child" rule
// one level down (see eom-supervisor.js's PRINT_STYLE comment).
//
// 2026-08-31, same day — the owner kept seeing the SAME blank-print result on Missing Items /
// Recount Impact / Team Snapshot / Count Swings even after the above landed, on both single-store
// and all-locations scopes, with the actual freeze duration varying wildly run to run. Three
// further real-measurement investigations (a Chromium reproduction of App.js's exact DOM/CSS
// shape at realistic scale, a CSS-custom-property-cascade benchmark, console-timing attribution)
// never found a reproducible defect in the two-level PRINT_STYLE rule this test guards — so, per
// the owner's explicit go-ahead, those four reports were migrated OFF the in-place
// `body.eom-printing` + `window.print()` mechanism entirely, onto `openPrintWindow()`'s isolated
// `window.open()` + static-HTML mechanism (see eom-supervisor.js's `openPrintWindow` comment for
// the full history; dispatch-227-eom-reports.test.js covers that new mechanism for Recount
// Impact). **Supervisor Rollup is the only tab left on the mechanism this file exercises** — its
// own `forPrint` does more than gate the banner (it expands every row, swaps editable cells for
// plain text) and was never confirmed broken, so it was deliberately left alone. This test is
// rescoped to Supervisor Rollup accordingly; the structural invariant it asserts (print modal
// sits exactly two direct-child hops below `.mf-app-root`, via `.mf-main-content`) still applies
// to it via the same RoutePanelShell/`printableMode` wiring. happy-dom does not evaluate `@media
// print` rules (there is no print-media emulation to toggle), so this test can't assert on
// computed `display` under body.eom-printing — instead it asserts that structural invariant and
// pins the exact PRINT_STYLE selector text so either half of the fix silently regressing gets
// caught.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { periodKey } from '../engine/eom-inventory.js';
import { PRINT_STYLE } from '../views/eom-supervisor.js';

const PERIOD = periodKey(new Date());
const STORES = [{ loc: '3708' }];
const ONHAND = [{ loc: '3708', wrin: 'F100', descr: 'Diced Onions', cls: 'Food', onHandAmt: 340, lastCounted: null }];

vi.mock('../lib/supabase.js', () => ({
  supabase: null,
  loadQsrOnHand: async () => ONHAND,
  loadQsrFob: async () => [],
  loadEomCountStatus: async () => [],
  saveEomCountStatus: async () => ({}),
  loadEomPeriods: async () => [PERIOD],
  loadQsrVarianceStat: async () => [],
  loadQsrVarianceHistory: async () => [],
  loadQsrVarianceHistoryAll: async () => [],
  loadQsrWaste: async () => [],
  loadQsrTransfers: async () => [],
  loadQsrRawItemDetail: async () => [],
  loadQsrRawItemInfo: async () => [],
  loadEomDiagConfig: async () => null,
  saveEomDiagConfig: async () => ({}),
  triggerSync: async () => ({}),
  loadEomDigestConfig: async () => null,
  saveEomDigestConfig: async () => ({}),
  saveEomItemDisposition: async () => ({}),
  loadEomItemDisposition: async () => [],
  loadSelfServeTowerLocs: async () => [],
  saveEomSnapshots: async () => ({}),
  loadEomSnapshots: async () => [],
  saveEomSecondaryReview: async () => ({}),
  loadEomSecondaryReview: async () => [],
  saveEomCountException: async () => ({}),
  deleteEomCountException: async () => ({}),
  loadEomCountExceptions: async () => [],
  createEomShareLink: async () => ({}),
  loadEbosMonthlyByStore: async () => ({}),
}));

const { EOMDashboardPanel } = await import('../views/eom-dashboard.js');

// Mirrors App.js's real tree: .mf-app-root's children are AppSidebar-like chrome AND the
// .mf-main-content wrapper, rendered as ONE React tree (no artificial host div in between, which
// would itself misrepresent the real structure) — the panel is a child of .mf-main-content only.
function AppRootHarness({ children }) {
  return React.createElement(React.Fragment, null,
    React.createElement('div', { className: 'other-app-chrome' }, 'sidebar/nav content'),
    React.createElement('div', { className: 'mf-main-content' }, children));
}

async function clickTab(container, label) {
  const tab = [...container.querySelectorAll('button')].find(b => b.textContent === label);
  expect(tab, `"${label}" tab button not found`).toBeTruthy();
  await act(async () => { tab.click(); await Promise.resolve(); });
}

afterEach(() => {
  document.body.classList.remove('eom-printing');
  document.body.innerHTML = '';
  const s = document.getElementById('eom-print-style'); if (s) s.remove();
});

describe('dispatch #227 print bug repro + fix (App.js real .mf-app-root > .mf-main-content shape)', () => {
  it('the print modal sits exactly two direct-child hops below .mf-app-root, via .mf-main-content', async () => {
    const appRoot = document.createElement('div');
    appRoot.className = 'mf-app-root';
    document.body.appendChild(appRoot);
    const root = createRoot(appRoot);

    await act(async () => {
      root.render(React.createElement(AppRootHarness, null,
        React.createElement(EOMDashboardPanel, { stores: STORES, ds: {}, settings: {}, onClose: () => {} })));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });
    // Supervisor Rollup — the one tab still on this mechanism (see file header). The other four
    // dispatch #227 report tabs migrated to openPrintWindow() and no longer inject PRINT_STYLE.
    await clickTab(appRoot, 'Supervisor Rollup');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(document.getElementById('eom-print-style'), 'PRINT_STYLE was not injected for the Supervisor Rollup tab').toBeTruthy();

    const printModalEl = appRoot.querySelector('.mf-eom-print-modal');
    expect(printModalEl, 'no element carries .mf-eom-print-modal for the Supervisor Rollup tab').toBeTruthy();

    const printArea = printModalEl.querySelector('.eom-print-area');
    expect(printArea, '.eom-print-area not found inside the print modal').toBeTruthy();
    expect(printArea.textContent).toMatch(/EOM Supervisor Summary/i);

    // The invariant PRINT_STYLE's fix depends on: exactly two direct-child hops to .mf-app-root.
    const mainContentEl = printModalEl.parentElement;
    expect(mainContentEl.classList.contains('mf-main-content'),
      `print modal's direct parent must be .mf-main-content, got className="${mainContentEl.className}"`).toBe(true);
    expect(mainContentEl.parentElement, '.mf-main-content must be a direct child of .mf-app-root').toBe(appRoot);
  });

  it('PRINT_STYLE exempts .mf-main-content at the .mf-app-root level and repeats the hide-rule one level down', () => {
    expect(PRINT_STYLE).toMatch(/\.mf-app-root\s*>\s*\*:not\(\.mf-eom-print-modal\):not\(\.mf-main-content\)\s*\{\s*display:\s*none\s*!important;\s*\}/);
    expect(PRINT_STYLE).toMatch(/\.mf-main-content\s*>\s*\*:not\(\.mf-eom-print-modal\)\s*\{\s*display:\s*none\s*!important;\s*\}/);
  });
});
