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
