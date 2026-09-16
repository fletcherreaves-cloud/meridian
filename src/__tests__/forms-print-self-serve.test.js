// @vitest-environment happy-dom
// @ts-nocheck
// "Self-serve 'add form' button" (Task #59, Printable Forms expansion) — a background audit
// (2026-09-16) confirmed no in-app affordance existed anywhere for requesting a new/updated
// form without running scripts/qsrsoft-forms-pull.mjs locally (QSRSoft credentials + Playwright)
// and committing public/forms/*.json by hand. This wires FormsPrintPanel's search box + a
// "🔄 Request pull" action that dispatches the SAME script via the trigger-dar-sync Edge
// Function's existing on-demand-sync mechanism (supabase.js's triggerSync — the identical
// mechanism Data Manager's DAR/eBOS/FOB/LifeLenz sync buttons already use), scoped to a title
// match via the workflow's own forms_match input.
//
// Renders the REAL FormsPrintPanel consumer and drives the actual search/request-click path
// (this repo's "would this verification still pass if reverted?" standing rule) — mocking only
// the network-touching boundaries (fetch for the static manifest, supabase.js's triggerSync for
// the dispatch), not FormsPrintPanel's own logic.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../lib/supabase.js', () => ({ triggerSync: vi.fn() }));
import { triggerSync } from '../lib/supabase.js';
import { FormsPrintPanel } from '../views/forms-print.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const INDEX = [
  { slug: 'breakfast-pre-shift', title: 'Breakfast Pre-Shift', category: 'Shift Management Forms', itemCount: 94 },
  { slug: 'cash-audit', title: 'Cash Audit', category: 'Forms', itemCount: 26 },
];

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
}

// Same helper shape as crew-schedule-panel.test.js / dispatch-105-lifelenz-bridge-daterange.
// test.js — a plain `.value =` assignment doesn't trigger React's tracked setter, so the
// native setter + a real 'input' event is required for onChange to actually fire.
function setInputValue(el, v) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  setter.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('FormsPrintPanel — self-serve form-pull request', () => {
  let container, root, origFetch;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    origFetch = global.fetch;
    global.fetch = vi.fn((url) => {
      if (String(url).includes('/forms/index.json')) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve(INDEX) });
      }
      return Promise.resolve({ ok: false, status: 404 });
    });
    triggerSync.mockReset();
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    global.fetch = origFetch;
  });

  async function mount() {
    await act(async () => { root.render(React.createElement(FormsPrintPanel, { onClose: () => {} })); });
    await flush();
  }

  it('renders via ModalShell (a top-right "✕", not a hand-rolled backdrop) and lists the captured forms', async () => {
    await mount();
    expect(container.querySelector('button[aria-label="Close"]')).toBeTruthy();
    expect(container.textContent).toContain('2 captured templates');
    expect(container.textContent).toContain('Breakfast Pre-Shift');
    expect(container.textContent).toContain('Cash Audit');
  });

  it('typing in the search box filters the visible list to matching titles only', async () => {
    await mount();
    const search = container.querySelector('input[placeholder*="Search forms"]');
    expect(search).toBeTruthy();
    await act(async () => { setInputValue(search, 'cash'); });
    expect(container.textContent).toContain('Cash Audit');
    expect(container.textContent).not.toContain('Breakfast Pre-Shift');
  });

  it('a search with no matches offers to request a pull scoped to that exact query', async () => {
    await mount();
    const search = container.querySelector('input[placeholder*="Search forms"]');
    await act(async () => { setInputValue(search, 'travel path'); });
    expect(container.textContent).toContain('No captured form matches "travel path"');
    const reqBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Request pull'));
    expect(reqBtn).toBeTruthy();
    expect(reqBtn.textContent).toContain('travel path');
  });

  it('clicking Request pull dispatches triggerSync(\'forms\', {forms_match: <escaped query>}) and shows the success message', async () => {
    triggerSync.mockResolvedValue({ status: 'dispatched', workflow: 'forms', message: 'Printable Forms Library sync started — data will refresh in ~10 minutes.' });
    await mount();
    const search = container.querySelector('input[placeholder*="Search forms"]');
    await act(async () => { setInputValue(search, 'travel path'); });
    const reqBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Request pull'));
    await act(async () => { reqBtn.click(); });
    await flush();

    expect(triggerSync).toHaveBeenCalledTimes(1);
    expect(triggerSync).toHaveBeenCalledWith('forms', { forms_match: 'travel path' });
    expect(container.textContent).toContain('data will refresh in ~10 minutes');
  });

  it('regex-special characters in the query are escaped before being sent as forms_match', async () => {
    triggerSync.mockResolvedValue({ status: 'dispatched', message: 'ok' });
    await mount();
    const search = container.querySelector('input[placeholder*="Search forms"]');
    // A title containing parens/plus, which would otherwise break the server-side regex.
    await act(async () => { setInputValue(search, 'Q3 (2026)+'); });
    const reqBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Request pull'));
    await act(async () => { reqBtn.click(); });
    await flush();
    expect(triggerSync).toHaveBeenCalledWith('forms', { forms_match: 'Q3 \\(2026\\)\\+' });
  });

  it('a request failure shows the error, not a silent no-op', async () => {
    triggerSync.mockResolvedValue({ error: 'GitHub API error 502' });
    await mount();
    const reqBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Request pull'));
    await act(async () => { reqBtn.click(); });
    await flush();
    expect(container.textContent).toContain('GitHub API error 502');
  });

  it('with an empty search box, Request pull asks for every form, not an empty/undefined match', async () => {
    triggerSync.mockResolvedValue({ status: 'dispatched', message: 'ok' });
    await mount();
    const reqBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Request pull'));
    expect(reqBtn.textContent).toContain('all forms');
    await act(async () => { reqBtn.click(); });
    await flush();
    expect(triggerSync).toHaveBeenCalledWith('forms', {});
  });
});
