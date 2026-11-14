// @ts-nocheck
// Notes 74 follow-up (2026-11-14, task #156) -- per-store QSRSoft deep-link scoping. Verified
// live via Playwright login (v3.myqsrsoft.com main app, NOT the WAF-blocked /equipment/tickets
// sub-app) that most QSR report/form pages accept `?location=<unpadded loc>` and genuinely
// scope to that store. These tests pin the mechanical wiring (which links get the param, and
// only when exactly one store is in view), not the live QSRSoft behaviour itself.
import { describe, it, expect } from 'vitest';
import { QUICK_LINKS, quickLinkHref } from '../views/at-a-glance.js';

describe('quickLinkHref', () => {
  it('appends ?location=<unpadded loc> for a locParam link when exactly one store is in view', () => {
    const link = QUICK_LINKS.find(l => l.label === 'Register Audit');
    expect(link.locParam).toBe(true);
    const href = quickLinkHref(link, [{ loc: '0005183' }]);
    expect(href).toBe('https://v3.myqsrsoft.com/reports/mcd/controlsCash/registerAudit?location=5183');
  });

  it('appends with & (not ?) when the base URL already has a query string', () => {
    const link = QUICK_LINKS.find(l => l.label === 'Travel Path (Playplace)');
    expect(link.locParam).toBe(true);
    const href = quickLinkHref(link, [{ loc: '0003708' }]);
    expect(href).toBe('https://v3.myqsrsoft.com/forms/take?formId=fd2c551a-5859-449a-80c1-5bb980ce7704&location=3708');
  });

  it('falls back to the plain URL when more than one store is in view (no single store to scope to)', () => {
    const link = QUICK_LINKS.find(l => l.label === 'Food Over Base');
    const href = quickLinkHref(link, [{ loc: '0005183' }, { loc: '0003708' }]);
    expect(href).toBe(link.url);
  });

  it('falls back to the plain URL when no stores are in view', () => {
    const link = QUICK_LINKS.find(l => l.label === 'Food Over Base');
    expect(quickLinkHref(link, [])).toBe(link.url);
    expect(quickLinkHref(link, null)).toBe(link.url);
  });

  it('leaves a non-locParam link (e.g. QSRSoft Home, atMcd) unscoped even with one store in view', () => {
    const link = QUICK_LINKS.find(l => l.label === 'QSRSoft Home');
    expect(link.locParam).toBeUndefined();
    expect(quickLinkHref(link, [{ loc: '0005183' }])).toBe(link.url);
  });

  it('Operations Report stays unscoped -- the live check could not confirm it the same way its siblings were confirmed', () => {
    const link = QUICK_LINKS.find(l => l.label === 'Operations Report');
    expect(link.locParam).toBeUndefined();
  });

  it('every QSR report/form link except Home and Operations Report is marked locParam:true', () => {
    const qsrLinks = QUICK_LINKS.filter(l => l.group === 'qsr' || l.group === 'foodcost');
    const unscoped = qsrLinks.filter(l => !l.locParam).map(l => l.label);
    expect(unscoped.sort()).toEqual(['Operations Report', 'QSRSoft Home', 'Tickets'].sort());
  });
});
