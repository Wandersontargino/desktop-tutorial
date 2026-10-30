import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_INPUT,calculate,monthlyBill} from '../lib/solar.ts';
import {technicalAreaEstimate} from '../lib/technical-area.ts';
import {art2026Estimate} from '../lib/technical-costs.ts';
import {clientSafeProject} from '../lib/admin-privacy.ts';
import {financialComparison} from '../lib/financial-comparison.ts';
import {inputSchema} from '../lib/validation.ts';
import {parseBill} from '../lib/bill.ts';
import {projectSuggestion,applyProjectSuggestion} from '../lib/project-suggestion.ts';
import {financialReference} from '../lib/financial-reference.ts';
import {quoteProject} from '../lib/suppliers.ts';
const input=(x={})=>({...structuredClone(DEFAULT_INPUT),...x});
test('consumo futuro da meta altera a compensação, sem cobrar Fio B da geração não utilizada',()=>{
 const p=input({consumption:398,reservePct:30,consumptionScenario:'project',selfUse:0}),c=calculate(p);
 assert.ok(Math.abs(c.target-517.4)<1e-8);assert.equal(c.avgConsumption,398);assert.ok(Math.abs(c.projectedAverage-517.4)<1e-8);
 const current=calculate({...p,consumptionScenario:'current'});assert.ok(c.bills.reduce((s,b)=>s+b.grid,0)>current.bills.reduce((s,b)=>s+b.grid,0));
 const enormous=monthlyBill(398,10000,p,2026);assert.ok(enormous.credit<=398);assert.equal(enormous.grid,enormous.credit*p.fioB*.6);assert.ok(enormous.closingCredits>9000);
});
test('a fatura histórica não substitui consumo futuro escolhido na projeção',()=>{
 const bill=parseBill('Titular: Cliente fictício\nConsumo: 398 kWh\nTotal a pagar R$ 454,63');
 const p=input({billAnalysis:bill,consumption:398,consumptionScenario:'project',reservePct:30}),x=financialComparison(p,'invoice');
 assert.equal(x.usesInvoice,false);assert.equal(x.historicalCurrent,454.63);assert.ok(Math.abs(x.consumption-517.4)<1e-8);assert.equal(x.after,Math.round(calculate(p).after*100)/100);
 assert.equal(x.historicalCash.saving,Math.round((454.63-x.cashTotal)*100)/100);
});
test('última fatura, média parcial e pico são opções diferentes, com margem livre',()=>{
 const bill=parseBill('Titular: Cliente fictício\nConsumo: 398 kWh\nTotal a pagar R$ 454,63');bill.history=[{period:'2026-08',kwh:300},{period:'2026-09',kwh:500},{period:'2026-10',kwh:398}];
 const p=input({billAnalysis:bill,reservePct:30});assert.equal(projectSuggestion(p,'last').monthlyKwh,517.4);assert.equal(projectSuggestion(p,'peak').monthlyKwh,650);assert.equal(projectSuggestion(p,'average').baseMonthlyKwh,1198/3);assert.match(projectSuggestion(p,'average').source,/parcial/);assert.equal(projectSuggestion({...p,reservePct:0},'last').monthlyKwh,398);
});
test('área técnica soma reserva e admite área zero sem concluir viabilidade executiva',()=>{
 const p=input({technicalArea:{lengthM:2,widthM:1,allowancePct:25,availableM2:24,source:'Ficha do módulo'}}),a=technicalAreaEstimate(p,10);
 assert.equal(a.moduleArea,20);assert.equal(a.requiredM2,25);assert.equal(a.fits,false);assert.equal(a.maxModules,9);assert.equal(a.shortageM2,1);assert.equal(technicalAreaEstimate({...p,technicalArea:{...p.technicalArea,availableM2:0}},10).maxModules,0);assert.equal(technicalAreaEstimate(input(),10).fits,null);
});
test('engenharia, taxas e materiais adicionais entram uma vez no custo e no preço',()=>{
 const base=input(),original=calculate(base),fee={id:'art',name:'ART',amount:285.59,includedInEngineering:false,source:'Confea',confirmed:true},material={id:'cc',description:'Cabo CC',specification:'Conforme executivo',quantity:20,unit:'m',unitCost:5,includedInBase:false};
 const p={...base,technicalFees:[fee],materials:[material]},c=calculate(p);assert.ok(Math.abs(c.cost-original.cost-385.59)<1e-8);assert.ok(c.price>original.price);
 assert.equal(calculate({...p,technicalFees:[{...fee,includedInEngineering:true}],materials:[{...material,includedInBase:true}]}).cost,original.cost);
 assert.equal(inputSchema.safeParse({...p,engineering:200,technicalFees:[{...fee,includedInEngineering:true}]}).success,false);
 assert.equal(art2026Estimate(15000),108.39);assert.equal(art2026Estimate(15000.01),285.59);
});
test('apresentação mantém preço e especificações, removendo área interna e preços de compra',()=>{
 const p=input({consumptionScenario:'project',technicalArea:{lengthM:2,widthM:1,allowancePct:25,availableM2:100,source:'Levantamento privado'},technicalFees:[{id:'e',name:'Honorários',amount:350,includedInEngineering:false,source:'Privado',confirmed:true}],materials:[{id:'cc',description:'Cabo CC',specification:'6 mm² · especificação de teste',quantity:20,unit:'m',unitCost:5,includedInBase:false}]});
 const safe=clientSafeProject(p);assert.equal(safe.technicalArea,null);assert.equal(safe.technicalFees,null);assert.equal(safe.materials[0].unitCost,null);assert.equal(safe.materials[0].specification,p.materials[0].specification);assert.equal(calculate(safe).price,calculate(p).price);assert.equal(calculate(safe).after,calculate(p).after);
});
test('média monetária sem 12 faturas é estimativa identificada, e pico significa maior mês',()=>{
 const b=parseBill('Titular: Cliente fictício\nConta Contrato: 1234567890\nReferência: 10/2026\nConsumo: 398 kWh\nTotal a pagar R$ 454,63');b.history=[{period:'2026-08',kwh:300},{period:'2026-09',kwh:500},{period:'2026-10',kwh:398}];
 const p=input({billAnalysis:b,tariff:1,lighting:50,otherFixed:0}),current=financialReference(p),mean=financialReference({...p,referenceBasis:'average'}),peak=financialReference({...p,referenceBasis:'peak'});
 assert.equal(current.amount,454.63);assert.equal(current.estimated,false);assert.equal(mean.estimated,true);assert.match(mean.label,/parcial/);assert.match(mean.source,/não é média monetária comprovada/);assert.equal(peak.kwh,500);assert.equal(peak.amount,550);assert.match(peak.label,/2026-09/);
});
test('cotação estruturada transfere especificações e mantém custos adicionais sem duplicar o kit',()=>{
 const material={id:'dc',description:'Cabo CC',specification:'Especificação fornecida na cotação',quantity:20,unit:'m',unitCost:5,includedInBase:true};
 const q={supplier:'Exemplo',name:'Kit',modules:8,moduleW:610,inverterKw:5,cost:8000,freight:300,date:'2026-10-30',note:'',example:false,systemType:'on-grid',materials:[material]};
 const p=quoteProject(input(),q);assert.deepEqual(p.materials,[material]);assert.equal(p.systemType,'on-grid');assert.equal(p.costsConfirmed,false);assert.equal(calculate(p).equipment,8000);
});

