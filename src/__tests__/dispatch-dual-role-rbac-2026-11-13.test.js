// @vitest-environment happy-dom
// @ts-nocheck
// Dual-role RBAC fix (2026-11-13). Owner report: "When viewing as Ops Manager, (Ashley) it only
// shows her supervisor patch locations... Brad Denley as DO and Supervisor" has the same gap.
//
// Root cause: viewAsAllowedLocs() (src/engine/curated-home.js) used to resolve 'patch' altitude
// ONLY against the flat supervisorGroups() map keyed by person name -- one entry per person, no
// room for someone holding two roles at once. Fix: resolve through assignment-graph.js's
// resolveScope() first (which already unions every staff_assignments row a person holds),
// falling back to the flat map ONLY when that person has zero rows -- so this is additive, never
// changing behavior for the ~everyone who has no staff_assignments rows yet.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { viewAsAllowedLocs } from '../engine/curated-home.js';
import { AssignmentCycleError } from '../engine/assignment-graph.js';

describe('viewAsAllowedLocs() -- dual-role scope resolution (2026-11-13)', () => {
  it('a person with ZERO assignmentRows resolves EXACTLY as before (flat-map fallback, unchanged)', () => {
    const withoutRows = viewAsAllowedLocs('patch', 'Ashley Podroza');
    const withEmptyRows = viewAsAllowedLocs('patch', 'Ashley Podroza', []);
    // Ashley Podroza's real supervisorGroups() patch: ['5985','10422','33109'].
    expect([...withoutRows].sort()).toEqual(['10422', '33109', '5985']);
    expect([...withEmptyRows].sort()).toEqual(['10422', '33109', '5985']);
  });

  it('a person with assignment rows resolves through the graph, not the flat map', () => {
    const rows = [
      { person: 'Ashley Podroza', role: 'area_supervisor', target_type: 'store', target: '5985', start: '2026-01-01' },
      { person: 'Ashley Podroza', role: 'area_supervisor', target_type: 'store', target: '10422', start: '2026-01-01' },
    ];
    const allowed = viewAsAllowedLocs('patch', 'Ashley Podroza', rows);
    // Only the 2 stores named in the graph -- NOT her 3-store flat-map patch (33109 excluded) --
    // proving the graph is consulted first, not blended with the flat map.
    expect([...allowed].sort()).toEqual(['10422', '5985']);
  });

  it('THE REAL BUG: a dual-role person (AS patch row + OM oversight row) resolves to the UNION, not just the AS patch', () => {
    // Ashley holds her own AS row (3 stores) AND an OM row overseeing another AS ("Steven
    // Vaughn") whose own patch is 3 different stores -- the exact shape of the owner's report.
    const rows = [
      { person: 'Ashley Podroza', role: 'area_supervisor', target_type: 'store', target: '5985', start: '2026-01-01' },
      { person: 'Ashley Podroza', role: 'area_supervisor', target_type: 'store', target: '10422', start: '2026-01-01' },
      { person: 'Ashley Podroza', role: 'area_supervisor', target_type: 'store', target: '33109', start: '2026-01-01' },
      { person: 'Ashley Podroza', role: 'om', target_type: 'person', target: 'Steven Vaughn', start: '2026-01-01' },
      { person: 'Steven Vaughn', role: 'area_supervisor', target_type: 'store', target: '10915', start: '2026-01-01' },
      { person: 'Steven Vaughn', role: 'area_supervisor', target_type: 'store', target: '33704', start: '2026-01-01' },
    ];
    const allowed = viewAsAllowedLocs('patch', 'Ashley Podroza', rows);
    // All 5 stores: her own 3 PLUS Steven Vaughn's 2 she oversees as OM -- the bug report's
    // "only shows her supervisor patch" would have stopped at 3.
    expect([...allowed].sort()).toEqual(['10422', '10915', '33109', '33704', '5985']);
    expect(allowed.size).toBe(5);
  });

  it('Brad Denley (DO + Supervisor over a subset of his own district) resolves to the union', () => {
    const rows = [
      { person: 'Brad Denley', role: 'area_supervisor', target_type: 'store', target: '6178', start: '2026-01-01' },
      { person: 'Brad Denley', role: 'do', target_type: 'store', target: '6178', start: '2026-01-01' },
      { person: 'Brad Denley', role: 'do', target_type: 'store', target: '6838', start: '2026-01-01' },
      { person: 'Brad Denley', role: 'do', target_type: 'store', target: '10034', start: '2026-01-01' },
    ];
    const allowed = viewAsAllowedLocs('patch', 'Brad Denley', rows);
    expect([...allowed].sort()).toEqual(['10034', '6178', '6838']);
  });

  it('a malformed cyclic graph fails safe to the flat-map fallback, never throws or crashes the caller', () => {
    const cyclicRows = [
      { person: 'A', role: 'om', target_type: 'person', target: 'B', start: '2026-01-01' },
      { person: 'B', role: 'om', target_type: 'person', target: 'A', start: '2026-01-01' },
    ];
    expect(() => viewAsAllowedLocs('patch', 'A', cyclicRows)).not.toThrow();
    // Neither 'A' nor 'B' is a real supervisorGroups() key, so the safe fallback is an empty set
    // -- the point of this test is "does not throw", not what the empty result contains.
    const allowed = viewAsAllowedLocs('patch', 'A', cyclicRows);
    expect(allowed.size).toBe(0);
  });

  it('non-patch altitudes are unaffected by the new param (store/district branches untouched)', () => {
    const rows = [{ person: 'X', role: 'gm', target_type: 'store', target: '9999', start: '2026-01-01' }];
    expect([...viewAsAllowedLocs('store', '3708', rows)]).toEqual(['3708']);
    expect(viewAsAllowedLocs('district', 'Some VP', rows)).toBeNull();
    expect(viewAsAllowedLocs(null, null, rows)).toBeNull();
  });
});

