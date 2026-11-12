// @vitest-environment happy-dom
// @ts-nocheck
// Owner request 2026-11-12: "Let's leave it the same for the panel manager, but for developer/
// admin role add a secondary toggle to disable systemwide." A SEPARATE, stronger gate than
// isPanelEnabledForRole's disabledPanels (dispatch-role-panel-toggles-2026-11-02.test.js) --
// that one is per-role and explicitly bypasses level-1 roles (admin/owner always see everything
// there, by design). This one has no bypass at all: a panel named here is off for literally
// everyone, including admin/owner, which is the actual "disable for everyone" the owner asked
// for in the original Panel Manager backlog item.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getGloballyDisabledPanels, saveGloballyDisabledPanels, isPanelGloballyEnabled,
  syncGloballyDisabledPanelsFromSupabase, pushGloballyDisabledPanelsToSupabase,
} from '../engine/permissions.js';

describe('isPanelGloballyEnabled / getGloballyDisabledPanels / saveGloballyDisabledPanels (permissions.js)', () => {
  const ORIGINAL = localStorage.getItem('mf_global_disabled_panels_v1');
  afterEach(() => {
    if (ORIGINAL == null) localStorage.removeItem('mf_global_disabled_panels_v1');
    else localStorage.setItem('mf_global_disabled_panels_v1', ORIGINAL);
  });

  it('defaults to an empty list (everything enabled) when nothing is persisted', () => {
    localStorage.removeItem('mf_global_disabled_panels_v1');
    expect(getGloballyDisabledPanels()).toEqual([]);
    expect(isPanelGloballyEnabled('district-lens')).toBe(true);
  });

  it('saveGloballyDisabledPanels persists, and a listed panel id reads disabled', () => {
    saveGloballyDisabledPanels(['district-lens']);
    expect(getGloballyDisabledPanels()).toEqual(['district-lens']);
    expect(isPanelGloballyEnabled('district-lens')).toBe(false);
    expect(isPanelGloballyEnabled('pmix')).toBe(true); // untouched panel stays on
  });

  it('isPanelGloballyEnabled accepts an explicit list (avoids a redundant localStorage read when the caller already has state)', () => {
    expect(isPanelGloballyEnabled('district-lens', ['district-lens'])).toBe(false);
    expect(isPanelGloballyEnabled('district-lens', [])).toBe(true);
  });

  // The whole point of this gate vs. isPanelEnabledForRole: NO level-1 bypass. Confirmed by
  // directly comparing against isPanelEnabledForRole's own documented admin/owner bypass
  // (dispatch-role-panel-toggles-2026-11-02.test.js's "level-1 roles always bypass" case) --
  // this function takes no roleId at all, so there is no role to bypass for.
  it('has no admin/owner bypass -- a globally-disabled panel reads disabled regardless of who is asking', () => {
    saveGloballyDisabledPanels(['district-lens']);
    // isPanelGloballyEnabled's signature doesn't even accept a role -- structurally, there is no
    // bypass path to take. Calling it any number of times gives the same false.
    expect(isPanelGloballyEnabled('district-lens')).toBe(false);
    expect(isPanelGloballyEnabled('district-lens')).toBe(false);
  });
});

describe('syncGloballyDisabledPanelsFromSupabase / pushGloballyDisabledPanelsToSupabase (permissions.js)', () => {
  afterEach(() => { localStorage.removeItem('mf_global_disabled_panels_v1'); });

  it('sync reads org_config key "globally_disabled_panels" and caches it to localStorage', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({ data: { data: ['pmix', 'why-engine'] } });
    const sb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) };
    const result = await syncGloballyDisabledPanelsFromSupabase(sb);
    expect(result).toEqual(['pmix', 'why-engine']);
    expect(getGloballyDisabledPanels()).toEqual(['pmix', 'why-engine']);
  });

  it('sync with no client, no rows, or a thrown error all resolve to null without crashing (fail-open to "nothing disabled")', async () => {
    expect(await syncGloballyDisabledPanelsFromSupabase(null)).toBe(null);
    const emptySb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null }) }) }) }) };
    expect(await syncGloballyDisabledPanelsFromSupabase(emptySb)).toBe(null);
    const throwingSb = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: () => Promise.reject(new Error('down')) }) }) }) };
    expect(await syncGloballyDisabledPanelsFromSupabase(throwingSb)).toBe(null);
  });

  it('push upserts the list to org_config under the same key, keyed for onConflict semantics', async () => {
    const upsert = vi.fn().mockResolvedValue({ error: null });
    const sb = { from: () => ({ upsert }) };
    await pushGloballyDisabledPanelsToSupabase(sb, ['district-lens']);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ key: 'globally_disabled_panels', data: ['district-lens'] }));
  });

  it('push with no client is a safe no-op', async () => {
    await expect(pushGloballyDisabledPanelsToSupabase(null, ['district-lens'])).resolves.toBeUndefined();
  });
});
