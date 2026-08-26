// Dispatch #148 — Performance Review continuity, Phase 1: real role/level system.
// Covers the extended DEFAULT_ROLES shape (7-rung reviewer-hierarchy ladder, see
// memory/plan-performance-review-continuity-2026-08-26.md decision #4/#6) and the new
// "N levels above" resolver (levelsAbove). Not covered here (out of scope for this dispatch,
// and not unit-testable from vitest at all): the schema.sql RLS policy changes -- see this
// dispatch's PR body for what to verify live against Supabase.
import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ROLES, ROLE_PERMISSION_TEMPLATES, ALL_PERMISSION_KEYS,
  levelsAbove, getRoleById, hasPermission, canManageRole, defaultPermissionsForLevel,
} from '../engine/permissions.js';

// The 7 rungs the plan doc's decision #4 (sharpened by #6) names explicitly, bottom to top:
// SM/AM/DM → GM → AS → OM → DO → VP → Owner/Developer.
const LADDER_IDS_BOTTOM_TO_TOP = ['sm_am_dm', 'gm', 'area_supervisor', 'om', 'do', 'vp', 'owner'];

describe('permissions.js — DEFAULT_ROLES shape', () => {
  it('contains all 7 review-hierarchy ladder rungs plus the pre-existing admin/manager utility roles', () => {
    const ids = DEFAULT_ROLES.map(r => r.id);
    for (const id of LADDER_IDS_BOTTOM_TO_TOP) expect(ids).toContain(id);
    expect(ids).toContain('admin');
    expect(ids).toContain('manager');
    expect(ids.length).toBe(9); // 7 ladder rungs + admin + manager, no duplicates
    expect(new Set(ids).size).toBe(ids.length); // every id is unique
  });

  it('every role has the existing level/label/color/system/permissions shape', () => {
    for (const role of DEFAULT_ROLES) {
      expect(typeof role.id).toBe('string');
      expect(typeof role.label).toBe('string');
      expect(typeof role.level).toBe('number');
      expect(typeof role.color).toBe('string');
      expect(typeof role.system).toBe('boolean');
      expect(role.permissions && typeof role.permissions).toBe('object');
      // Every permission key present, boolean-valued (no partial/missing toggles).
      for (const key of ALL_PERMISSION_KEYS) {
        expect(typeof role.permissions[key]).toBe('boolean');
      }
    }
  });

  it('the ladder is numerically monotonic bottom (least authority) to top (most authority)', () => {
    // "level: lower = more authority" -- walking the named ladder bottom-to-top, level must
    // never increase (it should strictly decrease or, at minimum, not go backwards).
    const levels = LADDER_IDS_BOTTOM_TO_TOP.map(id => getRoleById(id, DEFAULT_ROLES).level);
    for (let i = 1; i < levels.length; i++) {
      expect(levels[i]).toBeLessThan(levels[i - 1]);
    }
    expect(levels[levels.length - 1]).toBe(1); // owner/developer sits at the top, level 1
    expect(levels[0]).toBe(7);                 // sm_am_dm sits at the bottom, level 7
  });

  it('admin and manager are unchanged from the pre-dispatch 3-tier stub (id/level/color/system)', () => {
    const admin = getRoleById('admin', DEFAULT_ROLES);
    expect(admin).toMatchObject({ id: 'admin', level: 1, color: '#f59e0b', system: true });

    const manager = getRoleById('manager', DEFAULT_ROLES);
    expect(manager).toMatchObject({ id: 'manager', level: 3, color: '#22c55e', system: false });
  });

  it('area_supervisor is reused (same id) as the ladder\'s AS rung, not duplicated', () => {
    const matches = DEFAULT_ROLES.filter(r => r.id === 'area_supervisor');
    expect(matches.length).toBe(1);
  });

  it('level-1 roles (admin, owner) bypass all permission checks', () => {
    expect(hasPermission('admin', 'reviews.customize', DEFAULT_ROLES)).toBe(true);
    expect(hasPermission('owner', 'settings.edit', DEFAULT_ROLES)).toBe(true);
  });

  it('the bottom rung (sm_am_dm) cannot create, submit, or approve reviews', () => {
    const role = getRoleById('sm_am_dm', DEFAULT_ROLES);
    expect(role.permissions['reviews.view']).toBe(true);
    expect(role.permissions['reviews.create']).toBe(false);
    expect(role.permissions['reviews.submit']).toBe(false);
    expect(role.permissions['reviews.approve']).toBe(false);
  });

  it('ROLE_PERMISSION_TEMPLATES has a matching key for every DEFAULT_ROLES id', () => {
    for (const role of DEFAULT_ROLES) {
      expect(ROLE_PERMISSION_TEMPLATES).toHaveProperty(role.id);
    }
  });

  it('defaultPermissionsForLevel returns a fully-keyed template across the whole 1-7 range', () => {
    for (let level = 1; level <= 8; level++) {
      const perms = defaultPermissionsForLevel(level);
      for (const key of ALL_PERMISSION_KEYS) expect(typeof perms[key]).toBe('boolean');
    }
  });

  it('canManageRole respects the ladder ordering (owner manages down through sm_am_dm)', () => {
    expect(canManageRole('owner', 'vp', DEFAULT_ROLES)).toBe(true);
    expect(canManageRole('vp', 'do', DEFAULT_ROLES)).toBe(true);
    expect(canManageRole('do', 'om', DEFAULT_ROLES)).toBe(true);
    expect(canManageRole('om', 'area_supervisor', DEFAULT_ROLES)).toBe(true);
    expect(canManageRole('area_supervisor', 'gm', DEFAULT_ROLES)).toBe(true);
    expect(canManageRole('gm', 'sm_am_dm', DEFAULT_ROLES)).toBe(true);
    // Not the other direction.
    expect(canManageRole('sm_am_dm', 'gm', DEFAULT_ROLES)).toBe(false);
  });
});

