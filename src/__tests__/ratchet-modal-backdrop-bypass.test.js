// @ts-nocheck
// R7 (dispatch30, 2026-08-19) — panels must not hand-roll ModalShell's own backdrop.
//
// Dispatch #26 (Workstream D) measured ModalShell adoption stuck at 9/55 despite three
// workstreams' worth of merged PRs touching at-a-glance.js/calendar.js since it was written —
// nobody was reaching for the shared shell. Dispatch #30 re-measured it unchanged at 9/56 and
// found the freshest panel in the codebase (labor-allocation.js, merged the SAME session as the
// re-measurement) proving why: it rolled its own backdrop/card/close-button from scratch rather
// than importing ModalShell, in the exact shape ModalShell already standardizes
// (src/components/ModalShell.js's own header: "Measured from src/views/*.js: backdrop
// rgba(0,0,0,.82) is the most common value app-wide"). This ratchets that exact bypass signature
// — a hand-rolled `position:'fixed', inset:0, background:'rgba(0,0,0...` backdrop, the thing
// ModalShell exists to replace — so the count can only go DOWN from here.
//
// SCOPE: src/views/ + src/features/, same two layers dispatch16's R1 already established as
// "panel" layers for this codebase's ratchets. ModalShell.js/RoutePanelShell itself is excluded
// by ROOT (it's in src/components/, not walked) — the pattern legitimately lives there once.
//
// BOTH DIRECTIONS matter (ratchet-raw-metric-rows.test.js's own precedent, cited again here
// since this is a fresh ratchet copying that file's exact shape):
//   - count > CEILING → FAIL, naming the new file:line (a new hand-rolled backdrop crept in)
//   - count < CEILING → FAIL, saying "lower the ceiling to N" (stale ceiling = silent loss of
//     protection — the two hand conversions this same dispatch did (report-subscriptions.js,
//     labor-allocation.js's dead standalone-modal path) are exactly why this seed is 78, not 80)
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['src/views', 'src/features'];
// Measured fresh against this dispatch's own branch, 2026-08-19, AFTER converting
// report-subscriptions.js and labor-allocation.js's standalone-modal branch to ModalShell —
// per the standing rule (ratchet-raw-metric-rows.test.js's own header, and dispatch26's own
// explicit instruction) to never copy a number from a dispatch/plan doc into a CEILING.
// Lowered 78 → 77 by Dispatch #55 Part B (Job C Batch 1): count-cycle-panel.js's hand-rolled
// backdrop/card/close-button was converted to RoutePanelShell as part of its overlay-to-page
// conversion (routePanel==='count-cycle'). sched-hub/perf-reviews/eom-dashboard's hand-rolled
// chrome used a different shape (no literal `position:'fixed', inset:0` on one line, or was
// caught by other means) so they don't move this count. 77 → 76 (further, undocumented) drop
// then held until dispatch #160. Lowered 76 → 75 by dispatch #160 (panel-contract adoption
// pass): above-store-onepager.js's hand-rolled backdrop converted to RoutePanelShell
// (routePanel==='above-store'). one-pager.js's own hand-rolled backdrop was ALSO converted the
// same dispatch, but its zIndex:4000 sat between `inset:0,` and `background:'rgba(0,0,0` on that
// one line, so this regex never counted it in the first place — its removal doesn't move this
// number, even though it's the same anti-pattern fixed the same way.
// Lowered 75 → 73 by dispatch #188 (End of Month → Food Cost merge, panel-contract opportunistic
// check): FOBAnalysisPanel (src/views/analytics.js) had TWO of its own hand-rolled
// position:fixed/inset:0/rgba(0,0,0 backdrops (the loading-state early return, and the main
// panel body) sitting UNDER the RoutePanelShell App.js already wrapped it in — real double
// chrome, not just an extra backdrop pattern. Both removed; RoutePanelShell now lives inside the
// component (same "shell inside the component" pattern as sched-hub/count-cycle/etc), matching
// the count this test measured fresh on this dispatch's own branch. Lowered 73 → 70 by dispatch
// #192 (URL migration batch 1): AttentionPanel (analytics.js), RankingView (store-dash.js) and
// PromoRoiPanel (promo-roi.js) each hand-rolled this exact backdrop shape and were converted to
// RoutePanelShell as part of their route:true conversion
// (routePanel==='attention'/'ranking'/'promo-roi'). Lowered 70 → 69 by dispatch #195 (Metric
// Correlations/Scanner merge): MetricCorrelationExplorer (analytics.js) hand-rolled this exact
// backdrop; it wasn't converted to a shell, it was retired outright — folded into Signals
// (already RoutePanelShell-wrapped) as a plain tab with no chrome of its own, same as every
// other Signals tab (ScannerTab, CsatDriversTab, etc).
// Lowered 69 → 68 by dispatch #194 (Feature Requests → Task Queue merge, landed on main
// concurrently with #195): src/views/feature-requests.js was deleted outright (harvested into
// Task Queue, not converted in place), and its own hand-rolled backdrop went with the file.
// Measured fresh against this merge per the standing "never copy a number" rule — #195's branch
// alone would have measured 69, but merging in #194's already-landed deletion drops it one more.
// Lowered 68 → 53 by dispatch #198 (eom-dashboard.js backdrop sweep): all 15 hits in
// src/views/eom-dashboard.js were converted to ModalShell. Measured (not assumed uniform):
// EOMDashboardPanel's own top-level chrome is RoutePanelShell (no backdrop pattern, so never
// counted here) with no OUTER shell wrapping it from App.js — unlike FOBAnalysisPanel's
// dispatch-#188 fix, none of these 15 were redundant double chrome under an existing shell.
// Every one was a genuine secondary popup (FOB Report, FOB Root-Cause, Waste Analysis, comms
// draft, Food-Cost Diagnosis, Item journeys, Count Reliability, Rubber-band, District EOM
// Summary, Change Monitor, EOM Follow-up, AI Cross-Check, Chronic Offenders, FOB component
// breakdown, Edit diagnosis flow) that needed a real backdrop — so each was converted in place
// to ModalShell (title/onClose/maxWidth/closeOnBackdrop, and headerExtra for the three that
// carried a look-back selector alongside their title: Count Reliability, Rubber-band, Chronic
// Offenders), never deleted outright. 68 − 15 = 53, and this is the freshly re-measured count on
// dispatch #198's own branch (per the standing "never copy a number" rule), not an arithmetic
// subtraction.
// Lowered 53 → 52 by dispatch #199 (Performance Calculator → Performance Reviews merge, landed
// on main concurrently with #198): PerformanceCalculator's own hand-rolled backdrop in
// src/views/store-dash.js went with it — relocated into Performance Reviews' Customize tab as
// content-only (no ModalShell/overlay of its own, since it now renders inside an existing shell).
// Different file from #198's sweep, so the two reductions are additive; re-measured fresh on this
// merge (not 53−1 by assumption) to confirm.
// Lowered 52 → 47 by dispatch #205 (URL migration batch 2, 2026-08-28): four of the six panels
// converted to route:true this batch hand-rolled a backdrop matching this exact pattern and were
// refactored to RoutePanelShell — StoreOnePager (src/views/analytics.js, 1 hit),
// GradedVisitsPanel (src/views/graded-visits.js, 1 hit — the file's only function, so the file
// drops out of the scan entirely), VisitReadinessPanel (src/views/visit-readiness.js, 1 hit,
// same "file drops out entirely" effect), and OperatorSummaryPanel (src/views/labor-tools.js, 2
// hits — an empty-state early return AND the main panel body under one component, same "two
// backdrops, one component" shape dispatch #188 found in FOBAnalysisPanel). 1+1+1+2 = 5 removed.
// The other two panels in this batch did NOT move this count: LocationBrief ('brief') never had
// a hand-rolled backdrop of its own (it rendered inside an external ModalShell at the App.js
// call site, now an external RoutePanelShell instead — same "no internal chrome" shape as
// dispatch #192's security/signals); DeliveryMixPanel ('delivery-mix') was already ModalShell-
// based, not hand-rolled, confirmed by this file's own scan finding zero hits in
// src/views/delivery-mix.js both before and after. Verified per-file against the fresh scan on
// this dispatch's own branch (not by arithmetic subtraction) — analytics.js and labor-tools.js
// in particular host several OTHER components each, so each surviving/removed line was checked
// against the actual function boundaries, not assumed 1:1 with the panel being converted.
// Lowered 47 → 42 by dispatch #206 (URL migration batch 3, 2026-08-28, closing out the "default
// to route:true" candidate list): four of the seven panels converted to route:true this batch
// hand-rolled a backdrop matching this exact pattern and were refactored to RoutePanelShell —
// DTSpeedOfServicePanel (src/views/dt-speedofservice.js, 1 hit — the file's only function, so
// the file drops out of the scan entirely), NewsPanel (src/views/news-panel.js, 1 hit, same
// "file drops out entirely" effect), LocationIntelligence (src/features/location-intel.js, 1
// hit, same), and InventoryIntelligence (src/views/inventory.js, 2 hits — an empty-state early
// return AND the main panel body under one component, same "two backdrops, one component" shape
// dispatch #205/#188 found in OperatorSummaryPanel/FOBAnalysisPanel). 1+1+1+2 = 5 removed
// (47 → 42). The other three panels in this batch did NOT move this count, each for a different
// reason, confirmed by re-running this file's own scan on both src/views/smg-voice.js and
// src/views/task-queue.js before AND after their conversion (both zero hits, not just "expected
// zero"): SMGVoicePanel ('smg-voice') genuinely hand-rolled TWO backdrops of its own (an
// empty-state early return and the main body, the same "two backdrops, one component" shape as
// InventoryIntelligence above) — but both used `zIndex: 1200,` sitting between `inset: 0,` and
// `background:`, which breaks this regex's exact adjacency requirement (the same regex-evasion
// shape dispatch #160's own comment records for one-pager.js's old zIndex:4000 case), so
// converting real hand-rolled chrome to RoutePanelShell here still didn't move the number;
// TaskQueuePanel ('task-queue') was never the rgba(0,0,0 backdrop pattern at all — its main
// render was an opaque `position:'fixed', inset:0, zIndex:400, background:'var(--bg)'` full-page
// wrapper (no backdrop, already read like a route) and its `AddEntrySheet` add-entry bottom
// sheet splits an `absolute inset:0,background:'rgba(0,0,0,.6)'` backdrop from the `fixed` sheet
// container across two separate divs, also escaping this regex — AddEntrySheet itself was left
// alone (a genuine secondary popup stacked on the routed page, not this panel's own chrome, same
// "real secondary popup" reasoning dispatch #198 used for EOMDashboardPanel's sub-modals);
// ReportSubscriptions ('my-reports') was already ModalShell-based, not hand-rolled, matching
// dispatch #205's delivery-mix precedent exactly (pure shell swap, zero backdrop-pattern
// interaction either side).
// Dispatch #207 converted 'planning' (PlanningHubPanel) to route:true too, but that component
// lives in src/app/App.js, which ROOTS above never walks -- confirmed by re-running this file's
// own scan after the conversion: still exactly 42 hits, no change.
const CEILING = 42;

