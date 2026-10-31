import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_INPUT} from '../lib/solar.ts';
import {parseBill} from '../lib/bill.ts';
import {clientBillSummary,withRelatedBills,attachComparisonBill} from '../lib/client-bill-summary.ts';

const before=parseBill('Titular: Cliente Fictício\nConta Contrato: 3000000000\nReferência: 08/2025\nConsumo (kWh)   1.000   1,000000   0,750000   0,00   0,00   1.000,00\nCip-Ilum Pub Pref Munic   50,00\nMulta   20,00\nTotal a pagar R$ 1.070,00');
const after=parseBill('Titular: Cliente Fictício\nConta Contrato: 3000000000\nReferência: 10/2026\nConsumo Compensado (kWh)   1.000   1,000000   0,750000   0,00   0,00   1.000,00\nEnergia Ativa Injetada (kWh)   1.000   1,000000   0,750000   0,00   0,00   -1.000,00\nParc. Inj. s/ Desc. - GD2 (kWh)   1.000   0,300000   0,237000   0,00   0,00   300,00\nBenefício Tarifário Bruto SCEE   0,00   100,00   600,00\nBenefício Tarifário Líquido SCEE   -500,00\nCip-Ilum Pub Pref Munic   50,00\nTotal a pagar R$ 450,00');
const input=(changes={})=>({...structuredClone(DEFAULT_INPUT),billReviewed:true,billAnalysis:before,billAnalyses:[before],...changes});

test('resumo real mantém Fio B, conta total e diferença histórica ao alterar a simulação',()=>{
 const p=input({solarComparison:{bill:after,fileName:'sintetica.pdf'}}),a=clientBillSummary(p);
 const b=clientBillSummary({...p,consumption:1600,target:2400,selfUse:0,fioB:.9,startMonth:10,analysisView:'projection'});
 assert.equal(a.complete,true);assert.equal(a.observed.fioB,300);assert.equal(a.observed.total,450);
 assert.equal(a.observed.scee,100);assert.equal(a.difference,620);assert.equal(a.recurringDifference,600);
 assert.deepEqual(a.observed,b.observed);assert.equal(a.sourceKey,b.sourceKey);
});

test('conta solar de outro rascunho da mesma unidade é reunida sem alterar a proposta salva',()=>{
 const p=input(),original=structuredClone(p);
 const linked=withRelatedBills(p,[input({billAnalysis:after,billAnalyses:[after]})]);
 assert.equal(clientBillSummary(linked).complete,true);assert.equal(clientBillSummary(linked).observed.total,450);
 assert.deepEqual(p,original);assert.equal(linked.tariff,p.tariff);assert.equal(linked.selfUse,p.selfUse);
 assert.equal(withRelatedBills(linked,[input({billAnalysis:after,billAnalyses:[after]})]),linked);
});

test('reunião de documentos não cruza outra unidade nem usa importação sem conferência',()=>{
 const p=input(),other=input({billAnalysis:{...after,accountCode:'3000000001'},billAnalyses:[]});
 assert.equal(withRelatedBills(p,[other]),p);
 assert.equal(withRelatedBills(p,[input({billReviewed:false,billAnalysis:after,billAnalyses:[after]})]),p);
 assert.equal(clientBillSummary(withRelatedBills(p,[other])).after,null);
});

test('documento ausente ou não conciliado não vira cobrança observada validada',()=>{
 const absent=clientBillSummary(input({consumption:1600,selfUse:0}));
 assert.equal(absent.hasDocuments,true);assert.equal(absent.observed,null);assert.equal(absent.difference,null);
 const invalid=clientBillSummary(input({billAnalyses:[before,{...after,total:451}]}));
 assert.equal(invalid.complete,false);assert.equal(invalid.observed,null);assert.equal(invalid.difference,null);
 assert.notEqual(absent.sourceKey,invalid.sourceKey);
});

test('quantia zero não é inventada quando a fatura não traz uma linha de Fio B',()=>{
 const noFio={...after,items:after.items.filter(i=>!/Uso da rede \/ Fio B/.test(i.label)),total:150,recurringTotal:150};
 const d=clientBillSummary(input({billAnalyses:[before,noFio]}));
 assert.equal(d.afterVerified,true);assert.equal(d.observed.fioB,null);assert.equal(d.observed.total,150);
});

test('histórico reunido respeita o limite de importação e conserva as duas bases da comparação',()=>{
 const p=input(),others=Array.from({length:12},(_,i)=>input({billAnalysis:{...after,reference:`${String(i+1).padStart(2,'0')}/2026`},billAnalyses:[]}));
 const linked=withRelatedBills(p,others),d=clientBillSummary(linked);
 assert.equal(linked.billAnalyses.length,12);assert.equal(d.before.reference,'08/2025');assert.equal(d.after.reference,'12/2026');
 assert.equal(p.billAnalyses.length,1);assert.equal(others.length,12);
});

test('identificadores ausentes ou sem dígitos não autorizam reunir dois clientes',()=>{
 const p=input({billAnalysis:{...before,accountCode:'desconhecida',consumerUnit:''},billAnalyses:[]});
 const other=input({billAnalysis:{...after,accountCode:'outra desconhecida',consumerUnit:''},billAnalyses:[]});
 assert.equal(withRelatedBills(p,[other]),p);
});

test('vínculo antigo de outra unidade não impede localizar a fatura correta do mesmo período',()=>{
 const p=input({solarComparison:{bill:{...after,accountCode:'3000000001'},fileName:'outra.pdf'}});
 const linked=withRelatedBills(p,[input({billAnalysis:after,billAnalyses:[after]})]);
 assert.equal(clientBillSummary(linked).observed.total,450);
 assert.equal(clientBillSummary(linked).complete,true);
});

test('importar outra fatura mantém o projeto atual e funciona nas duas ordens',()=>{
 const p=input({consumption:1600,target:2000,selfUse:35,projectMode:'new'}),original=structuredClone(p);
 const linked=attachComparisonBill(p,after,'depois-sintetica.pdf');
 assert.equal(linked.billAnalysis,p.billAnalysis);assert.equal(linked.consumption,1600);assert.equal(linked.target,2000);
 assert.equal(linked.selfUse,35);assert.equal(linked.projectMode,'new');assert.equal(clientBillSummary(linked).complete,true);
 assert.deepEqual(p,original);
 const reverse=attachComparisonBill(input({billAnalysis:after,billAnalyses:[after]}),before,'antes-sintetica.pdf');
 assert.equal(clientBillSummary(reverse).complete,true);assert.equal(reverse.billAnalysis,after);
 assert.throws(()=>attachComparisonBill(p,{...after,accountCode:'3000000001'},'outra.pdf'),/mesma conta/);
});
