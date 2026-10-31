'use client';
import {Info,Zap,TrendingUp} from 'lucide-react';
import {financialComparison} from '@/lib/financial-comparison';
import {clientBillSummary} from '@/lib/client-bill-summary';
import {MONTHS,money,num,type SolarInput} from '@/lib/solar';
import {BalanceLine,resultTone} from './result-colors';

export function SavingPercent({savingPct,remainingPct,partial=false}:{savingPct:number|null;remainingPct:number|null;partial?:boolean}){
 if(savingPct===null||remainingPct===null)return null;
 return <div className={`saving-percent ${resultTone(savingPct,partial)}`}>
  <b>{partial?(savingPct>=0?'Estimativa parcial · até ':'Estimativa parcial · ao menos '):''}{num(Math.abs(savingPct),1)}% {savingPct>=0?'a menos':'a mais'} por mês</b>
  <span>Desembolso equivalente a {partial?'pelo menos ':''}{num(remainingPct,1)}% da base de comparação.</span>
 </div>;
}

export default function ClientValueCharts({p,x}:{p:SolarInput;x:ReturnType<typeof financialComparison>}){
 const max=Math.max(x.current,x.cashTotal,x.financedTotal,1),observed=clientBillSummary(p).observed;
 const observedFio=observed?.fioB??null,first=x.monthly[0],last=x.monthly.at(-1)!;
 const period=`${MONTHS[first.month]}/${first.calendarYear} a ${MONTHS[last.month]}/${last.calendarYear}`;
 const credit=x.monthly.reduce((sum,m)=>sum+m.credit,0)/12;
 const fio=x.fiscal.charges.find(c=>c.id==='fioB')?.gross??0;
 const width=660,height=250,left=64,right=18,top=22,bottom=36;
 const chartMax=Math.max(...x.monthly.flatMap(m=>[m.before,m.cash,m.financed]),1)*1.15;
 const cx=(i:number)=>left+i*(width-left-right)/11,cy=(v:number)=>top+(1-v/chartMax)*(height-top-bottom);
 const series=[{label:'Atual · concessionária',color:'#7b9bcc',key:'before' as const},{label:'Solar à vista + manutenção',color:'#1f4582',key:'cash' as const},{label:`Solar financiado · ${x.months}x + manutenção`,color:'#b88a2b',key:'financed' as const}];
 const cashYears=[-x.price,...x.annual.map(a=>a.accumulated)];
 const cashMin=Math.min(...cashYears,0),cashMax=Math.max(...cashYears,1),cashRange=cashMax-cashMin;
 const py=(v:number)=>top+(cashMax-v)/cashRange*(height-top-bottom),px=(i:number)=>left+i*(width-left-right)/25;
 const amount=(v:number)=>(x.partial?'Parcial · ':'')+money(v);
 return <div className="value-dashboard">
  <div className="value-section-title"><h3>Seu dinheiro, lado a lado</h3><p>Conta residual, prestação e manutenção em uma mesma escala. O pagamento inicial fica separado.</p></div>
  <div className="value-legend"><span><i style={{background:'#9cb4d8'}}/>Conta atual</span><span><i style={{background:'#1f4582'}}/>Conta residual com tributos informados</span><span><i style={{background:'#d3ae5a'}}/>Prestação</span><span><i style={{background:'#94aed5'}}/>Manutenção</span></div>
  <div className="value-stacks" role="img" aria-label={`Desembolso mensal: atual ${money(x.current)}, à vista ${amount(x.cashTotal)}, financiado ${amount(x.financedTotal)}.`}>
   {[{label:'Hoje',total:x.current,parts:[{v:x.current,color:'#9cb4d8',label:'Conta atual'}]},
    {label:'Solar à vista',total:x.cashTotal,parts:[{v:x.after,color:'#1f4582',label:'Conta residual'},{v:x.maintenance,color:'#94aed5',label:'Manutenção'}]},
    {label:`Financiado · ${x.months}x`,total:x.financedTotal,parts:[{v:x.after,color:'#1f4582',label:'Conta residual'},{v:x.installment,color:'#d3ae5a',label:'Prestação'},{v:x.maintenance,color:'#94aed5',label:'Manutenção'}]}].map((row,i)=><div className="value-stack-row" key={row.label}><span>{row.label}</span><div className="value-stack-track">{row.parts.map(part=><i key={part.label} style={{width:`${part.v/max*100}%`,background:part.color}} title={`${part.label}: ${money(part.v)}`}/>)}<em style={{left:`${x.current/max*100}%`}} title="Despesa atual de referência"/></div><strong>{i?amount(row.total):money(row.total)}</strong></div>)}
  </div>
  <div className="value-charts-grid">
   <section className="value-chart-card"><div className="eyebrow">O RESÍDUO VARIA</div><h3>O que muda ao longo dos meses?</h3>
    <p>Conta residual inicial entre <b>{amount(x.residualRange.min)}</b> e <b>{amount(x.residualRange.max)}</b> nos meses simulados.</p>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Custos mensais: situação atual, solar à vista e solar financiado, incluindo manutenção">
     {[0,.25,.5,.75,1].map(f=><g key={f}><line x1={left} x2={width-right} y1={cy(chartMax*f)} y2={cy(chartMax*f)} stroke="#d1def7" strokeDasharray="3 4"/><text x={left-9} y={cy(chartMax*f)+4} textAnchor="end">{num(chartMax*f)}</text></g>)}
     <text x={left} y={12}>R$ por mês</text>
     {series.map(s=><g key={s.key}><polyline fill="none" stroke={s.color} strokeWidth="3" strokeDasharray={s.key==='before'?'6 4':undefined} points={x.monthly.map(m=>`${cx(m.index)},${cy(m[s.key])}`).join(' ')}/>{x.monthly.map(m=><circle key={m.index} cx={cx(m.index)} cy={cy(m[s.key])} r="3.8" fill={s.color}><title>{`${MONTHS[m.month]}/${m.calendarYear} · ${s.label}: ${money(m[s.key])}`}</title></circle>)}</g>)}
     {x.monthly.map(m=><text key={m.index} x={cx(m.index)} y={height-10} textAnchor="middle">{MONTHS[m.month]}/{String(m.calendarYear).slice(-2)}</text>)}
    </svg><div className="value-legend">{series.map(s=><span key={s.key}><i style={{background:s.color}}/>{s.label}</span>)}</div>
    <p className="hint">Perfil anual inicial, com as tarifas e o consumo usados nesta comparação. O resíduo não é uma taxa fixa. Entrada e investimento à vista não fazem parte das linhas mensais.</p>
   </section>
   <section className="value-chart-card value-fio"><div className="eyebrow">{observedFio===null?'SIMULAÇÃO SEPARADA DA FATURA':'VALOR COBRADO NA FATURA'}</div><h3><Zap size={20}/> {observedFio===null?'Fio B do cenário futuro':'Quanto foi cobrado de Fio B?'}</h3>
    <strong className="value-fio-amount">{observedFio!==null?money(observedFio):x.unknownFio||x.unknownSelfUse?'A conferir':money(fio)}<small>{observedFio!==null?`Fatura ${observed!.reference} · incluído no total de ${money(observed!.total)}`:x.unknownSelfUse?'Uso direto da geração ainda não validado':`Média projetada · ${period}`}</small></strong>
    {observedFio!==null&&<><div className="value-fio-formula"><span>{num(observed!.compensationKwh,2)} kWh compensados neste ciclo</span><b>×</b><span>R$ {num(observed!.gridRate!,8)}/kWh efetivamente cobrados</span></div><p>Esta tarifa já inclui o percentual do ciclo. O valor vem dos lançamentos da conta; não aplicamos o percentual novamente.</p></>}
    <details className="review-details"><summary>{observedFio!==null?'Comparar com a simulação futura':'Ver as hipóteses e a estimativa do cenário'}</summary><p><b>{x.unknownFio?'Fio B a confirmar':money(fio)}</b> por mês na hipótese de <b>{num(credit,2)} kWh compensados</b> em média. Período: {period}. Componente integral: R$ {num(p.fioB,6)}/kWh, com o percentual de cada ano.</p><p>Uso direto assumido: {num(p.selfUse,2)}% da geração. {x.unknownSelfUse?'Essa hipótese ainda não está conferida. Zero sem medição não significa ausência real de uso direto.':''} A meta de geração do contrato não é a energia compensada medida.</p>
    <div className="value-tax-list"><h4>Tributos dentro da conta projetada</h4>{x.fiscal.taxes.map(t=><div key={t.name}><span>{t.name} {t.rate===null?'· alíquota pendente':`· ${num(t.rate,4)}%`}</span><b>{t.amount===null?'A confirmar':money(t.amount)}</b></div>)}<div><span>Tributos/ajustes SCEE adicionais</span><b>{x.unknownCompensation?'A confirmar':money(x.fiscal.compensationTax)}</b></div><small>Tributos já incluídos nas tarifas brutas não são somados novamente.</small></div></details>
    <a className="text-btn" href="https://www2.camara.leg.br/legin/fed/lei/2022/lei-14300-6-janeiro-2022-792217-normaatualizada-pl.html" target="_blank" rel="noreferrer">Consultar a Lei 14.300 · arts. 26 e 27</a>
   </section>
   <section className="value-chart-card value-payback"><div><div className="eyebrow">RETORNO DO INVESTIMENTO À VISTA</div><h3><TrendingUp size={20}/> Em que momento o investimento se paga?</h3><p>O saldo começa em <b>−{money(x.price)}</b>. {x.partial?'Fluxo parcial: faltam parcelas tarifárias/tributárias. O retorno só poderá ser estimado após completar essas informações.':'O cruzamento da linha zero indica recuperação do investimento.'}</p></div>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Payback à vista: investimento inicial e saldo líquido acumulado em 25 anos">
     {[0,.5,1].map(f=>{const v=cashMin+f*cashRange;return <g key={f}><line x1={left} x2={width-right} y1={py(v)} y2={py(v)} stroke="#d1def7" strokeDasharray="3 4"/><text x={left-8} y={py(v)+4} textAnchor="end">{num(v/1000,1)} mil</text></g>;})}
     <line x1={left} x2={width-right} y1={py(0)} y2={py(0)} stroke="#a98235" strokeDasharray="6 4"/><BalanceLine values={cashYears} x={px} y={py} partial={x.partial}/>
     {x.payback!==null&&!x.partial&&<g><circle cx={px(x.payback)} cy={py(0)} r="5" fill="#b88a2b"/><title>{`Retorno estimado em ${num(x.payback,2)} anos`}</title></g>}
     {[0,5,10,15,20,25].map(i=><text x={px(i)} y={height-10} textAnchor="middle" key={i}>{i===0?'Hoje':`${i} anos`}</text>)}
    </svg><p className="hint">Retorno nominal, considerando investimento inicial, economia, manutenção e reposição. As hipóteses de reajuste, degradação e Fio B futuro são as do projeto. {x.needsReview?'Há premissas pendentes; o retorno é preliminar.':''} Economia mensal e payback são indicadores distintos.</p>
   </section>
  </div>
  <details className="xray-details"><summary>Conferir os valores do gráfico mês a mês</summary><div className="table-scroll"><table className="fiscal-table"><thead><tr><th>Mês</th><th>Atual</th><th>Conta residual</th><th>Parcela</th><th>Manutenção</th><th>Total à vista</th><th>Total financiado</th><th>Economia financiada</th></tr></thead><tbody>{x.monthly.map(m=><tr key={m.index}><td>{MONTHS[m.month]}/{m.calendarYear}</td><td>{money(m.before)}</td><td>{amount(m.after)}</td><td>{money(m.payment)}</td><td>{money(m.maintenance)}</td><td>{amount(m.cash)}</td><td>{amount(m.financed)}</td><td>{money(m.financedMetrics.saving)} · {m.financedMetrics.savingPct===null?'—':`${num(m.financedMetrics.savingPct,1)}%`}</td></tr>)}</tbody></table></div></details>
  <div className="value-explanation"><Info size={18}/><p>“Economia” compara a mesma base de consumo com o desembolso completo do cenário. Se o total com prestação for maior, mostramos o aumento em reais e em percentual. Valores calculados são estimativas; a cobrança depende das condições efetivas.</p></div>
 </div>;
}
