// @ts-nocheck
// Dispatch #209 — integration-level test of scripts/qsrsoft-onhand-pull.mjs's new
// notification-creation logic (buildNotificationRow/buildStatusRow/kbLinksForClasses), scoped
// per this repo's convention for testing a scripts/ module without live QSRSoft credentials or
// network (see src/__tests__/register-audit-pull.test.js's own header for the precedent). This
// runs the SAME functions the real pull script calls, against realistic on-hand row fixtures fed
// through the real computeCountProgress()/diagnoseIncompleteCount()/detectCountNotifications()
// engine — proving a notification row actually lands with the right shape when a class
// transitions to done, and that running the same transition twice does not produce a second row.
import { describe, it, expect } from 'vitest';
import {
  buildNotificationRow, buildStatusRow, kbLinksForClasses,
  foodCondimentCountCompletedAt, isFobFresh,
} from '../../scripts/qsrsoft-onhand-pull.mjs';
import {
  computeCountProgress, diagnoseIncompleteCount, detectCountNotifications,
} from '../engine/eom-inventory.js';

const PERIOD = '2026-08';
const LOC = '0003708';

// Realistic on-hand rows shaped like buildStatusRow's `ohForEngine` mapping in the real pull
// script (camelCase, lastCounted as a Date or null) -- 4 food, 3 condiment, 2 paper, 1 nonproduct.
function mkRows({ foodCountedOn = [], condimentCountedOn = [], paperCountedOn = [], nonproductCountedOn = [] } = {}) {
  const rows = [];
  const push = (cls, n, countedDates, valuePrefix) => {
    for (let i = 0; i < n; i++) {
      rows.push({
        wrin: `${valuePrefix}${i}`, cls, onHandAmt: 100 + i * 10, unitPrice: 5, totalUnits: 20,
        lastCounted: countedDates[i] || null, lastSubmitted: null,
      });
    }
  };
  push('Food', 4, foodCountedOn, 'F');
  push('Condiment', 3, condimentCountedOn, 'C');
  push('Paper', 2, paperCountedOn, 'P');
  push('Non-Product', 1, nonproductCountedOn, 'N');
  return rows;
}

const d = (day) => new Date(`2026-08-${String(day).padStart(2, '0')}T00:00:00`);
const ASOF = d(31);

