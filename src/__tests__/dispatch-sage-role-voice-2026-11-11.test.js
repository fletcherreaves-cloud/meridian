// @ts-nocheck
// Task #132 Phase 1, recommendation #1 (memory/plan-role-based-depth-tuning-2026-11-08.md) --
// SagePanel already received `userRole` as a prop (App.js) but never forwarded it into
// buildSystemPrompt, so CLAUDE.md's "role tunes the advice" line describing this as shipped
// was measurably false (confirmed by reading the function signature and its one call site
// before this fix, not inferred). buildSystemPrompt's 5th parameter now threads userRole
// through curated-home.js's own altitudeForRole -- the same store/patch/district collapse
// already proven in Curated Home + the Huddle, not a new role-voicing scheme.
//
// Per "would this verification still pass if reverted?": buildSystemPrompt ignored a 5th
// argument entirely before this change (and had none at all), so every assertion below fails
// against the pre-fix 4-arg signature -- a real regression test, not a tautology.
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../views/sage.js';

const ds = { loaded: false };

describe('SAGE system prompt — role-voice addendum (task #132 Phase 1)', () => {
  it('gives a GM/manager the tactical, single-store voice', () => {
    const prompt = buildSystemPrompt(ds, [], [], null, 'gm');
    expect(prompt).toContain('GM, AM, DM, or SM running one store day to day');
    expect(prompt).toContain('Skip district-wide comparisons');
  });

  it('gives Area Supervisor/OM/DO the patch voice (curated-home.js altitudeForRole\'s own mapping -- DO collapses to patch, not district)', () => {
    for (const role of ['area_supervisor', 'om', 'do']) {
      const prompt = buildSystemPrompt(ds, [], [], null, role);
      expect(prompt).toContain('Area Supervisor, Ops Manager, or District Ops lead covering a patch of stores');
    }
  });

  it('gives VP/Owner/Admin the district voice, with district-comparison framing', () => {
    for (const role of ['vp', 'owner', 'admin']) {
      const prompt = buildSystemPrompt(ds, [], [], null, role);
      expect(prompt).toContain('VP, Owner, or Admin thinking district-wide');
      expect(prompt).toContain('leading through supervisors');
    }
  });

  it('falls back to the store (most conservative) voice for an unknown/missing role', () => {
    const prompt = buildSystemPrompt(ds, [], [], null, undefined);
    expect(prompt).toContain('GM, AM, DM, or SM running one store day to day');
  });
});
