#!/usr/bin/env node
// scripts/news-rss-pull.mjs — local-news RSS sync (Notes 59)
//
// Pulls the nine confirmed local-news feeds in src/engine/news-sources.js, classifies
// every item, attributes it to the store(s) it is about, drops the noise, and upserts
// what is left to public.news_mentions (supabase/schema-news-mentions.sql).
//
// THE ENGINES ARE IMPORTED, NOT REIMPLEMENTED. rss.js / news-classify.js / locality.js
// are the same modules the app uses, so the nightly pull and the UI can never disagree
// about what counts as noise or which store a story belongs to. Nothing here duplicates
// their logic; this file is transport, orchestration and persistence only.
//
// TWO FEED SHAPES (see news-sources.js):
//   townnews  — accepts a `q=` keyword, so we ask the OUTLET to pre-filter. One request
//               per DISTINCT search term in that outlet's region: Ardmore has two stores
//               but one term, so the terms are deduped rather than fired per store.
//   wordpress/sinclair — no keyword support. Pull the whole feed once, attribute locally.
//
// Required env (write mode only):
//   VITE_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Optional:
//   --dry-run / NEWS_DRY_RUN=1  — fetch, parse, classify, report. NO Supabase write.
//   NEWS_FEEDS=kten,adanews     — restrict to these feed ids (default: all active)
//   NEWS_TERM_LIMIT=5           — cap distinct q= terms per TownNews outlet (0 = no cap)
//   NEWS_DELAY_MS=1200          — pause between requests (politeness)
//   NEWS_TIMEOUT_MS=20000       — per-request timeout
//   NEWS_DEBUG=1                — per-item logging
//
// Politeness is a hard requirement here, not a nicety: these are small newsroom servers
// and we are an uninvited (if legitimate) consumer. Requests are serialised with a delay,
// carry a real user-agent, and time out. A 429 or a dead outlet is logged and skipped —
// one publisher having a bad day must never abort the run for the other eight.

import { createClient } from '@supabase/supabase-js';
import { activeFeeds, feedUrl } from '../src/engine/news-sources.js';
import { parseFeed } from '../src/engine/rss.js';
import { classify } from '../src/engine/news-classify.js';
import { attribute, searchQuery, LOCALITIES } from '../src/engine/locality.js';

const DRY_RUN = process.argv.includes('--dry-run') || process.env.NEWS_DRY_RUN === '1';
const DEBUG = process.env.NEWS_DEBUG === '1';
const DELAY_MS = Number(process.env.NEWS_DELAY_MS ?? 1200);
const TIMEOUT_MS = Number(process.env.NEWS_TIMEOUT_MS ?? 20000);
const TERM_LIMIT = Number(process.env.NEWS_TERM_LIMIT ?? 0);   // 0 = no cap
const ONLY = (process.env.NEWS_FEEDS || '').split(',').map(s => s.trim()).filter(Boolean);

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36';

const supabase = DRY_RUN
  ? null
  : createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── Article identity ─────────────────────────────────────────────────────────
// The PK half that makes a re-run idempotent. Feeds are rolling windows, so the same
// article shows up for days; a TownNews outlet also returns it under several q= terms in
// a single run. The guid (falling back to the link) is the publisher's own id for the
// item — normalise away the cosmetic differences and key on that.
function itemKey(item) {
  let k = String(item?.guid || item?.link || item?.title || '').trim();
  if (/^https?:\/\//i.test(k)) {
    try {
      const u = new URL(k);
      // Campaign params are per-referrer decoration, not article identity.
      for (const p of [...u.searchParams.keys()]) {
        if (/^(utm_|fbclid|gclid|mc_cid|mc_eid)/i.test(p)) u.searchParams.delete(p);
      }
      u.hash = '';
      u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
      k = u.toString().replace(/\/$/, '');
    } catch { /* not a parseable URL — use it verbatim */ }
  }
  return k.slice(0, 400);
}

// ── Which q= terms to ask each TownNews outlet for ───────────────────────────
// searchQuery(loc, {style:'plain'}) yields ONE unquoted word (quoted phrases break these
// endpoints). Several stores collapse to the same term — Ardmore's two stores are one
// term — so dedupe before firing. Terms are keyed by the locs they came from purely for
// the log; attribution is always redone from the article text, never assumed from the term.
function termsForFeed(feed) {
  const byTerm = new Map();
  for (const l of LOCALITIES) {
    if (feed.region && l.state !== feed.region) continue;
    let term = null;
    try { term = searchQuery(l.loc, { style: 'plain' }); } catch { term = null; }
    if (!term) continue;
    if (!byTerm.has(term)) byTerm.set(term, []);
    byTerm.get(term).push(l.loc);
  }
  const terms = [...byTerm.keys()];
  return TERM_LIMIT > 0 ? terms.slice(0, TERM_LIMIT) : terms;
}