describe('pull-script integration — a class transitioning to done produces a real notification row', () => {
  it('Food+Condiment both complete, Paper/Non-Product untouched -> a food_condiment notification with the full 4-class snapshot', () => {
    // All Food + all Condiment counted inside the window; Paper/Non-Product untouched.
    const rows = mkRows({
      foodCountedOn: [d(30), d(30), d(30), d(30)],
      condimentCountedOn: [d(30), d(30), d(30)],
    });
    const prevStatus = { notified_classes: [] }; // fresh store, first run this period
    const p = computeCountProgress(rows, { period: PERIOD, asOf: ASOF });
    const detection = detectCountNotifications(prevStatus, p, { asOf: ASOF });

    expect(detection).not.toBeNull();
    expect(detection.triggerKinds).toEqual(['food_condiment']);

    const diag = diagnoseIncompleteCount(rows, { period: PERIOD, minValue: 0 });
    const row = buildNotificationRow(LOC, PERIOD, detection, diag);

    // ── Shape asserted against the real supabase/schema-eom-count-notifications.sql columns ──
    expect(row.loc).toBe(LOC);
    expect(row.period).toBe(PERIOD);
    expect(row.trigger_kind).toBe('food_condiment');
    expect(row.class_statuses.food.status).toBe('complete');
    expect(row.class_statuses.condiment.status).toBe('complete');
    // Rule 3: untouched-but-real classes read not_started, not blank.
    expect(row.class_statuses.paper.status).toBe('not_started');
    expect(row.class_statuses.nonproduct.status).toBe('not_started');
    // lateBulk surfaced alongside the per-class statuses (Task 3.3).
    expect(row.class_statuses).toHaveProperty('lateBulk');
    // uncounted_items is scoped to the trigger classes (food+condiment), capped, with totals.
    expect(row.uncounted_items).toHaveProperty('items');
    expect(row.uncounted_items).toHaveProperty('totalCount');
    expect(row.uncounted_items).toHaveProperty('totalValue');
    expect(row.uncounted_items).toHaveProperty('truncated', false);
    expect(row.uncounted_items.items.every(u => ['food', 'condiment'].includes(u.cls))).toBe(true);
    // KB links present and real (title/url pairs, not placeholders).
    expect(Array.isArray(row.kb_links)).toBe(true);
    expect(row.kb_links.length).toBeGreaterThan(0);
    expect(row.kb_links[0]).toHaveProperty('title');
    expect(row.kb_links[0]).toHaveProperty('url');
    expect(row.kb_links[0].url).toMatch(/^https:\/\/support\.qsrsoft\.com\//);
  });

  it('Paper completes independently -> notification includes Food/Condiment/Non-Product CURRENT status alongside Paper (rule 2)', () => {
    const rows = mkRows({
      foodCountedOn: [d(30), null, null, null],       // in progress
      paperCountedOn: [d(31), d(31)],                  // just completed
    });
    const prevStatus = { notified_classes: [] };
    const p = computeCountProgress(rows, { period: PERIOD, asOf: ASOF });
    const detection = detectCountNotifications(prevStatus, p, { asOf: ASOF });
    expect(detection.triggerKinds).toEqual(['paper']);

    const diag = diagnoseIncompleteCount(rows, { period: PERIOD, minValue: 0 });
    const row = buildNotificationRow(LOC, PERIOD, detection, diag);

    expect(row.trigger_kind).toBe('paper');
    expect(row.class_statuses.paper.status).toBe('complete');
    expect(row.class_statuses.food.status).toBe('in_progress');
    expect(row.class_statuses.condiment.status).toBe('not_started');
    // Non-Product has zero items in this fixture's period-window sense? It has 1 item, uncounted -> not_started.
    expect(row.class_statuses.nonproduct.status).toBe('not_started');
    // Paper's own leftover uncounted items only (scoped to trigger class) -- here Paper is 100%
    // counted so this should be empty.
    expect(row.uncounted_items.items.length).toBe(0);
    expect(row.uncounted_items.totalCount).toBe(0);
  });
});

describe('pull-script integration — fire-once end to end via buildStatusRow', () => {
  it('running the pull-script logic twice against the SAME transition does not produce a second notification row', () => {
    const rows = mkRows({
      foodCountedOn: [d(30), d(30), d(30), d(30)],
      condimentCountedOn: [d(30), d(30), d(30)],
    });

    // ── Run 1: fresh store, no prior status row ──────────────────────────────────────────────
    let prevStatus = {};
    let p = computeCountProgress(rows, { period: PERIOD, asOf: ASOF });
    let detection = detectCountNotifications(prevStatus, p, { asOf: ASOF });
    expect(detection).not.toBeNull();

    const notificationRows = [];
    const diag = diagnoseIncompleteCount(rows, { period: PERIOD, minValue: 0 });
    notificationRows.push(buildNotificationRow(LOC, PERIOD, detection, diag));

    // buildStatusRow is what persists the fire-once marker (notified_classes) that the NEXT
    // run's prevStatus must carry — this is the exact call the real pull script makes.
    const statusRow = buildStatusRow(LOC, PERIOD, prevStatus, p, detection.triggerKinds);
    expect(statusRow.notified_classes).toEqual(['food_condiment']);
    expect(statusRow.food_done_at).toBeTruthy();
    expect(statusRow.condiment_done_at).toBeTruthy();

    // ── Run 2 (e.g. next hourly pull): same underlying rows, store's status row now carries
    // the fire-once marker from run 1's upsert ────────────────────────────────────────────────
    prevStatus = statusRow;
    p = computeCountProgress(rows, { period: PERIOD, asOf: ASOF });
    detection = detectCountNotifications(prevStatus, p, { asOf: ASOF });
    expect(detection).toBeNull(); // no second notification for the same transition

    if (detection) notificationRows.push(buildNotificationRow(LOC, PERIOD, detection, diag));
    expect(notificationRows.length).toBe(1); // still just the one row from run 1

    // The second buildStatusRow call must not lose the already-stamped done_at timestamps or
    // the fire-once marker (never overwritten once set).
    const statusRow2 = buildStatusRow(LOC, PERIOD, prevStatus, p, detection?.triggerKinds);
    expect(statusRow2.food_done_at).toBe(statusRow.food_done_at);
    expect(statusRow2.condiment_done_at).toBe(statusRow.condiment_done_at);
    expect(statusRow2.notified_classes).toEqual(['food_condiment']);
  });
});

describe('kbLinksForClasses(classes, nsn, dateStr) — dispatch #213 dynamic signature', () => {
  it('every class has at least one link, including Paper and Non-Product', () => {
    for (const c of ['food', 'condiment', 'paper', 'nonproduct']) {
      expect(kbLinksForClasses([c], '3708', '2026-08-29').length).toBeGreaterThan(0);
    }
  });

  it('links are deduplicated by URL', () => {
    const links = kbLinksForClasses(['food', 'condiment'], '3708', '2026-08-29');
    const urls = links.map(l => l.url);
    expect(new Set(urls).size).toBe(urls.length);
  });

  it('the Best Counting Practices link is the owner-corrected search-results URL, verbatim', () => {
    const links = kbLinksForClasses(['food'], '3708', '2026-08-29');
    const bc = links.find(l => l.title.includes('Best Counting Practices'));
    expect(bc.url).toBe('https://support.qsrsoft.com/hc/en-us/search?utf8=✓&query=Best+counting+practices');
  });

  it('the Physical Inventory link is built with the GIVEN nsn, not a hardcoded 3708 — two different NSNs produce two different URLs', () => {
    const linksA = kbLinksForClasses(['food'], '3708', '2026-08-29');
    const linksB = kbLinksForClasses(['food'], '9999', '2026-08-29');
    const piA = linksA.find(l => l.title.startsWith('Physical Inventory'));
    const piB = linksB.find(l => l.title.startsWith('Physical Inventory'));
    expect(piA.url).toContain('location=3708');
    expect(piB.url).toContain('location=9999');
    expect(piA.url).not.toBe(piB.url);
    expect(piA.url).toBe('https://v3.myqsrsoft.com/cimt/inventory/inventory?location=3708&tab=itemsToInventory&countFrequency=A&temperatureZone=all&class=all&rangeIndicator=all&duplicatePrefix=false');
  });

  it('the On-Hand Inventory link is built with the given nsn/date and the right per-class letter — two different NSNs (and classes) produce two different URLs', () => {
    const foodA = kbLinksForClasses(['food'], '3708', '2026-08-29').find(l => l.title.startsWith('On-Hand'));
    const foodB = kbLinksForClasses(['food'], '9999', '2026-08-29').find(l => l.title.startsWith('On-Hand'));
    expect(foodA.url).toContain('location=3708');
    expect(foodA.url).toContain('class=F');
    expect(foodA.url).toContain('date=2026-08-29');
    expect(foodB.url).toContain('location=9999');
    expect(foodA.url).not.toBe(foodB.url);
    expect(foodA.url).toBe('https://v3.myqsrsoft.com/cimt/inventory/on-hand-inventory?location=3708&class=F&recipe=all&nonzero=true&duplicates=false&date=2026-08-29');

    const cond = kbLinksForClasses(['condiment'], '3708', '2026-08-29').find(l => l.title.startsWith('On-Hand'));
    expect(cond.url).toContain('class=C');
  });

  it('a food_condiment trigger gets BOTH an F and a C On-Hand link, not just one', () => {
    const links = kbLinksForClasses(['food', 'condiment'], '3708', '2026-08-29');
    const onHand = links.filter(l => l.title.startsWith('On-Hand'));
    const classLetters = onHand.map(l => new URL(l.url).searchParams.get('class')).sort();
    expect(classLetters).toEqual(['C', 'F']);
  });

  it('paper and nonproduct get their own class letters (P and N)', () => {
    const paper = kbLinksForClasses(['paper'], '3708', '2026-08-29').find(l => l.title.startsWith('On-Hand'));
    const nonproduct = kbLinksForClasses(['nonproduct'], '3708', '2026-08-29').find(l => l.title.startsWith('On-Hand'));
    expect(paper.url).toContain('class=P');
    expect(nonproduct.url).toContain('class=N');
  });
});

describe('foodCondimentCountCompletedAt — dispatch #213 Task 3 freshness input', () => {
  it('returns the max lastCounted/lastSubmitted across only Food+Condiment rows, ignoring Paper/Non-Product', () => {
    const rows = [
      { cls: 'Food', lastCounted: new Date('2026-08-29T10:00:00Z'), lastSubmitted: null },
      { cls: 'Condiment', lastCounted: null, lastSubmitted: new Date('2026-08-29T14:00:00Z') },
      { cls: 'Paper', lastCounted: new Date('2026-08-30T23:00:00Z'), lastSubmitted: null }, // later, but not FOB
    ];
    const at = foodCondimentCountCompletedAt(rows);
    expect(at.toISOString()).toBe(new Date('2026-08-29T14:00:00Z').toISOString());
  });

  it('returns null when no Food/Condiment row has a counted/submitted date', () => {
    const rows = [{ cls: 'Food', lastCounted: null, lastSubmitted: null }];
    expect(foodCondimentCountCompletedAt(rows)).toBeNull();
  });
});

describe('isFobFresh — dispatch #213 Task 3, the literal freshness comparison, both directions', () => {
  const countCompletedAt = new Date('2026-08-29T14:00:00Z');

  it('FOB updated_at AFTER the count-completion time -> fresh (included)', () => {
    expect(isFobFresh(new Date('2026-08-29T15:30:00Z'), countCompletedAt)).toBe(true);
  });

  it('FOB updated_at exactly EQUAL to the count-completion time -> fresh (at-or-after)', () => {
    expect(isFobFresh(new Date('2026-08-29T14:00:00Z'), countCompletedAt)).toBe(true);
  });

  it('FOB updated_at BEFORE the count-completion time -> stale (omitted)', () => {
    expect(isFobFresh(new Date('2026-08-29T09:00:00Z'), countCompletedAt)).toBe(false);
  });

  it('a real same-day-but-earlier-run scenario -> stale (the count just finished, FOB pull has not landed yet)', () => {
    // FOB pulled that morning at 6am, count finished at 2pm the same day.
    expect(isFobFresh(new Date('2026-08-29T06:00:00Z'), countCompletedAt)).toBe(false);
  });

  it('missing FOB updated_at -> stale', () => {
    expect(isFobFresh(null, countCompletedAt)).toBe(false);
  });

  it('missing count-completion time -> stale', () => {
    expect(isFobFresh(new Date('2026-08-29T15:00:00Z'), null)).toBe(false);
  });
});

describe('buildNotificationRow — fob_snapshot passthrough (dispatch #213 Task 3)', () => {
  it('carries a given fobSnapshot through to the row as fob_snapshot', () => {
    const rows = mkRows({
      foodCountedOn: [d(30), d(30), d(30), d(30)],
      condimentCountedOn: [d(30), d(30), d(30)],
    });
    const p = computeCountProgress(rows, { period: PERIOD, asOf: ASOF });
    const detection = detectCountNotifications({ notified_classes: [] }, p, { asOf: ASOF });
    const diag = diagnoseIncompleteCount(rows, { period: PERIOD, minValue: 0 });
    const snap = { fobPct: 0.03, fob: 3000, comp: 1, raw: 1, cond: 1, emp: 1, statv: 1, unex: 1 };
    const row = buildNotificationRow(LOC, PERIOD, detection, diag, snap, '2026-08-29');
    expect(row.fob_snapshot).toBe(snap);
  });

  it('defaults fob_snapshot to null when no snapshot is passed (stale/missing/not-FOB-relevant)', () => {
    const rows = mkRows({ paperCountedOn: [d(31), d(31)] });
    const p = computeCountProgress(rows, { period: PERIOD, asOf: ASOF });
    const detection = detectCountNotifications({ notified_classes: [] }, p, { asOf: ASOF });
    const diag = diagnoseIncompleteCount(rows, { period: PERIOD, minValue: 0 });
    const row = buildNotificationRow(LOC, PERIOD, detection, diag);
    expect(row.fob_snapshot).toBeNull();
  });
});
