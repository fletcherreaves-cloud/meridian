# Night-Shift Performance Plan — OK & FL

> Saved to the repo 2026-11-17 so this analysis survives session cleanup — it originated as a
> Claude Docs artifact, not a repo file. Source doc: https://claude.ai/artifact/Rv4YELfaNxM2ZFc2R14zVr
> (earlier draft; see `finding-overnight-performance-ok-fl-2026-10-30.md` for the later,
> GM/DM-reframed revision).

Oct 27, 2026

Night shift (4pm–close) underperforms day shift at **every single store in both states** — 27 for 27, no exceptions — but the *shape* of the problem differs by market. **Oklahoma's** labor cost is already fine (better than last year, running a hefty hours surplus) and the real issue is drive-thru speed specifically getting worse while kitchen speed gets better — points at DT process/equipment, not staffing levels. **Florida's** issue is broader: night labor% runs 2.8–9.2 points over target at every store, night TPPH misses target everywhere, and OEPE is worse at night at 6 of 7 stores. On your proposed lever — GMs or Department Managers (DM — a store-level role similar to an assistant manager, usually paid hourly, not the multi-store District Manager) working more closing or mid shifts — the data has a hard limit in **both** states: GM-coded time-clock punches are essentially 0% at any hour, almost everywhere — GM presence genuinely can't be tested from history and would need a pilot. DM-tier presence is different, and better news: 8 of 27 stores already have real DM-tier coverage on the books in the last 90 days, mostly at night, which gives a faster first test than a blind pilot at exactly those stores.

**Clarified intent (you, 2026-10-27):** this isn't an added-labor-hours proposal. The theory is senior-manager *presence* — a GM or DM in the building coaching and motivating the Swing/Shift Manager and crew in real time — expected to lift results broadly across every metric, not one targeted number. That reframes every finding below: a metric that already looks fine on its own, like OK's labor%, isn't evidence against the idea, since the idea was never about labor cost.

## Methodology & scope

- **Night window:** `qsr_daily_activity.hour_slot >= '17:00'` — the 4pm–5pm block through close/4am (the business day runs 4am-to-4am). Verified against the real schema before building any query, not assumed.
- **Comparison windows:** trailing 28 days (2026-09-29→10-26), trailing 90 days (2026-07-29→10-26), year-to-date (2026-01-01→10-26), each matched against the identical calendar window one year prior — a true matched-date comparison, not a naive overlap. Today (10-27) excluded as the still-open business day.
- **Stores:** 20 Oklahoma (MCDOK) stores, 7 Florida (Emerald Arches) stores — Ponce de Leon (FL) opened 2026-03-13 and has partial-year history only.
- **Access:** both analyses ran against live Supabase production data (`qsr_daily_activity`, `qsr_punch_times`) via the service-role credential this session had — confirmed with a real row-count read before building anything (1,294,087 rows district-wide), not assumed.
- **Important limitation, now resolved through a direct pull:** daypart-specific targets don't exist in the data model generically, but the three station-speed targets that DO exist — `tOepe` (drive-thru), `tKvst`/`tKvsu` (kitchen), `tR2p` (front counter), all from the "Yearly Targets" workbook — are specifically **dinner-peak targets (5pm-7pm clock time)**, confirmed directly by the owner. Comparing them against a broader 5pm-to-close night window, as earlier passes of this doc did, wasn't a fair apples-to-apples read. This has now been corrected: a fresh pull restricted to `hour_slot IN ('18:00','19:00')` (the confirmed 5-7pm mapping) computes true dinner-peak actuals for all 27 stores, using the confirmed real formulas (OEPE = `(dt_untilserve − dt_untilstore − dt_heldtime)/dt_trans_cnt`; KVS = `(mfy1_untilserve + mfy2_untilserve)/(mfy1_trans_cnt + mfy2_trans_cnt)`; R2P = `(fc_untilserve − fc_untilclosedrawer)/fc_trans_cnt`) — see the corrected comparison below. One caveat carried forward honestly: no `ly_*` fields exist for any of these three speed metrics, so only a target comparison is possible, never a vs-LY one. Note also: this repo's own pre-existing `DAYPARTS` constant (`labor-standard.js`) separately defines "Dinner" as 5pm-11pm for labor-standard/VLH purposes — a different, wider window used for a different purpose than the 5-7pm peak-target window used here; don't conflate the two. TPPH and labor% targets (`tTpph`/`tCrewLabor`) are NOT sourced from this same peak-only workbook and remain whole-day as originally understood — this correction is scoped to OEPE/KVS/R2P only. A true night-specific (not just dinner-peak) target for any station is still a legitimate follow-on build.

**A specific, material gap worth stating plainly: the Florida night-window analysis below was originally run before anyone flagged that Hurricane Isaias hit the FL panhandle this month.** It made landfall near Destin (Okaloosa County) the night of Oct 9, 2026, crossing Okaloosa/Walton/Holmes/Santa Rosa counties — directly across all 7 FL stores' territory. Every FL finding below that the storm touches has been corrected against real Supabase data (Chipley, Bonifay, and Ponce de Leon show confirmed store closures on Oct 10; Defuniak Springs ran at 21% of normal that day) — corrections are marked inline where they occur. The trailing-28-day window used throughout FL's tables (Sep 29–Oct 26) includes the storm's direct-impact window (roughly Oct 9–12). This affects raw sales/transaction LEVEL comparisons (Bonifay's 28-day vs-LY figure, most visibly) more than it affects the Σ/Σ RATE metrics (TPPH/labor%/OEPE), which are naturally less sensitive to a handful of near-zero-activity days diluted across 28. A clean, storm-excluded comparison window is a legitimate follow-up if a sharper read matters.

**Dinner-peak (5pm-7pm) vs. target, true Σ/Σ district rollups — the corrected, apples-to-apples numbers:**

*Oklahoma:*

| Window | OEPE gap | KVS gap | R2P gap |
| --- | --- | --- | --- |
| 28d | +50.4s | +5.7s | +28.4s |
| 90d | +45.2s | +2.4s | +25.7s |
| YTD | +32.5s | +4.0s | +16.8s |

*Florida:*

| Window | OEPE gap | KVS gap | R2P gap |
| --- | --- | --- | --- |
| 28d | +55.3s | +24.3s | +31.8s |
| 90d | +32.2s | +13.4s | +6.4s |
| YTD | +19.3s | +9.4s | −8.2s |