// ── Transport ────────────────────────────────────────────────────────────────
// Returns { xml } | { rateLimited: true } | { error }. Never throws: the caller must be
// able to keep going through a dead outlet.
async function fetchFeed(url) {
  try {
    const resp = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        'User-Agent': UA,
        'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (resp.status === 429) {
      const retry = resp.headers.get('retry-after');
      return { rateLimited: true, error: `HTTP 429 rate-limited${retry ? ` (retry-after ${retry})` : ''}` };
    }
    if (!resp.ok) return { error: `HTTP ${resp.status}` };
    return { xml: await resp.text() };
  } catch (e) {
    return { error: e.name === 'TimeoutError' ? `timeout after ${TIMEOUT_MS}ms` : e.message };
  }
}

// ── One request's worth of items, folded into the run-wide accumulator ───────
// `acc` is keyed by item_key so an article seen under three q= terms, or on three
// consecutive feed pages, becomes ONE record with the terms merged.
function absorb(xml, feed, term, acc, stat) {
  const items = parseFeed(xml);
  stat.items += items.length;
  for (const item of items) {
    const cls = classify(item);
    if (cls.tier === 'noise') { stat.noise++; continue; }

    const att = attribute(`${item.title || ''} ${item.summary || ''}`);
    // No store in it at all → it isn't about us. Dropping here rather than storing with
    // an empty loc keeps the (item_key, loc) PK honest and the table free of filler.
    if (!att.locs.length) { stat.unattributed++; continue; }

    const key = itemKey(item);
    if (!key) { stat.unattributed++; continue; }

    const prev = acc.get(key);
    if (prev) {
      if (term && !prev.terms.includes(term)) prev.terms.push(term);
      stat.dupes++;
      continue;
    }
    acc.set(key, {
      item_key: key,
      feed_id: feed.id,
      outlet: feed.outlet,
      title: (item.title || '').slice(0, 600),
      url: item.link || null,
      published: item.published instanceof Date ? item.published.toISOString() : null,
      summary: (item.summary || '').slice(0, 2000) || null,
      tier: cls.tier,
      signals: cls.signals,
      score: cls.score,
      locs: att.locs,
      ambiguous: att.ambiguous,
      terms: term ? [term] : [],
    });
    stat.kept++;
    if (cls.tier === 'brand') stat.brand++;
    if (DEBUG) console.log(`    · [${cls.tier}] ${att.locs.join('/')} — ${item.title}`);
  }
}

// One row per (article, attributed store) — see the schema comment for why the fan-out
// lives in the PK rather than in an array column alone.
function toRows(rec) {
  const now = new Date().toISOString();
  return rec.locs.map(loc => ({
    item_key: rec.item_key,
    loc,
    feed_id: rec.feed_id,
    outlet: rec.outlet,
    title: rec.title,
    url: rec.url,
    published: rec.published,
    summary: rec.summary,
    tier: rec.tier,
    signals: rec.signals,
    score: rec.score,
    locs: rec.locs,
    ambiguous: rec.ambiguous,
    query_terms: rec.terms,
    updated_at: now,
    // first_seen is deliberately NOT sent: the column default fires on INSERT only, so
    // the first sighting survives every subsequent nightly upsert.
  }));
}

async function upsertRows(rows) {
  if (!rows.length) return 0;
  const CHUNK = 500;
  let saved = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from('news_mentions')
      .upsert(rows.slice(i, i + CHUNK), { onConflict: 'item_key,loc' });
    if (error) {
      // Same tolerance as the inv_count_sessions block in qsrsoft-onhand-pull.mjs: the
      // table may not have been created yet. Warn, keep the run green.
      console.warn('[news_mentions] upsert error (table may not exist yet — run supabase/schema-news-mentions.sql):', error.message);
      return saved;
    }
    saved += Math.min(CHUNK, rows.length - i);
  }
  return saved;
}

