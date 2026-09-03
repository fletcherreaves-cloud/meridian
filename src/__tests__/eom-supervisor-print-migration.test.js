// @vitest-environment happy-dom
// @ts-nocheck
// Owner request (2026-09-01): "need to fix the print for this panel the same way we finally
// resolved the new reports yesterday (Missing Items, Recount Impact, ertc.)" — Supervisor Rollup
// was the one EOM report tab dispatch #227's 9ba5140 (2026-08-31) deliberately left on the old,
// unreliable in-place `body.eom-printing` + `window.print()` mechanism (its own `forPrint` did
// more than gate a banner — it also expanded every row and swapped editable cells for plain text
// — and had never been confirmed broken at the time). It was broken the same way as the other
// four, so this migrates it onto the SAME isolated `window.open()` + static-HTML mechanism
// (openPrintWindow + the new formatSupervisorHtml), mirroring
// dispatch-227-eom-reports.test.js's own "Print calls openPrintWindow, not the old mechanism"
// test for Recount Impact. This exercises the REAL Print button's onClick, not an isolated call
// to formatSupervisorHtml() — a revert to the old mechanism, or a wiring typo, fails this.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../lib/supabase.js', () => ({
  loadEbosMonthlyByStore: async () => ({}),
}));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { EOMSupervisorPanel } = await import('../views/eom-supervisor.js');

const LOC = '5985';

function fakeSupabaseChain() {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: async () => ({ data: null, error: null }),
    upsert: async () => ({ data: null, error: null }),
  };
  return chain;
}
const fakeSupabase = { from: () => fakeSupabaseChain() };

const ds = {
  allMonthlyTargets: {
    '2026-8': {
      [LOC]: { tProdSales: 668158.15, tFOBTotal: 27.50, tFOBTarget: 3.85, tCrewLabor: 20.00, tOpSupply: 5679.34 },
    },
  },
  fobRows: [{ loc: LOC, date: new Date(2026, 7, 15), sales: 616861.43, pLFoodPct: 27.5218889, fobPct: 3.9312345, laborPct: 20.2599 }],
};

function mountRoot() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  return { container, root: createRoot(container) };
}

describe('EOM Supervisor Rollup — Print migrated to openPrintWindow (owner report 2026-09-01)', () => {
  let container, root;
  beforeEach(() => { ({ container, root } = mountRoot()); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); document.body.className = ''; });

  it('Print calls openPrintWindow (window.open) with the real report content, not the old body.eom-printing mechanism', async () => {
    await act(async () => {
      root.render(React.createElement(EOMSupervisorPanel, {
        ds, settings: {}, supabase: fakeSupabase, period: '2026-08', scopedLocs: [LOC],
      }));
      await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    });

    // Print no longer opens a real window (window.open('', ...) trapped iOS users in a dead tab
    // with no way back -- see src/utils/print-html.js). It renders into a same-page overlay
    // iframe instead, so the report HTML is read back from that iframe's own document.
    try {
      const printBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Print'));
      expect(printBtn, 'Print button not found').toBeTruthy();
      await act(async () => { printBtn.click(); });

      const iframes = [...document.querySelectorAll('iframe')];
      const iframe = iframes[iframes.length - 1];
      expect(iframe, 'printHtml overlay iframe not found').toBeTruthy();
      const writtenHtml = '<!doctype html>' + iframe.contentDocument.documentElement.outerHTML;

      expect(writtenHtml).toMatch(/EOM Supervisor Summary/);
      // Rollup card content — always present regardless of which store cards were expanded on screen.
      expect(writtenHtml).toMatch(/SUPERVISOR PATCH TOTAL/);
      // A per-store block, fully rendered in the print export even though it was never clicked open
      // on screen (forPrint used to gate this; print no longer touches this live DOM at all).
      expect(writtenHtml).toMatch(/Rest\. #5985/);
      // The $ Amount fix (see eom-supervisor-dollar-amount-reconciles.test.js) carries through to
      // print — same computed values, not a second, independently-drifting formatter.
      expect(writtenHtml).toMatch(/\$123\.37/);

      // The old in-place mechanism must be fully gone: no body.eom-printing toggle, no
      // "generating" banner, no leftover injected <style id="eom-print-style">.
      expect(document.body.className).not.toMatch(/eom-printing/);
      expect(container.textContent).not.toMatch(/Generating the print preview/);
      expect(document.getElementById('eom-print-style')).toBeFalsy();
    } finally {
      document.querySelectorAll('iframe').forEach(f => f.parentElement && f.parentElement.remove());
    }
  });
});
