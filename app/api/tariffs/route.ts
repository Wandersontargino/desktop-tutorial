import {getChatGPTUser} from '@/app/chatgpt-auth';
import {officialAgent} from '@/lib/official-fio-b';
import {ordinaryResidentialTariffs} from '@/lib/official-energy-tariff';
export const dynamic='force-dynamic';
export async function GET(request:Request){
 if(!await getChatGPTUser())return Response.json({error:'Autenticação necessária.'},{status:401});
 const agent=new URL(request.url).searchParams.get('agent')||'Equatorial PA';
 if(!/^[\p{L}\p{N} ._-]{2,70}$/u.test(agent))return Response.json({error:'Distribuidora inválida.'},{status:400});
 const url=new URL('https://dadosabertos.aneel.gov.br/api/3/action/datastore_search');
 url.searchParams.set('resource_id','fcf2906c-7c32-4b9b-a637-054e7a5234f4');url.searchParams.set('filters',JSON.stringify({SigAgente:officialAgent(agent),DscSubGrupo:'B1',DscModalidadeTarifaria:'Convencional',DscBaseTarifaria:'Tarifa de Aplicação',DscClasse:'Residencial',DscSubClasse:'Residencial'}));url.searchParams.set('sort','DatInicioVigencia desc');url.searchParams.set('limit','80');
 try{const response=await fetch(url,{signal:AbortSignal.timeout(18000)});if(!response.ok)throw new Error();const data=await response.json() as {success:boolean;result?:{records:Record<string,string>[]}};if(!data.success)throw new Error();const today=new Date().toISOString().slice(0,10),rows=ordinaryResidentialTariffs(data.result?.records||[],agent,today);return Response.json({rows:rows.slice(0,8),source:'https://dadosabertos.aneel.gov.br/dataset/tarifas-distribuidoras-energia-eletrica',note:'TE e TUSD de consumo residencial convencional, sem tributos. Linhas específicas SCEE e descontos sociais são excluídos desta tarifa integral. Fio B é uma componente da TUSD, não a TUSD completa. Confira a fatura.'},{headers:{'Cache-Control':'private,max-age=3600'}});}
 catch{return Response.json({error:'A consulta ANEEL está indisponível agora. Cadastre a tarifa da fatura ou importe uma tabela; nenhum valor foi atualizado.'},{status:502});}
}
