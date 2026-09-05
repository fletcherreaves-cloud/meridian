---
name: finding-peak-visit-detail-api-2026-09-05
description: peak.mcd.com has a full per-visit detail API (store enumeration -> per-store visit history -> per-visit question/comment/score detail) that answers the open "does a per-visit CFV/RGR detail endpoint exist" question from finding-ecosure-propel-api-2026-08-22.md -- confirmed working for BOTH CFV and RGR (2026-09-05, two independent live captures). Richer than anything Propel offers per visit (every question, not just cited/failed ones, plus real per-question comments and scores). LIVE in production the same day -- two real visits (one CFV, one RGR) imported end-to-end via scripts/import-peak-visit-detail.mjs after the owner ran graded_visits' peak_detail column migration.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# PEAK has a real per-visit detail API — `peak.mcd.com`

Captured 2026-09-05 from a live, logged-in `peak.mcd.com` session (a 79-entry HAR). **This directly
answers the open question this repo already had on record** (see
`finding-ecosure-propel-api-2026-08-22.md`'s "Per-visit detail ... EcoSure has it, RGR/CFV bulk
doesn't" section): PEAK is a separate system from Propel (`PEAK replaces GDCT`,
`project-graded-visits-pace.md`) that runs the actual visit-scoring survey, and it exposes that
survey — every question, every score, every inspector comment — through a real API. **No
credentials are recorded in this file; see the security note.**

## The enumeration chain (confirmed working end-to-end for one CFV visit)

```
1. POST /API/Entity/GetEntities            {"Pagedata":0}
     -> the signed-in user's franchisee organization(s) and their entity ID
2. POST /API/Stores/Paged/                 {"page":N}
     -> ALL stores under that organization, paginated (~10/page, 3 pages for 27 stores)
3. POST /API/Visit/GetStoreDetails/<storeId>?isChecked=true
     -> that ONE store's full visit history, EVERY visit type, going back years:
        {"Id": <visitId>, "VisitTypeId": <n>, "TypeDescription": "...", "VisitDate": "...", ...}
4. POST /API/Visit/RoipSurvey/<visitId>
     -> the full per-visit survey: every question, every answer, every score, every comment
```

**Store IDs are the exact same hierarchy-node scheme already documented for Propel/EcoSure** —
confirmed by cross-checking: `195500301143` = Ada-Country Club = Meridian `loc` `06972`,
`195500300689` = Ardmore-Broadway = `loc` `03708`, `195500547640` = Elgin = `loc` `33222`, all
matching `finding-ecosure-propel-api-2026-08-22.md`'s already-solved 27-store hierarchy-node map
exactly. **That map is directly reusable here too — no new store-ID mapping work needed.**

Step 3's response for one store (Ada-Country Club) returned **83 historical visits** spanning
2012–2026 across every McDonald's visit program that store has ever had, not just CFV/RGR/EcoSure
— e.g. `Execution Shop Visit`, `Market Support Visits`, `US NRBES`, `Brand Standards Visit 2021`,
`ROIP Certification`, alongside the three that matter here. **Confirmed present with real
visitIds:** `Customer First Visit` (`VisitTypeId 3801`, ~10 instances back to 2022) and `Running
Great Restaurants Visit` (`VisitTypeId 3781`, ~5 instances back to 2023). **Not confirmed present
by name in this one store's history** — a text search for "food safety"/"ecosure"/"third party"
only turned up older internal-verification and follow-up visit types, not a clean EcoSure match;
this is inconclusive (one store, one capture), not evidence PEAK lacks EcoSure data.

## What `RoipSurvey/<visitId>` actually returns — confirmed for a real CFV visit

Tested against visitId `8721634` (a real, completed Customer First Visit, store 06972,
2026-08-19). The response (`SurveyType.Description: "Customer First Visit"`) includes:

- **`VisitDetails`** — visit date, completion time, daypart/weekpart, overall visit comment,
  auditor name, owner-operator, restaurant manager, supervisor, visit status, and program-cycle
  metadata (`ProgramCycleDescription: "Customer First Visit 2026"`).
- **`RootCategories`** — the full nested category tree (e.g. `Curbside > Cleanliness`), each with
  a **`Questions[]`** array. Crucially, this is **every question asked, not just the cited/failed
  ones** (26 questions for this one visit) — a strictly richer shape than EcoSure's own
  `citedItems`-only capture in `parseEcoSureVisit()`. Each question carries: full question `Text`,
  `Score`/`PossibleScore`/`MaxScore`/`CorrectScore`, `IsCritical`, the selected `ResponseId`, the
  full `AllowableValues` (every possible answer with its own score value, e.g. Yes=3/No=0/N/A=0),
  and a per-question **`Comment`** field.
- **Two of the 26 questions on this real visit had non-null `Comment` text** — real, specific
  inspector narrative about a food-quality issue (paraphrased here rather than quoted verbatim,
  per this repo's standing caution for real captured business text: one comment described a
  sandwich-assembly defect, the other described fries quality) — confirming the comment field is
  genuinely populated on real visits, not just a schema placeholder.

This is the first real, per-visit, per-question data source Meridian has ever had access to for
CFV (EcoSure already had one via Propel; RGR and CFV never did).

## Other endpoints seen in this capture (not yet examined in depth)

- **`POST /API/Report/GetVisitReportsByVisitId/<visitId>`** — lists the human-facing report views
  available for a visit (`Comprehensive Visit Report`, `Visit Recap - Exceptions`, `Timing
  Details`), each with its own PDF export URL (`CompVisitPDF`, `VisitRecapPDF`,
  `TimingDetailsPDF`) and email-send URL. A PDF fallback exists if `RoipSurvey`'s JSON ever proves
  insufficient for some report type.
