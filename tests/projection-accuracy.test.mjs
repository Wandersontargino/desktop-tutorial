import test from 'node:test';
import assert from 'node:assert/strict';
import {parseBill} from '../lib/bill.ts';
import {reproduceInvoice,sameBillCustomer,observedProjectionCharges} from '../lib/bill-reconciliation.ts';
import {DEFAULT_INPUT,monthlyBill,simulateEnergyYears,calculate} from '../lib/solar.ts';
import {financialComparison} from '../lib/financial-comparison.ts';
import {projectExpenses,roundMoney} from '../lib/fiscal.ts';
import {solarHistoryByPosition} from '../lib/pdf-bill-layout.ts';
import {buildProjectFromBill} from '../lib/client-project.ts';
import {inputSchema} from '../lib/validation.ts';
const input=(changes={})=>({...structuredClone(DEFAULT_INPUT),...changes});
const solar=`Equatorial Pará
Titular: Cliente Fictício
Conta Contrato: 3000000000
Referência: 10/2026
Consumo Compensado (kWh)   1.000   1,000000   0,750000   0,00   0,00   1.000,00
Energia Ativa Injetada (kWh)   800   1,000000   0,750000   0,00   0,00   -800,00
Energia Inj. mUC 02/2026 mPT (kWh)   200   1,000000   0,750000   0,00   0,00   -200,00
Parc. Inj. s/ Desc. - GD2 (kWh)   1.000   0,300000   0,237000   0,00   0,00   300,00
Benefício Tarifário Bruto SCEE   0,00   100,00   600,00
Benefício Tarifário Líquido SCEE   -500,00
Adicional Bandeira   0,00   0,00   2,00
Cip-Ilum Pub Pref Munic   50,00
Saldo Acumulado Geral Total: 400,50
Total a pagar R$ 452,00`;
test('crédito de ciclo anterior e ajuste SCEE conciliam a fatura sem aplicar Fio B duas vezes',()=>{
 const b=parseBill(solar),r=reproduceInvoice(b);assert.equal(b.solar.injectionCredit,-1000);assert.equal(b.solar.currentBalance,400.5);assert.equal(b.reconciliationDifference,0);assert.equal(r.energy,0);assert.equal(r.fioB,300);assert.equal(r.scee,100);assert.equal(r.total,452);assert.equal(r.items,452);assert.equal(r.compensationTaxPerKwh,.1);assert.equal(r.gridRate,.3);assert.equal(sameBillCustomer(b,{...b,consumerUnit:'nova-unidade'}),true);assert.equal(sameBillCustomer(b,{...b,accountCode:'outro-contrato'}),false);
});
test('leitura incompleta ou tarifa social não autoriza calibrar automaticamente o encargo SCEE',()=>{
 assert.equal(reproduceInvoice(parseBill(solar.replace('452,00','453,00'))).compensationTaxPerKwh,null);
 assert.equal(reproduceInvoice({...parseBill(solar),special:true}).compensationTaxPerKwh,null);
});
test('encargo adicional por kWh altera conta, caixa, parcelas+resíduo e fiscal uma só vez',()=>{
 const p=input({selfUse:0,phase:30,tariff:1,fioB:.3,lighting:50}),plain=monthlyBill(1000,1000,p,2026),priced=monthlyBill(1000,1000,{...p,compensationTax:{perKwh:.1,source:'Exemplo',reference:'10/2026',confirmed:true}},2026);
 assert.equal(priced.credit,1000);assert.equal(priced.compensationTax,100);assert.equal(priced.after-plain.after,100);
 const q={...p,compensationTax:{perKwh:.1,source:'Exemplo',reference:'10/2026',confirmed:true}},x=financialComparison(q),f=projectExpenses(q);assert.equal(f.total,roundMoney(calculate(q).after));assert.equal(roundMoney(f.charges.reduce((s,c)=>s+c.gross,0)),f.total);assert.equal(roundMoney(f.net+f.knownTaxes+f.lighting+f.adjustment),f.total);assert.equal(roundMoney(x.after+x.maintenance+x.installment),x.financedTotal);
});
test('ausência de encargo SCEE não equivale a zero confirmado, mesmo com Fio B informado',()=>{
 const bill=parseBill('Titular: Cliente Fictício\nConsumo: 1000 kWh\nTarifa efetiva: 1,00000\nTotal a pagar R$ 1.050,00'),p=input({billAnalysis:bill,billFileName:'exemplo.pdf',fioB:.3,tariffConfirmed:true});
 assert.equal(financialComparison(p).unknownFio,false);assert.equal(financialComparison(p).partial,true);
 assert.equal(financialComparison({...p,selfUseBasis:{kind:'assumption',percent:p.selfUse,source:'Simultaneidade conferida no exemplo',reference:'Hipótese',confirmed:true},compensationTax:{perKwh:0,source:'Isenção conferida no exemplo',reference:'Manual',confirmed:true}}).partial,false);
 assert.equal(inputSchema.safeParse({...p,compensationTax:{perKwh:-1,source:'',reference:'',confirmed:false}}).success,false);
});
test('comparação financeira usa quantidade tarifada; dimensionamento mantém consumo medido',()=>{
 const bill=parseBill('Titular: Cliente Fictício\nConsumo (kWh)   980   1,000000   0,800000   0,00   0,00   980,00\nCip-Ilum Pub Pref Munic   50,00\nTotal a pagar R$ 1.030,00\n123456 Consumo ATIVO TOTAL 1.000 2.000 1,00 1.000 kWh');
 const p=input({billAnalysis:bill,billFileName:'exemplo.pdf',tariff:1,lighting:50,otherFixed:0});assert.equal(bill.consumption,1000);assert.equal(financialComparison(p).consumption,980);assert.equal(financialComparison(p).decompositionDifference,0);
 const next=buildProjectFromBill(bill,'','exemplo.pdf',{phone:'',email:'',city:'',useHistory:false,reservePct:20,criticalMonth:false,labor:100,margin:25,year:2026});assert.equal(next.selfUse,0);
});
test('créditos passam aos meses seguintes e não são antecipados de meses futuros',()=>{
 const p=input({selfUse:0,regime:'legacy',phase:30,tariff:1,fioB:0,inflation:0,degradation:0});
 const c=Array(12).fill(100),g=Array(12).fill(100);g[0]=300;g[1]=0;
 const bills=simulateEnergyYears(c,g,p,1)[0];assert.equal(bills[0].credit,70);assert.equal(bills[0].closingCredits,230);assert.equal(bills[1].openingCredits,230);assert.equal(bills[1].credit,70);assert.equal(bills[1].energy,30);
 const reverse=simulateEnergyYears(c,[0,300,...g.slice(2)],p,1)[0];assert.equal(reverse[0].credit,0);assert.equal(reverse[0].energy,100);
});
test('créditos expiram em 60 ciclos e o saldo inicial de uma projeção nova é zero',()=>{
 const p=input({selfUse:0,inflation:0,degradation:0}),c=Array(12).fill(0),g=Array(12).fill(100),years=simulateEnergyYears(c,g,p,6);
 assert.equal(years[0][0].openingCredits,0);assert.equal(years[4][11].closingCredits,6000);assert.equal(years[5][0].expiredCredits,100);assert.equal(years[5][0].closingCredits,6000);
});
test('virada do ano aplica percentual do Fio B em cada mês e todos os demonstrativos conciliam',()=>{
 const p=input({startYear:2026,startMonth:11,selfUse:0,phase:30,fioB:.3,tariff:1,compensationTax:{perKwh:0,source:'Exemplo',reference:'Manual',confirmed:true}}),years=simulateEnergyYears(Array(12).fill(1000),Array(12).fill(1000),p,1);
 assert.equal(years[0][0].month,11);assert.equal(years[0][0].calendarYear,2026);assert.equal(years[0][1].month,0);assert.equal(years[0][1].calendarYear,2027);assert.ok(Math.abs(years[0][0].grid-180)<1e-8);assert.equal(years[0][1].grid,225);
 const x=financialComparison(p);assert.equal(x.monthly[0].calendarYear,2026);assert.equal(x.monthly[1].calendarYear,2027);for(let m=0;m<12;m++){const f=projectExpenses(p,m);assert.equal(f.total,x.monthly.find(r=>r.month===m).after);}assert.equal(projectExpenses(p).total,x.after);
});
test('geometria recupera pares do histórico mesmo com desvio vertical dos rótulos',()=>{
 const labels=['JAN/26','FEV/26','MAR/26','ABR/26','MAI/26','JUN/26'],items=[{str:'Injetado',transform:[0,0,0,0,300,0]}];
 labels.forEach((s,i)=>{items.push({str:s,transform:[0,0,0,0,200,100-i*10]},{str:String(100+i),transform:[0,0,0,0,300,103-i*9.7]},{str:String(200+i),transform:[0,0,0,0,300,99-i*9.7]});});
 const text=solarHistoryByPosition(items);assert.ok(text.includes('JAN/26   100   200'));assert.ok(text.includes('JUN/26   105   205'));assert.equal(solarHistoryByPosition(items.slice(0,-1)),'');
 const b=parseBill(solar+'\n'+text);assert.equal(b.solar.history.length,6);assert.equal(b.solar.history[0].gridKwh,100);assert.equal(b.solar.history[0].injectedKwh,200);
});
test('referência contratual fixa equipamentos, geração informada e preço sem declarar produção medida',()=>{
 const r={modules:20,moduleW:550,inverterKw:8,monthlyKwh:1300,investment:25000,source:'Contrato de exemplo',paymentTerms:'Entrada e parcelas conforme contrato'},p=input({referenceMode:true,systemReference:r,manualModules:5,moduleW:400});
 const c=calculate(p),x=financialComparison(p);assert.equal(c.modules,20);assert.equal(c.kwp,11);assert.ok(Math.abs(c.monthlyGeneration-1300)<1e-8);assert.equal(c.price,25000);assert.equal(x.price,25000);assert.ok(c.warnings.some(w=>w.includes('não medida')));assert.equal(inputSchema.safeParse(p).success,true);assert.equal(inputSchema.safeParse({...p,systemReference:null}).success,false);
});
test('custos de compensação acima da economia são mostrados como perda, sem esconder caixa negativo',()=>{
 const p=input({selfUse:0,tariff:1,fioB:.5,compensationTax:{perKwh:1,source:'Teste de limite',reference:'Manual',confirmed:true}}),b=monthlyBill(1000,1000,p,2026);assert.ok(b.after>b.before);assert.ok(b.savings<0);
});

