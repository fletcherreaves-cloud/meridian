---
name: notes-59-online-reputation
description: Notes 59 (2026-08-07) — owner wants a dedicated online-reputation / social analytics area: Google + Facebook + Yelp + Reddit + 3PO delivery ratings and reviews per location, local news aggregation, and community-sentiment source tracing.
metadata:
  type: project
---

# Notes 59 — Online reputation & social analytics

Owner (2026-08-07). A new capability area, not an extension of an existing panel.

## What was asked for

- **A dedicated analytics area for social/reputation data.**
- **Google Reviews** — track and baseline; capture rating and review text.
- **Facebook** — locate each location's page; capture rating and reviews.
- **Other prominent platforms** — same treatment.
- **News and posts** relating to each location, aggregated into its own section.
- **Deep scans beyond the major sites** — find the localized sources actually driving
  sentiment. Trace where negativity and disinformation originate. *Owner was explicit
  that factual negative information matters just as much as disinformation* — the point
  is to know, not to dismiss. Include subgroups, community groups, chats.
- **Explicitly named:** Reddit, Yelp, the 3PO delivery platforms (DoorDash, Uber Eats,
  GrubHub, Postmates, plus any others found), and — added by the owner in a follow-up —
  **X (Twitter), Instagram and YouTube**.

### Two different classes of source, which need different handling

Worth separating up front, because a single "reviews" data model will not fit both:

| | examples | carries | keyed by |
|---|---|---|---|
| **Rating platforms** | Google, Facebook, Yelp, the 3PO apps | star rating + review text, tied to a specific listing | location listing id |
| **Mention platforms** | X, Instagram, YouTube, Reddit, community groups | posts, videos, comments — no rating at all | *search* for the town / store / brand term |

Rating platforms answer "what is our score." Mention platforms answer "what is being
said, and where did it start" — which is the owner's source-tracing requirement, and the
harder of the two. Mentions have no listing id to key on, so location attribution has to
come from search terms and geo, and will be fuzzy. Expect false positives and design for
review-before-trust rather than auto-attribution.

