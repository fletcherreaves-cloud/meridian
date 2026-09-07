# E2E smoke tests

`npm run test:e2e` (or `npx playwright test`). Config: `playwright.config.js` at the repo root.

## What this covers

Two smoke tests against a real running dev server (`npm run dev`, started automatically by
Playwright's `webServer`):

1. **The app boots without a fatal error.** Page title is correct, the "Loading Meridian…"
   placeholder clears, the body has real rendered content, and no unexpected `console.error`/
   uncaught page errors fire.
2. **The real nav shell renders**, not a stub — checks for a handful of always-present nav labels
   spanning multiple sections, the location-selector pills (All/OK/FL), and the build's own
   version string (`v5.386`-shaped) on the page.

## Why this is possible without a real login

`src/components/AuthGate.js` deliberately bypasses Supabase auth entirely when
`window.location.hostname === 'localhost'`:

```js
if (!supabase || window.location.hostname === 'localhost') return children;
```

So the dev server renders straight into the full app shell — no magic-link/OTP flow to automate,
no test credentials needed. This is also why these tests can only run against `localhost` (the
dev server); they cannot exercise the same bypass against the deployed Vercel app, which is the
right behavior — that path requires real auth by design.

## What this deliberately does NOT cover

- **Any authenticated-flow behavior specific to a role or `accessible_locs` scope.** The
  localhost bypass skips auth entirely, so there is no session, no `profiles` row, and no RBAC
  gating exercised — every panel renders in its "logged in as nobody in particular" shape.
- **Any panel beyond the shell/nav.** Clicking into a specific panel (Projections, SAGE, etc.) and
  asserting on its content is real, valuable follow-on work, not attempted here — this is
  deliberately a *shell* smoke test, not per-panel coverage.
- **Live data.** This sandbox's Supabase credentials return zero rows for every tenant table
  (documented in CLAUDE.md), so the app is exercised in its genuine "0 stores · no data" state,
  not against real production data. That's a feature for a smoke test (catches "does the app
  survive an empty dataset," a real failure mode this codebase has hit before), not a gap — but it
  means these tests cannot catch a data-shape regression that only shows up with real rows.
- **CI integration.** Not wired into `.github/workflows/ci.yml` — that's a deliberate scope
  boundary for this first slice, not an oversight. Adding it means a `playwright install
  --with-deps chromium` step and real per-PR runtime cost, which is a CI-pipeline change worth a
  deliberate decision rather than a side effect of adding the first test file.

## Local environment note

This sandbox's `@playwright/test` version expects a `chrome-headless-shell` build the
pre-installed browser cache doesn't have. `playwright.config.js` points `launchOptions.
executablePath` at `/opt/pw-browsers/chromium` (the full Chromium browser, which IS
pre-installed) instead — do not run `playwright install`. If this ever needs to change, check
what `/opt/pw-browsers/` actually contains before assuming a version mismatch is the cause.
