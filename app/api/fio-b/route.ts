import {getChatGPTUser} from '@/app/chatgpt-auth';
import {officialAgent,selectOfficialFioB} from '@/lib/official-fio-b';
import snapshot from '@/lib/data/fio-b-equatorial-pa-2026.json';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 if(!await getChatGPTUser())return Response.json({error:'Entre na sua conta para consultar a referência oficial.'},{status:401});
 const params=new URL(request.url).searchParams,agent=officialAgent(params.get('agent')||''),group=params.get('group')||'B1',at=params.get('at')||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Fortaleza'}).format(new Date()),social=params.get('social')==='1';
 if(!/^[A-Z0-9 ._-]{2,70}$/.test(agent)||!/^B[123]$/.test(group)||!/^20\d{2}-\d{2}-\d{2}$/.test(at)||!Number.isFinite(Date.parse(at))||new Date(at).toISOString().slice(0,10)!==at)return Response.json({error:'Confira concessionária, subgrupo B1/B2/B3 e data de vigência.'},{status:400});
 const base='https://dadosabertos.aneel.gov.br/api/3/action/';
 try{
  const year=at.slice(0,4),catalog=new URL(base+'package_show');catalog.searchParams.set('id','componentes-tarifarias');
  const metadata=await fetch(catalog,{signal:AbortSignal.timeout(12000)});if(!metadata.ok)throw new Error();
  const m=await metadata.json() as {success:boolean;result?:{resources:{id:string;name:string}[]}};
  const resources=[year,String(Number(year)-1)].map(y=>m.result?.resources.find(r=>r.name===`componentes-tarifarias-${y}.csv`)).filter(Boolean);if(!m.success||!resources.length)throw new Error();
  for(const resource of resources){
   const url=new URL(base+'datastore_search');url.searchParams.set('resource_id',resource!.id);url.searchParams.set('filters',JSON.stringify({SigNomeAgente:agent,DscSubGrupoTarifario:group,DscComponenteTarifario:'TUSD_FioB',DscBaseTarifaria:'Tarifa de Aplicação',DscModalidadeTarifaria:'Convencional'}));url.searchParams.set('limit','100');
   const response=await fetch(url,{signal:AbortSignal.timeout(18000)});if(!response.ok)throw new Error();const d=await response.json() as {success:boolean;result?:{records:Record<string,string>[];total:number}};
   if(!d.success||!d.result||d.result.total>100)throw new Error();const reference=selectOfficialFioB(d.result.records,agent,group,at,social);
   if(reference)return Response.json({reference:{...reference,retrieval:'live'},note:'Componente integral sem tributos, convertida de R$/MWh para R$/kWh. O percentual de transição e a tributação são aplicados separadamente na simulação.'},{headers:{'Cache-Control':'private,max-age=3600','X-Content-Type-Options':'nosniff'}});
  }
  return Response.json({error:'Nenhuma componente única e vigente foi confirmada para esta classe e data. Confira a tabela oficial; nenhum valor foi aplicado.'},{status:404});
 }catch{const reference=selectOfficialFioB(snapshot.records,agent,group,at,social);if(reference)return Response.json({reference:{...reference,retrieval:'snapshot',capturedAt:snapshot.capturedAt,source:snapshot.source},note:'Consulta em tempo real indisponível. Referência oficial arquivada, com fonte e data de conferência explícitas.'},{headers:{'Cache-Control':'private,max-age=300'}});return Response.json({error:'A consulta da ANEEL não respondeu de forma válida. Os valores atuais foram preservados; tente novamente ou informe a componente conferida.'},{status:502});}
}
