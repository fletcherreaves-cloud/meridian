// @vitest-environment happy-dom
// @ts-nocheck
// Dispatch #79 item 1 -- before this fix, meridian.js's ErrorBoundary was the ONLY one in the
// app, wrapping everything. A runtime error thrown while rendering any single panel unmounted
// nav/shell/AtAGlance along with it -- one panel's crash blanked all 82 panels. lazyPanel()
// already gave every panel its own Suspense boundary for the identical reason (a chunk-load
// failure shouldn't blank the app); this test pins that it now ALSO gives every panel its own
// ErrorBoundary for a runtime render error, not just a load failure.
//
// The dispatch brief explicitly flagged that reusing the existing ErrorBoundary's full 100vh
// "the app crashed" look inside one panel's own overlay would itself look broken -- it may need
// a compact variant. lazyPanel() now passes compact:true and forwards the panel's own onClose,
// so a persistent error has a real way back instead of "Try to recover" looping into the same
// crash. This file pins both: containment (dispatch #79 item 1's original bar) and the compact,
// dismissible fallback (the brief's explicit follow-up).
//
// Renders the REAL lazyPanel() composition from src/app/App.js, not a hand-rolled stand-in --
// reverting the App.js fix (removing the ErrorBoundary wrap, or the compact/onClose forwarding)
// must fail these tests, since a test against a duplicated wrapper could pass unchanged with the
// real call site reverted.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { lazyPanel } from '../app/App.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function ThrowingPanel() {
  throw new Error('simulated panel crash');
}

async function renderCrashing(root, extraProps) {
  const CrashingPanel = lazyPanel(() => Promise.resolve({ default: ThrowingPanel }));
  await act(async () => {
    root.render(React.createElement(React.Fragment, null,
      React.createElement('div', { 'data-testid': 'nav-marker' }, 'Nav still here'),
      React.createElement(CrashingPanel, extraProps || {}),
    ));
    // Let the lazy import promise and the Suspense boundary settle before the throw fires.
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('lazyPanel per-panel ErrorBoundary (dispatch #79 item 1)', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('a panel crash is contained to its own subtree -- sibling content outside it survives', async () => {
    await renderCrashing(root);
    // The content OUTSIDE the crashed panel's own boundary must still be mounted -- this is the
    // entire point: before the fix, the app-level boundary in meridian.js would have unmounted
    // this too.
    expect(container.textContent).toContain('Nav still here');
    expect(container.textContent).toContain('This panel hit an error');
  });

  it('uses the COMPACT fallback, not the full-page top-level "Meridian — Runtime Error" screen', async () => {
    await renderCrashing(root);
    // meridian.js's own top-level boundary (share view / whole-app) still uses this exact text --
    // a per-panel crash must read differently, or it looks like the whole app crashed again.
    expect(container.textContent).not.toContain('Meridian — Runtime Error');
  });

  it('forwards the panel\'s own onClose as a real "Close panel" way back', async () => {
    const onClose = vi.fn();
    await renderCrashing(root, { onClose });
    const closeBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Close panel');
    expect(closeBtn).toBeTruthy();
    act(() => { closeBtn.click(); });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('omits the "Close panel" button when the panel has no onClose to forward', async () => {
    await renderCrashing(root); // no onClose passed
    const closeBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Close panel');
    expect(closeBtn).toBeFalsy();
    // "Try to recover" is still there either way.
    expect([...container.querySelectorAll('button')].some(b => b.textContent === 'Try to recover')).toBe(true);
  });
});