**Why mention platforms matter operationally, not just for PR:** store 10422 lost ~24% of
its guest traffic over five weeks with no identified operational cause (see
[[notes-58-queue]] #4 and [[swing-detect]]). A local post or video going around is
exactly the sort of thing that produces that shape and is invisible to every operational
metric Meridian already has. The swing alarm firing on a store is a natural trigger to go
look at that store's mention feed for the same window — that link is the real payoff of
building both.

## The owner's sharpest requirement — prominence over recency

> *"I need to paint the picture based on what's online, its current views and what's
> front facing. Even though some comments and reviews and other news may be outdated,
> if they are prominently being displayed as current, then that matters."*

This is a real design constraint and it is easy to get wrong. The natural implementation
sorts by review date; the owner is saying **display position is the metric**, not
recency. A scathing 2023 review pinned at the top of a Google listing is doing damage
today. So the model must capture **where a review appears in the default view**, and
track that over time — not just its timestamp. Most reputation tools do not do this.

## Access strategy — the key insight

The owner **operates these ~27 locations**, so for their own listings there are official
APIs that beat scraping on every axis: completeness, structure, no ToS exposure, no
anti-bot breakage. That path should be exhausted before any scraping is considered.

⚠️ **Known risk to verify:** for franchise brands, the Google Business Profile and
Facebook Page for a location are frequently controlled by **corporate**, not the
franchisee. If McDonald's corporate holds those listings, the owned-listing API route
may be blocked and access has to be requested through the franchisor. Confirm before
building. There may also be a McDonald's franchisee brand/social-media policy that
constrains this.

Research into the concrete API landscape (endpoints, auth, cost, rate limits, historical
availability, and the corporate-ownership question) was commissioned 2026-08-07 in two
parts — rating platforms + news, and the three mention platforms X/Instagram/YouTube.
Findings belong in this file when they land.

Cost is expected to be the deciding factor on the mention side rather than capability:
X's useful API tiers became materially expensive after 2023, and location-level mention
monitoring is exactly the kind of low-volume-but-broad query those tiers price badly. If
the honest answer for a platform is "not economically viable via the official API," that
belongs in this file too — a documented no is more useful than a half-built scraper that
breaks silently.

## Boundaries to build within

Monitoring public sentiment about your own business is ordinary brand management. Two
lines worth keeping on the right side of, as design constraints rather than
afterthoughts:

- **Public sources only.** No joining private groups under false pretenses, and no
  circumventing access controls to read closed communities.
- **Track sources and venues, not people.** "Where is this coming from" should resolve
  to a platform, a group, a thread, a narrative — not a dossier on an individual
  reviewer. Aggregate and attribute to venues; do not build profiles of private
  individuals.

Both are compatible with everything the owner asked for.

## Design notes

- Per-location identity mapping is the first hard problem: each platform has its own id
  (Google Place ID, FB Page ID, Yelp business id, and a separate merchant id per 3PO).
  This needs a resolved, stored mapping table keyed by `loc` — the same
  loc-canonicalization issue that already bites elsewhere in the app.
- Sentiment volume is inherently spiky. Whatever alerting gets built should reuse the
  sustained-run logic in [[swing-detect]] rather than firing on a single bad review.
- Ratings are a ratio (stars ÷ count) — record numerator and denominator per the
  [[notes-57-metric-registry-plan]] §4 rule so period rollups stay correct.
- This is a new persistent data type, so per the standing rule it goes in Supabase.

---

# Research findings (2026-08-07)

## Verdicts

| Platform | Verdict | Cost |
|---|---|---|
| **X (Twitter)** | ✅ **Build** — best value of all | **~$1–3/mo** + ~$25 one-time backfill |
| **YouTube** | ✅ **Build** | **$0** |
| **Instagram** | ❌ **Not viable** via official API — accept the gap | — |
| **TripAdvisor** | ❌ **Don't build** | — |
| Google Business Profile, Facebook, Yelp, Reddit, 3PO, news | research still outstanding | — |

## X — the economics changed, and recently

X **abandoned the old subscription ladder** (Free / Basic $200 / Pro $5,000). It is now
pay-per-use: **$0.005 per post read**, no monthly commitment. Critically,
**full-archive search back to March 2006 is now open to pay-per-use**, not just
Enterprise. Under the old Pro tier this whole idea was uneconomic; it now costs a few
dollars a month for all 27 towns. Most writing online about X API pricing is stale.

- Recent search: 7-day lookback, 450 req/15min. Full archive: 500 results/request, 1 req/sec.
- ⚠️ **Geo operators are documented but practically dead.** `point_radius:`, `place:` etc.
  still appear in the docs with no deprecation notice, but X disabled precise geotagging
  by default in 2019 and only low-single-digit % of posts carry geo. **Use town-name
  keyword matching; the docs will mislead you here.**
- Replies are retrievable via `conversation_id:`.

## YouTube — free, and the quota model changed too

`search.list` **no longer costs 100 units** against the 10,000/day pool. It is now
**1 unit in a separate Search-Queries bucket capped at 100 calls/day** — so 27 town
queries/day fits comfortably. Comments are fully readable (`commentThreads.list`,
1 unit), which matters because the comment section is usually where a specific store
gets named.

⚠️ **Architecture constraint:** YouTube Developer Policies cap retention of non-authorized
API data at **30 calendar days**. Store video IDs and our own derived flags/sentiment;
refresh titles and stats on read; do **not** warehouse raw payloads. This is reportedly
the most commonly violated YouTube policy in BI tools.

## Instagram — no honest path

There is **no keyword search of captions or comments**. The only discovery surfaces are
hashtag search (requires App Review, and hard-capped at **30 unique hashtags per rolling
7 days**), business discovery (needs the handle already), and mentions/comments on
accounts *you own*. A local post reading "the McDonald's in Atoka is disgusting" carries
no hashtag and no @mention, so it is invisible to every one of them. Reels and Stories —
the actual vector for local virality — are the least accessible content on the platform.

Owning the location accounts adds the Mentions API (with webhooks), which is worth
enabling if those accounts exist, but only catches conversation that deliberately tags us.

## TripAdvisor — don't build, for four independent reasons

1. **The API sunsets 2026-08-31** — the legacy Content API is being replaced by Terra and
   existing keys do not transfer.
2. **Storage is contractually prohibited.** Only the Location ID may be cached. Ratings,
   review counts and review text may **not** be persisted. That forbids the entire
   Meridian pattern — a Supabase table you can trend and SAGE can query. There is an
   ambiguous "internally analyze" clause in the Master Terms that arguably covers our
   case, but it sits in tension with the caching policy and would need written
   confirmation.
3. **No owner API.** Unlike Google Business Profile, operating the location grants zero
   API privileges.
4. **The data isn't there** — see below.

### But the ratings themselves are a real operational finding

Lifetime review counts are tiny, yet the pattern is consistent and unflattering. Roughly:
Atoka/OK-area stores carry ~3–13 lifetime reviews; the **Florida panhandle stores carry
3–10× the volume and rate 2.0–2.8, ranking near-last in their towns** (Bonifay 24 reviews
at 2.3, DeFuniak Springs 36 at 2.6 and a second listing at 2.0, Chipley 13 at 2.8).
The FL stores sit on the US-331/I-10 corridor feeding beach traffic — exactly the
traveller who uses TripAdvisor — while OK stores serve local trade that never opens it.

⚠️ **Data-hygiene task for the owner:** **DeFuniak Springs has two listings** at different
addresses. Confirm which we operate, and expect duplicate/stale listings portfolio-wide.

**Suggested handling:** skip the integration; hand-collect the 27 Location IDs once and
eyeball the FL panhandle pages quarterly. ~90% of the available value, ~0% of the
engineering and legal exposure.

## The single highest-value next action

A **one-time X full-archive query over the 5-week window for Atoka (10422)** costs about
$5 and directly tests the viral hypothesis behind that store's 24% traffic loss. If it
comes back empty, the hypothesis is cheaply ruled out and we stop. Do this **before**
building any pipeline.

## Design notes carried forward

- **Disambiguation is the real engineering problem, not access.** `Marietta` also hits
  Georgia; `Duncan`, `Seminole`, `Purcell`, `Harrah`, `Ada` are common words or other
  places. Pin every query with `"McDonald's"` AND the town AND `place_country:US`, and
  hand-tune per store. Distinctive names (Tishomingo, Chickasha, Holdenville) can run looser.
- **Daily mention count per store is just another metric.** It belongs in `METRIC_SOURCES`
  (`src/engine/metric-source.js`) and the Signals registry — then Scanner correlates it
  against sales and guest counts automatically. That answers the real question: not "is
  anyone posting about Atoka" but "did mention volume spike in the week traffic broke."
- ⚠️ **TikTok is arguably the biggest remaining blind spot** — more likely than Instagram
  to be the vector for something local going viral. Not yet in scope; worth adding.

## Vendor fallback (only if in-house proves the concept)

Brand24 publishes pricing: 27 towns needs 27+ keyword slots, which lands at the
**Business tier, $699/mo ($599 annual)** — and that tier caps at 25 keywords, two short.
So realistic full coverage is **$7.2K–$8.4K/year (~$22–26/store/month)**. Sprout's
listening add-on price is unpublished; Brandwatch/Meltwater/Talkwalker are enterprise
contracts, four figures/month minimum.

Two caveats before signing anything: vendor **X coverage degraded broadly after the 2023
licensing changes**, and vendors face the *same* Instagram limits we do, so their IG
coverage is largely hashtag/owned-account based too. **Run the free Brand24 trial with all
27 town names first** — if it surfaces nothing for Tishomingo or Holdenville, the
low-volume rural coverage being sold isn't actually there.