- **`POST /API/Report/NewTimingDetails/<visitId>_<n>`** — per-timer speed-of-service detail: the
  actual timed sample(s), the scoring thresholds/ranges (e.g. R2P+Fulfillment ≤135s = 8pts,
  136–162s = 7pts, ...), matching the exact speed-scoring mechanics already documented in
  `project-graded-visits-pace.md`'s CFV/RGR sections. Could feed much more precise speed-of-service
  data than DAR-derived proxies, if ever built.
- **`POST /API/Report/Recap/<visitId>`** — **5.8 MB for one visit** in this capture, almost
  certainly because it embeds visit photos. Available, but expensive — not a good default target
  for a routine pull; `RoipSurvey` is the leaner, structured source for the same underlying data.
- **`POST /API/Entity/GetEntityEsvSurveyData/<id>`** — a similarly-shaped per-question survey
  response, but for a different, unidentified survey type ("Esv" — not yet mapped to a known
  visit-type name); not investigated further.

## What remains open

1. ✅ **RESOLVED 2026-09-05, same day — RGR confirmed.** A second HAR capture (owner-provided,
   428 entries) included a real `RoipSurvey/8308164` call — the exact RGR visit named as the
   "next capture" above. Measured directly (structural fields only, no PII): `Success: true`,
   `VisitTypeId: 3781` (RGR, per `PEAK_VISIT_TYPE_TO_REPORT_TYPE`), store `06972`, visit date
   `2026-02-10`, **193 questions** returned across 7 root categories (vs. CFV's 26 across 2). RGR
   returns the identical rich per-question shape CFV does — the single-generic-endpoint
   architecture holds. Do not re-verify this; capture a different store/visit only if a specific
   new question needs answering.
2. **EcoSure's presence in PEAK is unconfirmed** — not found by name in this one store's 83-visit
   history. Propel remains the only confirmed EcoSure source regardless of how this resolves.
3. **Auth mechanism — sharpened, still not fully confirmed.** The second capture ALSO showed zero
   `Cookie`/`Authorization` header on any `peak.mcd.com` request (same as the first) — with two
   independent captures now agreeing, this is more likely genuine (HAR export omitting an HttpOnly
   session cookie is still possible, but "coincidence twice" is less likely than "the tool
   consistently doesn't show it"). **New signal found:** every `peak.mcd.com`/`gas.mcd.com` POST
   carries a `__RequestVerificationToken` request header — the standard ASP.NET anti-forgery-token
   header name, which in that framework's usual pattern pairs with an (often HttpOnly, hence
   plausibly HAR-invisible) session cookie carrying the real auth. No `Set-Cookie` response header
   and no request `Cookie` header appeared in either capture, header names checked directly, no
   values ever inspected or recorded here. **Still do not treat this as "no auth needed"** — an
   ASP.NET anti-forgery pattern almost always implies a paired session cookie exists even where
   this capture method doesn't surface it. Confirm the real mechanism (cookie name, MFA/SSO gate)
   before designing automation, same caution as before, just with a sharper hypothesis to test.
4. Whether `Stores/Paged` genuinely returns every store in one small paginated set (27 stores / 3
   pages observed here) at any scale, or is itself capped, wasn't stress-tested.
5. ✅ **RESOLVED same day — owner ran the migration, import completed end-to-end.**
   `graded_visits.peak_detail` did not exist in production (`ALTER TABLE graded_visits ADD COLUMN
   IF NOT EXISTS peak_detail jsonb;`, added alongside the parser at PR #1123, had never actually
   been run against the live database — same "SQL patch written, not run" pattern as
   `forecast_snapshots`/`qsr_daily_activity_rollup` elsewhere in this repo's history). Owner ran it
   in the Supabase SQL Editor; `scripts/import-peak-visit-detail.mjs` was then run against both
   real captures and confirmed live, structure-only (no PII re-inspected): CFV row
   (`8721634`→store `06972`/2026-08-19) now carries `peak_detail` with `questionCount:26`,
   `commentedCount:2`; RGR row (`8308164`→store `06972`/2026-02-10) carries `questionCount:193`,
   `commentedCount:15` — both match the counts measured directly from the raw capture earlier in
   this file. `auditor` on both rows is a 36-char UUID-shaped token (tokenization confirmed
   working — not a plaintext name). **This is the first real PEAK per-visit detail data live in
   Meridian.** The local seed file holding the real captures was deleted after the import; the
   committed seed path stays the empty shell it always was.

## Why this changes the plan, not just answers the question

The original open question asked whether Propel has an EcoSure-style per-visit CFV/RGR detail
call. This finding says: **it may not matter whether it does** — PEAK's `RoipSurvey` is confirmed
richer than what Propel's own EcoSure detail call provides (every question, not just cited ones)
and is reachable through the exact same store-ID space this repo has already solved. If RGR's
`RoipSurvey` call confirms out the same way CFV's did, PEAK becomes the primary candidate source
for CFV/RGR per-visit detail — not a fallback to try "if Propel comes up empty," as originally
framed.

## 🔒 Security note

The capture included live session traffic for a real signed-in PEAK user and real per-question
inspector comments for a real store visit. **No cookie, token, or credential value is recorded in
this file.** Real comment text is paraphrased above, never quoted verbatim, matching this repo's
existing posture for real captured customer/business text (`finding-complaints-propel-api-2026-08-26.md`).
`RoipSurvey`'s `VisitDetails` carries real named individuals (auditor, owner-operator, restaurant
manager, supervisor) — if this is ever stored, apply the same `get_or_create_employee_token()`
tokenization EcoSure's `reviewedWithName` already gets in `import-ecosure-history.mjs`, never
plaintext names.
