'use client';
import {FileCheck2} from 'lucide-react';
import {money,num,type SolarInput} from '@/lib/solar';
import {clientBillSummary} from '@/lib/client-bill-summary';

export default function ClientBillSummary({p,compact=false}:{p:SolarInput;compact?:boolean}){
 const d=clientBillSummary(p),a=d.observed;
 if(!d.hasDocuments)return null;
 const rows=a?[
  ['Energia após a compensação',a.energy],
  ...(a.fioB===null?[]:[['Fio B / uso da rede',a.fioB]]),
  ['Ajuste líquido SCEE',a.scee],['Iluminação pública',a.lighting],
  ['Bandeira tarifária',a.flag],['Outros e eventuais',a.other+a.events],
 ] as [string,number][]:[];
 return <section className="client-bill-summary" aria-label="Resumo das contas reais">
  <div className="section-heading"><div><div className="eyebrow">VALORES DAS FATURAS</div><h2><FileCheck2 size={21}/> Antes e depois, com as contas reais.</h2></div><span className={`badge ${d.complete?'green':'amber'}`}>{d.complete?'Contas conciliadas':'Documentos a completar'}</span></div>
  <div className="real-bill-cards">
   <div><small>ANTES DO SOLAR{d.before?` · ${d.before.reference}`:''}</small><strong>{d.before?money(d.before.total):'Fatura a vincular'}</strong><span>{d.before?`${num(d.before.consumption,2)} kWh no ciclo${d.before.readingDays?` · ${d.before.readingDays} dias`:''}`:'Importe a conta anterior da mesma unidade.'}</span></div>
   <div className="real-bill-after"><small>COM SOLAR{d.after?` · ${d.after.reference}`:''}</small><strong>{d.after?money(d.after.total):'Fatura a vincular'}</strong><span>{d.after?`${num(d.after.solar?.compensated??0,2)} kWh compensados`:'Importe a conta após a instalação.'}</span></div>
   <div><small>DIFERENÇA ENTRE ESTAS CONTAS</small><strong>{d.difference===null?'A conferir':money(Math.abs(d.difference))}</strong><span>{d.difference===null?'Exige as duas faturas conciliadas.':d.difference>=0?'A menos na conta com solar.':'A mais na conta com solar.'}</span></div>
  </div>
  <p className="hint">São valores cobrados em períodos e consumos diferentes. A diferença histórica não garante a economia dos próximos meses.</p>
  {!compact&&a&&<div className="real-bill-charges"><h3>O que compõe os {money(a.total)} da conta com solar?</h3><div className="real-bill-charge-list">{rows.filter(([,amount])=>amount!==0).map(([label,amount])=><div key={label}><span>{label}</span><b>{money(amount)}</b></div>)}<div className="real-bill-total"><span>Total da fatura · {a.reference}</span><b>{money(a.total)}</b></div></div><p className="hint">Fio B é uma parcela desta conta. Os tributos incluídos nos lançamentos não são somados novamente.</p></div>}
  {!d.complete&&<p className="pending-note">A comparação ainda precisa de {d.before?(d.after?'conferência dos lançamentos e do vínculo entre as contas':'uma fatura com solar da mesma unidade'):'uma fatura anterior ao solar da mesma unidade'}. Uma projeção não substitui o documento que falta.</p>}
 </section>;
}
