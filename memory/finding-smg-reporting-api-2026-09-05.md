---
name: finding-smg-reporting-api-2026-09-05
description: Exploratory findings from a live authenticated reporting.smg.com session (HAR + individual endpoint captures) toward automating the SMG VOICE FullScale scorecard, which today is a fully manual Excel upload (smg_fullscale table). Two clean JSON endpoints found (Favorites list, report-builder config); the report DATA itself only comes back through an ASP.NET WebForms postback as scraped HTML, not JSON — meaningfully harder than the Propel endpoints already automated for graded visits. Not built. Several open questions flagged for the next session with live SMG access.
sensitivity: open
metadata:
  node_type: memory
  type: finding
---

# SMG VOICE (`reporting.smg.com`) — automation groundwork, not yet built

Captured 2026-09-05 from a live, logged-in `reporting.smg.com` session (owner-supplied curl
pastes + a 123-entry HAR export). **No session cookie, `__VIEWSTATE`, or `__EVENTVALIDATION`
value is recorded anywhere in this file** — see the security note at the bottom. This is
reconnaissance for a future automation session, not a shipped feature — nothing here has been
built, and several things below are explicitly flagged as unconfirmed rather than measured.

## Why this matters

`smg_fullscale` (the FullScale OSAT/Accuracy/B2B scorecard behind the SMG VOICE panel's
FullScale tab, `visit-readiness.js`'s `smgFullscale` metric, `metric-provenance.js`'s `osat`/`eap`
definitions) is **`feed: 'manual'`** today — someone downloads a FullScale Excel export from
`reporting.smg.com` by hand every period and uploads it. `smg_comments` (the Comments tab) is the
same story, from a manually-uploaded PDF. Per this repo's standing "manual sourcing is always
temporary" rule, this is a real automation candidate, not a nice-to-have — but unlike the Propel
graded-visits endpoints (`finding-ecosure-propel-api-2026-08-22.md`), the actual report DATA here
is not a clean JSON API. That's the core finding of this file.

## What's easy — two real JSON endpoints

Both confirmed structured JSON, both auth-gated by the same session cookie, neither is the actual
score data:

**`GET /handlers/HomepageComponents/FavoritesComponent.ashx?function=getdata`** — the signed-in
user's saved/pinned report list. Returns UI labels plus, per saved report:
```json
{
  "ReportName": "MTD OSAT and B2B",
  "ReportType": "Full Scale",
  "ReportCreated": "6/29/2026",
  "ReportLink": "/Report.aspx?ID=0AEE8FED4E4A97D20BB5AF722F72575E",
  "ReportTooltip": "• 8/1/2026 - 8/31/2026<br/>• Restaurant"
}
```
Three FullScale favorites were captured (`MTD OSAT and B2B`, `...Email`, `...L3M`), each a
pre-built report config (date range + report level baked in) with its own opaque `ID`. **Whether
`/Report.aspx?ID=<that id>` renders the same HTML-postback report or something simpler was not
tested — a real open question, see below.**

**`GET /handlers/ReportBuilder.ashx?function=getreportcontroller&reporttype=33&reportsubtype=0`**
— the report-builder's own config/metadata for report type 33 (= FullScale, confirmed by the page
URL `ReportBuilder.aspx?report=FullScale`). Returns, as clean JSON:
- `DateRanges` — the quick-date preset list (Previous Day/Week/Month/Quarter, YTD, Last 90 Days,
  etc.) with their literal date-range values already resolved server-side (e.g.
  `"9/1/2026|9/4/2026|False|5"` for Current Month) — useful for knowing exactly what date strings
  the postback form expects.
- `ReportLevels` — `Restaurant` and `Operator`, each with its benchmark options (Business Unit /
  Field Office / Division / National / Top 10%) and their internal IDs.
- `SurveyItems` — a ~300-entry `{T: label, V: numeric id}` map (Overall Satisfaction=478465,
  Accuracy B2B=661123, DT Speed=604323, Friendliness=478443, …), i.e. the numeric survey-question
  ID ↔ human-label dictionary the whole reporting system keys off of. Same IDs reappear in
  `Filters`/`CompareBys`.
- `CompareBys` — ~250 breakout options (per-product-item quality scores, day-of-visit, daypart,
  demographic breaks, visit-type, etc.), each `{T: label, V: id}` using the same ID space as
  `SurveyItems`.

This confirms report type 33/subtype 0 = FullScale and hands over the full label/ID dictionary for
free — genuinely useful if a future scraper needs to interpret raw survey-item IDs, but it's
metadata about the report, not the report's numbers.

**Also checked and ruled out**: `POST /handlers/ReportViewer.ashx?function=getdata&reporttype=33…`
returns JSON, but it's UI localization strings (`"Page: "`, `"Previous"`, `"No Data to Display"`,
…) — **not report data**. Don't mistake this endpoint for a data source; measured, not assumed.

## What's hard — the actual FullScale numbers are an ASP.NET WebForms postback returning scraped HTML

