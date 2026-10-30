import type {SolarInput} from './solar.ts';
export const FIO_B_SOURCE='https://dadosabertos.aneel.gov.br/dataset/componentes-tarifarias';
export type OfficialFioB={agent:string;group:string;social:boolean;at:string;start:string;end:string;resolution:string;net:number;source:string;generatedAt:string;checkedAt:string;retrieval?:'live'|'snapshot';capturedAt?:string};
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().trim();
export function officialAgent(name:string){const n=norm(name);if(/EQUATORIAL/.test(n)&&/PARA\b|\bPA\b/.test(n))return 'EQUATORIAL PA';if(/EQUATORIAL/.test(n)&&/MARANHAO|\bMA\b/.test(n))return 'EQUATORIAL MA';return n;}
export function selectOfficialFioB(rows:Record<string,string>[],agent:string,group:string,at:string,social=false):OfficialFioB|null{
 const matches=rows.filter(r=>norm(r.SigNomeAgente||'')===officialAgent(agent)&&r.DscSubGrupoTarifario===group&&r.DscComponenteTarifario==='TUSD_FioB'&&r.DscBaseTarifaria==='Tarifa de Aplicação'&&r.DscModalidadeTarifaria==='Convencional'&&r.DscUnidade==='R$/MWh'&&r.DatInicioVigencia<=at&&r.DatFimVigencia>=at&&(social?norm(r.DscSubClasseConsumidor||'')==='BAIXA RENDA':norm(r.DscSubClasseConsumidor||'')==='RESIDENCIAL')).sort((a,b)=>b.DatInicioVigencia.localeCompare(a.DatInicioVigencia));
 if(!matches.length)return null;const current=matches.filter(r=>r.DatInicioVigencia===matches[0].DatInicioVigencia),rates=current.map(r=>Number(r.VlrComponenteTarifario.replace(',','.'))/1000);
 if(rates.some(n=>!Number.isFinite(n)||n<=0||n>10)||rates.some(n=>Math.abs(n-rates[0])>1e-9))return null;
 const r=current[0];return {agent:r.SigNomeAgente,group,social,at,start:r.DatInicioVigencia,end:r.DatFimVigencia,resolution:r.DscResolucaoHomologatoria,net:rates[0],source:FIO_B_SOURCE,generatedAt:r.DatGeracaoConjuntoDados,checkedAt:new Date().toISOString()};
}
export function observedFioBTaxEstimate(p:SolarInput,ref:OfficialFioB){
 const b=p.billAnalysis;if(!b||!(b.unitTariff>0)||!(b.tariffWithoutTaxes>0))return null;
 const factor=b.unitTariff/b.tariffWithoutTaxes;if(!Number.isFinite(factor)||factor<1||factor>3)return null;
 return {factor,gross:Math.round(ref.net*factor*1e8)/1e8,billReference:b.reference};
}
