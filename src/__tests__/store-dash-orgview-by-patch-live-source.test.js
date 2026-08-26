// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #144 flagged this as the one call site its own conversion left behind (PR #765 body:
// "store-dash.js's separate OrgView ('By Patch' tab under Store Management -> Patch/Org view)
// still reads settings.supervisorGroups -- the same stale save-time snapshot #139 fixed
// everywhere else"). Fixed directly (2026-08-26): swapped for the live supervisorGroups()
// (constants.js), the same source every already-#139-fixed panel reads.
//
// Reproduces the bug the same way dispatch-139's own tests do: reassign a real store to a
// brand-new supervisor via setLiveAssignments (the same mechanism SupervisorAssignmentsEditor's
// save() uses), then assert OrgView's "By Patch" tab shows the NEW supervisor -- not whatever
// settings.supervisorGroups (a save-time snapshot, never updated here) still says.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { orgAssignments, setLiveAssignments } from '../constants.js';
import { OrgView } from '../views/store-dash.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// A real FL store, statically seeded as 'Brad Denley' (INV_ORG_COORDS['6178'].sup).
const REASSIGNED_LOC = '6178';
const NEW_SUP = 'Mary Whitfield';

function reassign(loc, supervisor) {
  const base = orgAssignments().filter(a => String(a.loc) !== String(loc));
  setLiveAssignments([...base, { loc, supervisor, start: '' }]);
}

afterEach(() => { setLiveAssignments([]); });

function mkStore(loc, name) {
  return {
    loc, name,
    p: { laborPct: 0.28, oepe: 175, tpph: 92, _cov: {} },
    t: { tOepe: 180, tTpph: 90, tCrewLabor: 0.30 },
    opsScore: 78, ctrlScore: 82, vel: null,
    pSales: 52000, pLY: 49500,
    findings: [], gm: null, hasRecords: false,
  };
}

describe('OrgView "By Patch" tab reads the LIVE supervisor timeline, not settings.supervisorGroups', () => {
  it('AFTER a reassignment via setLiveAssignments, the store groups under its NEW supervisor', async () => {
    reassign(REASSIGNED_LOC, NEW_SUP);
    const stores = [mkStore(REASSIGNED_LOC, 'DeFuniak Springs')];
    // settings.supervisorGroups deliberately stale/empty -- if OrgView still read this (the bug),
    // the store would show under no group (or the old static seed) instead of Mary Whitfield.
    const settings = { operators: {}, supervisorGroups: {} };
    const ds = { pmixRows: [] };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(OrgView, { stores, ds, settings, onSelectStore: () => {} }));
    });
    const patchBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'By Patch');
    expect(patchBtn).toBeTruthy();
    await act(async () => { patchBtn.click(); });

    expect(container.textContent).toContain(NEW_SUP);
    expect(container.textContent).toContain('DeFuniak Springs');

    act(() => { root.unmount(); });
    container.remove();
  });
});
