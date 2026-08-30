// @ts-nocheck
// Dispatch #215 Task 3 — unit tests for scripts/lib/eom-digest-notify.mjs's roll-up digest email
// content + send. Mocked global.fetch throughout, matching src/__tests__/resend-notify.test.js's
// own pattern (#211) — zero real network calls; postResend() itself is already covered there, so
// these tests focus on THIS file's own additions: recipientFor(), buildDigestEmailContent(), and
// sendDigestEmail()'s request shape.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { recipientFor, buildDigestEmailContent, sendDigestEmail } from '../../scripts/lib/eom-digest-notify.mjs';
import { EMAIL_TO } from '../../scripts/lib/resend-notify.mjs';
import { buildEomDigest } from '../engine/eom-digest.js';

const GROUP = {
  key: 'Mary Ratliff', label: 'Mary Ratliff', storeCount: 4,
  completion: {
    food: { complete: 1, inProgress: 2, notStarted: 1, na: 0, total: 4 },
    condiment: { complete: 2, inProgress: 1, notStarted: 1, na: 0, total: 4 },
    paper: { complete: 4, inProgress: 0, notStarted: 0, na: 0, total: 4 },
    nonproduct: { complete: 0, inProgress: 0, notStarted: 0, na: 4, total: 4 },
  },
  uncountedValue: 842.5,
  fob: {
    avgGapPP: 1.2, overTargetCount: 1, underTargetCount: 1, nWithFobData: 2,
    worstStores: [{ loc: '0006178', name: 'Chipley-St Rd 77', gapPP: 2.4 }],
  },
  doneFoodCond: 1,
  openFoodCond: [{ loc: '0006838', name: 'Defuniak Springs' }, { loc: '0010034', name: 'Bonifay' }, { loc: '0037566', name: 'Mossy Head' }],
  daysLeft: 2,
  headline: 'Mary Ratliff: 1/4 stores Food+Cond complete, Defuniak Springs, Bonifay, Mossy Head still open — 2 days left. FOB: 1 store over target (worst: Chipley-St Rd 77 +2.4pp).',
  stores: [],
};

describe('recipientFor', () => {
  it('resolves every (level, groupKey) to the owner\'s own email — dispatch #215 v1 scope', () => {
    expect(recipientFor('district', 'district')).toBe(EMAIL_TO);
    expect(recipientFor('patch', 'Mary Ratliff')).toBe(EMAIL_TO);
    expect(recipientFor('org', 'emerald')).toBe(EMAIL_TO);
    expect(recipientFor('patch', 'Brad Denley')).toBe(EMAIL_TO);
  });
});

describe('buildDigestEmailContent', () => {
  it('subject names the level and the group label', () => {
    const { subject } = buildDigestEmailContent(GROUP, 'patch');
    expect(subject).toContain('Patch');
    expect(subject).toContain('Mary Ratliff');
  });

  it('renders the headline verbatim (number + decision, per the standing UI-voice rule)', () => {
    const { html } = buildDigestEmailContent(GROUP, 'patch');
    expect(html).toContain(GROUP.headline);
  });

  it('renders per-class completion counts for all four classes', () => {
    const { html } = buildDigestEmailContent(GROUP, 'patch');
    expect(html).toContain('Food');
    expect(html).toContain('1/4 complete');
    expect(html).toContain('Condiment');
    expect(html).toContain('2/4 complete');
    expect(html).toContain('Paper');
    expect(html).toContain('4/4 complete');
    expect(html).toContain('Non-Product');
    expect(html).toMatch(/4 n\/a/);
  });

  it('lists the still-open Food/Condiment stores by name', () => {
    const { html } = buildDigestEmailContent(GROUP, 'patch');
    expect(html).toContain('Defuniak Springs');
    expect(html).toContain('Bonifay');
    expect(html).toContain('Mossy Head');
  });

  it('renders the uncounted-value $ figure with its "not yet observed" caveat', () => {
    const { html } = buildDigestEmailContent(GROUP, 'patch');
    expect(html).toContain('$843'); // 842.5 rounded
    expect(html).toMatch(/not yet observed/);
  });

  it('omits the uncounted-risk line entirely when the group has none', () => {
    const clean = { ...GROUP, uncountedValue: 0 };
    const { html } = buildDigestEmailContent(clean, 'patch');
    expect(html).not.toMatch(/uncounted-item risk/);
  });

  it('renders the FOB-vs-target section with the worst offender when present', () => {
    const { html } = buildDigestEmailContent(GROUP, 'patch');
    expect(html).toContain('FOB vs target');
    expect(html).toContain('+1.2pp');
    expect(html).toContain('Chipley-St Rd 77');
    expect(html).toContain('+2.4pp over target');
  });

  it('omits the FOB section entirely when no store in the group has fresh FOB data', () => {
    const noFob = { ...GROUP, fob: { avgGapPP: null, overTargetCount: 0, underTargetCount: 0, nWithFobData: 0, worstStores: [] } };
    const { html } = buildDigestEmailContent(noFob, 'patch');
    expect(html).not.toContain('FOB vs target');
  });

  it('labels a district-level group correctly', () => {
    const district = { ...GROUP, key: 'district', label: 'District' };
    const { subject, html } = buildDigestEmailContent(district, 'district');
    expect(subject).toContain('District');
    expect(html).toContain('District EOM Digest');
  });

  it('labels an operator-level group correctly (dispatch #224 Task 3)', () => {
    const op = { ...GROUP, key: 'Ryan Thorley', label: 'Ryan Thorley' };
    const { subject, html } = buildDigestEmailContent(op, 'operator');
    expect(subject).toContain('Operator');
    expect(subject).toContain('Ryan Thorley');
    expect(html).toContain('Operator EOM Digest');
  });
});

