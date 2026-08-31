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
// Fix: App.js's wrapper now carries `className:'mf-main-content'`, and PRINT_STYLE exempts it at
// the .mf-app-root level and repeats the same "hide every other direct child" rule one level down
// (see eom-supervisor.js's PRINT_STYLE comment). happy-dom does not evaluate `@media print` rules
// (there is no print-media emulation to toggle), so this test can't assert on computed `display`
// under body.eom-printing — instead it asserts the STRUCTURAL invariant PRINT_STYLE's two-level
// rule actually depends on (the print modal sits exactly two direct-child hops below
// `.mf-app-root`, via `.mf-main-content`) and pins the exact selector text so either half of the
// fix silently regressing gets caught.
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
    await clickTab(appRoot, 'Missing Items');
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });

    expect(document.getElementById('eom-print-style'), 'PRINT_STYLE was not injected for the Missing Items tab').toBeTruthy();

    const printModalEl = appRoot.querySelector('.mf-eom-print-modal');
    expect(printModalEl, 'no element carries .mf-eom-print-modal for the Missing Items tab').toBeTruthy();

    const printArea = printModalEl.querySelector('.eom-print-area');
    expect(printArea, '.eom-print-area not found inside the print modal').toBeTruthy();
    expect(printArea.textContent).toMatch(/Diced Onions|MISSING|UNCOUNTED/i);

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
