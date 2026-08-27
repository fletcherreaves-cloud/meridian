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
  REVIEW_ROLE_TO_LADDER, canOverrideLockedActual, canApproveDeparture, mergeMissingDefaultRoles,
  reconcileLadderLevels,
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

// Dispatch #149 — Performance Review continuity, Phase 2: locked auto-populated actuals +
// reason-required override. Covers REVIEW_ROLE_TO_LADDER (review-engine ROLE_KEYS -> ladder id)
// and canOverrideLockedActual (the full client-side authorization check: levelsAbove >= 2, PLUS
// the unconditional admin/owner escape hatch). The real enforcement boundary is
// supabase/schema.sql's review_overrides RLS insert policy, not unit-testable from vitest — see
// this dispatch's PR body for what to verify live.
describe('permissions.js — REVIEW_ROLE_TO_LADDER', () => {
  it('maps every review-engine ROLE_KEYS value to a real DEFAULT_ROLES id', () => {
    for (const ladderId of Object.values(REVIEW_ROLE_TO_LADDER)) {
      expect(getRoleById(ladderId, DEFAULT_ROLES)).not.toBeNull();
    }
  });

  it('AM/DM/SM all collapse onto the single sm_am_dm rung (plan doc decision #5)', () => {
    expect(REVIEW_ROLE_TO_LADDER.AM).toBe('sm_am_dm');
    expect(REVIEW_ROLE_TO_LADDER.DM).toBe('sm_am_dm');
    expect(REVIEW_ROLE_TO_LADDER.SM).toBe('sm_am_dm');
  });

  it('GM/AS/OM each map to their own distinct rung, not sm_am_dm', () => {
    expect(REVIEW_ROLE_TO_LADDER.GM).toBe('gm');
    expect(REVIEW_ROLE_TO_LADDER.AS).toBe('area_supervisor');
    expect(REVIEW_ROLE_TO_LADDER.OM).toBe('om');
  });
});

describe('permissions.js — canOverrideLockedActual', () => {
  // Owner's own worked example (plan doc decision #4): "anyone 2 levels above the reviewed
  // person. So if a GM is being reviewed then the Supervisor does the review, The OM or DO or
  // higher would be the only ones to override a result."
  it('allows OM (2 levels above a GM review) to override', () => {
    expect(canOverrideLockedActual('om', 'GM', DEFAULT_ROLES)).toBe(true);
  });

  it('allows DO (3 levels above a GM review, "or higher") to override', () => {
    expect(canOverrideLockedActual('do', 'GM', DEFAULT_ROLES)).toBe(true);
  });

  it('NEGATIVE CASE: rejects the direct reviewer (1 level above, area_supervisor) for a GM review', () => {
    // This is exactly the case the owner's example calls out as NOT sufficient — the GM's own
    // reviewer (Supervisor/AS) does the review, but does not have override authority.
    expect(canOverrideLockedActual('area_supervisor', 'GM', DEFAULT_ROLES)).toBe(false);
  });

  it('NEGATIVE CASE: rejects a peer (0 levels — same rung) and rejects someone BELOW', () => {
    expect(canOverrideLockedActual('gm', 'GM', DEFAULT_ROLES)).toBe(false);
    expect(canOverrideLockedActual('sm_am_dm', 'GM', DEFAULT_ROLES)).toBe(false);
  });

  it('unconditional admin/owner escape hatch overrides EVEN AT 1 level or 0 levels (decision #6-C)', () => {
    expect(canOverrideLockedActual('admin', 'GM', DEFAULT_ROLES)).toBe(true);
    expect(canOverrideLockedActual('owner', 'GM', DEFAULT_ROLES)).toBe(true);
    // Even directly against the bottom rung, where the ladder distance is enormous anyway --
    // the point is admin/owner never depend on the ladder math at all.
    expect(canOverrideLockedActual('admin', 'AM', DEFAULT_ROLES)).toBe(true);
  });

  it('works across the whole review-role set with the correct 2-levels-above rung for each', () => {
    // AM/DM/SM -> sm_am_dm (level 7): 2 above is area_supervisor (level 5).
    expect(canOverrideLockedActual('area_supervisor', 'AM', DEFAULT_ROLES)).toBe(true);
    expect(canOverrideLockedActual('gm', 'AM', DEFAULT_ROLES)).toBe(false); // only 1 level above
    // AS -> area_supervisor (level 5): 2 above is do (level 3).
    expect(canOverrideLockedActual('do', 'AS', DEFAULT_ROLES)).toBe(true);
    expect(canOverrideLockedActual('om', 'AS', DEFAULT_ROLES)).toBe(false); // only 1 level above
    // OM -> om (level 4): 2 above is vp (level 2).
    expect(canOverrideLockedActual('vp', 'OM', DEFAULT_ROLES)).toBe(true);
    expect(canOverrideLockedActual('do', 'OM', DEFAULT_ROLES)).toBe(false); // only 1 level above
  });

  it('returns false for an unrecognized review role (no ladder mapping) even for a high caller role', () => {
    expect(canOverrideLockedActual('vp', 'NOT_A_REAL_ROLE', DEFAULT_ROLES)).toBe(false);
  });

  it('returns false for an unrecognized caller role id that is not admin/owner', () => {
    expect(canOverrideLockedActual('not_a_real_role', 'GM', DEFAULT_ROLES)).toBe(false);
  });

  it('defaults to DEFAULT_ROLES when no ladder is supplied', () => {
    expect(canOverrideLockedActual('om', 'GM')).toBe(true);
    expect(canOverrideLockedActual('area_supervisor', 'GM')).toBe(false);
  });
});

