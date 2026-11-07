// @ts-nocheck
// Tests for src/engine/movers-alert.js — task #91 (Movers alerts). Thresholds are the measured
// numbers from memory/plan-movers-alerts-2026-11-07.md, not re-derived here; these tests pin the
// RULES (single-day CRIT, sustained WARN, no up-swing rule) against synthetic series.
import { describe, it, expect } from 'vitest';
import { evaluateMoversAlert, buildMoversAlertContent, moversTopCauseKind, MOVERS_THRESHOLDS, MOVERS_TARGET_ROLES } from '../engine/movers-alert.js';

const day = (date, pct, guestPct = null) => ({ date, pct, guestPct });

describe('evaluateMoversAlert', () => {
  it('fires CRIT on a single day at or below the single-day threshold, even with no prior run', () => {
    const series = [day('2026-11-01', 2), day('2026-11-02', -5), day('2026-11-03', -26)];
    const alert = evaluateMoversAlert(series);
    expect(alert).toMatchObject({ severity: 'crit', rule: 'single-day', swingPct: -26, consecutiveDays: 1 });
  });

  it('does not fire on a single bad day above the CRIT cutoff with no sustained run', () => {
    const series = [day('2026-11-01', 3), day('2026-11-02', -10), day('2026-11-03', -22)];
    expect(evaluateMoversAlert(series)).toBeNull();
  });

  it('fires WARN on 3+ consecutive days at or below the sustained threshold', () => {
    const series = [day('2026-11-01', 5), day('2026-11-02', -21), day('2026-11-03', -22), day('2026-11-04', -20)];
    const alert = evaluateMoversAlert(series);
    expect(alert).toMatchObject({ severity: 'warn', rule: 'sustained', consecutiveDays: 3 });
  });

  it('does not fire on only 2 consecutive bad days — the run requirement is real, not cosmetic', () => {
    const series = [day('2026-11-01', 5), day('2026-11-02', -22), day('2026-11-03', -21)];
    expect(evaluateMoversAlert(series)).toBeNull();
  });

  it('a run that breaks does not carry across the break', () => {
    const series = [day('2026-11-01', -22), day('2026-11-02', -21), day('2026-11-03', 1), day('2026-11-04', -20), day('2026-11-05', -20)];
    expect(evaluateMoversAlert(series)).toBeNull(); // only 2 consecutive days at the end, the break reset the run
  });

  it('CRIT single-day wins over a concurrent sustained run — reports the more severe rule', () => {
    const series = [day('2026-11-01', -21), day('2026-11-02', -21), day('2026-11-03', -30)];
    const alert = evaluateMoversAlert(series);
    expect(alert.severity).toBe('crit');
    expect(alert.rule).toBe('single-day');
  });

  it('never fires on an up-swing, however large or sustained — the measured finding this module exists to encode', () => {
    const series = Array.from({ length: 10 }, (_, i) => day(`2026-11-0${i + 1}`, 30));
    expect(evaluateMoversAlert(series)).toBeNull();
  });

  it('returns null for an empty or all-null-pct series', () => {
    expect(evaluateMoversAlert([])).toBeNull();
    expect(evaluateMoversAlert([day('2026-11-01', null)])).toBeNull();
  });
});

describe('moversTopCauseKind', () => {
  it('classifies guests-fell-harder-than-sales as traffic loss with check holding', () => {
    expect(moversTopCauseKind({ swingPct: -26, guestPct: -32 })).toBe('traffic-loss-check-holding');
  });
  it('classifies flat guests with a real sales decline as check-mix, not traffic', () => {
    expect(moversTopCauseKind({ swingPct: -26, guestPct: -0.5 })).toBe('check-mix');
  });
  it('classifies no guest data as unknown rather than guessing', () => {
    expect(moversTopCauseKind({ swingPct: -26, guestPct: null })).toBe('unknown');
  });
});

describe('buildMoversAlertContent', () => {
  it('builds a title naming the store and severity, and a body with the swing + cause', () => {
    const alert = { severity: 'crit', swingPct: -26.4, consecutiveDays: 1, guestPct: -32 };
    const { title, body, causeKind } = buildMoversAlertContent({ storeName: 'Ardmore-Broadway', alert });
    expect(title).toBe('Ardmore-Broadway: CRIT sales decline');
    expect(body).toContain('-26.4%');
    expect(body).not.toContain('days running'); // single-day event, no run to report
    expect(causeKind).toBe('traffic-loss-check-holding');
  });

  it('mentions the run length for a sustained WARN', () => {
    const alert = { severity: 'warn', swingPct: -21.0, consecutiveDays: 4, guestPct: -5 };
    const { title, body } = buildMoversAlertContent({ storeName: 'Duncan', alert });
    expect(title).toBe('Duncan: WARN sales decline');
    expect(body).toContain('4 days running');
  });
});

describe('constants', () => {
  it('MOVERS_TARGET_ROLES matches the owner\'s live decision — GM/AS/DO only', () => {
    expect(MOVERS_TARGET_ROLES.sort()).toEqual(['area_supervisor', 'do', 'gm'].sort());
  });
  it('thresholds match memory/plan-movers-alerts-2026-11-07.md\'s shipped table', () => {
    expect(MOVERS_THRESHOLDS).toEqual({ critSingleDayPct: -25, warnRunPct: -20, warnMinRun: 3 });
  });
});
