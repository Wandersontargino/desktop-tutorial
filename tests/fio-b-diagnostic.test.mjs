import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_INPUT,calculate} from '../lib/solar.ts';
import {parseBill} from '../lib/bill.ts';
import {fioBDiagnostic} from '../lib/fio-b-diagnostic.ts';
import {projectSuggestionStatus,applyProjectSuggestion} from '../lib/project-suggestion.ts';
const input=(changes={})=>({...structuredClone(DEFAULT_INPUT),...changes});
const solar=`Equatorial Pará
Titular: Cliente fictício
Conta Contrato: 3000000000
Referência: 10/2026
Consumo Compensado (kWh)   1.000   1,000000   0,750000   0,00   0,00   1.000,00
Energia Ativa Injetada (kWh)   1.000   1,000000   0,750000   0,00   0,00   -1.000,00
Parc. Inj. s/ Desc. - GD2 (kWh)   1.000   0,300000   0,237000   0,00   0,00   300,00
Benefício Tarifário Bruto SCEE   0,00   100,00   600,00
Benefício Tarifário Líquido SCEE   -500,00
Cip-Ilum Pub Pref Munic   50,00
Total a pagar R$ 450,00`;

test('memória expõe dois meses a 60% e dez a 75%, sem confundir média com uma fatura',()=>{
 const p=input({consumption:1000,selfUse:0,fioB:.4,startYear:2026,startMonth:10,manualModules:40});
 const d=fioBDiagnostic(p);
 assert.equal(d.period,'Nov/2026 a Out/2027');
 assert.deepEqual(d.years.map(y=>[y.year,y.months,y.factor]),[[2026,2,.6],[2027,10,.75]]);
 assert.equal(d.compensated,1000);assert.equal(d.average,290);
 assert.equal(d.rows[0].amount,240);assert.equal(d.rows[2].amount,300);
 assert.equal(d.rows.reduce((s,r)=>s+r.amount,0)/12,d.average);
});
test('comparação isola a tarifa na quantidade e no ano observados, sem calibrar consumo ou geração',()=>{
 const bill=parseBill(solar),p=input({billAnalysis:bill,consumption:1500,selfUse:0,fioB:.4,manualModules:40,startMonth:10});
 const before=structuredClone(p),d=fioBDiagnostic(p);
 assert.equal(d.observed.amount,300);assert.equal(d.observed.compensated,1000);assert.equal(d.observed.rate,.3);
 assert.equal(d.observed.configuredAmount,240);assert.equal(d.compensated,1500);
 assert.deepEqual(p,before);
 assert.equal(fioBDiagnostic({...p,billAnalysis:{...bill,accountCode:'outra-conta'},solarComparison:{bill,fileName:'exemplo.pdf'}}).observed,null);
});
test('autoconsumo e excedente alteram os kWh da memória; a meta não vira cobrança por si só',()=>{
 const p=input({consumption:600,consumptionScenario:'current',target:1000,autoTarget:false,selfUse:0,manualModules:30});
 assert.equal(fioBDiagnostic(p).compensated,600);
 const direct=fioBDiagnostic({...p,selfUse:20});assert.ok(direct.compensated<600);
 assert.equal(direct.average,direct.rows.reduce((s,r)=>s+r.amount,0)/12);
});
test('sugestão pendente não se apresenta como meta ativa; aplicar atualiza o cálculo',()=>{
 const p=input({consumption:900,autoTarget:true,reservePct:30,criticalMonth:true,generationSuggestion:{baseMonthlyKwh:900,reservePct:30,monthlyKwh:1400,source:'Exemplo'}});
 const draft=projectSuggestionStatus(p);assert.equal(draft.pending,true);assert.equal(draft.active.target,1170);assert.equal(draft.suggestion.monthlyKwh,1400);
 const applied=applyProjectSuggestion(p,p.generationSuggestion),status=projectSuggestionStatus(applied);
 assert.equal(status.pending,false);assert.equal(status.active.target,1400);
 assert.ok(calculate(applied).monthlyGeneration>1400); // Worst-month sizing is deliberately above the annual target.
 assert.equal(calculate(p).target,1170);
});
