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
  foodCondimentCountCompletedAt, isFobFresh, fobToolLinks, toEngineRows,
} from '../../scripts/qsrsoft-onhand-pull.mjs';
import {
  computeCountProgress, diagnoseIncompleteCount, detectCountNotifications,
} from '../engine/eom-inventory.js';
import { buildEmailContent } from '../../scripts/lib/resend-notify.mjs';

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

describe('dispatch #219 Task 1 — a real item descr flows end to end, DB row shape -> rendered email', () => {
  it('toEngineRows() (the actual main() mapping) carries descr through diagnoseIncompleteCount -> buildNotificationRow -> buildEmailContent', () => {
    // DB-shaped rows exactly like `deduped` (mapOnHandRow()'s output / a qsr_onhand row) — this
    // is the real bug: descr existed here but was dropped on the way into the engine. Uses the
    // REAL toEngineRows() export, not a re-implementation of its mapping, so a revert of the
    // `descr: r.descr` fix in that function makes this test fail.
    const deduped = [
      { wrin: 'C1', descr: 'Ketchup Packets', cls: 'Condiment', on_hand_amt: 42, unit_price: 1,
        total_units: 42, cases: 1, packs: 0, loose: 0, last_counted: null, last_submitted: null },
      { wrin: 'C2', descr: 'Mustard Packets', cls: 'Condiment', on_hand_amt: 12, unit_price: 1,
        total_units: 12, cases: 0, packs: 1, loose: 0, last_counted: d(30).toISOString().slice(0, 10), last_submitted: null },
    ];

    const ohForEngine = toEngineRows(deduped);
    // The data-side fix itself: descr must survive the DB-shape -> engine-shape mapping.
    expect(ohForEngine.find(r => r.wrin === 'C1').descr).toBe('Ketchup Packets');

    // diagnoseIncompleteCount() — the real engine function (src/engine/eom-inventory.js), unmocked.
    const diag = diagnoseIncompleteCount(ohForEngine, { period: PERIOD, minValue: 0 });
    // C1 has no last_counted at all -> genuinely uncounted, so it's in diag.uncounted with its descr.
    const uncountedC1 = diag.uncounted.find(u => u.wrin === 'C1');
    expect(uncountedC1).toBeTruthy();
    expect(uncountedC1.descr).toBe('Ketchup Packets');

    // buildNotificationRow() — the real qsrsoft-onhand-pull.mjs export, unmocked. Only needs
    // triggerClasses/triggerKinds/classStatuses off `detection`; the detection-firing logic
    // itself (computeCountProgress/detectCountNotifications) is already covered by the describes
    // above — this test's job is the descr plumbing, not re-proving when a class fires.
    const detection = {
      triggerClasses: ['condiment'], triggerKinds: ['condiment'],
      classStatuses: { condiment: { status: 'in_progress', pct: 0.5, total: 2, counted: 1 } },
    };
    const row = buildNotificationRow(LOC, PERIOD, detection, diag);
    const itemC1 = row.uncounted_items.items.find(u => u.wrin === 'C1');
    expect(itemC1).toBeTruthy();
    expect(itemC1.descr).toBe('Ketchup Packets');

    // buildEmailContent() — the real resend-notify.mjs export, unmocked — proves the description
    // text actually reaches the rendered HTML alongside the WRIN, not just an intermediate object.
    const { html } = buildEmailContent(row, { loc: LOC, name: 'Cottondale' });
    expect(html).toContain('Ketchup Packets (C1)');
  });
});

