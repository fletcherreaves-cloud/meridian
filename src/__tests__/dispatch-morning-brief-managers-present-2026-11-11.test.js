// @vitest-environment happy-dom
// @ts-nocheck
// Owner follow-up (2026-11-11) to the OEPE hour-level drill-down: "we can also list out all
// managers present every time because that will help users and leaders identify the real
// people... to address findings with. I am no longer concerned about masking names except for
// the rule about masking when it self incriminates a user to that role or someone below them.
// Revealing upstream is useful and warranted."
//
// Drives the real exported computeMorningBrief() and StoreBriefCard (not just the pure
// managersOnDuty()/canRevealAttributedName() helpers, covered separately in
// dispatch-shift-roster-managers-present-2026-11-11.test.js) -- per this repo's "would this
// still pass if reverted" bar, a test that only called the engine helpers directly could pass
// unchanged with the component's own wiring to them deleted.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { computeMorningBrief, StoreBriefCard } from '../features/morning-brief.js';

const LOC = '3708'; // real seed store (constants.js STORE_NAMES)

describe('computeMorningBrief() — managersByLoc threads through to each store (task #132-adjacent)', () => {
  it('a store with a managersByLoc entry carries it on the returned store data, unmasked (masking is a render-layer decision)', () => {
    const managersByLoc = { [LOC]: [{ name: 'Pat GM', jobTitle: 'General Manager', rung: 'gm', shiftStart: '2026-09-10T13:00:00Z', shiftEnd: '2026-09-10T21:00:00Z' }] };
    const brief = computeMorningBrief({}, new Date('2026-09-10T00:00:00'), {}, managersByLoc);
    const store = brief.stores.find(s => s.loc === LOC);
    expect(store.managersOnDuty).toEqual(managersByLoc[LOC]);
  });

  it('a store with no managersByLoc entry gets an empty array, not undefined/null', () => {
    const brief = computeMorningBrief({}, new Date('2026-09-10T00:00:00'), {}, {});
    const store = brief.stores.find(s => s.loc === LOC);
    expect(store.managersOnDuty).toEqual([]);
  });
});

async function renderCard(store, effectiveRole) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(StoreBriefCard, { store, expanded: store.loc, setExpanded: () => {}, effectiveRole }));
  });
  return { container, root };
}

let mounted = [];
afterEach(() => { mounted.forEach(({ root, container }) => { act(() => { root.unmount(); }); container.remove(); }); mounted = []; });

const baseStore = {
  loc: LOC, severity: 'GREEN', flags: [], name: 'Ardmore-Broadway', supervisor: 'Test Sup', hasData: true,
  managersOnDuty: [
    { name: 'Pat GM', jobTitle: 'General Manager', rung: 'gm', shiftStart: '2026-09-10T13:00:00Z', shiftEnd: '2026-09-10T21:00:00Z' },
    { name: 'Sam Crew', jobTitle: 'Crew Trainer', rung: null, shiftStart: '2026-09-10T14:00:00Z', shiftEnd: '2026-09-10T18:00:00Z' },
  ],
};

describe('StoreBriefCard — "Managers On Duty" shown every time, masked per the 2026-11-11 rule', () => {
  it('shows the GM\'s real name to an upstream viewer (DO)', async () => {
    const r = await renderCard(baseStore, 'do');
    mounted.push(r);
    expect(r.container.textContent).toContain('👔 Managers On Duty');
    expect(r.container.textContent).toContain('Pat GM · General Manager');
  });

  it('masks the GM\'s name from a peer GM, showing the job title only', async () => {
    const r = await renderCard(baseStore, 'gm');
    mounted.push(r);
    expect(r.container.textContent).not.toContain('Pat GM');
    expect(r.container.textContent).toContain('General Manager');
  });

  it('masks the GM\'s name from their own subordinate (sm_am_dm)', async () => {
    const r = await renderCard(baseStore, 'sm_am_dm');
    mounted.push(r);
    expect(r.container.textContent).not.toContain('Pat GM');
  });

  it('never masks a crew-tier entry (no ladder rung), regardless of viewer', async () => {
    const r = await renderCard(baseStore, 'sm_am_dm');
    mounted.push(r);
    expect(r.container.textContent).toContain('Sam Crew · Crew Trainer');
  });

  it('renders no "Managers On Duty" section at all when the store has none scheduled', async () => {
    const r = await renderCard({ ...baseStore, managersOnDuty: [] }, 'do');
    mounted.push(r);
    expect(r.container.textContent).not.toContain('Managers On Duty');
  });
});