// ── Roles & Assignments editor (admin.js) ───────────────────────────────────────────────────
import { AssignmentsTab } from '../views/admin.js';

const loadMock = vi.fn();
const saveMock = vi.fn().mockResolvedValue({ error: null });
const deleteMock = vi.fn().mockResolvedValue({ error: null });
const setPrimaryMock = vi.fn().mockResolvedValue({ error: null });

vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    loadStaffAssignments: (...args) => loadMock(...args),
    saveStaffAssignment: (...args) => saveMock(...args),
    deleteStaffAssignment: (...args) => deleteMock(...args),
    setPrimaryStaffAssignment: (...args) => setPrimaryMock(...args),
  };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(AssignmentsTab, props)); });
  await act(async () => { await Promise.resolve(); });
  return { container, root };
}

describe('AssignmentsTab (Roles & Assignments editor, 2026-11-13)', () => {
  let container, root;
  afterEach(() => {
    act(() => { root?.unmount(); });
    container?.remove();
    loadMock.mockClear(); saveMock.mockClear(); deleteMock.mockClear(); setPrimaryMock.mockClear();
  });

  it('auto-populates the known people from the org seed maps even with zero staff_assignments rows', async () => {
    loadMock.mockResolvedValue([]);
    ({ container, root } = await mount());
    // Real names from constants.js's supervisorGroups()/doGroups.
    expect(container.textContent).toContain('Ashley Podroza');
    expect(container.textContent).toContain('Brad Denley');
    expect(container.textContent).toContain('No assignments yet');
  });

  it('shows a person\'s existing rows and marks the primary one', async () => {
    loadMock.mockResolvedValue([
      { person: 'Ashley Podroza', role: 'area_supervisor', target_type: 'store', target: '5985', start: '2026-01-01', end: null, isPrimary: true },
      { person: 'Ashley Podroza', role: 'om', target_type: 'person', target: 'Steven Vaughn', start: '2026-02-01', end: null, isPrimary: false },
    ]);
    ({ container, root } = await mount());
    expect(container.textContent).toContain('area_supervisor');
    expect(container.textContent).toContain('om');
    expect(container.textContent).toContain('oversees Steven Vaughn');
    expect(container.textContent).toContain('★');
    // Resolved-scope preview should reflect the union (Ashley's own store + nothing from Steven
    // Vaughn, since this fixture gives Steven Vaughn no rows of his own) -- just her 1 store here.
    expect(container.textContent).toContain('Resolved scope: 1 store');
  });

  it('clicking "Make primary" calls setPrimaryStaffAssignment with that exact row', async () => {
    loadMock.mockResolvedValue([
      { person: 'Ashley Podroza', role: 'area_supervisor', target_type: 'store', target: '5985', start: '2026-01-01', end: null, isPrimary: false },
    ]);
    ({ container, root } = await mount());
    const makePrimaryBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Make primary');
    expect(makePrimaryBtn).toBeTruthy();
    await act(async () => { makePrimaryBtn.click(); });
    expect(setPrimaryMock).toHaveBeenCalledWith(expect.objectContaining({
      person: 'Ashley Podroza', role: 'area_supervisor', target: '5985',
    }));
  });

  it('clicking "Remove" on a row calls deleteStaffAssignment after confirmation', async () => {
    // happy-dom doesn't implement window.confirm -- stub it directly (vi.spyOn requires an
    // existing function on the target), same pattern dispatch-166-management-do-om-sections uses.
    const origConfirm = window.confirm;
    window.confirm = vi.fn(() => true);
    loadMock.mockResolvedValue([
      { person: 'Ashley Podroza', role: 'area_supervisor', target_type: 'store', target: '5985', start: '2026-01-01', end: null, isPrimary: false },
    ]);
    ({ container, root } = await mount());
    const removeBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Remove');
    await act(async () => { removeBtn.click(); });
    expect(deleteMock).toHaveBeenCalledWith(expect.objectContaining({ person: 'Ashley Podroza', target: '5985' }));
    window.confirm = origConfirm;
  });

  // Owner report (2026-11-15): typed "supervisor zukaar" into the old free-text "oversees person"
  // box, following its own placeholder literally -- resolveScope() does an EXACT string match
  // against real identities, so that typo silently resolved to nobody and the "Resolved scope"
  // preview stayed "—" with no error anywhere to say why. Fixed by replacing the free-text input
  // with a dropdown of knownPeople (the same real names the panel already auto-populates), so a
  // typo like that is no longer possible -- mirroring exactly how "oversees store" already can't
  // be mistyped either.
  it('adding a new role row for an existing person selects the target from a dropdown of known people, not free text', async () => {
    loadMock.mockResolvedValue([]);
    ({ container, root } = await mount());
    const addRoleButtons = [...container.querySelectorAll('button')].filter(b => b.textContent === '+ Add role');
    // Whichever known person's card renders first -- never assumed to be a specific name, since
    // the real seed map's alphabetical order isn't this test's concern.
    await act(async () => { addRoleButtons[0].click(); });
    // No free-text target input exists anymore for the 'person' target type.
    expect([...container.querySelectorAll('input')].some(i => i.placeholder?.includes('oversee'))).toBe(false);
    // Matched on the exact placeholder text, not a loose "oversee" substring -- the targetType
    // select's own options ("oversees person"/"oversees store") also contain that substring.
    const targetSelect = [...container.querySelectorAll('select')]
      .find(s => [...s.options].some(o => o.text === 'Select who they oversee…'));
    expect(targetSelect).toBeTruthy();
    // Pick whichever real option the dropdown actually offers (excluding the placeholder) --
    // proves the target comes from a closed list of known people, not typed free text, without
    // hardcoding which specific name happens to render first in the live seed map.
    const realOption = [...targetSelect.options].find(o => o.value !== '');
    expect(realOption).toBeTruthy();
    await act(async () => {
      targetSelect.value = realOption.value;
      targetSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const addBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Add');
    await act(async () => { addBtn.click(); });
    expect(saveMock).toHaveBeenCalledWith(expect.objectContaining({ target: realOption.value, target_type: 'person' }));
  });

  it('the "oversees person" dropdown excludes the person whose own row is being added (no self-reference)', async () => {
    loadMock.mockResolvedValue([]);
    ({ container, root } = await mount());
    // Find the name label rendered as EXACTLY 'Ashley Podroza' (not a startsWith/contains match,
    // which would false-match an ancestor wrapper whose full textContent happens to begin the
    // same way) and click the "+ Add role" button in that same header row.
    const nameDiv = [...container.querySelectorAll('div')].find(d => d.textContent === 'Ashley Podroza');
    expect(nameDiv).toBeTruthy();
    const ashleyAddBtn = nameDiv.parentElement.querySelector('button');
    expect(ashleyAddBtn?.textContent).toBe('+ Add role');
    await act(async () => { ashleyAddBtn.click(); });
    const targetSelect = [...container.querySelectorAll('select')]
      .find(s => [...s.options].some(o => o.text === 'Select who they oversee…'));
    expect([...targetSelect.options].some(o => o.value === 'Ashley Podroza')).toBe(false);
  });
});
