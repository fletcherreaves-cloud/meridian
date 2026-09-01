// @ts-nocheck
// Owner req, verbatim (2026-09-01): "allow anyone to sign up or opt in to whichever reports they
// want emailed to them." loadDigestSubscriberEmails() (scripts/lib/email-digest-subscriptions.mjs)
// is the send-side read of email_digest_subscriptions (schema-email-digest-subscriptions.sql) --
// takes `supabase` as a plain parameter, so a hand-built fake client covers it directly, no module
// mocking needed (unlike src/lib/supabase.js's UI-facing pair, which reads a module-scope client).
import { describe, it, expect } from 'vitest';
import { loadDigestSubscriberEmails } from '../../scripts/lib/email-digest-subscriptions.mjs';

function fakeSupabase(rows, error = null) {
  return {
    from: (table) => ({
      select: () => ({
        eq: (col, val) => {
          if (error) return Promise.resolve({ data: null, error });
          return Promise.resolve({ data: rows.filter(r => r._digest_key === val), error: null });
        },
      }),
    }),
  };
}

describe('loadDigestSubscriberEmails', () => {
  it('returns null when Supabase is unavailable, never throws', async () => {
    expect(await loadDigestSubscriberEmails(null, 'eom_digest')).toEqual([]);
  });

  it('maps embedded profiles.email rows, deduped', async () => {
    const supa = fakeSupabase([
      { _digest_key: 'eom_digest', profiles: { email: 'a@x.com' } },
      { _digest_key: 'eom_digest', profiles: { email: 'b@x.com' } },
      { _digest_key: 'eom_digest', profiles: { email: 'a@x.com' } }, // duplicate, e.g. two rows joining the same user oddly
      { _digest_key: 'weekly_cycle_digest', profiles: { email: 'c@x.com' } }, // different digest, must not leak in
    ]);
    const emails = await loadDigestSubscriberEmails(supa, 'eom_digest');
    expect(emails.sort()).toEqual(['a@x.com', 'b@x.com']);
  });

  it('a row with no email (deleted/missing profile) is skipped, not returned as undefined', async () => {
    const supa = fakeSupabase([
      { _digest_key: 'eom_digest', profiles: { email: 'a@x.com' } },
      { _digest_key: 'eom_digest', profiles: null },
    ]);
    expect(await loadDigestSubscriberEmails(supa, 'eom_digest')).toEqual(['a@x.com']);
  });

  it('an empty result (nobody subscribed to this digest) returns []', async () => {
    const supa = fakeSupabase([{ _digest_key: 'weekly_cycle_digest', profiles: { email: 'c@x.com' } }]);
    expect(await loadDigestSubscriberEmails(supa, 'eom_digest')).toEqual([]);
  });

  it('degrades to [] on a query error instead of throwing (e.g. migration not run yet)', async () => {
    const supa = fakeSupabase([], { message: 'relation "email_digest_subscriptions" does not exist' });
    expect(await loadDigestSubscriberEmails(supa, 'eom_digest')).toEqual([]);
  });
});
