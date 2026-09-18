// @vitest-environment happy-dom
// @ts-nocheck
// Backlog: "Top-of-Discussion report — pre-populate relevant names for scope." The Discussion
// sheet (one-pager.js's printBlankOnePager) used to always print two hand-fill blanks
// ("______________ <-> ______________") for who the conversation is between, even though the
// Supervisor side of a Supervisor<->GM or DO<->Supervisor pairing is already resolvable live
// data -- whoRan() (constants.js), the same effective-dated org-assignment lookup Management's
// own Supervisor Assignments editor is built on. Owner/DO/GM have no equivalent assignment data
// anywhere in the app, so only the Supervisor half of the pairing is ever filled; the other
// blank (and the whole 'o_d' Owner->DO level, which has no Supervisor at all) stays blank.
//
// Per "would this verification still pass if reverted?": resolveDiscussionNames ignored its
// arguments entirely before this change (the function didn't exist), and printBlankOnePager
// ignored a 3rd argument (the old 2-arg call site always printed underscores) -- every
// assertion below on a NAME appearing fails against that old behavior.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { resolveDiscussionNames, printBlankOnePager, cascadeOf } from '../views/one-pager.js';
import { setLiveAssignments } from '../constants.js';

const ASG = [
  { loc: '6178', supervisor: 'Mary Chen', start: '' },
  { loc: '6178', supervisor: 'Brad Denley', start: '2026-08-01' }, // reassigned mid-history
];

beforeEach(() => { setLiveAssignments(ASG); });
afterEach(() => { document.body.innerHTML = ''; });

describe('resolveDiscussionNames -- Discussion sheet name resolution', () => {
  it("'s_g' (Supervisor -> GM): fills name1 with the supervisor, leaves name2 (GM) blank", () => {
    expect(resolveDiscussionNames('s_g', ['6178'], '2026-08-15')).toEqual({ name1: 'Brad Denley' });
  });

  it("'d_s' (DO -> Supervisor): fills name2 with the supervisor, leaves name1 (DO) blank", () => {
    expect(resolveDiscussionNames('d_s', ['6178'], '2026-08-15')).toEqual({ name2: 'Brad Denley' });
  });

  it("'o_d' (Owner -> DO): resolves nothing -- neither role has assignment data", () => {
    expect(resolveDiscussionNames('o_d', ['6178'], '2026-08-15')).toEqual({});
  });

  it('resolves the supervisor AS OF the given date, not the current one (a past period keeps its own history)', () => {
    expect(resolveDiscussionNames('s_g', ['6178'], '2026-07-15')).toEqual({ name1: 'Mary Chen' });
    expect(resolveDiscussionNames('s_g', ['6178'], '2026-08-15')).toEqual({ name1: 'Brad Denley' });
  });

  it('returns {} when there is no store in scope, or no assignment covers it', () => {
    expect(resolveDiscussionNames('s_g', [], '2026-08-15')).toEqual({});
    expect(resolveDiscussionNames('s_g', ['9999999'], '2026-08-15')).toEqual({});
  });
});

describe('printBlankOnePager -- resolved names reach the printed sheet', () => {
  const page = { rangeLabel: 'Sep 8-14', cascade: cascadeOf('s_g'), scopeLabel: 'Ardmore-Broadway', currentState: [], opportunity: {}, perLocation: [], opportunityTotal: 0 };

  function printedHtml() {
    const iframes = [...document.querySelectorAll('iframe')];
    const iframe = iframes[iframes.length - 1];
    return iframe ? iframe.contentDocument.documentElement.outerHTML : '';
  }

  it('a resolved name1 renders in place of the first blank underscore line', () => {
    printBlankOnePager(page, 'Sep 8-14', { name1: 'Brad Denley' });
    const html = printedHtml();
    expect(html).toMatch(/<b>Brad Denley<\/b>.*↔/); // first blank replaced by the resolved name
    expect(html).not.toMatch(/______________.*↔/);  // the old unconditional-underscore text is gone
  });

  it('an unresolved side stays a blank underscore line', () => {
    printBlankOnePager(page, 'Sep 8-14', { name1: 'Brad Denley' });
    const html = printedHtml();
    expect(html).toMatch(/↔.*______________/); // name2 (GM) never resolved, still blank
  });

  it('with no names passed at all, both blanks render exactly as before (no regression for the o_d level)', () => {
    printBlankOnePager(page, 'Sep 8-14');
    const html = printedHtml();
    expect(html).toMatch(/______________.*↔.*______________/);
  });
});
