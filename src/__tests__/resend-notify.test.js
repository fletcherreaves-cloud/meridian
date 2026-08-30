// @ts-nocheck
// Dispatch #211 — unit tests for scripts/lib/resend-notify.mjs's real email + SMS-via-carrier-
// gateway delivery. Mocked global.fetch throughout — zero real network calls, per this repo's
// verification bar for a live external credential (the actual RESEND_API_KEY validity, delivery
// without a verified domain, and AT&T gateway delivery are NOT provable from a sandbox; see
// scripts/test-eom-notification-send.mjs for the live smoke test these functions also power).
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  sendEmailNotification, sendSmsViaCarrierGateway, buildEmailContent, buildSmsBody,
  triggerLabel, EMAIL_TO, SMS_TO, fobComponentsTableHtml,
} from '../../scripts/lib/resend-notify.mjs';

const ROW = {
  loc: '0011657',
  period: '2026-08',
  trigger_kind: 'food_condiment',
  class_statuses: {
    food:       { status: 'complete',    pct: 1.0,  total: 40, counted: 40 },
    condiment:  { status: 'complete',    pct: 0.99, total: 22, counted: 21 },
    paper:      { status: 'not_started', pct: 0,    total: 15, counted: 0 },
    nonproduct: { status: 'in_progress', pct: 0.5,  total: 8,  counted: 4 },
    lateBulk: false, lateBulkDay: null,
  },
  uncounted_items: {
    items: [
      { wrin: 'A1', descr: 'Frozen Patties', cls: 'condiment', valueAtRisk: 430.5 },
      { wrin: 'A2', descr: 'Ketchup Packets', cls: 'condiment', valueAtRisk: 12.1 },
    ],
    totalCount: 2, totalValue: 442.6, truncated: false,
  },
  kb_links: [
    { title: 'Physical Inventory', url: 'https://support.qsrsoft.com/hc/en-us/articles/35675285615127-Physical-Inventory' },
  ],
  fob_snapshot: null,
};
const STORE_INFO = { loc: '0011657', name: 'Purcell' };

let originalFetch;
beforeEach(() => {
  originalFetch = global.fetch;
  process.env.RESEND_API_KEY = 'test-key-123';
});
afterEach(() => {
  global.fetch = originalFetch;
  delete process.env.RESEND_API_KEY;
  vi.restoreAllMocks();
});

describe('triggerLabel', () => {
  it('formats a single class', () => { expect(triggerLabel('paper')).toBe('Paper'); });
  it('formats a joined pair', () => { expect(triggerLabel('food_condiment')).toBe('Food + Condiment'); });
});

describe('buildEmailContent', () => {
  it('includes the store name/loc, trigger, ALL FOUR class statuses (not just the trigger), uncounted items, and KB links', () => {
    const { subject, html } = buildEmailContent(ROW, STORE_INFO);
    expect(subject).toContain('Purcell');
    expect(subject).toContain('Food + Condiment');
    // Rule 3 — every relevant class shown, not just the trigger.
    expect(html).toContain('Food');
    expect(html).toContain('Condiment');
    expect(html).toContain('Paper');
    expect(html).toContain('Non-Product');
    expect(html).toContain('Not Started'); // paper's real status
    expect(html).toContain('In Progress'); // nonproduct's real status
    // Uncounted items inline, nothing silently truncated.
    expect(html).toContain('Frozen Patties');
    expect(html).toContain('Ketchup Packets');
    expect(html).toContain('$443'); // total value rounded (442.6 -> 443 via Math.round)
    // KB link present.
    expect(html).toContain('support.qsrsoft.com');
    expect(html).toContain('Physical Inventory');
  });

  it('dispatch #213 Task 1 — shows the item name AND the WRIN together when descr exists', () => {
    const row = { ...ROW, uncounted_items: { items: [
      { wrin: 'A1', descr: 'Frozen Patties', cls: 'condiment', valueAtRisk: 430.5 },
    ], totalCount: 1, totalValue: 430.5, truncated: false } };
    const { html } = buildEmailContent(row, STORE_INFO);
    expect(html).toContain('Frozen Patties (A1)');
  });

  it('dispatch #213 Task 1 — falls back to the WRIN alone when descr is missing', () => {
    const row = { ...ROW, uncounted_items: { items: [
      { wrin: 'A9', descr: null, cls: 'condiment', valueAtRisk: 5 },
    ], totalCount: 1, totalValue: 5, truncated: false } };
    const { html } = buildEmailContent(row, STORE_INFO);
    expect(html).toContain('<li>A9');
    expect(html).not.toContain('A9 (A9)');
  });

  it('caps inline items at 10 and notes the true total when more exist', () => {
    const items = Array.from({ length: 15 }, (_, i) => ({ wrin: `X${i}`, descr: `Item ${i}`, cls: 'food', valueAtRisk: 10 }));
    const row = { ...ROW, uncounted_items: { items, totalCount: 15, totalValue: 150, truncated: true } };
    const { html } = buildEmailContent(row, STORE_INFO);
    expect(html).toContain('Item 0');
    expect(html).toContain('Item 9');
    expect(html).not.toContain('Item 10');
    expect(html).toMatch(/top 10 of 15/);
  });
});