describe('2026-08-31 fix — toEngineRows() carries active/updatedAt through, so server-side stale-item detection is not silently inert', () => {
  it('an item that dropped out of the store\'s current on-hand pull reaches diagnoseIncompleteCount() as state:stale via the REAL toEngineRows() mapping', () => {
    // DB-shaped rows exactly like mapOnHandRow()'s upsert payload (qsr_onhand row) -- before this
    // fix, toEngineRows() silently dropped `active`/`updated_at`, so eom-digest-send.mjs and
    // eom-notification-resend.mjs (both of which build their onHand rows through this exact
    // function) never saw either deactivation signal, even though the browser-side loader
    // (src/lib/supabase.js's loadQsrOnHand()) already carried both through.
    const deduped = [
      { wrin: 'F1', descr: 'Fried Apple Pie', cls: 'Food', on_hand_amt: 12.67, unit_price: 0.28,
        total_units: 46, cases: 0, packs: 0, loose: 46, last_counted: '2026-08-07', last_submitted: '2026-08-07',
        active: null, updated_at: '2026-08-15T20:52:59.504Z' },   // dropped from the roster 16 days ago
      { wrin: 'F2', descr: 'Sesame Seed Bun', cls: 'Food', on_hand_amt: 40, unit_price: 0.1,
        total_units: 80, cases: 0, packs: 0, loose: 80, last_counted: '2026-08-07', last_submitted: '2026-08-07',
        active: null, updated_at: '2026-08-31T14:37:00.731Z' },   // still in today's pull
    ];
    const ohForEngine = toEngineRows(deduped);
    expect(ohForEngine.find(r => r.wrin === 'F1').active).toBe(null);
    expect(ohForEngine.find(r => r.wrin === 'F1').updatedAt).toBe('2026-08-15T20:52:59.504Z');

    const diag = diagnoseIncompleteCount(ohForEngine, { period: PERIOD, minValue: 0 });
    const byWrin = Object.fromEntries(diag.uncounted.map(u => [u.wrin, u]));
    expect(byWrin['F1'].state).toBe('stale');    // dropped from the current pull -> verify & clear
    expect(byWrin['F2'].state).toBe('early');    // still current -> a real, actionable gap
  });
});

