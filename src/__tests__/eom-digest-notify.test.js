// @ts-nocheck
// Dispatch #215 Task 3 — unit tests for scripts/lib/eom-digest-notify.mjs's roll-up digest email
// content + send. Mocked global.fetch throughout, matching src/__tests__/resend-notify.test.js's
// own pattern (#211) — zero real network calls; postResend() itself is already covered there, so
// these tests focus on THIS file's own additions: recipientFor(), buildDigestEmailContent(), and
// sendDigestEmail()'s request shape.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { recipientFor, buildDigestEmailContent, sendDigestEmail } from '../../scripts/lib/eom-digest-notify.mjs';
import { EMAIL_TO } from '../../scripts/lib/resend-notify.mjs';

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
