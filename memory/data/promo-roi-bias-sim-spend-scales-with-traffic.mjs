import { matchedLift } from '/home/user/meridian/src/engine/promo-roi.js';
let seed=3; const rnd=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648;
const DOW=[4000,5200,5000,5100,5600,7000,6500];

// ZERO true promo effect. But promo DOLLARS scale with traffic -- more customers means more
// promo redemptions. That is how real promo spend behaves: it is a FUNCTION of volume.
function mk(loc,n){const rows=[];
 for(let i=0;i<n;i++){const d=new Date(2026,3,1+i),dow=d.getDay();
  const sales=DOW[dow]*(0.75+0.5*rnd());          // promo has NO effect on sales
  const spend=sales*0.03*(0.7+0.6*rnd());          // redemptions scale WITH sales
  rows.push({loc,date:d,dow,sales,gc:Math.round(sales/9),
             promoAmt:spend, promoPct:(spend/sales)*100});}
 return rows;}
const recs=[]; for(let s=0;s<27;s++) recs.push(...mk(String(3000+s).padStart(7,'0'),120));

for (const f of ['promoPct','promoAmt']) {
  const o=matchedLift(recs,{intensityField:f,spendField:'promoAmt',marginRate:0.35});
  const L=o.byStore.map(s=>s.liftSalesPct).filter(x=>x!=null);
  const pays=o.byStore.filter(s=>s.verdict==='pays').length;
  console.log(`split=${f.padEnd(9)} mean lift=${(L.reduce((a,b)=>a+b,0)/L.length).toFixed(1)}%  range=${Math.min(...L).toFixed(0)}..${Math.max(...L).toFixed(0)}%  pays=${pays}/${o.byStore.length}`);
}
console.log('TRUE effect = 0%. Both splits are endogenous; they just lean opposite ways.');
