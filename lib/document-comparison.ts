import type {SolarInput} from './solar';
import type {BillReading} from './bill';
import {calculate} from './solar.ts';
import {calculateFinancing,FINANCING_TERMS} from './financing.ts';
import {sameBillCustomer,reproduceInvoice} from './bill-reconciliation.ts';
const cents=(v:number)=>Math.round((v+Number.EPSILON)*100)/100;
const period=(b:BillReading)=>/^\d{2}\/\d{4}$/.test(b.reference)?b.reference.slice(3)+b.reference.slice(0,2):'';

export function documentComparison(p:SolarInput){
 const main=p.billAnalysis;
 const bills=[main,...p.billAnalyses||[],p.solarComparison?.bill].filter((b):b is BillReading=>!!b&&(!main||b===main||sameBillCustomer(main,b)));
 const sort=(a:BillReading,b:BillReading)=>period(b).localeCompare(period(a));
 const after=bills.filter(b=>b.hasSolar).sort(sort)[0]??null;
 const before=bills.filter(b=>!b.hasSolar&&(!after||!!period(b)&&period(b)<period(after))).sort(sort)[0]??null;
 const verified=(b:BillReading|null)=>!!b&&b.items.length>0&&reproduceInvoice(b).complete;
 const linked=!!before&&!!after&&sameBillCustomer(before,after),complete=linked&&verified(before)&&verified(after);
 const r=p.systemReference?.source.trim()?p.systemReference:null,price=r?.investment??calculate(p).price;
 const financing=calculateFinancing(price,p.downPayment,p.months,p.interest,p.financeFees);
 const maintenance=cents(price*p.maintenance/100/12),residual=after?.recurringTotal??null;
 const conditional=residual===null?null:{residual,maintenance,installment:cents(financing.installment),cash:cents(residual+maintenance),paymentPlusResidual:cents(residual+financing.installment),financed:cents(residual+maintenance+financing.installment)};
 const terms=residual===null?[]:FINANCING_TERMS.map(months=>{const loan=calculateFinancing(price,p.downPayment,months,p.interest,p.financeFees);return {months,installment:cents(loan.installment),paymentPlusResidual:cents(residual+loan.installment),withMaintenance:cents(residual+loan.installment+maintenance)};});
 return {before,after,linked,complete,beforeVerified:verified(before),afterVerified:verified(after),price,contractPrice:!!r,financing,maintenance,conditional,terms,
  difference:complete?cents(before!.total-after!.total):null,recurringDifference:complete?cents(before!.recurringTotal-after!.recurringTotal):null};
}