describe('dispatch #219 Task 3 — onHandLink() title carries the class letter', () => {
  it('every class gets a title that includes its own resolved class letter', () => {
    const expectByClass = { food: '(F)', condiment: '(C)', paper: '(P)', nonproduct: '(N)' };
    for (const [cls, suffix] of Object.entries(expectByClass)) {
      const link = kbLinksForClasses([cls], '3708', '2026-08-29').find(l => l.title.startsWith('On-Hand'));
      expect(link.title).toBe(`On-Hand Inventory ${suffix}`);
    }
  });

  it('two different classes produce two genuinely different-looking titles, not just different URLs (the actual bug being fixed)', () => {
    const links = kbLinksForClasses(['food', 'condiment'], '3708', '2026-08-29').filter(l => l.title.startsWith('On-Hand'));
    expect(links.length).toBe(2);
    const titles = links.map(l => l.title);
    expect(new Set(titles).size).toBe(2); // previously both were 'On-Hand Inventory (this store)'
    expect(titles).toEqual(expect.arrayContaining(['On-Hand Inventory (F)', 'On-Hand Inventory (C)']));
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

  it('populates fob_tool_links only when fobSnapshot is non-null, mirroring fob_snapshot/fob_target', () => {
    const rows = mkRows({
      foodCountedOn: [d(30), d(30), d(30), d(30)],
      condimentCountedOn: [d(30), d(30), d(30)],
    });
    const p = computeCountProgress(rows, { period: PERIOD, asOf: ASOF });
    const detection = detectCountNotifications({ notified_classes: [] }, p, { asOf: ASOF });
    const diag = diagnoseIncompleteCount(rows, { period: PERIOD, minValue: 0 });
    const snap = { fobPct: 0.03, fob: 3000, comp: 1, raw: 1, cond: 1, emp: 1, statv: 1, unex: 1 };

    const withSnap = buildNotificationRow(LOC, PERIOD, detection, diag, snap, '2026-08-29');
    expect(withSnap.fob_tool_links).not.toBeNull();
    expect(withSnap.fob_tool_links.length).toBeGreaterThan(0);

    const withoutSnap = buildNotificationRow(LOC, PERIOD, detection, diag);
    expect(withoutSnap.fob_tool_links).toBeNull();
  });
});

describe('fobToolLinks(nsn, triggerClasses, period, dateStr) — dispatch #214', () => {
  it('a food-only trigger gets 1 Variance Stat + Waste + Transfers + Raw Items + Purchases + 1 Inventory Analysis = 6 links, all class=F', () => {
    const links = fobToolLinks('3708', ['food'], '2026-08', '2026-08-29');
    expect(links.length).toBe(6);
    const varianceStat = links.find(l => l.title.startsWith('Variance Stat'));
    const invAnalysis = links.find(l => l.title.startsWith('Inventory Analysis'));
    expect(varianceStat.url).toContain('class=F');
    expect(invAnalysis.url).toContain('class=F');
    expect(links.some(l => l.title.startsWith('Waste'))).toBe(true);
    expect(links.some(l => l.title.startsWith('Transfers'))).toBe(true);
    expect(links.some(l => l.title.startsWith('Raw Items'))).toBe(true);
    expect(links.some(l => l.title.startsWith('Purchases'))).toBe(true);
  });

  it('a food_condiment trigger gets BOTH class-letter variants for Variance Stat and Inventory Analysis (8 links total) — the dispatch\'s own open question, resolved as "keep both"', () => {
    const links = fobToolLinks('3708', ['food', 'condiment'], '2026-08', '2026-08-29');
    expect(links.length).toBe(8);
    const varianceStatLetters = links.filter(l => l.title.startsWith('Variance Stat')).map(l => new URL(l.url).searchParams.get('class')).sort();
    const invAnalysisLetters = links.filter(l => l.title.startsWith('Inventory Analysis')).map(l => new URL(l.url).searchParams.get('class')).sort();
    expect(varianceStatLetters).toEqual(['C', 'F']);
    expect(invAnalysisLetters).toEqual(['C', 'F']);
    // Class-agnostic links still appear exactly once each, not duplicated per class.
    expect(links.filter(l => l.title.startsWith('Waste')).length).toBe(1);
    expect(links.filter(l => l.title.startsWith('Transfers')).length).toBe(1);
    expect(links.filter(l => l.title.startsWith('Raw Items')).length).toBe(1);
    expect(links.filter(l => l.title.startsWith('Purchases')).length).toBe(1);
  });

  it('a paper-only trigger returns an EMPTY array — these tools are FOB-irrelevant for that trigger', () => {
    expect(fobToolLinks('3708', ['paper'], '2026-08', '2026-08-29')).toEqual([]);
  });

  it('a nonproduct-only trigger also returns an EMPTY array', () => {
    expect(fobToolLinks('3708', ['nonproduct'], '2026-08', '2026-08-29')).toEqual([]);
  });

  it('every URL is built from the GIVEN nsn/period/dateStr, not hardcoded — two different NSNs produce two different URLs', () => {
    const linksA = fobToolLinks('3708', ['food'], '2026-08', '2026-08-29');
    const linksB = fobToolLinks('9999', ['food'], '2026-08', '2026-08-29');
    for (let i = 0; i < linksA.length; i++) {
      expect(linksA[i].url).toContain('location=3708');
      expect(linksB[i].url).toContain('location=9999');
      expect(linksA[i].url).not.toBe(linksB[i].url);
    }
  });

  it('period/dateStr flow into the start/end query params, exact URLs match the owner-supplied shapes', () => {
    const links = fobToolLinks('3708', ['food'], '2026-08', '2026-08-29');
    const byTitle = Object.fromEntries(links.map(l => [l.title, l.url]));
    expect(byTitle['Variance Stat/Yields (F)']).toBe('https://v3.myqsrsoft.com/cimt/inventory/stat-variance?location=3708&tab=varianceStat&start=2026-08-01&period=M&class=F');
    expect(byTitle['Waste (this store)']).toBe('https://v3.myqsrsoft.com/cimt/inventory/waste?location=3708');
    expect(byTitle['Transfers (this store)']).toBe('https://v3.myqsrsoft.com/cimt/inventory/transfers?location=3708&tab=transfers&start=2026-08-01&end=2026-08-29');
    expect(byTitle['Raw Items (this store)']).toBe('https://v3.myqsrsoft.com/cimt/inventory/raw-item-information?location=3708&start=2026-08-01&end=2026-08-29');
    expect(byTitle['Purchases (this store)']).toBe('https://v3.myqsrsoft.com/cimt/inventory/purchases?location=3708&tab=approvePending');
    expect(byTitle['Inventory Analysis (F)']).toBe('https://v3.myqsrsoft.com/cimt/inventory/inventory-analysis?location=3708&class=F&start=2026-08-01&end=2026-08-29');
  });
});
