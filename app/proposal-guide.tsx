import {Sun,PanelTop,Zap,Building2,ClipboardCheck,Activity,CheckCircle2} from 'lucide-react';
import type {SolarInput} from '@/lib/solar';
import {calculate,money,num} from '@/lib/solar';

export function ProposalGuide({company}:{company:string}){
 return <section className="proposal-page proposal-guide"><div className="mini-brand"><Sun size={19}/>{company}<span>Quem somos · Como funciona</span></div>
  <div className="eyebrow">ENERGIA EXPLICADA COM CLAREZA</div><h2>Uma decisão que começa pela sua conta.</h2>
  <p>A {company} apresenta o sistema, o investimento e as despesas que continuam existindo. O estudo parte do consumo do imóvel e deve ser confirmado na vistoria e no projeto executivo.</p>
  <div className="proposal-principles"><div><ClipboardCheck/><h3>Diagnóstico</h3><p>Leitura da fatura, histórico, tributos, créditos e necessidades de crescimento.</p></div><div><PanelTop/><h3>Projeto</h3><p>Equipamentos, geração estimada, área e reserva de consumo identificados.</p></div><div><Activity/><h3>Acompanhamento</h3><p>Monitoramento para comparar a produção efetiva com as premissas do estudo.</p></div></div>
  <h2>O caminho da energia e do dinheiro</h2><div className="proposal-energy-flow"><div><Sun/><b>1. Gerar</b><p>Os módulos produzem durante o dia e o inversor converte a energia para uso no imóvel.</p></div><div><Zap/><b>2. Consumir ou injetar</b><p>O uso direto reduz a compra da rede. O excedente injetado pode gerar créditos conforme o enquadramento.</p></div><div><Building2/><b>3. Compensar e pagar</b><p>Créditos podem compensar energia. Fio B, tributos aplicáveis, iluminação e demais cobranças continuam na conta.</p></div></div>
  <div className="notice amber"><b>Injeção não é geração total.</b><p>A fatura mostra a troca com a rede. Para conhecer a geração total e o autoconsumo, é necessário consultar o monitoramento do sistema.</p></div>
  <h3>Quais contas vamos comparar?</h3><p>Primeiro, a despesa recorrente atual. Depois, a conta residual com solar mais a manutenção. Por fim, esse mesmo custo acrescido da parcela do financiamento. O investimento à vista e a entrada ficam separados.</p>
  <footer className="proposal-footer">Estudo técnico comercial · Valores e premissas detalhados nas próximas páginas.</footer>
 </section>;
}

export function ProposalClosing({p,company,representative}:{p:SolarInput;company:string;representative:string}){
 const c=calculate(p);
 return <section className="proposal-page proposal-closing"><div className="mini-brand"><Sun size={19}/>{company}<span>Etapas · Conferência comercial</span></div><h2>Do estudo ao acompanhamento</h2>
  <ol className="proposal-milestones"><li><b>Conferência da conta e do consumo</b><span>Confirmar titularidade, histórico, tarifas, tributos, crescimento e eventual sistema existente.</span></li><li><b>Vistoria e projeto executivo</b><span>Verificar cobertura, estrutura, sombreamento, orientação, proteção e compatibilidade elétrica dos equipamentos.</span></li><li><b>Contrato e condições de pagamento</b><span>Confirmar orçamento, marcas, escopo, adicionais, garantias, cronograma e condições bancárias quando houver.</span></li><li><b>Instalação, conexão e monitoramento</b><span>Executar as etapas técnicas e da concessionária; comparar geração real e economia com o estudo.</span></li></ol>
  <h2>Resumo para conferência</h2><div className="assumptions-grid"><span>Cliente: <b>{p.client||'A preencher'}</b></span><span>Sistema: <b>{num(c.kwp,2)} kWp · {c.modules} módulos</b></span><span>Inversor informado: <b>{num(p.inverterKw,2)} kW</b></span><span>Investimento: <b>{money(c.price)}</b></span></div>
  <div className="notice amber"><CheckCircle2 size={20}/><div><b>{p.isSimulation?'Modelo demonstrativo para avaliação':'Antes da contratação'}</b><p>A conferência deste estudo não substitui o contrato. Geração, economia, prazos e garantias dependem das condições e documentos confirmados. A simulação de financiamento não representa aprovação de crédito.</p></div></div>
  <div className="proposal-signatures"><div><span>Cliente / responsável</span><small>Nome e data para conferência</small></div><div><span>{representative||company}</span><small>Responsável pela proposta</small></div></div><footer className="proposal-footer">{company} · Estudo com despesas, hipóteses e condições identificadas.</footer>
 </section>;
}
