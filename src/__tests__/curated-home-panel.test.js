// @vitest-environment happy-dom
// @ts-nocheck
// Curated Home Phase 1 (memory/plan-overnight-notes-72-2026-11-06.md §2, task #92) -- the real
// render+interaction tests for CuratedHomePanel: proves the format picker actually switches
// renderers on real DOM output (not just that the pure helpers return the right data shape --
// src/__tests__/curated-home.test.js already covers that), and proves the per-user format
// preference round-trips through loadUserSetting/saveUserSetting the same way kpi_secs/
// ATTENTION_ACK already do (src/views/at-a-glance.js).
//
// Phase 2 (2026-11-07, task #106) replaced the old `.ch-dot` row + `<ul>`/`<li>` Bullets markup
// with a shared `.ch-item` tile (ItemCard) for BOTH Checklist and Bullets -- see
// memory/curated-home-phase2-2026-11-07.md. The three assertions below that checked for those
// old DOM shapes are updated to the new one; what they verify (real content renders, format
// switching works, a hydrated cloud preference renders correctly) is unchanged.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';

const loadUserSettingMock = vi.fn();
const saveUserSettingMock = vi.fn();
vi.mock('../lib/supabase.js', () => ({
  loadUserSetting: (...args) => loadUserSettingMock(...args),
  saveUserSetting: (...args) => saveUserSettingMock(...args),
}));

const BRIEF = {
  stores: [
    { loc: '3708', name: 'Ardmore-Broadway', hasData: true, flags: [
      { id: 'DRAWER_OPENS', name: 'Cash Integrity Risk', icon: '💰', category: 'controls',
        severity: 'RED', headline: '19 drawer opens — HIGH cash integrity risk',
        detail: 'Generic detail text.', action: 'Generic action text.' },
    ] },
  ],
  summary: { red: 1, amber: 0, green: 0, noData: 0, totalFlags: 1 },
};
vi.mock('../features/morning-brief.js', () => ({
  computeMorningBrief: () => BRIEF,
  getLatestBriefDate: () => new Date('2026-11-06T12:00:00'),
  useBriefDarByLoc: () => ({}),
}));

import { CuratedHomePanel } from '../views/curated-home.js';

let container, root;
beforeEach(() => {
  loadUserSettingMock.mockReset().mockResolvedValue(null);
  saveUserSettingMock.mockReset().mockResolvedValue(undefined);
  try { localStorage.clear(); } catch {}
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => { root.unmount(); });
  container.remove();
});

async function mount(props) {
  await act(async () => { root.render(React.createElement(CuratedHomePanel, props)); });
  await act(async () => { await Promise.resolve(); });
}

describe('CuratedHomePanel — real render', () => {
  // Game Plan (owner request 2026-11-07) is the new front-facing default at store altitude --
  // see curated-home-game-plan.test.js for its own dedicated coverage. This proves the SAME
  // real flag content still reaches Checklist once explicitly selected (the format picker is
  // always present, per "keep the other intact and make it optional for users").
  it('renders the real flag content in checklist format once explicitly selected', async () => {
    await mount({ ds: {}, settings: {}, role: 'gm', darRows: [] });
    const checklistBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Checklist');
    await act(async () => { checklistBtn.click(); });
    expect(container.textContent).toContain('19 drawer opens');
    expect(container.textContent).toContain('Ardmore-Broadway');
    expect(container.textContent).toContain('Store view'); // gm -> 'store' altitude label
    expect(container.querySelector('.ch-item')).toBeTruthy();
  });

  it('switches to bullets format on click, same underlying facts', async () => {
    await mount({ ds: {}, settings: {}, role: 'gm', darRows: [] });
    const bulletsBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Bullets');
    expect(bulletsBtn).toBeTruthy();
    await act(async () => { bulletsBtn.click(); });
    expect(container.querySelector('.ch-item')).toBeTruthy(); // Phase 2: tiles, same component as Checklist
    expect(container.textContent).toContain('19 drawer opens');
  });

  it('switches to narrative format on click, same underlying facts, as prose not itemization', async () => {
    await mount({ ds: {}, settings: {}, role: 'gm', darRows: [] });
    const narrBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Narrative');
    await act(async () => { narrBtn.click(); });
    expect(container.querySelector('p')).toBeTruthy();
    expect(container.textContent).toContain('19 drawer opens');
    expect(container.querySelector('.ch-item')).toBeFalsy(); // narrative is prose, not itemized tiles
  });

  it('persists the chosen format via saveUserSetting and localStorage', async () => {
    await mount({ ds: {}, settings: {}, role: 'gm', darRows: [] });
    const narrBtn = Array.from(container.querySelectorAll('button')).find(b => b.textContent === 'Narrative');
    await act(async () => { narrBtn.click(); });
    expect(saveUserSettingMock).toHaveBeenCalledWith('curated_home_format', 'narrative');
    expect(localStorage.getItem('mf_curated_home_format')).toBe('narrative');
  });

  it('hydrates a previously-saved format preference from the cloud on mount', async () => {
    loadUserSettingMock.mockResolvedValue('bullets');
    await mount({ ds: {}, settings: {}, role: 'gm', darRows: [] });
    expect(container.querySelector('.ch-item')).toBeTruthy();
  });

  it('shows patch-altitude framing for an area_supervisor', async () => {
    await mount({ ds: {}, settings: {}, role: 'area_supervisor', darRows: [] });
    expect(container.textContent).toContain('Patch view');
  });

  it('shows district-altitude framing for an admin', async () => {
    await mount({ ds: {}, settings: {}, role: 'admin', darRows: [] });
    expect(container.textContent).toContain('District view');
  });
});
