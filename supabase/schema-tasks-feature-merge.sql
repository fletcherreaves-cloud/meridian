-- ============================================================================
-- Dispatch #194 — merge Feature Requests into Task Queue with a `type` field
-- ============================================================================
-- Owner-approved 2026-08-10 (memory/decisions-panel-inventory-2026-08-10.md):
-- "Feature Requests -> merge into Task Queue with a type field."
--
-- `public.tasks` gains the columns Feature Request rows need (type, submitted_by,
-- dev_notes, completed_version, votes, is_seed) and a widened `status` CHECK that
-- also accepts the Feature-Request-only stages (idea/planned/declined) alongside
-- the existing Task stages. `in_progress`/`done` are shared between both types —
-- Feature Requests' 'in-progress'/'completed' map onto them 1:1, so there is no
-- separate 'completed' status.
--
-- `public.feature_requests` is left in place, untouched and unused going forward
-- (its 2 live rows are copied into `tasks` by the companion migration script,
-- scripts/migrate-feature-requests-to-tasks.mjs) -- nothing here drops it, so the
-- original data survives even if the copy needs to be redone.
--
-- Idempotent, safe to run any time.
-- ============================================================================

alter table public.tasks add column if not exists type text not null default 'task';
alter table public.tasks add column if not exists submitted_by text;
alter table public.tasks add column if not exists dev_notes text;
alter table public.tasks add column if not exists completed_version text;
alter table public.tasks add column if not exists votes int not null default 0;
alter table public.tasks add column if not exists is_seed boolean not null default false;

comment on column public.tasks.type is
  'task (default -- bug/troubleshooting/build item, TaskQueuePanel''s original shape) | feature_request (harvested from the retired feature_requests table + FeatureRequestsPanel, dispatch #194).';
comment on column public.tasks.submitted_by is 'Feature-request submitter name. NULL for type=task.';
comment on column public.tasks.dev_notes is 'Feature-request dev commentary, visible to all users (distinct from the private/AI-facing `notes` column). NULL for type=task.';
comment on column public.tasks.completed_version is 'Feature-request "shipped in vX.YYY" badge. NULL for type=task.';
comment on column public.tasks.votes is 'Feature-request upvote count. Always 0 for type=task.';
comment on column public.tasks.is_seed is 'True for the historical roadmap entries harvested from feature-requests.js''s hardcoded SEED_ITEMS array (dispatch #194) -- provenance marker only, not otherwise treated specially.';

-- type CHECK -- new column, no existing constraint to find/drop first.
alter table public.tasks drop constraint if exists tasks_type_check;
alter table public.tasks add constraint tasks_type_check check (type in ('task','feature_request'));

-- status CHECK -- widen the EXISTING constraint rather than assuming its name.
-- scripts/seed-tasks.sql defined it inline (unnamed), so Postgres auto-named it;
-- discover the real name from pg_constraint instead of guessing, so this doesn't
-- silently leave two conflicting CHECKs in place if the guess is wrong.
do $$
declare
  conname text;
begin
  select con.conname into conname
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  join pg_namespace nsp on nsp.oid = rel.relnamespace
  where nsp.nspname = 'public' and rel.relname = 'tasks' and con.contype = 'c'
    and pg_get_constraintdef(con.oid) ilike '%status%';
  if conname is not null then
    execute format('alter table public.tasks drop constraint %I', conname);
  end if;
end $$;

-- Full set is the union of BOTH live vocabularies task-queue.js actually writes (verified
-- against src/views/task-queue.js's TASK_STATUSES/FR_STATUSES/STATUS_META, not assumed):
-- task: backlog/ready/in_progress/done/blocked, plus the scrapped action (line ~740); feature
-- request: idea/planned/in-progress/completed/declined -- note 'in-progress' (hyphen) and
-- 'completed' are genuinely different strings from the task vocab's 'in_progress'/'done', by
-- design (STATUS_META's own comment: "status stays in each backing table's own native
-- vocabulary"). The first shipped version of this constraint (dispatch #194) omitted
-- 'in-progress'/'completed', which passed this file's own idempotent re-run cleanly (an ALTER
-- CHECK add always "succeeds") but broke on the very next real write of either value -- caught
-- live 2026-08-28 when the companion migration script's insert failed with
-- "violates check constraint tasks_status_check". A clean SQL run is not proof the constraint is
-- CORRECT, only that it's syntactically valid -- this needed an actual write to surface.
alter table public.tasks add constraint tasks_status_check
  check (status in ('backlog','ready','in_progress','done','blocked','scrapped','idea','planned','in-progress','completed','declined'));

create index if not exists tasks_type_idx on public.tasks (type);

-- ── VERIFY ──────────────────────────────────────────────────────────────────
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='tasks'
--      and column_name in ('type','submitted_by','dev_notes','completed_version','votes','is_seed');
--   -- expect 6 rows
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conrelid = 'public.tasks'::regclass and contype='c';
--   -- expect the type check + the widened status check

-- ── ROLLBACK ────────────────────────────────────────────────────────────────
-- alter table public.tasks drop constraint if exists tasks_type_check;
-- alter table public.tasks drop constraint if exists tasks_status_check;
-- alter table public.tasks add constraint tasks_status_check
--   check (status in ('backlog','ready','in_progress','done','blocked','scrapped'));
-- alter table public.tasks drop column if exists type;
-- alter table public.tasks drop column if exists submitted_by;
-- alter table public.tasks drop column if exists dev_notes;
-- alter table public.tasks drop column if exists completed_version;
-- alter table public.tasks drop column if exists votes;
-- alter table public.tasks drop column if exists is_seed;
