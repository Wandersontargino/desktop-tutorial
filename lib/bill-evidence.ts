import type {BillReading} from './bill.ts';
export function billEvidence(b:BillReading){
 const solar=b.solar;
 const explicitGrid=b.items.filter(i=>/Uso da rede \/ Fio B/.test(i.label));
 const gridCharge=explicitGrid.length?Math.round(explicitGrid.reduce((s,i)=>s+i.amount,0)*100)/100:null;
 const settlement=solar?Math.round((solar.compensationDebit+solar.injectionCredit)*100)/100:null;
 const reference=b.reference.match(/^(\d{2})\/(\d{4})$/),date=reference?`${reference[2]}-${reference[1]}`:'';
 return {hasSolar:!!b.hasSolar,gridCharge,settlement,date,energy:b.items.filter(i=>i.category==='energy').reduce((s,i)=>s+i.amount,0),flag:b.items.filter(i=>i.category==='flag').reduce((s,i)=>s+i.amount,0),
  explanation:b.hasSolar?gridCharge===null?'A fatura contém consumo compensado e crédito de injeção, mas não identifica uma cobrança autônoma de Fio B. O saldo desse par de lançamentos não comprova isenção nem define o enquadramento da ampliação.':'Cobrança de uso da rede identificada no documento. O valor pago não deve ser aplicado como tarifa integral do Fio B nem multiplicado novamente pelo percentual do ano.':'A tarifa integral desta conta sem solar já inclui uso da rede. O Fio B da energia compensada será uma parcela da simulação do projeto futuro; não é uma despesa separada que deveria constar nesta conta.'};
}
