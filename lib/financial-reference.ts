import type {SolarInput} from './solar';
import {sameBillCustomer} from './bill-reconciliation.ts';
export function financialReference(p:SolarInput){
 const b=p.billAnalysis,basis=p.referenceBasis??'last';
 if(!b)return {basis,amount:null,kwh:null,estimated:true,label:'Referência sem fatura',source:'Importe a fatura para comparar com o valor pago.'};
 if(basis==='last')return {basis,amount:b.total,kwh:b.consumption,estimated:false,label:`Última fatura · ${b.reference}`,source:'Total efetivamente cobrado, incluindo eventuais identificados no Raio-X.'};
 const history=b.history.slice().sort((a,b)=>a.period.localeCompare(b.period)).slice(-12);
 if(!history.length)return {basis,amount:null,kwh:null,estimated:true,label:'Histórico não disponível',source:'Não há meses de consumo suficientes para esta referência.'};
 const key=(s:string)=>/^\d{2}\/\d{4}$/.test(s)?s.slice(3)+'-'+s.slice(0,2):s;
 const unique=[b,...p.billAnalyses??[]].filter((x,i,all)=>sameBillCustomer(b,x)&&all.findIndex(y=>key(x.reference)===key(y.reference))===i);
 const selected=basis==='peak'?[history.reduce((a,h)=>h.kwh>a.kwh?h:a)]:history;
 const kwh=selected.reduce((s,h)=>s+h.kwh,0)/selected.length;
 const observed=selected.map(h=>unique.find(x=>key(x.reference)===key(h.period)));
 const complete=observed.every(Boolean),amount=complete?observed.reduce((s,x)=>s+x!.recurringTotal,0)/observed.length:kwh*p.tariff+p.lighting+p.otherFixed;
 return {basis,amount:Math.round(amount*100)/100,kwh,estimated:!complete,label:basis==='peak'?`Pico de consumo · ${selected[0].period}`:`Média de ${history.length} meses${history.length<12?' · histórico parcial':''}`,source:complete?'Média dos valores recorrentes das faturas importadas correspondentes.':`Valor em reais estimado com ${kwh.toFixed(2)} kWh e a tarifa atual do cenário; não é média monetária comprovada das contas históricas.`};
}
