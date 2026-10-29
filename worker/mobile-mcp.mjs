import {crm} from './crm.mjs';
const allowed=new Map(Object.entries({session:['GET','POST','DELETE'],records:['GET'],sync:['POST'],quality:['GET','POST'],duplicates:['GET','POST'],audit:['GET'],'audit-index':['GET'],partnerships:['GET','POST'],'leadership-locations':['GET','POST'],operations:['GET'],'automatic-backups':['GET','POST'],'automatic-backups/key':['POST'],'duplicates/backup':['GET'],'groups/correct':['POST'],cep:['GET'],address:['GET'],'recovery-backup':['GET','POST'],'recovery-metadata':['POST'],members:['GET','POST'],security:['GET','POST'],submissions:['GET','POST'],links:['GET','POST']}));
const tool={name:'platform_mobile_api',description:'Transporte autenticado para o aplicativo Android instalado. Mantém senha, MFA, perfis e revisões da base. A autenticação OAuth do Site e a sessão da base são obrigatórias.',inputSchema:{type:'object',properties:{path:{type:'string',maxLength:500},method:{enum:['GET','POST','DELETE']},payload:{type:'object'},session:{type:'string',maxLength:64}},required:['path','method'],additionalProperties:false},annotations:{readOnlyHint:false,destructiveHint:true,idempotentHint:false,openWorldHint:false}};
export async function mobileMcp(request,env){
 const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 if(request.method!=='POST')return reply({error:'Use POST.'},405);
 let input;try{const text=await request.text();if(text.length>6*1024*1024)throw Error();input=JSON.parse(text);}catch{return reply({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Solicitação inválida.'}},400);}
 const id=input.id??null,result=value=>reply({jsonrpc:'2.0',id,result:value}),failure=(code,message)=>reply({jsonrpc:'2.0',id,error:{code,message}});
 if(input.jsonrpc!=='2.0')return failure(-32600,'Protocolo inválido.');
 if(input.method==='server/discover')return result({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
 if(input.method==='initialize')return result({protocolVersion:'2025-11-25',capabilities:{tools:{}},serverInfo:{name:'eleitoral-para-mobile',version:'2.16.0'}});
 if(input.method==='notifications/initialized')return new Response(null,{status:202});
 if(input.method==='tools/list')return result({tools:[tool]});
 if(!request.headers.get('oai-authenticated-user-id')||!request.headers.get('oai-authenticated-user-email'))return reply({error:'Acesso autenticado ao Site necessário.'},401);
 if(input.method!=='tools/call'||input.params?.name!==tool.name)return failure(-32601,'Operação não encontrada.');
 try{
  const data=input.params.arguments||{},path=String(data.path||''),method=data.method;
  if(Object.keys(data).some(k=>!['path','method','payload','session'].includes(k))||!/^[-a-z]+(?:\/[-a-z]+)?(?:\?[^#]*)?$/.test(path)||path.length>500)throw Error('Operação inválida.');
  const endpoint=path.split('?')[0];if(!allowed.get(endpoint)?.includes(method))throw Error('Operação não habilitada para o aplicativo.');
  if(data.session&&!/^[a-f0-9]{64}$/.test(data.session))throw Error('Sessão inválida.');
  if(method==='GET'&&data.payload!==undefined)throw Error('Consulta inválida.');
  const origin=new URL(request.url).origin,headers=new Headers({'Origin':origin,'Content-Type':'application/json'});
  for(const key of ['oai-authenticated-user-id','oai-authenticated-user-email'])headers.set(key,request.headers.get(key));
  if(data.session)headers.set('Cookie','__Host-pa-session='+data.session);
  const response=await crm(new Request(origin+'/api/crm/'+path,{method,headers,body:method==='GET'?undefined:JSON.stringify(data.payload||{})}),env),body=await response.json();
  const cookie=response.headers.get('Set-Cookie'),session=cookie?.match(/__Host-pa-session=([a-f0-9]{64})/),value={status:response.status,body};
  if(session)value.session=session[1];else if(cookie)value.session='';
  return result({content:[{type:'text',text:JSON.stringify(value)}],isError:false});
 }catch(error){return result({content:[{type:'text',text:JSON.stringify({status:400,body:{error:'Não foi possível processar esta operação do aplicativo.'}})}],isError:true});}
}
