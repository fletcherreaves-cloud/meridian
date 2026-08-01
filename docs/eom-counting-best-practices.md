# Inventory Counting — Best-Practice Proposal (to avoid variance issues)

*Draft, 2026-08-01. Every core recommendation is tagged with its corroboration level. Nothing in "The Method" is published unless it is stated in a QSRSoft KB article. Items derived from those facts (plus our own verified data) are labeled separately, and anything not yet corroborated is quarantined at the bottom for confirmation.*

**Corroboration key:** ✅ **KB** = stated in a QSRSoft KB article · 🔬 **Derived** = follows from a KB fact + our ledger-verified data · ⚠️ **Confirm** = believed true (owner/vendor) but not yet found in a KB article.

---

## The one principle that explains everything

✅ **Variance is a point-to-point reconciliation.** *Actual Usage = Starting Inventory + Purchases ± Transfers − Waste/Promo − Ending Inventory*, and **stat variance = Expected Usage (sales × recipe) − Actual Usage**, calculated only **after a physical count is submitted**. *(On-Hand / Inventory Information article; Inventory Analysis "not counting → dramatic stat loss".)*

🔬 A period's **Starting Inventory is the theoretical on-hand carried at POS Open** on the first day — which equals the **prior period's ending count**. We verified this to the unit on the live ledger (store #5985): the day's variance reconciled the carried POS-Open on-hand against the new physical count exactly. **So every count is graded against the count before it.** The cleaner and better-timed that prior count was, the smaller this count's variance.

---

## The Method — WHEN to count

1. ✅ **Follow the daily / weekly / monthly count schedule.** Every item sits on a daily, weekly, or monthly list (store settings). *(Raw Item Count Report.)*
2. ✅ **Weekly items may be counted one day early** if Store Settings allow; **monthly (EOM) items may be counted in the last 3 days of the month** if Store Settings allow. *(Raw Item Count Report.)*
3. ✅ **Never count an item before its deliveries/transfers are approved.** "Items delivered should not be counted until purchases or transfers into the store have been approved." *(Inventory Analysis, Topic 1.)*
4. 🔬 **Count as close to month-end as the schedule allows.** Counting the EOM early (e.g., 3 days out) leaves 2–3 days running on theoretical-only depletion; the *next* month's first count then reconciles that drift against a tiny sales denominator, which reads as a scary early-month % spike. Counting later shrinks that window. *(Derived from the reconciliation formula + our count-timing finding.)*
5. 🔬 **Count an item at a consistent time of day** (same daypart, ideally near POS Open before heavy usage) to minimize theoretical drift between the book and the shelf.

## The Method — HOW to count

6. ✅ **Count by area/temperature, walking a consistent path.** The app provides a Temperature filter to view items by where they live; there is a dedicated "Best Counting Practices" article. *(Using the Mobile Inventory App.)*
7. ✅ **Each area entry is SAVED and *adds* to the running count.** "To add the count, click SAVE." The ledger builds a cumulative on-hand across areas, so **only the final submission is the complete count.** *(Using the Mobile Inventory App.)*
8. ✅ **To correct an entry, use "Replace Count" before SAVE — do not re-type a total.** Without Replace Count, a re-entered total is *added* on top, inflating on-hand and creating a false overage. *(Using the Mobile Inventory App.)*
9. ✅ **Submit the session with "Submit All Items";** the Last Submitted timestamp stamps the whole batch. *(Using the Mobile Inventory App.)*
10. ✅ **Watch the Range Indicator** color when saving — it flags an entry that's outside the system-expected amount, catching a mis-count before submit. *(Using the Mobile Inventory App.)*
11. ✅ **Keep the unit of measure consistent** with what the system expects (cases vs eaches vs pounds) — a UOM mismatch is a top cause of large variance. *(Inventory Analysis, Topic 1.)*
12. ✅ **Count items showing negative or zero on-hand** to verify them, and **zero-out obsolete/duplicate WRINs** (submit a zero inventory). *(On-Hand Inventory; Inventory Analysis, Topics 3 & 5.)*

## Cadence to minimize variance

13. ✅ **Count everything you're scheduled to — nothing skipped.** "Not counting items will result in a dramatic increase in stat loss." *(Inventory Analysis, Topic 2; FOB Missing Counts card.)*
14. 🔬 **Count high-usage / high-cost items more often** (daily where possible — proteins, McCafé). More frequent physical calibration shortens every reconciliation window and keeps the theoretical honest. *(Derived; supported by KB #13.)*

## Pitfalls that manufacture variance

15. ✅ **Offsetting mis-counts can hide a real problem.** A healthy-looking net variance can mask large positive and negative swings cancelling out — "this can highlight counting." Don't trust the net alone; look at the gross. *(FOB Variance Card.)*
16. 🔬 **A big *positive* (overage) swing within one count session** is usually a re-entered total that accumulated (pitfall #8), not real product. Verify the true on-hand.
17. ✅ **Negative actual usage** ("more product than you started with") means missing purchases/transfers or an inaccurate count — recount and check receipts. *(Inventory Analysis, Topic 4.)*

---

## The 30-second version (for a GM)

> **Count on schedule, nothing skipped. Count after deliveries post, by area, walking the same path. SAVE each area; the last entry is the real count. To fix a number, use *Replace Count* — never re-type a total. Submit All when done. Keep the same unit the system uses. Count EOM as late in the last 3 days as you can. Judge the dollars and the trend — not a single early-month percentage.**

---

## ⚠️ Not yet corroborated against a KB article — confirm before publishing as fact

- **Count (session) timer** — device-specific, 1–8 hours, expiry resets un-submitted counts; while active, same-device re-entries accumulate. *Owner/vendor-taught; consistent with the SAVE-adds behavior, but locate it in "Inventory App Setup Guide" or "Best Counting Practices" to cite.*
- **Exact "last 3 days" and "one day early" windows** are store-setting-dependent — confirm this store's actual Physical Inventory Settings before making it policy.

## Sources (QSRSoft KB)
Using the Mobile Inventory App · What are the Best Counting Practices Using the Mobile Inventory App · Inventory App Setup Guide · Raw Item Count Report · Inventory Analysis Report (Topics 1–5) · On-Hand Inventory · Food Over Base (Variance / Missing Counts cards) · Inventory Information (On-Hand). See `docs/qsrsoft-kb-index.json` / `memory/qsrsoft-kb-digest.md`.
