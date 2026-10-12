// @ts-nocheck
// ── General in-app notification framework (engine layer) ────────────────────────────────────────
// Owner request (2026-09-05, scoped 2026-10-12): customization + delete + auto-fall-off, as a
// framework other features can plug into later, not another EOM-count-specific table. This file
// is the PURE half (shape building/validation, shared UI color map, visibility predicate) --
// src/lib/supabase.js owns the IO (insert/load/count/dismiss/mark-read/auto-clear against the
// `app_notifications` table, supabase/schema-app-notifications.sql), and src/app/shell.js's
// NotificationBell is the one real consumer today, merging this generic source alongside the
// pre-existing, untouched eom_count_notifications rich rendering.
//
// Scoped deliberately small for this pass: no live second producer is wired in yet (EOM count
// notifications keep their own table/rendering exactly as before -- this is additive, not a
// migration). This is the general substrate the NEXT notification-producing feature (a Signals
// anomaly, a stale-stream alert, a forecast-accuracy drop, etc.) plugs into, demonstrated here and
// in src/__tests__/app-notifications.test.js with a synthetic type so "general" isn't just a claim.

export const SEVERITIES = ['crit', 'warn', 'info'];

// Same hex values at-a-glance.js's own sevColor() already uses for crit/warn, so a notification's
// color means the same thing everywhere in the app rather than a second, independently-tuned
// palette for this one surface.
export const SEVERITY_COLOR = { crit: '#ef4444', warn: '#f59e0b', info: 'var(--text3)' };

// Delivery defaults by severity (2026-10-12, owner: push/email "where appropriate and valuable",
// not everything) — crit gets both (something is actually wrong, worth reaching a phone even
// with the app closed), warn gets a push nudge but not an email (worth noticing soon, not inbox-
// worthy), info stays in-app only (no interruption for a plain FYI). A producer can always pass
// notifyPush/notifyEmail explicitly to override either default for a specific notification.
const DELIVERY_DEFAULTS = {
  crit: { push: true, email: true },
  warn: { push: true, email: false },
  info: { push: false, email: false },
};

/**
 * Build one app_notifications row, ready for insertAppNotifications(). Pure -- no network, no
 * DB-assigned fields (id/created_at/read_at/dismissed_at/cleared_at/tenant_id all come from the
 * database itself). Throws on a missing `type` or `title` rather than silently writing a
 * half-formed row a future reader can't make sense of -- this is a producer-facing API, not user
 * input, so a loud failure at build time is correct.
 */
export function buildAppNotification({
  type, loc = null, period = null, severity = 'info', title, detail = null,
  link = null, resolveKey = null, payload = null, notifyPush, notifyEmail,
} = {}) {
  const t = String(type || '').trim();
  const ti = String(title || '').trim();
  if (!t) throw new Error('buildAppNotification: `type` is required');
  if (!ti) throw new Error('buildAppNotification: `title` is required');
  const sev = SEVERITIES.includes(severity) ? severity : 'info';
  const defaults = DELIVERY_DEFAULTS[sev];
  return {
    type: t,
    loc: loc != null ? String(loc) : null,
    period: period != null ? String(period) : null,
    severity: sev,
    title: ti,
    detail: detail != null ? String(detail) : null,
    link: link != null ? String(link) : null,
    resolve_key: resolveKey != null ? String(resolveKey) : null,
    payload: payload != null ? payload : null,
    notify_push: notifyPush != null ? !!notifyPush : defaults.push,
    notify_email: notifyEmail != null ? !!notifyEmail : defaults.email,
  };
}

/** A row is visible in the bell exactly while neither dismissed (manual "delete") nor cleared
 *  (auto fell off because a producer re-checked and the condition resolved). Shared by the
 *  Supabase loaders' own filter AND the UI's client-side state updates, so the two can't drift. */
export function isNotificationVisible(row) {
  return !!row && !row.dismissed_at && !row.cleared_at;
}

/**
 * Given a producer's full current set of still-open resolve_keys for one `type` (freshly
 * recomputed, e.g. "these are the streams still stale right now"), return the resolve_keys from
 * `priorRows` (this type's own currently-open, unresolved rows) that are NO LONGER in that set --
 * i.e. should be auto-cleared. Pure set-difference; src/lib/supabase.js's autoClearAppNotifications
 * does the actual UPDATE, this is what decides WHICH rows that update should target, independent
 * of any database round-trip so it can be unit-tested with synthetic data.
 */
export function resolvedKeys(priorRows, stillOpenResolveKeys) {
  const open = new Set((stillOpenResolveKeys || []).map(String));
  const seen = new Set();
  const out = [];
  for (const r of (priorRows || [])) {
    if (!r || !r.resolve_key || r.dismissed_at || r.cleared_at) continue;
    const k = String(r.resolve_key);
    if (open.has(k) || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
  }
  return out;
}
