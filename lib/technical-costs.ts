import type {SolarInput} from './solar';
export type TechnicalFee={id:string;name:string;amount:number|null;includedInEngineering:boolean;source:string;confirmed:boolean};
export const EQUATORIAL_CONNECTION_SOURCE='https://pi.equatorialenergia.com.br/wp-content/uploads/2025/12/NT.00020.EQTL-06-Conexao-de-Micro-e-Minigeracao-Distribuida-ao-Sistema-de-Distribuicao.pdf';
export const ART_2026_SOURCE='https://normativos.confea.org.br/Ementas/Visualizar?id=81005';
export function art2026Estimate(contractValue:number){return contractValue<=15000?108.39:285.59;}
export function defaultTechnicalFees():TechnicalFee[]{return [
 {id:'engineer',name:'Honorários de projeto / responsabilidade técnica',amount:null,includedInEngineering:false,source:'Referência de R$ 250 a R$ 500 informada por Wanderson; cotar escopo e responsabilidade com o profissional.',confirmed:false},
 {id:'art',name:'Registro de ART no CREA',amount:null,includedInEngineering:false,source:ART_2026_SOURCE,confirmed:false},
 {id:'utility',name:'Participação financeira em obras de conexão',amount:null,includedInEngineering:false,source:EQUATORIAL_CONNECTION_SOURCE,confirmed:false},
 {id:'entrance',name:'Adequação do padrão / caixa / instalações do cliente',amount:null,includedInEngineering:false,source:EQUATORIAL_CONNECTION_SOURCE,confirmed:false},
 {id:'metering',name:'Adequação da medição em minigeração, se aplicável',amount:null,includedInEngineering:false,source:EQUATORIAL_CONNECTION_SOURCE,confirmed:false},
 ];}
export function technicalCostSummary(p:SolarInput){
 const fees=p.technicalFees??[];
 return {extra:fees.reduce((s,f)=>s+(f.includedInEngineering?0:f.amount??0),0),
  included:fees.reduce((s,f)=>s+(f.includedInEngineering?f.amount??0:0),0),
  pending:fees.filter(f=>f.amount===null||!f.confirmed),
  exceedsEngineering:fees.filter(f=>f.includedInEngineering).reduce((s,f)=>s+(f.amount??0),0)>p.engineering+.005};
}
