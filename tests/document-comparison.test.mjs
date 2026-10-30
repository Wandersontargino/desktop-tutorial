import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_INPUT} from '../lib/solar.ts';
import {parseBill} from '../lib/bill.ts';
import {documentComparison} from '../lib/document-comparison.ts';
import {projectSuggestion} from '../lib/project-suggestion.ts';
const before=parseBill('Titular: Cliente Fictício\nConta Contrato: 3000000000\nReferência: 08/2025\nConsumo (kWh)   1.000   1,000000   0,750000   0,00   0,00   1.000,00\nCip-Ilum Pub Pref Munic   50,00\nMulta   20,00\nTotal a pagar R$ 1.070,00');
const after=parseBill('Titular: Cliente Fictício\nConta Contrato: 3000000000\nReferência: 10/2026\nConsumo Compensado (kWh)   1.000   1,000000   0,750000   0,00   0,00   1.000,00\nEnergia Ativa Injetada (kWh)   1.000   1,000000   0,750000   0,00   0,00   -1.000,00\nParc. Inj. s/ Desc. - GD2 (kWh)   1.000   0,300000   0,237000   0,00   0,00   300,00\nCip-Ilum Pub Pref Munic   50,00\nTotal a pagar R$ 350,00');
const input=()=>({...structuredClone(DEFAULT_INPUT),reservePct:20,billAnalysis:before,solarComparison:{bill:after,fileName:'ficticia.pdf'},systemReference:{modules:20,moduleW:500,inverterKw:8,monthlyKwh:1200,investment:24000,source:'Contrato fictício',paymentTerms:'A conferir'}});
test('documentos mantêm total, eventuais e conta solar mesmo quando a hipótese de projeto muda',()=>{
 const p=input(),a=documentComparison(p),b=documentComparison({...p,consumption:2000,selfUse:0,tariff:2,fioB:1});
 assert.equal(a.complete,true);assert.equal(a.before.total,1070);assert.equal(a.before.recurringTotal,1050);assert.equal(a.after.total,350);assert.equal(a.difference,720);assert.equal(a.recurringDifference,700);assert.equal(b.conditional.residual,350);assert.equal(a.conditional.cash,360);assert.equal(a.price,24000);assert.deepEqual(a.terms,b.terms);
});
test('outra unidade ou documento não conciliado não gera diferença histórica validada',()=>{
 const p=input();assert.equal(documentComparison({...p,solarComparison:{bill:{...after,accountCode:'3000000001'},fileName:'outra.pdf'}}).after,null);
 assert.equal(documentComparison({...p,solarComparison:{bill:{...after,total:351},fileName:'incompleta.pdf'}}).complete,false);
});
test('sugestão de 1000 kWh com reserva de 20% resulta em 1200 sem transformar meta em consumo',()=>{
 const p=input(),s=projectSuggestion(p);assert.equal(s.baseMonthlyKwh,1000);assert.equal(s.monthlyKwh,1200);assert.equal(p.consumption,1000);assert.equal(p.systemReference.monthlyKwh,1200);
 const other=projectSuggestion({...p,generationSuggestion:{baseMonthlyKwh:1500,reservePct:10,monthlyKwh:1650,source:'Novas cargas informadas'}});assert.equal(other.monthlyKwh,1650);assert.equal(other.manual,true);
});
test('fatura só com solar não permite inferir demanda total ou sugestão a partir do consumo da rede',()=>{
 const p={...input(),billAnalysis:after,solarComparison:null};assert.equal(projectSuggestion(p).monthlyKwh,null);
});
test('sugestão pelo pico usa a margem sobre o maior mês disponível e identifica a amostra',()=>{
 const p=input();p.billAnalysis={...before,history:[{period:'07/2025',kwh:1000},{period:'08/2025',kwh:1500}]};
 const s=projectSuggestion(p,'peak');assert.equal(s.baseMonthlyKwh,1500);assert.equal(s.monthlyKwh,1800);assert.match(s.source,/Pico de 2 meses/);assert.match(s.source,/parcial/);
});
