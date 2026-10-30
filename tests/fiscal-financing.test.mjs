import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_INPUT,calculate} from '../lib/solar.ts';
import {parseBill} from '../lib/bill.ts';
import {fiscalConfig,componentTaxes,invoiceExpenses,projectExpenses,recurringCharges,roundMoney} from '../lib/fiscal.ts';
import {financialComparison} from '../lib/financial-comparison.ts';
import {inputSchema} from '../lib/validation.ts';
import {calculateFinancing,FINANCING_TERMS} from '../lib/financing.ts';
const input=(changes={})=>({...structuredClone(DEFAULT_INPUT),...changes});
const settings=()=>{const f=fiscalConfig(input());f.taxes.ICMS.rate=19;f.taxes.PIS.rate=1;f.taxes.COFINS.rate=4;return f;};
const charge=(component,gross)=>({id:component,label:component,component,gross,formula:''});
test('tributos da fatura preservam base, alíquota e valor, sem somá-los aos lançamentos',()=>{
 const b=parseBill('Titular: Empresa fictícia\nConsumo: 1000 kWh\nTotal a pagar R$ 1.130,00\nIluminação pública R$ 130,00\nICMS 1.000,00 19,0000 190,00\nPIS 810,00 1,0000 8,10\nCOFINS 810,00 4,0000 32,40');b.items=[{label:'Energia bruta',amount:1000,category:'energy',recurring:true},{label:'CIP',amount:130,category:'fixed',recurring:true}];
 const x=invoiceExpenses(b);assert.equal(x.total,1130);assert.equal(x.itemsTotal,1130);assert.equal(x.difference,0);assert.equal(x.embeddedTaxes,230.50);assert.equal(x.taxes[0].base,1000);assert.equal(x.taxes[1].base,810);
});
test('tributo ausente e cobrança não conciliada permanecem pendentes',()=>{
 const b=parseBill('Titular: Empresa fictícia\nConsumo: 1000 kWh\nTotal a pagar R$ 1.100,00');b.items=[{label:'Energia',amount:1000,category:'energy',recurring:true}];const x=invoiceExpenses(b);assert.equal(x.difference,100);assert.equal(x.taxes[0].amount,null);assert.deepEqual(x.missingTaxes,['ICMS','PIS','COFINS']);
});
test('PIS/COFINS excluem o ICMS quando selecionado; impostos são conteúdo da tarifa bruta',()=>{
 const f=settings(),rows=componentTaxes([charge('energy',1000)],f);assert.deepEqual(rows.map(r=>[r.name,r.base,r.amount]),[['ICMS',1000,190],['PIS',810,8.1],['COFINS',810,32.4]]);
 f.excludeIcmsFromFederal=false;const same=componentTaxes([charge('energy',1000)],f);assert.equal(same[1].amount,10);assert.equal(same[2].amount,40);
});
test('isenção explícita não se confunde com incidência desconhecida de Fio B',()=>{
 const f=settings();let rows=componentTaxes([charge('fioB',100)],f);assert.equal(rows[0].amount,null);assert.ok(rows[0].pending.length);
 for(const name of ['ICMS','PIS','COFINS'])f.taxes[name].incidence.fioB=false;rows=componentTaxes([charge('fioB',100)],f);assert.deepEqual(rows.map(r=>r.amount),[0,0,0]);
 f.taxes.PIS.incidence.fioB=true;rows=componentTaxes([charge('fioB',100)],f);assert.equal(rows[1].amount,1);
});
test('todas as parcelas fiscais conciliam com o total do projeto e não alteram a conta duas vezes',()=>{
 const p=input({fiscal:settings(),fioB:0,tariff:1.2,phase:100,lighting:130,otherFixed:25,recurringCharges:[{id:'flag',label:'Bandeira',amount:25,kind:'flag'}]});const c=calculate(p),x=projectExpenses(p);
 assert.equal(x.total,roundMoney(c.after));assert.equal(roundMoney(x.net+x.knownTaxes+x.lighting+x.adjustment),x.total);assert.ok(x.knownTaxes>0);assert.equal(x.pendingTaxes,false);
 for(let month=0;month<12;month++){const r=projectExpenses(p,month);assert.equal(roundMoney(r.net+r.knownTaxes+r.lighting+r.adjustment),r.total);}
 const different=projectExpenses({...p,fiscal:{...p.fiscal,taxes:{...p.fiscal.taxes,ICMS:{...p.fiscal.taxes.ICMS,rate:18}}}});assert.equal(different.total,x.total);assert.notEqual(different.knownTaxes,x.knownTaxes);
});
test('ano futuro aplica reajuste e degradação e mantém CIP e encargos fixos explícitos',()=>{
 const p=input({fiscal:settings(),fioB:0,consumption:2000,manualModules:8,lighting:100,otherFixed:25}),first=projectExpenses(p,-2,0),later=projectExpenses(p,-2,4);
 assert.equal(later.year,p.startYear+4);assert.equal(first.lighting,1200);assert.equal(later.lighting,1200);assert.ok(later.total>first.total);assert.equal(later.tariff,p.tariff*1.04**4);
});
test('despesa recorrente de valor zero pode ser criada e depois preenchida',()=>{
 const p=input({otherFixed:0,recurringCharges:[{id:'x',label:'Nova despesa',amount:0,kind:'other'}]});assert.equal(recurringCharges(p).length,1);
 const next={...p,otherFixed:30,recurringCharges:[{id:'x',label:'Seguro informado',amount:30,kind:'other'}]};assert.equal(recurringCharges(next)[0].amount,30);assert.equal(projectExpenses(next).charges.find(c=>c.id==='x').gross,30);
});
test('somatório impossível de alíquotas é rejeitado e não produz imposto negativo',()=>{
 const f=settings();f.taxes.ICMS.rate=95;f.taxes.PIS.rate=10;const p=input({fiscal:f});assert.equal(inputSchema.safeParse(p).success,false);assert.ok(componentTaxes([charge('energy',1000)],f).every(t=>t.amount===null));
});
test('comparação à vista e financiada separa conta, manutenção, entrada e prestação',()=>{
 const p=input({client:'Empresa fictícia',billAnalysis:null,interest:0,months:60,downPayment:1000}),x=financialComparison(p,'annual');assert.ok(Math.abs(x.cashTotal-x.after-x.maintenance)<1e-8);assert.ok(Math.abs(x.financedTotal-x.cashTotal-x.installment)<1e-8);assert.ok(Math.abs(x.cashSaving-(x.current-x.cashTotal))<.005);assert.ok(Math.abs(x.financedSaving-(x.current-x.financedTotal))<.005);assert.equal(roundMoney(x.after+x.maintenance+x.installment),x.financedTotal);assert.equal(roundMoney(x.down+x.installment*x.months),x.totalFinanced);assert.equal(x.cashYear1WithInitial,x.cashYear1+x.price);assert.equal(x.financedYear1WithInitial,x.financedYear1+x.down);assert.equal(x.afterPayoff,x.cashTotal);
});
test('última fatura já com solar é a base observada; o sistema dimensionado fica fixo',()=>{
 const bill=parseBill('Titular: Cliente fictício\nConsumo: 1000 kWh\nTotal a pagar R$ 860,00\nMulta 10,00');bill.recurringTotal=850;bill.nonRecurring=10;bill.hasSolar=true;bill.solar={gridConsumption:2000,injected:1000,compensated:1000,billedConsumption:1000,compensationDebit:900,injectionCredit:-900,currentBalance:null,expiredCredits:0,history:[],meterReadings:[]};
 const p=input({billAnalysis:bill,billFileName:'ficticia.pdf',billReviewed:true,projectMode:'expansion',consumption:1600,fioB:0}),c=calculate(p),x=financialComparison(p,'invoice');assert.equal(x.current,850);assert.equal(x.observedTotal,860);assert.equal(x.observedNonRecurring,10);assert.equal(x.consumption,1000);assert.equal(x.modules,c.modules);assert.equal(x.price,c.price);assert.equal(x.unknownFio,true);assert.equal(financialComparison(p,'annual').current,roundMoney(c.before));
});
test('prazo menor que um ano conta apenas as parcelas devidas e evidencia caixa mensal negativo',()=>{
 const p=input({months:6,interest:0,downPayment:0}),x=financialComparison(p,'annual');assert.equal(x.annual[0].payments,6);assert.equal(x.annual[1].payments,0);assert.ok(Math.abs(x.financedYear1-x.cashYear1-x.installment*6)<1e-7);assert.ok(x.financedSaving<0);
});
test('novo projeto começa em 84 parcelas e a faixa de simulação aceita até 84 meses inteiros',()=>{
 assert.equal(DEFAULT_INPUT.months,84);assert.equal(inputSchema.safeParse(input({months:84})).success,true);
 for(const months of [0,84.5,85])assert.equal(inputSchema.safeParse(input({months})).success,false);
});
test('comparação de prazos mantém o sistema e separa parcela, resíduo, manutenção e total do crédito',()=>{
 const p=input({months:84,downPayment:2000,financeFees:250}),x=financialComparison(p,'annual');
 assert.deepEqual(x.financingOptions.map(o=>o.months),[...FINANCING_TERMS]);
 for(const o of x.financingOptions){assert.equal(o.after,x.after);assert.equal(o.maintenance,x.maintenance);assert.equal(o.down,x.down);assert.equal(o.principal,x.principal);assert.equal(o.paymentPlusResidual,roundMoney(o.installment+o.after));assert.equal(o.monthlyTotal,roundMoney(o.paymentPlusResidual+o.maintenance));assert.equal(o.saving,roundMoney(x.current-o.monthlyTotal));assert.equal(o.totalFinanced,roundMoney(o.down+o.installment*o.months));}
 const chosen=x.financingOptions.at(-1);assert.equal(chosen.installment,x.installment);assert.equal(chosen.monthlyTotal,x.financedTotal);assert.equal(chosen.paymentPlusResidual,x.paymentPlusResidual);
 assert.ok(chosen.installment<x.financingOptions[0].installment);assert.ok(chosen.totalFinanced>x.financingOptions[0].totalFinanced);
 assert.equal(x.annual[6].payments,12);assert.equal(x.annual[7].payments,0);
});
test('prazo personalizado permanece na comparação e quitar o projeto zera a prestação sem remover o resíduo',()=>{
 const p=input({months:18,interest:0,downPayment:1e9,financeFees:0}),x=financialComparison(p,'annual');
 assert.ok(x.financingOptions.some(o=>o.months===18));assert.ok(x.financingOptions.every(o=>o.installment===0&&o.paymentPlusResidual===x.after&&o.monthlyTotal===x.cashTotal));
 const loan=calculateFinancing(8400,0,84,0,0);assert.equal(loan.installment,100);assert.equal(loan.totalFinanced,8400);
});
test('correção, parcelamento e serviços adicionais identificados são destacados na leitura',()=>{
 const b=parseBill('Titular: Empresa fictícia\nConsumo: 1000 kWh\nTotal a pagar R$ 1.100,00\nCorreção Monetária  2,50\nParcelamento de débitos  30,00\nSeguro  5,00');assert.equal(b.items.find(i=>i.label==='Correção monetária').amount,2.5);assert.equal(b.items.find(i=>i.label==='Parcelamento de débitos').recurring,false);assert.equal(b.items.find(i=>i.label==='Seguro / serviço agregado').amount,5);assert.equal(b.nonRecurring,32.5);
});