describe('buildEmailContent — dispatch #213 Task 3, FOB section', () => {
  const FOB_SNAP = {
    sales: 100000, comp: 400, raw: 300, cond: 150, emp: 100, statv: 800, unex: 250,
    fob: 2000, fobPct: 0.02, asOf: '2026-08-28',
  };

  it('renders the FOB headline + all six components when fob_snapshot is present (fresh)', () => {
    const row = { ...ROW, fob_snapshot: FOB_SNAP };
    const { html } = buildEmailContent(row, STORE_INFO);
    expect(html).toContain('FOB');
    expect(html).toContain('2%'); // fobPct 0.02 -> 2%
    expect(html).toContain('$2,000'); // fob $
    expect(html).toContain('Variance Stat');
    expect(html).toContain('$800');
    expect(html).toContain('Completed Waste');
    expect(html).toContain('$400');
    expect(html).toContain('Raw Waste');
    expect(html).toContain('$300');
    expect(html).toContain('Condiments');
    expect(html).toContain('$150');
    expect(html).toContain('Emp/Mgr Meals');
    expect(html).toContain('$100');
    expect(html).toContain('Unexplained');
    expect(html).toContain('$250');
  });

  it('renders NO FOB section at all when fob_snapshot is null (stale/missing)', () => {
    const row = { ...ROW, fob_snapshot: null };
    const { html } = buildEmailContent(row, STORE_INFO);
    expect(html).not.toContain('FOB (Food Over Base)');
    expect(html).not.toContain('Variance Stat');
  });

  it('renders NO FOB section when fob_snapshot is absent from the row entirely', () => {
    const { fob_snapshot, ...rowWithoutFob } = ROW;
    const { html } = buildEmailContent(rowWithoutFob, STORE_INFO);
    expect(html).not.toContain('FOB (Food Over Base)');
  });
});

