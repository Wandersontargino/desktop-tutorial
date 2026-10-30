import {officialAgent} from './official-fio-b.ts';
export type EnergyTariffRow=Record<string,string>;
const norm=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
const rate=(v:string)=>Number(String(v).replace(',','.'));

export function ordinaryResidentialTariffs(rows:EnergyTariffRow[],agent:string,at:string){
 const seen=new Set<string>();
 return rows.filter(r=>{
  if(officialAgent(r.SigAgente||'')!==officialAgent(agent)||r.DscSubGrupo!=='B1'||r.DscModalidadeTarifaria!=='Convencional'||r.DscBaseTarifaria!=='Tarifa de Aplicação'||norm(r.DscClasse||'')!=='RESIDENCIAL'||norm(r.DscSubClasse||'')!=='RESIDENCIAL'||norm(r.DscDetalhe||'')!=='NAO SE APLICA'||r.DscUnidadeTerciaria!=='MWh'||r.DatInicioVigencia>at||r.DatFimVigencia<at||!Number.isFinite(rate(r.VlrTE))||rate(r.VlrTE)<=0||!Number.isFinite(rate(r.VlrTUSD))||rate(r.VlrTUSD)<0)return false;
  const key=[r.SigAgente,r.DatInicioVigencia,r.DatFimVigencia,r.VlrTE,r.VlrTUSD].join('|');
  if(seen.has(key))return false;seen.add(key);return true;
 }).sort((a,b)=>b.DatInicioVigencia.localeCompare(a.DatInicioVigencia));
}
