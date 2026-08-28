# Finding: no clean way yet to enumerate `store_menuitem_id` for a store (dispatch #185)

**✅ RESOLVED 2026-08-28 (dispatch #186) — the owner captured the missing request.**
`GET /api/inv/{nsn}/menuitems` (`memory/dispatch-186.md`) returns exactly the enumeration this
finding says is needed: `[{data: store_menuitem_id, value: "{item_number} - {description}"}, ...]`
for a store's full catalog. Wired into `scripts/qsrsoft-menu-items-pull.mjs` →
`qsr_menu_items`. The real-activity subset sizing question this unblocks (dispatch #185 task 3 /
dispatch #186 task 3) is answered in `memory/finding-menu-item-activity-subset-2026-08-28.md`.
The `menu_item_activity2`/`menu_item_activity_cost` pull itself is still NOT wired (deliberately
out of scope for #186 too — sized against that finding's numbers in a follow-up dispatch).

**Verdict (as of dispatch #185, now superseded above): dispatch #185 cannot wire a real pull.**
All three enumeration paths the dispatch doc named were checked and each comes up empty for this
specific ID space. This is a docs-only outcome, matching the precedent set by dispatches
#172/#177/#178/#181.

## The gap, precisely

Two owner-captured eBOS endpoints —
`POST /api/inv/{nsn}/menu_item_activity2` (per-day activity/sold/waste/emp+mgr-meal counts) and
`GET /api/inv/{nsn}/menu_item_activity_cost` (per-day food/paper cost) — both key off
`store_menuitem_id` (confirmed identical, `4194793`, across both captures). That is a **7-digit
internal eBOS database ID**, not the small POS `item_number`/`menuItemNumber` code (e.g. `1` for
Hamburger, `60` for 6 McNuggets) used everywhere else in this codebase. Without a way to list every
`store_menuitem_id` for a store's active menu, the only usable input is the single sample value the
owner happened to capture — not something a pull script can iterate over.

## What was checked

### 1. Dispatch #184's `raw_info` response — not available to check

Dispatch #184 (the `raw_info/{raw_item_id}` endpoint, a different ID space keyed by
`store_rawitem_id`/WRIN) has **not landed**. Measured via `search_pull_requests` on
`fletcherreaves-cloud/meridian`: zero open PRs mention `raw_info`, `menu_item`, `menu-item`, or
`pricing-engine`; the only PR matching "dispatch 184" is #880, which is the docs-only PR that added
`memory/dispatch-184.md` and `memory/dispatch-185.md` themselves (already merged to `main` — that's
where this session started from). So there is no live `menu_items[]` sample from that endpoint yet
to check for an `item_number → store_menuitem_id` field. `memory/dispatch-184.md`'s own prose only
names `recipe_serving_factor` and `on_pos` as fields inside `menu_items[]` — no ID field is named
either way, so this is a genuine "not yet known," not a checked-and-absent.

**Next step for whoever revisits this**: once #184 ships and `qsr_raw_item_info.menu_items` has
real rows, check that JSONB column directly for an ID field before assuming another owner capture
is needed — it may turn out to answer this for free.

### 2. `qsrsoft_kb` — describes the UI page, not the API

Measured live via the service-role Supabase credential against `qsrsoft_kb`
(`content-range: 0-0/208` on an unfiltered read, confirming access — this session's key is live,
per CLAUDE.md's "re-measure per session" rule). Searching `title ilike '*menu*item*'` returns three
articles: **"Menu Items"**, "Menu Items - Recipes", "Agency Menu Items".

The **"Menu Items"** article confirms the page this dispatch needs exists in the eBOS UI: *"Use the
scroll bar to reach the bottom of the list of menu items… Clicking on a Date and Time will expand
the Menu Item Activity into quarter hours"* — that second sentence is describing exactly the
`menu_item_activity_breakdown` endpoint dispatch #185 was told not to pull, confirming this landing
page is the UI surface both captured endpoints come from. But `qsrsoft_kb` is QSRSoft's
**customer-facing support KB** (screenshots + prose, Zendesk-style), not API reference material —
no request URL, query param, or field name appears in the body for any of the three articles. It
answers "does a menu-items-list page exist" (yes) but not "what does its list-loading network call
look like."

### 3. Already-pulled tables — none carry an ID in the `store_menuitem_id` space

Checked every table whose rows are keyed at the individual-item level, via live reads against the
same service-role credential (all `content-range` observations below are real, not `*/0`):

| table | item-level key found | space | matches `store_menuitem_id` (7-digit, e.g. `4194793`)? |
|---|---|---|---|
| `qsr_product_mix` | `item` (= `menuItemNumber` from `api.reports.myqsrsoft.com`'s `product-mix-bundles`/`menuitems` endpoints — confirmed by reading `scripts/qsrsoft-pmix-pull.mjs` and `memory/qsrsoft-report-catalog.md`) | 1–5 digits (sample row: `item:60`; catalog samples up to `25052`) | **No** — different API family entirely (`api.reports.myqsrsoft.com`, not `prod.ebos.qsrsoft.com`), different ID space |
| `qsr_waste` (from `raw_waste_promo`) | none | — | **No** — confirmed by reading both the live schema (sample row has no item field at all) and `memory/project-eom-diagnosis-flow.md`'s captured payload shape (`store_busn_dt/tm, type, amount, eID, source, edited, reason` — no per-item breakdown of any kind, `$`-only) |
| `qsr_variance_stat` (`raw_detail`/`stat_variance`) | `store_rawitem_id`/`wrin` | WRIN space | **No** — this is the *raw ingredient* ID space (dispatch #184's own subject), explicitly called out in dispatch #185 as a different space from `store_menuitem_id` |
| `qsr_daily_activity` | none (hourly store-level aggregate) | — | **No** — no item-level fields at all |

No table in the full 113-path Supabase schema (`GET /rest/v1/` OpenAPI listing, checked in full)
has a name suggesting a menu-item catalog (no `qsr_menu_item*`, `qsr_menuitems`, etc. exists yet).

## Conclusion

All three checks the dispatch prescribed come up empty. **This is not a "couldn't find time to
look" gap — all three specific candidates were read or queried live and ruled out on their own
evidence.** The only concrete way forward is what the dispatch doc itself predicted as most likely:
**one more owner DevTools capture**, specifically of whatever network request populates the "Menu
Items" landing page's scrollable list (confirmed to exist per the KB article above) — that response
almost certainly returns `store_menuitem_id` (or an equivalently-named internal ID) for every active
item at a store in one call, the same shape as the existing `menuitems` catalog call on the
*other* QSRSoft API family (`api.reports.myqsrsoft.com/reporting/v2/product/menuitems`, which
returns `{text, value}` for every item — but in the *wrong* ID space, since its `value` is
`menuItemNumber`, not `store_menuitem_id`).

**Do not guess at an eBOS endpoint path for this** (e.g. `/api/inv/{nsn}/menu_items`) and ship a
probe against it — this session has no eBOS credential (`QSRSOFT_EBOS_TOKEN`/
`QSRSOFT_USERNAME`+`PASSWORD` are all absent from `env` this session), so an untested guess can't
even be measured here, and per the "measure it, don't reason about it" standing rule a plausible
URL pattern is not evidence.

## Side note carried forward per the dispatch's instruction

`menu_item_activity2`'s `emp_meal`/`mgr_meal` fields are a third, independent, per-item data point
on employee/manager meals (alongside whatever dispatch #181/#183's reconciliation work already
uses). Flagging for whoever next touches that reconciliation — **not chased here**, per dispatch
#185's explicit scope boundary.

## Out of scope (unchanged from dispatch #185)

- `menu_item_activity_breakdown` (15-min-granularity sibling endpoint) — noted for future
  reference only, not to be pulled even once ID enumeration is solved.
- Any Pricing Engine UI/analysis consuming this data.
- Dispatch #184's `raw_info` endpoint itself.
