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

describe('kbLinksForClasses', () => {
  it('returns real, deduplicated QSRSoft support links for the given classes', () => {
    const links = kbLinksForClasses(['food', 'condiment']);
    const urls = links.map(l => l.url);
    expect(new Set(urls).size).toBe(urls.length); // deduped
    expect(urls.every(u => u.startsWith('https://support.qsrsoft.com/'))).toBe(true);
  });

  it('every class has at least one link, including Paper and Non-Product', () => {
    for (const c of ['food', 'condiment', 'paper', 'nonproduct']) {
      expect(kbLinksForClasses([c]).length).toBeGreaterThan(0);
    }
  });
});
