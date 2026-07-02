// @ts-nocheck
// ── Scheduling Opportunity — Slide Deck Generator ───────────────────────────
// Generates the 8-slide presentation HTML from live OpportunityReport analysis.
// Called from SchedulingPanel via the "Slide Deck" button.

export function generateSlideDeckHTML(analysis, distTot, weekInfo, scopeLabel) {
  const weekLabel    = weekInfo ? weekInfo.label : 'Selected Period';
  const storeCount   = analysis.length;
  const scopeDisplay = scopeLabel || 'All Stores';

  // ── Map live analysis → STORE_DATA shape ──────────────────────────────────
  const storeData = analysis.map(s => ({
    loc:          s.loc,
    name:         s.name,
    actPct:       +s.avgLaborPct.toFixed(2),
    schedPct:     +(s.avgLaborPct / (s.ta.attendRating || 1)).toFixed(1),
    tgtPct:       +(s.tgt  * 100).toFixed(2),
    bufPct:       +(s.buf  * 100).toFixed(2),
    oppCost:      Math.round(s.excessCost),
    missedShifts: s.ta.missedShifts || 0,
    attendRating: +((s.ta.attendRating || 0)).toFixed(3),
    empCount:     s.ta.empCount || 0,
  }));

  // ── Pre-compute dynamic slide-5 content ───────────────────────────────────
  const overTgt = [...storeData]
    .filter(d => d.actPct > d.tgtPct)
    .sort((a, b) => (b.actPct - b.tgtPct) - (a.actPct - a.tgtPct));
  const topMiss    = [...storeData].sort((a, b) => b.missedShifts - a.missedShifts);
  const totalMissed = storeData.reduce((s, d) => s + d.missedShifts, 0);
  const avgMissed   = Math.round(totalMissed / (storeData.length || 1) / 4); // ÷4: T&A period ≈ 4 weeks

  // Slide-5 over-target store rows
  const overTgtRows = overTgt.slice(0, 4).map(d => {
    const gap = d.actPct - d.tgtPct;
    const col = gap > 1 ? '#d94f4f' : '#e8a040';
    return '<div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid #f0ece6">'
      + '<span style="color:#4a5a6a;font-weight:600">' + d.name + '</span>'
      + '<span style="color:' + col + ';font-weight:700">+' + gap.toFixed(1) + '% over target</span>'
      + '</div>';
  }).join('');

  // Slide-5 attendance-erosion rows
  const attendRows = topMiss.slice(0, 4).map(d => {
    const vstatus = d.actPct > d.tgtPct ? 'over target' : 'at target';
    const wkMiss = Math.round(d.missedShifts / 4);
    const col = wkMiss > 37 ? '#d94f4f' : '#e8a040';
    return '<div style="display:flex;justify-content:space-between;font-size:12px;padding:6px 0;border-bottom:1px solid #f0ece6">'
      + '<span style="color:#4a5a6a;font-weight:600">' + d.name + '</span>'
      + '<span><span style="color:' + col + ';font-weight:700">' + wkMiss + ' missed</span>'
      + ' <span style="color:#9aabb8;font-size:11px">· ' + vstatus + '</span></span>'
      + '</div>';
  }).join('');

  const storeDataJson = JSON.stringify(storeData);

  // ── District-level hour totals for Start-to-Finish flow tile ──────────────
  const fmtHrs = n => Math.round(n || 0).toLocaleString('en-US');
  const distNeedHrs     = fmtHrs(distTot ? distTot.needHrs    : 0);
  const distSchedHrs    = fmtHrs(distTot ? distTot.schedHrs   : 0);
  const distCrewHrs     = fmtHrs(distTot ? distTot.crewHrs    : 0);
  const distControlled  = fmtHrs(distTot ? distTot.controlled : 0);
  const rawSvN = distTot ? Math.round((distTot.schedHrs||0) - (distTot.needHrs||0)) : 0;
  const distSchedVsNeed = (rawSvN >= 0 ? '+' : '') + rawSvN.toLocaleString('en-US');

  // ── Full HTML ──────────────────────────────────────────────────────────────
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>The Scheduling Opportunity — ${scopeDisplay}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
html,body{height:100%;background:#1a2030;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:hidden}
.deck{width:100vw;height:100vh;position:relative;overflow:hidden;background:#111823}
.slide-outer{width:1440px;height:810px;transform-origin:top left;position:absolute;overflow:hidden}
.slide{position:absolute;inset:0;background:#f7f4ef;display:none;flex-direction:column}
.slide.active{display:flex}
.nav-btn{position:fixed;top:50%;transform:translateY(-50%);z-index:200;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);color:#fff;font-size:18px;width:44px;height:44px;border-radius:50%;cursor:pointer;display:flex;align-items:center;justify-content:center;transition:.2s}
.nav-btn:hover{background:rgba(196,120,41,.5)}
.nav-btn.prev{left:12px}.nav-btn.next{right:12px}
.progress{position:fixed;bottom:18px;left:50%;transform:translateX(-50%);display:flex;gap:8px;z-index:200}
.pip{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.25);cursor:pointer;transition:.2s}
.pip.on{background:#c4782a;transform:scale(1.3)}
.slide-counter{position:fixed;top:16px;right:20px;font-size:11px;color:rgba(255,255,255,.4);letter-spacing:.08em;font-weight:500;z-index:200}
.eyebrow{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#c4782a;font-weight:600;margin-bottom:16px}
.slide-title{font-size:48px;font-weight:800;color:#1b2a3a;line-height:1.05;letter-spacing:-.02em}
.slide-title .accent{color:#c4782a}
.slide-sub{font-size:17px;color:#6b7d90;line-height:1.5;margin-top:10px}
.section-label{font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#9aabb8;font-weight:600;margin-bottom:8px}
.pad{padding:52px 64px}
.pad-sm{padding:36px 64px}
.footer{position:absolute;bottom:0;left:0;right:0;padding:12px 64px;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #e5ddd0;background:#f7f4ef}
.footer-l{font-size:10px;color:#9aabb8;letter-spacing:.06em}
.footer-r{font-size:10px;color:#c4782a;font-weight:600;letter-spacing:.06em}
.navy-block{background:#1e2d3e;border-radius:16px;color:#fff;overflow:hidden}
.navy-header{background:#17232f;padding:16px 28px;font-size:11px;letter-spacing:.16em;text-transform:uppercase;font-weight:700;color:#9aabb8;border-bottom:1px solid rgba(255,255,255,.06)}
.navy-row{padding:16px 28px;border-bottom:1px solid rgba(255,255,255,.06);display:flex;align-items:center;justify-content:space-between;gap:16px}
.navy-row:last-child{border-bottom:none}
.navy-row-title{font-size:15px;font-weight:700;color:#fff;margin-bottom:3px}
.navy-row-sub{font-size:12px;color:#6b8499;line-height:1.4}
.pill{display:inline-flex;align-items:center;border:1.5px solid #c4782a;border-radius:30px;padding:5px 16px;font-size:12px;font-weight:700;color:#c4782a;background:rgba(196,120,41,.08);white-space:nowrap;flex-shrink:0}
.pill-sub{font-size:9px;color:#c4782a;text-align:center;margin-top:3px;letter-spacing:.03em;opacity:.8}
.kpi-row{display:flex;gap:20px;margin-top:32px}
.kpi{flex:1;background:#fff;border:1px solid #e5ddd0;border-radius:14px;padding:24px 22px;text-align:center}
.kpi.accent{border-color:#c4782a;border-width:2px}
.kpi-label{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#9aabb8;font-weight:600;margin-bottom:8px}
.kpi-num{font-size:40px;font-weight:800;color:#1b2a3a;letter-spacing:-.03em;line-height:1}
.kpi-num.orange{color:#c4782a}
.kpi-num.red{color:#d94f4f}
.kpi-num.green{color:#28a870}
.kpi-sub{font-size:12px;color:#9aabb8;margin-top:6px;line-height:1.4}
.bar-section{flex:1;overflow:hidden;display:flex;flex-direction:column}
.bar-legend{display:flex;gap:20px;align-items:center;margin-bottom:14px;flex-shrink:0}
.bar-legend-item{display:flex;align-items:center;gap:6px;font-size:10px;color:#6b7d90;font-weight:600}
.legend-swatch{width:12px;height:12px;border-radius:3px;flex-shrink:0}
.bar-rows{flex:1;overflow:hidden;display:flex;flex-direction:column;gap:4px}
.dual-grid{display:grid;grid-template-columns:1fr 1fr;gap:24px;margin-top:28px}
.dual-card{background:#fff;border:1px solid #e5ddd0;border-radius:14px;padding:28px}
.dual-icon{font-size:36px;margin-bottom:14px}
.dual-title{font-size:18px;font-weight:800;color:#1b2a3a;margin-bottom:8px}
.dual-body{font-size:13px;color:#6b7d90;line-height:1.6}
.dual-stat{font-size:28px;font-weight:800;margin:12px 0 4px;letter-spacing:-.02em}
.dual-stat-label{font-size:11px;color:#9aabb8;text-transform:uppercase;letter-spacing:.08em}
.step-list{display:flex;flex-direction:column;gap:20px;margin-top:20px}
.step-item{display:flex;align-items:flex-start;gap:16px}
.step-num{width:36px;height:36px;border-radius:50%;background:#1e2d3e;color:#fff;font-size:15px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px}
.step-title{font-size:17px;font-weight:700;color:#1b2a3a;margin-bottom:4px}
.step-sub{font-size:13px;color:#6b7d90;line-height:1.5}
.s1-bg{background:#1e2d3e;flex:1;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;padding:64px}
.s1-chips{display:flex;gap:12px;flex-wrap:wrap;margin-top:32px}
.s1-chip{padding:7px 18px;border-radius:30px;border:1px solid rgba(196,120,41,.35);color:#9aabb8;font-size:12px;font-weight:500}
.s1-eyebrow{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:#c4782a;font-weight:600;margin-bottom:20px}
.s1-title{font-size:64px;font-weight:900;color:#fff;line-height:1.0;letter-spacing:-.03em;margin-bottom:16px}
.s1-title .acc{color:#c4782a}
.s1-sub{font-size:18px;color:#6b8499;line-height:1.5;max-width:560px}
.s1-stripe{width:60px;height:4px;background:#c4782a;border-radius:2px;margin-bottom:28px}
</style>
</head>
<body>
<div class="deck">
<div class="slide-outer" id="slideOuter">

<!-- SLIDE 1 — COVER -->
<div class="slide active" id="s1">
  <div class="s1-bg" style="flex:1">
    <div class="s1-eyebrow">Labor Intelligence Review · ${weekLabel.replace(/–.*/, '').trim().replace(/[A-Za-z]+ (\d+)/,'$1')} 2026</div>
    <div class="s1-stripe"></div>
    <div class="s1-title">The Scheduling<br><span class="acc">Opportunity</span></div>
    <div class="s1-sub">What our schedules are actually costing — and how attendance is shaping the real picture.</div>
    <div class="s1-chips">
      <span class="s1-chip">${storeCount} Locations</span>
      <span class="s1-chip">${scopeDisplay}</span>
      <span class="s1-chip">Week of ${weekLabel}</span>
      <span class="s1-chip">T&amp;A: Current Period</span>
    </div>
  </div>
  <div style="background:#f7f4ef;padding:14px 64px;display:flex;justify-content:space-between">
    <div style="font-size:10px;color:#9aabb8;letter-spacing:.06em">OWNERS MEETING · CONFIDENTIAL</div>
    <div style="font-size:10px;color:#c4782a;font-weight:700;letter-spacing:.06em">MERIDIAN INTELLIGENCE PLATFORM</div>
  </div>
</div>

<!-- SLIDE 2 — THE NUMBERS AT A GLANCE -->
<div class="slide" id="s2">
  <div class="pad" style="flex:1;display:flex;flex-direction:column">
    <div class="eyebrow">District Overview</div>
    <div class="slide-title">The Numbers<br>at a <span class="accent">Glance</span></div>
    <div class="kpi-row" style="margin-top:28px">
      <div class="kpi">
        <div class="kpi-label">Stores Over Labor Target</div>
        <div class="kpi-num orange" id="kpiOverBuf">—</div>
        <div class="kpi-sub" id="kpiOverBufSub">of ${storeCount} locations<br>above actual labor target</div>
      </div>
      <div class="kpi accent">
        <div class="kpi-label">Weekly Opportunity Cost</div>
        <div class="kpi-num red" id="kpiWeekly">—</div>
        <div class="kpi-sub" id="kpiWeeklySub">excess labor cost, stores<br>over actual labor target</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Missed Shifts · This Week</div>
        <div class="kpi-num red" id="kpiMissed">—</div>
        <div class="kpi-sub" id="kpiMissedSub">across ${storeCount} locations<br>this week</div>
      </div>
      <div class="kpi">
        <div class="kpi-label">Avg Labor %</div>
        <div class="kpi-num" id="kpiAvgLabor">—</div>
        <div class="kpi-sub" id="kpiAvgLaborSub">vs. weighted target</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;margin-top:20px">
      <!-- Schedule flow: Start to Finish -->
      <div style="background:#fff;border:1px solid #e5ddd0;border-radius:12px;padding:16px 20px;grid-column:1/3">
        <div class="section-label">Schedule — Start to Finish</div>
        <div style="display:flex;align-items:stretch;gap:0;margin-top:10px">
          <div style="flex:1;background:#eef2ff;border-radius:10px;padding:12px 14px">
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#4472ca;font-weight:700;margin-bottom:6px">① LifeLenz Forecast</div>
            <div style="font-size:24px;font-weight:800;color:#1b2a3a;letter-spacing:-.02em">${distNeedHrs}</div>
            <div style="font-size:10px;color:#6b7d90;margin-top:4px;line-height:1.4">hours projected<br>needed</div>
          </div>
          <div style="display:flex;align-items:center;padding:0 8px;color:#c8c0b8;font-size:18px;flex-shrink:0">→</div>
          <div style="flex:1;background:#fef3e2;border-radius:10px;padding:12px 14px">
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#e8a040;font-weight:700;margin-bottom:6px">② Scheduled</div>
            <div style="font-size:24px;font-weight:800;color:#1b2a3a;letter-spacing:-.02em">${distSchedHrs}</div>
            <div style="font-size:10px;color:#e8a040;margin-top:4px;font-weight:600">${distSchedVsNeed} vs forecast</div>
          </div>
          <div style="display:flex;align-items:center;padding:0 8px;color:#c8c0b8;font-size:18px;flex-shrink:0">→</div>
          <div style="flex:1;background:#e8f8f0;border-radius:10px;padding:12px 14px">
            <div style="font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#28a870;font-weight:700;margin-bottom:6px">③ Actually Worked</div>
            <div style="font-size:24px;font-weight:800;color:#1b2a3a;letter-spacing:-.02em">${distCrewHrs}</div>
            <div style="font-size:10px;color:#28a870;margin-top:4px;font-weight:600">−${distControlled} controlled back</div>
          </div>
        </div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-top:12px">
      <div style="background:#fff;border:1px solid #e5ddd0;border-radius:12px;padding:12px 16px">
        <div class="section-label">Highest Missed Shifts</div>
        <div id="topMissedList" style="display:flex;flex-direction:column;gap:4px;margin-top:6px"></div>
      </div>
      <div style="background:#fff;border:1px solid #e5ddd0;border-radius:12px;padding:12px 16px">
        <div class="section-label">Best Attendance</div>
        <div id="bestAttendList" style="display:flex;flex-direction:column;gap:4px;margin-top:6px"></div>
      </div>
    </div>
  </div>
  <div class="footer"><span class="footer-l">OWNERS MEETING · CONFIDENTIAL</span><span class="footer-r">MERIDIAN INTELLIGENCE PLATFORM</span></div>
</div>

<!-- SLIDE 3 — ACTUAL VS TARGET -->
<div class="slide" id="s3">
  <div class="pad-sm" style="flex:1;display:flex;flex-direction:column;padding-bottom:24px">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px;flex-shrink:0">
      <div>
        <div class="eyebrow">Scheduling Accuracy · ${weekLabel}</div>
        <div class="slide-title" style="font-size:36px">Actual Labor % vs <span class="accent">Target</span></div>
      </div>
      <div class="bar-legend">
        <div class="bar-legend-item"><div class="legend-swatch" style="background:#1e2d3e"></div>Target</div>
        <div class="bar-legend-item"><div class="legend-swatch" style="background:rgba(196,120,41,.45);border:1.5px dashed #c4782a"></div>+2% Zone</div>
        <div class="bar-legend-item"><div class="legend-swatch" style="background:#d94f4f"></div>Over Target</div>
        <div class="bar-legend-item"><div class="legend-swatch" style="background:#e8a040"></div>Near Target</div>
        <div class="bar-legend-item"><div class="legend-swatch" style="background:#28a870"></div>At / Below Target</div>
        <div class="bar-legend-item"><div style="width:12px;height:12px;border-left:2px solid #4472ca;flex-shrink:0"></div>GM Scheduled</div>
      </div>
    </div>
    <div class="bar-section" id="barSection3"></div>
  </div>
  <div class="footer"><span class="footer-l">OWNERS MEETING · CONFIDENTIAL</span><span class="footer-r">MERIDIAN INTELLIGENCE PLATFORM</span></div>
</div>

<!-- SLIDE 4 — MISSED SHIFTS -->
<div class="slide" id="s4">
  <div class="pad-sm" style="flex:1;display:flex;flex-direction:column;padding-bottom:24px">
    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:16px;flex-shrink:0">
      <div>
        <div class="eyebrow">Time &amp; Attendance · Current Period</div>
        <div class="slide-title" style="font-size:36px">Missed Shifts by <span class="accent">Location</span></div>
      </div>
      <div style="text-align:right">
        <div id="slideTotalMissed" style="font-size:32px;font-weight:800;color:#d94f4f;letter-spacing:-.02em">—</div>
        <div style="font-size:11px;color:#9aabb8;margin-top:2px">est. missed shifts this week · district</div>
      </div>
    </div>
    <div style="flex:1;overflow:hidden;display:flex;flex-direction:column;gap:3px" id="msSection"></div>
  </div>
  <div class="footer"><span class="footer-l">OWNERS MEETING · CONFIDENTIAL</span><span class="footer-r">MERIDIAN INTELLIGENCE PLATFORM</span></div>
</div>

<!-- SLIDE 5 — THE DUAL PROBLEM -->
<div class="slide" id="s5">
  <div class="pad" style="flex:1;display:flex;flex-direction:column">
    <div class="eyebrow">Root Cause Analysis</div>
    <div class="slide-title">Two Problems,<br>One <span class="accent">Compounding</span> Effect</div>
    <div class="dual-grid" style="margin-top:24px">
      <div class="dual-card" style="border-top:4px solid #d94f4f">
        <div class="dual-icon">📋</div>
        <div class="dual-title">Over-Scheduling</div>
        <div class="dual-body">${overTgt.length} location${overTgt.length !== 1 ? 's are' : ' is'} scheduling at labor percentages that exceed their actual labor target. This inflates labor cost regardless of how many employees actually show up.</div>
        <div class="dual-stat" style="color:#d94f4f" id="s5OverTgtStat">${overTgt.length} store${overTgt.length !== 1 ? 's' : ''}</div>
        <div class="dual-stat-label">over their labor target</div>
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:6px">${overTgtRows || '<div style="font-size:12px;color:#9aabb8;padding:8px 0">No stores over target this week</div>'}</div>
      </div>
      <div class="dual-card" style="border-top:4px solid #e8a040">
        <div class="dual-icon">🚪</div>
        <div class="dual-title">Attendance Erosion</div>
        <div class="dual-body">Even stores running at target labor % are experiencing significant missed shifts. Employees not showing up means the schedule doesn't reflect operational reality — creating service gaps and reliance on overtime.</div>
        <div class="dual-stat" style="color:#e8a040">${avgMissed} avg</div>
        <div class="dual-stat-label">est. missed shifts per store · this week</div>
        <div style="margin-top:16px;display:flex;flex-direction:column;gap:6px">${attendRows}</div>
      </div>
    </div>
    <div style="margin-top:20px;padding:16px 24px;background:rgba(196,120,41,.08);border:1.5px solid rgba(196,120,41,.3);border-radius:12px">
      <strong style="color:#c4782a">Key Insight:</strong>
      <span style="font-size:13px;color:#4a5a6a;margin-left:8px">Over-scheduling masks the attendance problem. When we schedule right AND improve attendance reliability, we get both cost control and better service coverage.</span>
    </div>
  </div>
  <div class="footer"><span class="footer-l">OWNERS MEETING · CONFIDENTIAL</span><span class="footer-r">MERIDIAN INTELLIGENCE PLATFORM</span></div>
</div>

<!-- SLIDE 6 — FINANCIAL IMPACT -->
<div class="slide" id="s6">
  <div class="pad" style="flex:1;display:flex;flex-direction:column">
    <div class="eyebrow">Financial Impact · Week of ${weekLabel}</div>
    <div class="slide-title">The Cost of<br><span class="accent">Not Scheduling Right</span></div>
    <div style="display:flex;gap:32px;margin-top:32px;flex:1;min-height:0;align-items:stretch">
      <div style="flex:1;background:#fff;border:2px solid #d94f4f;border-radius:16px;padding:48px 40px;text-align:center">
        <div class="kpi-label">Weekly Excess Labor Cost</div>
        <div id="slide6Weekly" style="font-size:64px;font-weight:900;color:#d94f4f;letter-spacing:-.04em;margin:16px 0 8px">—</div>
        <div style="font-size:13px;color:#9aabb8">vs. actual labor target</div>
      </div>
      <div style="flex:1;background:#fff;border:1px solid #e5ddd0;border-radius:16px;padding:48px 40px;text-align:center">
        <div class="kpi-label">Annualized Opportunity</div>
        <div id="slide6Annual" style="font-size:52px;font-weight:900;color:#1b2a3a;letter-spacing:-.03em;margin:16px 0 8px">—</div>
        <div style="font-size:13px;color:#9aabb8">if current patterns hold<br>across all ${storeCount} locations</div>
      </div>
    </div>
  </div>
  <div class="footer"><span class="footer-l">OWNERS MEETING · CONFIDENTIAL</span><span class="footer-r">MERIDIAN INTELLIGENCE PLATFORM</span></div>
</div>


</div><!-- /slide-outer -->
</div><!-- /deck -->

<button class="nav-btn prev" id="prevBtn">←</button>
<button class="nav-btn next" id="nextBtn">→</button>
<div class="progress" id="progress"></div>
<div class="slide-counter" id="counter"></div>

<script>
// STORE_DATA — built from live Meridian analysis · ${weekLabel}
const STORE_DATA = ${storeDataJson};

const sorted       = [...STORE_DATA].sort((a,b) => (b.actPct - b.tgtPct) - (a.actPct - a.tgtPct));
const sortedByMiss = [...STORE_DATA].sort((a,b) => b.missedShifts - a.missedShifts);
const sortedByOpp  = [...STORE_DATA].sort((a,b) => b.oppCost - a.oppCost);

function buildBarChart(containerId, data, maxPct) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  const hdr = document.createElement('div');
  hdr.style.cssText = 'display:flex;align-items:center;gap:10px;margin-bottom:6px;flex-shrink:0';
  hdr.innerHTML = '<div style="width:156px;flex-shrink:0"></div>'
    + '<div style="flex:1;font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#9aabb8;font-weight:600">Actual Labor %</div>'
    + '<div style="width:44px;font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#9aabb8;font-weight:600;text-align:left;flex-shrink:0">Actual</div>'
    + '<div style="width:60px;font-size:9px;text-transform:uppercase;letter-spacing:.1em;color:#9aabb8;font-weight:600;text-align:right;flex-shrink:0">vs Target</div>';
  el.appendChild(hdr);
  data.forEach(d => {
    const tgtGap = d.actPct - d.tgtPct;
    const color  = tgtGap > 1.0 ? '#d94f4f' : tgtGap > 0 ? '#e8a040' : '#28a870';
    const row   = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;min-height:24px';
    const name = document.createElement('div');
    name.textContent  = d.name;
    name.style.cssText = 'width:156px;text-align:right;font-size:10px;color:#4a5a6a;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500';
    const trackWrap = document.createElement('div');
    trackWrap.style.cssText = 'flex:1;position:relative;height:18px';
    const track = document.createElement('div');
    track.style.cssText = 'height:100%;background:#ede8e1;border-radius:4px;position:absolute;inset:0;overflow:visible';
    const tgtLeft  = (d.tgtPct / maxPct) * 100;
    const bufRight = (d.bufPct / maxPct) * 100;
    const bufZone  = document.createElement('div');
    bufZone.style.cssText = 'position:absolute;top:0;height:100%;left:' + tgtLeft + '%;width:' + (bufRight - tgtLeft) + '%;background:rgba(196,120,41,.2);border-right:3px solid rgba(196,120,41,1);pointer-events:none;z-index:2';
    const fill = document.createElement('div');
    fill.style.cssText = 'height:100%;width:' + Math.min((d.actPct/maxPct)*100,100) + '%;background:' + color + ';border-radius:4px;position:absolute;left:0;top:0;opacity:.85;z-index:1';
    const schedLine = document.createElement('div');
    schedLine.style.cssText = 'position:absolute;top:-2px;bottom:-2px;left:' + Math.min((d.schedPct/maxPct)*100,100) + '%;width:2px;background:#4472ca;border-radius:1px;opacity:.85;z-index:3';
    const tgtLine = document.createElement('div');
    tgtLine.style.cssText = 'position:absolute;top:-3px;bottom:-3px;left:' + tgtLeft + '%;width:2px;background:#1e2d3e;border-radius:1px;z-index:3';
    track.appendChild(fill); track.appendChild(bufZone); track.appendChild(schedLine); track.appendChild(tgtLine);
    trackWrap.appendChild(track);
    const val = document.createElement('div');
    val.style.cssText = 'width:44px;font-size:10px;font-weight:700;color:' + color + ';text-align:left;flex-shrink:0';
    val.textContent = d.actPct.toFixed(1) + '%';
    const gapBadge = document.createElement('div');
    const gapStr = (tgtGap > 0 ? '+' : '') + tgtGap.toFixed(1) + '%';
    gapBadge.style.cssText = 'width:60px;font-size:9.5px;font-weight:700;text-align:right;flex-shrink:0;color:' + (tgtGap > 0 ? color : '#28a870');
    gapBadge.textContent = gapStr;
    row.appendChild(name); row.appendChild(trackWrap); row.appendChild(val); row.appendChild(gapBadge);
    el.appendChild(row);
  });
}

function buildMissedChart(containerId, data) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  const maxMs = Math.max(...data.map(d => d.missedShifts));
  data.forEach(d => {
    const pct   = (d.missedShifts / maxMs) * 100;
    const color = d.missedShifts > 150 ? '#d94f4f' : d.missedShifts > 90 ? '#e8a040' : '#28a870';
    const row   = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;min-height:24px';
    const name = document.createElement('div');
    name.style.cssText = 'width:156px;text-align:right;font-size:10px;color:#4a5a6a;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500';
    name.textContent = d.name;
    const track = document.createElement('div');
    track.style.cssText = 'flex:1;height:16px;background:#ede8e1;border-radius:3px;position:relative;overflow:hidden';
    const fill = document.createElement('div');
    fill.style.cssText = 'height:100%;width:' + pct + '%;background:' + color + ';border-radius:3px;opacity:.8';
    track.appendChild(fill);
    const count = document.createElement('div');
    count.style.cssText = 'width:40px;font-size:10px;font-weight:700;color:' + color + ';text-align:left;flex-shrink:0';
    count.textContent = d.missedShifts;
    const rate = document.createElement('div');
    rate.style.cssText = 'width:46px;font-size:9.5px;color:#9aabb8;text-align:right;flex-shrink:0';
    rate.textContent = (d.attendRating * 100).toFixed(0) + '% att';
    row.appendChild(name); row.appendChild(track); row.appendChild(count); row.appendChild(rate);
    el.appendChild(row);
  });
}

function buildOppChart(containerId, data) {
  const el = document.getElementById(containerId);
  if (!el) return;
  el.innerHTML = '';
  const maxAbs = Math.max(...data.map(d => Math.abs(d.oppCost)));
  data.forEach(d => {
    const isPos  = d.oppCost >= 0;
    const pct    = (Math.abs(d.oppCost) / maxAbs) * 100;
    const color  = isPos ? (d.oppCost > 3000 ? '#d94f4f' : '#e8a040') : '#28a870';
    const row    = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:10px;min-height:22px';
    const name = document.createElement('div');
    name.style.cssText = 'width:156px;text-align:right;font-size:10px;color:#4a5a6a;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:500';
    name.textContent = d.name;
    const trackWrap = document.createElement('div');
    trackWrap.style.cssText = 'flex:1;height:14px;background:#ede8e1;border-radius:3px;position:relative;overflow:hidden';
    const fill = document.createElement('div');
    fill.style.cssText = (isPos
      ? 'height:100%;width:' + pct + '%;background:' + color + ';border-radius:3px;opacity:.8;position:absolute;left:0'
      : 'height:100%;width:' + pct + '%;background:' + color + ';border-radius:3px;opacity:.7;position:absolute;left:0');
    trackWrap.appendChild(fill);
    const val = document.createElement('div');
    val.style.cssText = 'width:60px;font-size:10px;font-weight:700;color:' + color + ';text-align:left;flex-shrink:0';
    val.textContent = (isPos ? '+$' : '-$') + Math.abs(d.oppCost).toLocaleString();
    row.appendChild(name); row.appendChild(trackWrap); row.appendChild(val);
    el.appendChild(row);
  });
}

function buildStats() {
  const overTgt      = STORE_DATA.filter(d => d.actPct > d.tgtPct);
  const atTgt        = STORE_DATA.filter(d => d.actPct <= d.tgtPct);
  const totalMissed  = STORE_DATA.reduce((s,d) => s + d.missedShifts, 0);
  const weeklyExcess = STORE_DATA.filter(d => d.oppCost > 0).reduce((s,d) => s + d.oppCost, 0);
  const annualExcess = weeklyExcess * 52;
  const totalEmp = STORE_DATA.reduce((s,d) => s + d.empCount, 0);
  const avgAct   = STORE_DATA.reduce((s,d) => s + d.actPct * d.empCount, 0) / (totalEmp || 1);
  const avgTgt   = STORE_DATA.reduce((s,d) => s + d.tgtPct * d.empCount, 0) / (totalEmp || 1);
  const gapPp    = avgAct - avgTgt;
  const fmt$ = n => '$' + Math.round(Math.abs(n)).toLocaleString('en-US');
  const set  = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('kpiOverBuf',    overTgt.length);
  set('kpiWeekly',     fmt$(weeklyExcess));
  set('kpiMissed',     Math.round(totalMissed / 4).toLocaleString());
  set('kpiAvgLabor',   avgAct.toFixed(1) + '%');
  set('kpiAvgLaborSub', avgAct.toFixed(1) + '% actual vs. ' + avgTgt.toFixed(1) + '% target (+' + gapPp.toFixed(1) + 'pp)');
  set('slide6Weekly',  fmt$(weeklyExcess) + ' / wk');
  set('slide6Annual',  fmt$(annualExcess) + ' / yr projected');
  set('slideTotalMissed', Math.round(totalMissed / 4).toLocaleString());
  const topMiss = [...STORE_DATA].sort((a,b) => b.missedShifts - a.missedShifts).slice(0,3);
  const missEl  = document.getElementById('topMissedList');
  if (missEl) missEl.innerHTML = topMiss.map(d =>
    '<div style="display:flex;justify-content:space-between;font-size:11px;padding:5px 0;border-bottom:1px solid #ede8e1"><span style="color:#4a5a6a;font-weight:500">' + d.name + '</span><span style="color:#d94f4f;font-weight:700">' + Math.round(d.missedShifts / 4) + ' shifts</span></div>'
  ).join('');
  const bestAtt = [...STORE_DATA].sort((a,b) => b.attendRating - a.attendRating).slice(0,3);
  const attEl   = document.getElementById('bestAttendList');
  if (attEl) attEl.innerHTML = bestAtt.map(d =>
    '<div style="display:flex;justify-content:space-between;font-size:11px;padding:5px 0;border-bottom:1px solid #ede8e1"><span style="color:#4a5a6a;font-weight:500">' + d.name + '</span><span style="color:#28a870;font-weight:700">' + (d.attendRating*100).toFixed(1) + '%</span></div>'
  ).join('');
}

buildStats();
buildBarChart('barSection3', sorted, 32);
buildMissedChart('msSection', sortedByMiss);
buildOppChart('oppSection', sortedByOpp);

const slides = document.querySelectorAll('.slide');
const n = slides.length;
let cur = 0;
function goto(i) {
  slides[cur].classList.remove('active');
  cur = (i + n) % n;
  slides[cur].classList.add('active');
  document.querySelectorAll('.pip').forEach((p,j) => p.classList.toggle('on', j === cur));
  document.getElementById('counter').textContent = (cur+1) + ' / ' + n;
}
const prog = document.getElementById('progress');
for (let i = 0; i < n; i++) {
  const p = document.createElement('div');
  p.className = 'pip' + (i === 0 ? ' on' : '');
  p.addEventListener('click', () => goto(i));
  prog.appendChild(p);
}
document.getElementById('counter').textContent = '1 / ' + n;
document.getElementById('prevBtn').addEventListener('click', () => goto(cur-1));
document.getElementById('nextBtn').addEventListener('click', () => goto(cur+1));
document.addEventListener('keydown', e => {
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') goto(cur+1);
  if (e.key === 'ArrowLeft'  || e.key === 'ArrowUp')   goto(cur-1);
});
function scale() {
  const so = document.getElementById('slideOuter');
  const W = window.innerWidth, H = window.innerHeight;
  const s = Math.min(W/1440, H/810);
  so.style.transform = 'scale(' + s + ')';
  so.style.top  = ((H - 810*s)/2) + 'px';
  so.style.left = ((W - 1440*s)/2) + 'px';
}
scale();
window.addEventListener('resize', scale);
</script>
</body>
</html>`;
}
