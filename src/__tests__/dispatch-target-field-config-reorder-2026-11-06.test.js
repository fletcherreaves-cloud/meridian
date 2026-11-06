// @vitest-environment happy-dom
// @ts-nocheck
// Owner-requested, task #89 (2026-11-06) -- Customize Fields items 1-3: reorder fields within a
// category, reorder categories themselves, and explicit add/retire-category UX (previously only
// implicit: pick "+ New category..." in a field's dropdown, or empty every field out by hand).
// src/engine/target-field-config.js already supported `order` on both fields and groups before
// this pass (see dispatch-target-field-config-2026-11-04.test.js's own reorder tests) -- this
// file covers the NEW editor UI that finally exposes it, mounting the real
// TargetFieldConfigEditor (per this repo's "would this verification still pass if reverted?"
// rule -- a test against draft state alone could pass unchanged with the buttons never wired up).
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { TargetFieldConfigEditor } from '../components/TargetFieldConfigEditor.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function setNativeValue(el, value) {
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}

const FIELDS = [
  { id: 'a', label: 'Field A', group: 'Group1', groupLabel: 'Group1' },
  { id: 'b', label: 'Field B', group: 'Group1', groupLabel: 'Group1' },
  { id: 'c', label: 'Field C', group: 'Group2', groupLabel: 'Group2' },
];

