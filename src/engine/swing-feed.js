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
//
// ── A SECOND ACK DOMAIN (issue #115) ─────────────────────────────────────────
// The Needs Attention merge reuses this same ack machinery for attention-feed items
// (src/engine/attention-feed.js), which are NOT swing items — they carry no `.swing`
// field. Two real traps if you copy-paste instead of generalizing:
//   Trap 1 — the default key `${loc}:${swing?.to||''}:${severity}` collides for
//   attention items: two different crit findings at the SAME store both key as
//   `10422::crit`, so acknowledging one silently acknowledges the other. Attention
//   items already carry a unique `item.id` (`finding-${loc}-${rule}`, `fob-${loc}`,
//   etc.) — every function below takes an optional `keyFn` so a caller can key on
//   that instead. Swing callers pass nothing and get the original behavior.
//   Trap 2 — do NOT share the storage key. `pruneAcks` keeps a key only if it's in
//   `liveItems` or younger than `maxAgeDays`; if both domains shared one blob,
//   pruning against one feed's live items would silently drop the other domain's
//   acks past the cutoff. Use `ATTENTION_ACK_SETTING_KEY`, a separate user_settings
//   row, for attention acks.
//
// ── A PERSISTENT HOME FOR BOTH (issue #140) ──────────────────────────────────
// Acknowledging used to be a one-way door: the item vanished with no record of what
// was cleared, by whom, or when. `buildAckHistory` below reads both `swing_acks` and
// `attention_acks` directly and returns one merged, sorted list — still two separate
// stores (Trap 2 above still applies to how they're WRITTEN), just one shared VIEW for
// reading. It does not fight `pruneAcks`' 120-day aging; it makes that aging answerable
// instead of surprising, by showing every ack still in Supabase, including ones whose
// underlying finding has since resolved.

import { detectSwing, swingItem } from './swing-detect.js';
// businessDate/lastClosedBusinessDay moved to utils/date.js (issue #131 PR review) so a
// UI-layer caller (src/components/PanelControls.js) can use the ABC-cutover-aware "last
// closed day" logic without importing engine/ code. Re-exported here, unchanged signature,
// so this file's existing 13 importers don't need to change.
import { businessDate, lastClosedBusinessDay } from '../utils/date.js';
export { businessDate, lastClosedBusinessDay };

export const ACK_SETTING_KEY = 'swing_acks';
export const ATTENTION_ACK_SETTING_KEY = 'attention_acks';

const dKey = (d) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10);

/**
 * Bucket a store's daily rows into complete trailing weeks, most recent last.
 * Only COMPLETE weeks are returned — a partial current week would read as a collapse
 * every single time, which is exactly how an alarm trains people to ignore it.
 */
