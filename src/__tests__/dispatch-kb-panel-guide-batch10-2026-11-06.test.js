// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-06 batch 10: the 4 remaining genuinely-uncovered
// kind:'nav' panels from the batch-9 panel-registry.js sweep -- Panel Manager, Settings,
// Troubleshooting, Local News. Two sweep hits from batch 9's candidate list ('help'/'admin')
// turned out to be panel-registry.js SECTIONS entries, not real panels -- excluded, not written
// up as empty guides. Each verified against its own real source file before writing, per this
// repo's "measure, don't reason" standing rule.
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

describe('Knowledge Base — panel_manager_guide (task #75)', () => {
  it('is findable and explains visibility is localStorage-only, per device', () => {
    mount();
    openArticle('Panel Manager — Panel Guide');
    expect(container.textContent).toContain('mf.optionalPanelVis');
    expect(container.textContent).toContain('per device/browser');
  });

  it('states hiding a panel never restricts access or deletes it', () => {
    mount();
    openArticle('Panel Manager — Panel Guide');
    expect(container.textContent).toContain('nothing is deleted');
  });
});

describe('Knowledge Base — settings_guide (task #75)', () => {
  it('is findable and explains settings sync to Supabase via app_settings', () => {
    mount();
    openArticle('Settings — Panel Guide');
    expect(container.textContent).toContain('pushConfigToSupabase');
    expect(container.textContent).toContain('app_settings');
  });

  it('states the Anthropic API key is the one deliberate localStorage-only exception', () => {
    mount();
    openArticle('Settings — Panel Guide');
    expect(container.textContent).toContain('mf_anthropic_key');
    expect(container.textContent).toContain('never reaches Supabase');
  });
});

describe('Knowledge Base — troubleshooting_guide (task #75)', () => {
  it('is findable and explains the End User / Developer mode split', () => {
    mount();
    openArticle('Troubleshooting — Panel Guide');
    expect(container.textContent).toContain('buildTroubleshootPrompt()');
    expect(container.textContent).toContain('STREAMS');
  });

  it('states Developer mode has no separate permission gate of its own', () => {
    mount();
    openArticle('Troubleshooting — Panel Guide');
    expect(container.textContent).toContain('no separate permission gate');
  });
});

describe('Knowledge Base — news_guide (task #75)', () => {
  it('is findable and explains the nine-outlet nightly pull + locality attribution', () => {
    mount();
    openArticle('Local News — Panel Guide');
    expect(container.textContent).toContain('news-rss-pull.mjs');
    expect(container.textContent).toContain('nine local outlets');
  });

  it('states this is explicitly not brand monitoring', () => {
    mount();
    openArticle('Local News — Panel Guide');
    expect(container.textContent).toContain('NOT being brand monitoring');
  });
});
