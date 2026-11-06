// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), 2026-11-06 batch 5: 6 more real, traffic-relevant nav
// panels -- Printable Forms, Curated Home, Log Something (Quick-Capture), Above-Store One-Pager,
// Org Summary, Promo/Discount ROI, Count Cycle. Each verified against its own real source file
// before writing, per this repo's "measure, don't reason" standing rule.
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

describe('Knowledge Base — forms_print_guide (task #75)', () => {
  it('is findable and explains the fill-by-hand catalog', () => {
    mount();
    openArticle('Blank, fill-by-hand QSRSoft Pre-Shift Checklist');
    expect(container.textContent).toContain('Print / PDF');
    expect(container.textContent).toContain('Compact B&W');
  });

  it('explains the self-serve request-pull action', () => {
    mount();
    openArticle('Blank, fill-by-hand QSRSoft Pre-Shift Checklist');
    expect(container.textContent).toContain('Request pull');
    expect(container.textContent).toContain('trigger-dar-sync');
  });
});

describe('Knowledge Base — curated_home_guide (task #75)', () => {
  it('is findable and explains role-cascaded altitude', () => {
    mount();
    openArticle('role-voiced, format-customizable front door');
    expect(container.textContent).toContain('store altitude');
    expect(container.textContent).toContain('patch altitude');
    expect(container.textContent).toContain('district altitude');
  });

  it('states the format preference persists per user', () => {
    mount();
    openArticle('role-voiced, format-customizable front door');
    expect(container.textContent).toContain('curated_home_format');
    expect(container.textContent).toContain('user_settings');
  });
});

describe('Knowledge Base — quick_capture_guide (task #75)', () => {
  it('is findable and explains it writes through the same pipeline as Calendar', () => {
    mount();
    openArticle('always-reachable top-bar entry point');
    expect(container.textContent).toContain('saveOrgEvents()');
    expect(container.textContent).toContain('Events Calendar');
  });

  it('states the impact number is real, never invented', () => {
    mount();
    openArticle('always-reachable top-bar entry point');
    expect(container.textContent).toContain('never an invented placeholder');
    expect(container.textContent).toContain('no gamification');
  });
});

describe('Knowledge Base — above_store_guide (task #75)', () => {
  it('is findable and distinguishes Rollup from Leadership view', () => {
    mount();
    openArticle('build-your-own, printable rollup');
    expect(container.textContent).toContain('Rollup');
    expect(container.textContent).toContain('Leadership');
  });

  it('lists the eight toggleable panels', () => {
    mount();
    openArticle('build-your-own, printable rollup');
    expect(container.textContent).toContain('Upcoming Impacts');
    expect(container.textContent).toContain('Guest Voice');
  });
});

describe('Knowledge Base — operator_summary_guide (task #75)', () => {
  it('is findable and explains the four grouping modes', () => {
    mount();
    openArticle('cross-store comparison table, grouped by');
    expect(container.textContent).toContain('Operator');
    expect(container.textContent).toContain('Patch');
  });

  it('states TPPH/OEPE are weighted ratio-of-sums, not a plain average', () => {
    mount();
    openArticle('cross-store comparison table, grouped by');
    expect(container.textContent).toContain('metricSumRatio');
    expect(container.textContent).toContain('NOT a simple average');
  });
});

describe('Knowledge Base — promo_roi_guide (task #75)', () => {
  it('is findable and explains the matched-day design', () => {
    mount();
    openArticle('matched-day verdict on whether promotions');
    expect(container.textContent).toContain('org_events');
    expect(container.textContent).toContain('untagged days');
  });

  it('states Discounts is intentionally unscored, not a gap', () => {
    mount();
    openArticle('matched-day verdict on whether promotions');
    expect(container.textContent).toContain('intentionally left unscored');
  });
});

describe('Knowledge Base — count_cycle_guide (task #75)', () => {
  it('is findable and shares the same engine as Weekly Count Status', () => {
    mount();
    openArticle('exceptions-first weekly inventory-count compliance tab');
    expect(container.textContent).toContain('count-cycle.js');
    expect(container.textContent).toContain('cycleCompliance');
  });

  it('distinguishes this tab from the printable roster panel', () => {
    mount();
    openArticle('exceptions-first weekly inventory-count compliance tab');
    expect(container.textContent).toContain('Weekly Count Status');
  });
});
