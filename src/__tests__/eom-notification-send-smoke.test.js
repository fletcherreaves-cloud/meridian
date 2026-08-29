// @ts-nocheck
// Dispatch #211 Task 3 — the smoke-test script itself (scripts/test-eom-notification-send.mjs)
// gets at minimum a mocked-fetch test proving it constructs correct requests using the REAL
// send functions. This does NOT prove the RESEND_API_KEY secret is valid or that either message
// actually arrives — that is a live, post-merge, human-confirmed step (PR body says so
// explicitly). This only proves the wiring: obviously-fake test content, both channels, correct
// recipients, via the real scripts/lib/resend-notify.mjs functions (not a reimplementation).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { main, TEST_ROW, TEST_STORE_INFO } from '../../scripts/test-eom-notification-send.mjs';
import { EMAIL_TO, SMS_TO } from '../../scripts/lib/resend-notify.mjs';

let originalFetch, originalExit, originalLog, originalError;
beforeEach(() => {
  originalFetch = global.fetch;
  originalExit = process.exit;
  originalLog = console.log;
  originalError = console.error;
  process.env.RESEND_API_KEY = 'test-key-smoke';
  process.exit = vi.fn();
  console.log = vi.fn();
  console.error = vi.fn();
});
afterEach(() => {
  global.fetch = originalFetch;
  process.exit = originalExit;
  console.log = originalLog;
  console.error = originalError;
  delete process.env.RESEND_API_KEY;
  vi.restoreAllMocks();
});

describe('scripts/test-eom-notification-send.mjs', () => {
  it('sends ONE real-shaped test email and ONE real-shaped test text via the actual send functions, both obviously fake', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock;

    await main();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [emailCall, smsCall] = fetchMock.mock.calls;
    const emailBody = JSON.parse(emailCall[1].body);
    const smsBody = JSON.parse(smsCall[1].body);

    expect(emailBody.to).toEqual([EMAIL_TO]);
    expect(smsBody.to).toEqual([SMS_TO]);
    // Content is unmistakably a test, not a real EOM event.
    expect(JSON.stringify(TEST_ROW)).toMatch(/dispatch #211 verification/i);
    expect(TEST_STORE_INFO.name).toMatch(/TEST STORE/i);
    expect(emailBody.html).toMatch(/dispatch #211 verification/i);
  });

  it('exits non-zero and does not throw when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY;
    await main();
    expect(process.exit).toHaveBeenCalledWith(1);
  });

  it('exits non-zero (but does not throw) when Resend rejects a send', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'boom' });
    await main();
    expect(process.exit).toHaveBeenCalledWith(1);
  });
});
