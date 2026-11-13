// @ts-nocheck
export default {version:'5.764', date:'2026-11-13', changes:[
  '**Fix: dual-role RBAC scope resolution — a person holding TWO roles at once now resolves to ' +
  'the union of both (owner-reported: "viewing as Ops Manager (Ashley) only shows her ' +
  'Supervisor patch locations"; Brad Denley, DO + Supervisor over part of his own district, has ' +
  'the same gap).** Root cause: the live "View as role" sandbox (`viewAsAllowedLocs`, ' +
  'curated-home.js) resolved patch-altitude roles (area_supervisor/om/do — they all share that ' +
  'altitude) ONLY against the flat `supervisorGroups()` map keyed by person name — one entry per ' +
  'person, with no room for someone who holds a second role. Now resolves through ' +
  '`assignment-graph.js`’s `resolveScope()` (already built for Performance Review ' +
  'continuity, dispatch #150) first — which already unions every `staff_assignments` row a ' +
  'person holds — and falls back to the flat map only when that person has zero rows, so this ' +
  'is purely additive: nobody’s current view changes unless they’re given rows via the ' +
  'new editor below. Also fixes a narrower version of the same bug in the "View as role" picker ' +
  'itself: its person dropdown used to list ONLY `supervisorGroups()` keys, so a pure DO who ' +
  'holds no separate AS patch of their own (e.g. Hugh Bonner) could not even be selected when ' +
  'simulating "View as DO" — now the union of every name known to any patch-level source.',
  '**New: Roles & Assignments editor (User Management → 🧩 Roles & Assignments, admin/owner ' +
  'only).** Owner’s own proposed shape: list people, auto-populate the obvious ones from ' +
  'the org’s existing supervisor/DO/OM seed data, let an admin add additional role rows by ' +
  'hand, and mark one "★ Primary" per person — Primary decides only their DEFAULT landing ' +
  'altitude/label, never narrows their real resolved scope (always the union of every role they ' +
  'hold). Shows a live "Resolved scope: N stores" preview per person so the union can be seen ' +
  'working, not just trusted. Requires a one-time Supabase migration in this PR ' +
  '(`staff_assignments.is_primary` column + widening its two RLS policies to also admit `owner` ' +
  '— they only ever checked `admin`, a real pre-existing gap against CLAUDE.md’s own RBAC ' +
  'table, which treats `admin`/`owner` as the same top tier) — see `supabase/schema.sql`’s ' +
  'own comments for exactly what to run.',
  '13 new tests (`dispatch-dual-role-rbac-2026-11-13.test.js`): the Ashley (AS+OM) and Brad ' +
  '(DO+Supervisor) scenarios resolving to the real union, the zero-rows fallback staying ' +
  'byte-for-byte unchanged, a malformed cyclic assignment graph failing safe instead of ' +
  'crashing, and the new editor’s add/remove/make-primary flows. Full suite (8000 tests, ' +
  '874 files) and build pass clean (701.04 KB eager, budget 850 KB — +2.02 KB over the prior ' +
  '699.02 KB baseline).',
]};
