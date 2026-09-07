// @ts-nocheck
// E2E smoke-test config. AuthGate.js bypasses Supabase auth entirely on `localhost`
// (`if (!supabase || window.location.hostname === 'localhost') return children;`), so the
// dev server on 127.0.0.1/localhost renders straight into the full app with no login step —
// that's what makes these tests possible without a real Supabase session. See e2e/README.md
// for what is (and deliberately isn't) covered.
import { defineConfig, devices } from '@playwright/test';

const PORT = 4319;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // This repo's @playwright/test version expects a chrome-headless-shell build the
        // pre-installed cache doesn't have; the full Chromium browser IS pre-installed and
        // works fine headed-off via launchOptions — see CLAUDE.md's own environment note
        // ("do not run playwright install"; use this executablePath instead).
        launchOptions: { executablePath: '/opt/pw-browsers/chromium' }, // stable symlink
      },
    },
  ],
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
