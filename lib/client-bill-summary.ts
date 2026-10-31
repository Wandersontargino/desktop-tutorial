import type {SolarInput} from './solar';
import type {BillReading} from './bill';
import {comparisonDocuments} from './document-comparison.ts';
import {reproduceInvoice,sameBillCustomer} from './bill-reconciliation.ts';

const cents=(value:number)=>Math.round((value+Number.EPSILON)*100)/100;
const statements=(p:SolarInput)=>[p.billAnalysis,...p.billAnalyses??[],p.solarComparison?.bill].filter((b):b is BillReading=>!!b);

/** Only document amounts belong in the observed comparison. No simulated consumption is used. */
export function clientBillSummary(p:SolarInput){
 const documents=comparisonDocuments(p),{before,after}=documents;
 const charges=after&&documents.afterVerified?reproduceInvoice(after):null;
 const observed=charges&&after?{...charges,reference:after.reference,
  fioB:after.items.some(i=>/Uso da rede \/ Fio B/.test(i.label))?charges.fioB:null}:null;
 const sourceKey=JSON.stringify(statements(p).map(b=>[b.accountCode,b.consumerUnit,b.reference,b.hasSolar,b.total]));
 return {...documents,observed,sourceKey,hasDocuments:statements(p).length>0,
  difference:documents.complete?cents(before!.total-after!.total):null,
  recurringDifference:documents.complete?cents(before!.recurringTotal-after!.recurringTotal):null};
}

/** Attach another statement to the current draft without creating a different solar project. */
export function attachComparisonBill(p:SolarInput,bill:BillReading,fileName:string):SolarInput{
 const anchor=p.billAnalysis;
 if(!anchor||!sameBillCustomer(anchor,bill))throw new Error('Use uma fatura da mesma conta contrato ou unidade deste projeto.');
 if(!(bill.total>0&&bill.consumption>0))throw new Error('Confira o total e o consumo da fatura antes de vincular.');
 const key=(b:BillReading)=>`${b.reference}|${b.hasSolar}`,seen=new Set<string>(),bills:BillReading[]=[];
 for(const item of [anchor,bill,...statements(p).filter(b=>key(b)!==key(bill))]){
  if(!sameBillCustomer(anchor,item)||seen.has(key(item)))continue;
  bills.push(item);seen.add(key(item));
 }
 return {...p,billAnalyses:bills.slice(0,12),analysisView:'documents',
  solarComparison:bill.hasSolar?{bill,fileName}:p.solarComparison};
}

/** Reuse reviewed bills from this account's loaded proposals, without changing any saved record. */
export function withRelatedBills(p:SolarInput,proposals:SolarInput[]):SolarInput{
 const own=statements(p),anchor=p.billAnalysis??own[0];
 if(!anchor)return p;
 const bills:BillReading[]=[],seen=new Set<string>();let additions=0;
 for(const bill of own){if(bill!==anchor&&!sameBillCustomer(anchor,bill))continue;const key=`${bill.reference}|${bill.hasSolar}`;if(!seen.has(key)){bills.push(bill);seen.add(key);}}
 for(const proposal of proposals){
  if(!proposal.billReviewed)continue;
  for(const bill of statements(proposal)){
   const key=`${bill.reference}|${bill.hasSolar}`;
   if(seen.has(key)||!sameBillCustomer(anchor,bill))continue;
   bills.push(bill);seen.add(key);additions++;
  }
 }
 if(!additions)return p;
 const linked=comparisonDocuments({...p,billAnalyses:bills});
 const order=(b:BillReading)=>b.reference.slice(3)+b.reference.slice(0,2);
 const selected:BillReading[]=[],selectedKeys=new Set<string>();
 for(const bill of [p.billAnalysis,p.solarComparison?.bill,linked.before,linked.after,...bills.sort((a,b)=>order(b).localeCompare(order(a)))]){
  if(!bill||bill!==anchor&&!sameBillCustomer(anchor,bill))continue;const key=`${bill.reference}|${bill.hasSolar}`;
  if(selectedKeys.has(key))continue;selected.push(bill);selectedKeys.add(key);
 }
 // The import contract allows twelve statements. Original records retain the full history.
 return {...p,billAnalyses:selected.slice(0,12)};
}
