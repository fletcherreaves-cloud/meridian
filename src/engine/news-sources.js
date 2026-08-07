// @ts-nocheck
// ── Local news feed registry ─────────────────────────────────────────────────
// Notes 59. Nine outlets covering the towns we operate in. Direct RSS is the cleanest
// path available for this whole module: publishing a feed is an invitation to consume
// it — no ToS grey area, no API key, no cost, no anti-bot brittleness.
//
// TWO PLATFORM BEHAVIOURS THAT MATTER:
//
//   TownNews/CNHI papers accept a `q=` KEYWORD PARAMETER on the RSS endpoint, so we can
//   ask the outlet itself to pre-filter. That is far better than pulling everything and
//   filtering locally. Two gotchas, both learned the hard way:
//     · results sort by DATE, not relevance — expect tail noise
//     · QUOTED PHRASES BREAK THE ENDPOINT — single unquoted terms only
//   (locality.searchQuery(loc, {style:'plain'}) exists for exactly this.)
//
//   WordPress/Sinclair feeds have no keyword parameter — pull the whole feed and
//   attribute locally with locality.attribute().
//
// CONFIRMED DEAD, recorded so nobody re-adds them:
//   · Gannett killed RSS platform-wide — The Oklahoman, NWF Daily News both 404
//   · Gray Television (WJHG, KSWO, KXII) — no RSS
//   · KOCO (Hearst), News 9 / News On 6 — none found
//   · Durant Daily Democrat — no working feed
//   · chipleypaper.com — returns 200 but is a dead WordPress placeholder, still
//     carrying the default "Hello world!" post
// Those gaps are why the research recommended a paid SERP wrapper (~$25/mo) as a
// second tier. Not built here.

export const FEEDS = [
  // ── WordPress / broadcast: whole feed, attribute locally ──
  { id: 'kfor', outlet: 'KFOR (Oklahoma City)', platform: 'wordpress',
    url: 'https://kfor.com/news/local/feed/', keyword: false, region: 'OK' },
  // ⚠️ DISABLED 2026-08-07. okcfox.com/news.rss returns HTTP 200 and a well-formed RSS
  // document titled "Untitled RSS Feed" containing ZERO items — Sinclair's generator is
  // emitting an empty feed. Verified live; this is not a parser fault. Kept here with
  // active:false so nobody re-adds it after seeing the 200.
  { id: 'kokh', outlet: 'KOKH Fox 25 (Oklahoma City)', platform: 'sinclair',
    url: 'https://okcfox.com/news.rss', keyword: false, region: 'OK', active: false,
    disabledReason: 'feed returns 200 with zero items (verified 2026-08-07)' },
  { id: 'wmbb', outlet: 'WMBB (Panama City)', platform: 'wordpress',
    url: 'https://www.mypanhandle.com/news/local-news/feed/', keyword: false, region: 'FL' },
  { id: 'ardmoreite', outlet: 'The Daily Ardmoreite', platform: 'wordpress',
    url: 'https://www.ardmoreite.com/rss/', keyword: false, region: 'OK' },

  // ── TownNews/CNHI: support q= keyword pre-filtering ──
  { id: 'kten', outlet: 'KTEN (Denison/Durant)', platform: 'townnews',
    url: 'https://www.kten.com/search/', keyword: true, region: 'OK' },
  { id: 'adanews', outlet: 'The Ada News', platform: 'townnews',
    url: 'https://www.theadanews.com/search/', keyword: true, region: 'OK' },
  { id: 'duncanbanner', outlet: 'The Duncan Banner', platform: 'townnews',
    url: 'https://www.duncanbanner.com/search/', keyword: true, region: 'OK' },
  { id: 'chickashanews', outlet: 'Chickasha Express-Star', platform: 'townnews',
    url: 'https://www.chickashanews.com/search/', keyword: true, region: 'OK' },
  { id: 'pvdemocrat', outlet: 'Pauls Valley Daily Democrat', platform: 'townnews',
    url: 'https://www.paulsvalleydailydemocrat.com/search/', keyword: true, region: 'OK' },
];

export const FEED_BY_ID = Object.fromEntries(FEEDS.map(f => [f.id, f]));

/** Feeds that actually return items. Use this for scheduled pulls. */
export const activeFeeds = () => FEEDS.filter(f => f.active !== false);

/**
 * Build the fetch URL for a feed. For TownNews outlets a `term` produces a
 * server-side pre-filtered feed; without one you get the outlet's recent articles.
 *
 * `term` MUST be a single unquoted word — quoted phrases break these endpoints.
 */
export function feedUrl(feed, term = null) {
  if (!feed) return null;
  if (feed.platform !== 'townnews') return feed.url;       // no keyword support
  const p = new URLSearchParams({ f: 'rss', t: 'article', l: '50', s: 'start_time', sd: 'desc' });
  if (term) {
    if (/["']/.test(term)) throw new Error(`TownNews q= cannot contain quotes: ${term}`);
    p.set('q', String(term).trim());
  }
  return `${feed.url}?${p.toString()}`;
}

/** Feeds worth querying for a given state. */
export const feedsForRegion = (region) => activeFeeds().filter(f => !region || f.region === region);
