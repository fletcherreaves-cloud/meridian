import { describe, it, expect } from 'vitest';
import { parseGradedVisit, htmlToLines, parseVisitDate } from '../parsers/graded-visits.js';

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

  it('does not infer app-vs-traditional — channel is the order method (mobileApp always null)', () => {
    // The DT "did the order taker ask about the app" answer only records whether
    // the employee asked, not whether the shopper used the app, so we never map it.
    expect(parseGradedVisit(fixture({ appQ: 'Yes' })).mobileApp).toBeNull();
    expect(parseGradedVisit(fixture({ appQ: 'No' })).mobileApp).toBeNull();
  });

  it('surfaces the Curbside module as the channel without an app flag', () => {
    const v = parseGradedVisit(fixture({ primary: 'Curbside', primaryPct: '61.5', primaryAch: '32', primaryPos: '52' }));
    expect(v.channel).toBe('Curbside');
    expect(v.mobileApp).toBeNull();
  });

  it('picks the primary channel as the non-Counter module', () => {
    expect(parseGradedVisit(fixture()).channel).toBe('Drive Thru');
  });

  it('parseVisitDate handles abbreviated and full month names', () => {
    expect(parseVisitDate('28-Jan-2026')).toBe('2026-01-28');
    expect(parseVisitDate('07-July-2026')).toBe('2026-07-07');
    expect(parseVisitDate('06-Apr-2026')).toBe('2026-04-06');
    expect(parseVisitDate('garbage')).toBeNull();
  });

  it('htmlToLines strips tags and entities', () => {
    const lines = htmlToLines('<div>A&amp;B</div><span>  C  </span>');
    expect(lines).toEqual(['A&B', 'C']);
  });
});

// RGR (Running Great Restaurants) — whole-restaurant, component-scored.
const rgrFixture = (opts = {}) => {
  const { overall = '88%', cleanliness = '85.4', hsCrit = 'Critical Questions Passed', fsCrit = 'Critical Questions Passed' } = opts;
  return `<html><body>
    <div>Comprehensive Visit Report</div><div>Acceptable</div>
    <div>Running Great Restaurants Visit - Running Great Restaurants 2026</div>
    <div>Announced</div>
    <div>Visit detail</div><div>06838</div><div>DEFUNIAK SPRINGS</div>
    <div>Restaurant number:</div><div>06838</div>
    <div>Owner/Operator:</div><div>Jacob Thorley</div>
    <div>Restaurant manager:</div><div>Stephanie Harris</div>
    <div>Supervisor:</div><div>Brad Denley</div>
    <div>Date:</div><div>10-Feb-2026</div>
    <div>Visit done by:</div><div>Jessica Stevenson</div>
    <div>Health & Safety:</div><div>${hsCrit}</div>
    <div>US Food Safety:</div><div>${fsCrit}</div>
    <div>Score(%):</div>
    <div>Overall:</div><div>${overall}</div>
    <div>Quality:</div><div>89.3%</div>
    <div>Service:</div><div>90.2%</div>
    <div>Cleanliness:</div><div>${cleanliness}%</div>
    <div>Shift Leadership:</div><div>90.9%</div>
    <div>Health & Safety:</div><div>94.1%</div>
    <div>US Food Safety:</div><div>84%</div>
    <div>To meet standards, the Running Great Restaurants Visit requires an 80% or higher overall score, with no critical questions missed and no more than one component score below 80.</div>
  </body></html>`;
};

describe('RGR parser', () => {
  it('dispatches to RGR and extracts components + status', () => {
    const v = parseGradedVisit(rgrFixture(), { passThreshold: 80 });
    expect(v.reportType).toBe('RGR');
    expect(v.store).toBe('06838');
    expect(v.score).toBeCloseTo(88, 3);
    expect(v.status).toBe('Acceptable');
    expect(v.channel).toBeNull();           // whole-restaurant, not a channel
    expect(v.modules['Cleanliness'].pct).toBeCloseTo(85.4, 3);
    expect(v.modules['US Food Safety'].pct).toBeCloseTo(84, 3);
  });

  it('applies the 3-part pass rule', () => {
    // overall >=80, critical ok, <=1 component below 80 → pass
    expect(parseGradedVisit(rgrFixture({ cleanliness: '77' })).pass).toBe(true);   // exactly one <80
    // two components below 80 → fail
    expect(parseGradedVisit(rgrFixture({ overall: '84%', cleanliness: '70' })).modules['Cleanliness'].pct).toBe(70);
    // a missed critical question → fail regardless of score
    expect(parseGradedVisit(rgrFixture({ hsCrit: 'Critical Question Missed' })).pass).toBe(false);
    // overall below threshold → fail
    expect(parseGradedVisit(rgrFixture({ overall: '78%' })).pass).toBe(false);
  });
});