describe('buildEmailContent — dispatch #219 Task 2, FOB component breakdown as a table with Actual %', () => {
  const FOB_SNAP = {
    sales: 100000, comp: 400, raw: 300, cond: 150, emp: 100, statv: 800, unex: 250,
    fob: 2000, fobPct: 0.02, asOf: '2026-08-28',
  };
  const FOB_TARGET = {
    fobPct: 0.025, gapPP: -0.5, overTarget: false,
    comps: [
      { key: 'statv', label: 'Variance Stat', actualPP: 0.8, tgtPP: 0.5, deltaPP: 0.3 },
      { key: 'comp', label: 'Completed Waste', actualPP: 0.4, tgtPP: 0.3, deltaPP: 0.1 },
      { key: 'raw', label: 'Raw Waste', actualPP: 0.3, tgtPP: 0.3, deltaPP: 0 },
      { key: 'cond', label: 'Condiments', actualPP: 0.15, tgtPP: 0.2, deltaPP: -0.05 },
      { key: 'emp', label: 'Emp/Mgr Meals', actualPP: 0.1, tgtPP: 0.1, deltaPP: 0 },
      { key: 'unex', label: 'Unexplained', actualPP: 0.25, tgtPP: 0.2, deltaPP: 0.05 },
    ],
    topDriver: null,
  };

  it('renders a real <table> (not a <ul>) with all 4 data columns per component when fob_target is present', () => {
    const row = { ...ROW, fob_snapshot: FOB_SNAP, fob_target: FOB_TARGET };
    const { html } = buildEmailContent(row, STORE_INFO);
    expect(html).toContain('<table');
    expect(html).not.toMatch(/<ul[^>]*>\s*<li>Variance Stat/); // old list rendering is gone
    expect(html).toContain('>Component<');
    expect(html).toContain('>Actual $<');
    expect(html).toContain('>Actual %<');
    expect(html).toContain('>Target %<');
    // Variance Stat row: $800 actual, 0.8% actual (matches fs.statv/fs.sales), 0.5% target, +0.3pp delta.
    expect(html).toContain('$800');
    expect(html).toContain('0.8%');
    expect(html).toContain('0.5%');
    expect(html).toContain('+0.3pp');
  });

  it('renders Actual $ and Actual % even when fob_target is absent, with Target %/Δ as "—"', () => {
    const row = { ...ROW, fob_snapshot: FOB_SNAP, fob_target: null };
    const { html } = buildEmailContent(row, STORE_INFO);
    expect(html).toContain('<table');
    expect(html).toContain('$800'); // Actual $ still populated
    expect(html).toContain('0.8%'); // Actual % derived from fs.statv/fs.sales, still populated
    expect(html).toContain('0.4%'); // Completed Waste: 400/100000
    // Every component's Target %/Δ cell reads em-dash: 6 rows x 2 columns = 12 dash cells.
    const dashCells = (html.match(/>—<\/td>/g) || []).length;
    expect(dashCells).toBe(12);
  });

  it('still renders nothing at all when fob_snapshot itself is absent, unchanged from #213', () => {
    const row = { ...ROW, fob_snapshot: null, fob_target: FOB_TARGET };
    const { html } = buildEmailContent(row, STORE_INFO);
    expect(html).not.toContain('FOB (Food Over Base)');
    expect(html).not.toContain('Variance Stat');
    expect(html).not.toContain('>Actual %<');
  });

  // dispatch #224 Task 6 — fobComponentsTableHtml() extracted out of fobSectionHtml() so the EOM
  // Digest roll-up's per-store loop (scripts/lib/eom-digest-notify.mjs) can call it directly. The
  // tests just above already prove fobSectionHtml()'s OUTPUT is unchanged after the extraction
  // (same table cells, same "—" fallback behavior); these prove the extracted function itself is
  // usable standalone, with fs/tgt passed directly rather than wrapped in a row.
  it('fobComponentsTableHtml(fs, tgt) renders the same table content as fobSectionHtml(), called directly', () => {
    const html = fobComponentsTableHtml(FOB_SNAP, FOB_TARGET);
    expect(html).toContain('<table');
    expect(html).toContain('Variance Stat');
    expect(html).toContain('$800');
    expect(html).toContain('0.8%');
    expect(html).toContain('0.5%');
    expect(html).toContain('+0.3pp');
    // It does NOT include the <h3> header or "Investigate further" links section — those are
    // fobSectionHtml()'s own wrapper, not part of the extracted table.
    expect(html).not.toContain('FOB (Food Over Base)');
    expect(html).not.toContain('Investigate further');
  });

  it('fobComponentsTableHtml returns "" when fs is absent, matching fobSectionHtml\'s own no-caveat-no-placeholder discipline', () => {
    expect(fobComponentsTableHtml(null, FOB_TARGET)).toBe('');
  });

  // Owner feedback (dispatch #224 follow-up): show the FOB snapshot a store has even before its
  // count is complete, captioned rather than withheld. countComplete===false is the ONLY value
  // that adds the caveat — undefined (every pre-existing caller, e.g. #213's single-store email)
  // must render identically to before this param existed.
  it('countComplete===false adds an in-progress caveat; omitting it (existing callers) renders unchanged', () => {
    const withCaveat = fobComponentsTableHtml(FOB_SNAP, FOB_TARGET, false);
    expect(withCaveat).toContain('count in progress, not yet complete');
    const noCaveatExplicit = fobComponentsTableHtml(FOB_SNAP, FOB_TARGET, true);
    expect(noCaveatExplicit).not.toContain('count in progress');
    const noCaveatOmitted = fobComponentsTableHtml(FOB_SNAP, FOB_TARGET);
    expect(noCaveatOmitted).not.toContain('count in progress');
    expect(noCaveatOmitted).toBe(fobComponentsTableHtml(FOB_SNAP, FOB_TARGET, undefined));
  });
});

