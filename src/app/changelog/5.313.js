// @ts-nocheck
export default {version:'5.313', date:'2026-09-01', changes:[
  'App-wide Screenshot Share -- the real "native OS Share sheet" backlog item, not just the ' +
  'narrow slice v5.309 shipped. Owner: "I want that expanded app wide though!... include in the ' +
  'share menu the ability to share a screenshot of the users screen. Even better if it ' +
  'screenshots the whole screen (even the part unviewable due to scrolling)." A new "📸 Share" ' +
  'button now lives directly in RoutePanelShell (src/components/ModalShell.js), so every ' +
  'route:true panel gets it with ZERO per-panel wiring -- 32 panels today, re-measured this ' +
  'session by parsing the live panel-registry.js PANELS array (not grepped; CLAUDE.md and ' +
  'memory/panel-contract.md both corrected from a stale "13 of 101").',
  'Captures the panel\'s FULL rendered content, not just what\'s visible -- including anything ' +
  'scrolled out of view, per the owner\'s explicit ask. src/utils/panel-screenshot.js targets ' +
  'RoutePanelShell\'s own body node (which carries no overflow of its own -- the app\'s real ' +
  'scroll container is an ancestor, App.js\'s .mf-main-content) via html2canvas (lazy-loaded, ' +
  'src/lib/html2canvas-lazy.js, pinned to its own Rollup chunk exactly like xlsx-lazy.js -- ' +
  '46.78 KB gzip, confirmed NOT in the eager bundle). Also finds and resets the actual scrolled ' +
  'ancestor to the top before capture (restored after) as a defense against html2canvas\'s ' +
  'documented history of geometry bugs when a distant ancestor is mid-scroll.',
  'Real fidelity risk closed, not just reasoned about: eom-supervisor.js\'s own openPrintWindow ' +
  'history documents a genuine prior bug where an EARLIER print mechanism tried resolving this ' +
  'app\'s theme CSS custom properties inside a separate window.open(\'\') document with no ' +
  'stylesheets and no data-theme/data-mode attributes -- on dark mode, every var(--*) token ' +
  'resolved to nothing, near-invisible white-on-white text. This feature avoids that class of ' +
  'bug structurally (captures the LIVE node in place; html2canvas clones the actual document\'s ' +
  'stylesheets/attributes into an offscreen iframe, never starts from a blank one) -- and it was ' +
  'VERIFIED for real, not assumed: a real headless Chromium (Playwright) driven against the dev ' +
  'server captured a harness in dark mode with content scrolled 1000px down; the resulting PNG ' +
  'was 500x1965px (the full content height, not the 400px visible slice) with the top marker, ' +
  'full dark background, and the off-screen bottom marker all correctly rendered with legible ' +
  'var(--text) on every background. Full writeup + the exact harness: ' +
  'memory/project-share-screenshot.md.',
  'Output chain (src/utils/share.js\'s new shareFileOrSave(), a file-sharing counterpart to the ' +
  'existing link-sharing shareOrCopy() -- different fallback chain, so its own function): native ' +
  'OS share sheet with the PNG as a real File (Web Share API Level 2, canShare({files}) gated, ' +
  'AbortError treated as a deliberate cancel) -> copy-image-to-clipboard ' +
  '(navigator.clipboard.write + ClipboardItem) -> plain PNG download. Labeled "📸 Share", ' +
  'deliberately distinct from the existing "🔗 Share" link buttons (Count Cycle, EOM Scoreboard) ' +
  '-- same-looking label would read as the same feature; this one shares an image, not a URL.',
  'Deliberate Phase-1 scope: route:true panels only (RoutePanelShell). Hub-tab content (Count ' +
  'Cycle, EOM reports, Labor Analytics, etc.) never mounts RoutePanelShell at all and is out of ' +
  'scope here -- a real follow-on, not a gap discovered after the fact. Also NOT unifying ' +
  'existing per-panel Print/CSV/Copy buttons into this control -- those stay as-is; ' +
  'print-as-formatted-report is genuinely better than print-as-screenshot-image for real tables.',
  'Tests: share-file-util.test.js (shareFileOrSave unit tests, same Node 20/22 navigator-guard ' +
  'shape as share-util.test.js). route-panel-shell-screenshot-share.test.js -- real-render tests ' +
  'against RoutePanelShell with GENERIC, non-panel-specific children (proves "app-wide, zero ' +
  'per-panel wiring" directly): button exists on any consumer; clicking it captures the panel\'s ' +
  'own body node (not window/document); the file reaches navigator.share with the right MIME ' +
  'type and a slugified filename; status label appears and clears. Full suite 362/362 files, ' +
  '3659/3659 tests; build clean, 532.20 KB gzip eager payload (850 KB budget, +1.4KB from the ' +
  'button/wiring -- html2canvas itself confirmed lazy, not counted).',
]};