The real, apples-to-apples gap is **bigger than the broader-window numbers shown elsewhere in this doc suggest, not smaller** — everywhere except Florida's R2P on a YTD basis, which actually beats target. Every store-specific OEPE finding below has been re-checked and corrected against this dinner-peak basis.

## Dinner-peak check premium — and a check-adjusted TPPH target

**The owner's theory is confirmed, no exceptions: every store's average check is higher at night than during the day — up to 18%.** Measured as true Σ$/Σtransactions (never an average of hourly averages), night window (5pm-close) vs. whole day, trailing 90 days: district-wide, Oklahoma's premium is **+15.1%**, Florida's is **+10.7%**. Every one of the 27 stores shows a real premium, from +5.5% (Ponce de Leon) to +18.1% (Ardmore-Broadway) — see the chart.

&#91;embedded content: Supabase qsr\_daily\_activity, Σsales/Σtransactions, true ratio not average-of-averages, trailing 90 days\]

**What this means for the TPPH target:** the existing whole-day `tTpph` target implicitly assumes the whole-day average check. A store earning more dollars per transaction at night needs *fewer* transactions per labor-hour to hit the same sales-per-labor-hour the original target was built around — so the raw night TPPH "miss" numbers everywhere in this doc are overstating the real gap. The economically correct fix: `adjusted_target = tTpph / (1 + measured_check_premium)`, holding $/labor-hour constant instead of raw transactions/labor-hour constant.

Applied to the worst cases: Freeport's night TPPH gap narrows from **−30.1% to −18.8%**; Tishomingo from −23.1% to −9.2%; Holdenville from −22.1% to −10.3%. Two stores and Defuniak Springs actually **flip from "missing" to "at or above" target** once the check premium is accounted for — worth naming explicitly rather than let them read as problems they aren't. This narrows the severity everywhere but does **not overturn the core finding**: Freeport is still the clear worst case by a wide margin even on the adjusted basis. Treat every night-TPPH figure elsewhere in this doc as the raw, unadjusted number — this section is the honest correction layer on top of it, not a replacement for the detailed tables below.

## District at a glance — where to look first

**The real patch structure (live `org_config`, not the stale roster in `constants.js`) — 6 Oklahoma patches, 2 Florida patches, 27 stores:**

| State | Patch | Stores |
| --- | --- | --- |
| OK | Zukarr Eaves | Ardmore-Broadway, Ardmore-Cooper/12th, Tishomingo-Main & Refuge |
| OK | Robert Spencer | Ada-Country Club, Sulphur, Madill-Hwy 70, Holdenville |
| OK | Krystiana Langford | Chickasha-So 4th, Lindsay-Wal-Mart, Duncan-Hwy 81, Elgin |
| OK | Ashley Podroza | Durant-US Hwy 70/22, Atoka-Mississippi, Marietta |
| OK | Steven Vaughn | Seminole-Milt Phillips, Tecumseh, Harrah |
| OK | Amanda Estrada | Purcell, OKC-I240/Sooner, Pauls Valley-Ballard Rd |
| FL | Brad Denley | Cottondale, Freeport, Ponce de Leon |
| FL | Mary Ratliff | Chipley-St Rd 77, Defuniak Springs, Bonifay, Mossy Head |

Florida split into two patches on 2026-07-22 (Mary Ratliff took 4 of the 7 stores from Brad Denley) — `constants.js`'s seed file hasn't been updated to reflect that and still shows the old 7-store assignment.

**Opportunity ranking — every store, one composite score, so the biggest gaps surface first regardless of which state or patch they're in:**

&#91;embedded content: Composite of dinner-peak OEPE gap, night TPPH gap%, and night labor-% gap, z-scored within state, 40/40/20 weighted\]

