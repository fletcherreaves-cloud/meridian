-- ── Local-news mentions ─────────────────────────────────────────────────────
-- Notes 59, local-news backbone. Written nightly by scripts/news-rss-pull.mjs from the
-- nine confirmed RSS feeds in src/engine/news-sources.js.
--
-- WHY THE PK IS (item_key, loc), NOT (item_key):
--   Attribution fans out. Ardmore has TWO stores (3708, 24471) and DeFuniak Springs has
--   two by mailing address (6838, 37566) — see src/engine/locality.js. A town-level story
--   genuinely belongs to both, and locality.attribute() deliberately returns both rather
--   than guessing. One row per (article, store) is also what the per-location RLS policy
--   below needs: a `loc` column it can filter on. The full attribution set is kept in
--   `locs` and `ambiguous` so a consumer can still show "this could be either store"
--   instead of claiming false precision.
--
-- WHY item_key IS A NORMALISED URL/GUID:
--   Feeds are rolling windows — the same article appears in the same feed for days, and
--   a TownNews outlet returns the same article under several q= terms in one run. The
--   feed `guid` (falling back to the link) is the publisher's own identity for the item,
--   so keying on it makes a re-run an UPDATE, not a duplicate. Seen five days running =
--   one row, with first_seen pinned to the first sighting and updated_at moving.
--
-- HONEST LIMITATION: a publisher that reissues an article under a new URL (common on
-- "developing story" updates) lands as a second row. Deduping on title similarity was
-- considered and rejected — it would silently merge distinct stories, which is worse.

create table if not exists public.news_mentions (
  item_key    text        not null,   -- normalised feed guid (or link) — the publisher's article identity
  loc         text        not null,   -- NSN, zero-STRIPPED to match src/engine/locality.js
  feed_id     text        not null,   -- news-sources.js FEEDS[].id — kfor | kten | adanews | …
  outlet      text,                   -- human label, e.g. 'KTEN (Denison/Durant)'
  title       text        not null,
  url         text,
  published   timestamptz,            -- publisher timestamp; NULL when the feed omits/mangles it
  summary     text,
  tier        text        not null,   -- brand | local  (noise is dropped before write)
  signals     text[]      not null default '{}',   -- news-classify.js LOCAL_SIGNALS keys
  score       integer,                -- classify() ordering score: brand beats local
  locs        text[]      not null default '{}',   -- FULL attribution set for the article
  ambiguous   boolean     not null default false,  -- true when the article maps to >1 store
  query_terms text[]      not null default '{}',   -- TownNews q= term(s) that surfaced it (empty for whole-feed pulls)
  tenant_id   uuid        not null default '00000000-0000-0000-0000-000000000001',
  first_seen  timestamptz not null default now(),  -- never re-sent by the pull, so it pins the first sighting
  updated_at  timestamptz not null default now(),
  primary key (item_key, loc),
  constraint news_mentions_tier_chk check (tier in ('brand', 'local'))
);

-- The feed reads are "recent news for these stores" and "recent brand mentions", so
-- date leads in both.
create index if not exists news_mentions_published_idx on public.news_mentions (published desc nulls last);
create index if not exists news_mentions_loc_idx       on public.news_mentions (loc, published desc nulls last);
create index if not exists news_mentions_tier_idx      on public.news_mentions (tier, published desc nulls last);
create index if not exists news_mentions_seen_idx      on public.news_mentions (first_seen desc);

alter table public.news_mentions enable row level security;

-- Tenant isolation, matching the pattern used across the other operational tables.
drop policy if exists news_mentions_tenant on public.news_mentions;
create policy news_mentions_tenant on public.news_mentions
  for all to authenticated
  using (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid)
  with check (tenant_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Per-location restriction, ANDed with the tenant policy above (RESTRICTIVE), so a user
-- only ever sees stores in their accessible_locs. my_locs() returns NULL for unrestricted
-- users. Mirrors supabase/schema-rls-phase2-loc.sql.
--
-- ⚠️ The (select public.my_locs()) SUBSELECT FORM IS LOAD-BEARING — it makes Postgres
-- evaluate my_locs() once per statement as an InitPlan. The unwrapped form re-evaluates
-- it per ROW and caused a production incident here (590ms vs 13.8ms measured on
-- qsr_daily_activity). Do not "simplify" it.
drop policy if exists news_mentions_loc on public.news_mentions;
create policy news_mentions_loc on public.news_mentions
  as restrictive for all to authenticated
  using ( (select public.my_locs()) is null
          or ltrim(loc, '0') in (select unnest((select public.my_locs()))) );

comment on table public.news_mentions is
  'Local-news articles mentioning our towns, one row per (article, attributed store). Written by scripts/news-rss-pull.mjs from the RSS feeds in src/engine/news-sources.js; classified by src/engine/news-classify.js (noise dropped at write time) and attributed by src/engine/locality.js.';
comment on column public.news_mentions.item_key is
  'Normalised feed guid or link. Half the PK — makes a re-run of the nightly pull idempotent for an article that sits in a rolling feed for days.';
comment on column public.news_mentions.loc is
  'One store this article attributes to. An article about a two-store town (Ardmore 3708/24471, DeFuniak Springs 6838/37566) writes one row per store with ambiguous = true.';
comment on column public.news_mentions.locs is
  'The complete attribution set for the article, repeated on every row, so a consumer can show "either store" without a second query.';
comment on column public.news_mentions.first_seen is
  'First time the pull saw this article. The pull never sends this column, so the default fires on INSERT only and the value survives every later upsert.';
