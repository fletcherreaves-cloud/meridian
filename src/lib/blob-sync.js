// @ts-nocheck
// ── Small cloud-synced blob helpers ──────────────────────────────────────────
// Pulled out of labor-tools.js (issue #118) so App.js/session.js/analytics.js can use
// them without statically importing labor-tools.js — a large, otherwise lazy-loaded
// panel module. A static import anywhere pulls the WHOLE module into the main entry
// chunk; that mistake cost ~25KB gzip the first time this was tried (measured, not
// guessed — see the commit this file was added in). This file has no heavy
// dependencies beyond saveUserSetting/loadUserSetting, which are already unavoidably
// in the main bundle (supabase.js is statically imported by App.js itself).
//
// Pattern: localStorage is the instant read/write path; the cloud copy is a
// fire-and-forget mirror. `savedAt` (stamped on every write) is the merge key —
// whichever side is newer wins a hydration, so an in-progress incremental write
// (e.g. Dialed-In's Calibrate All, saving every 5 stores) survives a cloud hydration
// landing mid-run, and a fresher local write is never clobbered by a stale cloud copy.
import { saveUserSetting, loadUserSetting } from './supabase.js';

export function pushBlob(lsKey, settingKey, obj) {
  const stamped = {...obj, savedAt: Date.now()};
  try { localStorage.setItem(lsKey, JSON.stringify(stamped)); } catch {}
  try { saveUserSetting(settingKey, stamped); } catch {}
  return stamped;
}

export function readBlobLocal(lsKey) {
  try { const s = localStorage.getItem(lsKey); return s ? JSON.parse(s) : null; } catch { return null; }
}

// Hydrate a persisted blob: local first (instant), then cloud if it's strictly
// newer. `apply` is called at most twice — once per source that wins.
export function hydrateBlob(lsKey, settingKey, apply) {
  const local = readBlobLocal(lsKey);
  if (local) apply(local);
  loadUserSetting(settingKey).then(remote => {
    if (!remote || typeof remote !== 'object') return;
    if (local && (local.savedAt||0) >= (remote.savedAt||0)) return;
    try { localStorage.setItem(lsKey, JSON.stringify(remote)); } catch {}
    apply(remote);
  }).catch(()=>{});
}

// Normalizes a `pushBlob`-style blob whose payload is a flat map keyed by dynamic IDs
// (Dialed-In's {loc: calibrationResult}) rather than named sub-fields. Spreading
// `savedAt` directly into a flat map (as `pushBlob` does for named-field payloads like
// {summary, dismissed}) would put a `savedAt` KEY inside the data map itself, colliding
// with whatever dynamic ID happens not to exist yet — every consumer that iterates
// Object.keys() on the map would see a bogus entry. So flat-map payloads are pushed
// wrapped as `{data: theMap}` (`pushBlob(lsKey, settingKey, {data: theMap})`), and must
// be unwrapped through this on every read. Also the single place that handles the
// PRE-cloud-sync shape: existing localStorage values written before this wrapper existed
// are the bare flat map itself, no `savedAt` — treated as oldest (0) so any real cloud or
// future local write correctly wins the comparison, instead of silently vanishing from
// display (issue #118).
export function normalizeDialedIn(raw) {
  if (!raw || typeof raw !== 'object') return { data: {}, savedAt: 0 };
  if (raw.data && typeof raw.data === 'object') return { data: raw.data, savedAt: raw.savedAt || 0 };
  return { data: raw, savedAt: 0 }; // legacy flat-map shape, pre-#118
}
