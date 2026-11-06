// @ts-nocheck
export default {version:'5.651', date:'2026-11-06', changes:[
  '**New: Quick-Capture Phase 1 — "‼ Log something" entry point** (memory/plan-overnight-notes-' +
  '72-2026-11-06.md §1, task #101, owner-approved sequencing). A front-screen capture flow, ' +
  'always reachable from the top bar (next to SAGE), not buried three clicks into a store tab: ' +
  'pick a category (reuses the existing EVENT_TYPES taxonomy, `constants.js`, unchanged), quick-' +
  'suggest chips or a genuine free-text fallback, then log it. Writes through `saveOrgEvents()` — ' +
  'the SAME pipeline the Events Calendar already uses — so a quick-captured event is ' +
  'indistinguishable downstream from a hand-typed one. On submit, shows back the REAL measured ' +
  'historical impact for that event type at that store from the Event Impact Registry (never an ' +
  'invented number; honestly says "no history yet" on a first occurrence). Deliberately no ' +
  'badges/streaks/gamification — the plan doc explicitly rejects that register for this app\'s ' +
  'tone; the real measured number IS the feedback loop.\n\n' +
  '**SAGE\'s 13th tool: `log_event`.** The same write pipeline is now also reachable through ' +
  'natural language — SAGE can log an event mid-conversation and report its measured impact, no ' +
  'second schema. All 12 prior tools stay read-only; this is SAGE\'s first write capability. RBAC-' +
  'scoped the same way every query tool already is — a restricted caller cannot log an event for ' +
  'a store outside their own accessible_locs. Needs a `sage-chat` edge-function redeploy to go ' +
  'live (flagged as a follow-up, not claimed live here).\n\n' +
  '**Logged events now feed Signals\' Scanner.** New "Logged Events" metric category ' +
  '(`signal-registry.js`) — one 0/1 flag per EVENT_TYPE_GROUPS category (Weather/Store Events/' +
  'Community/Competition/Operations/School Calendar/Retail), synthesized over the real-data ' +
  'universe exactly the way the existing Weather/Calendar day-of-week groups already are, so a ' +
  'logged event is now one more correlatable series in the Scanner\'s Pearson/Spearman sweep. ' +
  'Store-scoped events only in this phase (a district/state-scoped event isn\'t counted per-store ' +
  'yet) — a deliberate, named Phase 1 scope limit, not an oversight.\n\n' +
  '19 new tests across the pure event-assembly/impact-lookup helpers (`engine/quick-capture.js`), ' +
  'the panel\'s real render+submit flow, and the Scanner wiring. Full suite and build clean.',
]};
