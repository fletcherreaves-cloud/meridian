# Night Shift Performance: Findings & Recommendations — OK-only rewrite (2026-11-18)

Same Claude Docs artifact as the two files above (`https://claude.ai/artifact/JHP576VyiLd3NK3scTwLtD`,
doc id `8bf4dbf0-9292-446c-b21c-34d229d48bb6`), rewritten in place per owner request the same day:
*"find this document/artifact and update it to current... since we ran this analysis, we learned
Hardee's opened in Bonifay. Also, make it for Oklahoma only right now... DO NOT auto pull new
QSRSoft data. I will upload Operations reports now to app to cover gaps. I want to focus on OEPE
w/o parked. KVS, Sales, Labor, GC and TPPH."* Followed immediately by: *"and change the name to
Night Shift, not overnight."*

## What changed in the live doc
- **Renamed** "Overnight Performance: Findings & Recommendations" → **"Night Shift Performance:
  Findings & Recommendations"** (H1 only — the gallery-visible artifact *title* does not follow a
  body-text rename through the Claude Docs API; the owner needs to rename it manually on
  claude.ai if the gallery title should match).
- **Rescoped to Oklahoma only.** The Florida section and the cross-state comparison section were
  deleted outright from the live doc (not just hidden) — see
  `finding-overnight-performance-ok-fl-2026-10-30.md` for what those sections said before
  deletion. The owner floated 3 versions (OK/FL/Combined) as an option; only OK was built this
  pass.
- **New chart**: `ok-night-oepe-ranking`, a hand-built `<claude.Visualize>` SVG bar chart — 20-store
  OEPE w/o parked ranking, worst-first, top-5 (best) accented, with a Σ/Σ district reference line
  computed live from the rows at 186s. Screenshot-verified before publish.
- **New 6-metric table**: Sales / GC / OEPE w/o parked / KVS / Labor % / TPPH, 20 rows (one per
  OK store), trailing-90-night window **2026-08-20 to 2026-11-17** — the latest synced data as of
  the rewrite, per the no-new-pull constraint below.
- **Rewrote** "Store notes" (renamed from "Oklahoma"), "What we recommend" (condensed 8 items to
  5), and "How this was measured" to match the new scope and metric set.
- **Lindsay** (loc 44689, a brand-new store) flagged and **excluded from the ranking** — only 12
  nights on file, 69.6% labor% in that short window — pending a full quarter of real data. Not a
  data gap to backfill (it's a new store; the data doesn't exist yet), just too thin to rank
  fairly against 90-night peers.
- **Hardee's/Bonifay was deliberately NOT added to this version.** Bonifay is a Florida store;
  this rewrite is Oklahoma-only, so the fact has no page to land on here. If an FL or Combined
  version gets built later, it belongs there.

## Constraint honored: no new QSRSoft pull
Per the owner's explicit instruction, this rewrite used **only already-synced Supabase data** —
no automated or manual QSRSoft pull script was triggered for this work. The owner is covering any
gaps by uploading Operations reports through the app directly. This is a standing constraint for
this and similar follow-on work, not a one-off for this doc — don't auto-pull QSRSoft data to
answer a question like this one without being asked.

## Source data
Same `qsr_daily_activity` night window (`hour_slot >= '17:00'`, i.e. 4pm-close) as the two prior
doc states, OK stores only (`INV_ORG_COORDS`'s `state` field), Σ/Σ rollup (never average-of-
averages) — see `finding-overnight-performance-ok-fl-2026-10-30.md`'s own methodology section for
the shared mechanics; this rewrite reused that approach on the new metric set and date window.
