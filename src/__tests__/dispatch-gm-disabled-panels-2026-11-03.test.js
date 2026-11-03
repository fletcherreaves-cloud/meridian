// @ts-nocheck
// Owner-approved 2026-11-03 (memory/plan-role-based-panel-gating-2026-11-03.md): applying the
// GM disabledPanels recommendation drafted from the real GM/OM/Supervisor routines (prior
// operator, 2022). GM's DEFAULT_ROLES entry now carries 18 panel ids read as multi-store/
// strategic analytical tooling never named in the GM routine -- this is a pure trim on top of
// the existing analytics.store-gated panel set, not a new restriction mechanism (see
// isPanelEnabledForRole, dispatch-role-panel-toggles-2026-11-02.test.js).
import { describe, it, expect } from 'vitest';
import { DEFAULT_ROLES, isPanelEnabledForRole } from '../engine/permissions.js';
import { PANEL_BY_ID } from '../app/panel-registry.js';

const GM_DISABLED = ['pricing-engine', 'promo-roi', 'loc-intel', 'trends', 'signals', 'ranking',
  'conversion-efficiency', 'oil-efficiency', 'weather-impact', 'price-change-impact',
  'item-velocity', 'channel-mix', 'labor-opportunity-cost', 'cash-variance-pattern',
  'controls-food-cost-link', 'fob-reference-table', 'loss-prevention', 'custom-reports'];

// Direct-match panels the plan's own GM table names as "keep visible, no change needed" --
// these must stay reachable for a real GM (reverting the trim or over-widening it both fail
// this).
const GM_KEEP_VISIBLE = ['fob-analysis', 'fob-eom', 'eom-dashboard', 'count-cycle', 'inventory',
  'crew-schedule', 'sched-hub', 'security', 'customer-complaints', 'equipment-results',
  'perf-reviews', 'dt-sos', 'smg-voice', 'visit-readiness', 'graded-visits', 'task-queue',
  'one-pager', 'weekly-count-status'];

describe('GM disabledPanels — applied from the role-routines plan (2026-11-03)', () => {
  const gmRole = DEFAULT_ROLES.find(r => r.id === 'gm');

  it('every recommended panel id is a real, current panel-registry.js entry', () => {
    for (const id of GM_DISABLED) expect(PANEL_BY_ID[id], `unknown panel id: ${id}`).toBeTruthy();
    for (const id of GM_KEEP_VISIBLE) expect(PANEL_BY_ID[id], `unknown panel id: ${id}`).toBeTruthy();
  });

  it('DEFAULT_ROLES gm carries exactly the 18 recommended ids, nothing more or fewer', () => {
    expect(gmRole.disabledPanels).toBeTruthy();
    expect([...gmRole.disabledPanels].sort()).toEqual([...GM_DISABLED].sort());
  });

  it('isPanelEnabledForRole denies every panel on the trim list for gm', () => {
    for (const id of GM_DISABLED) expect(isPanelEnabledForRole(id, 'gm', DEFAULT_ROLES)).toBe(false);
  });

  it('isPanelEnabledForRole still allows every direct-match routine panel for gm', () => {
    for (const id of GM_KEEP_VISIBLE) expect(isPanelEnabledForRole(id, 'gm', DEFAULT_ROLES)).toBe(true);
  });

  it('the same trimmed panels stay fully visible to area_supervisor and om (no change for those roles)', () => {
    for (const id of GM_DISABLED) {
      expect(isPanelEnabledForRole(id, 'area_supervisor', DEFAULT_ROLES)).toBe(true);
      expect(isPanelEnabledForRole(id, 'om', DEFAULT_ROLES)).toBe(true);
    }
  });

  it('admin/owner (level-1) bypass the trim entirely, same as every other disabledPanels list', () => {
    for (const id of GM_DISABLED) {
      expect(isPanelEnabledForRole(id, 'admin', DEFAULT_ROLES)).toBe(true);
      expect(isPanelEnabledForRole(id, 'owner', DEFAULT_ROLES)).toBe(true);
    }
  });
});
