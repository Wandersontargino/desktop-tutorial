import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_INPUT,calculate} from '../lib/solar.ts';
import {parseBill} from '../lib/bill.ts';
import {buildProjectFromBill} from '../lib/client-project.ts';
import {inputSchema} from '../lib/validation.ts';
import {measuredOperatingProfile,applyMeasuredOperatingProfile,explainChargeDifference,billingRateChecks} from '../lib/forecast-accuracy.ts';

const input=x=>({...structuredClone(DEFAULT_INPUT),...x});
function bill(reference,compensated=500,gd2=150,scee=50,lighting=50){
 const n=v=>Number(v).toFixed(2).replace('.',',');
 return parseBill(`Equatorial Pará\nTitular: Cliente fictício\nConta Contrato: 3000000000\nReferência: ${reference}\nConsumo Compensado (kWh)   ${compensated}   1,000000   0,750000   0,00   0,00   ${n(compensated)}\nEnergia Ativa Injetada (kWh)   ${compensated}   1,000000   0,750000   0,00   0,00   -${n(compensated)}\nParc. Inj. s/ Desc. - GD2 (kWh)   ${compensated}   0,300000   0,237000   0,00   0,00   ${n(gd2)}\nBenefício Tarifário Bruto SCEE   0,00   0,00   ${n(scee+100)}\nBenefício Tarifário Líquido SCEE   -100,00\nCip-Ilum Pub Pref Munic   ${n(lighting)}\nTotal a pagar R$ ${n(gd2+scee+lighting)}`);
}
function measured(){
 const specs=[['01/2026','01/01/2026','31/01/2026',100,90,90],['02/2026','31/01/2026','02/03/2026',900,450,200],['03/2026','02/03/2026','01/04/2026',1000,600,400]];
 const bills=specs.map(([ref,start,end,generation,injected,grid])=>({...bill(ref),previousReading:start,currentReading:end,readingDays:30,solar:{...bill(ref).solar,injected,gridConsumption:grid}}));
 const inverterReadings=specs.map(([reference,start,end,generationKwh])=>({reference,start,end,generationKwh,source:'Relatório sintético do ciclo',confirmed:true}));
 return input({billAnalysis:bills[0],billAnalyses:bills,inverterReadings});
}