describe('buildEmailContent — dispatch #214, FOB tool links "Investigate further" sub-section', () => {
  const FOB_SNAP = {
    sales: 100000, comp: 400, raw: 300, cond: 150, emp: 100, statv: 800, unex: 250,
    fob: 2000, fobPct: 0.02, asOf: '2026-08-28',
  };
  const TOOL_LINKS = [
    { title: 'Variance Stat/Yields (F)', url: 'https://v3.myqsrsoft.com/cimt/inventory/stat-variance?location=11657&tab=varianceStat&start=2026-08-01&period=M&class=F' },
    { title: 'Waste (this store)', url: 'https://v3.myqsrsoft.com/cimt/inventory/waste?location=11657' },
  ];

  it('renders "Investigate further" with the given links, as its own sub-section distinct from FOB components and Helpful links', () => {
    const row = { ...ROW, fob_snapshot: FOB_SNAP, fob_tool_links: TOOL_LINKS };
    const { html } = buildEmailContent(row, STORE_INFO);
    expect(html).toContain('Investigate further');
    expect(html).toContain('Variance Stat/Yields (F)');
    expect(html).toContain('stat-variance?location=11657');
    expect(html).toContain('Waste (this store)');
    // Comes after the FOB components ("Variance Stat" the component label), and before the
    // existing "Helpful links" block — its own sub-section, not mixed into either.
    const compsIdx = html.indexOf('>Variance Stat<'); // fobSectionHtml's component table cell
    const investigateIdx = html.indexOf('Investigate further');
    const helpfulIdx = html.indexOf('Helpful links');
    expect(compsIdx).toBeGreaterThan(-1);
    expect(investigateIdx).toBeGreaterThan(compsIdx);
    expect(helpfulIdx).toBeGreaterThan(investigateIdx);
  });

  it('renders NOTHING (no "Investigate further" header) when fob_tool_links is an empty array', () => {
    const row = { ...ROW, fob_snapshot: FOB_SNAP, fob_tool_links: [] };
    const { html } = buildEmailContent(row, STORE_INFO);
    expect(html).not.toContain('Investigate further');
  });

  it('renders NOTHING when fob_tool_links is null', () => {
    const row = { ...ROW, fob_snapshot: FOB_SNAP, fob_tool_links: null };
    const { html } = buildEmailContent(row, STORE_INFO);
    expect(html).not.toContain('Investigate further');
  });

  it('renders NOTHING when fob_tool_links is absent from the row entirely', () => {
    const row = { ...ROW, fob_snapshot: FOB_SNAP };
    const { html } = buildEmailContent(row, STORE_INFO);
    expect(html).not.toContain('Investigate further');
  });

  it('renders NOTHING when the FOB section itself is absent (no fob_snapshot), even if fob_tool_links were somehow present', () => {
    const row = { ...ROW, fob_snapshot: null, fob_tool_links: TOOL_LINKS };
    const { html } = buildEmailContent(row, STORE_INFO);
    expect(html).not.toContain('Investigate further');
  });
});

describe('buildSmsBody', () => {
  it('is short plain text, store name, trigger class(es), a decision-relevant status line, no KB links, no HTML', () => {
    const body = buildSmsBody(ROW, STORE_INFO);
    expect(body.length).toBeLessThanOrEqual(300);
    expect(body).toContain('Purcell');
    expect(body).toMatch(/Food/);
    expect(body).toMatch(/Condiment/);
    expect(body).not.toContain('<'); // no HTML markup
    expect(body).not.toContain('support.qsrsoft.com'); // no KB links in SMS
  });

  it('hard-truncates to under ~300 chars even with a very long store name', () => {
    const longStore = { loc: '0011657', name: 'A'.repeat(400) };
    const body = buildSmsBody(ROW, longStore);
    expect(body.length).toBeLessThanOrEqual(300);
  });
});

describe('sendEmailNotification — Resend API request shape', () => {
  it('POSTs to the Resend API with the correct URL, auth header, from, and recipient', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock;

    const ok = await sendEmailNotification(ROW, STORE_INFO);

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(opts.method).toBe('POST');
    expect(opts.headers.Authorization).toBe('Bearer test-key-123');
    expect(opts.headers['Content-Type']).toBe('application/json');
    const body = JSON.parse(opts.body);
    expect(body.from).toBe('Meridian <onboarding@resend.dev>');
    expect(body.to).toEqual([EMAIL_TO]);
    expect(body.to).toEqual(['fletcher.reaves@mcreaves.com']);
    expect(body.html).toContain('Purcell');
    expect(body.subject).toContain('Food + Condiment');
  });
});

describe('sendSmsViaCarrierGateway — Resend API request shape', () => {
  it('POSTs to the same Resend API but to the AT&T gateway address with a plain-text body', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    global.fetch = fetchMock;

    const ok = await sendSmsViaCarrierGateway(ROW, STORE_INFO);

    expect(ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    const body = JSON.parse(opts.body);
    expect(body.to).toEqual([SMS_TO]);
    expect(body.to).toEqual(['3346722598@txt.att.net']);
    expect(body.text).toBeTruthy();
    expect(body.html).toBeUndefined(); // plain text only for the carrier gateway
  });
});

describe('error handling — both functions warn and return false, never throw', () => {
  it('sendEmailNotification: a non-2xx Resend response warns and resolves false', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 422, text: async () => 'invalid recipient' });

    const ok = await sendEmailNotification(ROW, STORE_INFO);

    expect(ok).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls.some(c => c.join(' ').includes('422'))).toBe(true);
  });

  it('sendSmsViaCarrierGateway: a thrown fetch error warns and resolves false, does not throw', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    global.fetch = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(sendSmsViaCarrierGateway(ROW, STORE_INFO)).resolves.toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls.some(c => c.join(' ').includes('network down'))).toBe(true);
  });

  it('missing RESEND_API_KEY: warns and resolves false without calling fetch', async () => {
    delete process.env.RESEND_API_KEY;
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchMock = vi.fn();
    global.fetch = fetchMock;

    const ok = await sendEmailNotification(ROW, STORE_INFO);

    expect(ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalled();
  });
});
