// @ts-nocheck
// EMAIL_DIGEST_CATALOG — the fixed list of scheduled digest emails a user can opt into.
//
// Owner req (2026-09-01, verbatim): "can we build out a section... to configure email reports?
// ...allow anyone to sign up or opt in to whichever reports they want emailed to them." Each
// entry here is a REAL, already-server-side-rendered scheduled email (see the linked script) --
// not a launchable in-app view (that's public.report_subscriptions / "My Reports",
// src/views/report-subscriptions.js, a different, larger effort per its own footnote).
//
// Adding a new scheduled digest to this array is the ENTIRE UI-side change needed to make it
// selectable in EmailDigestSubscriptionsPanel -- the panel, the table (email_digest_subscriptions,
// keyed only by this `key`), and the load/save functions (src/lib/supabase.js) are all generic
// over this list. The SEND side still needs its own script to actually resolve subscribers via
// scripts/lib/email-digest-subscriptions.mjs's loadDigestSubscriberEmails(key) and mail them --
// this catalog only controls what a user can see and toggle.
export const EMAIL_DIGEST_CATALOG = [
  {
    key: 'eom_digest',
    label: 'EOM Digest',
    icon: '📬',
    description: 'Daily roll-up of End-of-Month count completion + FOB status for your scope (district/patch/org/operator), sent during the count window.',
    script: 'scripts/eom-digest-send.mjs',
  },
  {
    key: 'weekly_cycle_digest',
    label: 'Weekly Cycle Digest',
    icon: '📆',
    description: 'Daily digest of every store expected to do its weekly Food+Condiment count today, plus each one\'s real Count Cycle compliance status.',
    script: 'scripts/weekly-cycle-digest-send.mjs',
  },
];
