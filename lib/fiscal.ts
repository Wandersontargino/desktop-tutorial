import {calculate,monthlyBill,type SolarInput} from './solar.ts';
import type {BillReading} from './bill.ts';
export const TAX_NAMES=['ICMS','PIS','COFINS'] as const;
export type TaxName=typeof TAX_NAMES[number];
export const TAX_COMPONENTS=['energy','fioB','minimum','flag','other'] as const;
export type TaxComponent=typeof TAX_COMPONENTS[number];
export type FiscalTax={rate:number|null;incidence:Record<TaxComponent,boolean|null>};
export type FiscalConfig={taxes:Record<TaxName,FiscalTax>;excludeIcmsFromFederal:boolean;source:string;confirmed:boolean;te:number|null;tusd:number|null};
export type RecurringCharge={id:string;label:string;amount:number;kind:'flag'|'other'};
export const roundMoney=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
export function fiscalConfig(p:SolarInput):FiscalConfig{
 if(p.fiscal)return structuredClone(p.fiscal);
 const read=(name:TaxName)=>p.billAnalysis?.taxes.find(t=>t.name.toUpperCase()===name)?.rate??null;
 return {taxes:Object.fromEntries(TAX_NAMES.map(name=>[name,{rate:read(name),incidence:{energy:true,fioB:null,minimum:true,flag:true,other:null}}])) as Record<TaxName,FiscalTax>,excludeIcmsFromFederal:true,source:p.billAnalysis?`Alíquotas observadas na fatura ${p.billAnalysis.reference}; incidências futuras a conferir.`:'',confirmed:false,te:null,tusd:null};
}
export function recurringCharges(p:SolarInput):RecurringCharge[]{
 const available=Math.max(0,p.otherFixed);
 const source=Array.isArray(p.recurringCharges)?p.recurringCharges:(p.billAnalysis?.items||[]).filter(i=>i.recurring&&['flag','other'].includes(i.category)&&i.amount>0).map((i,n)=>({id:`bill_${n}`,label:i.label,amount:i.amount,kind:i.category==='flag'?'flag' as const:'other' as const}));
 const sum=source.reduce((s,c)=>s+c.amount,0),scale=sum>available&&sum>0?available/sum:1;
 const rows=source.map(c=>({...c,amount:c.amount*scale})).filter(c=>Array.isArray(p.recurringCharges)||c.amount>0);
 if(available-sum>.000001)rows.push({id:'other_balance',label:'Outros encargos informados · detalhar',amount:available-sum,kind:'other'});
 return rows;
}
export function invoiceExpenses(b:BillReading){
 const taxes=TAX_NAMES.map(name=>{const found=b.taxes.find(t=>t.name.toUpperCase()===name);return {name,base:found?.base??null,rate:found?.rate??null,amount:found?.amount??null};});
 const embeddedTaxes=roundMoney(taxes.reduce((s,t)=>s+(t.amount??0),0)),itemsTotal=roundMoney(b.items.reduce((s,i)=>s+i.amount,0)),difference=roundMoney(b.total-itemsTotal);
 return {items:b.items,taxes,embeddedTaxes,itemsTotal,difference,total:b.total,nonRecurring:b.nonRecurring,recurring:b.recurringTotal,missingTaxes:taxes.filter(t=>t.amount===null).map(t=>t.name)};
}
export type FiscalCharge={id:string;label:string;gross:number;component:TaxComponent|null;formula:string};
export type ProjectedTax={name:TaxName;rate:number|null;base:number|null;amount:number|null;pending:string[]};
export function componentTaxes(charges:FiscalCharge[],config:FiscalConfig):ProjectedTax[]{
 const taxable=charges.filter(c=>c.component!==null);
 const rateSum=TAX_NAMES.reduce((sum,name)=>sum+(config.taxes[name].rate??0),0);if(rateSum>=100)return TAX_NAMES.map(name=>({name,rate:config.taxes[name].rate,base:null,amount:null,pending:['Alíquotas incompatíveis: confira a soma dos percentuais']}));
 const icms=config.taxes.ICMS;
 return TAX_NAMES.map(name=>{
  const tax=config.taxes[name],pending:string[]=[];let base=0;
  for(const c of taxable){
   if(Math.abs(c.gross)<.000001)continue;
   const incidence=tax.incidence[c.component!];
   if(incidence===null){pending.push(`Incidência sobre ${c.label}`);continue;}
   if(!incidence)continue;
   let value=c.gross;
   if(name!=='ICMS'&&config.excludeIcmsFromFederal){const icmsApplies=icms.incidence[c.component!];if(icmsApplies===null){pending.push(`ICMS a excluir de ${c.label}`);continue;}if(icmsApplies){if(icms.rate===null){pending.push('Alíquota do ICMS a excluir');continue;}value-=c.gross*icms.rate/100;}}
   base+=value;
  }
  const knownBase=pending.length?null:roundMoney(Math.max(0,base));
  if(tax.rate===null&&Math.abs(base)>.000001)pending.push(`Alíquota de ${name}`);
  return {name,rate:tax.rate,base:knownBase,amount:pending.length||tax.rate===null?null:roundMoney((knownBase??0)*tax.rate/100),pending:[...new Set(pending)]};
 });
}
export function projectExpenses(p:SolarInput,period=-1,yearOffset=0){
 const config=fiscalConfig(p),calc=calculate(p),escalation=(1+p.inflation/100)**yearOffset,year=p.startYear+yearOffset,degradation=(1-p.degradation/100)**yearOffset;
 const yearBills=calc.energyYears[yearOffset],selected=period>=0?yearBills.filter(b=>b.month===period):yearBills,divisor=period===-1?12:1;
 const recurring=recurringCharges(p),flag=recurring.filter(c=>c.kind==='flag').reduce((s,c)=>s+c.amount,0),other=Math.max(0,p.otherFixed-flag);
 const sum=(fn:(b:ReturnType<typeof monthlyBill>)=>number)=>selected.reduce((s,b)=>s+fn(b),0)/divisor;
 const multiplier=selected.length/divisor,compensationGross=sum(b=>b.compensationTax),compensationTax=roundMoney(compensationGross);
 const charges:FiscalCharge[]=[
  {id:'energy',label:'Energia da rede sem compensação',gross:sum(b=>b.energy),component:'energy',formula:'kWh remanescentes × tarifa integral com tributos'},
  {id:'fioB',label:'Fio B da energia compensada',gross:sum(b=>b.grid),component:'fioB',formula:'kWh compensados × componente Fio B × percentual do ano'},
  {id:'compensationTax',label:'Tributos/ajustes SCEE adicionais sobre compensação',gross:compensationGross,component:null,formula:p.compensationTax?`kWh compensados × R$ ${p.compensationTax.perKwh.toFixed(6)}/kWh; referência ${p.compensationTax.reference||'manual'}`:'Valor pendente; não presumido como zero'},
  {id:'minimum',label:'Complemento do custo de disponibilidade',gross:sum(b=>b.floorComplement),component:'minimum',formula:'Diferença para o piso de energia + Fio B; sem duplicar o mínimo'},
  ...recurring.map(c=>({id:c.id,label:c.label,gross:c.amount*multiplier,component:c.kind as TaxComponent,formula:'Valor fixo previsto; revisar conforme consumo e bandeira'})),
  {id:'lighting',label:'Iluminação pública · CIP / COSIP',gross:p.lighting*multiplier,component:null,formula:'Valor municipal informado, mantido na hipótese de projeção'},
 ];
 const total=roundMoney(sum(b=>b.after)),taxes=componentTaxes(charges,config),knownTaxes=roundMoney(taxes.reduce((s,t)=>s+(t.amount??0),0)+compensationTax);
 const variable=charges.filter(c=>c.id!=='lighting').reduce((s,c)=>s+c.gross,0),lighting=p.lighting*multiplier;
 const net=roundMoney(variable-knownTaxes),roundedLighting=roundMoney(lighting),adjustment=roundMoney(total-net-knownTaxes-roundedLighting);
 const pendingFio=!!p.billFileName&&!p.tariffConfirmed&&p.fioB===0&&p.regime!=='legacy';
 const pendingCompensation=selected.some(b=>b.credit>0)&&(!p.compensationTax||p.compensationTax.perKwh===0&&!p.compensationTax.confirmed);
 return {config,charges,taxes,total,knownTaxes,compensationTax,pendingCompensation,variable:roundMoney(variable),net,lighting:roundedLighting,adjustment,pendingFio,pendingTaxes:taxes.some(t=>t.amount===null),confirmed:config.confirmed,escalation,year:selected[0]?.calendarYear??year,yearEnd:selected.at(-1)!.calendarYear,flag,other,
  tariff:p.tariff*escalation,fioBRate:p.fioB*escalation,month:period,annual:period===-2,sourceReference:p.billReference,embedded:true,
  composition:[{label:taxes.some(t=>t.amount===null)?'Parcelas com tributos ainda a confirmar':'Parcelas sem os tributos destacados',amount:net,color:'#235097'},...taxes.filter(t=>t.amount!==null).map((t,i)=>({label:t.name,amount:t.amount!,color:['#cc9c42','#7c98c3','#5f82b6'][i]})),...(compensationTax?[{label:'Tributos/ajustes SCEE adicionais',amount:compensationTax,color:'#b17a2a'}]:[]),{label:'CIP / COSIP',amount:roundedLighting,color:'#bfd2f5'},...(adjustment?[{label:'Ajuste de arredondamento',amount:adjustment,color:'#8da9d2'}]:[])]};
}
