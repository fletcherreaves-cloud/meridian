// @ts-nocheck
export default {version:'5.234', date:'2026-08-28', changes:[
  'Dispatch #194 -- merged Feature Requests into Task Queue with a `type` field ' +
  '(\'task\' | \'feature_request\'), per the owner\'s 2026-08-10 decision. Harvested ' +
  'FeatureRequestsPanel in full: the ~30-item SEED_ITEMS roadmap history (carried over as the ' +
  'same client-side overlay it always was -- never a Supabase row), the Supabase-backed submit/ ' +
  'vote/dev-notes flow (loadFeatureRequests/saveFeatureRequest/updateFeatureRequest/' +
  'voteFeatureRequest, unchanged), and the category/priority taxonomy. Priority unified to Task ' +
  'Queue\'s existing 1/2/3 int scale (same high/medium/low->1/2/3 mapping sage.js\'s Log-Issue ' +
  'flow already used); status stays in each entry\'s own native vocab (backlog/ready/in_progress/' +
  'done/blocked for tasks, idea/planned/in-progress/completed/declined for feature requests) so ' +
  'no live row needed rewriting. `feature-requests` retired from panel-registry.js; the old ' +
  '?modal=feature-requests deep link now opens the merged panel pre-filtered to type:' +
  '\'feature_request\'. supabase/schema-tasks-feature-merge.sql (adds type/submitted_by/' +
  'dev_notes/completed_version/votes/is_seed to `tasks` + widens its status CHECK) and ' +
  'scripts/migrate-feature-requests-to-tasks.mjs (copies the 2 live feature_requests rows, ' +
  'measured via SUPABASE_SERVICE_ROLE_KEY content-range 0-0/2) ship ready-to-run -- this agent ' +
  'session has no Postgres DDL connection (only the REST API), so the physical table merge ' +
  'is a pending owner action, same posture as this repo\'s other schema-*.sql files. Nothing in ' +
  'the shipped code depends on it: the panel reads both `tasks` and `feature_requests` today, ' +
  'tags entries with `type` + an internal source marker, and dedups a `tasks`-table ' +
  'type:feature_request row over its legacy twin once the migration does run.',
]}