**By patch:** Krystiana Langford (OK) carries the single biggest patch-level opportunity — 3 of her 4 stores (Elgin #1, Chickasha-So 4th #4, Lindsay-Wal-Mart #8) land in the district top 8. Brad Denley (FL) has the widest internal spread of any patch — Freeport is #2 district-wide while Cottondale and Ponce de Leon are two of the best-performing stores in the company. Mary Ratliff (FL): Mossy Head (#3) is a growth-outpacing-execution problem; Defuniak Springs has the single worst raw OEPE gap in the company (+113.2s) but ranks lower here because its TPPH/labor are closer to target. Robert Spencer (OK): Holdenville and Sulphur are both top-10, reading as a speed problem across the patch. Amanda Estrada (OK) is split — Pauls Valley-Ballard Rd is a top-6 opportunity while Purcell (same patch) is one of the best-performing stores in the district. Zukarr Eaves and Steven Vaughn (both OK) are mid-table, no standout store either direction. *Marietta's rank rests on a flagged bad `tOepe` target (75s vs. every other store's 110-210s range) — treat it as unreliable, not a clean read.*

## The dollar opportunity — what closing the gap is worth

Florida's labor-% gap prices out directly into a real number. Oklahoma's doesn't — tested below, not assumed, and the honest answer is a different kind of finding, not a weaker version of the same one.

### Florida — $21,163/month in excess night labor, measured

Same basis as the Florida trends table above (`qsr_daily_activity`, trailing 90 days, night = `hour_slot ≥ '17:00'`, true Σ/Σ): excess labor $ = (actual night labor% − target night labor%) × night sales, per store, summed. Every FL store runs over its night labor target, so every store adds to this — there's no offsetting store pulling it down.

| Store | Night labor% (90d) | Target | Gap | Night sales (90d) | Excess labor $ (90d) | Monthly run-rate |
| --- | --- | --- | --- | --- | --- | --- |
| Freeport (38609) | 28.24% | 23.5% | +4.74pp | $322,969 | $15,303 | $5,101 |
| Mossy Head (37566) | 27.23% | 23.5% | +3.73pp | $357,854 | $13,361 | $4,454 |
| Bonifay (10034) | 27.29% | 23.0% | +4.29pp | $301,095 | $12,923 | $4,308 |
| Cottondale (35242) | 26.72% | 23.0% | +3.72pp | $274,052 | $10,196 | $3,399 |
| Chipley (6178) | 24.86% | 23.0% | +1.86pp | $305,190 | $5,686 | $1,895 |
| Ponce de Leon (43701)\* | 28.03% | 26.0% | +2.03pp | $243,478 | $4,948 | $1,649 |
| Defuniak Springs (6838) | 23.84% | 23.5% | +0.34pp | $317,282 | $1,073 | $358 |
| **FL total** | **26.57%** | — | — | **$2,121,920** | **$63,489** | **$21,163** |

\*Ponce de Leon opened 2026-03-13 — target likely still calibrating, per the Florida trends section above; its row is real data but the smallest-confidence one in this table.

**The decision this prices:** closing the gap is worth roughly **$21K/month district-wide in Florida**, concentrated in the three worst stores (Freeport, Mossy Head, Bonifay — 65% of the total). A pilot that only reaches those three captures most of the dollar opportunity without needing all 7 stores to move at once. Extrapolated to a year (×4 on the 90-day figure, an extrapolation of a measured quarter, not a measured annual number) that's roughly **$254K/year** — stated here once, for scale, not as a number to plan against.

### Oklahoma — tested for a dollar figure, and there isn't one

The trends section above already found OK's night labor cost is not the problem — labor% is improving vs. LY and the district runs a large hours surplus against the "needed" model. There is no excess-labor $ to compute here, and forcing one would contradict that finding, so this section doesn't invent one.

The real OK problem is DT speed, so the question is whether slower DT speed is costing transactions — a traffic-loss dollar figure, not a labor one. Tested directly, two ways, same `qsr_daily_activity` / trailing-90-day basis as the rest of this doc:

- **All-night (`hour_slot ≥ '17:00'`):** each of the 20 OK stores' own night OEPE (seconds, Σ/Σ) against that same store's own night-transactions change vs. LY. Pearson r = **0.138** across the 20 stores.
- **Dinner-peak only (17:00–19:00, the same window the check-premium section above uses):** each store's dinner-peak OEPE against its own dinner-peak transaction change vs. LY. Pearson r = **0.154**.

Both are essentially zero, and both run the *wrong direction* for the theory (slightly positive — slower stores trending very slightly less negative on traffic, not more) — the opposite of what "slow DT loses guests" would predict if it held store-by-store. District-wide, night traffic really is down 2.5–5.4% vs. LY (the trends section above), but that decline doesn't track which stores got slower at DT and which didn't — it reads as a market-wide pattern, not a store-level consequence of this store's own speed.

**So: no dollar figure for Oklahoma in this doc.** What's known — the labor side is not the opportunity, and a cross-sectional look at speed-vs-traffic doesn't support a causal number either, so one isn't published. What would change that: a real before/after measurement at a treated store — exactly what the staffing-level pilot already proposed elsewhere in this doc would produce as a side effect, since it would give an actual speed change at a known set of stores to measure a transaction response against, instead of a cross-sectional snapshot where every store's "before" is different.

## Oklahoma — trends & vs. target

**District-wide, night window only (20 stores combined):**

| Metric | Current 28d | vs LY | 90d | vs LY | YTD | vs LY |
| --- | --- | --- | --- | --- | --- | --- |
| Night sales | $2.45M | −1.0% | $7.48M | −1.7% | $24.41M | +0.7% |
| Night transactions | 200,297 | −5.4% | 615,178 | −5.0% | 2,001,245 | −2.5% |
| TPPH | 4.54 | −0.05 | 4.47 | −0.01 | 4.36 | −0.03 |
| Labor % | 20.91% | −0.54pp (better) | 21.42% | −0.51pp (better) | 21.87% | −0.40pp (better) |
| OEPE — DT speed (sec) | 183.5 | +8.9s slower | 182.2 | +18.2s slower | 169.1 | +12.3s slower |
| KVS — kitchen speed (sec) | 62.8 | −10.3s faster | 60.8 | −11.1s faster | 60.6 | −7.9s faster |
| Hours vs. QSRSoft "needed" | — | +6,385 hrs/28d | — | +17,490 hrs/90d | — | +48,229 hrs YTD |

**Headline:** traffic is down 2.5–5.4% at night in every window, but labor cost isn't the problem — labor% is *improving* vs. last year and the district runs thousands of hours over the "needed" model. **Drive-thru speed has gotten meaningfully worse (+9 to +18s vs. LY) while kitchen speed has gotten better (−8 to −11s)** — that divergence points at something DT-specific, not a general staffing or execution collapse.

**Vs. the real dinner-peak target:** every one of the 20 OK stores is slower on DT speed during the 5-7pm dinner peak than its target, and every store misses its whole-day TPPH target at night. The five widest dinner-peak OEPE gaps, corrected from an earlier, broader-window version of this analysis: Sulphur (+95.6s), Pauls Valley-Ballard Rd (+94.4s), Chickasha (+86.3s), Holdenville (+81.2s), Ada-Country Club (+73.2s) — see the table below for the full picture, including two stores worth watching as reference points rather than one. Labor% vs. target is mixed — roughly half the stores run over, half under — confirming labor% is not the universal story at night in OK; speed is. The gap doesn't correlate with store size (r = −0.10) or with hours-surplus (r = −0.19) — bigger or more-overstaffed stores aren't better. **Duncan-Hwy 81 and Purcell are both worth watching as reference points, not just Duncan alone** — Duncan is the best performer on the longer 90-day/YTD horizons but has drifted worse in just the last 28 days, while Purcell is closing in fast on the opposite trajectory (worst on YTD, now closest to target on the current 28 days). A direct comparison of what changed at each — rather than picking one "best practice" site — is the sharper question.

**Night OEPE gap to the real dinner-peak (5-7pm) target — the extremes, corrected (full 20-store ranking available on request):**

| Store | Dinner-peak OEPE gap (28d) | Read |
| --- | --- | --- |
| Sulphur | +95.6s | Worst |
| Pauls Valley-Ballard Rd | +94.4s |  |
| Chickasha | +86.3s |  |
| Holdenville | +81.2s |  |
| Ada-Country Club | +73.2s |  |
| Duncan-Hwy 81 | +17.5s | Best on 90d/YTD (+7.6s / +2.8s), but drifted worse in the most recent 28 days |
| Purcell | +9.5s | Closest to target right now — improving fast (YTD +34.8s → 90d +22.2s → 28d +9.5s) |

## Oklahoma — anomalies & people

**Anomalies (90-day window):** 220 of \~1,800 scanned store-nights showed labor% more than 1.5 standard deviations from that store's own mean. Worst single-night outliers: Ardmore-Broadway 10/14 (13.6% vs. its normal 24.3%) and 8/25 (34.8%, the opposite extreme); Madill 8/18 (33.1% vs. 21.6% norm). **Tishomingo had two** rough nights, 10/16–10/17 (\~30.5–30.8% vs. 20.1% norm) — but that falls squarely inside a leadership transition there: the GM who'd run Tishomingo since 2025 moved up to Supervisor in early October, and the store's new GM (Sabrina Turner) wasn't officially in the role until 10/22. Read as transition noise, not an open pattern worth chasing on its own.

**People — real finding, with an honest data limit:** across all 20 stores, **essentially 100% of night shifts are covered exclusively by Certified Swing Managers (job code 647) and crew.** GM-coded punches (codes 45/641) are **0% at night — and 0% at any hour, any store, any day in the 90-day window.** DM/AM-coded punches (codes 845/846/10001/10002/20107 — 10002 was missing from the original code list, corrected here) total 584 shifts district-wide in 90 days, and 87% of them (507 of 584) are at night, not daytime — the opposite of what an earlier pass found, due to that missing code plus an under-count in the ones it did use. This activity isn't spread district-wide: it's concentrated at just 8 of 27 stores fleet-wide, 3 of them in Oklahoma (Lindsay-Wal-Mart, Atoka-Mississippi, Holdenville). GM-coded punches alone remain genuinely \~0% everywhere — almost certainly because GMs specifically are salaried and don't generate time-clock punches at all — the data can't distinguish "GMs are never on-site at night" from "GMs are on-site but this table structurally can't see them."

What the data *can* say with confidence: **Swing Managers are the structurally designated closing authority everywhere in OK today, with no exceptions.** That means your proposed lever — GMs/DMs working more closing or mid shifts — would be a genuinely **new** practice at most of OK's stores — but not literally everywhere: Lindsay-Wal-Mart, Atoka-Mississippi, and Holdenville already have real DM-tier coverage on the books in the last 90 days, a faster, cheaper first test than a blind pilot (Holdenville is already a top-5 district-wide priority store — see the opportunity ranking above).

## Oklahoma — improvement plan

1. **This isn't an added-labor-hours case, and the data below shouldn't be read as an argument against it.** What the data rules out is "more scheduled hours fixes DT speed" — labor% is already better than LY, the district runs \~48K hours over the "needed" model YTD, and overstaffing shows no correlation with faster service (r = −0.19). It says nothing about whether *who* runs the shift — specifically, a GM/DM presence coaching the Swing Manager and crew — changes execution quality. That's a different question, and it's what the pilot in item 5 is for.
2. **Investigate the DT-vs-kitchen divergence directly, store by store, starting with the worst dinner-peak OEPE-gap stores (corrected):** Sulphur (+95.6s), Pauls Valley-Ballard Rd (+94.4s), Chickasha (+86.3s), Holdenville (+81.2s), Ada-Country Club (+73.2s). Since kitchen (KVS) got *faster* while DT got *slower*, the likely cause is DT-lane-specific — headset/equipment, car-parking/holding discipline (`dt_heldtime` is already inside the OEPE formula and worth breaking out per store), order-taking position staffing, or DT-specific crew skill.
3. **Use Duncan-Hwy 81 and Purcell as paired reference sites, not Duncan alone** — Duncan is the best 90-day/YTD performer despite a large hours surplus, but has drifted worse in just the last 28 days; Purcell is on the opposite trajectory, closing a wide YTD gap down to nearly on-target in the most recent 28 days. A direct operational comparison (shift structure, DT process, who actually runs the close) across BOTH — what Duncan may be losing and what Purcell may be gaining — against the worst-gap stores could surface a transferable practice in either direction.
4. **Tishomingo's back-to-back rough nights (10/16–10/17): no separate action needed — they fall inside that store's GM transition window (new GM Sabrina Turner's official start was 10/22). Revisit only if it continues once she's settled in**.
5. **This is the lever actually worth testing** — per the clarified theory, a senior/experienced manager's presence coaching and motivating the Swing Manager and crew, not added labor. If the theory holds, expect improvement **across the board** (DT speed, TPPH, labor%, OEPE together), not movement in just one metric — a pilot that only moves one number is a weaker read than one that moves all of them together. Pick 2–3 of the worst-gap stores (Sulphur, Pauls Valley-Ballard Rd, Chickasha, Holdenville, Ada-Country Club), have the GM/DM actually work a defined closing or mid shift for a trial period, and re-measure every night metric against that store's own pre-trial baseline. **Tracking it just got easier:** `lifelenz_shift_assignments` — an existing, already-pulled table nobody had checked for this — carries real GM-role *scheduled* shift times (not punches), so GM presence during a pilot can be verified from real schedule data instead of a manual marker. It doesn't cover DM, which isn't a schedule-assigned role in LifeLenz at all.
6. **Build a real night-specific target.** Comparing night performance to a whole-day blended target is the best benchmark available today but is imprecise; a dedicated night OEPE/TPPH target (derived the same way the existing whole-day ones were) would sharpen every comparison above.
7. **Balance the pilot — don't let closing coverage come at day shift's expense.** Start at the 8 stores with existing DM-tier coverage (free, retroactive data) before adding anywhere new. Where a new trial is warranted, bound it explicitly: a defined number of closing shifts a week (2–3, not a schedule takeover), with the GM's/DM's own daytime coverage backfilled or explicitly reduced for that period — the risk this doc exists to avoid is trading a night-shift fix for a day-shift relapse. Track both sides of that trade, not just the night numbers.

## Florida — trends & vs. target

**Night vs. day vs. whole-day target, all 7 stores, trailing 28 days:**

| Store | Night sales share | Night hrs share | Day TPPH | Night TPPH | Target TPPH | Day labor% | Night labor% | Target labor% | Day OEPE | Night OEPE | Target OEPE |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Chipley (6178) | 31.5% | 35.8% | 7.45 | 5.24 | 6.1 | 20.06% | 23.83% | 23.0% | 225s | 284s | 190s |
| Defuniak Springs (6838) | 33.3% | 36.1% | 6.67 | 4.81 | 5.0 | 19.92% | 22.87% | 23.5% | 216s | 306s | 180s |
| Bonifay (10034) | 32.7% | 35.9% | 6.07 | 4.54 | 5.5 | 23.10% | 26.18% | 23.0% | 201s | 219s | 195s |
| Cottondale (35242) | 34.4% | 39.7% | 6.99 | 5.13 | 5.9 | 20.09% | 25.29% | 23.0% | 164s | 132s ✓ | 150s |
| Mossy Head (37566) | 34.8% | 42.6% | 7.59 | 4.81 | 5.7 | 18.69% | 24.90% | 23.5% | 222s | 299s | 165s |
| Freeport (38609) | 28.8% | 38.0% | 7.51 | 4.06 | 5.7 | 18.52% | 27.72% | 23.5% | 147s | 249s | 150s |
| Ponce de Leon (43701)\* | 37.4% | 40.0% | 5.89 | 4.84 | 4.8 | 22.62% | 25.77% | 26.0% | 173s | 192s | 210s |

\*Ponce de Leon opened 2026-03-13 — \~7.5 months of history, targets likely still being calibrated.

**The pattern is universal, no exceptions:** night TPPH is lower than day TPPH at every store (4.06–5.24 vs. day 5.89–7.59); night labor% is higher than day labor% at every store, a 2.8–9.2 point gap everywhere. Night also eats more of the labor hours than it earns in sales at 6 of 7 stores. **Cottondale is the lone exception on speed** — night OEPE (132s) actually beats both its own day shift (164s) and its target (150s) by 18s; it's a highway/travel-center store (Love's Travel Stop, I-10), which may explain the different demand shape.

**Ranked worst-to-best by night TPPH gap to target:** Freeport −29% (worst on every metric at once) → Bonifay −17% → Mossy Head −16% → Chipley −14% → Cottondale −13% → Defuniak Springs −4% → Ponce de Leon +1% (essentially at target, but too new to trust fully).

| Store | Night TPPH gap to target | Read |
| --- | --- | --- |
| Freeport | −29% | Worst — worst on every metric at once |
| Bonifay | −17% |  |
| Mossy Head | −16% |  |
| Chipley | −14% |  |
| Cottondale | −13% |  |
| Defuniak Springs | −4% |  |
| Ponce de Leon | +1% | Best — essentially at target, but store too new to trust fully |

**28d / 90d / YTD vs. LY (night window, sales / transactions):**

| Store | 28d vs LY | 90d vs LY | YTD vs LY |
| --- | --- | --- | --- |
| Chipley | −5.5% / −8.4% | −1.5% / −7.0% | +5.5% / −1.0% |
| Defuniak Springs | +2.1% / −6.8% | −4.7% / −6.9% | −8.4% / −2.4% |
| Bonifay | **−19.0% / −12.8%** | −6.1% / −5.8% | 0.0% / −0.3% |
| Cottondale | −4.8% / −9.4% | −4.9% / −9.4% | −2.8% / −6.8% |
| Mossy Head | **+13.2% / +10.4%** | +4.5% / +4.1% | +5.9% / +1.8% |
| Freeport | −0.6% / −2.1% | +6.3% / −0.1% | +4.5% / +5.6% |
| Ponce de Leon | n/a (new store) | n/a | n/a |

A consistent theme: night *transactions* are trending down more than night *dollars* at most stores — higher average check compensating for fewer guests, not simply "more business." **Bonifay's 28-day drop (−19% sales, −13% transactions) is sharper than its own 90-day or YTD figures — and now has a confirmed, specific cause: Hurricane Isaias.** Bonifay was fully closed two consecutive days, Oct 10 and Oct 11, against a roughly 950-transaction/day normal baseline — call it \~2,000 lost transactions right there — on top of a depressed Oct 9 (77% of normal) and a slow Oct 12 recovery (59%). That alone plausibly accounts for the entire 28-day gap; there's no need to reach for an operational or GM-transition explanation here. **Mossy Head is the one standout positive** — night demand up double digits and still climbing — but its speed/productivity are among the worst in the group, meaning the operation isn't keeping pace with its own growth.

## Florida — anomalies & people

**2026-10-11 (a Sunday) was a shared bad night at 3 of 7 stores** — Chipley (434.5s), Defuniak Springs (404.7s), and Ponce de Leon (359.3s) all logged one of their two worst nights of the quarter on that exact date. **Confirmed, not speculative — this was Hurricane Isaias.** The storm made landfall near Destin (Okaloosa County) the night of Oct 9, 2026, crossing these stores' counties directly. Chipley and Ponce de Leon were fully closed on Oct 10; Defuniak Springs ran at 21% of normal volume that day. Oct 11 was each store's first full day back — the slow OEPE reads as reopening-day disruption (surge demand from a storm-starved area, reduced crew availability, supply backlog), not three coincidental operational failures.

**Cottondale, 2026-10-10:** OEPE 303s with only 49 DT transactions but $5,624 in sales — an unusually low car count for that sales level, suggesting a lobby-heavy night or a possible DT outage. This falls inside Hurricane Isaias' immediate landfall window (the storm hit the night of Oct 9; Chipley/Bonifay/Ponce de Leon were closed the next day) — Cottondale itself wasn't closed and actually ran above LY that day (109%), so a storm-linked cause (a brief power fluctuation affecting the DT lane specifically) is plausible but not confirmed either way. **Mossy Head logged two of its worst-ever nights in the same recent week (10/14 and 10/21, 499.9s and 403.8s)** — specifically checked against the storm window and ruled out: Oct 14 ran at 107% of LY with no depression signal at all, and Mossy Head's own recovery was already clean by Oct 12. This stands as a genuine, independent execution finding, not storm noise — right as its sales/traffic trend is accelerating upward, the clearest single piece of evidence that demand growth is outpacing this store's night execution. Every store's single *best* night of the quarter runs well under its whole-day target — proof the equipment/crew/process CAN hit strong numbers; the gap is consistency, not capability.

**People — handling note:** this section names specific roles only to report a structural data finding (who is or isn't visible in clock-punch data), not to render a performance judgment on any named individual. Treat any read of this section that implicates a specific person's work habits as restricted/sensitive, per this project's own handling convention for personnel-adjacent findings.

**LifeLenz schedule data cannot answer the "who's working nights" question at all** — it's a whole-day store-level summary with no time-of-day or per-person breakdown. Raw clock punches (`qsr_punch_times`) can, with one critical limit: **6 of 7 FL stores' named GMs do not appear anywhere in punch data in the last 28 days, under any job code.** This almost certainly means they're salaried-exempt and don't use the time clock — not that they're skipping shifts — but the data can't tell the two apart. DM-tier coverage is a different story: 5 of FL's 7 stores (Mossy Head, Bonifay, Defuniak Springs, Ponce de Leon, Cottondale) show real DM-tier punch activity in the last 90 days — concentrated, not universal, but real and mostly at night (87% district-wide, OK and FL combined).

**Bonifay is the one exception, and worth a direct conversation:** its GM does appear in punch data, clocking under a job code this project's own role classification buckets as "AM/DM," not GM — either Bonifay's GM is paid hourly (unusual for the role) or the job-code mapping doesn't cleanly separate GM from department-manager level at that store. What the data *can* reliably show: **Shift-Manager-coded night hours over 28 days** — Chipley 213.7, Defuniak Springs 262.6, Bonifay 247.5, Cottondale 264.7, Mossy Head 90.7 (notably lower), Freeport 216.3, Ponce de Leon 227.2. Bottom line: **night shifts at 6 of 7 FL stores are run entirely by Shift Managers and crew**, with no visible GM or above-SM presence — which may simply reflect that GMs are salaried and invisible to this data source, not that they're absent.

## Florida — improvement plan

1. **Freeport — fix first, on balance, though not literally worst on every metric.** Worst night TPPH gap to target (−29%) and worst night labor% overage (+4.2pp) still hold. On dinner-peak OEPE specifically (the corrected, apples-to-apples basis), Freeport is bad and chronic (28d +78.1s, 90d +66.3s, YTD +35.3s, worsening every window) but is the 3rd-worst in FL on that one metric, not the outright worst — Mossy Head and Defuniak Springs are now tied for worst on OEPE specifically (see item 4). The overall "fix first" call still holds on TPPH/labor%, just not as a clean sweep of every number.
2. **Bonifay — investigate the recent trend break, not just the chronic gap.** Night sales/traffic dropped sharply in just the last 4 weeks (−19%/−13% vs. LY) against a flat-to-even YTD picture — something changed recently, specifically at night. Also the one store with the GM-pay-classification anomaly; worth a direct conversation regardless of the shift-performance question.
3. **Mossy Head — a growth-outpacing-execution problem, not a demand problem.** Night sales/traffic up double digits and still climbing, but OEPE just posted its two worst nights of the quarter in the same recent week. Needs night-shift staffing/process capacity added to match demand it's already getting.
4. **Defuniak Springs and Mossy Head are now tied for the worst dinner-peak OEPE gap in FL, both confirmed chronic and worsening — not a storm artifact.** Defuniak: YTD +60.1s → 90d +85.9s → 28d +113.2s. Mossy Head: YTD +18.9s → 90d +66.3s → 28d +113.4s. Both trends worsen across all three windows well beyond the Oct 9-12 storm window, so this reinforces — rather than merely coincides with — the existing findings on both stores. Defuniak still has the smallest productivity gap on TPPH even with this speed problem — worth checking DT-station staffing specifically at night.
5. **Chipley, Cottondale, Ponce de Leon** — lower urgency, in that order. **Cottondale and Ponce de Leon both beat their real dinner-peak OEPE target, consistently, in all three windows** (Cottondale: 25-44s under target; Ponce de Leon: 17-43s under target — a new finding on the corrected basis, not previously surfaced since Ponce de Leon was earlier described only as "too new to trust"). Cottondale remains the stronger model given its longer track record; Ponce de Leon's result is worth watching rather than banking on yet, given its short operating history. Understanding why either works (crew assignment, DT layout, or a highway-traffic-store effect for Cottondale) could inform the other stores' plans.
6. **Balance the pilot here too.** 5 of FL's 7 stores (Mossy Head, Bonifay, Defuniak Springs, Ponce de Leon, Cottondale) already have real DM-tier coverage in the last 90 days — start a before/after comparison there before adding anywhere new, the same way as the OK recommendation above. Freeport is the one priority store with no existing coverage to lean on, so it's the cleanest candidate for a genuinely new, bounded trial (2–3 closing shifts/week, day-shift coverage explicitly backfilled, not a schedule takeover).

**Cross-store, structural recommendations:**

- **Get a straight answer on GM exemption status at all 7 FL stores** before deciding whether "more GM/DM night hours" is even a measurable, implementable lever — the data can't see it either way at 6 of 7 stores today.
- **The night labor%-over-target gap (2.8–9.2pp at every store) combined with lower night TPPH is the same underlying problem everywhere: hours aren't shrinking as fast as volume at close.** A deployment/scheduling review of the last 2–3 hours before close specifically — starting at Freeport and Mossy Head — would likely find the clearest, fastest win.
- **Check whether 2026-10-11 reflects one shared, fixable cause** across Chipley/Defuniak Springs/Ponce de Leon — if so, it's a one-time explainable anomaly; if three independent causes landed the same night, that's three separate findings worth chasing individually.
- Given FL's small store count (7, one <8 months old), none of these findings are statistically bulletproof the way a 20-store OK sample would be — but the *consistency* of the day-vs-night gap across all 7 stores, zero exceptions on TPPH and labor%, is itself the strongest evidence here: whatever's driving it is systemic to how FL runs nights, not a one- or two-store problem.

## Cross-state synthesis & the GM/DM question

**What's common to both states:** closing shifts are run entirely by Swing/Shift Managers and crew — GM-coded time-clock punches are effectively zero at night in **both** Oklahoma and Florida. Neither state has GM-on-close variation to compare against — GM presence specifically would be a genuinely new practice everywhere. DM-tier presence is different: 8 of 27 stores fleet-wide (3 OK, 5 FL) already have real DM-tier punch coverage in the last 90 days, mostly at night — a faster, cheaper first test of the senior-presence theory than a blind pilot, at those 8 stores specifically. The honest caveat is identical in both states too: this may just mean GMs are salaried and invisible to the punch-clock system, not that they're absent — the data can't tell the two apart in either market.

**What differs:** Oklahoma's night-shift gap is narrower and more specific — labor cost is already fine (improving vs. LY, running a large hours surplus), and the problem concentrates in drive-thru speed specifically (worse vs. LY) while kitchen speed has gotten better. Florida's gap is broader and more universal — every single store misses target on both TPPH and labor% at night, with OEPE worse at 6 of 7. That difference matters for where to spend effort first: **in OK, the fix is likely DT-process/equipment-specific, not a staffing-levels fix; in FL, the fix is likely a deployment/scheduling problem (hours not shrinking as fast as volume at close) across nearly every store.**

**Combined recommendation on the GM/DM lever:** don't commit to it district-wide on the strength of this data alone — it can't be validated or ruled out from history in either state. If you want to test it, the cleanest approach is a real pilot: pick 2–3 of the worst-gap stores in each state (OK: the top OEPE-gap stores; FL: Freeport and Mossy Head), have the GM/DM actually clock a shift-manager-equivalent closing or mid shift for a defined trial period, and re-measure OEPE/TPPH/labor% against that store's own pre-trial baseline using this exact method. The faster, cheaper first step is the natural experiment the data already contains: 8 of 27 stores (OK: Lindsay-Wal-Mart, Atoka-Mississippi, Holdenville; FL: Mossy Head, Bonifay, Defuniak Springs, Ponce de Leon, Cottondale) already show real DM-tier punch coverage in the last 90 days, mostly at night — a before/after or with/without comparison at those specific stores, using this exact method, answers the question faster than waiting on a pilot everywhere else. A formal pilot at the remaining worst-gap stores with no existing coverage is still the right move, and it would also finally answer the salaried-exemption question that's blocking a cleaner read of the existing GM data.

## Staffing level, manager experience, and the follow-up mechanism — tested against real data

The owner's working theory going in: staffing level and TPPH/labor should correlate; who's actually on the floor — specifically whether it's an under-experienced Swing/Shift Manager — should correlate with outcomes; and the follow-up/coaching mechanism reaching those managers is weak or non-existent. Each piece was tested directly against 90 days of real store-nights (2,369 of them), not assumed true because it's plausible.

**Staffing level vs. outcomes — no real relationship, confirmed at night-level granularity.** Night staffing hours vs. TPPH: r=+0.01 (OK), r=−0.26 (FL). Night staffing hours vs. OEPE: r=+0.06 (OK), r=+0.32 (FL). These are weak-to-negligible everywhere — more bodies on the floor doesn't reliably buy speed or productivity, extending this doc's own earlier store-level finding (r=−0.19 between hours-surplus and OEPE gap) down to the individual-night level. **The opportunity isn't in adding scheduled hours — it's confirmed not to live there.**

**Manager tenure vs. outcomes — too weak to call, and the reason why matters more than the number.** Longest-tenured Swing Manager on duty vs. TPPH: r=+0.06 (OK), r=+0.18 (FL). Vs. OEPE: r=−0.15 (OK, tenure helps a little), r=+0.22 (FL, tenure hurts a little — likely confounded by which specific stores happen to have longer-tenured SMs). **Neither direction is strong enough to call the theory proven or disproven — because there's barely any real variation to test it against: median time-in-role for the SM on duty at night is 0.78 years in OK and 1.01 years in FL, fleet-wide.** The fleet rarely has a genuinely senior SM on the floor at night to compare against a junior one. That's not a null result on the theory — it's a restricted-range problem, and it's itself evidence consistent with the owner's framing: there isn't much experience in the building to begin with.

**The "shift manager report" exists — partially — and the gap is small and fixable.** `shift_manager_monthly`/`shift_manager_range` already pull from QSRSoft's real `shiftManagerSummary` API, which attributes OEPE/R2P/TPPH/labor%/sales to the specific manager on duty — including a sentinel for a shift with **no floor manager scheduled at all**. That's exactly the "who's assigned to the floor" signal the owner asked about. But the API itself already breaks results out by daypart — including two night-specific windows, 4pm–9pm and 9pm–midnight — and Meridian's current pull only saves the whole-day total, discarding the daypart rows. **Capturing those rows (one parameter change, not a rebuild) would let a future pass of this analysis answer "is an under-experienced manager on the floor at night driving the gap" directly, by name-free aggregate, instead of inferring it from tenure alone.**

**No coaching or follow-up cadence reaches the hourly Swing/Shift Manager role at all, today.** The only structured, dated review cycle in the app (`performance-reviews.js`) is semi-annual and explicitly scoped to salaried management (GM/AM/AS/OM) — it does not cover the role running essentially 100% of night shifts in either state. **"The follow-up mechanism is weak or non-existent" is confirmed true at the data-infrastructure level, not just as an operational impression.**

## Bonifay & Holdenville — recent GM transitions, and the LifeLenz-schedule question

**Your question, answered: can LifeLenz schedule data stand in for GM/DM presence where punch data can't see it?** Yes — for GM specifically, not DM. A table nobody had checked for this, `lifelenz_shift_assignments`, already exists in Supabase and is already pulled daily (built for the Crew Schedule Lookup panel). It carries real per-row *scheduled* shift times (`shift_start`/`shift_end`) plus a `role_name` column, and `General Manager` is a real, populated value there — so GM scheduled presence is queryable today, no new pull needed. DM doesn't work the same way, for a different reason: Department Managers are hourly, store-level staff who punch in like crew rather than being scheduled under a distinct manager tag — LifeLenz's role\_name field carries task/station assignments (Grill, Drive Thru, Floor, etc.) plus a few named roles, and "General Manager" is one of the only ones that gets its own distinct value; "Department Manager" isn't among them. So DM presence still has to come from punch data, the same 90-day DM-tier-coverage read used above, not from this schedule table. Two honest caveats: the table only covers 2026-08-04 → 2026-11-10 (worth checking separately whether LifeLenz's own history goes back further — not confirmed either way), and GM shift coverage within that window is sparse (e.g. only 60 GM-role rows total for Bonifay across \~3 months) — this gives "which weeks had a GM on the schedule," not daily granularity.

Using that table to answer your two follow-ups directly:

**Bonifay.** Confirmed from payroll records, not estimated: Harlee Yates, Bonifay's GM since September 2025 (with the store since November 2023), resigned with notice and left October 19, 2026. The store's own Department Manager, Melissa Hagerman, covered operationally during the handover — she's a genuine, hourly Department Manager, not a miscoded GM, which is exactly why she shows up in punch data instead of a GM. The new General Manager, Joseph Vause, was hired in from outside and started October 17, 2026 — a two-day overlap with Harlee before her last day, not a gap. This is now a clean, dated transition, not an estimate.

| Night-window metric (≥5pm) | Before (Aug 18–Sep 28) | After (Sep 29–Oct 27) |
| --- | --- | --- |
| Sales vs. plan | −1.9% | **−14.4%** |
| DT avg | 293.0s | 287.9s |
| TPPH | 4.36 | 4.54 |
| Labor % | 27.6% | 26.2% |

DT and TPPH both moved favorably. Sales-vs-plan fell sharply — and this now has a confirmed, specific cause, not a guess: **Hurricane Isaias hit the FL panhandle the night of Oct 9, 2026, and Bonifay was fully closed Oct 10–11**, both inside this "after" window (Sep 29–Oct 27). That alone plausibly explains the entire −14.4% figure — there's nothing left here to attribute to the GM transition. (An earlier pass at this doc guessed "seasonal falloff" before the storm was flagged — that guess is superseded by this direct, measured cause.) Don't read this as "the new GM hurt sales," now for a harder reason than before: the store was physically closed for two of the four post-transition weeks analyzed.

**Holdenville.** The schedule table only has 5 GM-role rows total, all forward-scheduled for next week (Oct 29–Nov 2) — it can't independently confirm your "last week" timing, so your own stated date (\~Oct 20) was used as the estimate. `constants.js` already flagged Holdenville as "GM-in-training... intentional, slow growth path" before this analysis — useful context for how deliberate this change already was, not a surprise.

| Night-window metric (≥5pm) | Before (Sep 8–Oct 19, 6wk) | After (Oct 20–Oct 27, 8 days) |
| --- | --- | --- |
| Sales vs. plan | −2.6% | −7.3% |
| DT avg | 230.5s | **272.5s (worse)** |
| TPPH | 3.96 | 4.56 |
| Labor % | 21.9% | 19.1% |

Eight days is a near-useless sample — directionally mixed (DT worse, TPPH better, sales dipped) and explicitly not a verdict either way. Worth re-pulling in 3–4 weeks once there's an actual post-change window to look at.

Both of these are, in effect, uncontrolled real-world instances of exactly the natural experiment the pilot above calls for — worth tracking forward with this same before/after method rather than waiting for a formal pilot to start from zero.

**2026-10-30 — add to the tracking list.** Fletcher spent the day on-site at Holdenville training new GM Bobby on the mobile inventory-count process and on resetting the store's core metrics. Treat this date as Holdenville's benchmark start — the before/after point to measure this turnaround against once enough post-training data accumulates, same method as the natural experiments above.

## Data notes

- All metrics computed as true Σ/Σ rollups (never averages-of-averages), reusing the same `oepe = (dt_untilserve − dt_untilstore − dt_heldtime)/dt_trans_cnt` and `tpph = transactions/actual_punched_hours` formulas the app itself uses.
- OK's LY comparison used QSRSoft's own embedded `ly_*` fields (vendor-matched equivalent business day) directly on `qsr_daily_activity`; FL's used the same fields.
- No named individual's performance is reported anywhere in this document — all role-level findings are aggregated by job-title-code tier (GM/DM-AM/SM/crew), per this project's own handling convention for personnel-sensitive content. The single-night anomalies named by date/store are metric outliers, not attributed to any named employee.
- This is analysis only — no code was changed, nothing was committed or pushed to build this report.

**Dinner-peak OEPE/KVS/R2P formulas, confirmed from source** (not assumed): OEPE = `(dt_untilserve − dt_untilstore − dt_heldtime)/dt_trans_cnt`; KVS = `(mfy1_untilserve + mfy2_untilserve)/(mfy1_trans_cnt + mfy2_trans_cnt)`; R2P = `(fc_untilserve − fc_untilclosedrawer)/fc_trans_cnt`. No `ly_*` columns exist for any of the three, so these are target-only comparisons, never vs-LY. **Marietta's own `tOepe` target (75s) is far out of line with every other OK store's target (110-210s range)** — flagged as a possible target-data anomaly worth a direct check with the owner, not taken at face value as a performance read; Marietta's own dinner-peak gap (+51.5s, 28d) may be partly an artifact of a bad target rather than real underperformance.

**Separate, small bug found and flagged (out of scope for this doc, worth a follow-up fix):** `src/engine/tenure-roles.js`'s `DM_AM_JOB_CODES` list is missing job code `10002` ("DEPT MGR II W/ CREW PUNCHES") — it affects this project's DM/AM classification wherever that constant is reused (e.g. performance-review role bucketing), not just this analysis.

Check-premium and adjusted-TPPH-target figures: true Σproduct\_sales/Σtransactions, `qsr_daily_activity`, trailing 90 days, same night-window definition (hour\_slot ≥ '17:00') used throughout this doc.

SM tenure figures: `qsr_employee_tenure.job_title_code_start_date` for job code 647 (time-in-role, not org tenure), joined to `qsr_punch_times` to find the longest-tenured SM on duty each store-night — the same field this project's own tenure logic already uses elsewhere, not re-derived.

Supervisor-patch structure: live Supabase `org_config` (key `app_settings`, field `orgAssignments`, the effective-dated history) — not the static seed in `src/constants.js`, which is stale for Florida (still shows the pre-2026-07-22 7-store-under-one-patch assignment).

"The dollar opportunity" section methodology: FL excess labor $ = Σ over the trailing 90 days, per store, of (actual night labor% − target night labor%) × night product\_sales, where night = `hour_slot ≥ '17:00'` (same window as the rest of this doc) and labor%/sales are both true Σ/Σ, not averages-of-averages; monthly run-rate = the 90-day figure ÷ 3, annualized = ×4 (explicitly an extrapolation of a measured quarter, not a measured year). `dt_untilserve`/`dt_untilstore`/`dt_heldtime` on `qsr_daily_activity` are stored in **milliseconds**, not seconds — divide the OEPE formula's result by 1000; confirmed by reproducing district OK 90-day OEPE (182.8s, Σ/Σ) against this doc's own already-published 182.2s figure. OK's traffic-loss test: Pearson r between each OK store's own OEPE (seconds, Σ/Σ, trailing 90 days) and that same store's own transaction-count change vs. LY, run two ways — all-night (`hour_slot ≥ '17:00'`) gave r=0.138 across the 20 stores, dinner-peak-only (17:00–19:00) gave r=0.154 — both near zero and wrong-signed for a "slower DT loses guests" theory, which is why no OK dollar figure is published.

**Follow-up tests (2026-10-31), same honest result.** Two more OK traffic-loss tests were run after this finding drew a direct challenge. A within-store weekly test (each store's own week-to-week OEPE swings vs. its own week-to-week transaction swings, de-meaned per store, 26 trailing weeks) came back r=+0.39 (all-night) / +0.46 (dinner-peak), n=500 store-weeks — real, not noise, but backwards for the theory: almost certainly reverse causation, since a busy week is mechanically both busier AND slower at once, not evidence speed drives volume. A longer-horizon trend test — does a store's own speed CHANGE over \~4-month periods predict its own transaction-trend change, with a lag to let word-of-mouth catch up — gave a weak right-signed contemporaneous read (r=−0.21 all-night, r=−0.43 dinner-peak, n=20 stores, still short of significance) but the LAGGED version, the actual test of a delayed reputation effect, came back wrong-signed both ways (r=+0.16, +0.25). A literature check found the identical reverse-causation confound flagged independently in industry research, and the strongest published speed→sales dollar estimate is vendor-sourced, not independently audited. Line abandonment (real queueing-theory "balking," Jones 1999, *Operations Research*) is the right way to measure this directly once real data exists — see the HME Timer access item, `memory/data-acquisition-shopping-list.md` §M. Full detail: `memory/finding-ok-dt-speed-transactions-2026-10-31.md`.
