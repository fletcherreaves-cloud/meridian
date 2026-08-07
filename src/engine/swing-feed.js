// @ts-nocheck
// ── Swing feed + acknowledgement ─────────────────────────────────────────────
// Notes 58 #4. Turns the calibrated detector in swing-detect.js into per-store alerts,
// and holds the acknowledgement state that makes a critical swing impossible to scroll
// past.
//
// ── THE ACKNOWLEDGEMENT RULE THAT MATTERS ───────────────────────────────────
// An acknowledgement is keyed to the SITUATION, not just the store:
//     ack key = `${storeId}:${latestWeek}:${severity}`
// So acknowledging Atoka's 08-07 critical swing does NOT suppress the 08-14 one, and it
// does NOT suppress an escalation from warn to critical. Otherwise one click would go
// blind on a store that keeps getting worse — the precise failure the owner is trying to
// prevent ("there needs to be no reason it is not surfaced").
//
// Acks persist to user_settings under `swing_acks` so they follow the user across
// devices, using the same load/save pattern as every other setting.

import { detectSwing, swingItem } from './swing-detect.js';

export const ACK_SETTING_KEY = 'swing_acks';

const dKey = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);

/**
 * Bucket a store's daily rows into complete trailing weeks, most recent last.
 * Only COMPLETE weeks are returned — a partial current week would read as a collapse
 * every single time, which is exactly how an alarm trains people to ignore it.
 */
export function weeklyBuckets(rows = [], { weeks = 8, asOf = null } = {}) {
  const sorted = [...(rows || [])].filter(r => r && r.date).sort((a, b) => a.date - b.date);
  if (!sorted.length) return [];
  const end = asOf ? new Date(asOf) : sorted[sorted.length - 1].date;
  const usable = sorted.filter(r => r.date <= end);

  const out = [];
  for (let i = usable.length; i > 0; i -= 7) {
    const chunk = usable.slice(Math.max(0, i - 7), i);
    if (chunk.length < 7) continue;                       // incomplete week — skip
    const sum = (f) => chunk.reduce((a, r) => a + (r[f] || 0), 0);
    out.push({
      label: dKey(chunk[chunk.length - 1].date),
      cur: sum('sales'), base: sum('lySales'),
      curGuests: sum('gc'), baseGuests: sum('lyGc'),
    });
    if (out.length >= weeks) break;
  }
  return out.reverse();
}

/**
 * Build swing alerts for every store present in the data.
 * `rows` is ds.qsrActSummaryRows (or anything with {loc, date, sales, gc, lySales, lyGc}).
 */
export function buildSwingFeed(rows = [], { storeName = String, asOf = null, weeks = 8, opts = {} } = {}) {
  const byLoc = {};
  for (const r of (rows || [])) {
    if (!r || !r.loc) continue;
    (byLoc[r.loc] || (byLoc[r.loc] = [])).push(r);
  }
  const out = [];
  for (const loc of Object.keys(byLoc)) {
    const periods = weeklyBuckets(byLoc[loc], { weeks, asOf });
    if (periods.length < 2) continue;                     // can't judge a run on one week
    const swing = detectSwing(periods, opts);
    const item = swingItem(loc, swing, storeName);
    if (item) out.push(item);
  }
  // Worst first: critical before watch, then by dollars at stake.
  const SEV = { crit: 3, warn: 2, info: 1 };
  return out.sort((a, b) => (SEV[b.severity] - SEV[a.severity]) ||
                            (Math.abs(b.dollars || 0) - Math.abs(a.dollars || 0)));
}

/** Stable key for one acknowledgement. Changes when the situation changes. */
export function ackKey(item) {
  if (!item) return '';
  return `${item.loc}:${item.swing?.to || ''}:${item.severity}`;
}

/** Split a feed into what still needs attention and what's been acknowledged. */
export function partitionAcked(items = [], acks = {}) {
  const pending = [], acked = [];
  for (const i of (items || [])) {
    (acks && acks[ackKey(i)] ? acked : pending).push(i);
  }
  return { pending, acked };
}

/** Items that must block until explicitly acknowledged. */
export const blocking = (items = [], acks = {}) =>
  partitionAcked(items, acks).pending.filter(i => i.requiresAck);

/**
 * Record an acknowledgement. Returns the NEW acks object (never mutates), so callers
 * can persist and set state from one value.
 */
export function acknowledge(acks = {}, item, who = null) {
  const k = ackKey(item);
  if (!k) return acks;
  return { ...(acks || {}), [k]: { at: new Date().toISOString(), by: who || null } };
}

/**
 * Drop acknowledgements for situations that no longer exist, so the store doesn't grow
 * without bound. Anything older than `maxAgeDays` goes regardless.
 */
export function pruneAcks(acks = {}, liveItems = [], { maxAgeDays = 120 } = {}) {
  const live = new Set((liveItems || []).map(ackKey));
  const cutoff = Date.now() - maxAgeDays * 864e5;
  const out = {};
  for (const [k, v] of Object.entries(acks || {})) {
    const at = v && v.at ? Date.parse(v.at) : 0;
    if (live.has(k) || at > cutoff) out[k] = v;
  }
  return out;
}
