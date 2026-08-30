// @ts-nocheck
// CI FAILURE, root-caused and fixed 2026-08-30: real CI (Node 20) crashed on
// "Node.js 20 detected without native WebSocket support" while constructing a REAL SupabaseClient
// with LEAKED, dummy-but-valid-shaped credentials — a value another test file's own env-var stub
// left in process.env for the rest of that Vitest worker, reaching a completely unrelated
// script's guarded-but-unmocked createClient() call. safeCreateClient() (scripts/lib/
// safe-supabase-client.mjs) is the fix every reachable-from-tests pull script now goes through:
// never throws, for ANY reason, so a leaked value can no longer crash whatever script receives
// it, on any Node version, regardless of whether that script is mocked in the current test file.
import { describe, it, expect } from 'vitest';
import { safeCreateClient } from '../../scripts/lib/safe-supabase-client.mjs';

describe('safeCreateClient — never throws (dispatch: CI env-var-leak fix, 2026-08-30)', () => {
  it('returns null when the URL is missing', () => {
    expect(safeCreateClient(undefined, 'some-key')).toBeNull();
    expect(safeCreateClient('', 'some-key')).toBeNull();
  });

  it('returns null when the key is missing', () => {
    expect(safeCreateClient('https://example.supabase.co', undefined)).toBeNull();
    expect(safeCreateClient('https://example.supabase.co', '')).toBeNull();
  });

  it('returns null when both are missing', () => {
    expect(safeCreateClient(undefined, undefined)).toBeNull();
  });

  it('returns null (not a throw) for a malformed/non-URL value — the exact shape a leaked dummy string can take', () => {
    expect(() => safeCreateClient('not-a-url', 'some-key')).not.toThrow();
    expect(safeCreateClient('not-a-url', 'some-key')).toBeNull();
  });

  // A valid-looking URL/key pair is NOT guaranteed to construct successfully — that's the whole
  // point of this fix. On a Node version with no native WebSocket global (Node 20, CI's other
  // matrix leg), @supabase/realtime-js's own construction throws even for genuinely real
  // credentials, which is the exact failure safeCreateClient exists to swallow into null.
  // Asserting unconditional success would re-encode the very Node-version dependency this helper
  // removes. So: assert the UNIVERSAL contract (never throws) unconditionally, and assert the
  // stronger "succeeds and returns a real client" only when this runtime actually has the
  // capability the real library needs — checked directly (globalThis.WebSocket), not inferred
  // from a Node major-version number.
  it('never throws for a genuinely valid-looking URL/key pair, on any Node version', () => {
    expect(() => safeCreateClient('https://example.supabase.co', 'test-key')).not.toThrow();
  });

  const hasNativeWebSocket = typeof globalThis.WebSocket !== 'undefined';
  (hasNativeWebSocket ? it : it.skip)(
    'on a runtime with native WebSocket, constructs a real client object — production behavior unchanged',
    () => {
      const client = safeCreateClient('https://example.supabase.co', 'test-key');
      expect(client).not.toBeNull();
      expect(typeof client).toBe('object');
      expect(typeof client.from).toBe('function');
    }
  );
});