describe('permissions.js — levelsAbove (N-levels-above resolver)', () => {
  it('returns the owner\'s own worked example: OM is 2 levels above GM', () => {
    // memory/plan-performance-review-continuity-2026-08-26.md decision #4, owner's own words:
    // "anyone 2 levels above the reviewed person. So if a GM is being reviewed then the
    // Supervisor does the review, The OM or DO or higher would be the only ones to override."
    expect(levelsAbove('gm', 'om', DEFAULT_ROLES)).toBe(2);
    expect(levelsAbove('gm', 'do', DEFAULT_ROLES)).toBe(3);
    expect(levelsAbove('gm', 'area_supervisor', DEFAULT_ROLES)).toBe(1); // direct reviewer, not "above"
  });

  it('is symmetric in magnitude and sign-flips when the args are swapped', () => {
    expect(levelsAbove('sm_am_dm', 'owner', DEFAULT_ROLES)).toBe(6);
    expect(levelsAbove('owner', 'sm_am_dm', DEFAULT_ROLES)).toBe(-6);
  });

  it('returns 0 for the same role compared to itself', () => {
    expect(levelsAbove('gm', 'gm', DEFAULT_ROLES)).toBe(0);
  });

  it('returns null when either role id is not found in the given ladder', () => {
    expect(levelsAbove('gm', 'nonexistent_role', DEFAULT_ROLES)).toBeNull();
    expect(levelsAbove('nonexistent_role', 'gm', DEFAULT_ROLES)).toBeNull();
    expect(levelsAbove('nonexistent_role', 'also_missing', DEFAULT_ROLES)).toBeNull();
  });

  it('defaults to DEFAULT_ROLES when no ladder is supplied', () => {
    expect(levelsAbove('gm', 'om')).toBe(2);
  });

  it('works against a caller-supplied subset ladder, not just the full DEFAULT_ROLES', () => {
    const reviewLadderOnly = DEFAULT_ROLES.filter(r => LADDER_IDS_BOTTOM_TO_TOP.includes(r.id));
    expect(levelsAbove('sm_am_dm', 'area_supervisor', reviewLadderOnly)).toBe(2);
    // admin/manager aren't in this subset ladder -- unresolvable against it even though they
    // exist in the full DEFAULT_ROLES.
    expect(levelsAbove('manager', 'gm', reviewLadderOnly)).toBeNull();
  });

  it('walks the full named ladder consistently end to end', () => {
    // Rung indices run bottom-to-top in LADDER_IDS_BOTTOM_TO_TOP, so a higher index means a
    // numerically lower (more authoritative) level -- levelsAbove(low, high) should equal the
    // index gap between them, positive when the second role sits above the first.
    for (let i = 0; i < LADDER_IDS_BOTTOM_TO_TOP.length; i++) {
      for (let j = 0; j < LADDER_IDS_BOTTOM_TO_TOP.length; j++) {
        expect(levelsAbove(LADDER_IDS_BOTTOM_TO_TOP[i], LADDER_IDS_BOTTOM_TO_TOP[j], DEFAULT_ROLES))
          .toBe(j - i);
      }
    }
  });
});
