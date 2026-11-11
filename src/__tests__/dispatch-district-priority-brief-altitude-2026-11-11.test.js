// @vitest-environment happy-dom
// @ts-nocheck
// Task #132 Phase 1, recommendation #2 (owner request 2026-11-08, "small focused vs big
// picture"): District Priority Brief showed the identical flat per-store red/amber/green list to
// every role that can open it (area_supervisor/om/do/vp/owner/admin, all pass analytics.district).
// altitudeForRole's real mapping (curated-home.js) groups do with area_supervisor/om at 'patch'
// (NOT with vp/owner/admin at 'district' -- a draft of this recommendation assumed the opposite
// before dispatch-sage-role-voice-2026-11-11 corrected the mapping), so 'patch'-altitude roles
// keep today's unmodified per-store view by default; 'district'-altitude roles (VP/Owner/Admin)
// now default to the same stores pre-rolled by supervisor patch, one click from the full table.
//
// Drives the real exported DistrictPriorityBrief component end to end (not a private helper) --
// per this repo's "would this still pass if reverted" bar, a test that only checked a grouping
// function in isolation could pass unchanged with the component's own wiring to it deleted.
import { describe, it, expect, afterEach } from 'vitest';
import * as React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { DistrictPriorityBrief } from '../views/analytics.js';

// Two fake patches, deliberately NOT real store locs -- supervisorOf(loc, s.sup) falls back to
// the explicit `sup` field for any loc with no live/static assignment, so this fully controls
// the patch grouping without depending on real INV_ORG_COORDS data.
const STORES = [
  { loc: '91001', sup: 'Patch A', pSales: 100000, pLY: 90000, opsScore: 70, ctrlScore: 70,
    findings: [{ t: 'crit', m: 'CRITICAL — cash over short' }] },
  { loc: '91002', sup: 'Patch A', pSales: 50000, pLY: 50000, opsScore: 90, ctrlScore: 90,
    findings: [{ t: 'ok', m: 'STRENGTH — on target' }] },
  { loc: '91003', sup: 'Patch B', pSales: 80000, pLY: 85000, opsScore: 75, ctrlScore: 75,
    findings: [{ t: 'watch', m: 'WATCH — labor trending high' }] },
  { loc: '91004', sup: 'Patch B', pSales: 60000, pLY: 55000, opsScore: 88, ctrlScore: 88,
    findings: [{ t: 'ok', m: 'STRENGTH — on target' }] },
];

async function renderBrief(effectiveRole) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(DistrictPriorityBrief, {
      stores: STORES, ds: {}, settings: {}, userEvents: [],
      onSelectStore: () => {}, onClose: () => {}, effectiveRole,
    }));
  });
  return { container, root };
}

let mounted = [];
afterEach(() => {
  mounted.forEach(({ root, container }) => { act(() => { root.unmount(); }); container.remove(); });
  mounted = [];
});

describe('DistrictPriorityBrief — altitude-based default view (task #132 rec #2)', () => {
  it('a district-altitude role (VP) defaults to the supervisor-patch rollup, not the flat store list', async () => {
    const r = await renderBrief('vp');
    mounted.push(r);
    const text = r.container.textContent;
    expect(text).toContain('By Supervisor Patch');
    expect(text).toContain('Patch A');
    expect(text).toContain('Patch B');
    // The flat per-store section headers are not showing as the default view.
    expect(text).not.toContain('Action Required');
    expect(text).not.toContain('Watch Closely');
  });

  it('a patch-altitude role (OM) keeps today\'s unmodified flat per-store list as the default', async () => {
    const r = await renderBrief('om');
    mounted.push(r);
    const text = r.container.textContent;
    expect(text).toContain('Action Required');
    expect(text).toContain('Watch Closely');
    expect(text).toContain('Running Well');
    expect(text).not.toContain('By Supervisor Patch');
  });

  it('a patch-altitude role (DO) ALSO defaults to the flat list — do collapses to \'patch\', not \'district\'', async () => {
    const r = await renderBrief('do');
    mounted.push(r);
    expect(r.container.textContent).toContain('Action Required');
    expect(r.container.textContent).not.toContain('By Supervisor Patch');
  });

  it('clicking a patch card (VP view) drills into that patch\'s own flat store list, filtering out the other patch', async () => {
    const r = await renderBrief('vp');
    mounted.push(r);
    const patchAHeadline = [...r.container.querySelectorAll('div')]
      .find(d => d.children.length === 0 && d.textContent.trim() === '🚨 Patch A');
    expect(patchAHeadline, 'Patch A headline not found').toBeTruthy();
    await act(async () => {
      patchAHeadline.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const text = r.container.textContent;
    expect(text).not.toContain('By Supervisor Patch');
    expect(text).toContain('Action Required'); // Patch A's crit finding
    expect(text).toContain('Running Well');     // Patch A's ok finding
    expect(text).not.toContain('Watch Closely'); // Patch B's watch finding is filtered out
    expect(text).toContain('← All Patches');
  });

  it('the By Patch / By Store toggle stays reachable for a patch-altitude role too (depth never removed)', async () => {
    const r = await renderBrief('om');
    mounted.push(r);
    const toggle = [...r.container.querySelectorAll('button')].find(b => b.textContent === '📍 By Patch');
    expect(toggle, 'patch toggle button not found for OM').toBeTruthy();
    await act(async () => { toggle.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(r.container.textContent).toContain('By Supervisor Patch');
  });
});
