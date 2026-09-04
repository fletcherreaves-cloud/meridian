// @vitest-environment happy-dom
// @ts-nocheck
// Phase 2 of memory/project-events-calendar-redesign-2026-09-04.md, item 7 — recurring event
// rules (localStorage 'mf_recurring_rules') were device-local only, invisible on another device
// or after a reinstall. saveRecurringRules (src/features/calendar.js) now also pushes to the
// generic user_settings cloud store under key 'recurring_rules' -- the same mechanism
// model_assignments already uses (CLAUDE.md's own cited template for this exact migration
// shape). App.js's _stRecurringRules hydrates localStorage from that cloud value on startup.
//
// Per "would this verification still pass if reverted?": asserts saveUserSetting is actually
// called with the real rules array on every save call site's shape (add/update/delete), not just
// that saveRecurringRules doesn't throw -- a revert that drops the saveUserSetting call fails
// these tests specifically.
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/supabase.js', () => ({
  supabase: null,
  saveOrgEvents: vi.fn(() => Promise.resolve({ saved: 0, errors: [] })),
  saveOrgSchoolConfig: vi.fn(),
  updateOrgEvent: vi.fn(),
  deleteOrgEvent: vi.fn(),
  saveUserSetting: vi.fn(() => Promise.resolve()),
  loadUserSetting: vi.fn(() => Promise.resolve(null)),
}));

import { saveUserSetting } from '../lib/supabase.js';
import { loadRecurringRules, saveRecurringRules } from '../features/calendar.js';

const RULE = { id: 'r1', label: 'Spring Break', type: 'school_break', locs: ['3708'], month: 3, day: 10, durationDays: 5, active: true, source: 'manual', createdAt: '2026-01-01T00:00:00Z' };

describe('saveRecurringRules — cloud persistence', () => {
  beforeEach(() => { localStorage.clear(); saveUserSetting.mockClear(); });

  it('writes to localStorage (unchanged, still the instant read path)', () => {
    saveRecurringRules([RULE]);
    expect(loadRecurringRules()).toEqual([RULE]);
  });

  it('also pushes the exact same rules array to the cloud under key "recurring_rules"', () => {
    saveRecurringRules([RULE]);
    expect(saveUserSetting).toHaveBeenCalledTimes(1);
    expect(saveUserSetting).toHaveBeenCalledWith('recurring_rules', [RULE]);
  });

  it('pushes an empty array too (a rule was deleted down to zero), not just non-empty saves', () => {
    saveRecurringRules([]);
    expect(saveUserSetting).toHaveBeenCalledWith('recurring_rules', []);
  });

  it('a saveUserSetting rejection does not throw or block the localStorage write', () => {
    saveUserSetting.mockImplementationOnce(() => Promise.reject(new Error('offline')));
    expect(() => saveRecurringRules([RULE])).not.toThrow();
    expect(loadRecurringRules()).toEqual([RULE]);
  });
});
