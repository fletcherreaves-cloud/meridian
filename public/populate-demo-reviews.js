// Meridian Demo Reviews — 4 fictional characters across the full rating spectrum
// Console: fetch('/meridian/populate-demo-reviews.js').then(r=>r.text()).then(t=>eval(t))
// Or use the "Demo Reviews" button inside the Performance Reviews panel.

(function() {
  const KEY  = 'mf_perf_reviews_v1';
  const today = new Date().toISOString().slice(0,10);

  function rid(name) {
    return name.toLowerCase().replace(/[^a-z0-9]+/g,'_') + '_2026_H1';
  }

  function mos(fn) {
    const months = {};
    for (let m = 1; m <= 6; m++) months[m] = { year:2026, month:m, ...fn(m) };
    return { months };
  }

  // ── 1. Ronald McDonald ─────────────────────────────────────────────────────
  // GM · Store 3708 (Ardmore-Broadway, McDOK) · Exceeds Expectations (~94%)
  const ronaldId = rid('ronald mcdonald');
  const ronald = {
    id: ronaldId, name:'Ronald McDonald', role:'GM', loc:'3708',
    year:2026, half:'H1', status:'complete', createdAt:today, updatedAt:today,
    kpis: mos(m => ({
      oepe:126+(m%3), oepeTgt:140,
      osat:0.93, osatTgt:0.88,
      epb2b:0.04, epb2bTgt:0.08,
      r2p:83+(m%4), r2pTgt:95,
      kvs:40, kvsTgt:45,
      delivWait:212, delivWaitTgt:240,
      complaints:2, complaintsTgt:5,
      fsAudits:1.0, fsAuditsTgt:1.0,
      fsEcoSure:0.97, fsEcoSureTgt:0.90,
      fsTablet:0.99, fsTabletTgt:0.95,
      salesVsTgt:119800+(m*1200), salesVsTgtTgt:111513,
      digitalGC:1.09, digitalGCTgt:1.0,
      delivGC:1.11, delivGCTgt:1.0,
      foodOB:0.036, foodOBTgt:0.0385,
      labor:0.195, laborTgt:0.22,
      opSupplies:2720, opSuppliesTgt:2939,
      totalProfit:91000+(m*400), totalProfitTgt:84000,
      shiftCert:4, shiftCertTgt:4,
      shiftVerif:8, shiftVerifTgt:8,
      headcount:54, headcountTgt:50,
      turnover90:0.22, turnover90Tgt:0.40,
      retention:1.0, retentionTgt:1.0,
    })),
    behavioralRatings: {
      // GM: rgr×6, sales×4, profit×5, people×14, admin×6
      q1: {
        rgr:    [4,4,4,4,3,4],
        sales:  [4,3,4,4],
        profit: [4,4,4,4,4],
        people: [4,4,4,4,4,4,4,3,4,4,3,4,4,4],
        admin:  [4,4,3,4,4,4],
      },
      q2: {
        rgr:    [4,4,4,4,4,4],
        sales:  [4,4,4,4],
        profit: [4,4,4,4,4],
        people: [4,4,4,4,4,4,4,4,4,4,4,4,4,4],
        admin:  [4,4,4,4,4,4],
      },
    },
    comments: {
      q1:{rgr:'',sales:'',profit:'',people:'',admin:''},
      q2:{rgr:'',sales:'',profit:'',people:'',admin:''},
      q3:{rgr:'',sales:'',profit:'',people:'',admin:''},
      q4:{rgr:'',sales:'',profit:'',people:'',admin:''},
      midYear:{
        summary:'Ronald continues to set the standard for excellence in the district. Sales have been running 8–10% above plan every month through H1, with OEPE consistently 12–16 seconds under target. Guest satisfaction is best-in-district at 93% OSAT. Crew morale is high — reflected in our lowest turnover in the district at 22%. Shift management is tight; every opening procedure is executed without exception.',
        devPlan:'H2 focus: mentor the next high-potential swing manager for promotion. Ronald has identified two strong candidates. Also exploring capacity expansion to unlock additional upside — the store may be approaching its physical throughput ceiling on peak days.',
      },
      eoy:{ summary:'', achievements:'', nextYear:'' },
    },
    devPlan: [
      {id:'rd1', area:'GM Succession Pipeline',  action:'Identify and begin formal development track for one Swing Manager as a GM-in-training by September 1.', targetDate:'2026-09-01', status:'open'},
      {id:'rd2', area:'Capacity Planning',        action:'Complete a peak-hour throughput audit and present findings to OM with recommended facility improvements.', targetDate:'2026-08-15', status:'open'},
    ],
    wage:{current:null,recommended:null,approved:null,effectiveDate:'',notes:''},
  };

  // ── 2. Grimace ────────────────────────────────────────────────────────────
  // GM · Store 29760 (Duncan, McDOK) · Needs Improvement (~33%)
  const grimaceId = rid('grimace');
  const grimace = {
    id: grimaceId, name:'Grimace', role:'GM', loc:'29760',
    year:2026, half:'H1', status:'in-progress', createdAt:today, updatedAt:today,
    kpis: mos(m => ({
      oepe:220+(m%5), oepeTgt:180,
      osat:0.64, osatTgt:0.88,
      epb2b:0.17, epb2bTgt:0.08,
      r2p:145, r2pTgt:95,
      kvs:74, kvsTgt:60,
      delivWait:395, delivWaitTgt:240,
      complaints:19, complaintsTgt:5,
      fsAudits:0.60, fsAuditsTgt:1.0,
      fsEcoSure:0.71, fsEcoSureTgt:0.90,
      fsTablet:0.57, fsTabletTgt:0.95,
      salesVsTgt:148500-(m*200), salesVsTgtTgt:172873,
      digitalGC:0.78, digitalGCTgt:1.0,
      delivGC:0.80, delivGCTgt:1.0,
      foodOB:0.052, foodOBTgt:0.0385,
      labor:0.270, laborTgt:0.21,
      opSupplies:5300, opSuppliesTgt:3809,
      totalProfit:43000, totalProfitTgt:68000,
      shiftCert:1, shiftCertTgt:4,
      shiftVerif:2, shiftVerifTgt:8,
      headcount:31, headcountTgt:48,
      turnover90:0.84, turnover90Tgt:0.40,
      retention:0.20, retentionTgt:1.0,
    })),
    behavioralRatings: {
      // GM: rgr×6, sales×4, profit×5, people×14, admin×6
      q1: {
        rgr:    [1,1,2,1,2,1],
        sales:  [1,2,1,1],
        profit: [1,1,1,2,2],
        people: [1,1,1,2,1,1,1,1,2,1,1,1,1,1],
        admin:  [1,2,1,1,1,1],
      },
      q2: {
        rgr:    [1,1,1,1,2,1],
        sales:  [1,1,1,2],
        profit: [1,1,2,1,1],
        people: [1,1,2,1,1,1,1,1,1,2,1,1,1,1],
        admin:  [1,1,1,2,1,1],
      },
    },
    comments: {
      q1:{rgr:'',sales:'',profit:'',people:'',admin:''},
      q2:{rgr:'',sales:'',profit:'',people:'',admin:''},
      q3:{rgr:'',sales:'',profit:'',people:'',admin:''},
      q4:{rgr:'',sales:'',profit:'',people:'',admin:''},
      midYear:{
        summary:"Grimace's first half has been one of the most challenging in the district. Every major KPI is significantly below target — OEPE is running 40+ seconds over goal, sales are down 14% vs projection, and labor is nearly 6 percentage points above target. Guest satisfaction has deteriorated substantially (64% OSAT vs 88% standard). A formal performance improvement plan was initiated in March. The path forward requires urgent and fundamental changes to how the restaurant is managed day-to-day.",
        devPlan:'Active PIP in place through Q3. Weekly check-ins with supervisor required. Core focus areas: (1) shift management discipline — positioning, pre-shift planning, and accountability to standards; (2) labor scheduling accuracy — build to real needs, not comfort; (3) speed of service — restore the DT culture that was present under prior management.',
      },
      eoy:{ summary:'', achievements:'', nextYear:'' },
    },
    devPlan: [
      {id:'gr1', area:'OEPE / Speed of Service',  action:"Complete McDonald's Speed of Service e-learning and implement 4-week speed challenge with crew recognition for top performers.", targetDate:'2026-07-15', status:'in-progress'},
      {id:'gr2', area:'Labor Scheduling',          action:'Submit weekly schedule to supervisor for review every Thursday. No overtime approved without prior supervisor sign-off.', targetDate:'2026-06-30', status:'in-progress'},
      {id:'gr3', area:'Staffing & Headcount',      action:'Increase headcount from 31 to minimum 42 by attending 2 local job fairs and partnering with high school career programs.', targetDate:'2026-08-01', status:'open'},
      {id:'gr4', area:'Food Safety Compliance',    action:'Complete all overdue FSA documentation. Schedule EcoSure prep walk-through with supervisor before next scheduled visit.', targetDate:'2026-07-01', status:'in-progress'},
    ],
    wage:{current:null,recommended:null,approved:null,effectiveDate:'',notes:''},
  };

  // ── 3. Hamburglar ─────────────────────────────────────────────────────────
  // AM · Store 5985 (Durant, McDOK) · Meets Expectations (~73%)
  const hamburglarId = rid('hamburglar');
  const hamburglar = {
    id: hamburglarId, name:'Hamburglar', role:'AM', loc:'5985',
    year:2026, half:'H1', status:'submitted', createdAt:today, updatedAt:today,
    kpis: mos(m => ({
      oepe:116+(m%5), oepeTgt:115,
      osat:0.87, osatTgt:0.88,
      epb2b:0.085, epb2bTgt:0.08,
      r2p:88, r2pTgt:85,
      kvs:46, kvsTgt:45,
      delivWait:248, delivWaitTgt:240,
      complaints:6, complaintsTgt:5,
      fsAudits:0.95, fsAuditsTgt:1.0,
      fsEcoSure:0.91, fsEcoSureTgt:0.90,
      fsTablet:0.96, fsTabletTgt:0.95,
      salesVsTgt:224500+(m*400), salesVsTgtTgt:221409,
      digitalGC:1.03, digitalGCTgt:1.0,
      delivGC:0.97, delivGCTgt:1.0,
      foodOB:0.039, foodOBTgt:0.038,
      labor:0.200, laborTgt:0.195,
      opSupplies:4860, opSuppliesTgt:4802,
      totalProfit:102000, totalProfitTgt:98000,
      shiftCert:3, shiftCertTgt:3,
      shiftVerif:6, shiftVerifTgt:6,
      headcount:62, headcountTgt:60,
      turnover90:0.38, turnover90Tgt:0.35,
      retention:0.85, retentionTgt:1.0,
    })),
    behavioralRatings: {
      // AM: rgr×7, sales×3, profit×4, people×11, admin×7
      q1: {
        rgr:    [3,3,3,3,2,3,3],
        sales:  [3,3,3],
        profit: [3,3,2,3],
        people: [3,3,3,3,2,3,3,3,3,3,2],
        admin:  [3,3,3,3,3,3,3],
      },
      q2: {
        rgr:    [3,4,3,3,3,3,3],
        sales:  [3,3,4],
        profit: [3,3,3,3],
        people: [3,3,3,3,3,3,3,3,3,3,3],
        admin:  [3,3,4,3,3,3,3],
      },
    },
    comments: {
      q1:{rgr:'',sales:'',profit:'',people:'',admin:''},
      q2:{rgr:'',sales:'',profit:'',people:'',admin:''},
      q3:{rgr:'',sales:'',profit:'',people:'',admin:''},
      q4:{rgr:'',sales:'',profit:'',people:'',admin:''},
      midYear:{
        summary:"Hamburglar is a dependable and consistent contributor at one of the district's highest-volume restaurants. Performance across major categories is at or near standard — OEPE is tracking just slightly over target, and sales have closely tracked projection with minimal variance. The restaurant executes well operationally when Hamburglar is leading the shift. Turnover has ticked up slightly vs last year but remains manageable. The overall trajectory is solid.",
        devPlan:'Development focus for H2: take ownership of the weekly crew scheduling process to build management breadth. Currently strong on shift execution; growing into planning and anticipation is the priority. Hamburglar has expressed strong interest in GM advancement — stretch assignments being set up accordingly for the back half.',
      },
      eoy:{ summary:'', achievements:'', nextYear:'' },
    },
    devPlan: [
      {id:'hb1', area:'Scheduling / Planning',  action:'Own weekly scheduling process starting July. Submit to GM for review by Thursday each week. Track accuracy vs actual vs projection.', targetDate:'2026-07-07', status:'open'},
      {id:'hb2', area:'GM Advancement Track',   action:'Complete GM-in-Training curriculum modules through Q3. Monthly check-in with supervisor on progress.', targetDate:'2026-09-30', status:'open'},
      {id:'hb3', area:'Turnover Reduction',     action:'Implement an onboarding buddy program for every new crew hire. Track 30-day retention and report to GM monthly.', targetDate:'2026-09-30', status:'open'},
    ],
    wage:{current:null,recommended:null,approved:null,effectiveDate:'',notes:''},
  };

  // ── 4. Mayor McCheese ──────────────────────────────────────────────────────
  // AS · Store 6178 (Chipley FL — Emerald Arches) · Below Expectations (~52%)
  const mayorId = rid('mayor mccheese');
  const mayor = {
    id: mayorId, name:'Mayor McCheese', role:'AS', loc:'6178',
    year:2026, half:'H1', status:'submitted', createdAt:today, updatedAt:today,
    kpis: mos(m => ({
      oepe:194+(m%4), oepeTgt:190,
      osat:0.84, osatTgt:0.88,
      epb2b:0.10, epb2bTgt:0.08,
      r2p:93, r2pTgt:90,
      kvs:78, kvsTgt:75,
      delivWait:288, delivWaitTgt:240,
      complaints:9, complaintsTgt:5,
      fsAudits:0.80, fsAuditsTgt:1.0,
      fsEcoSure:0.85, fsEcoSureTgt:0.90,
      fsTablet:0.88, fsTabletTgt:0.95,
      salesVsTgt:392000+(m*500), salesVsTgtTgt:389465,
      digitalGC:1.01, digitalGCTgt:1.0,
      delivGC:0.94, delivGCTgt:1.0,
      foodOB:0.048, foodOBTgt:0.04,
      labor:0.252, laborTgt:0.23,
      opSupplies:3250, opSuppliesTgt:2750,
      totalProfit:77000, totalProfitTgt:92000,
      shiftCert:2, shiftCertTgt:4,
      shiftVerif:3, shiftVerifTgt:6,
      headcount:44, headcountTgt:50,
      turnover90:0.64, turnover90Tgt:0.35,
      retention:0.55, retentionTgt:1.0,
    })),
    behavioralRatings: {
      // AS: rgr×6, sales×5, profit×5, people×13, admin×6
      q1: {
        rgr:    [2,2,3,2,2,2],
        sales:  [3,2,2,3,2],
        profit: [2,2,2,2,3],
        people: [2,3,2,2,2,2,2,2,3,2,2,2,2],
        admin:  [2,2,3,2,2,2],
      },
      q2: {
        rgr:    [2,2,2,2,2,3],
        sales:  [2,3,2,2,3],
        profit: [2,2,2,3,2],
        people: [2,2,2,3,2,2,2,2,2,2,3,2,2],
        admin:  [2,2,2,2,3,2],
      },
    },
    comments: {
      q1:{rgr:'',sales:'',profit:'',people:'',admin:''},
      q2:{rgr:'',sales:'',profit:'',people:'',admin:''},
      q3:{rgr:'',sales:'',profit:'',people:'',admin:''},
      q4:{rgr:'',sales:'',profit:'',people:'',admin:''},
      midYear:{
        summary:"The Emerald Arches FL market has faced real headwinds in H1. Seasonal tourism fluctuations and persistent crew staffing challenges have been the defining issues across all Florida locations. Mayor McCheese has kept operations running, but profitability has slipped significantly — labor is running 2+ percentage points above target across the market, and FOB is elevated. Guest satisfaction is below standard at 84% OSAT. There are genuine bright spots: sales are tracking close to plan and food safety documentation has improved since Q1. The trajectory must accelerate in H2.",
        devPlan:'H2 priorities: (1) Stabilize and grow headcount in all FL locations — the staffing gap is the root cause of most cost pressure. (2) Implement food cost reduction discipline across the market via weekly cost review cadence. (3) Address guest satisfaction directly — facilitate listening survey action planning with each GM by August.',
      },
      eoy:{ summary:'', achievements:'', nextYear:'' },
    },
    devPlan: [
      {id:'mc1', area:'FL Staffing & Headcount',     action:'Launch coordinated recruiting initiative across all 7 FL stores. Set store-level headcount targets and report progress weekly.', targetDate:'2026-09-01', status:'in-progress'},
      {id:'mc2', area:'Labor & Food Cost Discipline', action:'Establish weekly cost review meeting cadence with each GM. Share best-practice scheduling from top-performing FL stores.', targetDate:'2026-07-15', status:'open'},
      {id:'mc3', area:'Guest Satisfaction (OSAT)',   action:'Pull SMG listening survey data for each FL location. Facilitate action-planning sessions with each GM team by August 15.', targetDate:'2026-08-15', status:'open'},
      {id:'mc4', area:'Shift Certification Bench',  action:'Map current swing management bench in each FL store. Create development plans for 2 additional Shift Cert candidates per store by Q3.', targetDate:'2026-09-30', status:'open'},
    ],
    wage:{current:null,recommended:null,approved:null,effectiveDate:'',notes:''},
  };

  // ── Merge & save ───────────────────────────────────────────────────────────
  const existing = JSON.parse(localStorage.getItem(KEY)||'{}');
  const demos = {
    [ronaldId]:    ronald,
    [grimaceId]:   grimace,
    [hamburglarId]:hamburglar,
    [mayorId]:     mayor,
  };
  localStorage.setItem(KEY, JSON.stringify({...existing, ...demos}));

  console.log('✅ Meridian Demo Reviews loaded (4 reviews):');
  console.log('  Ronald McDonald — GM / 3708 (Ardmore-Broadway, McDOK) — Exceeds Expectations ~94%');
  console.log('  Grimace         — GM / 29760 (Duncan, McDOK)          — Needs Improvement   ~33%');
  console.log('  Hamburglar      — AM / 5985 (Durant, McDOK)            — Meets Expectations  ~73%');
  console.log('  Mayor McCheese  — AS / 6178 (Chipley FL, Emerald Arches) — Below Expectations ~52%');
  console.log('Reload the Performance Reviews panel to see them.');
})();
