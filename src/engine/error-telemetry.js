// @ts-nocheck
// ── Error telemetry — fingerprint helpers (memory/plan-error-telemetry-auto-fix-2026-11-06.md,
// task #103, Phase 1) ──────────────────────────────────────────────────────────────────────────
// Pure, synchronous helpers behind reportRuntimeError() (src/lib/supabase.js). Kept here, not
// inline in that file, so the fingerprint logic is directly unit-testable without mocking
// Supabase. The fingerprint is computed CLIENT-SIDE from (message, top stack frame, panel) —
// never the full stack, since line/column numbers shift on every deploy's minified bundle and
// would fragment one real bug into a new "fresh" fingerprint every release (plan doc §2).

// Extract the first real call-site line from a stack trace, with its trailing :line:col
// stripped — the plan doc's "top stack frame" is kept stable across rebuilds by dropping exactly
// the part that moves (chunk-hash filenames/line numbers), not the whole frame.
export function topStackFrame(stack) {
  if (!stack) return '';
  const lines = String(stack).split('\n').map(l => l.trim()).filter(Boolean);
  // The first line is usually "Error: <message>" (no call-site info) if `stack` came from a
  // real Error object with a message; skip it when a later "at ..." line exists.
  const frame = lines.find(l => l.startsWith('at ')) || lines[1] || lines[0] || '';
  return frame
    .replace(/:\d+:\d+\)?$/, '')   // trailing ":line:col" or ":line:col)" — the part that drifts
    .replace(/\?[^():]*(?=[():]|$)/, ''); // a cache-busting query string on the file path, if any
}

// Deterministic 32-bit FNV-1a hash, hex-encoded — synchronous and dependency-free (no
// crypto.subtle round-trip needed for a dedup key that only has to be stable, not cryptographic).
function _fnv1a(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// fingerprint = hash of (message, top stack frame, panel) — the exact dedup key the plan doc
// specifies. Same bug, same fingerprint, however many times/users/days it fires; a genuinely
// different bug (different message, different frame, or a different panel) gets its own row.
export function computeErrorFingerprint({ message, stack, panel } = {}) {
  const parts = [
    String(message || '').trim(),
    topStackFrame(stack),
    String(panel || ''),
  ].join('|');
  return _fnv1a(parts);
}
