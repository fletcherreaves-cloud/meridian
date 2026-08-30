// safeCreateClient() — CI FAILURE, root-caused and fixed 2026-08-30.
//
// A module-scope `const supabase = (url && key) ? createClient(url, key) : null;` guard (the
// established pattern across this repo's pull scripts) protects against ONE failure mode: a
// missing env var. It does NOT protect against a truthy-but-unusable value reaching
// createClient() — and that happens for real: several test files stub these two env vars to a
// dummy-but-valid-shaped value so an UNRELATED script's guard resolves non-null instead of null,
// and Vitest does not reset process.env between test FILES sharing a worker (nor does it run any
// cleanup hook before its own collection phase has already imported every file's top-level code),
// so that dummy value can reach a completely different, unmocked module's guard. When it does,
// createClient() proceeds past the guard and constructs a REAL SupabaseClient, which on Node 20
// (no native WebSocket) throws while setting up its Realtime sub-client — even with fake
// credentials, even though nothing about this call was ever going to make a real network request.
//
// The actual fix: a module-scope client construction should never be allowed to crash the module
// that constructs it, for ANY reason — missing env vars, a malformed/leaked dummy URL, a Node
// version lacking a dependency Realtime wants, or anything else. Degrading to null is exactly
// what every caller of these guarded `supabase` consts already does when the env vars are simply
// absent (checked via `if (!supabase) return` / equivalent), so this changes no legitimate
// production behavior — a real, working construction still succeeds exactly as before.
import { createClient } from '@supabase/supabase-js';

export function safeCreateClient(url, key) {
  if (!url || !key) return null;
  try {
    return createClient(url, key);
  } catch {
    return null;
  }
}
