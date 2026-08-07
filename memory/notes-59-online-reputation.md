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
| **Google Business Profile** | ✅ **Build FIRST — the anchor** | **$0** |
| **DoorDash Reporting API** | ✅ **Build second** — only 3PO with a real review feed | **$0** |
| **Local news RSS (direct)** | ✅ **Build** — 9 confirmed feeds | **$0** |
| **Facebook / Meta** | ❌ **Dead** — Meta deprecated reviews entirely | — |
| **Yelp** | ❌ Unusable as built — **24-hour storage limit** | $229–643/mo |
| **Google Places API** | ❌ Not a data source — 5 reviews max, storage banned | — |
| **Uber Eats** | ⚠️ No reviews API — manual portal CSV | — |
| **Grubhub** | ❌ Skip — partner-gated, ~8wk cert, no reviews API found | — |
| **Reddit** | ⚠️ Low priority — signal isn't there for these towns | — |
| **Apple Business Insights** | ⚠️ Nice-to-have — funnel metrics, no reviews | — |
| **Bing** | ❌ Nothing to ingest — no first-party reviews | — |

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

✅ **RESOLVED by the owner (2026-08-07) — it is NOT a duplicate.** The two TripAdvisor
listings are two distinct stores that share a DeFuniak Springs mailing address:

| Store | Address | TripAdvisor listing | Rating |
|---|---|---|---|
| **6838** DeFuniak Springs | 2370 US Highway **331** S | 4610515 (Hwy 331) · 36 reviews | 2.6 |
| **37566** Mossy Head | 17750 State Highway **285** Dr S | 12030001 (SR 285) · 19 reviews | **2.0** |

The highway in each listing name maps them exactly. **Mossy Head is the 2.0-rated store**
— the lowest found in the portfolio. Encoded in [[locality]], which uses the 331-vs-285
highway number to separate them when a mention names one.

**Suggested handling:** skip the integration; hand-collect the 27 Location IDs once and
eyeball the FL panhandle pages quarterly. ~90% of the available value, ~0% of the
engineering and legal exposure.

## The Atoka X backfill — DEFERRED by the owner (2026-08-07)

A one-time X full-archive query over the 5-week window for Atoka (10422) would cost ~$5
and directly test the viral hypothesis behind that store's 24% traffic loss. **The owner
asked to hold the spend and see other results first — keep the method available, do not
run it yet.** Do not re-propose unprompted; raise it again only if other avenues come up
empty or the owner asks.

The method, preserved: X full-archive search (`/2/tweets/search/all`, now open to
pay-per-use at $0.005/post read) over 2026-06-19 → 2026-08-07 using the Atoka query
`searchQuery('10422')` from [[locality]].

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

---

# Research findings, part 2 — rating platforms, 3PO, news (2026-08-07)

## ⚡ PHASE 0 — do this before anything else, costs nothing

**Sign into `business.google.com` with the operator Google account and inventory actual
GBP access across all 27 locations.** This single check determines the entire shape of
the project. Many franchise brands already grant franchisees **Manager** on their own
locations without announcing it — precisely because Managers can respond to reviews. If
that access is already there, the GBP API application can be filed today and the
corporate question never arises.

## Google Business Profile — the anchor

