// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #166 — DO (and OM-scaffold) tier on Leadership One-Pager's scope dropdown.
// Renders the REAL OnePagerPanel component (src/views/one-pager.js, registry id
// 'leader-one-pager') so a revert of the wiring -- not just applyScope's logic tested in
// isolation -- would show up here, per this repo's "verification must touch the call site"
// standing rule. Mirrors src/__tests__/dispatch-158-onepager-custom-range.test.js's render
// pattern (real component + createRoot + act), applied to the sibling panel.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { DEF_SETTINGS } from '../constants.js';

// The real supabase.js client attempts live network calls in this test env (VITE_SUPABASE_URL
// is set), which the sandbox can't complete -- fobRows/priorItems would never resolve and the
// gated `!page ? 'Loading…' : ...` branch (and the Scope row inside it) would never render.
// Stub the loaders the panel's useEffects call to resolve immediately, same approach as
// dispatch-72's StoreDash test mocking engine calls the component depends on.
vi.mock('../lib/supabase.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, loadQsrFob: vi.fn().mockResolvedValue([]), loadActionItems: vi.fn().mockResolvedValue([]) };
});

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { OnePagerPanel } = await import('../views/one-pager.js');

const OK_IDS = DEF_SETTINGS.doGroups['Hugh Bonner'];
const FL_IDS = DEF_SETTINGS.doGroups['Brad Denley'];
const STORES = [...OK_IDS, ...FL_IDS].map(loc => ({ loc }));
const SETTINGS = { ...DEF_SETTINGS }; // real doGroups + omGroups:{} scaffold + operators/supervisorGroups

function setSelectValue(select, value) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  setter.call(select, value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

// The scope row (and the whole body) only renders once `page` computes, which is gated on
// `fobRows` leaving its initial `null` -- set by the loadQsrFob().then()/.catch() microtask
// chain in a useEffect, not synchronously. Flush a few ticks so that settles before asserting.
async function renderPanel(root) {
  await act(async () => {
    root.render(React.createElement(OnePagerPanel, {
      ds: {}, stores: STORES, settings: SETTINGS, onClose: () => {},
    }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  });
}

describe("dispatch #166 -- Leadership One-Pager's DO/OM scope tiers", () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('renders a DO dropdown listing Hugh Bonner and Brad Denley', async () => {
    await renderPanel(root);
    const doSelect = [...container.querySelectorAll('select')]
      .find(s => [...s.options].some(o => o.textContent === 'DO…'));
    expect(doSelect, 'DO dropdown not found').toBeTruthy();
    const optionLabels = [...doSelect.options].map(o => o.textContent);
    expect(optionLabels).toContain('Hugh Bonner');
    expect(optionLabels).toContain('Brad Denley');
  });

  it('picking "Hugh Bonner" sets locs to exactly the 20 OK store ids', async () => {
    await renderPanel(root);
    const doSelect = [...container.querySelectorAll('select')]
      .find(s => [...s.options].some(o => o.textContent === 'DO…'));
    await act(async () => { setSelectValue(doSelect, 'Hugh Bonner'); });

    // Scope label + count reflect the DO pick.
    expect(container.textContent).toMatch(/DO: Hugh Bonner/);
    expect(container.textContent).toMatch(new RegExp(`${OK_IDS.length} stores`));

    // Store pills: exactly the 20 OK ids read "on" (accent border), no FL id does. Match by
    // the inline style attribute text rather than the parsed CSSOM (border-radius shorthand
    // doesn't reliably round-trip through jsdom/happy-dom's style setter).
    // Store pills carry a distinctive '3px 8px' padding + 12px radius (unlike any other button
    // in the panel); happy-dom serializes the shorthand `border` into longhand
    // border-color/-style/-width, so match on border-color rather than the shorthand string.
    const pills = [...container.querySelectorAll('button')].filter(b => {
      const s = b.getAttribute('style') || '';
      return s.includes('padding: 3px 8px') && s.includes('border-radius: 12px');
    });
    expect(pills.length).toBe([...OK_IDS, ...FL_IDS].length); // one pill per store
    const onPills = pills.filter(b => (b.getAttribute('style') || '').includes('border-color: var(--accent'));
    expect(onPills.length).toBe(OK_IDS.length);
  });

  it('does NOT render an OM dropdown when omGroups is empty (the shared empty-guard)', async () => {
    await renderPanel(root);
    const omSelect = [...container.querySelectorAll('select')]
      .find(s => [...s.options].some(o => o.textContent === 'OM…'));
    expect(omSelect).toBeFalsy();
  });
});