// dispatch #224 Task 6 — per-store FOB+components table + recount-opportunities list, reusing
// fobComponentsTableHtml() (resend-notify.mjs). Real consumer test (buildDigestEmailContent()
// itself, not the extracted helper called directly) per this repo's "would this verification
// still pass if reverted" rule — reverting the storesHtml wiring in eom-digest-notify.mjs would
// leave these assertions failing even though fobComponentsTableHtml() itself still works fine.
describe('buildDigestEmailContent — per-store detail (dispatch #224 Task 6)', () => {
  const GROUP_WITH_STORES = {
    ...GROUP,
    stores: [
      {
        loc: '0006178', name: 'Chipley-St Rd 77', org: 'FL', patch: 'Brad Denley',
        fob: { fobPct: 0.30, fob: 3000, comp: 200, raw: 200, cond: 200, emp: 200, statv: 200, unex: 200, asOf: '2026-08-29' },
        fobTarget: { fobPct: 0.25, gapPP: 5, overTarget: true, comps: [{ key: 'statv', label: 'Variance Stat', actualPP: 4, tgtPP: 3, deltaPP: 1 }] },
        fobComps: [{ key: 'statv', label: 'Variance Stat', actualPP: 4, tgtPP: 3, deltaPP: 1 }],
        recountItems: [
          { wrin: 'W1', descr: 'Never Counted Item', cls: 'food', valueAtRisk: 123.45, state: 'never' },
          { wrin: 'W2', descr: 'Stale Residual Item', cls: 'food', valueAtRisk: 999, state: 'stale' },
        ],
      },
      {
        loc: '0006838', name: 'Defuniak Springs', org: 'FL', patch: 'Brad Denley',
        fob: null, fobTarget: null, fobComps: null, recountItems: [],
      },
    ],
  };

  it('renders a per-store section per store, headed "Per-store detail"', () => {
    const { html } = buildDigestEmailContent(GROUP_WITH_STORES, 'patch');
    expect(html).toContain('Per-store detail');
    expect(html).toContain('Chipley-St Rd 77');
    expect(html).toContain('Defuniak Springs');
  });

  it('renders the 5-column FOB+components table for a store with fresh FOB data', () => {
    const { html } = buildDigestEmailContent(GROUP_WITH_STORES, 'patch');
    expect(html).toContain('Variance Stat');
    expect(html).toContain('4%');   // actualPP
    expect(html).toContain('3%');   // tgtPP
    expect(html).toContain('+1pp'); // deltaPP
    expect(html).toContain('30%');  // headline fobPct
  });

  it('a store with no FOB data at all shows the explicit fallback line, not a blank section', () => {
    const { html } = buildDigestEmailContent(GROUP_WITH_STORES, 'patch');
    expect(html).toContain('No FOB data on record for this store yet.');
  });

  it('renders recount opportunities for a store that has them, with WRIN/Description/Class/$', () => {
    const { html } = buildDigestEmailContent(GROUP_WITH_STORES, 'patch');
    expect(html).toContain('W1');
    expect(html).toContain('Never Counted Item');
    expect(html).toContain('$123');
  });

  it('a store with no open recount items shows the explicit "no gaps" line, framed as not a green light to skip routine recounts', () => {
    const { html } = buildDigestEmailContent(GROUP_WITH_STORES, 'patch');
    expect(html).toContain('No uncounted-item gaps flagged');
    expect(html).toContain('skip the routine of recounting top stat/variance items');
  });

  it('renders a stale-state item if one somehow reached group.stores directly (this file trusts its input; the real exclusion gate is buildEomDigest() — see the end-to-end test below)', () => {
    // Documents the actual design: storeSectionHtml() has no filter of its own, matching the
    // dashboard's own storeRow rendering (src/views/eom-dashboard.js) — BOTH render layers trust
    // src/engine/eom-digest.js's rollupGroup() as the single authoritative state!=='stale' gate,
    // rather than duplicating the filter in every consumer. This fixture hand-builds `stores`
    // (bypassing buildEomDigest() entirely), so it's the one case that DOES leak — proving there's
    // exactly one real gate, not zero.
    const { html } = buildDigestEmailContent(GROUP_WITH_STORES, 'patch');
    expect(html).toContain('W2');
  });

  it('omits the "Per-store detail" section entirely when the group has no stores (unchanged from before this dispatch)', () => {
    const { html } = buildDigestEmailContent(GROUP, 'patch'); // GROUP.stores === []
    expect(html).not.toContain('Per-store detail');
  });
});

