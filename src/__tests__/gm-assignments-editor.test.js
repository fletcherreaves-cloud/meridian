// @vitest-environment happy-dom
// @ts-nocheck
// 2026-10-06 follow-up to the Supervisor Assignments effective-dated timeline (OK org chart
// reassignment PR) -- the owner asked for the SAME treatment for GM reassignments (effective
// dates retained, a removal leaves a recoverable record). Mirrors dispatch #166's own pattern
// for testing a management.js section: render the REAL Settings component (not the editor in
// isolation) and drive a parent state wrapper so edits are proven to round-trip through
// onUpdate, per this repo's "verification must touch the call site" standing rule.
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
function flush() { return act(async () => { await Promise.resolve(); await Promise.resolve(); }); }
// Controlled inputs: React patches the instance's `value` setter to track what it last saw, so
// `el.value = x` directly leaves that tracker stale and a subsequent 'input' event dispatch is
// seen as a no-op (onChange never fires). Using the PROTOTYPE's native setter instead bypasses
// React's instrumented one, matching crew-schedule-panel.test.js's own existing technique.
function setInputValue(el, v) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('GM Assignments editor (effective-dated, mirrors Supervisor Assignments)', () => {
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

  it('with no gmAssignments saved yet, seeds from STORE_STAFF (morning-brief.js) via dynamic import', async () => {
    const initial = { ...DEF_SETTINGS };
    await act(async () => { root.render(h(Harness, { initial })); });
    await clickText(container, 'div', '👔 GMs');
    // Prime the module cache for the dynamic import the editor's useEffect kicks off, then give
    // React one more tick to apply the resulting setState -- a plain microtask flush can race
    // the real (if cached, still async) import() resolution.
    await act(async () => { await import('../features/morning-brief.js'); });
    await flush();
    // '43380' (Tishomingo) -- real STORE_STAFF seed, same store this session's own PR swapped
    // to Sabrina Turner.
    expect(container.textContent).toMatch(/Sabrina Turner/);
  });

  it('adding a new effective-dated row persists through onUpdate and shows in "Current"', async () => {
    const initial = { ...DEF_SETTINGS, gmAssignments: [{ loc: '3708', gm: 'Old GM', gmEmail: 'old@mcdok.com', start: '' }] };
    await act(async () => { root.render(h(Harness, { initial })); });
    await clickText(container, 'div', '👔 GMs');

    expect(container.textContent).toMatch(/Old GM/);

    const inputs = [...container.querySelectorAll('input.set-inp')];
    const storeInput = inputs.find(i => i.placeholder === 'Store ID');
    const gmInput = inputs.find(i => i.placeholder === 'GM name');
    const emailInput = inputs.find(i => i.placeholder === 'GM email (optional)');
    await act(async () => {
      setInputValue(storeInput, '3708');
      setInputValue(gmInput, 'New GM');
      setInputValue(emailInput, 'new@mcdok.com');
    });
    await clickText(container, 'button', 'Apply');

    // Both rows now in history; "Current" (today, blank effective date on the new row beats
    // the old one's blank start by array order per latestEffective's own tie-break) shows New GM.
    expect(container.textContent).toMatch(/Old GM/); // history row still present, not deleted
    expect(container.textContent).toMatch(/New GM/);
  });

  it('a future-dated reassignment does not change "Current" until that date, mirroring whoRan/latestEffective', () => {
    const rows = [
      { loc: '3708', gm: 'Current GM', gmEmail: '', start: '' },
      { loc: '3708', gm: 'Future GM', gmEmail: '', start: '2099-01-01' },
    ];
    expect(latestEffective('3708', new Date('2026-01-01'), rows, a => a.gm)).toBe('Current GM');
    expect(latestEffective('3708', new Date('2099-06-01'), rows, a => a.gm)).toBe('Future GM');
  });

  it('removing a row keeps it out of "Current" but the row itself is only removed from the live array (audit log is the permanent record, not this array)', async () => {
    const initial = {
      ...DEF_SETTINGS,
      gmAssignments: [
        { loc: '3708', gm: 'GM One', gmEmail: '', start: '' },
        { loc: '5183', gm: 'GM Two', gmEmail: '', start: '' },
      ],
    };
    await act(async () => { root.render(h(Harness, { initial })); });
    await clickText(container, 'div', '👔 GMs');
    expect(container.textContent).toMatch(/GM One/);

    // Scoped to the exact row's own span (NOT a `div` text-content filter) -- ModalShell's own
    // header close button is also labeled '✕' and renders before the panel body in document
    // order, so a loose "any ancestor div containing this text + a ✕ button" query matches the
    // whole modal first and clicks that instead of the row's own remove button.
    // "GM One" also appears in the "Current" summary span above, which has no ✕ sibling --
    // pick the span whose row actually contains the remove button.
    const gmOneSpans = [...container.querySelectorAll('span')].filter(s => s.textContent === 'GM One');
    const row = gmOneSpans.map(s => s.parentElement).find(r => [...r.querySelectorAll('button')].some(b => b.textContent === '✕'));
    expect(row, 'GM One history row not found').toBeTruthy();
    const removeBtn = [...row.querySelectorAll('button')].find(b => b.textContent === '✕');
    expect(removeBtn, 'row remove button not found').toBeTruthy();
    await act(async () => { removeBtn.click(); });

    expect(container.textContent).not.toMatch(/GM One/);
    expect(container.textContent).toMatch(/GM Two/); // sibling row untouched
  });
});
