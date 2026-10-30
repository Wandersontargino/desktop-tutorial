import type {BillReading} from './bill.ts';
import type {SolarInput} from './solar.ts';
import {reproduceInvoice,sameBillCustomer} from './bill-reconciliation.ts';
const cents=(n:number)=>{const rounded=Math.round((n+Number.EPSILON)*100)/100;return rounded===0?0:rounded;};
const serial=(s:string)=>/^\d{2}\/\d{4}$/.test(s)?Number(s.slice(3))*12+Number(s.slice(0,2)):0;

export function linkedBills(p:SolarInput){
 const main=p.billAnalysis,unique=new Map<string,BillReading>();
 for(const b of [main,...p.billAnalyses??[],p.solarComparison?.bill])if(b&&(!main||b===main||sameBillCustomer(main,b)))unique.set(b.reference,b);
 return [...unique.values()].sort((a,b)=>serial(a.reference)-serial(b.reference));
}
export function mergeBillStudy(p:SolarInput,incoming:BillReading[]):SolarInput{
 const all=linkedBills(p);
 for(const b of incoming){
  if(!p.billAnalysis||!sameBillCustomer(p.billAnalysis,b))throw new Error('A conta contrato ou unidade não coincide com este cliente.');
  if(!serial(b.reference)||!b.total)throw new Error('Confira a competência e o total antes de vincular a fatura.');
  const old=all.find(x=>x.reference===b.reference);
  if(old&&(Math.abs(old.total-b.total)>.02||Math.abs(old.measuredKwh-b.measuredKwh)>.02))throw new Error(`Já existe uma fatura de ${b.reference} com valores diferentes. Confira as duas versões antes de substituir.`);
  if(old)all.splice(all.indexOf(old),1);all.push(b);
 }
 if(all.length>60)throw new Error('O estudo aceita até 60 faturas vinculadas.');
 all.sort((a,b)=>serial(a.reference)-serial(b.reference));
 const after=all.filter(b=>b.hasSolar).at(-1);
 return {...p,billAnalyses:all,solarComparison:after?{bill:after,fileName:after.sourceFileName||''}:p.solarComparison};
}
export function invoiceSeries(p:SolarInput){
 const bills=linkedBills(p),solar=bills.filter(b=>b.hasSolar&&b.solar);
 return bills.map(b=>{
  const r=reproduceInvoice(b),previous=solar.find(x=>serial(x.reference)===serial(b.reference)-1);
  const balance=b.solar?.currentBalance??null,priorBalance=previous?.solar?.currentBalance??null,expired=b.solar?.expiredCredits??null;
  const bankDifference=b.solar&&balance!==null&&priorBalance!==null&&expired!==null?cents(balance-(priorBalance+b.solar.injected-r.compensationKwh-expired)):null;
  return {bill:b,charges:r,meterAdjustment:b.measuredKwh-b.quantityKwh,billingFactor:b.measuredKwh>0&&b.quantityKwh>0?b.quantityKwh/b.measuredKwh:null,bankDifference,priorBalance};
 });
}
export function inverterBalance(b:BillReading,reading:NonNullable<SolarInput['inverterReadings']>[number]|undefined){
 if(!b.hasSolar||!b.solar)return {valid:false,reason:'Selecione uma fatura com geração distribuída.'} as const;
 if(!reading)return {valid:false,reason:'Informe a geração do inversor. A fatura mede apenas retiradas e injeção na rede.'} as const;
 if(reading.reference!==b.reference||!b.previousReading||!b.currentReading||reading.start!==b.previousReading||reading.end!==b.currentReading)return {valid:false,reason:'A geração do inversor deve abranger exatamente o ciclo de leitura impresso na fatura.'} as const;
 if(!Number.isFinite(reading.generationKwh)||reading.generationKwh<=0||reading.generationKwh+0.000001<b.solar.injected)return {valid:false,reason:'A geração deve ser positiva e não pode ser menor que a injeção medida. Confira ciclo e unidades.'} as const;
 const direct=reading.generationKwh-b.solar.injected,totalConsumption=direct+b.solar.gridConsumption;
 return {valid:true,direct,totalConsumption,generation:reading.generationKwh,imported:b.solar.gridConsumption,injected:b.solar.injected,percentOfGeneration:direct/reading.generationKwh*100,percentOfLoad:totalConsumption?direct/totalConsumption*100:0,confirmed:reading.confirmed&&!!reading.source.trim()} as const;
}
export function applyInverterProfile(p:SolarInput,b:BillReading):SolarInput{
 if(!p.billAnalysis||!sameBillCustomer(p.billAnalysis,b))throw new Error('Use uma fatura vinculada à mesma unidade.');
 if(p.systemType&&p.systemType!=='on-grid')throw new Error('Este balanço simplificado atende sistemas on-grid sem bateria.');
 const reading=p.inverterReadings?.find(r=>r.reference===b.reference),balance=inverterBalance(b,reading);
 if(!balance.valid||!balance.confirmed)throw new Error(balance.valid?'Confira a fonte, o período e a leitura do inversor.':balance.reason);
 return {...p,selfUse:balance.percentOfGeneration,selfUseBasis:{kind:'inverter',percent:balance.percentOfGeneration,reference:b.reference,source:`Balanço do inversor no ciclo ${b.previousReading} a ${b.currentReading}. ${reading!.source} Perfil histórico extrapolado como hipótese; não é medição da projeção futura.`.slice(0,1500),confirmed:true},hspConfirmed:false};
}
export function applyBillingFactor(p:SolarInput,b:BillReading):SolarInput{
 if(!p.billAnalysis||!sameBillCustomer(p.billAnalysis,b)||!reproduceInvoice(b).complete||!(b.quantityKwh>0&&b.measuredKwh>0))throw new Error('Confira o vínculo, a conciliação e as quantidades desta fatura.');
 const factor=b.quantityKwh/b.measuredKwh;if(factor<.5||factor>1.5)throw new Error('A relação entre as quantidades exige conferência específica.');
 return {...p,billingAdjustment:{factor,reference:b.reference,source:'Relação observada entre quantidade tarifada e medição. Inclui os ajustes do documento; não identifica isoladamente a causa nem garante o mesmo fator nos meses futuros.',confirmed:false}};
}
