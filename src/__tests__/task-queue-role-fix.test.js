// @vitest-environment happy-dom
// @ts-nocheck
// RBAC audit finding (2026-09-16): TaskQueuePanel's isDev check used to read `settings?.role`,
// a field that has never existed on the app-wide UI-settings object -- isDev was always false for
// every user, silently disabling Feature Request dev_notes editing for everyone including the
// real admin account. Fixed to read the real per-user `userRole` prop instead (see
// task-queue.js's own comment at the fix site). Renders the REAL TaskQueuePanel consumer, not a
// reimplementation of canEditDevFields' logic, per this repo's "would this verification still
// pass if the change were reverted?" standing rule -- a test against the pure boolean alone
// couldn't tell "fixed" from "fixed but the App.js call site still doesn't pass userRole".
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../lib/supabase.js', () => ({
  loadTasks: vi.fn(() => Promise.resolve([])),
  saveTask: vi.fn(() => Promise.resolve({})),
  updateTask: vi.fn(() => Promise.resolve({})),
  loadSessionNotes: vi.fn(() => Promise.resolve([])),
  saveSessionNote: vi.fn(() => Promise.resolve({})),
  markNoteConsumed: vi.fn(() => Promise.resolve({})),
  loadFeatureRequests: vi.fn(() => Promise.resolve([
    { id: 'fr-1', type: 'feature_request', title: 'Sample feature request', status: 'idea',
      priority: 2, dev_notes: 'internal-only commentary', submitted_by: 'someone', votes: 0,
      created_at: new Date().toISOString() },
  ])),
  saveFeatureRequest: vi.fn(() => Promise.resolve({})),
  updateFeatureRequest: vi.fn(() => Promise.resolve({})),
  voteFeatureRequest: vi.fn(() => Promise.resolve({})),
}));

import { TaskQueuePanel } from '../views/task-queue.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function flush() {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
}

describe('TaskQueuePanel — dev_notes editability follows the real userRole prop', () => {
  let container, root;
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
  afterEach(() => { act(() => { root.unmount(); }); container.remove(); });

  it('admin: dev_notes IS editable (a textarea renders, not a read-only line)', async () => {
    await act(async () => {
      root.render(React.createElement(TaskQueuePanel, { onClose: () => {}, settings: {}, userRole: 'admin', initialType: 'feature_request' }));
    });
    await flush();
    const title = [...container.querySelectorAll('div')].find(d => d.textContent === 'Sample feature request');
    expect(title).toBeTruthy();
    await act(async () => { title.click(); });
    await flush();
    expect(container.querySelector('textarea')).toBeTruthy();
    expect(container.textContent).toContain('Dev Notes (visible to all users)');
  });

  it('owner: dev_notes IS editable -- owner is the other real top-tier (level:1) role, same as admin', async () => {
    await act(async () => {
      root.render(React.createElement(TaskQueuePanel, { onClose: () => {}, settings: {}, userRole: 'owner', initialType: 'feature_request' }));
    });
    await flush();
    const title = [...container.querySelectorAll('div')].find(d => d.textContent === 'Sample feature request');
    await act(async () => { title.click(); });
    await flush();
    expect(container.querySelector('textarea')).toBeTruthy();
  });

  it('manager: dev_notes is read-only (no textarea; a plain "Dev notes:" line instead)', async () => {
    await act(async () => {
      root.render(React.createElement(TaskQueuePanel, { onClose: () => {}, settings: {}, userRole: 'manager', initialType: 'feature_request' }));
    });
    await flush();
    const title = [...container.querySelectorAll('div')].find(d => d.textContent === 'Sample feature request');
    await act(async () => { title.click(); });
    await flush();
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.textContent).toContain('Dev notes:');
    expect(container.textContent).toContain('internal-only commentary');
  });
});