describe('TargetFieldConfigEditor reorder + category add/retire (task #89, 2026-11-06)', () => {
  let container, root;
  afterEach(() => { if (root) act(() => root.unmount()); if (container) container.remove(); });

  function mount(props) {
    container = document.createElement('div'); document.body.appendChild(container);
    root = createRoot(container);
    const onSave = vi.fn();
    const onClose = vi.fn();
    act(() => { root.render(React.createElement(TargetFieldConfigEditor, { fields: FIELDS, config: null, onSave, onClose, ...props })); });
    return { onSave, onClose };
  }

  function fieldRow(label) {
    const inp = [...container.querySelectorAll('input')].find(i => i.value === label);
    return inp.parentElement;
  }
  function categoryHeader(label) {
    const inp = [...container.querySelectorAll('input')].find(i => i.value === label);
    return inp.parentElement;
  }

  it('moves a field up within its category and persists a clean sequential order on save', async () => {
    const { onSave } = mount({});
    await act(async () => { fieldRow('Field B').querySelector('button[title="Move up"]').click(); });
    await act(async () => { [...container.querySelectorAll('button')].find(b => b.textContent === 'Save').click(); });
    const cfg = onSave.mock.calls[0][0];
    expect(cfg.fields.b.order).toBe(0);
    expect(cfg.fields.a.order).toBe(1);
    // Group2's lone field is untouched -- no order needed for a single-field group.
    expect(cfg.fields.c?.order).toBeUndefined();
  });

  it('the up-arrow on the first field in a group is disabled (no-op boundary)', async () => {
    mount({});
    const upBtn = fieldRow('Field A').querySelector('button[title="Move up"]');
    expect(upBtn.disabled).toBe(true);
  });

  it('moves a category up and persists a clean sequential order for every rendered category', async () => {
    const { onSave } = mount({});
    await act(async () => { categoryHeader('Group2').querySelector('button[title="Move category up"]').click(); });
    await act(async () => { [...container.querySelectorAll('button')].find(b => b.textContent === 'Save').click(); });
    const cfg = onSave.mock.calls[0][0];
    expect(cfg.groups.Group2.order).toBe(0);
    expect(cfg.groups.Group1.order).toBe(1);
  });

  it('"+ Add category" creates a real, empty, persisted category a field can later move into', async () => {
    const { onSave } = mount({});
    const nameInput = [...container.querySelectorAll('input')].find(i => i.placeholder === 'Category name');
    await act(async () => { setNativeValue(nameInput, 'Seasonal Items'); });
    await act(async () => { [...container.querySelectorAll('button')].find(b => b.textContent === 'Add category').click(); });

    expect(container.textContent).toContain('Seasonal Items');
    expect(container.textContent).toContain('empty — move a field here, or remove it');

    await act(async () => { [...container.querySelectorAll('button')].find(b => b.textContent === 'Save').click(); });
    const cfg = onSave.mock.calls[0][0];
    const key = Object.keys(cfg.groups).find(k => cfg.groups[k].label === 'Seasonal Items');
    expect(key).toBeTruthy();
    expect(cfg.groups[key]).toEqual({ label: 'Seasonal Items' });
  });

  it('a newly-added empty category is immediately selectable as a field\'s destination category', async () => {
    mount({});
    const nameInput = [...container.querySelectorAll('input')].find(i => i.placeholder === 'Category name');
    await act(async () => { setNativeValue(nameInput, 'Seasonal Items'); });
    await act(async () => { [...container.querySelectorAll('button')].find(b => b.textContent === 'Add category').click(); });

    const fieldSelect = fieldRow('Field C').querySelector('select');
    const hasOption = [...fieldSelect.options].some(o => o.textContent === 'Seasonal Items');
    expect(hasOption).toBe(true);
  });

  it('removing an empty category drops it entirely, nothing persisted', async () => {
    const { onSave } = mount({});
    const nameInput = [...container.querySelectorAll('input')].find(i => i.placeholder === 'Category name');
    await act(async () => { setNativeValue(nameInput, 'Seasonal Items'); });
    await act(async () => { [...container.querySelectorAll('button')].find(b => b.textContent === 'Add category').click(); });
    await act(async () => { [...container.querySelectorAll('button')].find(b => b.textContent === '✕ Remove').click(); });

    expect(container.textContent).not.toContain('Seasonal Items');
    await act(async () => { [...container.querySelectorAll('button')].find(b => b.textContent === 'Save').click(); });
    expect(onSave.mock.calls[0][0]).toBeNull();
  });

  it('"Retire category" bulk-moves every field in a category to a chosen destination in one step', async () => {
    const { onSave } = mount({});
    await act(async () => { categoryHeader('Group1').querySelector('button[title^="Move every field"]').click(); });
    const destSelect = [...container.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent === 'Group2'));
    await act(async () => { setNativeValue(destSelect, 'Group2'); });
    await act(async () => { [...container.querySelectorAll('button')].find(b => b.textContent === 'Confirm').click(); });

    await act(async () => { [...container.querySelectorAll('button')].find(b => b.textContent === 'Save').click(); });
    const cfg = onSave.mock.calls[0][0];
    expect(cfg.fields.a.group).toBe('Group2');
    expect(cfg.fields.b.group).toBe('Group2');
    // Group1 is now empty and its category box no longer renders -- same existing "categories
    // empty out automatically" behavior, just reached in one click instead of two. It still
    // persists as a selectable destination elsewhere (origGroups are always offered, so a field
    // can move back later), so only the rename-input/category-box marker is asserted gone here.
    expect([...container.querySelectorAll('input')].some(i => i.value === 'Group1')).toBe(false);
  });

  it('"Retire category" can hide every field in a category instead of reassigning them', async () => {
    const { onSave } = mount({});
    await act(async () => { categoryHeader('Group1').querySelector('button[title^="Move every field"]').click(); });
    const destSelect = [...container.querySelectorAll('select')].find(s => [...s.options].some(o => o.textContent === '(hide them instead)'));
    await act(async () => { setNativeValue(destSelect, '__tfc_hide__'); });
    await act(async () => { [...container.querySelectorAll('button')].find(b => b.textContent === 'Confirm').click(); });

    await act(async () => { [...container.querySelectorAll('button')].find(b => b.textContent === 'Save').click(); });
    const cfg = onSave.mock.calls[0][0];
    expect(cfg.fields.a.hidden).toBe(true);
    expect(cfg.fields.b.hidden).toBe(true);
  });
});
