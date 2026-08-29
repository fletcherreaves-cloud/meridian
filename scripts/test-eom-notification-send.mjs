#!/usr/bin/env node
// scripts/test-eom-notification-send.mjs — dispatch #211 Task 3 live smoke test.
//
// A mocked-fetch unit test (src/__tests__/resend-notify.test.js) proves the send functions build
// correct Resend API requests. It cannot prove RESEND_API_KEY is a valid live credential, that
// Resend's shared onboarding@resend.dev sender actually delivers to an arbitrary recipient
// without a verified domain, or that the AT&T email-to-SMS gateway address actually arrives as a
// text on a phone. Those are real unknowns only a live send answers.
//
// Sends ONE real test email (to fletcher.reaves@mcreaves.com) and ONE real test text (to the
// AT&T gateway) using the ACTUAL Task 1 send functions — not a copy, not a curl approximation —
// with obviously-fake content so nothing reads as a real EOM count event.
//
// Run manually (needs a real RESEND_API_KEY in the environment):
//   RESEND_API_KEY=re_xxx node scripts/test-eom-notification-send.mjs
// Or via GitHub Actions: Actions → "QSRSoft On-Hand Pull (EOM Count)" → Run workflow →
// tick "Send a live test notification (dispatch #211 smoke test)" — see the workflow_dispatch
// input added to .github/workflows/qsrsoft-onhand-pull.yml. This does NOT touch Supabase or run
// any real on-hand pull; it only exercises the notification-send path.
//
// This script cannot be run by the agent that wrote it — GitHub Actions secrets (RESEND_API_KEY)
// are only available inside an actual triggered Actions run, never in the sandboxed dev
// environment. Live delivery confirmation is a post-merge step: the PM triggers this (or the
// workflow_dispatch input) and the owner confirms both messages actually arrived.

import { sendEmailNotification, sendSmsViaCarrierGateway } from './lib/resend-notify.mjs';

export const TEST_ROW = {
  loc: '0011657',
  period: '2099-01', // obviously not a real count period
  trigger_kind: 'food_condiment',
  class_statuses: {
    food:       { status: 'complete',    pct: 1.0,  total: 40, counted: 40 },
    condiment:  { status: 'complete',    pct: 0.99, total: 22, counted: 21 },
    paper:      { status: 'not_started', pct: 0,    total: 15, counted: 0 },
    nonproduct: { status: 'in_progress', pct: 0.5,  total: 8,  counted: 4 },
    lateBulk: false, lateBulkDay: null,
  },
  uncounted_items: {
    items: [
      { wrin: 'TEST-1', descr: 'Meridian test send — ignore, dispatch #211 verification', cls: 'condiment', valueAtRisk: 12.34 },
    ],
    totalCount: 1, totalValue: 12.34, truncated: false,
  },
  kb_links: [
    { title: 'What are the Best Counting Practices Using the Mobile Inventory App', url: 'https://support.qsrsoft.com/hc/en-us/articles/360046512394-What-are-the-Best-Counting-Practices-Using-the-Mobile-Inventory-App' },
  ],
};
export const TEST_STORE_INFO = { loc: '0011657', name: 'TEST STORE — dispatch #211 verification, ignore' };

export async function main() {
  if (!process.env.RESEND_API_KEY) {
    console.error('[test-eom-notification-send] RESEND_API_KEY not set in this environment — cannot send a live test.');
    process.exit(1);
    return; // belt-and-suspenders for a mocked process.exit in tests — real Node stops above.
  }
  console.log('[test-eom-notification-send] Sending ONE test email + ONE test text via Resend (dispatch #211 verification)...');
  const emailOk = await sendEmailNotification(TEST_ROW, TEST_STORE_INFO);
  const smsOk = await sendSmsViaCarrierGateway(TEST_ROW, TEST_STORE_INFO);
  console.log(`[test-eom-notification-send] email send ${emailOk ? 'OK (Resend accepted it)' : 'FAILED — see warning above'}`);
  console.log(`[test-eom-notification-send] sms send   ${smsOk ? 'OK (Resend accepted it)' : 'FAILED — see warning above'}`);
  console.log('[test-eom-notification-send] "OK" only means Resend accepted the request — check the actual inbox/phone to confirm delivery.');
  if (!emailOk || !smsOk) process.exit(1);
}

// CLI-run guard (matches scripts/backfill-identity-vault.mjs and others' precedent) — lets
// src/__tests__/eom-notification-send-smoke.test.js import main()/TEST_ROW/TEST_STORE_INFO
// with a mocked fetch, without this module auto-firing a real Resend call on import.
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
