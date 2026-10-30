import test from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_INPUT,calculate} from '../lib/solar.ts';
import {paymentMetrics,financialComparison} from '../lib/financial-comparison.ts';
import {commissionBreakdown,commissionLimit,priceForMargin} from '../lib/commission.ts';
import {clientSafeProject,publicRecord,ADMIN_KIND} from '../lib/admin-privacy.ts';
import {validPin,pinHash,equalHashes} from '../lib/admin-pin.ts';
import {publicProductPrice,quoteFreshness,evaluateQuote} from '../lib/suppliers.ts';
import {parsePinBootstrap} from '../lib/admin-bootstrap.ts';
const p=(changes={})=>({...structuredClone(DEFAULT_INPUT),...changes});
test('configuração inicial de PIN só é aceita para o proprietário indicado e exige verificador válido',()=>{
 const config={salt:'a'.repeat(64),hash:'b'.repeat(64),id:'c'.repeat(32),ownerEmail:'owner@example.com'};
 assert.deepEqual(parsePinBootstrap(JSON.stringify(config),'OWNER@example.com'),config);
 assert.equal(parsePinBootstrap(JSON.stringify(config),'other@example.com'),null);
 assert.equal(parsePinBootstrap(JSON.stringify({...config,hash:'invalid'}),'owner@example.com'),null);
 assert.equal(parsePinBootstrap('broken','owner@example.com'),null);
});
test('comissão sobre venda de 20 mil usa a base total e protege lucro mínimo em reais',()=>{
 assert.equal(commissionBreakdown(20000,12000,0,5).commissionAmount,1000);
 const ten=commissionBreakdown(20000,12000,0,10);assert.equal(ten.commissionAmount,2000);assert.equal(ten.profit,6000);
 const max=commissionLimit(20000,12000,0,0,'sale',5000);assert.equal(max.amount,3000);assert.equal(max.rate,15);assert.equal(max.floor,5000);
 assert.equal(commissionBreakdown(20000,12000,0,max.rate).profit,5000);
 assert.ok(commissionBreakdown(20000,12000,0,20).profit<max.floor);
});
test('tributos, desconto e mínimo percentual reduzem o orçamento disponível para comissão',()=>{
 const full=commissionLimit(20000,12000,5,0,'sale',5000),discounted=commissionLimit(18000,12000,5,0,'sale',5000);
 assert.equal(full.amount,2000);assert.equal(discounted.amount,100);
 assert.equal(commissionLimit(20000,12000,0,30,'sale',5000).amount,2000);
 assert.equal(commissionLimit(15000,12000,0,0,'sale',5000).possible,false);
});
test('base no lucro não se confunde com base na venda; prejuízo não gera comissão sobre lucro',()=>{
 assert.equal(commissionBreakdown(20000,12000,0,10,'profit').commissionAmount,800);
 assert.equal(commissionBreakdown(10000,12000,0,10,'profit').commissionAmount,0);
 for(const basis of ['sale','profit']){const price=priceForMargin(15000,20,3,10,basis),result=commissionBreakdown(price,15000,3,10,basis);assert.ok(Math.abs(result.actualMargin-20)<1e-8);}
});
test('mão de obra negociada aceita valores livres e integra custo e lucro',()=>{
 for(const labor of [70,80,105,120,135]){const c=calculate(p({manualModules:30,labor}));assert.equal(c.labor,30*labor);}
 assert.equal(calculate(p({manualModules:30,labor:100})).labor,3000);
});
test('modo cliente preserva preço, parcelas, conta e geração sem expor a composição interna',()=>{
 const original=p({client:'Cliente de teste',labor:105,margin:23,taxes:4,commission:7,commissionBasis:'profit',discount:3,minimumProfit:5000,supplier:'Custo confidencial',extras:[{id:'a',name:'Serviço contratado',quantity:2,unit:400}]});
 const safe=clientSafeProject(original),before=calculate(original),after=calculate(safe);
 assert.ok(Math.abs(before.price-after.price)<1e-8);assert.equal(before.installment,after.installment);assert.equal(before.after,after.after);assert.deepEqual(before.generation,after.generation);
 for(const key of ['labor','margin','taxes','commission','moduleCost','inverterCost','structure','electrical','engineering','freight','minimumProfit'])assert.equal(safe[key],0);
 assert.equal(safe.supplier,'');assert.equal(safe.extras[0].unit,0);assert.equal(original.supplier,'Custo confidencial');
 assert.equal(publicRecord({kind:ADMIN_KIND,data:{hash:'secret'}}),null);assert.equal(publicRecord({kind:'quote',data:{cost:1}}),null);
 assert.equal(publicRecord({kind:'settings',data:{company:'CoopSun',defaultLabor:105,defaultMargin:23}}).data.defaultMargin,0);
});
test('PIN mantém zeros iniciais e o hash exige PIN e sal corretos',async()=>{
 assert.equal(validPin('0123'),true);for(const pin of ['123','12345','abcd',1234])assert.equal(validPin(pin),false);
 const a=await pinHash('0123','test-salt');assert.notEqual(a,'0123');assert.equal(equalHashes(a,await pinHash('0123','test-salt')),true);assert.equal(equalHashes(a,await pinHash('0124','test-salt')),false);assert.notEqual(a,await pinHash('0123','other-salt'));
});
test('percentuais mostram aumento quando parcela e resíduo superam a conta atual',()=>{
 assert.deepEqual(paymentMetrics(1000,440),{saving:560,savingPct:56.00000000000001,remainingPct:44});
 const loss=paymentMetrics(1000,1200);assert.equal(loss.saving,-200);assert.equal(loss.savingPct,-20);assert.equal(loss.remainingPct,120);assert.equal(paymentMetrics(0,100).savingPct,null);
 const x=financialComparison(p({months:6}));assert.ok(x.financedMetrics.savingPct<0);assert.equal(x.monthly[6].payment,0);assert.equal(x.monthly[6].financed,x.monthly[6].cash);
});
test('sensibilidade de juros mantém preço e resíduo; juros zero não ficam negativos',()=>{
 const x=financialComparison(p({interest:0,months:84}));assert.deepEqual(x.interestScenarios.map(s=>s.interest),[0,0,.5]);
 for(const s of x.interestScenarios){assert.equal(s.paymentPlusResidual,Math.round((s.installment+x.after)*100)/100);assert.equal(s.saving,Math.round((x.current-s.monthlyTotal)*100)/100);}
 assert.ok(x.residualRange.max>=x.residualRange.min);assert.equal(x.monthly.length,12);
});
test('preço público exige oferta de produto em reais; parcela, preço agregado e texto solto não viram custo',()=>{
 const wrap=data=>`<script type="application/ld+json">${JSON.stringify(data)}</script>`;
 assert.equal(publicProductPrice('<p>10x R$100,00</p>'),null);
 assert.equal(publicProductPrice(wrap({'@type':'Product',offers:{'@type':'AggregateOffer',lowPrice:100,priceCurrency:'BRL'}})),null);
 assert.equal(publicProductPrice(wrap({'@type':'Product',offers:{'@type':'Offer',price:100,priceCurrency:'USD'}})),null);
 assert.equal(publicProductPrice(wrap({'@graph':[{'@type':'Product',name:'Kit',offers:{'@type':'Offer',price:'12000.50',priceCurrency:'BRL'}}]})).price,12000.5);
});
test('cotação vencida ou exemplo não é preço confirmado; geração do kit usa a irradiação do projeto',()=>{
 const q={supplier:'Teste',name:'Kit',modules:10,moduleW:620,inverterKw:5,cost:12000,freight:500,date:'2026-10-29',note:'',example:false};
 assert.equal(quoteFreshness({...q,validUntil:'2026-10-28'},'2026-10-29').stale,true);assert.equal(quoteFreshness({...q,example:true},'2026-10-29').stale,true);
 assert.equal(quoteFreshness({...q,priceType:'public'},'2026-11-01').stale,true);
 const a=evaluateQuote(p({hsp:Array(12).fill(4)}),q),b=evaluateQuote(p({hsp:Array(12).fill(5)}),q);assert.ok(b.monthlyGeneration>a.monthlyGeneration);assert.equal(a.input.costsConfirmed,false);
});