// Dispatch #162 — Performance Review continuity, build item #6: departure/termination handling.
// Plan doc resolved item B, owner's own words: "Do the auto finalize but require approval in the
// ability to override it. The approval and potential override should come from a job title code
// qualified to perform the review or above." canApproveDeparture is built from the EXACT SAME
// primitives as canOverrideLockedActual above (levelsAbove/REVIEW_ROLE_TO_LADDER/admin-owner
// escape hatch) but gated at >=1 rung, not >=2 — "qualified to perform the review" IS the direct
// reviewer (1 level above), unlike canOverrideLockedActual's stricter "override a locked actual"
// bar. canOverrideLockedActual itself is unchanged (asserted above, still passing) — this is a new
// sibling function, not a modification of decision #4's existing mechanism.
describe('permissions.js — canApproveDeparture (dispatch #162)', () => {
  it('allows the direct reviewer (1 level above a GM review, area_supervisor) — the qualified case canOverrideLockedActual explicitly rejects', () => {
    expect(canApproveDeparture('area_supervisor', 'GM', DEFAULT_ROLES)).toBe(true);
    expect(canOverrideLockedActual('area_supervisor', 'GM', DEFAULT_ROLES)).toBe(false); // unchanged, still stricter
  });

  it('allows anyone further above too (OM, DO, VP, Owner — "or above")', () => {
    expect(canApproveDeparture('om', 'GM', DEFAULT_ROLES)).toBe(true);
    expect(canApproveDeparture('do', 'GM', DEFAULT_ROLES)).toBe(true);
    expect(canApproveDeparture('vp', 'GM', DEFAULT_ROLES)).toBe(true);
  });

  it('NEGATIVE CASE: rejects a peer (0 levels — same rung) and rejects someone BELOW', () => {
    expect(canApproveDeparture('gm', 'GM', DEFAULT_ROLES)).toBe(false);
    expect(canApproveDeparture('sm_am_dm', 'GM', DEFAULT_ROLES)).toBe(false);
  });

  it('unconditional admin/owner escape hatch applies here too (decision #6-C, same as canOverrideLockedActual)', () => {
    expect(canApproveDeparture('admin', 'GM', DEFAULT_ROLES)).toBe(true);
    expect(canApproveDeparture('owner', 'GM', DEFAULT_ROLES)).toBe(true);
  });

  it('works across the whole review-role set with the correct 1-level-above rung for each', () => {
    // AM/DM/SM -> sm_am_dm (level 7): 1 above is gm (level 6).
    expect(canApproveDeparture('gm', 'AM', DEFAULT_ROLES)).toBe(true);
    expect(canApproveDeparture('sm_am_dm', 'AM', DEFAULT_ROLES)).toBe(false); // 0 levels, a peer
    // AS -> area_supervisor (level 5): 1 above is om (level 4).
    expect(canApproveDeparture('om', 'AS', DEFAULT_ROLES)).toBe(true);
    expect(canApproveDeparture('area_supervisor', 'AS', DEFAULT_ROLES)).toBe(false);
    // OM -> om (level 4): 1 above is do (level 3).
    expect(canApproveDeparture('do', 'OM', DEFAULT_ROLES)).toBe(true);
    expect(canApproveDeparture('om', 'OM', DEFAULT_ROLES)).toBe(false);
  });

  it('returns false for an unrecognized review role (no ladder mapping) even for a high caller role', () => {
    expect(canApproveDeparture('vp', 'NOT_A_REAL_ROLE', DEFAULT_ROLES)).toBe(false);
  });

  it('returns false for an unrecognized caller role id that is not admin/owner', () => {
    expect(canApproveDeparture('not_a_real_role', 'GM', DEFAULT_ROLES)).toBe(false);
  });

  it('defaults to DEFAULT_ROLES when no ladder is supplied', () => {
    expect(canApproveDeparture('area_supervisor', 'GM')).toBe(true);
    expect(canApproveDeparture('gm', 'GM')).toBe(false);
  });
});

