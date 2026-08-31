// @vitest-environment happy-dom
// @ts-nocheck
// 2026-08-31 (owner req, verbatim): "at some point we have to link cash controls to food cost and
// report that as well." Scoped after reviewing a CoachQ competitor sample that named specific
// cashiers by drawer number: "for the cash controls, they will yield things like we ruled out of
// the coachq report, we just need to generalize it and point managers to research further to
// identify the person responsible by using the register audit report and managing cash controls
// on the floor." So this is STORE-LEVEL only (never a register number or employee name) with a
// pointer to the existing "Register Audit" report (src/utils/register-audit.js, surfaced in
// store-analytics.js) for the person-level dig-in, which already names employees BY DESIGN
// (dispatch #200) and is deliberately not duplicated here.
//
// Per this repo's "would this verification still pass if reverted?" standing rule (CLAUDE.md),
// this has two layers:
// 1. An isolated formatDiagnosisReport() unit test (mirrors eom-diagnosis.test.js's own style) —
//    proves the rendering/generalization/pointer text is correct given a controls summary object.
// 2. A REAL render test through EOMDashboardPanel -> "✉️ Draft" -> Full report, with real
//    ctrlRows/opsCashRows fixtures in `ds` -- proves eom-dashboard.js's controlsSummaryFor() is
//    actually wired into diagOptsFor() and reaches the report, not just that the engine can format
//    a hand-built object nobody produces. A revert of the `controls: controlsSummaryFor(loc)` wire
//    (with the isolated test alone still passing) is exactly the "fixed but never wired in" trap
//    CLAUDE.md's own standing rule calls out.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { formatDiagnosisReport } from '../engine/eom-diagnosis.js';
import { periodKey } from '../engine/eom-inventory.js';

describe('formatDiagnosisReport — Cash Controls section (isolated)', () => {
  const RESULT = { store: '3708', storeName: 'Ardmore-Broadway', period: '2026-08', findings: [], variance: [] };
  const CONTROLS = {
    cashOSAmt: -37, posOverAmt: 22, refundAmt: 64, tRedACnt: 5, tRedBCnt: 1,
    discPct: 0.048, tRedAPct: 0.021, tRedBPct: 0.004,
  };

  it('mode:\'full\' shows the section, generalized store-level, with a Register Audit pointer', () => {
    const out = formatDiagnosisReport(RESULT, { mode: 'full', controls: CONTROLS });
    expect(out).toMatch(/💵 Cash Controls this period/);
    expect(out).toMatch(/Discount \*\*4\.80%\*\* of net sales/);
    expect(out).toMatch(/Cash Over\/Short \*\*-\$37\*\*/);
    expect(out).toMatch(/POS Overrides \*\*\$22\*\*/);
    expect(out).toMatch(/Refunds \*\*\$64\*\*/);
    expect(out).toMatch(/T-Reds \*\*5 before\*\* \(2\.10%\) → \*\*1 after\*\* \(0\.40%\)/);
    expect(out).toMatch(/Register Audit/);
    expect(out).toMatch(/floor-level cash-control management/);
    // Store-level, generalized -- never a register number or a person's name.
    expect(out).not.toMatch(/Register \d/);
    expect(out).not.toMatch(/[A-Z][a-z]+ [A-Z]\./); // a "First L." name pattern (CoachQ's own style)
  });

  it('mode:\'recap\' never includes Cash Controls, even when controls data is present', () => {
    const out = formatDiagnosisReport(RESULT, { mode: 'recap', controls: CONTROLS });
    expect(out).not.toMatch(/Cash Controls/);
  });

  it('mode:\'followup\' (Housekeeping) never includes Cash Controls -- it\'s a different section entirely', () => {
    const out = formatDiagnosisReport(RESULT, { mode: 'followup', controls: CONTROLS });
    expect(out).not.toMatch(/Cash Controls/);
  });

  it('no controls data -> no section, no crash', () => {
    const out = formatDiagnosisReport(RESULT, { mode: 'full', controls: null });
    expect(out).not.toMatch(/Cash Controls/);
  });

  it('near-zero individual lines are omitted (no $0.00 noise), but the section still shows for a real signal', () => {
    const out = formatDiagnosisReport(RESULT, { mode: 'full', controls: { cashOSAmt: 0, posOverAmt: 0, refundAmt: 0, tRedACnt: 0, tRedBCnt: 0, discPct: 0.02, tRedAPct: null, tRedBPct: null } });
    expect(out).toMatch(/💵 Cash Controls this period/);
    expect(out).toMatch(/Discount \*\*2\.00%\*\*/);
    expect(out).not.toMatch(/Cash Over\/Short/);
    expect(out).not.toMatch(/POS Overrides/);
    expect(out).not.toMatch(/Refunds/);
    expect(out).not.toMatch(/T-Reds/);
  });
});

