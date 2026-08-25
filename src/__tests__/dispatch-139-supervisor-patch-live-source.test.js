// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #139 — "Mary missing in Crew Schedule". Root cause: two sources of truth for
// "which supervisor owns which store" — the live, effective-dated timeline (constants.js's
// orgAssignments/whoRan/supervisorGroups, Settings-editable, already correct) and the static
// INV_ORG_COORDS[loc].sup seed (frozen, never moves). Several patch-scoped filters/groupings read
// ONLY the static field, or read the live field first but silently fall back to the static one.
//
// Fix: constants.js's new supervisorOf(loc, fallback) — live-first via whoRan(), falling back
// only for a loc the live timeline doesn't cover — is now the single resolution path every
// consumer named in the dispatch goes through (directly, or via buildLocationHierarchy /
// supervisorGroups() for the ones that build a full map rather than a single lookup).
//
// These tests reproduce the owner's report directly: reassign a real store to a brand-new
// supervisor name ("Mary Whitfield", absent from DEF_SETTINGS.supervisorGroups/INV_ORG_COORDS
// entirely, matching "new supervisor Mary... missing in Crew Schedule") via the SAME live
// mechanism SupervisorAssignmentsEditor uses (setLiveAssignments), then assert every fixed call
// site resolves her — and that a store untouched by the reassignment still resolves sensibly.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
// security-panel.js pulls in store-analytics.js -> morning-brief.js, which sets window.onerror
// at module load time (needs a DOM global — @vitest-environment happy-dom above), and reads live
// Supabase loaders — mocked here the same way security-panel.test.js already does (no live
// Supabase session in this sandbox).
vi.mock('../lib/supabase.js', () => ({
  supabase: { rpc: vi.fn() },
  loadSecurityFindings: vi.fn(),
  loadSecurityRules: vi.fn(),
  loadGmIdentityRevealEnabled: vi.fn(),
  loadQsrVarianceStat: vi.fn(),
  loadQsrVarianceHistoryAll: vi.fn(),
  loadAuditRowsWindow: vi.fn(),
  loadQsrSecurityEventsForSubject: vi.fn().mockResolvedValue([]),
}));
import {
  INV_ORG_COORDS, DEF_SETTINGS, supervisorOf, setLiveAssignments, orgAssignments,
} from '../constants.js';
import { buildLocationHierarchy, LocationSelector } from '../components/PanelControls.js';
import { scopeMatches } from '../views/security-panel.js';
import { scopeIdsForLoc } from '../engine/target-overrides.js';

// A real FL store, statically seeded as 'Brad Denley' (INV_ORG_COORDS['6178'].sup).
const REASSIGNED_LOC = '6178';
const NEW_SUP = 'Mary Whitfield';
// A real FL store left untouched by the reassignment.
const UNTOUCHED_LOC = '6838';

// Reassign REASSIGNED_LOC to NEW_SUP as of today, keeping every other store's existing
// assignment intact — the same shape SupervisorAssignmentsEditor's save() produces (full
// timeline, not a delta), reached the same way App.js's settings-sync effect reaches it
// (setLiveAssignments), so this is a faithful repro of "Mary saved in Settings," not a shortcut.
function reassign(loc, supervisor) {
  const base = orgAssignments().filter(a => String(a.loc) !== String(loc));
  setLiveAssignments([...base, { loc, supervisor, start: '' }]);
}

afterEach(() => {
  // Reset to an empty timeline so the next test (and any other file's module instance sharing
  // this worker) sees the default DEF_SETTINGS.supervisorGroups seed again — orgAssignments()
  // only uses _liveAssignments when it has entries, so [] falls straight back through.
  setLiveAssignments([]);
});

describe('#139 supervisorOf() — live-first, static-fallback single-store lookup', () => {
  it('returns the live assignment once one exists, ignoring the static fallback entirely', () => {
    reassign(REASSIGNED_LOC, NEW_SUP);
    expect(supervisorOf(REASSIGNED_LOC, 'Brad Denley')).toBe(NEW_SUP);
  });

  it('falls back to the given static value for a store the live timeline does not (yet) cover', () => {
    // No reassignment made — untouched store still resolves via DEF_SETTINGS.supervisorGroups
    // (which whoRan() finds), so the explicit fallback arg is never even reached here; either
    // way the result is sensible (the seed value), not blank/unassigned.
    expect(supervisorOf(UNTOUCHED_LOC, 'Brad Denley')).toBe('Brad Denley');
  });

  it('falls back to INV_ORG_COORDS[loc].sup when no fallback arg is given and the live timeline misses', () => {
    expect(supervisorOf('999999')).toBeNull(); // not a real store: no live entry, no INV_ORG_COORDS entry
    expect(supervisorOf(UNTOUCHED_LOC)).toBe(INV_ORG_COORDS[UNTOUCHED_LOC].sup);
  });
});