// dispatch #224 — end-to-end: buildEomDigest() (the real engine) -> buildDigestEmailContent() (the
// real email renderer), proving state:'stale' is excluded through the ACTUAL pipeline a live send
// uses, not just at the engine's own return value (already covered by eom-digest.test.js) nor at
// the render layer alone (the fixture-based test above, which deliberately bypasses the engine).
describe('buildEomDigest() -> buildDigestEmailContent() — end-to-end stale exclusion (dispatch #224 verification)', () => {
  it('a store with never/early/stale recount items emails only never/early — stale never appears in the sent HTML', () => {
    const storeRow = {
      loc: '6178', name: 'Chipley-St Rd 77', patch: 'Brad Denley',
      classStatuses: {
        food: { status: 'complete', pct: 1 }, condiment: { status: 'complete', pct: 1 },
        paper: { status: 'complete', pct: 1 }, nonproduct: { status: 'complete', pct: 1 },
      },
      uncountedValue: 0, fob: null, fobTarget: null,
      recountItems: [
        { wrin: 'N1', descr: 'Never Item', cls: 'food', valueAtRisk: 50, state: 'never' },
        { wrin: 'E1', descr: 'Early Item', cls: 'food', valueAtRisk: 25, state: 'early' },
        { wrin: 'S1', descr: 'Stale Item', cls: 'food', valueAtRisk: 5000, state: 'stale' },
      ],
    };
    const digest = buildEomDigest([storeRow], { level: 'patch', period: '2026-08' });
    const group = digest.groups.find(g => g.key === 'Brad Denley');
    expect(group).toBeTruthy();
    const { html } = buildDigestEmailContent(group, 'patch');
    expect(html).toContain('N1');
    expect(html).toContain('E1');
    expect(html).not.toContain('S1');
    expect(html).not.toContain('Stale Item');
  });
});

describe('sendDigestEmail — Resend API request shape', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; process.env.RESEND_API_KEY = 'test-key-123'; });
  afterEach(() => { global.fetch = originalFetch; delete process.env.RESEND_API_KEY; vi.restoreAllMocks(); });

  it('POSTs to the Resend API with the group\'s subject/html to the owner\'s email', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock;

    const ok = await sendDigestEmail(GROUP, 'patch');

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    const body = JSON.parse(opts.body);
    expect(body.to).toEqual([EMAIL_TO]);
    expect(body.subject).toContain('Mary Ratliff');
    expect(body.html).toContain(GROUP.headline);
  });

  it('warns and resolves false without throwing when RESEND_API_KEY is missing', async () => {
    delete process.env.RESEND_API_KEY;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const ok = await sendDigestEmail(GROUP, 'district');

    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});
