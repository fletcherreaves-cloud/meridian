-- ── Task Queue tables ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text        NOT NULL,
  tier        int         NOT NULL DEFAULT 2 CHECK (tier IN (1,2,3)),
  priority    int         NOT NULL DEFAULT 2 CHECK (priority IN (1,2,3)),
  status      text        NOT NULL DEFAULT 'backlog'
                CHECK (status IN ('backlog','ready','in_progress','done','blocked','scrapped')),
  description text,
  notes       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "tasks access" ON tasks;
CREATE POLICY "tasks access" ON tasks USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS session_notes (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  body        text        NOT NULL,
  source      text        NOT NULL DEFAULT 'manual',
  consumed    boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE session_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "notes access" ON session_notes;
CREATE POLICY "notes access" ON session_notes USING (true) WITH CHECK (true);

-- ── user_settings table (needed for cross-device projection/AE persistence) ───
CREATE TABLE IF NOT EXISTS user_settings (
  user_id    uuid references auth.users(id) ON DELETE CASCADE,
  key        text    NOT NULL,
  value      jsonb   NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, key)
);
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own settings" ON user_settings;
CREATE POLICY "own settings" ON user_settings
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Task Queue seed — Notes 19 backlog ───────────────────────────────────────
-- Idempotent: skipped if a row with the same title already exists.

INSERT INTO tasks (title, tier, priority, status, description, notes)
SELECT * FROM (VALUES

  -- SAGE
  ('SAGE: Named conversation threads (save/restore)',
   2, 2, 'backlog',
   'Allow saving SAGE threads by name to Supabase, viewable history at top of panel. Currently single-thread localStorage only (SAGE_THREAD_KEY). Needs: sage_threads table (user_id, name, messages jsonb, updated_at). UI: thread picker dropdown + "New thread" + "Save as..." buttons.',
   'Notes 19 item #3a. Single localStorage thread works fine; this is for history + cross-device.'),

  ('SAGE: Saved & scheduled prompts library',
   2, 2, 'backlog',
   'Prompt catalog where user names a prompt and can re-run on demand or on a schedule. Ties into Task Queue. Store in Supabase sage_prompts table. UI: small library icon in SAGE header to open picker modal.',
   'Notes 19 item #3b.'),

  -- Smart Targets
  ('Smart Targets: derive from historical data when no manual target set',
   2, 2, 'backlog',
   'Most stores show no data in Smart Targets because no targets are manually set. Fix: when a store has no target for a metric, compute a store-specific percentile target from laborRows/ctrlRows (e.g. 75th percentile of last 90 days becomes the "target"). Show computed vs manual targets differently.',
   'Notes 19 item #4. The computeSmartTargets() function in smart-targets.js needs fallback logic.'),

  -- EOM / eBOS
  ('EOM Supervisor: wire qsr_ebos_daily actuals into Op Supply row',
   2, 1, 'backlog',
   'EOM Supervisor only shows projOpSup (budget from monthly_targets). qsr_ebos_daily has actual purchase totals per store per day — sum them for the EOM period to get actual Op Supply cost vs budget. Wire this into the EOM panel as "Actual" vs "Budget" on the Op Supply line.',
   'Notes 19 item #5. qsr_ebos_daily is already automated and populated.'),

  -- Login / PWA
  ('PWA manifest: "Add to Home Screen" iPhone experience',
   1, 2, 'backlog',
   'Add web app manifest (manifest.json) so iPhone users get a persistent sandboxed app icon when they use "Add to Home Screen". Prevents browser-session expiry issues since PWA localStorage is sandboxed per origin (not cleared with browser data). Needs: manifest.json, apple-touch-icon, meta tags in index.html.',
   'Notes 19 item #8. Supabase session cookie is 7 days; main issue is cross-device localStorage not syncing.'),

  -- At A Glance
  ('At A Glance: auto-populate from qsr_daily_activity and schedRows',
   2, 2, 'backlog',
   'Currently At A Glance (home dashboard) only shows what was manually uploaded. Populate key stats automatically from qsr_daily_activity (daily sales pace, DT speed) and schedRows (labor schedule). Show a "live" section alongside uploaded data.',
   'Notes 19 item #7a.'),

  ('At A Glance: collapsible sections on mobile',
   1, 3, 'backlog',
   'Make loaded data sections and action items collapsible inline (not just toggle-off in config menu). Each section needs an expand/collapse toggle — important for iPhone where screen space is limited. The section config system already exists (DEF_SECS in analytics.js); needs inline toggle UI.',
   'Notes 19 item #7b. See AtAGlance component in src/views/analytics.js.'),

  -- SAGE RBAC
  ('SAGE: RBAC-aware responses (tailor to caller role)',
   2, 3, 'backlog',
   'SAGE should know the caller role (from ds.userProfile.role or profiles table) and tailor responses accordingly. GMs should see store-only context; DOs should see district. Pass role into buildSystemPrompt() and adjust the system prompt to scope available tools/data.',
   'Mentioned in CLAUDE.md top-priorities. Low urgency until second user added.'),

  -- API / Settings sync
  ('Settings sync: audit which settings are not yet in Supabase',
   1, 3, 'backlog',
   'User noted that some settings do not persist from desktop to phone. Most are already in org_config; audit what is still localStorage-only. Candidates: EOM manual overrides (op_supply_actuals), DT Speed filter preference, date range preference, anomFilter. Each needs its own user_settings key or org_config column.',
   'Notes 19 item #9. user_settings table now exists (v4.391).'),

  -- Projections yearly view
  ('Projections: yearly view / annual rollup',
   2, 3, 'backlog',
   'Add yearly projections view in Projection Workspace showing all 12 months in one table. Can use loadYearlyTargets() which already exists in App.js. Show YTD actual vs annual target.',
   'Mentioned in CLAUDE.md next-candidate areas.'),

  -- Purchases EOM drill-down
  ('DT Speed of Service: show patch/store drill-down in trend chart',
   2, 3, 'backlog',
   'DT Speed panel has patch filtering now, but no time-series chart showing trend over the selected period. Add a simple line or bar chart (using Chart.js already imported) showing average DT by week for the selected filter.',
   'Stretch enhancement after v4.391 patches fix.'),

  ('Signals: investigate DT data source accuracy vs 3 Peaks',
   1, 2, 'backlog',
   'Confirm that qsr_daily_activity dt_untilserve values match what 3 Peaks/QSRSoft reports for DT speed. If units differ (ms vs s) or the metric definition differs (untilserve vs ordertoserve), the DT Speed panel could be showing wrong numbers.',
   'Precautionary — the trend 0s bug fix (v4.391) assumed correct units.')

) AS t(title, tier, priority, status, description, notes)
WHERE NOT EXISTS (
  SELECT 1 FROM tasks WHERE tasks.title = t.title
);
