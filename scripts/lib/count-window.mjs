// scripts/lib/count-window.mjs — shared EOM count-window gate (dispatch #210).
//
// "Are we in the last-3-days count window this month, and is it currently CT business
// hours" originally lived only inside qsrsoft-onhand-pull.mjs. Dispatch #210 needed the
// EXACT same gate inside qsrsoft-variance-pull.mjs (accelerate to hourly during the same
// window) — per CLAUDE.md's standing rule ("check whether a helper exists before writing
// one" — four copies of the org map, three of scheduled-hours, two of the week anchor
// already cost this repo real reconciliation bugs), that means extracting the ONE
// existing implementation here rather than writing a second copy that could drift.
//
// Pure functions, every one takes an explicit `now` (default `new Date()`) so callers —
// and tests — can pin a fixed instant without stubbing the global clock.

/** True only in the last 3 calendar days of the month (UTC calendar day). */
export function inCountWindow(now = new Date()) {
  const lastDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return now.getUTCDate() >= lastDay - 2;
}

// hourCycle explicitly 'h23' (NOT just hour12:false) -- hour12:false alone leaves
// midnight's rendering ("00" vs "24") to the runtime's default hourCycle resolution,
// which is NOT portable across Node/ICU versions (this exact pattern broke main's CI for
// seven commits via src/engine/forms-completion.js — dispatch #60,
// memory/dispatch-60-ci-node-parity.md).
export function centralHour(now = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hourCycle: 'h23', hour: 'numeric',
  }).format(now));
}

/**
 * True for `now` inside [start, end) Central time, DST-safe. Callers own their own
 * start/end defaults (env-tunable) — this stays a pure comparison.
 */
export function inCtBusinessHours(now, start, end) {
  const h = centralHour(now);
  return h >= start && h < end;
}

// 2026-09-01 (weekly-count-day pull) — 0=Sun..6=Sat for `now`'s CALENDAR DATE in Central time.
// Computes the CT calendar date FIRST (via Intl, DST-safe the same way centralHour is), then asks
// what weekday that date is — never derives the weekday from a UTC-shifted instant, which would
// read the wrong calendar day near midnight CT on either side of a DST boundary.
export function centralWeekday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const y = parts.find(p => p.type === 'year').value;
  const m = parts.find(p => p.type === 'month').value;
  const d = parts.find(p => p.type === 'day').value;
  return new Date(`${y}-${m}-${d}T00:00:00`).getDay();
}
