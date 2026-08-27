// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #166 -- Settings panel gets '🏛 DOs' / '⚙ OMs' sections mirroring '🏢 Operators'
// exactly (add/rename/remove row UI + "Sync from defaults" reset), backed by the new shared
// GroupsEditor helper (src/views/management.js). Renders the REAL Settings component (not the
// helper in isolation) and drives a parent state wrapper so edits are proven to round-trip
// through onUpdate back into props, per this repo's "verification must touch the call site" /
// "would this still pass if reverted" standing rules.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { DEF_SETTINGS } from '../constants.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { Settings } = await import('../views/management.js');
const h = React.createElement;
const { useState } = React;

function Harness({ initial }) {
  const [s, setS] = useState(initial);
  return h(Settings, { settings: s, onUpdate: setS, onClose: () => {}, userRole: 'admin' });
}

function clickByText(container, tag, text) {
  const el = [...container.querySelectorAll(tag)].find(e => e.textContent.trim() === text.trim());
  expect(el, `${tag} "${text}" not found`).toBeTruthy();
  return el;
}

async function clickText(container, tag, text) {
  const el = clickByText(container, tag, text);
  await act(async () => { el.click(); });
  return el;
}

describe("dispatch #166 -- Settings panel's DO/OM group sections", () => {
  let container, root, origConfirm;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    // happy-dom doesn't implement window.confirm -- stub it directly (vi.spyOn requires an
    // existing function on the target).
    origConfirm = window.confirm;
    window.confirm = vi.fn(() => true);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    window.confirm = origConfirm;
  });

  it('🏛 DOs section lists seeded DOs, and editing a row\'s stores persists through onUpdate', async () => {
    const initial = { ...DEF_SETTINGS };
    await act(async () => {
      root.render(h(Harness, { initial }));
    });
    await clickText(container, 'div', '🏛 DOs');

    expect(container.textContent).toMatch(/Hugh Bonner/);
    expect(container.textContent).toMatch(/Brad Denley/);

    // Edit Hugh Bonner's store list (drop to a single store) via the row's text input onBlur.
    const inputs = [...container.querySelectorAll('input.set-inp')];
    const hughInput = inputs.find(i => i.defaultValue === DEF_SETTINGS.doGroups['Hugh Bonner'].join(','));
    expect(hughInput, 'Hugh Bonner store-list input not found').toBeTruthy();
    await act(async () => {
      hughInput.value = '3708';
      // Native 'blur' does not bubble; React 17+ delegates onBlur off bubbling 'focusout' at
      // the root container (createRoot's mount point here), so dispatch that instead.
      hughInput.dispatchEvent(new Event('focusout', { bubbles: true }));
    });

    // Round-trips: re-query the SAME rendered tree (Harness holds the updated settings in state).
    const updatedInputs = [...container.querySelectorAll('input.set-inp')];
    const hughAfter = updatedInputs.find(i => i.defaultValue === '3708');
    expect(hughAfter, 'edit did not persist back into rendered props').toBeTruthy();
  });

  it('add / remove a DO row persists through onUpdate', async () => {
    const initial = { ...DEF_SETTINGS };
    await act(async () => {
      root.render(h(Harness, { initial }));
    });
    await clickText(container, 'div', '🏛 DOs');

    // Add.
    const addInput = container.querySelector('#new-doGroups');
    expect(addInput).toBeTruthy();
    await act(async () => {
      addInput.value = 'New DO';
      addInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await clickText(container, 'button', ' +');
    expect(container.textContent).toMatch(/New DO/);

    // Remove it again (confirm() mocked true above).
    const rows = [...container.querySelectorAll('.set-row')];
    const newDoRow = rows.find(r => r.textContent.includes('New DO'));
    expect(newDoRow).toBeTruthy();
    const removeBtn = [...newDoRow.querySelectorAll('button')].find(b => b.textContent === '✕');
    await act(async () => { removeBtn.click(); });
    expect(container.textContent).not.toMatch(/New DO/);
  });

  it('⚙ OMs section starts empty (scaffold) and a newly added OM persists', async () => {
    const initial = { ...DEF_SETTINGS }; // DEF_SETTINGS.omGroups is {} by seed
    await act(async () => {
      root.render(h(Harness, { initial }));
    });
    await clickText(container, 'div', '⚙ OMs');
    expect(container.textContent).toMatch(/Scaffold/);

    const addInput = container.querySelector('#new-omGroups');
    expect(addInput).toBeTruthy();
    await act(async () => {
      addInput.value = 'First OM';
      addInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await clickText(container, 'button', ' +');
    expect(container.textContent).toMatch(/First OM/);
  });
});