test('projeto de 600 kWh compara a conta histórica de 398 sem usar 398 no Fio B futuro',()=>{
 const b=parseBill('Titular: Cliente fictício\nReferência: 10/2026\nConsumo: 398 kWh\nTotal a pagar R$ 454,63');
 const p=input({billAnalysis:b,consumption:398,autoTarget:false,target:600,consumptionScenario:'project',selfUse:20,compensationTax:{perKwh:.1,source:'Hipótese de teste',reference:'10/2026',confirmed:true}}),c=calculate(p),x=financialComparison(p);
 assert.equal(x.historicalCurrent,454.63);assert.equal(x.projectedConsumption,600);assert.equal(x.usesInvoice,false);
 assert.ok(x.monthly.reduce((s,m)=>s+m.fioB,0)>financialComparison({...p,consumptionScenario:'current',comparisonBasis:'annual'}).monthly.reduce((s,m)=>s+m.fioB,0));
 for(const bill of c.bills){assert.ok(bill.credit<=600);assert.ok(Math.abs(bill.imported+bill.direct-600)<1e-8);}
 assert.equal(calculate(x.projectionInput).after,c.after);
});

test('aplicar nova sugestão redimensiona kit proporcionalmente e exige nova cotação',()=>{
 const p=input({pricing:'kit',kitCost:20000,consumption:1000,consumptionScenario:'project',autoTarget:false,target:1300,costsConfirmed:true});
 const next=applyProjectSuggestion(p,{baseMonthlyKwh:398,monthlyKwh:600,reservePct:30,source:'Meta manual de teste'});
 assert.equal(next.kitCost,p.kitCost*calculate(next).modules/calculate(p).modules);
 assert.equal(next.costsConfirmed,false);assert.equal(next.referenceMode,false);assert.equal(calculate(next).projectedAverage,600);
 assert.ok(calculate(next).price<calculate(p).price);assert.equal(p.kitCost,20000);
});
