// @vitest-environment happy-dom
// @ts-nocheck
// Backlog survey (2026-09-21): §6 "Remaining EOM list" -- "CoachQ curated prompts." The real
// CoachQ-API integration is a separate, much bigger, Cognito-auth-blocked item (see
// memory/project-qsrsoft-coachq.md) -- but the app already has an established, proven, much
// smaller pattern for exactly this ask: a curated SAGE prompt seeded via
// window.__MF_SAGE_SEED__ + a 'mf:open-sage' CustomEvent, used by askSageWaste (the store-level
// waste picture) and the FOB-variance-report modal. ItemJourneyView -- the per-item count-cycle
// drill-down (verdict + variance reconciliation + already-computed facts/inferences) -- had NO
// such button, even though it's a natural, smaller-scoped level for exactly this kind of coaching
// read: a single flagged item, not a whole store or report.
//
// Per "would this verification still pass if reverted?": this mounts the real exported
// ItemJourneyView with a real onAskSage callback and drives the actual button click -- fails
// against the pre-fix code, which had no such button or prop at all.
import { describe, it, expect, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ItemJourneyView } from '../views/eom-dashboard.js';

const h = React.createElement;

function journey(overrides = {}) {
  return {
    descr: 'Recount Test Item', wrin: 'RJ1', itemClass: 'Food', uom: 'lb',
    verdict: { tone: 'warn', text: 'Under investigation' },
    windowStart: null,
    reportDollars: null, reportUnits: null, netCountDollars: null, netCountUnits: null,
    caseSz: null,
    totals: { received: 0, used: 0, waste: 0, transfer: 0 },
    events: [],
    signals: [],
    ...overrides,
  };
}

function renderInto(el) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(el); });
  return { container, root };
}

describe('ItemJourneyView -- per-item "Ask SAGE" curated prompt (backlog survey 2026-09-21)', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); });

  it('no Ask SAGE button renders when onAskSage is omitted (existing callers unaffected)', () => {
    ({ container, root } = renderInto(h(ItemJourneyView, { journey: journey() })));
    expect(container.textContent).not.toMatch(/Ask SAGE/);
  });

  it('renders an Ask SAGE button when onAskSage is provided, and clicking it calls back with the journey object', () => {
    const onAskSage = vi.fn();
    const j = journey({ netCountDollars: -320.5, netCountUnits: -12, signals: [{ kind: 'fact', text: 'Recounted twice same day' }] });
    ({ container, root } = renderInto(h(ItemJourneyView, { journey: j, onAskSage })));

    const btn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Ask SAGE'));
    expect(btn, 'Ask SAGE button not found').toBeTruthy();
    act(() => { btn.click(); });

    expect(onAskSage).toHaveBeenCalledTimes(1);
    expect(onAskSage).toHaveBeenCalledWith(j);
  });

});

// ---------------------------------------------------------------------------
// Call-site contract: EOMDashboardPanel actually wires a real askSageItemJourney closure into
// ItemJourneyView's new onAskSage prop, not a no-op. askSageItemJourney lives inside
// EOMDashboardPanel (not exported -- same pattern as the pre-existing askSageWaste, which also
// has no dedicated test anywhere in this repo), and the modal chain to reach it (open Diagnose ->
// open Item Journeys -> pick an item -> click Ask SAGE) needs a populated rawByLoc built through
// buildStoreJourneys()/mapRawItemHistory() -- a much deeper fixture than this feature's own risk
// warrants. Reading the real source and asserting the wiring is present (same technique
// sage-paginate.test.js already uses to verify a call site it can't click-test either) catches the
// actual risk here: the prop wired to nothing, or wired to the wrong item/store.
describe('eom-dashboard.js: EOMDashboardPanel wires a real askSageItemJourney into ItemJourneyView', () => {
  // Plain cwd-relative path, not import.meta.url -- this file's happy-dom environment directive
  // (needed for the React-mounting describe block above) makes import.meta.url resolve to a
  // non-file:// URL, so `new URL(relative, import.meta.url)` (sage-paginate.test.js's own
  // technique) throws "must be of scheme file" here. Vitest's cwd is the repo root.
  const src = readFileSync('src/views/eom-dashboard.js', 'utf8');

  it('defines askSageItemJourney as a callback that seeds window.__MF_SAGE_SEED__ and dispatches mf:open-sage', () => {
    expect(src).toMatch(/const askSageItemJourney = useCallback\(/);
    expect(src).toMatch(/window\.__MF_SAGE_SEED__ = \{ context, prompt: `For this one item's count-cycle variance/);
    expect(src).toMatch(/const askSageItemJourney = useCallback\([\s\S]{0,1800}window\.dispatchEvent\(new CustomEvent\('mf:open-sage'\)\)/);
  });

  it('passes a real per-item, per-store closure -- not a no-op -- as ItemJourneyView\'s onAskSage prop', () => {
    expect(src).toMatch(/h\(ItemJourneyView, \{ key: sel && sel\.wrin, journey: sel, onAskSage: \(item\) => askSageItemJourney\(item, journeys\.name\) \}\)/);
  });
});
