// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-04: Customer Complaints
// (src/views/customer-complaints.js) -- the raw Propel case feed behind the Complaint
// Contacts/100K review metric -- had zero KB coverage. Added `customer_complaints_guide` to
// KB_ARTICLES (src/engine/forecast.js), verified against the real filterComplaintCases() shape
// and the panel's own explicit "does NOT recompute the rate" footer text.
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

describe('Knowledge Base — new customer_complaints_guide article (task #75)', () => {
  it('is findable and states it is the raw feed, not the /100K rate', () => {
    mount();
    openArticle('Browse and search the raw Propel Customer Care case feed');
    expect(container.textContent).toContain('Complaint Contacts/100K');
    expect(container.textContent).toContain('review-engine.js');
  });

  it('describes the manual, on-demand capture scripts', () => {
    mount();
    openArticle('Browse and search the raw Propel Customer Care case feed');
    expect(container.textContent).toContain('browser-complaints-bulk-capture.js');
    expect(container.textContent).toContain('import-complaints-history.mjs');
  });
});
