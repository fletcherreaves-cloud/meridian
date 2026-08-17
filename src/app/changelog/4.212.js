// @ts-nocheck
export default {version:'4.212', date:'2026-06-19', changes:[
  'Found the actual root cause via a Chrome Performance recording (console-level instrumentation had ruled out everything it could see — this needed a real profiler)',
  'AtAGlance — the main dashboard, a 1600-line component — was rendering and fully recomputing every time ANY of 53 separate modal flags opened, even though it was 100% visually hidden behind the full-screen overlay the entire time',
  'Confirmed directly in the profile: AtAGlance\'s own render function was the dominant cost in a 177-second interaction, not Priority Brief, not buildStore, not React itself',
  'Fixed: added a single anyModalOpen check (OR of every modal-visibility flag in App\'s own scope — 7 candidates were excluded after verifying they\'re declared in other components, which would have caused an immediate crash) and gated AtAGlance, StoreDash, and OrgView on it — none of them render while a modal covers them',
  'Tradeoff worth knowing: these views fully unmount while hidden rather than just visually hiding, so local UI state (like scroll position) resets when a modal closes. Worth it given the alternative was multi-minute freezes.',
]};
