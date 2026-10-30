import type {SolarInput} from './solar';
export type MaterialItem={id:string;description:string;specification:string;quantity:number;unit:string;unitCost:number|null;includedInBase:boolean};
export function materialCostSummary(p:SolarInput){const rows=p.materials??[];return {extra:rows.reduce((s,r)=>s+(r.includedInBase?0:r.quantity*(r.unitCost??0)),0),pending:rows.filter(r=>r.quantity>0&&(r.unitCost===null||!r.specification.trim())),rows};}
export function materialTemplates():MaterialItem[]{return [
 ['cable_dc','Cabo solar CC','m'],['cable_ac','Cabo de energia CA','m'],['connector','Conectores CC compatíveis','par'],['dps','DPS e proteções CC/CA','un'],['breaker','Disjuntores / seccionamento','un'],['earth','Aterramento e equipotencialização','conjunto'],['mount','Estrutura e fixadores','conjunto'],
 ].map(([id,description,unit])=>({id,description,specification:'',quantity:0,unit,unitCost:null,includedInBase:true}));}
