import { describe, it, expect } from 'vitest';
import { parseGradedVisit, htmlToLines } from '../parsers/graded-visits.js';

// Synthetic fixture mirroring the real "Comprehensive Visit Report" structure
// (the actual reports are private). Each field is its own element so the text
// extractor splits them into ordered lines the way the export does.
const fixture = (opts = {}) => {
  const { score = '87.5%', appQ = 'Yes', primary = 'Drive Thru', primaryPct = '85.7', primaryAch = '48', primaryPos = '56' } = opts;
  return `<html><body>
    <div>Comprehensive Visit Report</div>
    <div>Customer First Visit - Customer First Visit 2026</div>
    <div>Visit detail</div><div>03708</div><div>ARDMORE-BROADWAY</div>
    <div>Restaurant number:</div><div>03708</div>
    <div>Owner/Operator:</div><div>Ryan Thorley</div>
    <div>Restaurant manager:</div><div>Mario</div>
    <div>Date:</div><div>28-Jan-2026</div>
    <div>Day parts:</div><div>Breakfast</div>
    <div>Weekpart:</div><div>Weekday</div>
    <div>Visit done by:</div><div>Deborah Jones</div>
    <div>Visit Completion Time:</div><div>09:30 AM</div>
    <div>Score(%):</div><div>${score}</div>
    <div>Module</div><div>Percent</div><div>Total Points Achieved</div><div>Adjusted Points Possible</div>
    <div>${primary}</div><div>${primaryPct}</div><div>${primaryAch}</div><div>${primaryPos}</div>
    <div>Behind the Counter</div><div>90.6</div><div>29</div><div>32</div>
    <div>Sub total</div><div>87.5</div><div>77</div><div>88</div>
    <div>DT3-US-01</div><div>Order: Did Order Taker ask if you are using your McDonald's App and acknowledge you by name?</div><div>${appQ}</div>
  </body></html>`;
};

describe('graded-visits parser', () => {
  it('extracts the core fields from a CFV report', () => {
    const v = parseGradedVisit(fixture(), { passThreshold: 80 });
    expect(v.reportType).toBe('CFV');
    expect(v.store).toBe('03708');
    expect(v.name).toBe('ARDMORE-BROADWAY');
    expect(v.date).toBe('28-Jan-2026');
    expect(v.daypart).toBe('Breakfast');
    expect(v.score).toBeCloseTo(87.5, 3);
    expect(v.modules['Drive Thru'].pct).toBeCloseTo(85.7, 3);
    expect(v.modules['Behind the Counter'].ach).toBe(29);
  });

  it('pass/fail respects the threshold', () => {
    expect(parseGradedVisit(fixture({ score: '87.5%' }), { passThreshold: 80 }).pass).toBe(true);
    expect(parseGradedVisit(fixture({ score: '76.1%' }), { passThreshold: 80 }).pass).toBe(false);
    expect(parseGradedVisit(fixture({ score: '76.1%' }), { passThreshold: 70 }).pass).toBe(true);
  });

  it('reads the DT app question → mobile vs traditional', () => {
    expect(parseGradedVisit(fixture({ appQ: 'Yes' })).mobileApp).toBe(true);
    expect(parseGradedVisit(fixture({ appQ: 'No' })).mobileApp).toBe(false);
  });

  it('treats a Curbside module as a mobile-app transaction regardless of the app Q', () => {
    const v = parseGradedVisit(fixture({ primary: 'Curbside', primaryPct: '61.5', primaryAch: '32', primaryPos: '52' }));
    expect(v.channel).toBe('Curbside');
    expect(v.mobileApp).toBe(true);
  });

  it('picks the primary channel as the non-Counter module', () => {
    expect(parseGradedVisit(fixture()).channel).toBe('Drive Thru');
  });

  it('htmlToLines strips tags and entities', () => {
    const lines = htmlToLines('<div>A&amp;B</div><span>  C  </span>');
    expect(lines).toEqual(['A&B', 'C']);
  });
});
