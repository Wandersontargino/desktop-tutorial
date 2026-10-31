import type {BillReading} from './bill.ts';
import type {SolarInput} from './solar.ts';
import {fioFactor} from './solar.ts';
const cents=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
export function reproduceInvoice(b:BillReading){
 const sum=(accept:(i:BillReading['items'][number])=>boolean)=>cents(b.items.filter(accept).reduce((s,i)=>s+i.amount,0));
 const grid=(i:BillReading['items'][number])=>/Uso da rede \/ Fio B/.test(i.label);
 const energy=sum(i=>['energy','compensation','injection'].includes(i.category));
 const fioB=sum(grid),benefitGross=sum(i=>i.category==='benefit'&&i.amount>0),benefitNet=sum(i=>i.category==='benefit'&&i.amount<0),scee=cents(benefitGross+benefitNet);
 const flag=sum(i=>i.category==='flag'),lighting=sum(i=>i.category==='fixed'),events=sum(i=>!i.recurring);
 const other=sum(i=>i.recurring&&!grid(i)&&!['energy','compensation','injection','benefit','flag','fixed'].includes(i.category));
 const items=cents(energy+fioB+scee+flag+lighting+events+other),difference=cents(b.total-items);
 return {energy,fioB,benefitGross,benefitNet,scee,flag,lighting,events,other,items,difference,complete:Math.abs(difference)<=.02,total:b.total,
  compensationKwh:b.solar?.compensated??0,gridRate:b.solar?.compensated?fioB/b.solar.compensated:null,
  // An observed net SCEE amount is an additional charge, separate from the gross Fio B.
  compensationTaxPerKwh:b.hasSolar&&!b.special&&benefitGross>0&&benefitNet<0&&scee>=0&&b.solar?.compensated&&Math.abs(difference)<=.02?scee/b.solar.compensated:null};
}
export function sameBillCustomer(a:BillReading|null,b:BillReading){
 const norm=(s:string)=>s.replace(/\D/g,'');
 const accountA=norm(a?.accountCode||''),accountB=norm(b.accountCode||'');
 if(accountA&&accountB)return accountA===accountB;
 const unitA=norm(a?.consumerUnit||''),unitB=norm(b.consumerUnit||'');
 return !!unitA&&!!unitB&&unitA===unitB;
}
export function comparisonBill(p:SolarInput){return p.solarComparison?.bill??(p.billAnalyses||[]).filter(b=>b.hasSolar).sort((a,b)=>(b.reference.slice(3)+b.reference.slice(0,2)).localeCompare(a.reference.slice(3)+a.reference.slice(0,2)))[0]??(p.billAnalysis?.hasSolar?p.billAnalysis:null);}
export function observedProjectionCharges(p:SolarInput,b:BillReading):SolarInput{
 const x=reproduceInvoice(b),year=Number(b.reference.slice(-4)),factor=fioFactor(year,'transition',100);
 if(p.projectMode==='expansion'||p.regime!=='transition'||!sameBillCustomer(p.billAnalysis,b)||!x.complete||b.solar?.gridRegime!=='GD2'||year<2023||year>2028||x.gridRate===null||x.compensationTaxPerKwh===null)throw new Error('Confira o vínculo, a conciliação e o enquadramento GD2 antes de usar estas despesas.');
 const fioB=x.gridRate/factor;if(!(fioB>0&&fioB<=p.tariff))throw new Error('A componente observada não é compatível com a tarifa integral informada.');
 const recurringCharges=[...(x.flag?[{id:'observed_flag',label:'Bandeira observada na fatura solar',amount:x.flag,kind:'flag' as const}]:[]),...(x.other?[{id:'observed_other',label:'Outras despesas observadas na fatura solar',amount:x.other,kind:'other' as const}]:[])];
 return {...p,fioB,fioBReference:null,tariffConfirmed:false,lighting:x.lighting,otherFixed:x.flag+x.other,recurringCharges,
  compensationTax:{perKwh:x.compensationTaxPerKwh,source:'Diferença SCEE bruta/líquida observada na fatura '+b.reference+'; hipótese por kWh.',reference:b.reference,confirmed:false},
  tariffSource:(p.tariffSource+' · Despesas observadas '+b.reference+': Fio B efetivo da linha GD2 dividido por '+(factor*100)+'% para obter a componente bruta integral; SCEE adicional, CIP e bandeira. A tarifa integral de energia não foi atualizada por esta ação.').slice(0,1500)};
}
