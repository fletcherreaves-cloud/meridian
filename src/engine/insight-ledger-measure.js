// @ts-nocheck
// ── Insight Ledger step 0 — measure real fire volume before building anything (issue #143) ──
// Gate in front of memory/project-insight-ledger.md — nothing else in that design (table,
// writers, panel) starts until this returns numbers. The Ledger's viability rests on one
// assumption: a detector firing for the same store day after day collapses into ONE row with
// fire_count:N, not N rows. 10 detectors x 27 stores x daily is a firehose otherwise, and no
// amount of UI saves a ledger that logs 300 rows a week. That assumption is currently
// unmeasured — this file measures it, nothing more.
//
// THROWAWAY SCAFFOLDING, REMOVABLE IN ONE COMMIT: this file + the one call site that wires
// `onFireVolume` into buildAttentionFeed AND calls hydrateFireVolume on mount (both in
// attention-now.js's useAttentionFeed) + the read-side summary. Delete all three and the
// instrumentation is gone with no trace elsewhere.
//
// NO BEHAVIOR CHANGE: attention-feed.js's buildAttentionFeed return value is byte-identical
// whether or not a caller passes onFireVolume — this module only OBSERVES the per-detector
// arrays buildAttentionFeed already computed; it never touches ranking, ordering, acks, or
// what gets rendered.
//
// SITUATION KEY: reuses attention-feed items' own `.id` directly — the exact same key
// analytics.js's `feedKeyFn` already acks on (`item => item.id`). Not a new scheme, per the
// issue's explicit instruction not to invent a second one.
//
// STORAGE: Supabase user_settings via blob-sync's pushBlob/hydrateBlob (savedAt merge),
// NOT a new table — a week of throwaway counts doesn't need one. Capped by aggregating per
// (day, detector, key): one snapshot per calendar day, so opening the app 20 times in a day
// overwrites the same day's bucket 20 times (idempotent), not 20 rows.
import { pushBlob, readBlobLocal, hydrateBlob } from '../lib/blob-sync.js';

export const FIRE_VOLUME_LS_KEY = 'mf_ledger_fire_volume';
export const FIRE_VOLUME_SETTING_KEY = 'insight_ledger_fire_volume';
// ~6 weeks of daily buckets is generous for a week-long measurement; caps growth if this
// scaffolding is accidentally left running past its measurement window.
const MAX_DAYS = 45;

const todayKey = () => new Date().toISOString().slice(0, 10);

// Build today's snapshot from the SAME per-detector arrays buildAttentionFeed already computed
// — before ranking/capping — so this counts the real fire volume regardless of rankAttention's
// max, per the issue's explicit "don't quietly report the capped figure" instruction.
export function snapshotFireVolume(bySource = {}, max = 15) {
  const byDetector = {};
  const keys = {};
  let total = 0;
  for (const [detector, items] of Object.entries(bySource || {})) {
    const list = items || [];
    byDetector[detector] = list.length;
    total += list.length;
    for (const item of list) {
      if (!item || !item.id) continue;
      keys[item.id] = { detector, title: item.title || null, severity: item.severity || null, loc: item.loc ?? null };
    }
  }
  return { totalItems: total, max, capped: total > max, byDetector, keys };
}

// Merge today's snapshot into the persisted, day-bucketed blob and push it — fire-and-forget,
// called AFTER buildAttentionFeed already has its return value, so this never delays anything
// the caller does with the feed.
export function recordFireVolume(bySource, max) {
  try {
    const snap = snapshotFireVolume(bySource, max);
    const cur = readBlobLocal(FIRE_VOLUME_LS_KEY) || { days: {} };
    const days = { ...(cur.days || {}), [todayKey()]: snap };
    const kept = Object.keys(days).sort().slice(-MAX_DAYS);
    const trimmed = {};
    for (const d of kept) trimmed[d] = days[d];
    pushBlob(FIRE_VOLUME_LS_KEY, FIRE_VOLUME_SETTING_KEY, { days: trimmed });
  } catch (e) { console.warn('[Meridian] fire-volume measurement failed (non-fatal, scaffolding only):', e); }
}

// Cross-device hydration: union the day buckets rather than trusting whichever WHOLE blob has
// the newer `savedAt` — a day recorded on only one device must survive, not get clobbered by a
// fresher blob from a device that never saw that day. (A day recorded on both sides keeps
// whichever copy the incoming blob carries — good enough for throwaway measurement, not meant
// to reconcile to the individual page-load.)
//
// The local snapshot is captured ONCE, before hydrateBlob runs — hydrateBlob's own write path
// overwrites localStorage with the bare cloud copy the moment cloud wins, so reading
// localStorage again inside the apply callback would see that already-overwritten (and
// possibly day-incomplete) copy instead of what was really on this device. The merged result
// is written back so the next recordFireVolume call (and the next hydrate) builds on the union,
// not on whichever side blob-sync's plain last-write-wins happened to leave behind.
export function hydrateFireVolume(onReady) {
  const localSnapshot = readBlobLocal(FIRE_VOLUME_LS_KEY) || { days: {} };
  hydrateBlob(FIRE_VOLUME_LS_KEY, FIRE_VOLUME_SETTING_KEY, (blob) => {
    const merged = { days: { ...(localSnapshot.days || {}), ...(blob.days || {}) } };
    try { localStorage.setItem(FIRE_VOLUME_LS_KEY, JSON.stringify(merged)); } catch {}
    onReady(merged);
  });
}

// Read-side analysis — turns the day-bucketed blob into the numbers the issue actually asks
// for: the collapse ratio (total fires / distinct situation keys), per-detector loudness, and
// first/last-seen per key. Derived from the stored buckets rather than tracked incrementally
// on write, so the write path (recordFireVolume above) stays dead simple.
export function summarizeFireVolume(blob) {
  const days = (blob && blob.days) || {};
  const dayKeys = Object.keys(days).sort();
  const byDetectorTotal = {};
  const keyInfo = {}; // situationKey -> { detector, title, firstSeen, lastSeen, fireDays }
  let totalFires = 0;
  let anyCapped = false;
  for (const dk of dayKeys) {
    const snap = days[dk];
    if (!snap) continue;
    if (snap.capped) anyCapped = true;
    for (const [detector, count] of Object.entries(snap.byDetector || {})) {
      byDetectorTotal[detector] = (byDetectorTotal[detector] || 0) + count;
    }
    for (const [key, meta] of Object.entries(snap.keys || {})) {
      totalFires++;
      const info = keyInfo[key] || (keyInfo[key] = { detector: meta.detector, title: meta.title, firstSeen: dk, lastSeen: dk, fireDays: 0 });
      info.lastSeen = dk; // dayKeys sorted ascending, so the latest write always wins here
      info.fireDays++;
    }
  }
  const distinctKeys = Object.keys(keyInfo).length;
  return {
    daysMeasured: dayKeys.length,
    firstDay: dayKeys[0] || null,
    lastDay: dayKeys[dayKeys.length - 1] || null,
    totalFires,
    distinctKeys,
    collapseRatio: distinctKeys ? totalFires / distinctKeys : 0,
    byDetectorTotal,
    anyCapped,
    keyInfo,
  };
}
