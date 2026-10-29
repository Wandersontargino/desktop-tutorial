import {automaticBackupMaintenance} from './automatic-backup.mjs';
import {mobileMcp} from './mobile-mcp.mjs';
import {recordOperationalMetric} from './operational-metrics.mjs';
import { todayMaintenance } from './authorized-today-20261027.mjs';
import { delmaFiveMaintenance } from './authorized-delma-five.mjs';
import { whatsapp } from './whatsapp.mjs';
import { crm } from './crm.mjs';
import { fatimaMaintenance } from './authorized-fatima.mjs';
import { crisDudaMaintenance } from './authorized-cris-duda.mjs';
import { monicaJoaoMaintenance } from './authorized-monica-joao.mjs';
import { lennoEduMaintenance } from './authorized-lenno-edu.mjs';
import { tenLeadersMaintenance } from './authorized-ten-leaders.mjs';
import { wanessaLinkMaintenance } from './authorized-wanessa-link.mjs';
import { electionProjection } from './election-projection.mjs';
import { resultsLive } from '../lib/results-live.mjs';
import { tseSection } from '../lib/tse-section.mjs';
import { quocientsLive } from '../lib/quocients-live.mjs';
import { buildBase, validateCity, cityPlaces } from '../lib/election-model.mjs';
const json = (value,status=200) => new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
const fail = (message,status=400) => Object.assign(new Error(message),{status});
const validOffice = o => ['estadual','federal'].includes(o);
const baseKey = o => `elections/${o}/manifest.json`;
const versionKey = (o,v) => `elections/${o}/versions/${v}/`;
async function getJSON(bucket,key) { const item=await bucket.get(key); return item?item.json():null; }
async function putJSON(bucket,key,value) { await bucket.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'}}); }
async function stateSnapshot(bucket,key,fallback) {
  const object=await bucket.get(key);return {value:object?await object.json():fallback,etag:object?.httpEtag||null};
}
async function manifest(bucket,o) { return (await stateSnapshot(bucket,baseKey(o),{revision:0,active:'bundled',versions:[]})).value; }
async function writeState(bucket,key,value,snapshot) {
  const conditions=new Headers(snapshot.etag?{'If-Match':snapshot.etag}:{'If-None-Match':'*'});
  const saved=await bucket.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'},onlyIf:conditions});
  if(!saved)throw fail('Os dados foram alterados em outro aparelho. Recarregue antes de salvar.',409);
}
function authenticate(request,write=false) {
  const user=request.headers.get('oai-authenticated-user-id');
  if(!user) throw fail('Entre na sua conta para acessar os dados salvos.',401);
  if(write) {
    const origin=request.headers.get('origin');
    if(origin && origin!==new URL(request.url).origin) throw fail('Origem da atualização inválida.',403);
    if(!request.headers.get('content-type')?.startsWith('application/json')) throw fail('Formato da solicitação inválido.',415);
  }
  return user;
}
async function readBody(request,limit=5000000) {
  if(Number(request.headers.get('content-length'))>limit) throw fail('Arquivo muito grande para esta etapa.',413);
  const reader=request.body?.getReader(); if(!reader)throw fail('Conteúdo ausente.');
  const chunks=[];let size=0;
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>limit){await reader.cancel();throw fail('Arquivo muito grande para esta etapa.',413);}chunks.push(value);}
  const bytes=new Uint8Array(size);let pos=0;for(const c of chunks){bytes.set(c,pos);pos+=c.length;}
  try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw fail('JSON inválido.');}
}
async function mapLimit(items,limit,fn){let next=0;const out=new Array(items.length);await Promise.all(Array.from({length:limit},async()=>{while(next<items.length){const i=next++;out[i]=await fn(items[i],i);}}));return out;}
const application={
  async fetch(request,env) {
    const url=new URL(request.url), path=url.pathname;
    if(path==='/mcp')return mobileMcp(request,env);
    if(path==='/api/maintenance/automatic-backup')return automaticBackupMaintenance(request,env);
    if(path==='/api/maintenance/today-20261027')return todayMaintenance(request,env);
    if(path==='/api/maintenance/fatima-aura-20261017')return fatimaMaintenance(request,env);
    if(path==='/api/maintenance/cris-duda-20261018')return crisDudaMaintenance(request,env);
    if(path==='/api/maintenance/monica-joao-coordenadores-20261018')return monicaJoaoMaintenance(request,env);
    if(path==='/api/maintenance/lenno-edu-20261018')return lennoEduMaintenance(request,env);
    if(path==='/api/maintenance/delma-five-20261019')return delmaFiveMaintenance(request,env);
    if(path==='/api/maintenance/ten-leaders-20261018')return tenLeadersMaintenance(request,env);
    if(path==='/api/maintenance/wanessa-link-20261018')return wanessaLinkMaintenance(request,env);
    if(path==='/api/integrations/whatsapp')return whatsapp(request,env);
    if(path.startsWith('/api/crm/'))return crm(request,env);
    try {
      if(path==='/api/results2026/progress')return await resultsLive(request);
      if(path==='/api/tse2026/section')return await tseSection(request);
      if(path==='/api/tse2026/quocients')return await quocientsLive(request);
      if(!path.startsWith('/api/')) {
        if(env.ASSETS) return env.ASSETS.fetch(request);
        if(path==='/'||path==='/index.html')return new Response(INITIAL_HTML,{headers:{'Content-Type':'text/html; charset=utf-8'}});
        return new Response('Não encontrado',{status:404});
      }
      const bucket=env.BUCKET; if(!bucket) throw fail('O armazenamento está indisponível. Tente novamente.',503);
      if(path==='/api/favorites') {
        const user=authenticate(request,request.method!=='GET');
        const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(user)))).map(x=>x.toString(16).padStart(2,'0')).join('');
        const key=`preferences/${hash}/favorites.json`;
        const snapshot=await stateSnapshot(bucket,key,{revision:0,items:[]}),saved=snapshot.value;
        if(request.method==='GET')return json(saved);
        if(request.method!=='PUT')throw fail('Método inválido.',405);
        const body=await readBody(request,1500000);
        if(body.revision!==saved.revision)throw fail('As consultas foram alteradas em outro aparelho. Recarregue a lista.',409);
        if(!Array.isArray(body.items)||body.items.length>50)throw fail('Salve até 50 consultas favoritas.');
        const items=body.items.map(item=>{
          if(!item || typeof item.id!=='string' || typeof item.label!=='string' || item.label.length>160 || !validOffice(item.office))throw fail('Consulta inválida.');
          const result={id:item.id.slice(0,80),label:item.label,office:item.office,year:2026,view:['overview','territory','regional','xray','comparison'].includes(item.view)?item.view:'overview'};
          for(const key of ['regionFilter','cityCode','candidateId','territoryZone','territorySection','territoryPlace','territoryNeighborhood']) result[key]=String(item[key]||'').slice(0,400);
          for(const field of ['territoryPlaces','selectionPlaces']){
            if(item[field]!==undefined&&(!Array.isArray(item[field])||item[field].length>10000||item[field].some(v=>typeof v!=='string'||!v.trim()||v.length>400)))throw fail('Seleção de escolas inválida.');
            result[field]=[...new Set(item[field]||[])];
          }
          result.compareCandidateIds=Array.isArray(item.compareCandidateIds)?item.compareCandidateIds.slice(0,3).map(x=>String(x).slice(0,30)):[];
          if(result.cityCode==='__selected__') {
            const allowed=new Set(TEMPLATES[item.office].municipalities.map(m=>String(m[0])));
            if(!Array.isArray(item.manualMunicipalityCodes)||!item.manualMunicipalityCodes.length||item.manualMunicipalityCodes.length>144)throw fail('Selecione de 1 a 144 municípios.');
            result.manualMunicipalityCodes=[...new Set(item.manualMunicipalityCodes.map(String))];
            if(result.manualMunicipalityCodes.some(code=>!allowed.has(code)))throw fail('Município inválido na seleção.');
            for(const field of ['selectionMunicipality','selectionZone','selectionPlaceSearch','selectionPlace'])result[field]=String(item[field]||'').slice(0,400);
            if(result.selectionMunicipality&&!result.manualMunicipalityCodes.includes(result.selectionMunicipality))throw fail('O município do filtro não pertence à seleção.');
            if(result.selectionZone&&!new RegExp('^('+result.manualMunicipalityCodes.join('|')+')\\|[1-9][0-9]{0,3}$').test(result.selectionZone))throw fail('Zona inválida na seleção.');
            for(const key of [...result.selectionPlaces,...(result.selectionPlace?[result.selectionPlace]:[])]){
              let school;try{school=JSON.parse(key);}catch{throw fail('Local de votação inválido.');}
              if(!Array.isArray(school)||school.length!==2||!result.manualMunicipalityCodes.includes(school[0])||typeof school[1]!=='string'||!school[1].trim())throw fail('Local de votação inválido na seleção.');
            }
            result.view='territory';result.regionFilter='';result.compareCandidateIds=[];
          }
          return result;
        });
        const result={revision:saved.revision+1,items};await writeState(bucket,key,result,snapshot);return json(result);
      }
      const route=path.match(/^\/api\/election\/(estadual|federal)(?:\/(.*))?$/);
      if(!route)throw fail('Consulta não encontrada.',404);
      const office=route[1], action=route[2]||'manifest';
      if(action==='projection')return await electionProjection(request,env,office);
      if(action.startsWith('data/')) {
        if(request.method!=='GET')throw fail('Método inválido.',405);
        const filename=action.slice(5);
        if(!/^(?:index|statewide|regional|places|candidate-names-2026|candidate-parties-2026|\d{4,5}|history-2022\/(?:\d{1,20}|zone-totals))\.json$/.test(filename))throw fail('Arquivo inválido.',404);
        const version=url.searchParams.get('version')||'bundled';
        const basePath=`/data/${office==='federal'?'federal/':''}${filename}`;
        if(version==='bundled'||filename==='candidate-names-2026.json'||filename==='candidate-parties-2026.json'||filename.startsWith('history-2022/'))return Response.redirect(new URL(basePath,url.origin),307);
        if(!/^[a-f0-9-]{36}$/.test(version))throw fail('Versão inválida.');
        const meta=await getJSON(bucket,versionKey(office,version)+'complete.json');if(!meta)throw fail('Versão não concluída.',404);
        let object=await bucket.get(versionKey(office,version)+filename);
        if(!object&&filename==='places.json'){
          const cacheKey=`elections/${office}/search/${version}/places.json`;object=await bucket.get(cacheKey);
          if(!object){const lists=await mapLimit(TEMPLATES[office].municipalities,4,async([code])=>{const city=await getJSON(bucket,versionKey(office,version)+code+'.json');if(!city)throw fail('Município indisponível nesta versão.',404);return cityPlaces(city);});await putJSON(bucket,cacheKey,{electionYear:2026,office,turn:1,places:lists.flat()});object=await bucket.get(cacheKey);}
        }
        if(!object)throw fail('Arquivo indisponível nesta versão.',404);
        return new Response(object.body,{headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
      }
      authenticate(request,request.method!=='GET');
      if(request.method!=='GET' && request.headers.get('oai-authenticated-user-email')?.toLowerCase()!=='wanderson.targino@gmail.com')throw fail('Somente o responsável pode atualizar ou recuperar a base eleitoral.',403);
      const snapshot=await stateSnapshot(bucket,baseKey(office),{revision:0,active:'bundled',versions:[]}),current=snapshot.value;
      if(action==='manifest'&&request.method==='GET')return json(current);
      if(action==='begin'&&request.method==='POST') {
        const body=await readBody(request,10000);
        if(body.revision!==current.revision)throw fail('A base mudou. Atualize a prévia antes de importar.',409);
        if(body.year!==2026||body.turn!==1||body.office!==office)throw fail('Use o cargo selecionado, ano 2026 e 1º turno.');
        const version=crypto.randomUUID();
        const session={office,version,revision:current.revision,createdAt:new Date().toISOString(),sourceFile:String(body.sourceFile||'').slice(0,160),sourceGeneration:String(body.sourceGeneration||'').slice(0,160),locationsSource:String(body.locationsSource||'').slice(0,160)};
        await putJSON(bucket,versionKey(office,version)+'session.json',session);return json(session,201);
      }
      if(action==='restore'&&request.method==='POST') {
        const body=await readBody(request,10000);
        if(body.revision!==current.revision)throw fail('A base foi alterada em outro aparelho. Recarregue.',409);
        if(body.version!=='bundled'&&!current.versions.some(v=>v.version===body.version))throw fail('Versão inexistente.');
        if(body.version!=='bundled'&&!await getJSON(bucket,versionKey(office,body.version)+'complete.json'))throw fail('Esta versão não está completa.');
        const next={...current,active:body.version,revision:current.revision+1,updatedAt:new Date().toISOString()};await writeState(bucket,baseKey(office),next,snapshot);return json(next);
      }
      const upload=action.match(/^versions\/([a-f0-9-]{36})\/(cities\/(\d{4,5})|finish)$/);
      if(!upload)throw fail('Operação inexistente.',404);
      const version=upload[1],prefix=versionKey(office,version);
      const session=await getJSON(bucket,prefix+'session.json');if(!session)throw fail('Importação inexistente.');
      if(await getJSON(bucket,prefix+'complete.json'))throw fail('Esta versão já foi concluída.',409);
      if(current.revision!==session.revision)throw fail('Outra atualização foi aplicada. Gere uma nova prévia.',409);
      if(upload[3]&&request.method==='PUT') {
        const city=await readBody(request);
        if(String(city.m?.[0])!==upload[3])throw fail('Código municipal divergente.');
        const summary=validateCity(city,office,new Set(TEMPLATES[office].municipalities.map(m=>String(m[0]))));
        const saved=await bucket.put(prefix+upload[3]+'.json',JSON.stringify(city),{httpMetadata:{contentType:'application/json'},onlyIf:new Headers({'If-None-Match':'*'})});
        if(!saved)throw fail('Este município já foi enviado nesta importação. Gere uma nova prévia para repetir o envio.',409);
        await putJSON(bucket,prefix+'summaries/'+upload[3]+'.json',summary);return json({code:summary.code,votes:summary.votes});
      }
      if(upload[2]==='finish'&&request.method==='POST') {
        await readBody(request,10000);
        const summaries=await mapLimit(TEMPLATES[office].municipalities,6,async([code])=>{const s=await getJSON(bucket,prefix+'summaries/'+code+'.json');if(!s)throw fail('Importação incompleta: falta o município '+code+'.');return s;});
        const provenance={...session,appliedAt:new Date().toISOString(),year:2026,turn:1};
        const base=buildBase(summaries,office,TEMPLATES[office],provenance);
        for(const [name,data]of Object.entries(base))await putJSON(bucket,prefix+name+'.json',data);
        const meta={version,createdAt:provenance.appliedAt,sourceFile:session.sourceFile,sourceGeneration:session.sourceGeneration,totals:base.index.totals};
        const latestSnapshot=await stateSnapshot(bucket,baseKey(office),{revision:0,active:'bundled',versions:[]}),latest=latestSnapshot.value;if(latest.revision!==session.revision)throw fail('A base mudou durante a importação. Faça uma nova prévia.',409);
        await putJSON(bucket,prefix+'complete.json',meta);
        const next={revision:latest.revision+1,active:version,updatedAt:provenance.appliedAt,versions:[meta,...latest.versions].slice(0,20)};
        await writeState(bucket,baseKey(office),next,latestSnapshot);return json(next);
      }
      throw fail('Método inválido.',405);
    } catch(error) { if(!error.status)console.error('Falha na base eleitoral:',error.message);return json({error:error.status?error.message:'Não foi possível concluir. Seus dados anteriores foram preservados.'},error.status||400); }
  }
};

export default {async fetch(request,env,context){
  const start=Date.now();let response;
  try{response=await application.fetch(request,env);}catch{response=json({error:'Não foi possível concluir a operação. As edições locais foram preservadas.'},503);}
  const task=recordOperationalMetric(env,{path:new URL(request.url).pathname,method:request.method,status:response.status,elapsed:Date.now()-start}).catch(()=>{});
  if(context?.waitUntil)context.waitUntil(task);else await task;
  return response;
}};
