// @ts-nocheck
// E2E smoke tests — see e2e/README.md for what this does and doesn't cover.
import { test, expect } from '@playwright/test';

test.describe('app shell boots', () => {
  test('loads without a fatal error and shows the Meridian shell', async ({ page }) => {
    const consoleErrors = [];
    page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push('console.error: ' + msg.text());
    });

    await page.goto('/');
    await expect(page).toHaveTitle(/Meridian/);

    // AuthGate bypasses auth on localhost, so the real app shell should mount — not the
    // login card. Wait for the loading placeholder to clear rather than a fixed timeout.
    await expect(page.getByText('Loading Meridian…')).toHaveCount(0, { timeout: 30_000 });

    // A genuinely blank/white-screen failure is the one thing a smoke test exists to catch.
    const bodyText = await page.locator('body').innerText();
    expect(bodyText.trim().length).toBeGreaterThan(0);

    // Known third-party/expected noise this app tolerates (network calls to a live
    // production Supabase project with a scoped anon key are expected to come back empty in
    // this sandbox, not throw) is filtered out; anything else is a real regression signal.
    const unexpected = consoleErrors.filter(e =>
      !/favicon|Failed to load resource|net::ERR_/.test(e)
    );
    expect(unexpected, unexpected.join('\n')).toEqual([]);
  });

  test('renders the real nav shell and location selector, not a stub', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Loading Meridian…')).toHaveCount(0, { timeout: 30_000 });

    // The first-run onboarding tour auto-opens over the shell — dismiss it so it doesn't mask
    // a genuinely broken nav underneath, matching what a real first-time device sees.
    const skip = page.getByRole('button', { name: 'Skip' });
    if (await skip.isVisible().catch(() => false)) await skip.click();

    // A handful of always-present nav labels, spanning multiple sections (admin/analytics),
    // so this fails if the panel registry or nav renderer breaks, not just one panel.
    for (const label of ['Data Manager', 'Settings', 'Projections']) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
    }

    // Location selector (All/OK/FL pills) — a core cross-app control, not panel-specific.
    for (const pill of ['All', 'OK', 'FL']) {
      await expect(page.getByRole('button', { name: pill, exact: true })).toBeVisible();
    }

    // The build's own version string should be on the page — catches a stale/failed deploy
    // of the built app the same way it would in production, not just "something rendered".
    await expect(page.getByText(/^v\d+\.\d+$/)).toBeVisible();
  });
});
