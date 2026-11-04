// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-04: Task Queue (src/views/task-queue.js) -- the
// merged Task/Feature-Request ticket list, the GM routine's "SimpleThink fix-it-list" analog --
// had zero KB coverage. Added `task_queue_guide` to KB_ARTICLES (src/engine/forecast.js),
// verified against the real dual-table (tasks/feature_requests) normalization and T1/T2/T3 tiers.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { KnowledgeBasePanel } from '../engine/forecast.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
afterEach(() => { act(() => root.unmount()); container.remove(); });

function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root.render(React.createElement(KnowledgeBasePanel, { onClose: () => {} })));
}

function openArticle(matchText) {
  const entry = [...container.querySelectorAll('div')]
    .filter(d => d.textContent.includes(matchText)).pop();
  expect(entry, `article matching "${matchText}" not found`).toBeTruthy();
  act(() => { entry.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('Knowledge Base — new task_queue_guide article (task #75)', () => {
  it('is findable and explains the T1/T2/T3 task tiers', () => {
    mount();
    openArticle('One merged list for tiered internal work tickets');
    expect(container.textContent).toContain('T1');
    expect(container.textContent).toContain('T2');
    expect(container.textContent).toContain('T3');
  });

  it('states the two underlying tables are normalized into one shared shape', () => {
    mount();
    openArticle('One merged list for tiered internal work tickets');
    expect(container.textContent).toContain('tasks');
    expect(container.textContent).toContain('feature_requests');
  });
});
