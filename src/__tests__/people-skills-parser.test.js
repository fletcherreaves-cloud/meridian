import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parsePeopleSkills, parseSkillJobs, detectType } from '../parsers/index.js';

const rows = JSON.parse(readFileSync(fileURLToPath(new URL('./fixtures/people-skills-sample.json', import.meta.url)), 'utf8'));
const parsed = parsePeopleSkills(rows);
const byName = Object.fromEntries(parsed.employees.map(e => [e.employee, e]));

describe('people-skills — parseSkillJobs explodes the packed string', () => {
  it('parses "JOB (n)" pairs into a {job:rating} map', () => {
    const m = parseSkillJobs('"BEVERAGE SPECIALIST (3), DRIVE THRU (5), SUPPORT / PREP (4)"');
    expect(m['BEVERAGE SPECIALIST']).toBe(3);
    expect(m['DRIVE THRU']).toBe(5);
    expect(m['SUPPORT / PREP']).toBe(4); // slash preserved, not split
  });
  it('handles slash job names and empty input', () => {
    expect(parseSkillJobs('"ADMINISTRATION/CASH (1)"')['ADMINISTRATION/CASH']).toBe(1);
    expect(Object.keys(parseSkillJobs('""'))).toHaveLength(0);
    expect(Object.keys(parseSkillJobs(null))).toHaveLength(0);
  });
});

describe('people-skills — roster + skills', () => {
  it('parses each employee with home store + primary role', () => {
    const a = byName['Alicia Salazar'];
    expect(a.loc).toBe('11657');
    expect(a.homeStore).toBe('PURCELL');
    expect(a.role).toBe('CREW PERSON');
    expect(a.roleCode).toBe('00650');
    expect(a.isPrimaryRole).toBe(true);
    expect(a.skills['DRIVE THRU']).toBe(3);
  });
  it('captures mixed ratings (Elizabeth: some 5s, some 1s)', () => {
    const e = byName['Elizabeth Salazar'];
    expect(e.skills['BEVERAGE SPECIALIST']).toBe(5);
    expect(e.skills['DRIVE THRU']).toBe(1);
    expect(e.role).toBe('CREW TRAINER');
  });
  it('an employee with no skills yields an empty map', () => {
    expect(Object.keys(byName['Aylin Salazar'].skills)).toHaveLength(0);
  });
  it('parses a home store with a comma ("TECUMSEH, OK")', () => {
    expect(byName['Matthew Timperley'].loc).toBe('33704');
    expect(byName['Matthew Timperley'].homeStore).toBe('TECUMSEH, OK');
    expect(byName['Matthew Timperley'].role).toBe('GENERAL MANAGER');
  });
  it('keeps cross-store employees under their real home store', () => {
    expect(byName['James Jackson'].loc).toBe('3708'); // Ardmore, appears in Purcell file
  });
});

describe('people-skills — job column set + pulled store', () => {
  it('collects a clean sorted job list (no quote artifacts)', () => {
    expect(parsed.jobs).toContain('DRIVE THRU');
    expect(parsed.jobs).toContain('SUPPORT / PREP');
    expect(parsed.jobs.some(j => j.startsWith('"'))).toBe(false);
  });
  it('infers the pulled store as the modal home store', () => {
    expect(parsed.pulledLoc).toBe('11657');
    expect(parsed.pulledStore).toBe('PURCELL');
  });
});

describe('people-skills — filename detection', () => {
  it('routes people_list_simple_*.csv to people-skills', () => {
    expect(detectType('people_list_simple_0011657__PURCELL_20260722T121716.csv', {}).type).toBe('people-skills');
  });
});
