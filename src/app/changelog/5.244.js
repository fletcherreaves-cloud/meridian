// @ts-nocheck
export default {version:'5.244', date:'2026-08-28', changes:[
  'Dispatch #203 -- merged Rankings / Record Days / Top-Bottom Performers into one Leaderboards ' +
  'panel with three clearly labeled modes, per the owner\'s live approval and dispatch #77\'s own ' +
  'note that this exact trio sharing 🏆 is on record as intentional. Explicitly the most ' +
  'speculative merge of this session\'s batch -- read all three fully before designing anything, ' +
  'per the dispatch\'s own instruction, and the verdict is that it HOLDS UP: each answers a ' +
  'genuinely different question (Rankings = current-period cross-store leaderboard by chosen ' +
  'metric; Record Days = all-time single best day/week/month per store; Top/Bottom = distribution ' +
  'of over- vs under-performers on one metric, top-5/bottom-5), but they are three lenses on the ' +
  'same leaderboard-shaped data, not three unrelated tools -- closer in spirit to how Signals ' +
  'hosts LiveOps/Scanner/Signal Lab as distinct tabs over one shell than to a harvest-and-retire ' +
  'merge. So this is NOT a pick-a-survivor-retire-the-others move: all three components keep their ' +
  'full original computation and UI untouched (RankingTab\'s METRICS/localStats/groups/sorted, ' +
  'RecordDayTab\'s computeRecords/scopeRecordData/six inner tabs/export/print/reset/localStorage, ' +
  'TopBottomTab\'s rankPerformers/normalize/PerformerRow all byte-identical to before), just with ' +
  'each one\'s own shell (RoutePanelShell for Rankings, ModalShell for the other two) peeled off ' +
  'and its former title/subtitle/headerExtra/subHeader content moved to ordinary rows at the top ' +
  'of its own return -- store-dash.js\'s new LeaderboardPanel owns ONE RoutePanelShell plus a ' +
  'three-way mode tab strip (🏆 Rankings / 🏆 Record Days / 🏆 Top/Bottom) and renders whichever ' +
  'mode is active.' +
  '\n\n' +
  '\'ranking\' survives as the registry id/route -- the most-established of the three (already ' +
  'kind:\'nav\', route:true, section:\'reports\', vs record-day\'s kind:\'optional\' and top-' +
  'bottom\'s kind:\'test-kitchen\') -- relabeled Rankings -> Leaderboards to reflect the three ' +
  'questions it now answers. \'record-day\' and \'top-bottom\' retired to kind:\'internal\' (ids ' +
  'kept for the dispatch<->registry pairing test and so old deep links redirect, same "kept ' +
  'registered" pattern as channel-intel/time-punches); record-day also dropped from constants.js\'s ' +
  'OPTIONAL_PANELS toggle list, since it no longer has its own Panel Manager entry. \'top-bottom\' ' +
  'is ALSO promoted out of Test Kitchen in the same move, per CLAUDE.md\'s standing one-field ' +
  '`kind` flip promotion rule (kind:\'test-kitchen\' -> kind:\'internal\' rather than \'nav\', ' +
  'since it no longer has its own nav entry -- it\'s reachable through Leaderboards now). Old deep ' +
  'links: App.js\'s onOpenModal(\'record-day\')/onOpenModal(\'top-bottom\') now set the merged ' +
  'panel\'s mode state and goRoute(\'ranking\') instead of opening a standalone modal, same ' +
  '"route to the hub, select the tab" pattern as crew-schedule/time-punches (#197). New App-level ' +
  '`leaderboardMode` state mirrors the existing `rankingDefault` pattern (RankingTab\'s own ' +
  'defaultMetric-sync convention) exactly, including the useEffect re-sync on prop change.' +
  '\n\n' +
  'NOT shared across modes, deliberately, and checked before assuming otherwise (per this ' +
  'session\'s "check whether a helper exists"/shared-vs-not precedent): each mode keeps its OWN ' +
  'location scope and OWN window/period controls. Rankings has no LocationSelector at all (a ' +
  'group-by-patch/operator/state dimension instead -- a materially different scoping model); ' +
  'Record Days\' LocationSelector scopes an ALL-TIME computation; Top-Bottom\'s scopes a WINDOWED ' +
  'one -- three different meanings for "which stores," so a shared picker would be wrong for two ' +
  'of the three. Same reasoning for the window/period pickers: Rankings\' DR_PRESETS and Top-' +
  'Bottom\'s WINDOW_PRESETS are close but not identical, and Record Days doesn\'t have a "window" ' +
  'in the same sense at all (windowDays only bounds its Recent Breaks tab, not the all-time scan). ' +
  'Also opportunistic bonus fix, not scope creep: record-day.js was previously one of the few ' +
  'views/ modules statically imported by App.js instead of behind lazyPanel() (flagged in its own ' +
  'header comment as a deliberate-but-costly workaround for ExportDropdown\'s lazy load). Folding ' +
  'its content into store-dash.js\'s LeaderboardPanel -- itself only ever reached through a lazy ' +
  'dynamic import -- removes that static import entirely; measured before/after below.' +
  '\n\n' +
  'Every store-row click in every mode now calls onSelectStore alone (no separate onClose() call) ' +
  '-- the merged host\'s own onSelectStore, threaded from App.js, already does goStore(s);' +
  'goRoute(null), matching how Record Days/Top-Bottom\'s onSelectStore already worked; Rankings\' ' +
  'old row handler called both onSelectStore AND onClose, which was redundant with what the ' +
  'caller already did.' +
  '\n\n' +
  'New test dispatch-203-leaderboard-merge.test.js renders the REAL merged LeaderboardPanel (not ' +
  'the three content components in isolation) and asserts: it owns a real RoutePanelShell Back ' +
  'button (moved here from dispatch-130-record-day-export.test.js\'s old "uses ModalShell" check, ' +
  'since Record Days no longer owns its own shell); defaults to the Rankings mode; clicking each ' +
  'mode tab swaps in that mode\'s real content; `mode: "record-day"`/`mode: "top-bottom"` (the ' +
  'retired-modal-redirect props) open straight on the right mode; and the registry reflects the ' +
  'retirement/promotion (ranking kind:nav/route:true/label Leaderboards, record-day and top-bottom ' +
  'both kind:internal, top-bottom has no tkOrder left). dispatch-155-store-dash-ranking-rate.test.js, ' +
  'dispatch-130/103-record-day-*.test.js and top-bottom-performers-panel.test.js updated to target ' +
  'the peeled-apart content components (RankingTab/RecordDayTab/TopBottomTab) directly, per this ' +
  'repo\'s "would this verification still pass if reverted?" standing rule -- each already ' +
  'independently proves its own component\'s behavior; the new merge test proves the wiring between ' +
  'them. shell-nav-snapshot.test.js\'s EXPECTED array and two HIDDEN_WHEN_DENIED lists re-captured ' +
  'fresh from the real failure output (never hand-guessed, per this dispatch\'s own instruction), ' +
  'THEN merged by hand a second time with dispatch #202\'s own concurrent edit to the same file ' +
  '(landed on origin/main mid-session -- 5.243.js went to #202, this dispatch renumbered to 5.244) ' +
  '-- both sets of changes (EOM Supervisor\'s drop + Rankings/Top-Bottom\'s) are reflected together: ' +
  '\'Rankings\' -> \'Leaderboards\', \'Top/Bottom Performers\' text+icon drop out of the nav ' +
  'snapshot and the analytics.district hidden-set entirely, and 🏆 -- now uniquely owned by ' +
  'Leaderboards again -- goes back into the analytics.store hidden-set (reversing dispatch #77\'s ' +
  'note that it had left that list once Top/Bottom Performers also rendered it). Test Kitchen ' +
  'census ratchet 12 -> 11 (a deliberate promotion, not drift).' +
  '\n\n' +
  'Verification: full suite 301/301 files, 3119/3119 tests passing (post-rebase onto origin/main, ' +
  'including dispatch #202\'s own concurrently-landed test). npm run build clean; entry chunk ' +
  '460.67 KB gzip / eager payload 532.98 KB gzip (budget 850 KB, 317.02 KB headroom) -- DOWN from ' +
  'a measured 473.63 KB / 545.98 KB gzip baseline on the pre-merge tree (same build, changes ' +
  'stashed), the record-day.js static-import fix above shrinking the entry chunk by ~13 KB gzip ' +
  'even though the merge is otherwise a pure code-motion, net-neutral operation.',
]}
