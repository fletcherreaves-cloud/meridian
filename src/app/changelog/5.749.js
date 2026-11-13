// @ts-nocheck
export default {version:'5.749', date:'2026-11-12', changes:[
  '**Security: camera-hint UI wiring — Phase 1c, the piece that actually puts v5.747/748\'s ' +
  'day-level data on screen.** Until now the specific-day data existed (`security_flagged_events`) ' +
  'but every real render still showed the window, because nothing fetched the dates. ' +
  '`SecurityPanel` now bulk-fetches `security_flagged_events` for every rule currently in play ' +
  'across both Table and Command/Brief (`loadSecurityFlaggedEventsForRules`, one query per ' +
  'distinct rule id, not one per card — same "bulk across everything on screen" shape the ' +
  'existing finding-actions fetch already used), builds one lookup keyed by (rule, loc, subject) ' +
  '(`flaggedDatesKey`), and threads it down through `SubjectRow` → `SubjectDetail`, ' +
  '`SubjectBriefView` → `SecurityBriefingCard`/`SubjectCameraReminder`. `cameraReviewHint()` now ' +
  'genuinely renders "pull footage for Oct 2" instead of "pull footage for Sep 18 – Oct 16" ' +
  'wherever a real flagged day exists — confirmed through the real panel, not the pure helper ' +
  'alone (two new render-level tests: a real flagged row makes the hint name the day, while a ' +
  'sibling rule on the same subject with no matching row correctly still falls back to its ' +
  'window — proves the lookup is keyed per-rule, not a blanket per-subject flag). Still not live ' +
  '(see this same session\'s own note): the PR is in draft, and `security_flagged_events` itself ' +
  'hasn\'t been migrated in production yet. Full suite (7910 tests) and build pass clean.',
]};
