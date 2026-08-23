import { matchedLift } from '/home/user/meridian/src/engine/promo-roi.js';
let seed = 7; const rnd = () => (seed = (seed*1103515245+12345) % 2147483648) / 2147483648;

const DOW_BASE=[4000,5200,5000,5100,5600,7000,6500];
const TRUE_LIFT = 0.10;          // promo days genuinely sell 10% more
const HEAVY_SPEND = 400, LIGHT_SPEND = 100;

function mkRows(loc,n){
  const rows=[]; const start=new Date('2026-04-01T00:00:00');
  for(let i=0;i<n;i++){
    const d=new Date(start.getTime()+i*86400000), dow=d.getDay();
    const isPromo = rnd() < 0.5;                       // promo assigned INDEPENDENTLY of sales
    const spend = isPromo ? HEAVY_SPEND : LIGHT_SPEND;
    const sales = DOW_BASE[dow]*(0.75+0.5*rnd())*(isPromo ? 1+TRUE_LIFT : 1);
    rows.push({loc,date:d.toISOString().slice(0,10),dow,sales,gc:Math.round(sales/9),
               promoAmt:spend, promoPct:(spend/sales)*100});
  }
  return rows;
}
const recs=[]; for(let s=0;s<27;s++) recs.push(...mkRows(String(3000+s).padStart(7,'0'),120));

for (const field of ['promoPct','promoAmt']) {
  const out = matchedLift(recs,{intensityField:field,spendField:'promoAmt',marginRate:0.35});
  const st = out.byStore||[];
  const lifts = st.map(s=>s.liftSalesPct).filter(x=>x!=null);
  const pays = st.filter(s=>s.verdict==='pays').length;
  console.log(`\n--- split on ${field} ---`);
  console.log(' stores        :', st.length);
  console.log(' mean lift     :', (lifts.reduce((a,b)=>a+b,0)/lifts.length).toFixed(2)+'%', ' (TRUE = +10.00%)');
  console.log(' range         :', Math.min(...lifts).toFixed(1)+'% .. '+Math.max(...lifts).toFixed(1)+'%');
  console.log(' negative      :', lifts.filter(x=>x<0).length+'/'+lifts.length);
  console.log(' verdict pays  :', pays+'/'+st.length);
}
