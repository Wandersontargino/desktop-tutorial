import type {BillReading} from './bill.ts';
import {fioFactor,type SolarInput} from './solar.ts';
import {linkedBills,inverterBalance} from './energy-accounting.ts';
import {reproduceInvoice} from './bill-reconciliation.ts';

const round=(n:number)=>{const v=Math.round((n+Number.EPSILON)*100)/100;return v===0?0:v;};
function date(s:string){
 const m=s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);if(!m)return null;
 const d=Number(m[1]),month=Number(m[2])-1,y=Number(m[3]),t=Date.UTC(y,month,d),v=new Date(t);
 return v.getUTCDate()===d&&v.getUTCMonth()===month&&v.getUTCFullYear()===y?t:null;
}

/** Aggregate only confirmed, aligned, non-overlapping cycles of this unit. */
export function measuredOperatingProfile(p:SolarInput){
 const supported=!p.systemType||p.systemType==='on-grid';
 const cycles=[];
 let previousEnd=-Infinity;
 for(const bill of supported?linkedBills(p):[]){
  if(!bill.hasSolar||!bill.solar)continue;
  const readings=(p.inverterReadings??[]).filter(r=>r.reference===bill.reference);
  // Conflicting duplicates must be reviewed instead of silently choosing one.
  if(readings.length!==1)continue;
  const balance=inverterBalance(bill,readings[0]),start=date(bill.previousReading),end=date(bill.currentReading);
  if(!balance.valid||!balance.confirmed||start===null||end===null||end<=start||start<previousEnd)continue;
  const days=(end-start)/86400000;
  if(days>120||!Number.isFinite(bill.solar.gridConsumption)||bill.solar.gridConsumption<0||!Number.isFinite(bill.solar.injected)||bill.solar.injected<0||bill.readingDays>0&&Math.abs(days-bill.readingDays)>1)continue;
  previousEnd=end;
  cycles.push({reference:bill.reference,days,...balance,source:readings[0].source});
 }
 const used=cycles.slice(-12),generation=used.reduce((s,r)=>s+r.generation,0),direct=used.reduce((s,r)=>s+r.direct,0),consumption=used.reduce((s,r)=>s+r.totalConsumption,0),days=used.reduce((s,r)=>s+r.days,0);
 return {supported,cycles:used,count:used.length,days,generation,direct,consumption,
  percent:generation>0?direct/generation*100:null,
  minimum:used.length?Math.min(...used.map(r=>r.percentOfGeneration)):null,
  maximum:used.length?Math.max(...used.map(r=>r.percentOfGeneration)):null,
  // Normalize cycles of different duration to an average 365-day-year month.
  monthlyConsumption:days>0?consumption/days*(365/12):null,
  reference:used.length?`${used[0].reference} a ${used.at(-1)!.reference}`:'',
 };
}

export function applyMeasuredOperatingProfile(p:SolarInput):SolarInput{
 const profile=measuredOperatingProfile(p);
 if(!profile.supported||p.projectMode==='expansion')throw new Error('O perfil do sistema existente não define o uso direto da geração adicional ou de baterias.');
 if(profile.count<3||profile.percent===null||!profile.monthlyConsumption||profile.monthlyConsumption>1e6)throw new Error('Confira pelo menos três ciclos do inversor, nos mesmos períodos das faturas.');
 const sources=profile.cycles.map(r=>`${r.reference}: ${r.source}`).join('; ');
 return {...p,selfUse:profile.percent,consumptionScenario:'manual',futureConsumption:profile.monthlyConsumption,comparisonBasis:'annual',hspConfirmed:false,
  selfUseBasis:{kind:'inverter',percent:profile.percent,reference:profile.reference,confirmed:true,
   source:`Perfil de ${profile.count} ciclos conferidos, ${profile.days} dias: uso direto ponderado pela geração e consumo total diário normalizado para mês médio. Aplicados como hipóteses futuras; a geração e o consumo podem variar. ${sources}`.slice(0,1500)},
 };
}

export type ChargeForecast={total:number;compensated:number;fioB:number;scee:number;energy:number;lighting:number;flag:number;other:number};
/** Attribution explains a difference; different periods do not establish forecast error. */
export function explainChargeDifference(f:ChargeForecast,b:BillReading){
 const a=reproduceInvoice(b),quantityDifference=a.compensationKwh-f.compensated;
 const rows:{id:string;label:string;amount:number}[]=[];
 if(f.compensated>0){
  const rate=(f.fioB+f.scee)/f.compensated;
  rows.push({id:'quantity',label:'Variação dos kWh compensados',amount:quantityDifference*rate});
  rows.push({id:'rates',label:'Variação das tarifas e ajustes por kWh',amount:a.fioB+a.scee-a.compensationKwh*rate});
 }else rows.push({id:'compensation',label:'Fio B e ajustes SCEE',amount:a.fioB+a.scee-f.fioB-f.scee});
 rows.push({id:'energy',label:'Energia sem compensação e complemento mínimo',amount:a.energy-f.energy},
  {id:'lighting',label:'Iluminação pública',amount:a.lighting-f.lighting},
  {id:'flag',label:'Bandeira',amount:a.flag-f.flag},
  {id:'other',label:'Outras despesas e eventuais',amount:a.other+a.events-f.other});
 const rounded=rows.map(r=>({...r,amount:round(r.amount)})),difference=round(b.total-f.total);
 const residue=round(difference-rounded.reduce((s,r)=>s+r.amount,0));
 if(residue)rounded.push({id:'reconciliation',label:'Não conciliado / arredondamento',amount:residue});
 return {rows:rounded,difference,quantityDifference,predictedCompensated:f.compensated,actualCompensated:a.compensationKwh,complete:a.complete};
}

/** Out-of-sample rate checks. The target's measured kWh are held known, not forecast. */
export function billingRateChecks(p:SolarInput){
 const bills=linkedBills(p).map(b=>({bill:b,charges:reproduceInvoice(b),year:Number(b.reference.slice(-4))}))
  .filter(r=>r.bill.solar?.gridRegime==='GD2'&&!r.bill.special&&r.charges.complete&&r.charges.compensationKwh>0&&r.charges.gridRate!==null&&r.charges.compensationTaxPerKwh!==null&&r.year>=2023&&r.year<=2028);
 const checks=[];
 for(let i=1;i<bills.length;i++){
  const source=bills[i-1],target=bills[i];
  const rate=source.charges.gridRate!/fioFactor(source.year,'transition',100)*fioFactor(target.year,'transition',100)+source.charges.compensationTaxPerKwh!;
  const predicted=round(target.charges.compensationKwh*rate),actual=round(target.charges.fioB+target.charges.scee);
  checks.push({source:source.bill.reference,target:target.bill.reference,knownKwh:target.charges.compensationKwh,predicted,actual,difference:round(predicted-actual)});
 }
 return {checks,count:checks.length,mae:checks.length?round(checks.reduce((s,r)=>s+Math.abs(r.difference),0)/checks.length):null,
  maximum:checks.length?Math.max(...checks.map(r=>Math.abs(r.difference))):null};
}