// A live production bug found 2026-08-26 (during dispatch #151 verification): a persisted
// org-configured role list saved BEFORE dispatch #148 added the 7-rung ladder never picked up
// any of the new roles (vp/do/om/gm/sm_am_dm/owner) -- getOrgRoles()/syncOrgRolesFromSupabase()
// always preferred the persisted list wholesale, silently masking every ladder id missing from
// it. mergeMissingDefaultRoles() is the additive fix.
describe('mergeMissingDefaultRoles()', () => {
  it('appends every DEFAULT_ROLES id missing from a stale persisted list, leaving existing entries untouched', () => {
    const stale = [
      { id: 'admin', label: 'Admin', level: 1, color: '#f59e0b', system: true, permissions: {} },
      { id: 'area_supervisor', label: 'Area Supervisor', level: 3, color: '#3b82f6', system: false, permissions: {} },
      { id: 'manager', label: 'Manager', level: 4, color: '#22c55e', system: false, permissions: {} },
      // A stray custom role a user added by hand before #148 shipped the real 'owner' id --
      // must survive untouched (never deduped/renamed/removed by the merge).
      { id: 'owner_0nct', label: 'Owner', level: 2, color: '#ef4444', system: false, permissions: {} },
    ];
    const merged = mergeMissingDefaultRoles(stale);

    // Every DEFAULT_ROLES id now present.
    const mergedIds = merged.map(r => r.id);
    for (const r of DEFAULT_ROLES) expect(mergedIds).toContain(r.id);

    // Every original entry survives byte-for-byte at its original position, including the stray
    // custom role -- the merge only ever appends, never edits or removes.
    expect(merged.slice(0, stale.length)).toEqual(stale);

    // Newly-appended entries are real DEFAULT_ROLES objects (not references -- independently
    // mutable), for every ladder id the stale list didn't already have.
    for (const id of ['vp', 'do', 'om', 'gm', 'sm_am_dm', 'owner']) {
      const appended = merged.find(r => r.id === id);
      const canonical = DEFAULT_ROLES.find(r => r.id === id);
      expect(appended).toEqual(canonical);
    }
  });

  it('is a no-op when the persisted list already has every DEFAULT_ROLES id', () => {
    const full = DEFAULT_ROLES.map(r => ({ ...r, permissions: { ...r.permissions } }));
    const merged = mergeMissingDefaultRoles(full);
    expect(merged).toEqual(full);
    expect(merged.length).toBe(DEFAULT_ROLES.length);
  });

  it('never mutates the DEFAULT_ROLES module-level constant', () => {
    const before = JSON.stringify(DEFAULT_ROLES);
    mergeMissingDefaultRoles([{ id: 'admin', label: 'Admin', level: 1, color: '#000', system: true, permissions: {} }]);
    expect(JSON.stringify(DEFAULT_ROLES)).toBe(before);
  });
});

