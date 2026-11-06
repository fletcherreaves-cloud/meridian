// @vitest-environment happy-dom
// @ts-nocheck
// Error telemetry wiring (memory/plan-error-telemetry-auto-fix-2026-11-06.md, task #103, Phase
// 1). Pins that ErrorBoundary.componentDidCatch (src/features/session.js) calls
// reportRuntimeError() with the real error's message/stack and the panelName threaded in by
// lazyPanel() (task #102) -- fire-and-forget, so a telemetry failure never surfaces as a SECOND
// error on top of the one that just crashed the panel, and never delays the fallback render.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const reportRuntimeErrorMock = vi.fn(() => Promise.resolve());
vi.mock('../lib/supabase.js', () => ({
  loadUserSetting: vi.fn(() => Promise.resolve(null)),
  reportRuntimeError: (...args) => reportRuntimeErrorMock(...args),
}));

const { ErrorBoundary } = await import('../features/session.js');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

function ThrowingChild() {
  throw new Error('simulated panel crash');
}

describe('ErrorBoundary -> reportRuntimeError wiring (task #103)', () => {
  let container, root, consoleErrSpy;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    reportRuntimeErrorMock.mockClear();
    consoleErrSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    consoleErrSpy.mockRestore();
  });

  it('calls reportRuntimeError with the real message, stack, and panelName on a crash', async () => {
    await act(async () => {
      root.render(React.createElement(ErrorBoundary, { panelName: 'store-dash' }, React.createElement(ThrowingChild)));
    });
    expect(reportRuntimeErrorMock).toHaveBeenCalledTimes(1);
    const [message, stack, panel] = reportRuntimeErrorMock.mock.calls[0];
    expect(message).toBe('simulated panel crash');
    expect(typeof stack).toBe('string');
    expect(panel).toBe('store-dash');
  });

  it('still calls reportRuntimeError (with panel=undefined) when no panelName was passed -- e.g. the top-level app-wide boundary', async () => {
    await act(async () => {
      root.render(React.createElement(ErrorBoundary, null, React.createElement(ThrowingChild)));
    });
    expect(reportRuntimeErrorMock).toHaveBeenCalledTimes(1);
    expect(reportRuntimeErrorMock.mock.calls[0][2]).toBeUndefined();
  });

  it('a reportRuntimeError REJECTION does not escape componentDidCatch or break the fallback render', async () => {
    reportRuntimeErrorMock.mockImplementationOnce(() => Promise.reject(new Error('telemetry backend down')));
    let renderError = null;
    await act(async () => {
      try {
        root.render(React.createElement(ErrorBoundary, { panelName: 'sage' }, React.createElement(ThrowingChild)));
      } catch (e) { renderError = e; }
      await Promise.resolve(); await Promise.resolve(); // let the rejected promise settle
    });
    expect(renderError).toBeNull();
    // The fallback UI still rendered -- the crash was still caught and shown, telemetry failing
    // didn't prevent that.
    expect(container.textContent).toContain('simulated panel crash');
  });

  it('still logs to console.error alongside reporting -- the existing behavior is preserved, not replaced', async () => {
    await act(async () => {
      root.render(React.createElement(ErrorBoundary, { panelName: 'store-dash' }, React.createElement(ThrowingChild)));
    });
    expect(consoleErrSpy).toHaveBeenCalled();
    const call = consoleErrSpy.mock.calls.find(c => c[0] === 'Meridian error:');
    expect(call).toBeTruthy();
    expect(call[1]).toBe('[store-dash]');
  });
});
