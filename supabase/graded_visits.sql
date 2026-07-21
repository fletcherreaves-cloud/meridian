-- ── Graded Visits (CFV / RGR / Ecosure) ─────────────────────────────────────
-- One row per graded visit. Parsed from the "Comprehensive Visit Report" HTML
-- (src/parsers/graded-visits.js). report_type distinguishes CFV / RGR / Ecosure
-- so all graded visits share one table with adapters per format.
CREATE TABLE IF NOT EXISTS graded_visits (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type  text        NOT NULL DEFAULT 'CFV',   -- CFV | RGR | Ecosure
  loc          text        NOT NULL,                 -- NSN (zero-padded as in report)
  visit_date   date        NOT NULL,
  daypart      text,
  weekpart     text,
  owner        text,
  manager      text,
  visit_by     text,
  score        numeric,                              -- overall %
  pass         boolean,                              -- score >= threshold (80% for CFV)
  channel      text,                                 -- Drive Thru | Curbside | Front Counter | Delivery | Counter
  mobile_app   boolean,                              -- true = app/mobile order, false = traditional, null = unknown
  status          text,                              -- RGR rating word (Acceptable / Outstanding / ...)
  completion_time text,                              -- visit completion time as shown, e.g. "09:30 AM"
  modules      jsonb,                                -- { "Drive Thru": {pct,ach,pos}, "Behind the Counter": {...} }
  raw_title    text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (loc, visit_date, report_type)              -- upsert key (re-drop overwrites)
);
CREATE INDEX IF NOT EXISTS graded_visits_loc_date_idx ON graded_visits (loc, visit_date);

-- Patch already-deployed tables (CREATE TABLE IF NOT EXISTS won't add columns to
-- an existing table). Safe to re-run.
ALTER TABLE graded_visits ADD COLUMN IF NOT EXISTS completion_time text;

-- RLS — mirror the proven client-writable pattern (see reviews table in
-- schema.sql): any authenticated user can read/write. WITH CHECK gates INSERT and
-- UPDATE (the client upserts), USING gates SELECT/UPDATE/DELETE. Without a policy,
-- RLS-enabled tables deny every write ("new row violates row-level security policy").
ALTER TABLE graded_visits ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "graded_visits access" ON graded_visits;
DROP POLICY IF EXISTS "graded_visits rw" ON graded_visits;
CREATE POLICY "graded_visits rw" ON graded_visits
  FOR ALL
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);