test('perfil usa soma de kWh e dias; aplicar atualiza demanda e uso direto sem mudar a meta ou os dados originais',()=>{
 const p=measured(),before=structuredClone(p),r=measuredOperatingProfile(p);
 assert.equal(r.count,3);assert.equal(r.days,90);assert.equal(r.percent,43);
 assert.equal(r.monthlyConsumption,1550/90*(365/12));
 const q=applyMeasuredOperatingProfile(p);
 assert.equal(q.selfUse,43);assert.equal(q.consumptionScenario,'manual');assert.equal(q.futureConsumption,r.monthlyConsumption);
 assert.equal(calculate(q).target,calculate(p).target);assert.deepEqual(p,before);
 assert.equal(q.selfUseBasis.confirmed,true);assert.equal(inputSchema.safeParse(q).success,true);
});
test('leituras não confirmadas, duplicadas, fora do ciclo, de outra unidade ou sobrepostas não calibram perfil',()=>{
 const p=measured();
 assert.equal(measuredOperatingProfile({...p,inverterReadings:p.inverterReadings.map(r=>({...r,confirmed:false}))}).count,0);
 assert.equal(measuredOperatingProfile({...p,inverterReadings:[...p.inverterReadings,p.inverterReadings[0]]}).count,2);
 assert.equal(measuredOperatingProfile({...p,inverterReadings:p.inverterReadings.map(r=>({...r,start:'02/01/2026'}))}).count,0);
 const foreign={...p.billAnalyses[1],accountCode:'3000000001'};
 assert.equal(measuredOperatingProfile({...p,billAnalyses:[foreign,p.billAnalyses[2]]}).count,2);
 const overlapping={...p.billAnalyses[1],previousReading:'30/01/2026',currentReading:'01/03/2026'};
 const readings=p.inverterReadings.map(r=>r.reference===overlapping.reference?{...r,start:overlapping.previousReading,end:overlapping.currentReading}:r);
 assert.equal(measuredOperatingProfile({...p,billAnalyses:[p.billAnalyses[0],overlapping,p.billAnalyses[2]],inverterReadings:readings}).count,2);
 assert.throws(()=>applyMeasuredOperatingProfile({...p,inverterReadings:p.inverterReadings.slice(0,2)}));
 assert.throws(()=>applyMeasuredOperatingProfile({...p,systemType:'hybrid'}));
 assert.throws(()=>applyMeasuredOperatingProfile({...p,projectMode:'expansion'}));
});
test('decomposição separa volumes, tarifas e CIP e fecha a diferença sem calibrar pelo total',()=>{
 const b=bill('10/2026',900,270,90,40),f={total:290,compensated:600,fioB:180,scee:60,energy:0,lighting:50,flag:0,other:0};
 const x=explainChargeDifference(f,b);
 assert.equal(x.rows.find(r=>r.id==='quantity').amount,120);assert.equal(x.rows.find(r=>r.id==='rates').amount,0);
 assert.equal(x.rows.find(r=>r.id==='lighting').amount,-10);assert.equal(x.difference,110);
 assert.equal(x.rows.reduce((s,r)=>s+r.amount,0),x.difference);
 const y=explainChargeDifference({...f,compensated:0,fioB:0,scee:0,total:50},b);
 assert.ok(y.rows.every(r=>Number.isFinite(r.amount)));assert.equal(y.rows.find(r=>r.id==='compensation').amount,360);
});
test('validação de encargos usa só fatura anterior, quantidades conhecidas e percentual do ano',()=>{
 const a=bill('12/2025',500,100,50),b=bill('01/2026',1000,280,100),c=bill('02/2026',500,200,50);
 const p=input({billAnalysis:a,billAnalyses:[c,b]}),v=billingRateChecks(p);
 assert.equal(v.count,2);assert.equal(v.checks[0].source,'12/2025');assert.equal(v.checks[0].target,'01/2026');
 // 100/500 / 45% * 60% + 50/500, multiplied by known 1000 kWh.
 assert.equal(v.checks[0].predicted,366.67);assert.equal(v.checks[0].actual,380);
 assert.equal(v.checks[1].predicted,190);assert.equal(v.checks[1].actual,250);
 assert.equal(v.mae,36.67);assert.equal(v.maximum,60);
 const changedTarget={...c,items:c.items.map(i=>/Uso da rede/.test(i.label)?{...i,amount:i.amount+50}:i),total:c.total+50};
 assert.equal(billingRateChecks({...p,billAnalyses:[b,changedTarget]}).checks[1].predicted,v.checks[1].predicted);
 assert.equal(billingRateChecks({...p,billAnalyses:[b,{...c,accountCode:'3000000001'}]}).count,1);
});
test('nova importação mantém consumo atual ao aumentar geração; crescimento de demanda exige escolha explícita',()=>{
 const b=parseBill('Equatorial Pará\nTitular: Cliente fictício\nConta Contrato: 3000000000\nReferência: 08/2026\nConsumo (kWh)   1000   1,100000   0,900000   0,00   0,00   1100,00\nTotal a pagar R$ 1.100,00');
 const p=buildProjectFromBill(b,'','exemplo.pdf',{phone:'',email:'',city:'Ananindeua',useHistory:false,reservePct:30,criticalMonth:false,labor:110,margin:25,year:2026});
 assert.equal(p.consumptionScenario,'current');assert.equal(calculate(p).projectedAverage,1000);
 const larger={...p,reservePct:60};assert.equal(calculate(larger).target,1600);assert.equal(calculate(larger).projectedAverage,1000);
 assert.equal(calculate({...larger,consumptionScenario:'project'}).projectedAverage,1600);
});
