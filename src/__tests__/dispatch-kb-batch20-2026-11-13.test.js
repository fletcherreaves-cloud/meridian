// @vitest-environment happy-dom
// @ts-nocheck
// Task #75 (Knowledge Base expansion), batch 20 — 2026-11-13.
//
// Re-measured the gap via a background fork before picking this batch: grepped literal
// `articleKey:'...'` usages across src/ against the real KB_ARTICLES keys (src/engine/
// forecast.js). Picked only the two high-confidence gaps the fork found with an unambiguous
// single mount point and no risk of duplicating an already-wired, more-specific article:
// - roles_and_permissions: the article exists (shipped under task #78) but had never been
//   wired to any InfoIcon anywhere — wired onto Admin Panel's Roles & Permissions tab.
// - locked_projections: wired onto At A Glance's weekly-projections table's "Lock" column
//   header (the actual UI the article explains).
// Left several other fork-flagged candidates (cash_os, drawer_open, condiment_pct,
// dialed_in vs. dialed_in_calibration, file_import_guide vs. data_manager_guide) deliberately
// unwired this batch — each needs either a real architectural look (security-panel.js's rule-
// card layout has no simple per-metric tile to attach an icon to) or a redundancy call between
// two overlapping articles that isn't this batch's to make casually.
//
// Per CLAUDE.md's "would this verification still pass if reverted?" rule: mounts the real
// AdminPanel, clicks to its real Roles & Permissions tab, clicks the real "?" InfoIcon, and
// asserts the real article title appears. Reverting the wiring makes the icon vanish and this
// test fails.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const h = React.createElement;

let container, root;
afterEach(() => {
  if (root) act(() => root.unmount());
  if (container) container.remove();
  container = null; root = null;
});

function mountEl(el) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => { root.render(el); });
}

function clickInfoIcon() {
  const icon = container.querySelector('span[title^="Click for details"]');
  expect(icon, 'InfoIcon "?" control not found').toBeTruthy();
  act(() => { icon.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('InfoIcon rollout batch 20 (2026-11-13)', () => {
  it('Roles & Permissions (roles_and_permissions) — Admin Panel, Roles & Permissions tab', async () => {
    const { AdminPanel } = await import('../views/admin.js');
    mountEl(h(AdminPanel, { onClose: () => {}, orgRoles: null, setOrgRoles: () => {}, userRole: 'owner' }));
    const rolesTabBtn = [...container.querySelectorAll('button')].find(b => b.textContent.includes('Roles & Permissions'));
    expect(rolesTabBtn, 'Roles & Permissions tab button not found').toBeTruthy();
    act(() => { rolesTabBtn.click(); });
    clickInfoIcon();
    expect(container.textContent).toContain('Roles & Default Permissions');
  });
});
