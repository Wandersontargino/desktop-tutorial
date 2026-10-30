import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_INPUT,calculate,monthlyBill,fioFactor,loadConsumption,reserveScenario} from '../lib/solar.ts';
import {inputSchema} from '../lib/validation.ts';
import {parseBill,brNumber} from '../lib/bill.ts';
const input=(changes={})=>({...structuredClone(DEFAULT_INPUT),...changes});
test('1000 kWh com reserva de 20% exige meta de 1200 e módulos adicionais',()=>{
 const base=calculate(input({reservePct:0})),reserve=calculate(input({reservePct:20}));
 assert.equal(reserve.target,1200);assert.equal(base.target,1000);
 assert.ok(reserve.modules>base.modules);assert.ok(reserve.monthlyGeneration>=1200);
 assert.equal(reserve.extraModules,reserve.modules-base.modules);
 assert.ok(reserve.price>base.price);
});
test('o número de módulos é o menor inteiro capaz de atingir a meta anual',()=>{
 const p=input(),c=calculate(p),less=calculate({...p,manualModules:c.modules-1});
 assert.ok(c.monthlyGeneration>=c.target);assert.ok(less.monthlyGeneration<c.target);
});
test('critério do mês crítico atende o consumo com reserva em cada mês',()=>{
 const p=input({criticalMonth:true,reservePct:20,detailedConsumption:true,monthlyConsumption:[1000,1500,1100,900,1000,1000,1100,1400,900,1000,1000,1200]}),c=calculate(p);
 c.consumption.forEach((v,i)=>assert.ok(c.generation[i]>=v*1.2));
});
test('Fio B aplica apenas percentual sobre kWh compensados e componente Fio B',()=>{
 const p=input({tariff:1,fioB:.3,phase:30,lighting:40,selfUse:40});
 const b=monthlyBill(1000,1000,p,2026);
 assert.equal(b.direct,400);assert.equal(b.imported,600);assert.equal(b.credit,600);
 assert.ok(Math.abs(b.grid-600*.3*.6)<1e-9);
 assert.equal(b.energy,0);assert.ok(Math.abs(b.after-148)<1e-9);
 assert.equal(b.floorComplement,0);
});
test('custo de disponibilidade é piso e não cobrança em duplicidade',()=>{
 const p=input({tariff:1,fioB:.1,phase:100,lighting:30,selfUse:50});
 const b=monthlyBill(1000,1000,p,2026);
 assert.equal(b.floor,100);assert.ok(Math.abs(b.energy+b.grid-100)<1e-8);assert.ok(Math.abs(b.floorComplement)<1e-8);assert.equal(b.after,130);assert.ok(b.closingCredits>0);
});
test('excedentes não viram receita nem geram economia acima da conta evitável',()=>{
 const p=input({tariff:1,fioB:.2,phase:30,lighting:35,selfUse:30}),b=monthlyBill(1000,20000,p,2026);
 assert.equal(b.direct,1000);assert.equal(b.credit,0);assert.equal(b.surplus,19000);
 assert.equal(b.after,65);assert.equal(b.savings,970);
});
test('conservação de energia e decomposição da conta em todos os meses',()=>{
 for(const selfUse of [0,35,100])for(const multiplier of [.3,1,2]){
  const p=input({selfUse}),c=calculate(p);
  c.consumption.forEach((kwh,i)=>{const gen=c.generation[i]*multiplier,b=monthlyBill(kwh,gen,p,2026);
   assert.ok(Math.abs(b.direct+b.imported-kwh)<1e-7);assert.ok(Math.abs(b.direct+b.injected-gen)<1e-7);
   assert.ok(Math.abs(b.energy+b.grid+b.floorComplement+b.fixed-b.after)<1e-7);assert.ok(b.savings>=0);
  });
 }
});
test('o fluxo anual inclui reajuste, degradação, manutenção e reposição',()=>{
 const p=input({replacementYear:12,replacementCost:4000}),c=calculate(p);
 assert.equal(c.annual.length,26);assert.equal(c.annual[0].accumulated,-c.price);
 assert.ok(c.annual[12].replacement>4000);
 const net=c.annual.slice(1).reduce((s,a)=>s+a.net,0)-c.price;
 assert.ok(Math.abs(net-c.net25)<1e-6);
 for(const a of c.annual.slice(1))assert.ok(Math.abs(a.beforeCost-a.afterCost-a.savings)<1e-6);
});
test('margem sobre venda e desconto são tratados sem confundir markup',()=>{
 const p=input({margin:25,taxes:5,commission:5,discount:0}),c=calculate(p);
 assert.ok(Math.abs(c.price-c.cost/.65)<1e-7);assert.ok(Math.abs(c.actualMargin-25)<1e-8);
 const discounted=calculate({...p,discount:10});assert.ok(discounted.actualMargin<25);
});
test('financiamento a juros zero, com entrada e taxa zero, tem parcela correta',()=>{
 const p=input({interest:0,months:60,downPayment:1000,financeFees:0}),c=calculate(p);
 assert.equal(c.installment,Math.round((c.price-1000)/60*100)/100);assert.equal(c.totalFinanced,Math.round((1000+c.installment*60)*100)/100);
 const cash=calculate({...p,downPayment:1e8});assert.equal(cash.installment,0);assert.equal(cash.totalFinanced,Math.round(cash.price*100)/100);
});
test('inventário de equipamentos determina consumo e meta com reserva',()=>{
 const loads=[{id:'a',name:'Ar',quantity:2,watts:2000,hours:10,days:25,duty:80}];
 assert.equal(loadConsumption(loads),800);
 const c=calculate(input({loads,useLoadConsumption:true,reservePct:25}));assert.equal(c.avgConsumption,800);assert.equal(c.target,1000);
});
test('redimensionamento de kit fechado aplica custo proporcional e pede nova conferência',()=>{
 const p=input({pricing:'kit',manualModules:15,kitCost:10000}),scenario=reserveScenario(p,30),c=calculate(scenario);
 assert.equal(scenario.costsConfirmed,false);assert.equal(scenario.manualModules,0);assert.equal(c.target,1300);
 assert.ok(Math.abs(scenario.kitCost-10000*c.modules/15)<1e-6);
});
test('transição do Fio B usa os anos corretos e respeita enquadramento legado',()=>{
 assert.ok(Math.abs(fioFactor(2026,'transition',100)-.6)<1e-9);
 assert.equal(fioFactor(2027,'transition',100),.75);assert.ok(Math.abs(fioFactor(2028,'transition',100)-.9)<1e-9);
 assert.equal(fioFactor(2029,'transition',80),.8);assert.equal(fioFactor(2045,'legacy',100),0);assert.equal(fioFactor(2046,'legacy',100),1);
});
test('validação rejeita valores que gerariam preços e consumos incoerentes',()=>{
 assert.equal(inputSchema.safeParse(input()).success,true);
 for(const p of [input({margin:80,taxes:20}),input({fioB:2,tariff:1}),input({months:0}),input({pr:0}),input({useLoadConsumption:true,loads:[]}),input({loads:[{id:'x',name:'x',quantity:1,watts:100,hours:25,days:30,duty:100}]})])assert.equal(inputSchema.safeParse(p).success,false);
});
test('fatura brasileira: campos identificados sem inferir Fio B a partir do total',()=>{
 const b=parseBill('Equatorial Pará\nTitular: Empresa de exemplo\nCPF/CNPJ: 12.345.678/0001-90\nUnidade consumidora: 123456789\nReferência: 10/2026\nConsumo: 1.000 kWh\nTotal a pagar R$ 1.135,00\nIluminação pública R$ 35,00\nTarifa efetiva: 1,10000\nEndereço: Rua Exemplo, 10');
 assert.equal(b.consumption,1000);assert.equal(b.total,1135);assert.equal(b.lighting,35);assert.equal(b.tariff,1.1);assert.equal(b.fioB,0);assert.equal(b.consumerUnit,'123456789');assert.equal(b.reference,'10/2026');assert.equal(b.client,'Empresa de exemplo');assert.equal(b.document,'12.345.678/0001-90');
});
test('leitura de número brasileiro e ausência de consumo não são inventadas',()=>{
 assert.equal(brNumber('1.234,56'),1234.56);assert.equal(brNumber('1.000'),1000);assert.equal(brNumber('0,12345'),.12345);
 assert.equal(parseBill('Documento ilegível sem campos de energia.').consumption,0);
});
test('layout Equatorial: faixas, tributos, histórico e eventuais são conciliados',()=>{
 const text=`GRUPO DE TENSAO: B SUBGRUPO: B1   TIPO DE FORNECIMENTO: BIFASICO
CLASSIFICACAO: RESID. BAIXA RENDA
CLIENTE FICTICIO
CPF: ***.111.11*-**
RUA DE TESTE, 1
CEP: 00000-000 - MUNICIPIO FICTICIO - PA
16/09/2026   16/10/2026   30   16/11/2026
999.001.002-03
10/2026   27/10/2026   R$ 454,63
ICMS   466,38   19,0000   88,61
Consumo (kWh)   80   0,000000   0,000000   0,00   0,00   0,00   PIS   303,13   0,4231   1,28
Consumo (kWh)   317,19   1,168700   0,924230   7,12   70,43   370,70   COFINS   303,13   1,9495   5,91
Beneficio Tarifario Bruto   0,00   17,51   92,15
Adicional Bandeira   0,07   0,67   3,53
Beneficio Tarifario Liquido    -74,64
Cip-Ilum Pub Pref Munic          57,03
Multa                           5,41
Juros                           0,45
OUT/25   328
NOV/25   327
DEZ/25   340
JAN/26   372
FEV/26   318
MAR/26   264
ABR/26   279
MAI/26   319
JUN/26   315
JUL/26   355
AGO/26   336
SET/26   308
OUT/26   398
00000000000 Consumo ATIVO TOTAL 26.745 27.143 1,00 398 kWh`;
 const b=parseBill(text);assert.equal(b.consumption,398);assert.equal(b.phase,50);assert.equal(b.special,true);assert.equal(b.freeKwh,80);assert.equal(b.reference,'10/2026');assert.equal(b.history.length,13);assert.equal(b.lighting,57.03);assert.equal(b.nonRecurring,5.86);assert.equal(b.recurringTotal,448.77);assert.equal(b.netEnergy,391.74);assert.equal(b.reconciliationDifference,0);assert.equal(b.unitTariff,1.1687);assert.equal(b.fioB,0);assert.equal(b.taxes.length,3);assert.equal(b.document,'***.111.11*-**');
 assert.ok(Math.abs(b.history.slice(-12).reduce((s,h)=>s+h.kwh,0)/12-327.5833333333)<1e-6);
 assert.equal(inputSchema.safeParse(input({billAnalysis:b})).success,true);
});
