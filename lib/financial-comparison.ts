import {roundMoney,projectExpenses} from './fiscal.ts';
import {calculate,type SolarInput} from './solar.ts';
import {calculateFinancing,FINANCING_TERMS} from './financing.ts';
export type ComparisonBasis='invoice'|'annual';
export function paymentMetrics(current:number,total:number){
 const saving=roundMoney(current-total);
 return {saving,savingPct:current>0?saving/current*100:null,remainingPct:current>0?total/current*100:null};
}
export function financialComparison(p:SolarInput,basis:ComparisonBasis=p.comparisonBasis||'invoice'){
 const project=calculate(p),bill=p.billAnalysis,canUseInvoice=!!bill&&bill.consumption>0&&bill.recurringTotal>0;
 const usesInvoice=basis==='invoice'&&canUseInvoice&&(!p.consumptionScenario||p.consumptionScenario==='current');
 const invoiceConsumption=bill?.hasSolar&&bill.solar?bill.solar.billedConsumption:bill&&!bill.special&&bill.quantityKwh>0?bill.quantityKwh:bill?.consumption||p.consumption;
 const working=usesInvoice?{...p,useLoadConsumption:false,detailedConsumption:false,consumption:Math.max(1,invoiceConsumption),manualModules:project.modules,billingAdjustment:null}:p;
 const c=calculate(working),current=roundMoney(usesInvoice?bill!.recurringTotal:c.before);
 const after=roundMoney(c.after),maintenance=roundMoney(c.price*p.maintenance/100/12),installment=roundMoney(c.installment),cashTotal=roundMoney(after+maintenance),financedTotal=roundMoney(cashTotal+installment);
 const financingOptions=[...new Set<number>([...FINANCING_TERMS,p.months])].sort((a,b)=>a-b).map(months=>{
  const loan=calculateFinancing(c.price,p.downPayment,months,p.interest,p.financeFees),paymentPlusResidual=roundMoney(loan.installment+after),monthlyTotal=roundMoney(paymentPlusResidual+maintenance);
  return {months,...loan,after,maintenance,paymentPlusResidual,monthlyTotal,...paymentMetrics(current,monthlyTotal)};
 });
 const unknownFio=!!p.billFileName&&!p.tariffConfirmed&&p.fioB===0&&p.regime!=='legacy';
 const unknownSelfUse=!!p.billFileName&&(!p.selfUseBasis?.confirmed||Math.abs(p.selfUseBasis.percent-p.selfUse)>.000001);
 const unknownCompensation=c.bills.some(b=>b.credit>0)&&(!p.compensationTax||p.compensationTax.perKwh===0&&!p.compensationTax.confirmed),partial=unknownFio||unknownCompensation||unknownSelfUse;
 const cashMetrics=paymentMetrics(current,cashTotal),financedMetrics=paymentMetrics(current,financedTotal);
 const interestScenarios=[{label:'Juros menores',offset:-.5},{label:'Taxa de referência',offset:0},{label:'Juros maiores',offset:.5}].map(s=>{
  const interest=Math.min(20,Math.max(0,p.interest+s.offset)),loan=calculateFinancing(c.price,p.downPayment,p.months,interest,p.financeFees);
  const paymentPlusResidual=roundMoney(loan.installment+after),monthlyTotal=roundMoney(paymentPlusResidual+maintenance);
  return {...s,interest,...loan,paymentPlusResidual,monthlyTotal,...paymentMetrics(current,monthlyTotal)};
 });
 const monthly=c.bills.map((b,index)=>{
  const before=roundMoney(usesInvoice?current:b.before),after=roundMoney(b.after),payment=index<p.months?installment:0;
  const cash=roundMoney(after+maintenance),financed=roundMoney(cash+payment);
  return {index,month:b.month,calendarYear:b.calendarYear,before,after,payment,maintenance,cash,financed,fioB:roundMoney(b.grid),compensationTax:roundMoney(b.compensationTax),credit:b.credit,openingCredits:b.openingCredits,closingCredits:b.closingCredits,expiredCredits:b.expiredCredits,cashMetrics:paymentMetrics(before,cash),financedMetrics:paymentMetrics(before,financed)};
 });
 const range=(values:number[])=>({min:Math.min(...values),max:Math.max(...values)});
 const residualRange=range(monthly.map(m=>m.after)),paymentRange=range(monthly.map(m=>m.financed));
 const fiscal=projectExpenses(working),checks:string[]=[];
 if(p.consumptionScenario&&p.consumptionScenario!=='current')checks.push('Consumo futuro é uma hipótese do projeto; a diferença frente à fatura atual não representa economia para o mesmo consumo');
 if(!p.tariffConfirmed)checks.push('Tarifa integral, componente Fio B e enquadramento a conferir');
 if(unknownSelfUse)checks.push('Uso direto dos painéis ainda não conferido. Zero por ausência de dados não descreve o perfil real; confira uma hipótese ou informe a geração do inversor no mesmo ciclo');
 if(p.selfUseBasis?.confirmed)checks.push(`Uso direto: ${p.selfUseBasis.kind==='inverter'?'balanço de um ciclo do inversor extrapolado como hipótese':'hipótese informada'} · ${p.selfUseBasis.reference||'cenário'} · ${p.selfUseBasis.source}`);
 if(p.billingAdjustment)checks.push(`Ajuste entre medição e quantidade tarifada: fator ${p.billingAdjustment.factor.toFixed(6)} da referência ${p.billingAdjustment.reference}, ${p.billingAdjustment.confirmed?'conferido':'a conferir'}. Variações entre ciclos exigem revisão`);
 if(unknownCompensation)checks.push('Tributos/ajustes adicionais sobre compensação SCEE ainda não informados; não foram presumidos como zero');
 else if(p.compensationTax&&!p.compensationTax.confirmed)checks.push('Encargo SCEE por kWh é uma hipótese observada, ainda a conferir para o projeto');
 if(fiscal.pendingTaxes||!fiscal.confirmed)checks.push('Alíquotas e incidências dos tributos projetados a conferir');
 if(!p.hspConfirmed)checks.push('Geração, perdas e autoconsumo a validar na análise técnica');
 if(!p.costsConfirmed)checks.push('Custos de equipamentos, frete e serviços a cotar');
 if(p.referenceMode)checks.push('Cenário contratual: produção não medida; financiamento exibido é hipotético');
 if(bill?.readingDays&&bill.readingDays!==30)checks.push(`Fatura com ${bill.readingDays} dias; na base de última fatura o consumo do ciclo é repetido por mês, sem normalização diária`);
 if(bill?.reference&&Number(bill.reference.slice(-4))<p.startYear)checks.push(`Fatura histórica de ${bill.reference}: atualize tarifa integral, CIP e bandeira para o período da projeção`);
 if(p.billFileName&&!p.billReviewed)checks.push('Leitura da fatura a conferir');
 if(bill?.special)checks.push('Tarifa Social: benefícios e mínimo especial ainda não recalculados');
 if(usesInvoice&&Math.abs(current-c.before)>.02)checks.push('Reprodução tarifária difere da fatura; conciliar lançamentos');
 const fixed=p.lighting+p.otherFixed;
 let accumulated=-c.price,payback:number|null=null;
 const annual=c.annual.slice(1).map(a=>{
  const escalation=(1+p.inflation/100)**(a.year-1),before=usesInvoice?(Math.max(0,current-fixed)*escalation+fixed)*12:a.beforeCost;
  const cashRunning=a.afterCost+a.maintenance+a.replacement,saving=before-cashRunning,previous=accumulated;accumulated+=saving;
  if(payback===null&&accumulated>=0&&saving>0)payback=a.year-1+(-previous)/saving;
  const activePayments=Math.max(0,Math.min(12,p.months-(a.year-1)*12)),financing=installment*activePayments;
  return {year:a.year,calendarYear:a.calendarYear,before,cashRunning,financedRunning:cashRunning+financing,saving,financedSaving:saving-financing,payments:activePayments,accumulated};
 });
 const historicalCurrent=bill?bill.total:p.billTotal>0?p.billTotal:null;
 return {projectionInput:working,usesInvoice,canUseInvoice,current,historicalCurrent,historicalCash:historicalCurrent===null?null:paymentMetrics(historicalCurrent,cashTotal),historicalFinanced:historicalCurrent===null?null:paymentMetrics(historicalCurrent,financedTotal),baseConsumption:project.avgConsumption,projectedConsumption:c.projectedAverage,generation:project.monthlyGeneration,target:project.target,observedTotal:bill?.total??p.billTotal,observedNonRecurring:bill?.nonRecurring??0,reference:bill?.reference||p.billReference,
  consumption:usesInvoice?invoiceConsumption:c.projectedAverage,projectMode:p.projectMode,modules:project.modules,price:c.price,down:c.down,principal:c.principal,installment,totalFinanced:roundMoney(c.down+installment*p.months),months:p.months,interest:p.interest,financeFees:p.financeFees,
  after,maintenance,cashTotal,financedTotal,paymentPlusResidual:roundMoney(installment+after),financingOptions,cashSaving:cashMetrics.saving,financedSaving:financedMetrics.saving,cashMetrics,financedMetrics,interestScenarios,monthly,residualRange,paymentRange,fiscal,checks,needsReview:checks.length>0,afterPayoff:cashTotal,unknownFio,unknownCompensation,unknownSelfUse,partial,payback,annual,
  currentYear1:annual[0].before,cashYear1:annual[0].cashRunning,financedYear1:annual[0].financedRunning,cashYear1WithInitial:annual[0].cashRunning+c.price,financedYear1WithInitial:annual[0].financedRunning+c.down,
  decompositionDifference:usesInvoice?current-c.before:0};
}
