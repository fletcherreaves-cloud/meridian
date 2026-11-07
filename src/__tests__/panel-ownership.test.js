// @ts-nocheck
// Projection/Targets ownership (owner request 2026-11-07) -- see
// supabase/schema-panel-ownership-2026-11-07.sql's header comment for the full design.
// Pure logic only: canOwnPanel() (the gate) and ownerNotificationTargets() (who gets told).
import { describe, it, expect } from 'vitest';
import { canOwnPanel, ownerNotificationTargets } from '../engine/panel-ownership.js';

describe('canOwnPanel', () => {
  it('a role-baseline owner (DO/VP/Admin/Owner) passes with no grant at all', () => {
    expect(canOwnPanel('projections', 'do', [], 'user-1')).toBe(true);
    expect(canOwnPanel('projections', 'vp', null, 'user-1')).toBe(true);
    expect(canOwnPanel('projections', 'admin', [], null)).toBe(true);
  });

  it('a non-owner role with no grant fails', () => {
    expect(canOwnPanel('projections', 'gm', [], 'user-1')).toBe(false);
    expect(canOwnPanel('projections', 'om', [], 'user-1')).toBe(false);
  });

  it('a named grant lets a non-owner role through', () => {
    const grants = [{ panel_id: 'projections', user_id: 'user-1', revoked_at: null }];
    expect(canOwnPanel('projections', 'gm', grants, 'user-1')).toBe(true);
  });

  it('a REVOKED grant does not count', () => {
    const grants = [{ panel_id: 'projections', user_id: 'user-1', revoked_at: '2026-11-01T00:00:00Z' }];
    expect(canOwnPanel('projections', 'gm', grants, 'user-1')).toBe(false);
  });

  it('a grant for a DIFFERENT panel_id does not count (zones are separate)', () => {
    const grants = [{ panel_id: 'some-other-zone', user_id: 'user-1', revoked_at: null }];
    expect(canOwnPanel('projections', 'gm', grants, 'user-1')).toBe(false);
  });

  it('a grant for a DIFFERENT user does not count', () => {
    const grants = [{ panel_id: 'projections', user_id: 'user-2', revoked_at: null }];
    expect(canOwnPanel('projections', 'gm', grants, 'user-1')).toBe(false);
  });

  it('no userId and no role baseline always fails, even with grants present for someone else', () => {
    const grants = [{ panel_id: 'projections', user_id: 'user-2', revoked_at: null }];
    expect(canOwnPanel('projections', 'gm', grants, null)).toBe(false);
  });

  it('an unrecognized role id fails closed (matches hasPermission\'s own fail-closed contract)', () => {
    expect(canOwnPanel('projections', 'not_a_real_role', [], 'user-1')).toBe(false);
  });
});

describe('ownerNotificationTargets', () => {
  it('always includes the role baseline', () => {
    const { target_roles } = ownerNotificationTargets('projections', [], 'actor-1');
    expect(target_roles).toEqual(['admin', 'owner', 'vp', 'do']);
  });

  it('includes active grantees for this panel, excluding the actor', () => {
    const grants = [
      { panel_id: 'projections', user_id: 'actor-1', revoked_at: null },
      { panel_id: 'projections', user_id: 'grantee-2', revoked_at: null },
      { panel_id: 'projections', user_id: 'grantee-3', revoked_at: null },
    ];
    const { target_user_ids } = ownerNotificationTargets('projections', grants, 'actor-1');
    expect(target_user_ids).toEqual(expect.arrayContaining(['grantee-2', 'grantee-3']));
    expect(target_user_ids).not.toContain('actor-1');
    expect(target_user_ids.length).toBe(2);
  });

  it('excludes a revoked grantee', () => {
    const grants = [{ panel_id: 'projections', user_id: 'grantee-2', revoked_at: '2026-11-01T00:00:00Z' }];
    const { target_user_ids } = ownerNotificationTargets('projections', grants, 'actor-1');
    expect(target_user_ids).toBeNull();
  });

  it('excludes a grant for a different panel_id', () => {
    const grants = [{ panel_id: 'some-other-zone', user_id: 'grantee-2', revoked_at: null }];
    const { target_user_ids } = ownerNotificationTargets('projections', grants, 'actor-1');
    expect(target_user_ids).toBeNull();
  });

  it('de-duplicates a user_id granted more than once', () => {
    const grants = [
      { panel_id: 'projections', user_id: 'grantee-2', revoked_at: null },
      { panel_id: 'projections', user_id: 'grantee-2', revoked_at: null },
    ];
    const { target_user_ids } = ownerNotificationTargets('projections', grants, 'actor-1');
    expect(target_user_ids).toEqual(['grantee-2']);
  });

  it('returns null (not []) for target_user_ids when there are no active grantees', () => {
    const { target_user_ids } = ownerNotificationTargets('projections', [], 'actor-1');
    expect(target_user_ids).toBeNull();
  });

  it('handles a null/undefined grants list without throwing', () => {
    expect(() => ownerNotificationTargets('projections', null, 'actor-1')).not.toThrow();
    expect(() => ownerNotificationTargets('projections', undefined, 'actor-1')).not.toThrow();
  });
});
