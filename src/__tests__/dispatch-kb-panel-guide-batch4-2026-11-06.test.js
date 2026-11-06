// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-06 batch: 6 more real, traffic-relevant nav
// panels named directly in the GM routine (memory/plan-role-based-panel-gating-2026-11-03.md
// §3's direct-match table) that had no article yet -- Inventory Intelligence, Speed of Service,
// Store One-Pager, Weekly Count Status, Digital Checklists, Forms Library. Each verified against
// its own real source file (src/views/*.js) before writing, per this repo's "measure, don't
// reason" standing rule.
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

describe('Knowledge Base — inventory_guide (task #75)', () => {
  it('is findable and explains the four-section layout', () => {
    mount();
    openArticle('Four-section usage/overstock/transfer report');
    expect(container.textContent).toContain('Service');
    expect(container.textContent).toContain('Production');
    expect(container.textContent).toContain('Overstock');
    expect(container.textContent).toContain('Transfers');
  });

  it('states manual upload only gap-fills, never overrides the cloud stream', () => {
    mount();
    openArticle('Four-section usage/overstock/transfer report');
    expect(container.textContent).toContain('qsr_inventory_summary');
    expect(container.textContent).toContain('GAP-FILLS');
  });
});

describe('Knowledge Base — speed_of_service_guide (task #75)', () => {
  it('is findable and names all four stations', () => {
    mount();
    openArticle('Order-to-serve by station');
    expect(container.textContent).toContain('Drive-Thru');
    expect(container.textContent).toContain('Front Counter');
    expect(container.textContent).toContain('Kitchen');
    expect(container.textContent).toContain('Beverage');
  });

  it('states Beverage has no calibrated per-store target', () => {
    mount();
    openArticle('Order-to-serve by station');
    expect(container.textContent).toContain('Beverage has no calibrated per-store target');
  });
});

describe('Knowledge Base — store_one_pager_guide (task #75)', () => {
  it('is findable and explains the KPI/target/status table', () => {
    mount();
    openArticle('A single-store, print-ready performance brief');
    expect(container.textContent).toContain('On Target');
    expect(container.textContent).toContain('Watch');
    expect(container.textContent).toContain('Off Track');
  });

  it('states the still-open business day is excluded from the averaging window', () => {
    mount();
    openArticle('A single-store, print-ready performance brief');
    expect(container.textContent).toContain('businessDate()');
  });
});

describe('Knowledge Base — weekly_count_status_guide (task #75)', () => {
  it('is findable and shares the same engine as Count Cycle', () => {
    mount();
    openArticle('A flat, printable district roster');
    expect(container.textContent).toContain('count-cycle.js');
    expect(container.textContent).toContain('cycleCompliance');
  });

  it('explains the count-day drift flag', () => {
    mount();
    openArticle('A flat, printable district roster');
    expect(container.textContent).toContain('real, sustained change, not a one-off');
  });
});

describe('Knowledge Base — digital_checklists_guide (task #75)', () => {
  it('is findable and explains the pull-script dependency', () => {
    mount();
    openArticle('A fillable, cloud-saved version of every QSRSoft checklist form');
    expect(container.textContent).toContain('qsrsoft-forms-pull.mjs');
  });

  it('distinguishes this panel from the blank/print-by-hand version', () => {
    mount();
    openArticle('A fillable, cloud-saved version of every QSRSoft checklist form');
    expect(container.textContent).toContain('FILLABLE companion');
  });
});

describe('Knowledge Base — forms_library_guide (task #75)', () => {
  it('is findable and states it generates blank forms only', () => {
    mount();
    openArticle('Blank, cascade-level leadership review forms');
    expect(container.textContent).toContain('BLANK forms only');
  });

  it('points to the Leadership One-Pager for live-filled numbers', () => {
    mount();
    openArticle('Blank, cascade-level leadership review forms');
    expect(container.textContent).toContain('Leadership One-Pager');
  });
});