// ── Run ──────────────────────────────────────────────────────────────────────
async function main() {
  const feeds = activeFeeds().filter(f => !ONLY.length || ONLY.includes(f.id));
  if (!feeds.length) { console.error('[news-pull] no active feeds selected'); process.exit(1); }

  // Build the whole request plan up front so the log can state the cost before spending it.
  const plan = [];
  for (const feed of feeds) {
    if (feed.keyword) {
      for (const term of termsForFeed(feed)) {
        let url = null;
        try { url = feedUrl(feed, term); }
        catch (e) { console.warn(`  ! ${feed.id}: skipping term "${term}" — ${e.message}`); continue; }
        plan.push({ feed, term, url });
      }
    } else {
      plan.push({ feed, term: null, url: feedUrl(feed) });
    }
  }

  console.log(`[news-pull] ${feeds.length} feeds · ${plan.length} requests · ${DELAY_MS}ms apart${DRY_RUN ? ' · DRY RUN (no Supabase write)' : ''}`);

  const acc = new Map();
  const stats = {};
  const statOf = id => (stats[id] ||= { requests: 0, failed: 0, rateLimited: 0, items: 0, noise: 0, unattributed: 0, dupes: 0, kept: 0, brand: 0 });

  for (let i = 0; i < plan.length; i++) {
    const { feed, term, url } = plan[i];
    const stat = statOf(feed.id);
    stat.requests++;
    if (i) await sleep(DELAY_MS);

    const res = await fetchFeed(url);
    if (res.error) {
      stat.failed++;
      if (res.rateLimited) stat.rateLimited++;
      console.warn(`  ! ${feed.id}${term ? ` q=${term}` : ''}: ${res.error}`);
      continue;   // one bad outlet must not abort the run
    }
    absorb(res.xml, feed, term, acc, stat);
    if (DEBUG) console.log(`  ${feed.id}${term ? ` q=${term}` : ''}: ${stat.items} items so far`);
  }

  // ── Report ────────────────────────────────────────────────────────────────
  console.log('\n[news-pull] per-feed:');
  console.log('  feed            req  fail  429   items  noise  no-loc  dupes   kept  brand');
  for (const f of feeds) {
    const s = statOf(f.id);
    console.log(`  ${f.id.padEnd(14)}${String(s.requests).padStart(4)}${String(s.failed).padStart(6)}${String(s.rateLimited).padStart(5)}${String(s.items).padStart(8)}${String(s.noise).padStart(7)}${String(s.unattributed).padStart(8)}${String(s.dupes).padStart(7)}${String(s.kept).padStart(7)}${String(s.brand).padStart(7)}`);
  }

  const records = [...acc.values()];
  const rows = records.flatMap(toRows);
  const totals = Object.values(stats).reduce((a, s) => {
    for (const k of Object.keys(s)) a[k] = (a[k] || 0) + s[k];
    return a;
  }, {});
  const byLoc = {};
  for (const r of rows) byLoc[r.loc] = (byLoc[r.loc] || 0) + 1;

  console.log(`\n[news-pull] ${totals.items} items fetched · ${totals.noise} noise-dropped · ${totals.unattributed} with no store · ${totals.dupes} duplicate sightings`);
  console.log(`[news-pull] ${records.length} unique articles attributed (${totals.brand} brand-tier) → ${rows.length} (article, store) rows across ${Object.keys(byLoc).length} stores`);
  if (totals.rateLimited) console.log(`[news-pull] ⚠️ ${totals.rateLimited} request(s) rate-limited (HTTP 429) — raise NEWS_DELAY_MS or re-run later`);

  const sample = records.slice().sort((a, b) => (b.score - a.score) || String(b.published || '').localeCompare(String(a.published || ''))).slice(0, 15);
  if (sample.length) {
    console.log('\n[news-pull] top attributed headlines:');
    for (const r of sample) {
      console.log(`  [${r.tier}] ${r.locs.join('/')}${r.ambiguous ? ' (ambiguous)' : ''} · ${r.feed_id} · ${(r.published || '').slice(0, 10)} — ${r.title}`);
    }
  }

  if (DRY_RUN) { console.log(`\n[news-pull] ✓ dry run — ${rows.length} rows NOT written`); return; }

  const saved = await upsertRows(rows);
  console.log(`\n[news-pull] ✓ ${saved}/${rows.length} rows upserted to news_mentions`);
}

main().catch(err => { console.error('[news-pull] fatal:', err); process.exit(1); });
