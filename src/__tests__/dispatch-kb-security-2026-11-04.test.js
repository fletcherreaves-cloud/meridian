// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-04: Security (src/views/security-panel.js) --
// the subject-grouped loss-prevention investigation surface -- had zero KB coverage. Added
// `security_guide` to KB_ARTICLES (src/engine/forecast.js), verified against the real
// securityPanelAccess() gating and verdictState() (flagged/clear/undetermined/hygiene) mapping.
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

describe('Knowledge Base — new security_guide article (task #75)', () => {
  it('is findable and explains the subject-grouping + four-verdict shape', () => {
    mount();
    openArticle('Subject-grouped results of a nightly cash/inventory/labor loss-prevention rules engine');
    expect(container.textContent).toContain('Flagged');
    expect(container.textContent).toContain('Undetermined');
    expect(container.textContent).toContain('Hygiene');
  });

  it('states the real gm_identity_reveal_enabled access gate', () => {
    mount();
    openArticle('Subject-grouped results of a nightly cash/inventory/labor loss-prevention rules engine');
    expect(container.textContent).toContain('org_config.gm_identity_reveal_enabled');
  });
});
