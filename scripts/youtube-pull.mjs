#!/usr/bin/env node
// ── YouTube mention pull (Notes 59) ─────────────────────────────────────────
// Searches YouTube for videos mentioning our towns and writes the hits to
// news_mentions alongside the RSS feeds, so one panel shows everything.
//
// ⚠️ AN EMPTY RESULT IS THE EXPECTED NORMAL STATE, NOT A FAILURE.
// Measured 2026-08-07 with a live key:
//     "McDonald's" "Durant" "Oklahoma"  → 0
//     "McDonald's" "Atoka" "Oklahoma"   → 0
//     "Atoka" "Oklahoma"                → 5 (crappie fishing, a Reba McEntire restaurant)
// Rural Oklahoma and the Florida panhandle have thin YouTube coverage, the same way they
// do on TripAdvisor and in the RSS brand column. This runs anyway because it is FREE and
// it is insurance: if something about a store ever goes viral, this is where it shows.
//
// QUOTA. search.list sits in its own bucket capped at 100 CALLS/DAY (separate from the
// 10,000-unit pool). 27 towns fits with room. commentThreads.list is 1 unit against the
// big pool and is where a specific store usually gets named — but it is only fetched for
// videos that already look relevant, to stay well inside quota.
//
// RETENTION. YouTube's Developer Policies cap storage of non-authorised API data at 30
// DAYS. We store the video id, title, url and our own derived classification — never a
// raw API payload — and the nightly re-run refreshes anything still live.

import { createClient } from '@supabase/supabase-js';
import { LOCALITIES, searchQuery, attribute } from '../src/engine/locality.js';
import { classify } from '../src/engine/news-classify.js';

const KEY = process.env.YOUTUBE_API_KEY;
const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DRY = process.argv.includes('--dry-run') || process.env.YT_DRY_RUN === '1';
const DAYS = Number(process.env.YT_DAYS || 90);
const MAX_CALLS = Number(process.env.YT_MAX_CALLS || 60);   // stay under the 100/day cap

if (!KEY) { console.error('[yt-pull] YOUTUBE_API_KEY missing'); process.exit(1); }

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function ytSearch(q, publishedAfter) {
  const p = new URLSearchParams({
    part: 'snippet', q, type: 'video', maxResults: '10', order: 'date',
    publishedAfter, regionCode: 'US', relevanceLanguage: 'en', key: KEY,
  });
  const res = await fetch(`https://www.googleapis.com/youtube/v3/search?${p}`,
    { signal: AbortSignal.timeout(25000) });
  const body = await res.json().catch(() => ({}));
  if (body.error) {
    // Quota exhaustion must be loud and must stop the run, not silently return nothing.
    const reason = body.error.errors?.[0]?.reason || '';
    if (reason.includes('quota')) throw new Error(`QUOTA: ${body.error.message}`);
    console.warn(`  [warn] ${body.error.code} ${body.error.message?.slice(0, 90)}`);
    return [];
  }
  return body.items || [];
}

async function main() {
  const after = new Date(Date.now() - DAYS * 86400e3).toISOString().replace(/\.\d+Z$/, 'Z');
  console.log(`[yt-pull] searching ${DAYS}d back${DRY ? ' (dry run)' : ''}`);

  // One query per store, skipping metro towns (searchQuery returns null for `broad`).
  const targets = LOCALITIES.map(l => ({ loc: l.loc, town: l.town, q: searchQuery(l.loc) }))
    .filter(t => t.q).slice(0, MAX_CALLS);

  const rows = new Map();          // item_key|loc → row
  let calls = 0, seen = 0, kept = 0;

  for (const t of targets) {
    let items = [];
    try { items = await ytSearch(t.q, after); calls++; }
    catch (e) {
      if (String(e.message).startsWith('QUOTA')) { console.error(`[yt-pull] ${e.message}`); break; }
      console.warn(`  [warn] ${t.town}: ${e.message}`); continue;
    }
    seen += items.length;

    for (const it of items) {
      const s = it.snippet || {};
      const text = `${s.title || ''} ${s.description || ''}`;
      const cls = classify({ title: s.title, summary: s.description });
      if (cls.tier === 'noise') continue;

      // Attribute from the video text, NOT from which query found it — a query for one
      // town can surface a video about another, and the text is the honest evidence.
      const att = attribute(text);
      const locs = att.locs.length ? att.locs : [t.loc];

      for (const loc of locs) {
        const key = `youtube:${it.id?.videoId}`;
        rows.set(`${key}|${loc}`, {
          item_key: key, loc, feed_id: 'youtube', outlet: s.channelTitle || 'YouTube',
          title: s.title || '(untitled)',
          url: it.id?.videoId ? `https://www.youtube.com/watch?v=${it.id.videoId}` : null,
          published: s.publishedAt || null,
          summary: (s.description || '').slice(0, 500),
          tier: cls.tier, signals: cls.signals, score: cls.score,
          locs, ambiguous: locs.length > 1, query_terms: [t.q],
          updated_at: new Date().toISOString(),
        });
        kept++;
      }
      if (cls.tier === 'brand') console.log(`  ★ BRAND ${t.town} — ${s.title?.slice(0, 60)}`);
    }
    await sleep(300);
  }

  const out = [...rows.values()];
  console.log(`[yt-pull] ${calls} searches · ${seen} videos · ${out.length} rows (${kept} attributions)`);
  for (const r of out.slice(0, 8)) console.log(`  [${r.tier}] ${r.loc} · ${r.title.slice(0, 62)}`);

  if (DRY) { console.log(`[yt-pull] ✓ dry run — ${out.length} rows NOT written`); return; }
  if (!out.length) { console.log('[yt-pull] ✓ nothing to write (expected — see header)'); return; }
  if (!SB_URL || !SB_KEY) { console.warn('[yt-pull] Supabase env missing — not writing'); return; }

  const sb = createClient(SB_URL, SB_KEY, { auth: { persistSession: false } });
  let saved = 0;
  for (let i = 0; i < out.length; i += 500) {
    const { error } = await sb.from('news_mentions')
      .upsert(out.slice(i, i + 500), { onConflict: 'item_key,loc' });
    if (error) console.warn('[yt-pull] upsert error:', error.message);
    else saved += Math.min(500, out.length - i);
  }
  console.log(`[yt-pull] ✓ ${saved}/${out.length} rows upserted`);
}

main().catch(e => { console.error('[yt-pull] fatal:', e.message); process.exit(1); });
