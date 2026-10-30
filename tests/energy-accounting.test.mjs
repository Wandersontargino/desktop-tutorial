import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_INPUT,monthlyBill,calculate} from '../lib/solar.ts';
import {parseBill} from '../lib/bill.ts';
import {reproduceInvoice} from '../lib/bill-reconciliation.ts';
import {inverterBalance,applyInverterProfile,invoiceSeries,mergeBillStudy,applyBillingFactor} from '../lib/energy-accounting.ts';
import {financialComparison} from '../lib/financial-comparison.ts';
import {inputSchema} from '../lib/validation.ts';
const input=(x={})=>({...structuredClone(DEFAULT_INPUT),...x});
const text=`Equatorial Pará
Titular: Cliente fictício
Conta Contrato: 3000000000
Referência: 09/2026
Consumo Compensado (kWh)   880   1,000000   0,750000   0,00   0,00   880,00
Energia Ativa Injetada (kWh)   880   1,000000   0,750000   0,00   0,00   -880,00
Parc. Inj. s/ Desc. - GD2 (kWh)   880   0,300000   0,237000   0,00   0,00   264,00
Benefício Tarifário Bruto SCEE   0,00   100,00   600,00
Benefício Tarifário Líquido SCEE   -500,00
Cip-Ilum Pub Pref Munic   50,00
Correção Monetária                   0,25       U                  721
saldo de créditos expirados no
ciclo ref 09/26: 0,00 kWh
Total a pagar R$ 414,25`;
const bill=()=>({...parseBill(text),measuredKwh:900,quantityKwh:880,previousReading:'01/09/2026',currentReading:'01/10/2026',solar:{...parseBill(text).solar,gridConsumption:900,injected:700,currentBalance:300}});
test('coluna lateral do histórico não vira correção e competência impressa vence nome do arquivo',()=>{
 const b=parseBill(text,'fatura 10-2026.pdf');assert.equal(b.items.find(i=>i.label==='Correção monetária').amount,.25);
 assert.equal(reproduceInvoice(b).complete,true);assert.equal(b.solar.expiredCredits,0);assert.equal(b.reference,'09/2026');assert.ok(b.notes.some(n=>n.includes('competência impressa')));
});
test('balanço exige o mesmo ciclo e geração do inversor, sem inferir uso direto da fatura',()=>{
 const b=bill(),r={reference:b.reference,start:b.previousReading,end:b.currentReading,generationKwh:1200,source:'Relatório sintético',confirmed:true};
 assert.equal(inverterBalance(b,undefined).valid,false);assert.equal(inverterBalance(b,{...r,start:'02/09/2026'}).valid,false);assert.equal(inverterBalance(b,{...r,generationKwh:600}).valid,false);
 const x=inverterBalance(b,r);assert.equal(x.direct,500);assert.equal(x.totalConsumption,1400);assert.equal(x.percentOfGeneration,500/1200*100);assert.equal(x.percentOfLoad,500/1400*100);
 const p=input({billAnalysis:b,inverterReadings:[r]}),next=applyInverterProfile(p,b);
 assert.equal(next.selfUse,x.percentOfGeneration);assert.equal(next.selfUseBasis.kind,'inverter');assert.equal(next.selfUseBasis.confirmed,true);assert.equal(p.selfUse,35);
 assert.throws(()=>applyInverterProfile({...p,systemType:'hybrid'},b));assert.throws(()=>applyInverterProfile({...p,inverterReadings:[{...r,confirmed:false}]},b));
});
test('zero sem fonte mantém estimativa pendente; hipótese explicitamente conferida libera apenas essa pendência',()=>{
 const p=input({billAnalysis:bill(),billFileName:'exemplo.pdf',selfUse:0,tariffConfirmed:true,compensationTax:{perKwh:0,source:'Sem encargo neste exemplo',reference:'Manual',confirmed:true}});
 assert.equal(financialComparison(p).unknownSelfUse,true);assert.equal(financialComparison(p).partial,true);
 const q={...p,selfUseBasis:{kind:'assumption',percent:0,source:'Carga inteiramente sem simultaneidade no cenário de teste',reference:'Hipótese',confirmed:true}};
 assert.equal(financialComparison(q).unknownSelfUse,false);assert.equal(financialComparison(q).partial,false);assert.equal(financialComparison({...q,selfUse:20}).unknownSelfUse,true);assert.equal(inputSchema.safeParse({...q,selfUse:20}).success,false);
});
test('ajuste tarifado não reduz fisicamente o consumo e não reaplica desconto à base já tarifada',()=>{
 const p=input({consumption:1000,selfUse:20,tariff:1,fioB:.5,lighting:0,phase:30,billingAdjustment:{factor:.98,reference:'Exemplo',source:'Relação sintética',confirmed:true}}),m=monthlyBill(1000,1200,p,2026);
 assert.equal(m.direct,240);assert.equal(m.imported,760);assert.equal(m.billableImported,744.8);assert.ok(Math.abs(m.meterAdjustmentKwh-15.2)<1e-8);assert.equal(m.credit,744.8);assert.equal(m.grid,744.8*.5*.6);assert.equal(m.direct+m.imported,1000);
 const b={...bill(),hasSolar:false,solar:undefined,consumption:900,quantityKwh:880,recurringTotal:930};
 const x=financialComparison({...p,billAnalysis:b,comparisonBasis:'invoice',consumptionScenario:'current'});assert.equal(x.projectionInput.billingAdjustment,null);assert.equal(x.projectionInput.consumption,880);
 const calibrated=applyBillingFactor({...p,billAnalysis:bill()},bill());assert.equal(calibrated.billingAdjustment.factor,880/900);assert.equal(calibrated.billingAdjustment.confirmed,false);
});
test('créditos de ciclos consecutivos conciliam sem preencher os meses ausentes ou misturar unidades',()=>{
 const a=bill(),b={...bill(),reference:'10/2026',solar:{...bill().solar,injected:900,compensated:880,currentBalance:320}},c={...bill(),reference:'11/2026',solar:{...bill().solar,injected:850,compensated:880,currentBalance:290}};
 const p=mergeBillStudy(input({billAnalysis:a}),[b,c]),rows=invoiceSeries(p);
 assert.equal(rows.length,3);assert.equal(rows[0].bankDifference,null);assert.equal(rows[1].bankDifference,0);assert.equal(rows[2].bankDifference,0);
 assert.equal(mergeBillStudy(p,[c]).billAnalyses.length,3);assert.throws(()=>mergeBillStudy(p,[{...c,accountCode:'outra-conta'}]));assert.throws(()=>mergeBillStudy(p,[{...c,total:500}]));
 const gap=invoiceSeries(input({billAnalysis:a,billAnalyses:[c]}));assert.equal(gap[1].bankDifference,null);
});
