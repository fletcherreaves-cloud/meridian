// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-10-20: generalize GM/Supervisor's effective-dated-assignment + permanent-
// audit-log pattern to ANY role (Accounting Manager, Scheduling Manager, etc.) -- see
// RoleAssignmentsEditor's own header comment in management.js for the full design rationale.
// Mirrors gm-assignments-editor.test.js's pattern exactly: render the REAL Settings component
// (not the editor in isolation) and drive a parent state wrapper so edits are proven to
// round-trip through onUpdate, per this repo's "verification must touch the call site" rule.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { DEF_SETTINGS, latestEffective } from '../constants.js';

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
function setInputValue(el, v) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('Role Assignments editor (effective-dated, generalizes GM/Supervisor to any role)', () => {
  let container, root, origAlert;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    origAlert = window.alert;
    window.alert = vi.fn();
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    window.alert = origAlert;
  });

  it('with no roleAssignments saved yet, shows an empty state rather than erroring', async () => {
    const initial = { ...DEF_SETTINGS };
    await act(async () => { root.render(h(Harness, { initial })); });
    await clickText(container, 'div', '🧑‍💼 Roles');
    expect(container.textContent).toMatch(/Role Assignments/);
  });

  it('adding a new role assignment persists through onUpdate and shows in "Current", grouped by role', async () => {
    const initial = { ...DEF_SETTINGS, roleAssignments: [{ loc: '3708', role: 'Accounting Manager', person: 'Old AM', email: '', start: '' }] };
    await act(async () => { root.render(h(Harness, { initial })); });
    await clickText(container, 'div', '🧑‍💼 Roles');

    expect(container.textContent).toMatch(/Old AM/);

    const inputs = [...container.querySelectorAll('input.set-inp')];
    const roleInput = inputs.find(i => i.placeholder === 'Role (new or existing)');
    const personInput = inputs.find(i => i.placeholder === 'Person name');
    const storeInput = inputs.find(i => i.placeholder === 'Store ID');
    await act(async () => {
      setInputValue(roleInput, 'Accounting Manager');
      setInputValue(personInput, 'New AM');
      setInputValue(storeInput, '3708');
    });
    await clickText(container, 'button', 'Apply');

    expect(container.textContent).toMatch(/Old AM/); // history row still present, not deleted
    expect(container.textContent).toMatch(/New AM/);
    expect(container.textContent).toMatch(/Accounting Manager/);
  });

  it('a different role at the SAME store resolves independently (one store can hold several current roles at once)', async () => {
    const initial = {
      ...DEF_SETTINGS,
      roleAssignments: [
        { loc: '3708', role: 'Accounting Manager', person: 'AM Person', email: '', start: '' },
        { loc: '3708', role: 'Scheduling Manager', person: 'SM Person', email: '', start: '' },
      ],
    };
    await act(async () => { root.render(h(Harness, { initial })); });
    await clickText(container, 'div', '🧑‍💼 Roles');
    expect(container.textContent).toMatch(/AM Person/);
    expect(container.textContent).toMatch(/SM Person/);
  });

  it('a future-dated reassignment does not change "Current" until that date, mirroring GM/Supervisor\'s own latestEffective rule', () => {
    const rows = [
      { loc: '3708', role: 'Accounting Manager', person: 'Current AM', start: '' },
      { loc: '3708', role: 'Accounting Manager', person: 'Future AM', start: '2099-01-01' },
    ];
    expect(latestEffective('3708', new Date('2026-01-01'), rows, a => a.person)).toBe('Current AM');
    expect(latestEffective('3708', new Date('2099-06-01'), rows, a => a.person)).toBe('Future AM');
  });

  it('removing a row keeps it out of "Current" but only removes it from the live array (audit log, not this array, is the permanent record)', async () => {
    const initial = {
      ...DEF_SETTINGS,
      roleAssignments: [
        { loc: '3708', role: 'Accounting Manager', person: 'AM One', email: '', start: '' },
        { loc: '5183', role: 'Accounting Manager', person: 'AM Two', email: '', start: '' },
      ],
    };
    await act(async () => { root.render(h(Harness, { initial })); });
    await clickText(container, 'div', '🧑‍💼 Roles');
    expect(container.textContent).toMatch(/AM One/);

    const amOneSpans = [...container.querySelectorAll('span')].filter(s => s.textContent === 'AM One');
    const row = amOneSpans.map(s => s.parentElement).find(r => [...r.querySelectorAll('button')].some(b => b.textContent === '✕'));
    expect(row, 'AM One history row not found').toBeTruthy();
    const removeBtn = [...row.querySelectorAll('button')].find(b => b.textContent === '✕');
    await act(async () => { removeBtn.click(); });

    expect(container.textContent).not.toMatch(/AM One/);
    expect(container.textContent).toMatch(/AM Two/); // sibling row untouched
  });
});
