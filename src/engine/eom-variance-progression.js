// @ts-nocheck
// ── Item variance PROGRESSION (Change Monitor v2) ───────────────────────────────────────────────
// Superseded 2026-08-01 by the SESSION model in eom-count-sessions.js. The owner clarified (KB-backed)
// that multiple same-session entries are area-by-area build-up, not recounts — only a session's FINAL
// entry is binding, and "recount helped/hurt" applies solely across separate counting sessions. This
// file now re-exports the session-aware engine so every existing importer stays correct by construction.
export { itemCountSessions, itemVarianceProgression, storeVarianceProgressions } from './eom-count-sessions.js';
