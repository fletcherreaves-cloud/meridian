// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-11-09: "let's denote our findings... on the bounds of data collection
// available. Seems we have discovered most of them. Good not to lose. Also good for others to be
// able to find easily." Added `data_collection_bounds` to KB_ARTICLES (src/engine/forecast.js) --
// the index of every genuine upstream data floor measured across the project, cross-referenced
// against memory/data-collection-bounds-2026-11-09.md (the full-detail counterpart, which in turn
// cross-references each individual memory/finding-*.md). Verified findable through the real
// KnowledgeBasePanel search, same pattern dispatch-kb-data-manager-2026-11-03.test.js already
// established for a prior new article.
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

describe('Knowledge Base — new data_collection_bounds article (owner request 2026-11-09)', () => {
  it('is findable by searching "data collection" and opens to the real title', () => {
    mount();
    const search = container.querySelector('input');
    expect(search).toBeTruthy();
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    act(() => { setter.call(search, 'data collection'); search.dispatchEvent(new Event('input', { bubbles: true })); });
    expect(container.textContent).toContain('Data Collection Bounds');
    openArticle('Every measured, genuine upstream data floor');
    expect(container.textContent).toContain('what\'s genuinely unavailable, and why');
  });

  it('states the default assumption (backfill artifact, not a real floor) before listing exceptions', () => {
    mount();
    openArticle('Every measured, genuine upstream data floor');
    expect(container.textContent).toMatch(/data depth is never the limiter/i);
    expect(container.textContent).toContain('Treat anything NOT listed below as backfillable');
  });

  it('lists the real genuine floors by name -- LifeLenz OK, the emailed-stream floor, and the QSRSoft retention correction', () => {
    mount();
    openArticle('Every measured, genuine upstream data floor');
    expect(container.textContent).toMatch(/LifeLenz for Oklahoma begins Oct 2025/);
    expect(container.textContent).toMatch(/Emailed-stream hard floor at 2026-07-01/);
    expect(container.textContent).toMatch(/real floor sits between 2018-02 and 2019-09/);
    expect(container.textContent).toMatch(/Don't cite it as confirmed/);
  });

  it('distinguishes a real floor from a backfill artifact and from a per-store activation date, not just listing both as "limits"', () => {
    mount();
    openArticle('Every measured, genuine upstream data floor');
    expect(container.textContent).toMatch(/ebos_activation_date/);
    expect(container.textContent).toMatch(/not a vendor-side cutoff/);
    expect(container.textContent).toMatch(/backfillable/);
  });

  it('points to the full-detail memory doc rather than trying to be the only copy', () => {
    mount();
    openArticle('Every measured, genuine upstream data floor');
    expect(container.textContent).toContain('memory/data-collection-bounds-2026-11-09.md');
  });
});
