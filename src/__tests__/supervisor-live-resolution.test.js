// @ts-nocheck
// #363 — supervisor-of-record has one live source: constants.js's effective-dated timeline
// (orgAssignments/whoRan/supervisorGroups), seeded from DEF_SETTINGS.supervisorGroups and kept
// current by App.js from Supabase org_config. Before this fix there were THREE independent
// loc->supervisor literals living outside constants.js -- morning-brief.js's SUPERVISOR_PATCHES
// (which had gone stale: several locs disagreed with the live org, e.g. '43701' sat under
// 'Podroza' there but under 'Brad Denley' in DEF_SETTINGS.supervisorGroups) and per-loc `sup:`/
// `supEmail:` string literals baked into both morning-brief.js's STORE_STAFF and read directly
// off constants.js's own INV_ORG_COORDS snapshot in inventory.js -- none of which moved when a
// patch was reassigned through Management. All three were removed/routed through whoRan.
//
// Census scanner: fails if a NEW loc->supervisor-name literal creeps back in outside
// constants.js. Two patterns cover the two bug shapes that actually shipped:
//   1. `sup:`/`supEmail:` assigned a quoted string literal (STORE_STAFF's old shape)
//   2. A quoted-capitalized-name key mapped to an array of quoted numeric-looking locs
//      (SUPERVISOR_PATCHES' shape: {'Spencer': ['3708', ...]})
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { whoRan, orgAssignments, supervisorGroups, DEF_SETTINGS } from '../constants.js';

const SRC = new URL('../', import.meta.url).pathname;
const walk = (dir) => readdirSync(dir).flatMap(n => {
  const p = join(dir, n);
  if (statSync(p).isDirectory()) return n === '__tests__' ? [] : walk(p);
  return p.endsWith('.js') ? [p] : [];
});

describe('#363 no supervisor->locs literal outside constants.js', () => {
  const PATTERNS = [
    /\bsup\s*:\s*'[A-Z]/,          // sup: 'Robert Spencer' -- hardcoded name literal
    /\bsupEmail\s*:\s*'/,          // supEmail: '...' -- hardcoded email literal
    /'[A-Z][a-zA-Z]+'\s*:\s*\[\s*'\d{4,}'/,  // 'Spencer': ['3708', ...] -- name->locs literal
  ];

  it('has no hits outside constants.js', () => {
    const hits = [];
    for (const file of walk(SRC)) {
      if (file.endsWith('constants.js')) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (line.trim().startsWith('//')) return;
        if (PATTERNS.some(re => re.test(line))) {
          hits.push(`${file.replace(SRC, 'src/')}:${i + 1}`);
        }
      });
    }
    expect(hits, `supervisor->locs literal outside constants.js:\n${hits.join('\n')}`).toEqual([]);
  });
});

describe('#363 pipeline sup/supEmail resolve live via whoRan', () => {
  it('whoRan finds every real store in the seed org, matching DEF_SETTINGS.supervisorGroups', () => {
    const today = new Date();
    for (const [sup, locs] of Object.entries(DEF_SETTINGS.supervisorGroups)) {
      for (const loc of locs) {
        expect(whoRan(loc, today)).toBe(sup);
      }
    }
  });

  it('a mid-history reassignment changes who whoRan returns, without touching the seed', () => {
    const before = whoRan('3708', new Date('2026-01-01'));
    expect(before).toBe('Robert Spencer');
    const reassigned = [...orgAssignments(), { loc: '3708', supervisor: 'Ashley Podroza', start: '2026-06-01' }];
    expect(whoRan('3708', new Date('2026-01-01'), reassigned)).toBe('Robert Spencer');   // before the change: unaffected
    expect(whoRan('3708', new Date('2026-08-01'), reassigned)).toBe('Ashley Podroza');   // after: new supervisor
  });

  it('supervisorGroups() (today) reflects the same seed the guard test above checked', () => {
    const groups = supervisorGroups();
    expect(Object.keys(groups).sort()).toEqual(Object.keys(DEF_SETTINGS.supervisorGroups).sort());
  });
});