export function weeklyBuckets(rows = [], { weeks = 8, asOf = null, now = null } = {}) {
  const sorted = [...(rows || [])].filter(r => r && r.date).sort((a, b) => a.date - b.date);
  if (!sorted.length) return [];
  // Only CLOSED business days count. `asOf` is an explicit override for replay/tests and
  // is taken at face value; otherwise everything from the current business date onward is
  // dropped because that day is still accumulating.
  const cutoff = asOf ? dKey(asOf) : null;
  const openDay = businessDate(now || new Date());
  const usable = sorted.filter(r => {
    const k = dKey(r.date);
    return cutoff ? k <= cutoff : k < openDay;
  });

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
export function buildSwingFeed(rows = [], { storeName = String, asOf = null, now = null, weeks = 8, opts = {} } = {}) {
  const byLoc = {};
  for (const r of (rows || [])) {
    if (!r || !r.loc) continue;
    (byLoc[r.loc] || (byLoc[r.loc] = [])).push(r);
  }
  const out = [];
  for (const loc of Object.keys(byLoc)) {
    const periods = weeklyBuckets(byLoc[loc], { weeks, asOf, now });
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

const defaultAckKey = (item) => item ? `${item.loc}:${item.swing?.to || ''}:${item.severity}` : '';

/** Stable key for one acknowledgement. Changes when the situation changes.
 *  `keyFn` lets a second ack domain key on something other than the swing shape —
 *  see the module doc above. Swing callers pass nothing and get the original key. */
export function ackKey(item, keyFn = defaultAckKey) {
  return keyFn(item);
}

/** Split a feed into what still needs attention and what's been acknowledged. */
export function partitionAcked(items = [], acks = {}, keyFn = defaultAckKey) {
  const pending = [], acked = [];
  for (const i of (items || [])) {
    (acks && acks[keyFn(i)] ? acked : pending).push(i);
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
export function acknowledge(acks = {}, item, who = null, keyFn = defaultAckKey) {
  const k = keyFn(item);
  if (!k) return acks;
  return { ...(acks || {}), [k]: { at: new Date().toISOString(), by: who || null } };
}

/**
 * Drop acknowledgements for situations that no longer exist, so the store doesn't grow
 * without bound. Anything older than `maxAgeDays` goes regardless.
 */
export function pruneAcks(acks = {}, liveItems = [], { maxAgeDays = 120, keyFn = defaultAckKey } = {}) {
  const live = new Set((liveItems || []).map(keyFn));
  const cutoff = Date.now() - maxAgeDays * 864e5;
  const out = {};
  for (const [k, v] of Object.entries(acks || {})) {
    const at = v && v.at ? Date.parse(v.at) : 0;
    if (live.has(k) || at > cutoff) out[k] = v;
  }
  return out;
}

/**
 * One merged, sorted acknowledgement history across BOTH ack domains (issue #140 — "a
 * persistent home for acknowledged items," Needs Attention). Built by reading the raw acks
 * blobs directly, not by cross-referencing the live feeds first — an ack whose underlying
 * finding has since resolved still shows up here (with a `resolved:true` flag) until
 * pruneAcks ages it out at `maxAgeDays` (120 by default, unchanged — the request was to make
 * that aging answerable, not to fight it).
 *
 * Swing keys are always parseable: `${loc}:${week}:${severity}`, one producer, one stable
 * shape (see `defaultAckKey` above) — used directly as a fallback "what" description when the
 * swing itself is no longer live. Attention keys are opaque per-detector ids
 * (`finding-${loc}-${rule}`, `fob-${loc}`, `stale`, ...) with no single safely-parseable shape
 * across every detector; a resolved attention ack falls back to showing the raw id rather than
 * guessing a store from it, which would risk silently misattributing an old ack to the wrong
 * store — the exact class of surprise this feature exists to remove, not reintroduce.
 *
 * `swingItems`/`attentionItems` (today's live feeds) are used ONLY to enrich a still-live
 * entry's row with its real title/severity — a row never depends on a live match to appear.
 */
export function buildAckHistory({ swingAcks = {}, attentionAcks = {}, swingItems = [], attentionItems = [], storeName = String } = {}) {
  const bySwingKey = new Map((swingItems || []).map(i => [ackKey(i), i]));
  const byAttnKey = new Map((attentionItems || []).map(i => [i && i.id, i]));

  const rows = [];

  for (const [key, meta] of Object.entries(swingAcks || {})) {
    const [loc, week, severity] = key.split(':');
    const live = bySwingKey.get(key);
    rows.push({
      key: 'swing:' + key, source: 'swing', loc: loc || null,
      storeName: loc ? storeName(loc) : null,
      what: (live && (live.title || live.detail)) || `Sales swing — week ending ${week}`,
      severity: (live && live.severity) || severity || null,
      resolved: !live,
      at: (meta && meta.at) || null, by: (meta && meta.by) || null,
    });
  }

  for (const [key, meta] of Object.entries(attentionAcks || {})) {
    const live = byAttnKey.get(key);
    rows.push({
      key: 'attention:' + key, source: 'attention', loc: (live && live.loc) || null,
      storeName: (live && live.loc) ? storeName(live.loc) : null,
      what: (live && (live.title || live.detail)) || key,
      severity: (live && live.severity) || null,
      resolved: !live,
      at: (meta && meta.at) || null, by: (meta && meta.by) || null,
    });
  }

  rows.sort((a, b) => (Date.parse(b.at || 0) || 0) - (Date.parse(a.at || 0) || 0));
  return rows;
}
