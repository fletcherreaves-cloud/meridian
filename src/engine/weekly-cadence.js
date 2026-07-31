// @ts-nocheck
// ── Weekly-inventory cadence + multi-point variance windowing ───────────────────────────────────
// Owner (Notes, 2026-07-31): every location does a WEEKLY full Food+Condiment count and a BI-MONTHLY
// Paper count; many also count 5-10 items DAILY (spot counts). We must (1) separate a real weekly
// count (the whole class due is counted) from daily spot counts, (2) detect/verify each store's weekly
// count day, flag exceptions, and (3) — the powerful part — bracket WHEN a variance occurred by
// comparing an item across its count points (EOM / weekly / daily). If product shrank or grew, it
// happened BETWEEN two counts; the biggest between-count delta localizes the diagnostic effort.
//
// Pure + unit-tested. Input `rawItems` = qsr_raw_item_detail rows: { wrin, descr, cls,
// history:[{ dt, tm, isCount, difference, variance }], ... } (the same shape eom-item-journey reads).

import { normClass } from './eom-inventory.js';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_NAMES = WD;
const dayKey = d => String(d || '').slice(0, 10);
const weekdayOf = day => { const t = new Date(day + 'T00:00:00'); return isNaN(t) ? null : t.getDay(); };

// Analyze one store's count cadence for a set of classes over whatever history is present.
// A day is a "full [class] session" (the weekly count) when it counts ≥ fullFrac of that class's items;
// otherwise it's a "spot" day (the daily 5-10). Returns sessions, the detected weekly weekday (mode of
// full-session weekdays), the last full count, and days-since.
export function analyzeCountCadence(rawItems, { classes = ['food', 'condiment'], fullFrac = 0.6, asOf = new Date() } = {}) {
  const items = (rawItems || []).filter(r => classes.includes(normClass(r.cls)));
  const classTotals = {}; for (const c of classes) classTotals[c] = 0;
  for (const r of items) classTotals[normClass(r.cls)]++;

  const byDay = {}; // day -> cls -> Set(wrin)
  for (const r of items) {
    const cls = normClass(r.cls);
    for (const h of (r.history || [])) {
      if (!h || !h.isCount || !h.dt) continue;
      const day = dayKey(h.dt);
      const d = byDay[day] || (byDay[day] = {});
      (d[cls] || (d[cls] = new Set())).add(String(r.wrin));
    }
  }

  const sessions = [];
  for (const day of Object.keys(byDay).sort()) {
    const counts = {}; let full = false; const covered = [];
    for (const c of classes) {
      const n = byDay[day][c] ? byDay[day][c].size : 0;
      counts[c] = n;
      if (classTotals[c] && n >= classTotals[c] * fullFrac) { full = true; covered.push(c); }
    }
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    sessions.push({ day, weekday: weekdayOf(day), counts, total, kind: full ? 'weekly' : 'spot', classesCovered: covered });
  }
  const weeklySessions = sessions.filter(s => s.kind === 'weekly');
  const spotSessions = sessions.filter(s => s.kind === 'spot');

  const dayFreq = {}; for (const s of weeklySessions) dayFreq[s.weekday] = (dayFreq[s.weekday] || 0) + 1;
  const detectedWeekday = Object.keys(dayFreq).length
    ? Number(Object.keys(dayFreq).sort((a, b) => dayFreq[b] - dayFreq[a])[0]) : null;
  const lastWeekly = weeklySessions.length ? weeklySessions[weeklySessions.length - 1].day : null;
  const lastSpot = spotSessions.length ? spotSessions[spotSessions.length - 1].day : null;
  const daysSince = day => day ? Math.floor((new Date(asOf).setHours(0, 0, 0, 0) - new Date(day + 'T00:00:00').getTime()) / 86400000) : null;

  return {
    classTotals, sessions, weeklySessions, spotSessions,
    detectedWeekday, detectedWeekdayName: detectedWeekday != null ? WD[detectedWeekday] : null,
    lastWeekly, daysSinceWeekly: daysSince(lastWeekly),
    lastSpot, daysSinceSpot: daysSince(lastSpot),
    nWeekly: weeklySessions.length, nSpot: spotSessions.length,
  };
}

// The multi-point variance window for ONE item: its count points in time + the delta between each
// consecutive pair. The biggest |delta| window is where the movement most likely occurred — that's the
// window to investigate (product shrank/grew between those two counts).
export function itemVarianceWindows(history) {
  const counts = (history || [])
    .filter(h => h && h.isCount && h.dt)
    .slice()
    .sort((a, b) => String(`${a.dt} ${a.tm || ''}`).localeCompare(`${b.dt} ${b.tm || ''}`));
  const points = counts.map(c => ({ dt: dayKey(c.dt), tm: c.tm || null, variance: Number(c.difference) || 0 }));
  const windows = [];
  for (let i = 1; i < points.length; i++) {
    windows.push({ from: points[i - 1].dt, to: points[i].dt, delta: points[i].variance - points[i - 1].variance });
  }
  const biggest = windows.slice().sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))[0] || null;
  return { points, windows, biggest };
}

// Compliance/exceptions across a scope. `expectedWeekdayByLoc` = the owner-supplied weekly count day
// (0=Sun..6=Sat) per loc; when absent we just report the DETECTED day. Flags: overdue (no full weekly
// in ≥ overdueDays), off-day (detected ≠ expected), or never (no full weekly on record).
export function weeklyExceptions(cadenceByLoc, { expectedWeekdayByLoc = {}, overdueDays = 8 } = {}) {
  const out = [];
  for (const loc of Object.keys(cadenceByLoc || {})) {
    const c = cadenceByLoc[loc];
    const expected = expectedWeekdayByLoc[loc];
    const flags = [];
    if (c.daysSinceWeekly == null) flags.push('no full weekly count on record');
    else if (c.daysSinceWeekly >= overdueDays) flags.push(`weekly count overdue — ${c.daysSinceWeekly}d since last full count`);
    if (expected != null && c.detectedWeekday != null && Number(expected) !== c.detectedWeekday) {
      flags.push(`usually counts ${WD[c.detectedWeekday]} vs expected ${WD[Number(expected)]}`);
    }
    if (flags.length) out.push({ loc, flags, detectedWeekday: c.detectedWeekday, detectedWeekdayName: c.detectedWeekdayName, daysSinceWeekly: c.daysSinceWeekly, lastWeekly: c.lastWeekly, expected: expected != null ? Number(expected) : null });
  }
  return out.sort((a, b) => (b.daysSinceWeekly || 0) - (a.daysSinceWeekly || 0));
}