const PERIOD = periodKey(new Date());

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }), upsert: async () => ({ data: null, error: null }) }) },
  loadQsrOnHand: async () => ([
    { loc: '3708', wrin: 'F1', descr: 'Food Item', cls: 'Food', onHandAmt: 10, active: true, lastCounted: null },
  ]),
  loadQsrFob: async () => [],
  loadEomPeriods: async () => [],
  loadEomCountStatus: async () => [],
  saveEomCountStatus: async () => ({}),
  loadQsrVarianceStat: async () => ([{ loc: '3708', wrin: 'V1', descr: 'Variance Item', cls: 'Food', dolDiff: -60, variance: 1 }]),
  loadQsrVarianceHistory: async () => [],
  loadQsrVarianceHistoryAll: async () => [],
  loadQsrWaste: async () => [],
  loadQsrTransfers: async () => [],
  loadQsrRawItemDetail: async () => [],
  loadQsrRawItemInfo: async () => [],
  loadEomDiagConfig: async () => null,
  saveEomDiagConfig: async () => ({}),
  triggerSync: async () => ({ ok: true }),
  loadEomDigestConfig: async () => ({ levels: ['district', 'patch'], sendHourUtc: 23 }),
  saveEomDigestConfig: async () => ({ saved: true }),
  saveEomItemDisposition: async () => ({}),
  loadEomItemDisposition: async () => [],
  loadSelfServeTowerLocs: async () => new Set(),
  saveEomSnapshots: async () => ({}),
  loadEomSnapshots: async () => [],
  saveEomSecondaryReview: async () => ({}),
  loadEomSecondaryReview: async () => [],
  saveEomCountException: async () => ({}),
  deleteEomCountException: async () => ({}),
  loadEomCountExceptions: async () => ({}),
  createEomShareLink: async () => ({}),
  loadEbosMonthlyByStore: async () => ({}),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { EOMDashboardPanel } = await import('../views/eom-dashboard.js');

const STORES = [{ loc: '3708' }, { loc: '3709' }];

// Real ctrlRows/opsCashRows in `ds` -- exactly what App.js loads at the top level and passes down
// as `ds` to every panel. discPct's ratio needs BOTH discAmt (ctrlRows) and netSalesAmt
// (opsCashRows-only) resolvable for the SAME day; tRedA/BPct need tRedA/BAmt (opsCashRows-only)
// the same way -- see metric-source.js's METRIC_SOURCES for why those two legs live on different
// streams. Day-of-month 01 so it's always inside controlsRange regardless of which day this suite
// runs on (controlsRange runs `${period}-01` -> today).
const DS = {
  ctrlRows: [{ loc: '3708', date: `${PERIOD}-01`, discAmt: 480, cashOSAmt: -37, posOverAmt: 22, cashRefAmt: 40, cashlessRefAmt: 24, tRedACnt: 5, tRedBCnt: 1 }],
  opsCashRows: [{ loc: '3708', date: `${PERIOD}-01`, netSalesAmt: 10000, tRedAAmt: 210, tRedBAmt: 40 }],
};

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

async function renderPanel(root) {
  await act(async () => {
    root.render(React.createElement(EOMDashboardPanel, {
      stores: STORES, ds: DS, settings: {}, onClose: () => {}, initialMode: 'eom',
    }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

describe('EOM Store message — Cash Controls (real ds.ctrlRows/opsCashRows wiring)', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('Full report shows real Cash Controls numbers sourced from ds via controlsSummaryFor/diagOptsFor', async () => {
    await renderPanel(root);
    const draftBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '✉️ Draft');
    expect(draftBtn, '✉️ Draft button not found').toBeTruthy();
    await act(async () => { draftBtn.click(); });
    const fullBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Full report');
    expect(fullBtn, 'Full report toggle not found').toBeTruthy();
    await act(async () => { fullBtn.click(); });

    expect(container.textContent).toMatch(/Cash Controls this period/);
    expect(container.textContent).toMatch(/Discount 4\.80% of net sales/);
    expect(container.textContent).toMatch(/Register Audit/);
  });

  it('Recap never shows Cash Controls, even though the same store has real controls data', async () => {
    await renderPanel(root);
    const draftBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '✉️ Draft');
    await act(async () => { draftBtn.click(); });
    // Recap is the default view on open -- no need to click anything.
    expect(container.textContent).not.toMatch(/Cash Controls this period/);
  });
});
