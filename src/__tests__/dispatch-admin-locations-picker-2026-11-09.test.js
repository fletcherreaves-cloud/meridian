// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-11-09 ("indulge me in the user settings... assign locations to the
// user... give them access to a whole patch"): replaces the raw comma-separated
// accessible_locs text box in UsersTab (src/views/admin.js) with LocationsEditorModal -- a
// proper grouped-by-state checkbox grid plus a "quick add a whole patch" shortcut sourced from
// the live supervisorGroups(), never hardcoded. Tested directly (not through UsersTab/
// AdminPanel) since UsersTab short-circuits to an empty "Connect Supabase" state when the
// `supabase` client is null in the test environment -- mounting the modal with fake
// user/onSave/onClose props is simpler and more focused, same reasoning admin-panel-access-log
// applies to AdminPanel itself.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { LocationsEditorModal } from '../views/admin.js';
import { STORE_NAMES } from '../constants.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(LocationsEditorModal, props)); });
  await act(async () => { await Promise.resolve(); });
  return { container, root };
}

describe('LocationsEditorModal (admin accessible_locs picker, dispatch 2026-11-09)', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); });

  it('renders a grouped-by-state checkbox grid covering every store in STORE_NAMES', async () => {
    ({ container, root } = await mount({ user: { id: 'u1', email: 'gm@test.com', accessible_locs: null }, saving: false, onClose: () => {}, onSave: () => {} }));
    // Both real states from INV_ORG_COORDS appear as group headers.
    expect(container.textContent).toContain('OK');
    expect(container.textContent).toContain('FL');
    // Every store name renders somewhere in the grid.
    for (const loc of Object.keys(STORE_NAMES)) {
      expect(container.textContent).toContain(STORE_NAMES[loc]);
    }
  });

  it('pre-checks the stores already in the user\'s accessible_locs', async () => {
    ({ container, root } = await mount({ user: { id: 'u1', email: 'gm@test.com', accessible_locs: ['5183'] }, saving: false, onClose: () => {}, onSave: () => {} }));
    const checkboxes = [...container.querySelectorAll('input[type=checkbox]')];
    const checked = checkboxes.filter(c => c.checked);
    expect(checked).toHaveLength(1);
  });

  it('"add a whole patch" unions a supervisor\'s stores into the selection additively, not replacing it', async () => {
    ({ container, root } = await mount({ user: { id: 'u1', email: 'gm@test.com', accessible_locs: ['3708'] }, saving: false, onClose: () => {}, onSave: () => {} }));
    const patchSelect = container.querySelector('select');
    expect(patchSelect).toBeTruthy();
    // Krystiana Langford's patch: ['5183','18213','29760','33222','44689'] -- 5 stores.
    await act(async () => {
      patchSelect.value = 'Krystiana Langford';
      patchSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const addBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Add stores');
    expect(addBtn).toBeTruthy();
    await act(async () => { addBtn.click(); });
    const checkboxes = [...container.querySelectorAll('input[type=checkbox]')];
    const checked = checkboxes.filter(c => c.checked);
    // The pre-existing 3708 plus the 5 patch stores = 6, not a replacement of the original pick.
    expect(checked).toHaveLength(6);
  });

  it('Save calls onSave with the exact selected loc array', async () => {
    const onSave = vi.fn();
    ({ container, root } = await mount({ user: { id: 'u1', email: 'gm@test.com', accessible_locs: ['5183', '18213'] }, saving: false, onClose: () => {}, onSave }));
    const saveBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Save');
    await act(async () => { saveBtn.click(); });
    expect(onSave).toHaveBeenCalledTimes(1);
    const arg = onSave.mock.calls[0][0];
    expect(new Set(arg)).toEqual(new Set(['5183', '18213']));
  });

  it('Cancel calls onClose without calling onSave', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    ({ container, root } = await mount({ user: { id: 'u1', email: 'gm@test.com', accessible_locs: [] }, saving: false, onClose, onSave }));
    const cancelBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Cancel');
    await act(async () => { cancelBtn.click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onSave).not.toHaveBeenCalled();
  });
});