Free, complete, **full historical review text**, **legally storable** (it's our own
business's data), and it supports replying through the API.

- Reviews live in the **legacy My Business API v4.9**, which survived the 2021–22 API
  split. `accounts.locations.reviews` is **not** in the deprecation table and has no v1
  replacement — it is still supported.
- Returns full `comment` text (not truncated), 1–5 `starRating`, reviewer, create/update
  timestamps, and `reviewReply` with state and any policy violation.
- `batchGetReviews` takes an array of locations — **one call across all 27 stores**.
- Paginate `pageSize=50` back to the beginning of each location's history.
- **Auth:** OAuth 2.0, scope `business.manage`. API keys return 401. Fits the existing
  GitHub Actions refresh-token pattern.
- **Quota: 0 QPM until approved, 300 QPM after.** If the console shows 0, that means *not
  approved* — file the access application, **not** a quota increase.
- **Application:** `support.google.com/business/contact/api_default` → "Application for
  Basic API Access." Stated 7–10 business days; real-world 4 days to 6 weeks. Rejections
  cluster on vague use-case text and on the applying email domain not matching the
  business website — **apply from an @mcreaves.com address** and describe the internal
  dashboard concretely. Start this early; it's the long pole.

**Manager role is sufficient.** Google's roles matrix confirms Managers can respond to
reviews and download insights; Owner-only powers are user management, profile deletion,
and editing all URLs. Google's own API FAQ *recommends* third parties be added as manager
rather than owner. Roles are assignable at the **location-group** level, so corporate can
grant "Manager on the Oklahoma group" without exposing anything else — a narrow,
defensible ask.

### Two free bonuses worth wiring

- **Pub/Sub push instead of polling.** The Notifications API publishes `NEW_REVIEW`,
  `UPDATED_REVIEW`, `NEW_CUSTOMER_MEDIA`, `GOOGLE_UPDATE`, `DUPLICATE_LOCATION`,
  `VOICE_OF_MERCHANT_UPDATED` to a topic we own. A new one-star review can reach Meridian
  in near-real-time. (Q&A notification types were discontinued 2025-11-03.)
- **Performance API daily metrics** per store: impressions split desktop/mobile ×
  maps/search, direction requests, call clicks, website clicks, and — genuinely novel for
  us — **`BUSINESS_FOOD_ORDERS`** and `BUSINESS_FOOD_MENU_CLICKS`. Google-attributed food
  ordering per store, daily.

## Facebook — closed by Meta, not by McDonald's

**Meta deprecated Page recommendations and ratings in Graph API v22.0 (2025-01-21)**,
extended to all API versions 2025-09-09. Reading a recommendation returns error code 12
and ratings webhooks no longer fire.

⚠️ Meta's own `/page/ratings` reference page still exists with no deprecation banner —
that's a documentation inconsistency, **not** a live capability. Trust the changelog.

Even pre-deprecation this was blocked: parent Page tokens cannot read child Page
recommendations, and franchise brands use the parent-child Locations structure.

**Do not spend political capital asking corporate for Facebook access.** There is no
supported API path at any permission level.

## The trap that matters most — storage licensing, not scraping

The biggest constraint on this whole module is **not** anti-bot brittleness or ToS risk
around scraping. It is that several platforms have clean APIs that would hand over the
data and then **contractually forbid warehousing it**. A trend dashboard is by definition
a warehouse.

| Source | What the licence forbids |
|---|---|
| **Yelp** | Storing data **> 24 hours**. Also bans semantic analysis without approval, and bans blending Yelp ratings with other sources — i.e. exactly a unified reputation index. |
| **Google Places API** | Only `place_id` storable indefinitely (coords 30 days). Names, ratings, reviews, photos: no caching or storing. Also hard-capped at **5 reviews**. |
| **TripAdvisor** | `location_id` only. Nothing else may be cached, stored or indexed. |

All three are fine for **live display with attribution**; none can back a historical
trend store. Yelp does grant exceptions — `api@yelp.com` — but that's a negotiation, not
a build. **Do not build first and ask later.**

This is the failure mode most likely to catch an engineer who assumes "it has an API, so
it's fine."

## DoorDash — the one 3PO that works, and it's free

The **Reporting API** (not the Marketplace API) exposes a **`CONSUMER_FEEDBACK`** report
with `merchant_rating` (1–5), `merchant_emoji_rating`, **`comments` (actual review
text)**, `review_type`, local-timezone date, and `store_id`/`business_id` to join on.
**No reviewer name — DoorDash anonymises**, which is the right model anyway (see ethics).

Mechanics worth noting before building: `POST /dataexchange/v1/reports` → `report_id`,
then `GET .../reportlink`. Output is a ZIP of CSVs, generation can take 5 minutes, and
**the download link expires in 20 seconds** — the script must fetch immediately, not
queue. JWT auth (HS256, `dd-ver: DD-JWT-V1`), **max 30-minute token lifetime**.

Access is gated: interest form → review → 1–2 business days after approval before data
flows, and **store IDs must be individually whitelisted** or requests 403. Same
corporate pressure point as Google if a corporate DoorDash account sits above our stores.

*Unverified:* pricing (appears free), rate limits, history depth. Portal Report Builder
allows "within the last two years" as a proxy for retention.

## Uber Eats / Grubhub / Postmates

- **Uber Eats: no reviews or ratings endpoint in any of the six documented API suites** —
  verified against the store object directly, zero rating fields. Uber Eats *Manager* has
  "Customer and Delivery Feedback" and "Menu Item Feedback" reports with comments, but
  **31-day max range** and reports **expire 48 hours** after preparation. Plan on monthly
  manual CSV through Data Manager. One open question worth an email to the Uber partner
  manager: whether those feedback reports are exposed via the Reporting API (their
  OpenAPI spec wouldn't render).
- **Grubhub:** no ratings/reviews API found; access designed for POS vendors, ~8 weeks to
  certify. Skip.
- **Postmates:** merged into Uber Eats infrastructure. Build for Uber, get Postmates free.

## Local news — free RSS is the backbone

Publishing a feed is an invitation to consume it: no ToS grey area, no cost. **Nine feeds
verified live**, incl. KFOR, WMBB/mypanhandle, KOKH, KTEN, The Ada News, Duncan Banner,
Chickasha Express-Star, Pauls Valley Daily Democrat, Daily Ardmoreite.

**Best single finding:** the TownNews/CNHI papers accept a **`q=` keyword parameter on
the RSS endpoint**, giving a pre-filtered per-outlet feed —
`kten.com/search/?f=rss&t=article&q=Tishomingo&...`. Two gotchas: results sort by date
not relevance, and **quoted phrases break it** — use unquoted single terms.

**Dead ends confirmed:** Gannett killed RSS platform-wide (The Oklahoman, NWF Daily
News), Gray Television stations (WJHG, KSWO, KXII) have none, Durant Daily Democrat has
no working feed, and chipleypaper.com is a dead WordPress placeholder still carrying the
default "Hello world!" post.

⚠️ **Google News RSS: works but `news.google.com/robots.txt` disallows `/rss/`.** Fine for
a prototype, not a production backbone — and naive queries are unusable anyway
(`"McDonald's" "Durant" Oklahoma` returns a wall of **Kevin Durant** coverage). Gap-fill
with **SerpApi at ~$25/mo** using per-outlet `site:` queries instead; that's the clean way
to reach the Gannett/Gray/Hearst/Durant outlets.

**GDELT** is the only source with an unambiguous unlimited commercial licence, but it has
no geographic disambiguation — a `Tishomingo` query returned articles about Tishomingo
County, **Mississippi**. Free wide net, not a primary.

## Identifier mapping — anchor on Google Place ID

`accounts.locations.list` with a readMask including `metadata` returns **`metadata.placeId`**
per location, free. **That makes Place ID the cross-platform join key at zero cost.**
Store it once in a `store_platform_ids` table alongside NSN and hand-verify the rest —
27 stores is small enough that a one-time manual mapping beats fuzzy matching and
eliminates a whole class of silent data-quality bugs. (Same loc-canonicalisation
discipline that already bites elsewhere.)

## The competitive gap, quantified

Across all 12,376 US McDonald's locations: **18,139,827 Google reviews, 3.5-star average,
and a 0.52% reply rate.** Nobody is systematically responding. McDonald's *is* a Yext
customer, but that's listing-data accuracy, not review response.

Two consequences: **there is no incumbent process to conflict with**, and responding at
all is a differentiator that costs nothing but attention.

## Ethics / compliance — the three drifts to design against

The monitoring itself is the intended use of every official API here. Risk comes from
three specific drifts:

1. **Storing what a licence forbids** — see the storage table above.
2. **Reaching for data behind a login.** Rule of thumb: *if you can't see it in an
   incognito browser, don't take it.* Never create accounts to get behind a wall; never
   join private groups under false pretenses.
3. **Turning aggregate sentiment into individual-person analysis.**
   **Concrete build rule: the GBP API returns `reviewer.displayName` and
   `profilePhotoUrl` — store the review, DROP the reviewer identity** unless a GM needs it
   to resolve a specific complaint. Keep rating, text, date, store, reply state. Nothing
   is lost analytically and an entire category of data-protection exposure disappears.
   DoorDash already anonymises reviewers — treat that as the model.

⚠️ **FTC Rule on Consumer Reviews (16 CFR Part 465, effective 2024-10-21)** bans fake or
AI-generated reviews, buying positive *or* negative reviews, and review suppression.
Relevant here because reputation dashboards create pressure to improve the number:
**"review gating"** — soliciting feedback then routing only happy customers to Google — is
squarely prohibited. If this module ever grows a solicitation feature, it must ask
**every** customer, not the pre-screened ones.

## Build order

**Phase 0 (today, free):** check `business.google.com` access. Determines everything.

**Phase 1:** file the GBP API application (long lead — start now) · request DoorDash
Reporting API access · build the direct-RSS news backbone (works today, no dependencies).

**Phase 2 (once approved):** GBP review backfill via `batchGetReviews`, reviewer identity
dropped → Supabase · Pub/Sub `NEW_REVIEW` notifications → near-real-time alerting ·
Performance API daily metrics incl. `BUSINESS_FOOD_ORDERS` · DoorDash `CONSUMER_FEEDBACK`
nightly (mind the 20-second link expiry) · SerpApi ~$25/mo for the news gaps.

**Phase 3:** Uber Eats manual CSV (or API if the partner manager confirms) · Apple
Business Insights if franchise eligibility clears.

**Skip entirely:** Facebook (deprecated), TripAdvisor (storage), Bing (nothing to ingest),
Postmates (already in Uber), Grubhub (partner-gated), Google Places as a data source,
NewsAPI.org (free tier bans internal production use).

**Vendors** ($16k–42k/yr for the ones with real 3PO review coverage — Chatmeter, Momos)
are only worth considering for the Uber Eats / Grubhub gap, and probably not even then,
given DoorDash and Google are both obtainable free.

---

# GBP setup runbook (started 2026-08-07)

Ordered steps. Step 3 is the long pole — file it early, everything else can wait.

**0. Check existing access** — sign into `business.google.com` with the operator account.
   How many of the 27 appear, and what role? **Manager is sufficient** (Google's own docs
   recommend partners be manager, not owner; Managers can respond to reviews and pull
   insights). If the 27 are already there, the corporate ask never happens.

**1. Only if missing — the corporate ask.** Narrow: *"Manager role on our 27 location IDs,
   or add our Google Cloud project to the relevant location group."* Corporate keeps
   Primary Owner and the locked NAP/category fields. Roles assign at location-GROUP level,
   so Oklahoma can be granted without exposing anything else. Route: McDonald's US digital
   marketing org, not the field consultant.

**2. Enable in Google Cloud** (project "My First Project", org mcreaves.com):
   Google My Business API (legacy — this is the one serving reviews) ·
   My Business Account Management API · My Business Business Information API

**3. File the access application** — `support.google.com/business/contact/api_default`
   → "Application for Basic API Access". Three things decide approval:
     · apply from **@mcreaves.com** (rejections cluster on applicant domain ≠ business site)
     · name the GCP project (number + id)
     · concrete use case, e.g. "internal operations dashboard for our 27 franchised
       locations; read reviews/ratings to track guest sentiment per store and respond"
   Stated 7–10 business days; real-world 4 days to 6 weeks.

**4. After approval** quota goes 0 → 300 QPM. ⚠️ If the console shows **0 QPM that means
   NOT APPROVED** — do not file a quota-increase request, it is the wrong form.

**5. Then** create an OAuth client ID with scope `https://www.googleapis.com/auth/business.manage`.
   API keys return 401 on GBP — it is not public data, so Google requires proof of WHO is
   asking and that they are authorised on the listing. This is the only point at which the
   OAuth consent screen matters.

## YouTube — key live 2026-08-07, and what it actually returns

`YOUTUBE_API_KEY` is in `.env.local` and GitHub secrets. Restricted to YouTube Data API v3,
no application restriction (GitHub runners have no stable IP). Verified working.

⚠️ **Measured yield is near zero, and that is expected, not a bug:**
```
"McDonald's" "Durant" "Oklahoma"  → 0 results
"McDonald's" "Atoka" "Oklahoma"   → 0 results
"Atoka" "Oklahoma"                → 5 results (crappie fishing, Reba's Place)
```
Same pattern as TripAdvisor and the RSS brand column: rural OK/FL simply has thin coverage.
Worth running anyway **because it is free and it is insurance** — if something about a store
does go viral, YouTube is where it shows, and a pull returning nothing 51 weeks a year costs
nothing. Do NOT read an empty result as broken.
