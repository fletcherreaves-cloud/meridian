// @ts-nocheck
// Notes 73 #4 (owner, 2026-11-07): "curated explanations of HOW a bad condition occurred...
// paired with PRACTICAL prevention steps" + "suggest where to look for more context." This
// extends diagnoseMiss()'s existing qualitative causes (why.js) with a `remedy` field per
// cause — the practical "what to do about it" the owner asked for, reusing the same trusted
// diagnosis the UI already renders rather than building a parallel coaching mechanism.
// Render-level wiring (store-dash.js / analytics.js showing cause.remedy under cause.text) is
// covered by those panels' own existing render tests continuing to pass with the new field
// present — these tests are the engine-level guarantee that every real cause branch ships one.
import { describe, it, expect } from 'vitest';
import { diagnoseMiss } from '../engine/why.js';

const baseR = (over = {}) => ({ date: new Date('2026-03-10T12:00:00'), actual: 1000, forecast: 900, varPct: 0.1, wAdj: 0, opsFactor: 1, ...over });

describe('diagnoseMiss() — every real cause carries a practical remedy', () => {
  it('a tagged event gets a remedy about recurring Calendar rules', () => {
    const r = baseR();
    const userEvents = { '10422': { '2026-03-10': { label: 'Parade', note: 'Main St closed' } } };
    const causes = diagnoseMiss('10422', { loaded: false }, userEvents, r);
    const event = causes.find(c => c.icon === '📌');
    expect(event.remedy).toBeTruthy();
    expect(event.remedy).toMatch(/recurring Calendar rule/i);
  });

  it('a weather mismatch (model undersized it) gets a recalibration remedy', () => {
    const ds = { wxByDate: { '2026-03-10': { rain: 2.0, tmax: 70, wmax: 5 } } };
    // actual<forecast -> missDir='over'; mismatch for 'over' requires wAdj>0.
    const r = baseR({ wAdj: 0.03, actual: 900, forecast: 1000 });
    const causes = diagnoseMiss('10422', ds, {}, r);
    const wx = causes.find(c => c.icon === '🌦');
    expect(wx.weight).toBe('PRIMARY');
    expect(wx.remedy).toMatch(/recalibration/i);
  });

  it('a weather cause that aligned with the model points at the other causes instead', () => {
    const ds = { wxByDate: { '2026-03-10': { rain: 2.0, tmax: 70, wmax: 5 } } };
    // Same 'over' direction, but wAdj<0 so it does NOT match the mismatch condition.
    const r = baseR({ wAdj: -0.03, actual: 900, forecast: 1000 });
    const causes = diagnoseMiss('10422', ds, {}, r);
    const wx = causes.find(c => c.icon === '🌦');
    expect(wx.weight).toBe('CONTRIBUTING');
    expect(wx.remedy).toMatch(/other causes below/i);
  });

  it('an ops-drag day aligned with the miss gets a staffing-check remedy', () => {
    const r = baseR({ opsFactor: 0.9, actual: 850, forecast: 1000 }); // opsFactor<1, actual<forecast
    const causes = diagnoseMiss('10422', { loaded: false }, {}, r);
    const ops = causes.find(c => c.icon === '⚙️');
    expect(ops.remedy).toMatch(/scheduling against actual punches/i);
  });

  it('crew beating forecast despite ops headwinds gets a recognition remedy, not a fix-it one', () => {
    const r = baseR({ opsFactor: 0.9, actual: 1100, forecast: 1000 }); // opsFactor<1, actual>forecast
    const causes = diagnoseMiss('10422', { loaded: false }, {}, r);
    const ops = causes.find(c => c.icon === '⚙️');
    expect(ops.remedy).toMatch(/worth recognizing with the team/i);
  });

  it('trend divergence warns against over-correcting off one day', () => {
    const r = baseR({ t2: 0.1, t6: -0.02 });
    const causes = diagnoseMiss('10422', { loaded: false }, {}, r);
    const trend = causes.find(c => c.icon === '📈');
    expect(trend.remedy).toMatch(/don.t over-correct/i);
  });

  it('a new store with no LY data gets a "grade against district average" remedy', () => {
    const r = baseR({ noLYData: true });
    const causes = diagnoseMiss('10422', { loaded: false }, {}, r);
    const noLY = causes.find(c => c.icon === '📂');
    expect(noLY.remedy).toMatch(/district averages/i);
  });

  it('the unexplained fallback explicitly says no action is needed', () => {
    const r = baseR({ actual: 905, forecast: 900, varPct: 0.005, wAdj: 0, opsFactor: 1, t2: 0, t6: 0 });
    const causes = diagnoseMiss('10422', { loaded: false }, {}, r);
    expect(causes).toHaveLength(1);
    expect(causes[0].weight).toBe('UNKNOWN');
    expect(causes[0].remedy).toMatch(/no action needed/i);
  });

  it('a single matching peer store gets a remedy suggesting a two-way calendar tag, not a fix', () => {
    const missDate = new Date('2026-03-10T12:00:00');
    const peerDates = [1, 2, 3, 4, 5, 6].map(i => new Date(missDate.getTime() - i * 7 * 86400000));
    const ds = {
      loaded: true, storeIds: ['10422', '99999'],
      laborRows: [
        ...peerDates.map((d, i) => ({ loc: '10422', date: d, sales: 1000 })),
        // 99999's baseline varies (std>0) so its miss-date spike produces a real z-score, and
        // it shows the same under-forecast direction as the subject store on the miss date.
        ...peerDates.map((d, i) => ({ loc: '99999', date: d, sales: 950 + i * 10 })),
        { loc: '99999', date: missDate, sales: 1600 },
      ],
    };
    const r = baseR({ date: missDate, actual: 1000, forecast: 900 }); // missDir='under'
    const causes = diagnoseMiss('10422', ds, {}, r);
    const peer = causes.find(c => c.icon === '🏪' && c.weight === 'NOTE');
    expect(peer).toBeTruthy();
    expect(peer.remedy).toMatch(/both stores.? calendars/i);
  });
});
