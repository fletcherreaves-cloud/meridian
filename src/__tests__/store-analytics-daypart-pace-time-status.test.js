// @vitest-environment happy-dom
// @ts-nocheck
// Owner-caught 2026-11-05 (screenshot, Daypart Pace card, store-analytics.js): Lunch correctly
// showed "done" while Snack correctly showed "live" -- but Breakfast, EARLIER in the day than
// both, ALSO still showed "live". Root cause: isActive/isDone used to be keyed off whether
// every hour_slot in the daypart had a nonzero product_sales row, not off the actual clock -- a
// single $0 slot pins a daypart at "live" forever regardless of real time. "We should mark done
// based on time of day" (owner's own words). daypartTimeStatus() is now a pure function of
// elapsed hours since the business day's 4am start, independent of whether any sales landed --
// these tests assert exactly the scenario from the screenshot (an earlier daypart reads done
// while the current one reads live) would no longer invert.
import { describe, it, expect } from 'vitest';
import { daypartTimeStatus } from '../views/store-analytics.js';

const BREAKFAST = ['06:00','07:00','08:00','09:00','10:00','11:00']; // elapsed hours 1→7
const LUNCH     = ['12:00','13:00','14:00'];                          // elapsed hours 7→10
const SNACK     = ['15:00','16:00','17:00'];                          // elapsed hours 10→13
const DINNER    = ['18:00','19:00','20:00','21:00'];                  // elapsed hours 13→17

describe('daypartTimeStatus — time-of-day only, never data-availability', () => {
  it('reproduces the owner-reported scenario: by mid-afternoon, Breakfast and Lunch are both done, Snack is live, Dinner has not started', () => {
    // 3:30pm on the business day == 11.5 hours elapsed since 4am start (mid-Snack window).
    const elapsed = 11.5;
    expect(daypartTimeStatus(BREAKFAST, elapsed)).toEqual({ isActive: false, isDone: true });
    expect(daypartTimeStatus(LUNCH,     elapsed)).toEqual({ isActive: false, isDone: true });
    expect(daypartTimeStatus(SNACK,     elapsed)).toEqual({ isActive: true,  isDone: false });
    expect(daypartTimeStatus(DINNER,    elapsed)).toEqual({ isActive: false, isDone: false });
  });

  it('marks an earlier daypart done even with zero sales recorded (time has simply passed, not a data check)', () => {
    // The exact bug: a daypart with no sales in ANY of its slots must still read "done" once
    // its window has closed -- the old implementation required actual>0, this one never checks
    // sales at all. (A tile with zero sales AND zero projection is hidden by the panel's own
    // separate visibleDp filter -- that's an unrelated display concern, not this function's job.)
    expect(daypartTimeStatus(BREAKFAST, 11.5)).toEqual({ isActive: false, isDone: true });
  });

  it('marks a daypart live exactly inside its own window, regardless of position in the day', () => {
    expect(daypartTimeStatus(BREAKFAST, 3).isActive).toBe(true);   // 7am, mid-breakfast
    expect(daypartTimeStatus(DINNER, 15).isActive).toBe(true);     // mid-dinner
  });

  it('marks a daypart not-yet-started (neither live nor done) before its window opens', () => {
    expect(daypartTimeStatus(DINNER, 11.5)).toEqual({ isActive: false, isDone: false });
  });

  it('marks every daypart done once the full 24-hour business day has elapsed', () => {
    for (const slots of [BREAKFAST, LUNCH, SNACK, DINNER]) {
      expect(daypartTimeStatus(slots, 24)).toEqual({ isActive: false, isDone: true });
    }
  });

  it('marks nothing done or live before the business day starts', () => {
    expect(daypartTimeStatus(BREAKFAST, 0)).toEqual({ isActive: false, isDone: false });
  });
});