describe('#139 buildLocationHierarchy() — Crew Schedule Lookup\'s Patch tier (the reported bug)', () => {
  it('BEFORE any reassignment, groups the store under the static seed supervisor', () => {
    const stores = [{ loc: REASSIGNED_LOC }, { loc: UNTOUCHED_LOC }];
    const tree = buildLocationHierarchy(stores, INV_ORG_COORDS, {});
    const brad = tree.patches.find(p => p.id === 'Brad Denley');
    expect(brad.locs.sort()).toEqual([REASSIGNED_LOC, UNTOUCHED_LOC].sort());
  });

  it('AFTER Mary is saved in Settings, the Patch tier shows Mary — not Brad — for her store', () => {
    reassign(REASSIGNED_LOC, NEW_SUP);
    const stores = [{ loc: REASSIGNED_LOC }, { loc: UNTOUCHED_LOC }];
    const tree = buildLocationHierarchy(stores, INV_ORG_COORDS, {});
    const mary = tree.patches.find(p => p.id === NEW_SUP);
    expect(mary).toBeTruthy();
    expect(mary.locs).toEqual([REASSIGNED_LOC]);
    // The untouched store stays under Brad (still resolves sensibly, not vanished).
    const brad = tree.patches.find(p => p.id === 'Brad Denley');
    expect(brad.locs).toEqual([UNTOUCHED_LOC]);
    // Mary's own store no longer shows under Brad.
    expect(brad.locs).not.toContain(REASSIGNED_LOC);
  });

  it('a fake test-fixture store with no INV_ORG_COORDS/live entry at all still falls back to the invOrgCoords param passed in (existing panel-controls.test.js contract, unaffected)', () => {
    const coords = { '42': { state: 'OK', sup: 'Fixture Sup' } };
    const tree = buildLocationHierarchy([{ loc: '42' }], coords, {});
    expect(tree.patches.map(p => p.id)).toEqual(['Fixture Sup']);
  });
});

describe('#139 LocationSelector progressive mode — activePatchId agrees with the (live) Patch tier', () => {
  it('a selected store under the newly-live patch shows its patch pill active (and highlighted), not stuck on the old static patch', async () => {
    reassign(REASSIGNED_LOC, NEW_SUP);
    const stores = [{ loc: REASSIGNED_LOC }, { loc: UNTOUCHED_LOC }];
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    try {
      await act(async () => {
        root.render(React.createElement(LocationSelector, {
          stores, invOrgCoords: INV_ORG_COORDS, storeNames: {},
          value: { level: 'store', id: REASSIGNED_LOC }, onChange: () => {}, mode: 'progressive',
        }));
      });
      const buttons = [...container.querySelectorAll('button')];
      const maryBtn = buttons.find(b => b.textContent === NEW_SUP);
      const bradBtn = buttons.find(b => b.textContent === 'Brad Denley');
      // Both pills render (UNTOUCHED_LOC is still Brad's, so his patch still has a member store
      // in this FL state) — the assertion is about which one is ACTIVE for the selected store.
      expect(maryBtn).toBeTruthy();
      expect(bradBtn).toBeTruthy();
      // Mary's pill is the ACTIVE one (amber-highlighted) for the selected store, and Brad's is
      // not — matching value:{level:'store',id:REASSIGNED_LOC} resolving to her patch via
      // tree.patches (the fix under test), not the pre-fix static invOrgCoords[loc].sup read
      // that would have kept Brad's pill highlighted here instead.
      expect(maryBtn.style.color).toBe('var(--amber)');
      expect(bradBtn.style.color).not.toBe('var(--amber)');
    } finally {
      act(() => { root.unmount(); });
      container.remove();
    }
  });
});

describe('#139 scopeMatches() — Security Panel patch scope (dispatch\'s confirmed static-only site)', () => {
  it('BEFORE reassignment, the store matches the static/seed patch scope', () => {
    expect(scopeMatches(REASSIGNED_LOC, { level: 'patch', value: 'Brad Denley' })).toBe(true);
  });

  it('AFTER Mary is saved in Settings, the store matches her patch scope and no longer matches Brad\'s', () => {
    reassign(REASSIGNED_LOC, NEW_SUP);
    expect(scopeMatches(REASSIGNED_LOC, { level: 'patch', value: NEW_SUP })).toBe(true);
    expect(scopeMatches(REASSIGNED_LOC, { level: 'patch', value: 'Brad Denley' })).toBe(false);
    // Untouched store is unaffected.
    expect(scopeMatches(UNTOUCHED_LOC, { level: 'patch', value: 'Brad Denley' })).toBe(true);
  });
});

describe('#139 scopeIdsForLoc() — Target Overrides stays consistent with the (now live) Patch picker', () => {
  it('AFTER Mary is saved in Settings, resolves her patch — matching buildLocationHierarchy for the same store', () => {
    reassign(REASSIGNED_LOC, NEW_SUP);
    expect(scopeIdsForLoc(REASSIGNED_LOC)).toEqual({ state: 'FL', patch: NEW_SUP });
    const stores = [{ loc: REASSIGNED_LOC }];
    const tree = buildLocationHierarchy(stores, INV_ORG_COORDS, {});
    expect(tree.patches.map(p => p.id)).toEqual([NEW_SUP]); // same resolution, same source
  });

  it('an unknown loc still resolves to null/null, unchanged from before this fix', () => {
    expect(scopeIdsForLoc('999999')).toEqual({ state: null, patch: null });
  });
});