const PATTERN = /position:\s*['"]fixed['"]\s*,\s*inset:\s*0\s*,\s*background:\s*['"]rgba\(0,0,0/;

function walk(dir) {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return walk(p);
    return name.endsWith('.js') && !name.endsWith('.test.js') ? [p] : [];
  });
}

function findHits() {
  const hits = [];
  for (const root of ROOTS) {
    for (const file of walk(root)) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => { if (PATTERN.test(line)) hits.push(`${file}:${i + 1}`); });
    }
  }
  return hits;
}

describe('R7: panels must not hand-roll ModalShell\'s own backdrop', () => {
  it(`stays at exactly the measured ceiling (${CEILING}) — use ModalShell (or RoutePanelShell for a route:true panel) instead of a hand-rolled position:fixed/inset:0/rgba(0,0,0 backdrop`, () => {
    const hits = findHits();
    if (hits.length > CEILING) {
      throw new Error(
        `${hits.length} hand-rolled modal backdrops in src/views + src/features, ${hits.length - CEILING} more ` +
        `than the ceiling of ${CEILING}. New site(s):\n${hits.join('\n')}\n\n` +
        `Use ModalShell (src/components/ModalShell.js) instead of hand-rolling the backdrop/card/close ` +
        `pattern it already standardizes — see dispatch #26/#30 (Workstream D).`
      );
    }
    if (hits.length < CEILING) {
      throw new Error(
        `Only ${hits.length} hand-rolled modal backdrops remain (ceiling was ${CEILING}) — some site(s) ` +
        `were converted to ModalShell since the ceiling was last set. Lower CEILING to ${hits.length} in ` +
        `this file so the ratchet doesn't leave slack for the class to regrow into. This is not a bug in ` +
        `your change; it's this ratchet's own upkeep.`
      );
    }
    expect(hits.length).toBe(CEILING);
  });

  it('sanity: the pattern actually matches something (would false-pass if the regex broke)', () => {
    expect(findHits().length).toBeGreaterThan(0);
  });
});
