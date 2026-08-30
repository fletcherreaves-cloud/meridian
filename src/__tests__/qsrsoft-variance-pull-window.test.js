// @ts-nocheck
// Dispatch #210 -- a REAL behavioral test of qsrsoft-variance-pull.mjs's new window-gate
// (runMode/isDailySlot), not just a source-text regex, per CLAUDE.md's "would this
// verification still pass if the change were reverted?" standing rule. The script is
// guarded the same way qsrsoft-punch-times-pull.mjs already is
// (`if (import.meta.url === file://process.argv[1])`), so importing it for its exported
// pure functions does not also fire off a live Playwright/eBOS run.
//
// No dummy env vars needed: qsrsoft-variance-pull.mjs's module-scope `supabase` const goes
// through safeCreateClient (scripts/lib/safe-supabase-client.mjs), which never throws regardless
// of what's in process.env at import time — see that helper's own header for the real CI
// incident (env-var leakage across test files sharing a Vitest worker) this closes.
import { describe, it, expect } from 'vitest';
import { runMode, isDailySlot } from '../../scripts/qsrsoft-variance-pull.mjs';

describe('qsrsoft-variance-pull.mjs runMode() -- dispatch #210 window-gate', () => {
  it('accelerates to hourly during the count window, inside CT business hours', () => {
    // 2026-08-29 15:00 UTC == 10:00 CDT, and Aug 29 is within the last 3 days of Aug (31 days)
    expect(runMode(new Date('2026-08-29T15:00:00Z'))).toBe('count-window');
  });

  it('skips during the count window but OUTSIDE CT business hours (e.g. 2am CDT)', () => {
    // 2026-08-29 07:00 UTC == 02:00 CDT -- still the count window, not business hours
    expect(runMode(new Date('2026-08-29T07:00:00Z'))).toBe(null);
  });

  it('falls back to the once-daily slot outside the count window', () => {
    // 2026-08-15 -- nowhere near month-end; 11:00 UTC is inside the 10:00-12:00 daily slot
    expect(runMode(new Date('2026-08-15T11:00:00Z'))).toBe('daily');
  });

  it('skips outside the count window AND outside the daily slot', () => {
    // 2026-08-15 20:00 UTC -- mid-month, mid-afternoon, well outside the 10-12 UTC slot
    expect(runMode(new Date('2026-08-15T20:00:00Z'))).toBe(null);
  });

  it('never changes cadence outside the last-3-days window even though the cron now fires hourly', () => {
    // Simulate the new hourly cron (":15" every hour) landing at an off-slot hour mid-month --
    // this is exactly the case the workflow's own YAML comment promises stays a no-op.
    const offSlotHours = [0, 3, 6, 9, 13, 16, 19, 22];
    for (const h of offSlotHours) {
      const at = new Date(Date.UTC(2026, 7, 15, h, 15)); // Aug 15, mid-month
      expect(runMode(at), `hour ${h} UTC mid-month should skip`).toBe(null);
    }
  });
});

describe('isDailySlot() -- the WINDOW around the once-daily 10:30 UTC slot', () => {
  it('true across the whole default [10,12) UTC window, not just the exact historical minute', () => {
    expect(isDailySlot(new Date('2026-08-15T10:00:00Z'))).toBe(true);
    expect(isDailySlot(new Date('2026-08-15T10:30:00Z'))).toBe(true);
    expect(isDailySlot(new Date('2026-08-15T11:59:00Z'))).toBe(true);
  });
  it('false just outside the window', () => {
    expect(isDailySlot(new Date('2026-08-15T09:59:00Z'))).toBe(false);
    expect(isDailySlot(new Date('2026-08-15T12:00:00Z'))).toBe(false);
  });
});
