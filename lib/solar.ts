import type {FiscalConfig,RecurringCharge} from './fiscal';
import type {BillReading} from './bill';
import {calculateFinancing} from './financing.ts';
import type {OfficialFioB} from './official-fio-b';
import {commissionBreakdown,priceForMargin,type CommissionBasis} from './commission.ts';
import {technicalAreaEstimate} from './technical-area.ts';
import {technicalCostSummary,type TechnicalFee} from './technical-costs.ts';
import {materialCostSummary,type MaterialItem} from './materials.ts';
export type Extra={id:string;name:string;quantity:number;unit:number};
export type Load={id:string;name:string;quantity:number;watts:number;hours:number;days:number;duty:number};
export const loadConsumption=(loads:Load[])=>loads.reduce((s,l)=>s+l.quantity*l.watts/1000*l.hours*l.days*l.duty/100,0);
export type SolarInput={
 inverterReadings?:{reference:string;start:string;end:string;generationKwh:number;source:string;confirmed:boolean}[];
 selfUseBasis?:{kind:'assumption'|'inverter';percent:number;source:string;reference:string;confirmed:boolean}|null;
 billingAdjustment?:{factor:number;reference:string;source:string;confirmed:boolean}|null;
 proposalCover?:'illustration'|'solar-photo'|'portfolio';
 referenceBasis?:'last'|'average'|'peak';
 sizingBasis?:'last'|'average'|'peak'|'manual';
 systemType?:'on-grid'|'hybrid'|'off-grid';materials?:MaterialItem[]|null;
 technicalFees?:TechnicalFee[]|null;
 consumptionScenario?:'current'|'project'|'manual';futureConsumption?:number|null;
 technicalArea?:{lengthM:number|null;widthM:number|null;allowancePct:number;availableM2:number|null;source:string}|null;
 proposalDetails?:{moduleBrand:string;inverterBrand:string;moduleWarranty:string;inverterWarranty:string;installationWarranty:string;performanceWarranty:string;delivery:string;exclusions:string;support:string;paymentTerms:string}|null;
 analysisView?:'documents'|'projection';
 generationSuggestion?:{baseMonthlyKwh:number;reservePct:number;monthlyKwh:number;source:string}|null;
 referenceMode?:boolean;
 systemReference?:{modules:number;moduleW:number;inverterKw:number;monthlyKwh:number;investment:number;source:string;paymentTerms:string}|null;
 startMonth?:number;
 solarComparison?:{bill:BillReading;fileName:string}|null;
 compensationTax?:{perKwh:number;source:string;reference:string;confirmed:boolean}|null;
 fioBReference?:(OfficialFioB&{taxFactor:number;taxBillReference:string})|null;
 comparisonBasis?:'invoice'|'annual';fiscal?:FiscalConfig|null;recurringCharges?:RecurringCharge[]|null;
 client:string;phone:string;email:string;document:string;city:string;address:string;clientId?:string;loads:Load[];useLoadConsumption:boolean;
 billAnalyses?:BillReading[];projectMode?:'new'|'expansion';isSimulation?:boolean;existingSystemKwp?:number;existingGenerationMonthly?:number;
 reservePct:number;autoTarget:boolean;criticalMonth:boolean;billReference:string;consumerUnit:string;billTotal:number;billConsumption:number;billText:string;billFileName:string;billReviewed:boolean;billAnalysis:BillReading|null;
 consumption:number;target:number;monthlyConsumption:number[];detailedConsumption:boolean;
 hsp:number[];pr:number;shade:number;moduleW:number;moduleArea:number;manualModules:number;inverterKw:number;phase:number;selfUse:number;
 tariffName:string;tariff:number;fioB:number;tariffConfirmed:boolean;tariffSource:string;tariffValidUntil:string;lighting:number;otherFixed:number;startYear:number;
 regime:'transition'|'legacy';post2028:number;pricing:'components'|'kit';moduleCost:number;inverterCost:number;kitCost:number;
 supplier:string;kitDescription:string;costsConfirmed:boolean;labor:number;structure:number;electrical:number;engineering:number;freight:number;extras:Extra[];
 margin:number;taxes:number;commission:number;commissionBasis?:CommissionBasis;minimumProfit?:number;minimumNetMargin?:number;discount:number;downPayment:number;months:number;interest:number;financeFees:number;
 inflation:number;degradation:number;maintenance:number;discountRate:number;replacementYear:number;replacementCost:number;validity:number;
 notes:string;scope:string;status:string;hspConfirmed:boolean;
};
export const MONTHS=['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
export const DAYS=[31,28,31,30,31,30,31,31,30,31,30,31];
export const DEFAULT_INPUT:SolarInput={
 proposalCover:'illustration',referenceBasis:'last',
 referenceMode:false,systemReference:null,
 startMonth:0,
 solarComparison:null,compensationTax:null,
 fioBReference:null,
 comparisonBasis:'invoice',fiscal:null,recurringCharges:null,client:'',phone:'',email:'',document:'',city:'Ananindeua • PA',address:'',clientId:'',loads:[],useLoadConsumption:false,billAnalyses:[],projectMode:'new',isSimulation:false,existingSystemKwp:0,existingGenerationMonthly:0,
 reservePct:30,autoTarget:true,criticalMonth:false,billReference:'',consumerUnit:'',billTotal:0,billConsumption:0,billText:'',billFileName:'',billReviewed:false,billAnalysis:null,
 consumption:1000,target:1300,monthlyConsumption:Array(12).fill(1000),detailedConsumption:false,
 hsp:[4.3,4.1,4.2,4.3,4.6,4.8,5.1,5.4,5.4,5.3,5.0,4.6],pr:80,shade:0,moduleW:610,moduleArea:2.7,manualModules:0,inverterKw:8,phase:30,selfUse:35,
 tariffName:'Equatorial Pará',tariff:1.1,fioB:0.25,tariffConfirmed:false,tariffSource:'',tariffValidUntil:'',lighting:35,otherFixed:0,startYear:2026,regime:'transition',post2028:100,
 pricing:'components',moduleCost:390,inverterCost:4200,kitCost:12000,supplier:'',kitDescription:'',costsConfirmed:false,labor:110,structure:75,electrical:800,engineering:1000,freight:450,extras:[],
 margin:25,taxes:0,commission:0,discount:0,downPayment:0,months:84,interest:1.49,financeFees:0,inflation:4,degradation:0.5,maintenance:0.5,discountRate:8,replacementYear:12,replacementCost:4000,validity:15,
 notes:'Valores sujeitos à vistoria e à confirmação das condições de instalação.',scope:'Projeto e homologação; fornecimento de equipamentos; instalação; materiais elétricos previstos; configuração do monitoramento.',status:'Rascunho',hspConfirmed:false,
};
export function fioFactor(year:number,regime:string,post2028:number){
 if(regime==='legacy'&&year<=2045)return 0;
 if(year<=2022)return 0;
 if(year<=2028)return Math.min(0.9,(year-2022)*0.15);
 return post2028/100;
}
export function monthlyBill(consumption:number,generation:number,p:SolarInput,year:number,escalation=1,openingCredits=0){
 const direct=Math.min(consumption,generation*p.selfUse/100),imported=Math.max(0,consumption-direct),injected=Math.max(0,generation-direct);
 const adjustment=p.billingAdjustment?.factor??1,billableImported=imported*adjustment;
 const transportRate=p.fioB*fioFactor(year,p.regime,p.post2028)+Math.max(0,p.compensationTax?.perKwh??0);
 // Preserve credits that would only replace the availability floor, with no reduction in the bill.
 const limit=p.tariff>transportRate?Math.max(0,(billableImported*p.tariff-p.phase*p.tariff)/(p.tariff-transportRate)):billableImported;
 const credit=Math.min(injected+Math.max(0,openingCredits),billableImported,limit),uncovered=Math.max(0,billableImported-credit);
 const energy=uncovered*p.tariff*escalation,grid=credit*p.fioB*escalation*fioFactor(year,p.regime,p.post2028),floor=p.phase*p.tariff*escalation;
 const compensationTax=credit*Math.max(0,p.compensationTax?.perKwh??0)*escalation;
 const fixed=p.lighting+p.otherFixed,after=Math.max(floor,energy+grid+compensationTax)+fixed,before=Math.max(floor,consumption*adjustment*p.tariff*escalation)+fixed;
 return {before,after,savings:before-after,direct,imported,billableImported,meterAdjustmentKwh:imported-billableImported,injected,credit,uncovered,surplus:Math.max(0,injected-credit),grid,compensationTax,energy,floor,floorComplement:Math.max(0,floor-energy-grid-compensationTax),fixed,
  openingCredits,closingCredits:Math.max(0,openingCredits+injected-credit),creditsUsed:Math.min(openingCredits,credit)};
}
export function simulateEnergyYears(consumption:number[],generation:number[],p:SolarInput,years=25){
 const lots:{amount:number;created:number}[]=[],startMonth=p.startMonth??0;
 const result=[];
 for(let offset=0;offset<years;offset++){
  const escalation=(1+p.inflation/100)**offset,degradation=(1-p.degradation/100)**offset;
  const bills=[];
  for(let step=0;step<12;step++){
   const serial=offset*12+step,month=(startMonth+step)%12,calendarYear=p.startYear+offset+Math.floor((startMonth+step)/12);
   let expiredCredits=0;while(lots.length&&serial-lots[0].created>=60)expiredCredits+=lots.shift()!.amount;
   const opening=lots.reduce((sum,l)=>sum+l.amount,0),b=monthlyBill(consumption[month],generation[month]*degradation,p,calendarYear,escalation,opening);
   lots.push({amount:b.injected,created:serial});let used=b.credit;
   while(used>.0000001&&lots.length){const taken=Math.min(used,lots[0].amount);lots[0].amount-=taken;used-=taken;if(lots[0].amount<.0000001)lots.shift();}
   bills.push({...b,closingCredits:lots.reduce((sum,l)=>sum+l.amount,0),expiredCredits,month,calendarYear});
  }
  result.push(bills);
 }
 return result;
}
export function calculate(p:SolarInput){
 if(p.referenceMode&&p.systemReference){const r=p.systemReference;p={...p,manualModules:r.modules,moduleW:r.moduleW,inverterKw:r.inverterKw,autoTarget:false,target:r.monthlyKwh};}
 const estimatedLoad=loadConsumption(p.loads||[]);
 const consumption=MONTHS.map((_,i)=>p.useLoadConsumption?estimatedLoad:p.detailedConsumption?p.monthlyConsumption[i]:p.consumption);
 const avgConsumption=consumption.reduce((a,b)=>a+b,0)/12;
 const target=p.autoTarget?avgConsumption*(1+(p.reservePct||0)/100):p.target;
 const yieldPerKwp=p.hsp.reduce((s,h,i)=>s+h*DAYS[i],0)*p.pr/100*(1-p.shade/100);
 const monthYield=p.hsp.map((h,i)=>p.moduleW/1000*h*DAYS[i]*p.pr/100*(1-p.shade/100));
 const suggested=Math.max(1,Math.ceil(p.criticalMonth?Math.max(...monthYield.map((v,i)=>(p.autoTarget?consumption[i]*(1+p.reservePct/100):target)/v)):target*12/(p.moduleW/1000*yieldPerKwp)));
 const baseModules=Math.max(1,Math.ceil(p.criticalMonth?Math.max(...monthYield.map((v,i)=>consumption[i]/v)):avgConsumption*12/(p.moduleW/1000*yieldPerKwp))),modules=p.manualModules>0?p.manualModules:suggested,kwp=modules*p.moduleW/1000;
 const physicalGeneration=p.hsp.map((h,i)=>kwp*h*DAYS[i]*p.pr/100*(1-p.shade/100)),physicalMonthlyGeneration=physicalGeneration.reduce((a,b)=>a+b,0)/12;
 const reference=p.referenceMode?p.systemReference:null;
 const generation=reference?physicalGeneration.map(v=>v*reference.monthlyKwh/physicalMonthlyGeneration):physicalGeneration,annualGeneration=generation.reduce((a,b)=>a+b,0);
 const equipment=p.pricing==='kit'?p.kitCost:modules*p.moduleCost+p.inverterCost,labor=modules*p.labor,structure=modules*p.structure;
 const technicalCosts=technicalCostSummary(p),materialCosts=materialCostSummary(p);
 const extras=p.extras.reduce((s,e)=>s+e.quantity*e.unit,0),cost=equipment+labor+structure+p.electrical+p.engineering+p.freight+extras+technicalCosts.extra+materialCosts.extra;
 const listPrice=priceForMargin(cost,p.margin,p.taxes,p.commission,p.commissionBasis),price=reference?reference.investment:listPrice*(1-p.discount/100),commission=commissionBreakdown(price,cost,p.taxes,p.commission,p.commissionBasis),{profit,actualMargin}=commission;
 const scenario=p.consumptionScenario??'current';
 const projectedAverage=scenario==='project'?target:scenario==='manual'?(p.futureConsumption??avgConsumption):avgConsumption;
 const projectedConsumption=consumption.map(v=>avgConsumption>0?v*projectedAverage/avgConsumption:projectedAverage);
 const technicalArea=technicalAreaEstimate(p,modules);
 const energyYears=simulateEnergyYears(projectedConsumption,generation,p),bills=energyYears[0],yearlySavings=bills.reduce((s,b)=>s+b.savings,0),before=bills.reduce((s,b)=>s+b.before,0)/12,after=bills.reduce((s,b)=>s+b.after,0)/12;
 let accumulated=-price,npv=-price,payback:number|null=null;
 const annual=[{year:0,calendarYear:p.startYear-1,savings:0,maintenance:0,replacement:0,net:0,accumulated:-price,beforeCost:0,afterCost:0,fioCost:0}];
 for(let year=1;year<=25;year++){
  const escalation=(1+p.inflation/100)**(year-1),degradation=(1-p.degradation/100)**(year-1),calendarYear=p.startYear+year-1;
  const yearBills=energyYears[year-1];
  const savings=yearBills.reduce((s,b)=>s+b.savings,0),beforeCost=yearBills.reduce((s,b)=>s+b.before,0),afterCost=yearBills.reduce((s,b)=>s+b.after,0),fioCost=yearBills.reduce((s,b)=>s+b.grid,0),maintenance=price*p.maintenance/100*escalation,replacement=year===p.replacementYear?p.replacementCost*escalation:0,net=savings-maintenance-replacement,previous=accumulated;
  accumulated+=net;if(payback===null&&accumulated>=0&&net>0)payback=(year-1)+(-previous)/net;
  npv+=net/(1+p.discountRate/100)**year;
  annual.push({year,calendarYear,savings,maintenance,replacement,net,accumulated,beforeCost,afterCost,fioCost});
 }
 const {down,principal,installment,totalFinanced}=calculateFinancing(price,p.downPayment,p.months,p.interest,p.financeFees);
 const warnings:string[]=[];
 if(p.systemType&&p.systemType!=='on-grid')warnings.push('A projeção de fatura e Fio B deste simulador atende sistemas on-grid. Sistema híbrido ou off-grid exige estudo de baterias e operação; os custos mensais não estão validados para essa configuração.');
 if(materialCosts.pending.length)warnings.push('Há materiais com quantidade informada e especificação ou preço de compra pendente. Conferir a cotação e o projeto executivo.');
 if(technicalCosts.pending.length)warnings.push('Custos de engenharia, ART ou conexão pendentes; o orçamento interno ainda precisa de conferência.');
 if(technicalArea.fits===false)warnings.push(`Área disponível insuficiente nesta estimativa: faltam ${num(technicalArea.shortageM2!,1)} m². Rever quantidade de módulos ou local de instalação.`);
 if(technicalArea.fits===null)warnings.push('Área disponível não informada. A área técnica estimada depende das dimensões do módulo, disposição, recuos e vistoria estrutural.');
 if(scenario!=='current')warnings.push('Consumo futuro informado como hipótese. A comparação com a conta atual envolve quantidades de energia diferentes; confira também o cenário sem solar para a mesma demanda futura.');
 if(reference)warnings.push('Cenário de referência contratual: geração informada, não medida, distribuída pelo perfil solar do cenário. Investimento do contrato, sem inferir custo interno ou quitação.');
 if(!p.tariffConfirmed)warnings.push('Confira a tarifa efetiva e o Fio B na fatura ou tabela oficial.');
 if(p.billFileName&&!p.tariffConfirmed&&p.fioB===0&&p.regime!=='legacy')warnings.push('Fio B ainda não informado: o custo com solar é parcial, a economia é um limite superior e o retorno precisa ser recalculado após conferir essa componente.');
 if(p.billFileName&&bills.some(b=>b.credit>0)&&!p.compensationTax)warnings.push('Tributos/ajustes adicionais sobre a compensação SCEE ainda não informados. O custo com solar é parcial; uma alíquota de zero exige confirmação expressa.');
 if(!p.costsConfirmed)warnings.push('Equipamentos e serviços usam custos de referência; confirme as cotações.');
 if(!p.hspConfirmed)warnings.push('O perfil solar é ilustrativo. Valide a irradiação do local e as perdas na vistoria.');
 if(p.tariffValidUntil&&p.tariffValidUntil<new Date().toISOString().slice(0,10))warnings.push('A vigência cadastrada da tarifa terminou. Atualize os valores.');
 if(kwp/p.inverterKw>1.4)warnings.push('Relação CC/CA acima de 1,40: valide clipping e limites elétricos do inversor.');
 if(kwp>75)warnings.push('Potência acima de 75 kWp: esta simulação simplificada do Grupo B exige análise técnica e regulatória específica.');
 if(annualGeneration/12<target*0.95)warnings.push('O sistema selecionado gera menos que a meta mensal com a reserva solicitada.');
 if(p.billFileName&&!p.billReviewed)warnings.push('A leitura da fatura ainda precisa de conferência antes da proposta final.');
 if(p.billAnalysis?.special)warnings.push('Tarifa Social: projeção preliminar pela tarifa média líquida da fatura. Faixas, benefícios e custo de disponibilidade especial precisam de validação; não são recalculados automaticamente.');
 if(p.projectMode==='expansion')warnings.push('Proposta de ampliação: dimensionamento sobre o consumo remanescente observado. A fatura não revela toda a geração ou o autoconsumo do sistema atual; valide no inversor e na vistoria.');
 if(actualMargin<p.margin-0.1)warnings.push('O desconto reduziu a margem efetiva em relação à margem alvo.');
 return {modules,suggested,baseModules,extraModules:Math.max(0,modules-baseModules),avgConsumption,target,kwp,area:technicalArea.moduleArea,technicalArea,technicalCosts,projectedConsumption,projectedAverage,scenario,generation,annualGeneration,monthlyGeneration:annualGeneration/12,physicalMonthlyGeneration,consumption,estimatedLoad,equipment,labor,structure,extras,cost,listPrice,price,profit,actualMargin,commissionAmount:commission.commissionAmount,commissionBase:commission.commissionBase,saleTaxes:commission.saleTaxes,profitBeforeCommission:commission.profitBeforeCommission,bills,energyYears,before,after,yearlySavings,monthlySavings:yearlySavings/12,savingsPct:before?((before-after)/before*100):0,annual,payback,npv,roi:price?accumulated/price*100:0,net25:accumulated,installment,totalFinanced,principal,down,financeBalance:Math.round((Math.round(before*100)/100-Math.round(after*100)/100-Math.round(price*p.maintenance/100/12*100)/100-installment+Number.EPSILON)*100)/100,warnings};
}
export function reserveScenario(p:SolarInput,percent:number):SolarInput{
 const proposed={...p,autoTarget:true,reservePct:percent,manualModules:0,costsConfirmed:false};
 const old=calculate(p),next=calculate(proposed);
 if(p.pricing==='kit')proposed.kitCost=p.kitCost*next.modules/old.modules;
 proposed.inverterKw=next.kwp/p.inverterKw>1.4?Math.ceil(next.kwp/1.25*2)/2:p.inverterKw;
 if(proposed.inverterKw>p.inverterKw&&p.pricing==='components')proposed.inverterCost=p.inverterCost*proposed.inverterKw/p.inverterKw;
 return proposed;
}
export const money=(v:number)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:2}).format(v);
export const num=(v:number,d=0)=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:d}).format(v);
export const paybackLabel=(v:number|null)=>v===null?'Sem retorno em 25 anos':`${Math.floor(v)} ${Math.floor(v)===1?'ano':'anos'} e ${Math.floor(v*12)%12} ${Math.floor(v*12)%12===1?'mês':'meses'}`;
