import {calculate,fioFactor,MONTHS,type SolarInput} from './solar.ts';
import {comparisonBill,reproduceInvoice,sameBillCustomer} from './bill-reconciliation.ts';

/** Explain the exact monthly projection; an observed invoice remains a separate basis. */
export function fioBDiagnostic(p:SolarInput,bills=calculate(p).bills){
 const rows=bills.map(b=>({month:b.month,year:b.calendarYear,label:`${MONTHS[b.month]}/${b.calendarYear}`,compensated:b.credit,direct:b.direct,factor:fioFactor(b.calendarYear,p.regime,p.post2028),rate:p.fioB*fioFactor(b.calendarYear,p.regime,p.post2028),amount:b.grid}));
 const average=rows.reduce((s,r)=>s+r.amount,0)/rows.length,compensated=rows.reduce((s,r)=>s+r.compensated,0)/rows.length;
 const years=[...new Set(rows.map(r=>r.year))].map(year=>{const months=rows.filter(r=>r.year===year);return {year,months:months.length,factor:months[0].factor,rate:months[0].rate};});
 const bill=comparisonBill(p),actual=bill?reproduceInvoice(bill):null,year=bill?Number(bill.reference.slice(-4)):0;
 const observed=actual&&bill&&sameBillCustomer(p.billAnalysis,bill)&&bill.solar?.gridRegime==='GD2'&&actual.compensationKwh>0&&actual.gridRate!==null&&year>=2023&&year<=2028?{
  reference:bill.reference,days:bill.readingDays,compensated:actual.compensationKwh,amount:actual.fioB,rate:actual.gridRate,total:bill.total,complete:actual.complete,
  // This isolated check holds the observed kWh and year constant. It is not a new bill forecast.
  configuredAmount:actual.compensationKwh*p.fioB*fioFactor(year,'transition',p.post2028),
  configuredRate:p.fioB*fioFactor(year,'transition',p.post2028),
 }:null;
 return {rows,years,average,compensated,period:`${rows[0].label} a ${rows.at(-1)!.label}`,observed};
}
