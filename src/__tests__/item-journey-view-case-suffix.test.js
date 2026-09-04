// @vitest-environment happy-dom
// @ts-nocheck
// ItemJourneyView (eom-dashboard.js) timeline rows + "net count variance" header line had no
// case-pack-converted quantity, unlike the variance-reconciliation box directly above them in the
// same view (which already shows `(≈ X.XX cs)` off the same `j.caseSz`) -- backlog-master §6 /
// Notes 63 §EOM Change Monitor step 3: "never replacing the raw number". Exported for this test
// (was previously only referenced internally by EOMDashboardPanel's Change Monitor tab).
import { describe, it, expect, afterEach } from 'vitest';
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

describe('ItemJourneyView — case-pack suffix', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); });

  it('the "net count variance" header line appends the case-converted qty when a case size is known', () => {
    ({ container, root } = renderInto(h(ItemJourneyView, { journey: journey({ netCountUnits: -150, caseSz: 75 }) })));
    expect(container.textContent).toMatch(/net count variance -150 \(≈ -2\.00 cs\) lb/);
  });

  it('omits the suffix when the qty is below one case (nothing to convert meaningfully)', () => {
    ({ container, root } = renderInto(h(ItemJourneyView, { journey: journey({ netCountUnits: -10, caseSz: 75 }) })));
    expect(container.textContent).toMatch(/net count variance -10 lb/);
    expect(container.textContent).not.toMatch(/cs\)/);
  });

  it('omits the suffix entirely when no case size is known, never replacing the raw qty', () => {
    ({ container, root } = renderInto(h(ItemJourneyView, { journey: journey({ netCountUnits: -150, caseSz: null }) })));
    expect(container.textContent).toMatch(/net count variance -150 lb/);
    expect(container.textContent).not.toMatch(/cs\)/);
  });

  it('a timeline row (e.g. a Received delivery) also gets the case-converted qty alongside the raw number', () => {
    ({ container, root } = renderInto(h(ItemJourneyView, { journey: journey({
      caseSz: 75,
      events: [{ lane: 'received', when: '2026-08-05', isCount: false, qty: 150, dt: '2026-08-05', invoice: 'INV-1' }],
    }) })));
    expect(container.textContent).toMatch(/\+150 \(≈ 2\.00 cs\)/);
  });
});