// A second real production bug found the same day, alongside the masking one above: a persisted
// role list can already contain a ladder id (so mergeMissingDefaultRoles() correctly leaves it
// alone -- it isn't missing) but at a STALE pre-#148 level. Confirmed live: area_supervisor
// persisted at level 3 (its pre-ladder value) made it outrank OM (level 4) -- backwards from the
// real AS -> OM -> DO -> VP -> Owner chain. reconcileLadderLevels() is the fix.
describe('reconcileLadderLevels()', () => {
  it('corrects a stale level for a ladder role id to the canonical DEFAULT_ROLES value', () => {
    const stale = [
      { id: 'admin', label: 'Admin', level: 1, color: '#f59e0b', system: true, permissions: {} },
      // Pre-#148 level (3) -- canonical is 5. This is the exact live bug: AS outranking OM.
      { id: 'area_supervisor', label: 'Area Supervisor', level: 3, color: '#3b82f6', system: false, permissions: {} },
      { id: 'om', label: 'OM (Ops Manager)', level: 4, color: '#0ea5e9', system: true, permissions: {} },
    ];
    const fixed = reconcileLadderLevels(stale);
    const as = fixed.find(r => r.id === 'area_supervisor');
    const om = fixed.find(r => r.id === 'om');
    expect(as.level).toBe(5); // canonical DEFAULT_ROLES value
    expect(om.level).toBe(4);
    expect(om.level).toBeLessThan(as.level); // OM correctly outranks AS again (lower = more authority)
    // Non-level fields on the corrected role are untouched -- only `level` is reconciled.
    expect(as.label).toBe('Area Supervisor');
    expect(as.color).toBe('#3b82f6');
  });

  it('never touches admin or manager, even when their level differs from DEFAULT_ROLES -- both are excluded by design', () => {
    const roles = [
      { id: 'admin', label: 'Admin', level: 1, color: '#f59e0b', system: true, permissions: {} },
      // manager's persisted level (4) differs from DEFAULT_ROLES' (3) in production too --
      // deliberately NOT reconciled, since #148 kept manager "exactly as it was".
      { id: 'manager', label: 'Manager', level: 4, color: '#22c55e', system: false, permissions: {} },
    ];
    const fixed = reconcileLadderLevels(roles);
    expect(fixed).toEqual(roles); // byte-for-byte unchanged
  });

  it('is a no-op for a role whose level already matches DEFAULT_ROLES, and for an unrecognized custom role id', () => {
    const roles = [
      { id: 'gm', label: 'GM (General Manager)', level: 6, color: '#14b8a6', system: true, permissions: {} },
      { id: 'some_custom_role', label: 'Custom', level: 9, color: '#000', system: false, permissions: {} },
    ];
    expect(reconcileLadderLevels(roles)).toEqual(roles);
  });

  it('composes with mergeMissingDefaultRoles() to fully repair a stale pre-#148 persisted list', () => {
    const staleProduction = [
      { id: 'admin', label: 'Admin', level: 1, color: '#f59e0b', system: true, permissions: {} },
      { id: 'area_supervisor', label: 'Area Supervisor', level: 3, color: '#3b82f6', system: false, permissions: {} },
      { id: 'manager', label: 'Manager', level: 4, color: '#22c55e', system: false, permissions: {} },
    ];
    const repaired = reconcileLadderLevels(mergeMissingDefaultRoles(staleProduction));
    const byId = Object.fromEntries(repaired.map(r => [r.id, r]));
    // Every DEFAULT_ROLES ladder id present, at its canonical level.
    for (const r of DEFAULT_ROLES) {
      if (r.id === 'admin' || r.id === 'manager') continue;
      expect(byId[r.id]).toBeTruthy();
      expect(byId[r.id].level).toBe(r.level);
    }
    // manager keeps its persisted (stale) level -- excluded by design, not a bug in this composition.
    expect(byId.manager.level).toBe(4);
    // The full reporting chain is now correctly ordered, lower level = more authority.
    expect(byId.om.level).toBeLessThan(byId.area_supervisor.level);
    expect(byId.do.level).toBeLessThan(byId.om.level);
    expect(byId.vp.level).toBeLessThan(byId.do.level);
    expect(byId.owner.level).toBeLessThan(byId.vp.level);
    expect(byId.area_supervisor.level).toBeLessThan(byId.gm.level);
    expect(byId.gm.level).toBeLessThan(byId.sm_am_dm.level);
  });
});
