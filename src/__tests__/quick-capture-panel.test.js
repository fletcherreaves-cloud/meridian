// @vitest-environment happy-dom
// @ts-nocheck
// Quick-Capture Phase 1 (memory/plan-overnight-notes-72-2026-11-06.md §1, task #101) — renders
// the REAL QuickCapturePanel, mocking only the Supabase network calls. Asserts the flow (category
// -> chip/free-text -> submit -> real measured number or honest "no history yet") end to end, and
// that no gamification/badge language ever appears (the plan doc explicitly rejects that).
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const savedEvents = [];
vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    saveOrgEvents: (events) => { savedEvents.push(...events); return Promise.resolve({ saved: events.length, errors: [] }); },
    loadEventImpact: () => Promise.resolve([
      { loc: '3708', eventType: 'staffing', homeImpact: -0.032, nHome: 6, source: 'measured' },
    ]),
  };
});

const { QuickCapturePanel } = await import('../views/quick-capture.js');

const STORES = [{ loc: '3708' }];

async function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(QuickCapturePanel, props)); });
  return { container, root };
}

function click(container, text) {
  const el = [...container.querySelectorAll('button,div,span')].find(e => e.textContent.trim() === text && e.children.length === 0 || e.textContent === text);
  return el;
}

describe('QuickCapturePanel', () => {
  let container, root;
  afterEach(() => { act(() => root?.unmount()); container?.remove(); savedEvents.length = 0; });

  it('starts on the category step with EVENT_TYPE_GROUPS tiles, no badges/gamification language', async () => {
    ({ container, root } = await mount({ stores: STORES, selStore: '3708', settings: {}, onClose: () => {} }));
    expect(container.textContent).toContain('Operations');
    expect(container.textContent.toLowerCase()).not.toMatch(/badge|streak|points earned|level up/);
  });

  it('picking a category then a chip and submitting saves a real org_events-shaped row and shows the real measured number', async () => {
    ({ container, root } = await mount({ stores: STORES, selStore: '3708', settings: { _userEmail: 'gm@example.com' }, onClose: () => {} }));

    const opsTile = [...container.querySelectorAll('div')].find(d => d.textContent.includes('Operations') && d.children.length === 0);
    await act(async () => { opsTile.click(); });

    const chip = [...container.querySelectorAll('span')].find(s => s.textContent.includes('Staffing Issue'));
    expect(chip, 'Staffing Issue chip not found').toBeTruthy();
    await act(async () => { chip.click(); });

    const logBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Log it'));
    await act(async () => { logBtn.click(); await Promise.resolve(); await Promise.resolve(); });

    expect(savedEvents).toHaveLength(1);
    expect(savedEvents[0]).toMatchObject({ loc: '3708', type: 'staffing', label: 'Staffing Issue', scope: 'store', method: 'quick-capture', enteredBy: 'gm@example.com' });

    expect(container.textContent).toContain('-3.2%');
    expect(container.textContent).toContain('measured sales impact');
    expect(container.textContent.toLowerCase()).not.toMatch(/badge|streak|points earned|level up/);
  });

  it('free text with no chip picked logs as type "other" and honestly reports no history yet', async () => {
    ({ container, root } = await mount({ stores: STORES, selStore: '3708', settings: {}, onClose: () => {} }));

    const opsTile = [...container.querySelectorAll('div')].find(d => d.textContent.includes('Operations') && d.children.length === 0);
    await act(async () => { opsTile.click(); });

    const textarea = container.querySelector('#qc-free');
    const setNativeValue = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    await act(async () => {
      setNativeValue.call(textarea, 'Street festival two blocks over this weekend');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });

    const logBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Log it'));
    await act(async () => { logBtn.click(); await Promise.resolve(); await Promise.resolve(); });

    expect(savedEvents).toHaveLength(1);
    expect(savedEvents[0]).toMatchObject({ loc: '3708', type: 'other', label: 'Street festival two blocks over this weekend' });
    expect(container.textContent).toContain('No measured history yet');
  });

  it('blocks submit with no chip and no free text', async () => {
    ({ container, root } = await mount({ stores: STORES, selStore: '3708', settings: {}, onClose: () => {} }));
    const opsTile = [...container.querySelectorAll('div')].find(d => d.textContent.includes('Operations') && d.children.length === 0);
    await act(async () => { opsTile.click(); });
    const logBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Log it'));
    await act(async () => { logBtn.click(); await Promise.resolve(); });
    expect(savedEvents).toHaveLength(0);
    expect(container.textContent).toContain('Pick an item or describe what happened');
  });
});
