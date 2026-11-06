// @ts-nocheck
export default {version:'5.653', date:'2026-11-06', changes:[
  '**Error-telemetry capture, Phase 1** (memory/plan-error-telemetry-auto-fix-2026-11-06.md, ' +
  'task #103, owner-approved design). Every real panel crash (`ErrorBoundary.componentDidCatch`, ' +
  '`features/session.js`) now fires a best-effort, fire-and-forget `reportRuntimeError()` call ' +
  'alongside its existing `console.error` — never awaited, never able to surface a SECOND error ' +
  'on top of the one that just crashed the panel. Writes a deduplicated row (fingerprint = hash ' +
  'of message + top stack frame + panel, stable across a rebuild\'s shifted line numbers) to a ' +
  'new `runtime_error_reports` table: the same bug bumps one row\'s `occurrence_count`/' +
  '`last_seen_at` instead of growing a new row per occurrence. No PII — message/stack/panel only. ' +
  '**New SQL migration `supabase/schema-runtime-error-reports.sql` needs the OWNER to run it** ' +
  'in the Supabase SQL editor before any report is actually stored; until then this self-heals ' +
  'silently (no console noise, no thrown error) against the missing table — nothing breaks either ' +
  'way. Deliberately NOT in this round, per the plan doc\'s own phasing and owner-approved ' +
  'decisions: no `[sweep:runtime-errors]` rotation entry, no in-app viewer, no push/email ' +
  'notification. Rows just accumulate for now.',
]};