`POST /ReportBuilder.aspx?report=FullScale` is a classic ASP.NET WebForms `UpdatePanel` partial
postback: the request body carries `__VIEWSTATE`, `__EVENTVALIDATION`, `__EVENTTARGET`, and the
report's own form fields (`rbDateTypeRadio`, `rbDateRadio`, `InsertType=Pushed`,
`UnitOptionType=UserLevel`, `rbBreakoutCompareType=1`, …) URL-encoded, with an
`X-MicrosoftAjax: Delta=true` header. The response is **not JSON** — it's the
Microsoft AJAX partial-postback wire format (`length|type|id|content|...` pipe-delimited chunks)
where the actual payload is raw HTML: a nested `<table>` per store with inline score bars
(`<img src="images/blue.jpg" width="{pct}">`), percentage cells, and collapsed "drill options"
`<span>` blocks — the same shape family as the old HTML-export-based `parseCFV()`/`parseRGR()`
parsers in `src/parsers/graded-visits.js` before the JSON bulk-enumeration chain replaced them,
except SMG never had a JSON alternative to switch to here.

**Why this is meaningfully harder than the Propel endpoints already automated:**
- `__VIEWSTATE`/`__EVENTVALIDATION` are single-use and tied to the page load that produced them —
  they can't be replayed from a static capture like this one. A working automation needs to load
  `ReportBuilder.aspx?report=FullScale` fresh, read its current viewstate out of the HTML, then
  POST the build-report action with that page's own tokens — i.e. a real browser session
  (Playwright), not a plain `fetch()` sequence like `browser-ecosure-bulk-capture.js` uses against
  Propel's JSON API.
- The response requires HTML table scraping (store name/NSN parsing off `"03708 - ARDMORE-BROADWAY"`
  header spans, percentage parsing off `<td class="Default_Score">73.3%</td>` cells, per-response
  bucket tables keyed by column position) rather than a `JSON.parse()`.
- Whether `reporting.smg.com`'s login is SSO/MFA-gated the same way `propel.mcd.com` is was **not
  confirmed** in this capture (the HAR starts mid-session, already authenticated) — this decides
  whether a scheduled unattended pull is even possible in principle, same as the Propel precedent's
  own security section. Check this before assuming either answer.

## Two more-promising avenues, neither investigated yet

1. **Export buttons.** The postback's own hidden control set includes
   `TheExportExcelBTN`/`TheExportCsvBTN`/`TheExportPdfBTN` alongside `TheBuildReportBTN`. If
   clicking Export produces a direct file download (an Excel/CSV file, structured and typed) rather
   than more scraped HTML, that could let a Playwright script build the report once, click Export,
   and read a downloaded file with the existing `parseSMGFullScale()` (`src/parsers/index.js:1871`)
   — reusing the SAME parser the manual upload already uses, zero drift, exactly like the DAR/
   QSRSoft automation principle. **Not tested; the response to an Export click was never captured.**
   This is the first thing to check in a follow-up session — it could make this whole project much
   smaller than the HTML-scrape path above.
2. **Saved-report replay.** The three Favorites reports above already have baked-in date ranges
   and report levels. If `GET /Report.aspx?ID=<favorite-id>` (or a similar direct-render URL) skips
   the postback-form dance and gives either a simpler HTML render or (best case) a JSON/export
   response, a recurring pull could just replay a small set of pre-saved favorites (e.g. one
   MTD-OSAT-and-B2B favorite per relevant scope) instead of reconstructing the builder's full form
   state per request. **Not tested.**

## If this gets built

Same shape as the Propel precedent (`finding-ecosure-propel-api-2026-08-22.md`): Playwright with a
persistent authenticated browser profile, on-demand (Sync button / `workflow_dispatch`), not a
`schedule:`-triggered GitHub Action, **unless** the SSO/MFA question above comes back "no MFA" —
confirm that before assuming either automation shape. Reuse `parseSMGFullScale()` verbatim if the
Export-button path works, so the automated and manual paths can never drift from each other (the
same reasoning that drove this repo's "API over email" and "reuse the same parsers" standing
rules).

## Open questions before any pull is built

1. Does clicking Export (Excel/CSV) on a built FullScale report return a structured file, and can
   it be captured via Playwright's download event?
2. Does `/Report.aspx?ID=<favorite-id>` render without needing fresh viewstate, and if so what
   format does it return?
3. Is `reporting.smg.com` login SSO/MFA-gated (blocking unattended scheduling) or does it accept a
   standalone username/password (opening the door to a real scheduled pull, unlike Propel)?
4. What are the FullScale report's actual `rbDateTypeRadio`/`rbDateRadio` values for a custom date
   range vs. a quick-date preset — the one capture in hand used defaults (`on`/`on`) without
   showing what a specific requested month looks like in the form body.
5. Does the HTML response's per-store drill-down (`DrillDown('<id>','10','Trend.aspx',...)`)
   expose per-store historical trend data through another endpoint worth capturing separately?

## 🔒 Security note

The captures included live session cookies (`ASP.NET_SessionId`, `BIGipServerreporting.smg.com_pool`,
F5 CSPM tokens) and one full `__VIEWSTATE`/`__EVENTVALIDATION` pair. **None of these values are
recorded in this file** — only endpoint shapes, JSON field names, and non-identifying report
metadata (survey-item labels are UI-visible, not sensitive). Treat the captured session as
disclosed-by-sharing; re-authenticate before any follow-up capture, same posture as the Propel
findings file.
