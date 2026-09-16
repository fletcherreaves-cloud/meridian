// @vitest-environment happy-dom
// @ts-nocheck
// Panel-contract round 2 (Task #72) -- LogIssueModal (src/views/sage.js) was a hand-rolled
// backdrop/card, the exact pattern src/__tests__/ratchet-modal-backdrop-bypass.test.js's R7
// flags. Converted to ModalShell; this test renders the REAL component (not a description of
// the change) so a reverted wiring would actually fail here, per this repo's "would this
// verification still pass if the change were reverted" rule.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

vi.mock('../lib/supabase.js', () => ({
  saveTask: vi.fn(),
  saveFeatureRequest: vi.fn(),
  supabase: null,
  loadSagePrompts: vi.fn(), saveSagePrompt: vi.fn(), deleteSagePrompt: vi.fn(),
  updateSagePromptSchedule: vi.fn(), setSagePromptShared: vi.fn(), searchQsrKb: vi.fn(),
}));

import { saveTask, saveFeatureRequest } from '../lib/supabase.js';
import { LogIssueModal } from '../views/sage.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe('LogIssueModal renders on ModalShell (round-2 panel-contract conversion)', () => {
  let container, root;
  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
    vi.clearAllMocks();
  });

  it('renders title, both destination options, and closes on Cancel -- the real props/behavior, not a description of them', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(React.createElement(LogIssueModal, {
        question: 'Why is FOB blank for Store 5?', answer: 'That data source failed to load.',
        conversation: '', onClose,
      }));
    });

    expect(container.textContent).toContain('Log this as an issue');
    expect(container.textContent).toContain('Task Queue');
    expect(container.textContent).toContain('Feature Request');
    // ModalShell's own '✕' close button, not a hand-rolled one -- confirms the real shell is in
    // the tree, not just visually similar markup.
    const closeBtn = [...container.querySelectorAll('button')].find(b => b.textContent === '✕');
    expect(closeBtn).toBeTruthy();

    const cancelBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Cancel');
    await act(async () => { cancelBtn.click(); });
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking the backdrop closes the modal (closeOnBackdrop) but clicking inside the card does not', async () => {
    const onClose = vi.fn();
    await act(async () => {
      root.render(React.createElement(LogIssueModal, { question: 'q', answer: 'a', conversation: '', onClose }));
    });

    const card = container.querySelector('input').closest('div[style]'); // inner card wraps the form
    await act(async () => { card.click(); });
    expect(onClose).not.toHaveBeenCalled();

    const backdrop = container.firstChild;
    await act(async () => { backdrop.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(onClose).toHaveBeenCalled();
  });

  it('Create saves to the selected destination via the real save functions (failure-language answer defaults to Task Queue)', async () => {
    saveTask.mockResolvedValue({ errors: [] });
    const onClose = vi.fn();
    await act(async () => {
      root.render(React.createElement(LogIssueModal, {
        question: 'Missing SMG data', answer: 'Could not find that metric.', conversation: '', onClose,
      }));
    });
    const createBtn = [...container.querySelectorAll('button')].find(b => b.textContent === 'Create');
    await act(async () => { createBtn.click(); });
    expect(saveTask).toHaveBeenCalled();
  });
});
