// @vitest-environment happy-dom
// @ts-nocheck
// Owner req (2026-11-02): a "🔄 Refresh EOM Data" button that re-pulls FOB (Product Net Sales)
// and Operations Report (Cash +/-) on demand — same trigger-dar-sync mechanism the Data Manager
// panel's own "↻ Sync" buttons use (triggerSync), just fired as one combined action since EOM
// numbers depend on both streams together.
import { describe, it, expect, vi, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const triggerSync = vi.fn(async (wf) => ({ status: 'dispatched', workflow: wf, message: `${wf} sync started` }));
vi.mock('../lib/supabase.js', () => ({ triggerSync }));

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { EOMDataRefreshButton } = await import('../components/EOMDataRefreshButton.js');

function mount(props) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => { root.render(React.createElement(EOMDataRefreshButton, props)); });
  return { container, root };
}

describe('EOMDataRefreshButton', () => {
  let container, root;
  afterEach(() => { act(() => { root?.unmount(); }); container?.remove(); triggerSync.mockClear(); });

  it('clicking it calls triggerSync for BOTH fob and ops, not just one', async () => {
    ({ container, root } = mount({}));
    const btn = container.querySelector('button');
    await act(async () => { btn.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(triggerSync).toHaveBeenCalledTimes(2);
    const calledWith = triggerSync.mock.calls.map(c => c[0]);
    expect(calledWith).toContain('fob');
    expect(calledWith).toContain('ops');
  });

  it('shows a busy state while dispatching, then a success message', async () => {
    let resolveFob, resolveOps;
    triggerSync.mockImplementation((wf) => new Promise(res => {
      if (wf === 'fob') resolveFob = res; else resolveOps = res;
    }));
    ({ container, root } = mount({}));
    const btn = container.querySelector('button');
    act(() => { btn.click(); });
    expect(btn.disabled).toBe(true);
    expect(container.textContent).toContain('refreshing');
    await act(async () => {
      resolveFob({ status: 'dispatched', message: 'fob sync started' });
      resolveOps({ status: 'dispatched', message: 'ops sync started' });
      await Promise.resolve(); await Promise.resolve();
    });
    expect(container.textContent).toContain('refresh in ~10 min');
    expect(container.querySelector('button').disabled).toBe(false);
  });

  it('shows an error message when either call fails, without silently reporting success', async () => {
    triggerSync.mockImplementation(async (wf) => wf === 'ops' ? { error: 'GitHub API error 502' } : { status: 'dispatched' });
    ({ container, root } = mount({}));
    const btn = container.querySelector('button');
    await act(async () => { btn.click(); await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toContain('GitHub API error 502');
    expect(container.textContent).not.toContain('refresh in ~10 min');
  });
});
