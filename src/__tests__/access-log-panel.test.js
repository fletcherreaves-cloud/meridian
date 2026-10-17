// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-10-17 (app_access_log, "usage logs/reports for auditing"). Renders the REAL
// AccessLogPanel, not loadAppAccessLog() in isolation -- per this repo's "would this verification
// still pass if reverted?" standing rule, a test that only imports the loader can't tell "built"
// from "built but never wired into the panel".
import { describe, it, expect, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let _logRows = [];
let _profiles = [];
const fromMock = vi.fn((table) => {
  if (table !== 'profiles') throw new Error(`unexpected table: ${table}`);
  return { select: () => Promise.resolve({ data: _profiles, error: null }) };
});

vi.mock('../lib/supabase.js', () => ({
  supabase: { from: (...args) => fromMock(...args) },
  loadAppAccessLog: vi.fn(async () => _logRows),
}));

import { AccessLogPanel } from '../views/access-log.js';

async function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => { root.render(React.createElement(AccessLogPanel, { onClose: () => {} })); });
  await act(async () => { await Promise.resolve(); });
  return { container, root };
}

describe('AccessLogPanel', () => {
  let container, root;
  afterEach(() => { act(() => root?.unmount()); container?.remove(); _logRows = []; _profiles = []; });

  it('shows an empty state when nothing has been logged yet', async () => {
    ({ container, root } = await mount());
    expect(container.textContent).toContain('No access events logged yet.');
  });

  it('renders a login event with the real actor name and role resolved from profiles', async () => {
    _logRows = [{ id: 'e1', actor_id: 'u1', event_type: 'login', panel_id: null, created_at: '2026-10-17T14:30:00Z' }];
    _profiles = [{ id: 'u1', name: 'J Doe', email: 'j@example.com', role: 'admin' }];
    ({ container, root } = await mount());
    expect(container.textContent).toContain('J Doe');
    expect(container.textContent).toContain('(admin)');
    expect(container.textContent).toMatch(/Login/);
  });

  it('renders a panel_view event with its real panel label', async () => {
    _logRows = [{ id: 'e2', actor_id: 'u2', event_type: 'panel_view', panel_id: 'pay-rate-history', created_at: '2026-10-17T14:30:00Z' }];
    _profiles = [{ id: 'u2', name: 'K Owner', email: 'k@example.com', role: 'owner' }];
    ({ container, root } = await mount());
    expect(container.textContent).toContain('K Owner');
    expect(container.textContent).toContain('Pay Rate History');
    expect(container.textContent).toMatch(/Panel View/);
  });

  it('clicking the Who header sorts by the resolved actor name, not the raw actor_id', async () => {
    _logRows = [
      { id: 'e1', actor_id: 'u1', event_type: 'login', panel_id: null, created_at: '2026-10-17T14:00:00Z' },
      { id: 'e2', actor_id: 'u2', event_type: 'login', panel_id: null, created_at: '2026-10-17T15:00:00Z' },
    ];
    _profiles = [
      { id: 'u1', name: 'Zed Owner', email: 'z@example.com', role: 'owner' },
      { id: 'u2', name: 'Amy Admin', email: 'a@example.com', role: 'admin' },
    ];
    ({ container, root } = await mount());
    // Default sort is newest-first (created_at desc) -- Amy's later event leads.
    const rowsBefore = [...container.querySelectorAll('tbody tr')].map(tr => tr.textContent);
    expect(rowsBefore[0]).toContain('Amy Admin');

    const whoHeader = [...container.querySelectorAll('th')].find(t => t.textContent.startsWith('Who'));
    await act(async () => { whoHeader.click(); }); // ascending by name
    const rowsAfter = [...container.querySelectorAll('tbody tr')].map(tr => tr.textContent);
    expect(rowsAfter[0]).toContain('Amy Admin'); // 'Amy' < 'Zed' alphabetically too
    await act(async () => { whoHeader.click(); }); // descending
    const rowsDesc = [...container.querySelectorAll('tbody tr')].map(tr => tr.textContent);
    expect(rowsDesc[0]).toContain('Zed Owner');
  });

  it('falls back to the raw actor id when no matching profile is found', async () => {
    _logRows = [{ id: 'e3', actor_id: 'orphan-uuid', event_type: 'login', panel_id: null, created_at: '2026-10-17T14:30:00Z' }];
    _profiles = [];
    ({ container, root } = await mount());
    expect(container.textContent).toContain('orphan-uuid');
  });
});
