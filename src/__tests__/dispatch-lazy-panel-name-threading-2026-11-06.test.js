// @vitest-environment happy-dom
// @ts-nocheck
// Error-telemetry prep (memory/plan-error-telemetry-auto-fix-2026-11-06.md, task #102) -- a
// future ErrorBoundary.componentDidCatch (task #103) needs to know WHICH panel crashed, not just
// that one did. This is the mechanical prep: lazyPanel() takes an optional second argument,
// panelName, threaded to ErrorBoundary as a prop and used by componentDidCatch's existing
// console.error call. No capture/reporting backend is built here (that's #103) -- this pins only
// that the plumbing works end-to-end and that every real call site in App.js actually has a name.
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { readFileSync } from 'node:fs';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { lazyPanel } from '../app/App.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function ThrowingPanel() { throw new Error('simulated panel crash'); }

describe('lazyPanel() panelName threading (dispatch error-telemetry prep, task #102)', () => {
  let container, root;
  afterEach(() => {
    if (root) act(() => root.unmount());
    if (container) container.remove();
  });

  it('a named lazyPanel() surfaces that name in componentDidCatch\'s console.error call', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const Named = lazyPanel(() => Promise.resolve({ default: ThrowingPanel }), 'my-test-panel');
      await act(async () => {
        root.render(React.createElement(Named, {}));
        await Promise.resolve(); await Promise.resolve();
      });
      const hit = spy.mock.calls.find(c => c[0] === 'Meridian error:');
      expect(hit, 'componentDidCatch should have logged via console.error').toBeTruthy();
      // The bracketed name is the SECOND console.error argument (see session.js's
      // componentDidCatch) -- assert it carries the real name, not just that logging happened.
      expect(hit[1]).toBe('[my-test-panel]');
    } finally {
      spy.mockRestore();
    }
  });

  it('an UNNAMED lazyPanel() (no second argument) still works -- panelName stays optional', async () => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const Unnamed = lazyPanel(() => Promise.resolve({ default: ThrowingPanel }));
      await act(async () => {
        root.render(React.createElement(Unnamed, {}));
        await Promise.resolve(); await Promise.resolve();
      });
      const hit = spy.mock.calls.find(c => c[0] === 'Meridian error:');
      expect(hit, 'componentDidCatch should still log with no panelName').toBeTruthy();
      expect(hit[1]).toBe(''); // no bracketed name when none was given -- not "undefined" or "[undefined]"
      // The panel still renders its real (compact) crash fallback either way.
      expect(container.textContent).toContain('This panel hit an error');
    } finally {
      spy.mockRestore();
    }
  });
});

describe('every real lazyPanel() call site in App.js has a panelName (task #102 coverage)', () => {
  const SRC = readFileSync('src/app/App.js', 'utf8');
  // Matches `const X = lazyPanel(<anything up to the matching close>, 'name');` -- same shape
  // the actual call sites use (single-line, ends in `, 'slug');`).
  const CALLS = [...SRC.matchAll(/const\s+(\w+)\s*=\s*lazyPanel\(([^;]*?)\);/gs)];

  it('found a realistic number of lazyPanel() call sites (sanity check the parser)', () => {
    expect(CALLS.length).toBeGreaterThan(50);
  });

  it('every lazyPanel() call site passes a non-empty second (panelName) argument', () => {
    const missing = [];
    for (const m of CALLS) {
      const [, varName, args] = m;
      // The panelName arg is whatever follows the LAST top-level comma before the closing paren
      // of the call. Call sites are all single-line and end `}))` or `})))`, then `, 'slug'` --
      // a trailing-quoted-string check is a reliable, simple proxy for "a name was passed" here.
      const hasQuotedTrailingArg = /,\s*'[^']+'\s*$/.test(args);
      if (!hasQuotedTrailingArg) missing.push(varName);
    }
    expect(missing, `these lazyPanel() call sites have no panelName: ${missing.join(', ')}`).toEqual([]);
  });

  it('every passed panelName is unique (two panels sharing a name would make crash logs ambiguous)', () => {
    const names = CALLS.map(m => (m[2].match(/,\s*'([^']+)'\s*$/) || [])[1]).filter(Boolean);
    expect(new Set(names).size).toBe(names.length);
  });

  it('the newly-merged Quick-Capture panel got a name too, not just panels that predate it', () => {
    const quickCapture = CALLS.find(m => m[1] === 'QuickCapturePanel');
    expect(quickCapture, 'QuickCapturePanel lazyPanel() call site should exist').toBeTruthy();
    expect(quickCapture[2]).toContain("'quick-capture'");
  });
});
