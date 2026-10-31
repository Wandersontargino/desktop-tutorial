import {DEFAULT_INPUT,calculate,type SolarInput} from './solar.ts';
import {roundMoney} from './fiscal.ts';
import type {BillReading,BillHistory} from './bill.ts';
export type ClientProfile={name:string;document:string;identityDocument:string;phone:string;email:string;city:string;address:string;consumerUnits:string[];distributor:string;classification:string;lastBillReference:string;lastBillTotal:number;recurringBillTotal:number;lastConsumption:number;averageConsumption:number;peakConsumption:number;sourceFileName:string;source:'bill'|'manual'};
export const normalizeUnit=(s:string)=>s.replace(/\D/g,'');
export function fullDocument(s:string){if(/[*xX]/.test(s))return '';const value=s.replace(/\D/g,'');return [11,14].includes(value.length)?value:'';}
export function recentHistory(bill:BillReading):BillHistory[]{
 const recent=bill.history.filter(h=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(h.period)).slice().sort((a,b)=>a.period.localeCompare(b.period)).slice(-12);
 if(recent.length!==12)return [];
 const serial=(s:string)=>Number(s.slice(0,4))*12+Number(s.slice(5));
 return recent.every((h,i)=>!i||serial(h.period)-serial(recent[i-1].period)===1)?recent:[];
}
export function cityFromBill(bill:BillReading){const m=bill.address.match(/[-–]\s*([A-ZÀ-Ÿa-zà-ÿ][A-ZÀ-Ÿa-zà-ÿ '.]+)\s*[-–]\s*([A-Z]{2})\b/);return m?`${m[1].trim()} • ${m[2]}`:'';}
export type BillProjectOptions={phone:string;email:string;city:string;useHistory:boolean;reservePct:number;criticalMonth:boolean;labor:number;margin:number;year:number;bills?:BillReading[];simulation?:boolean;existingSystemKwp?:number;existingGenerationMonthly?:number};
export function buildProjectFromBill(bill:BillReading,text:string,fileName:string,options:BillProjectOptions):SolarInput{
 if(!bill.client.trim())throw new Error('Confira o nome do titular para criar o perfil.');
 if(!(bill.consumption>0))throw new Error('Informe o consumo faturado em kWh.');
 const rate=bill.tariff||bill.effectiveAverage;if(!(rate>0&&rate<=10))throw new Error('Informe a tarifa efetiva de energia para estimar os custos.');
 const bills=options.bills?.length?options.bills:[bill];
 const expansion=!!bill.hasSolar&&!!bill.solar;
 const samples=options.useHistory?bills.filter(b=>b.hasSolar&&b.solar):[bill];
 const remainingMean=expansion?samples.reduce((sum,b)=>sum+(b.solar?.billedConsumption||0),0)/Math.max(1,samples.length):bill.consumption;
 const history=options.useHistory&&!expansion?recentHistory(bill):[],monthly=Array(12).fill(expansion?remainingMean:bill.consumption);
 if(expansion&&options.useHistory)samples.forEach(b=>{const m=b.reference.match(/^(\d{2})[/-](\d{4})$/);if(m)monthly[Number(m[1])-1]=b.solar!.billedConsumption;});
 history.forEach(h=>{monthly[Number(h.period.slice(5))-1]=h.kwh;});
 const average=monthly.reduce((a,b)=>a+b,0)/12;
 const p:SolarInput={...structuredClone(DEFAULT_INPUT),client:bill.client.trim(),phone:options.phone,email:options.email,document:bill.document,city:options.city,address:bill.address,consumerUnit:bill.consumerUnit,
  billReference:bill.reference,billTotal:bill.total,billConsumption:bill.consumption,billFileName:fileName,billText:text,billReviewed:true,billAnalysis:bill,billAnalyses:bills,projectMode:expansion?'expansion':'new',isSimulation:!!options.simulation,existingSystemKwp:options.existingSystemKwp||0,existingGenerationMonthly:options.existingGenerationMonthly||0,phase:bill.phase||DEFAULT_INPUT.phase,
  consumption:average,monthlyConsumption:monthly,detailedConsumption:history.length===12||(expansion&&options.useHistory),useLoadConsumption:false,selfUse:0,consumptionScenario:'current',tariff:rate,fioB:bill.fioB,tariffName:bill.distributor,lighting:bill.lighting,otherFixed:expansion?Math.max(0,bill.recurringTotal-bill.lighting-bill.items.filter(i=>i.category==='energy').reduce((sum,i)=>sum+i.amount,0)):bill.special?0:bill.items.filter(i=>i.recurring&&['flag','other'].includes(i.category)&&i.amount>0).reduce((sum,i)=>sum+i.amount,0),
  tariffConfirmed:!bill.special&&bill.fioB>0,tariffSource:`Fatura ${bill.reference||fileName}`,autoTarget:true,reservePct:options.reservePct,criticalMonth:options.criticalMonth,labor:options.labor,margin:options.margin,startYear:options.year+(new Date().getMonth()===11?1:0),startMonth:(new Date().getMonth()+1)%12,status:'Rascunho',costsConfirmed:false,hspConfirmed:false};
 const c=calculate(p);p.inverterKw=Math.max(1.5,Math.ceil(c.kwp/1.25*2)/2);p.inverterCost=DEFAULT_INPUT.inverterCost*p.inverterKw/DEFAULT_INPUT.inverterKw;
 p.kitDescription=`${expansion?'Ampliação sugerida':'Pré-dimensionamento sugerido'}: ${c.modules} módulos de ${p.moduleW} W e inversor de ${p.inverterKw} kW. Marcas e modelos sujeitos à cotação e validação técnica.`;
 return p;
}
export function profileFromProject(p:SolarInput):ClientProfile{
 const c=calculate(p),b=p.billAnalysis;
 return {name:p.client.trim(),document:p.document,identityDocument:fullDocument(p.document),phone:p.phone,email:p.email,city:p.city,address:p.address,consumerUnits:p.consumerUnit?[normalizeUnit(p.consumerUnit)]:[],distributor:p.tariffName,classification:b?.classification||'',lastBillReference:p.billReference,lastBillTotal:p.billTotal,recurringBillTotal:b?.recurringTotal||p.billTotal,lastConsumption:p.billConsumption||p.consumption,averageConsumption:c.avgConsumption,peakConsumption:Math.max(...c.consumption,p.billConsumption||0),sourceFileName:p.billFileName,source:p.billFileName?'bill':'manual'};
}
export function costComparison(p:SolarInput){
 const c=calculate(p),average=(key:keyof typeof c.bills[number])=>c.bills.reduce((sum,b)=>sum+Number(b[key]),0)/12;
 const maintenance=roundMoney(c.price*p.maintenance/100/12),after=roundMoney(c.after),before=roundMoney(c.before),energyBefore=c.consumption.reduce((s,v)=>s+v*p.tariff,0)/12;
 const pendingFio=!!p.billFileName&&!p.tariffConfirmed&&p.fioB===0&&p.regime!=='legacy';
 const pendingCompensation=c.bills.some(b=>b.credit>0)&&(!p.compensationTax||p.compensationTax.perKwh===0&&!p.compensationTax.confirmed);
 return {currentInvoice:p.billTotal||c.before,recurringInvoice:p.billAnalysis?.recurringTotal||p.billTotal||c.before,nonRecurring:p.billAnalysis?.nonRecurring||0,averageBefore:before,averageAfter:after,energyBefore,energyAfter:average('energy'),fioB:average('grid'),compensationTax:average('compensationTax'),minimumBefore:Math.max(0,c.before-energyBefore-p.lighting-p.otherFixed),minimumAfter:average('floorComplement'),lighting:p.lighting,otherFixed:p.otherFixed,maintenance,installment:c.installment,totalCash:roundMoney(after+maintenance),totalFinanced:roundMoney(after+maintenance+c.installment),netCashSaving:roundMoney(before-after-maintenance),netFinancedSaving:roundMoney(before-after-maintenance-c.installment),billSaving:c.monthlySavings,pendingFio,pendingCompensation,partial:pendingFio||pendingCompensation};
}
