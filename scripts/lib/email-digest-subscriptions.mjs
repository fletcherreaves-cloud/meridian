// scripts/lib/email-digest-subscriptions.mjs — real per-user opt-in recipients for scheduled
// digest emails.
//
// Owner req (2026-09-01, verbatim): "can we build out a section... to configure email reports?
// ...allow anyone to sign up or opt in to whichever reports they want emailed to them." Replaces
// the hardcoded single-owner EMAIL_TO recipient (dispatch #215's own comment on recipientFor(),
// scripts/lib/eom-digest-notify.mjs, called this out explicitly as a deliberate v1 placeholder
// awaiting "a real per-user contact registry" -- this is that registry).
//
// public.email_digest_subscriptions (supabase/schema-email-digest-subscriptions.sql): one row per
// (user_id, digest_key) a user has opted into -- no row means NOT subscribed. EMAIL_DIGEST_CATALOG
// (src/engine/email-digest-catalog.js) is the fixed list of digest_key values this can ever apply
// to; adding a new scheduled digest to that catalog automatically makes it selectable in the UI,
// no change needed here.

// Returns the deduped list of subscriber emails for one digest_key. `[]` (never throws) when
// Supabase is unavailable, the table doesn't exist yet (schema-email-digest-subscriptions.sql not
// yet run), or nobody has subscribed -- a missing/empty result means "no real subscribers," and
// it is the CALLER's job to decide a fallback (see eom-digest-notify.mjs's recipientsFor() /
// weekly-cycle-digest-send.mjs's main() -- both fall back to EMAIL_TO so a digest never silently
// stops sending during rollout, before anyone has subscribed yet).
export async function loadDigestSubscriberEmails(supabase, digestKey) {
  if (!supabase) return [];
  const { data, error } = await supabase.from('email_digest_subscriptions')
    .select('profiles(email)').eq('digest_key', digestKey);
  if (error) { console.warn(`[email-digest-subscriptions] loadDigestSubscriberEmails(${digestKey}) error:`, error.message); return []; }
  const emails = (data || []).map(r => r.profiles?.email).filter(Boolean);
  return [...new Set(emails)];
}