test('despesas observadas GD2 reproduzem o total quando energia, período e tarifas são os mesmos',()=>{
 const b=parseBill(solar),p=input({billAnalysis:b,projectMode:'new',selfUse:0,tariff:1,lighting:0,otherFixed:0}),next=observedProjectionCharges(p,b);assert.equal(b.solar.gridRegime,'GD2');assert.equal(next.fioB,.5);assert.equal(next.lighting,50);assert.equal(next.otherFixed,2);assert.equal(next.compensationTax.perKwh,.1);assert.equal(roundMoney(monthlyBill(1000,1000,next,2026).after),452);assert.equal(p.fioB,.25);assert.equal(next.compensationTax.confirmed,false);assert.throws(()=>observedProjectionCharges({...p,projectMode:'expansion'},b));assert.throws(()=>observedProjectionCharges(p,{...b,solar:{...b.solar,gridRegime:'GD3'}}));
});

test('encargo SCEE fracionário é arredondado apenas após a composição do cenário futuro',()=>{
 const p=input({consumption:398,consumptionScenario:'project',autoTarget:false,target:600,selfUse:17.3,compensationTax:{perKwh:.137939,source:'Hipótese de teste',reference:'10/2026',confirmed:true}});
 const f=projectExpenses(p),x=financialComparison(p);
 assert.equal(roundMoney(f.charges.reduce((s,c)=>s+c.gross,0)),f.total);
 assert.equal(f.total,x.after);
 assert.equal(roundMoney(x.after+x.installment+x.maintenance),x.financedTotal);
});
