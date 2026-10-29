import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { database } from './database.mjs';
import { cleanRecord, assess, titleIndex, coordinatorIndex, quality, normalize } from '../lib/crm-model.mjs';
import {lookupCep} from './cep.mjs';
import {lookupAddress} from './address.mjs';
import {cleanPartnership,groupId} from '../lib/group-partnership.mjs';
import {cleanLeadershipLocation} from '../lib/leadership-location.mjs';
import LEADERSHIP_GEOGRAPHY from '../public/pa-municipal-map.json';
import INITIAL_LEADERSHIP from './initial-leadership.mjs';
import { applyAuthorizedImport } from './authorized-import.mjs';
import { applySancleiReconciliation } from './authorized-sanclei.mjs';
import { applyPastorImport } from './authorized-pastor.mjs';
import {mfaState,verifyMfa,security} from './security.mjs';
import {correctGroup} from './group-admin.mjs';
import {readDuplicates,updateDuplicates,duplicateBackup} from './duplicate-records.mjs';
import {readCrmSnapshot} from './crm-snapshot.mjs';
import {creationDate} from '../lib/crm-recovery.mjs';
import {protectRecovery,recoveryBackup,restoreMetadata} from './crm-recovery.mjs';
import {qualityAssignees,saveQualityReview} from './quality-workflow.mjs';
import {listAutomaticBackups,createAutomaticBackup,verifyAutomaticBackup,downloadAutomaticBackup} from './automatic-backup.mjs';
import {readOperationalMetrics} from './operational-metrics.mjs';
const OWNER='owner@example.test',COOKIE='__Host-pa-session';
const error=(message,status=400,details)=>Object.assign(new Error(message),{status,details});
const reply=(data,status=200,extra={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff',...extra}});
const now=()=>new Date().toISOString(),hex=bytes=>[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32))),digest=s=>hex(sha256(new TextEncoder().encode(s)));
const safeUser=u=>({id:u.id,email:u.email,name:u.name,role:u.role,scope:u.scope});
function identity(req){const id=req.headers.get('oai-authenticated-user-id'),email=req.headers.get('oai-authenticated-user-email')?.toLowerCase();if(!id||!email)throw error('Entre com sua conta autorizada para continuar.',401);return {id,email};}
function writeGuard(req){if(req.headers.get('origin')!==new URL(req.url).origin)throw error('Origem da solicitação inválida.',403);if(!req.headers.get('content-type')?.startsWith('application/json'))throw error('Use o formulário da plataforma.',415);}
async function body(req,max=3000000){writeGuard(req);if(+req.headers.get('content-length')>max)throw error('Envio muito grande.',413);const reader=req.body?.getReader();if(!reader)throw error('Conteúdo ausente.');let length=0,chunks=[];while(true){const r=await reader.read();if(r.done)break;length+=r.value.length;if(length>max){await reader.cancel();throw error('Envio muito grande.',413);}chunks.push(r.value);}const bytes=new Uint8Array(length);let p=0;for(const c of chunks){bytes.set(c,p);p+=c.length;}try{return JSON.parse(new TextDecoder().decode(bytes));}catch{throw error('Dados inválidos.');}}
async function member(db,id){return db.first('SELECT * FROM crm_users WHERE email=?',[id.email]);}
async function actor(req,db){
  const id=identity(req),u=await member(db,id);if(!u||u.disabled)throw error('Seu acesso à base foi desativado ou não foi autorizado.',403);if(!u.password_hash)throw error('Desbloqueie sua base com a senha.',401);
  const token=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
  if(!token||!/^[a-f0-9]{64}$/.test(token))throw error('Desbloqueie sua base com a senha.',401);
  const session=await db.first('SELECT * FROM crm_sessions WHERE token=? AND expires>?',[digest(token),Date.now()]);
  if(!session||session.user_id!==u.id||session.version!==u.version||u.id!==id.id)throw error('Sua sessão terminou. Entre novamente.',401);return u;
}
function can(u,r){return u.role==='owner'||u.role==='coordinator'&&normalize(r.coordinator)===normalize(u.scope)||u.role==='leader'&&normalize(r.leadership)===normalize(u.scope);}
function owner(u){if(u.role!=='owner')throw error('Somente o responsável pode realizar esta operação.',403);}
async function locationMap(env){return LOCATION_INDEX.locations;}
async function snapshot(db,env,u){
  return {...await readCrmSnapshot(db,await locationMap(env),u),locationSource:LOCATION_INDEX.generation};
}
async function saveLeadershipLocation(req,db,env,u){
  const data=await body(req,10000);let point;try{point=cleanLeadershipLocation(data,LEADERSHIP_GEOGRAPHY.features);}catch(e){throw error(e.message);}
  const operationId='leadership-location-'+String(data.operationId||'');
  if(!/^leadership-location-[-a-zA-Z0-9]{12,100}$/.test(operationId))throw error('Identificador da atualização inválido.');
  const previous=await db.first('SELECT * FROM crm_operations WHERE id=?',[operationId]);
  if(previous){if(previous.user_id!==u.id)throw error('Operação de outro usuário.',403);return reply({saved:true,snapshot:await snapshot(db,env,u)});}
  const records=(await db.all('SELECT payload FROM crm_records WHERE deleted=0',[])).map(row=>JSON.parse(row.payload));
  if(!can(u,point)||!records.some(r=>groupId(r)===point.id&&can(u,r)))throw error('Escolha uma liderança ativa do seu acesso.',403);
  const old=await db.first('SELECT payload,version FROM crm_leadership_locations WHERE id=?',[point.id]);
  if((old?.version||0)!==point.version)throw error('O local foi alterado em outro aparelho. Consulte a versão central e confira o rascunho antes de salvar.',409);
  const expected=point.version,token=random(),stamp=now();point.version++;point.updatedAt=stamp;point.updatedBy=u.name;
  const guard='EXISTS(SELECT 1 FROM crm_leadership_locations WHERE id=? AND commit_token=?)';
  const applied=await db.batch([
    ['INSERT INTO crm_leadership_locations(id,leadership,coordinator,payload,version,commit_token,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,version=excluded.version,commit_token=excluded.commit_token,updated_at=excluded.updated_at WHERE crm_leadership_locations.version=?',[point.id,point.leadership,point.coordinator,JSON.stringify(point),point.version,token,stamp,expected]],
    [`INSERT INTO crm_audit(id,record_id,user_id,user_name,before_value,after_value,operation,created_at) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`,[crypto.randomUUID(),'leadership-location:'+digest(point.id),u.id,u.name,old?.payload||null,JSON.stringify({...point,name:'Local de '+point.leadership}),'local-lideranca',stamp,point.id,token]],
    [`INSERT INTO crm_operations(id,user_id,result,created_at) SELECT ?,?,?,? WHERE ${guard}`,[operationId,u.id,JSON.stringify({saved:true}),stamp,point.id,token]]
    ,["UPDATE crm_state SET revision=revision+1 WHERE id='main' AND "+guard,[point.id,token]]
  ]);
  if(!applied[0].meta?.changes)throw error('Outra atualização chegou ao mesmo tempo. Consulte a versão central antes de salvar.',409);
  return reply({saved:true,snapshot:await snapshot(db,env,u)});
}
async function partnershipCandidate(env,office,id,version){
  const manifest=await env.BUCKET?.get(`elections/${office}/manifest.json`),active=manifest?(await manifest.json()).active:'bundled';
  if(version!==active)throw error('A base eleitoral mudou. Atualize a lista de candidatos antes de salvar a parceria.',409);
  let candidates=CANDIDATE_CATALOG[office];
  if(active!=='bundled'){
    const object=await env.BUCKET.get(`elections/${office}/versions/${active}/statewide.json`);
    if(!object)throw error('Base ativa indisponível para conferir o candidato.',503);
    const data=await object.json();if(data.electionYear!==2026||data.office!==office)throw error('Ano ou cargo incompatível na base ativa.',409);candidates=data.candidates;
  }
  const candidate=candidates.find(c=>String(c[0])===id);if(!candidate)throw error('Candidato não encontrado no cargo e na versão selecionados.');
  return {id:String(candidate[0]),number:String(candidate[1]),name:candidate[2]};
}
async function savePartnership(req,db,env,u){
  const data=await body(req,10000);let pair;try{pair=cleanPartnership(data);}catch(e){throw error(e.message);}
  const operationId='partnership-'+String(data.operationId||'');
  if(!/^partnership-[-a-zA-Z0-9]{12,100}$/.test(operationId))throw error('Identificador da atualização inválido.');
  const oldOperation=await db.first('SELECT * FROM crm_operations WHERE id=?',[operationId]);
  if(oldOperation){if(oldOperation.user_id!==u.id)throw error('Operação de outro usuário.',403);return reply({saved:true,snapshot:await snapshot(db,env,u)});}
  const records=(await db.all('SELECT payload FROM crm_records WHERE deleted=0',[])).map(row=>JSON.parse(row.payload));
  if(!can(u,pair)||!records.some(r=>groupId(r)===pair.id&&can(u,r)))throw error('Escolha um grupo ativo do seu acesso.',403);
  const old=await db.first('SELECT payload,version FROM crm_partnerships WHERE id=?',[pair.id]);
  if((old?.version||0)!==pair.version)throw error('A parceria foi alterada em outro aparelho. Recarregue a parceria central e confira antes de salvar.',409);
  for(const office of ['estadual','federal']){
    const found=await partnershipCandidate(env,office,pair[office].id,data.sourceVersions?.[office]);
    if(found.number!==pair[office].number||normalize(found.name)!==normalize(pair[office].name))throw error('A identificação do candidato não confere com a base do cargo.');pair[office]=found;
  }
  const token=random(),stamp=now(),expected=pair.version;
  pair.version++;pair.updatedAt=stamp;pair.updatedBy=u.name;pair.sourceVersions=data.sourceVersions;
  const guard='EXISTS(SELECT 1 FROM crm_partnerships WHERE id=? AND commit_token=?)';
  const applied=await db.batch([
    ['INSERT INTO crm_partnerships(id,leadership,coordinator,payload,version,commit_token,updated_at) VALUES(?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,version=excluded.version,commit_token=excluded.commit_token,updated_at=excluded.updated_at WHERE crm_partnerships.version=?',[pair.id,pair.leadership,pair.coordinator,JSON.stringify(pair),pair.version,token,stamp,expected]],
    [`INSERT INTO crm_audit(id,record_id,user_id,user_name,before_value,after_value,operation,created_at) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`,[crypto.randomUUID(),'partnership:'+digest(pair.id),u.id,u.name,old?.payload||null,JSON.stringify({...pair,name:'Parceria de '+pair.leadership}),'parceria',stamp,pair.id,token]],
    [`INSERT INTO crm_operations(id,user_id,result,created_at) SELECT ?,?,?,? WHERE ${guard}`,[operationId,u.id,JSON.stringify({saved:true}),stamp,pair.id,token]]
    ,["UPDATE crm_state SET revision=revision+1 WHERE id='main' AND "+guard,[pair.id,token]]
  ]);
  if(!applied[0].meta?.changes)throw error('Outra atualização da parceria chegou ao mesmo tempo. Recarregue e confira sua seleção.',409);
  return reply({saved:true,snapshot:await snapshot(db,env,u)});
}
async function issueSession(db,u){const token=random();await db.run('INSERT INTO crm_sessions(token,user_id,version,expires) VALUES(?,?,?,?)',[digest(token),u.id,u.version,Date.now()+12*3600000]);return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=43200`;}
async function passwordHash(password,salt){return hex(await pbkdf2Async(sha256,password,salt,{c:600000,dkLen:32,asyncTick:10}));}
function password(value){if(typeof value!=='string'||value.length<12||value.length>200)throw error('Use uma senha com 12 a 200 caracteres. Uma frase longa é mais fácil de lembrar.');return value;}
function equal(a,b){if(a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;}
async function seed(db,u){
  await db.run("INSERT OR IGNORE INTO crm_state(id,revision,commit_token,seeded) VALUES('main',0,'',0)",[]);
  const state=await db.first("SELECT * FROM crm_state WHERE id='main'",[]);if(state.seeded)return;
  const token=random(),stamp=now();
  const commands=[["UPDATE crm_state SET seeded=1,revision=revision+1,commit_token=? WHERE id='main' AND seeded=0",[token]]];
  for(const input of INITIAL_LEADERSHIP){const r=cleanRecord(input);commands.push(["INSERT OR IGNORE INTO crm_records(id,leadership,coordinator,name,title,payload,version,deleted,updated_at) SELECT ?,?,?,?,?,?,1,0,? WHERE EXISTS(SELECT 1 FROM crm_state WHERE id='main' AND commit_token=?)",[r.id,r.leadership,r.coordinator,r.name,r.title,JSON.stringify(r),stamp,token]]);}
  await db.batch(commands);
}
async function sync(req,db,env,u){
  const data=await body(req);if(typeof data.operationId!=='string'||!/^[-a-zA-Z0-9]{12,100}$/.test(data.operationId))throw error('Identificador da atualização inválido.');
  const priorOperation=await db.first('SELECT * FROM crm_operations WHERE id=?',[data.operationId]);if(priorOperation){if(priorOperation.user_id!==u.id)throw error('Operação de outro usuário.',403);return reply({...JSON.parse(priorOperation.result),snapshot:await snapshot(db,env,u)});}
  if(!Number.isSafeInteger(data.revision)||!Array.isArray(data.changes)||!data.changes.length||data.changes.length>200)throw error('Envie de 1 a 200 alterações por etapa.');
  const state=await db.first("SELECT * FROM crm_state WHERE id='main'",[]);if(data.revision!==state.revision)throw error('A base central mudou. Confira as alterações antes de sincronizar.',409,{revision:state.revision});
  const ids=new Set(),changes=[];const stamp=now();
  for(const input of data.changes){
    const r=cleanRecord(input);if(!r.id||!/^[-a-zA-Z0-9]{1,80}$/.test(r.id)||ids.has(r.id))throw error('ID repetido ou inválido.');ids.add(r.id);
    const old=await db.first('SELECT * FROM crm_records WHERE id=?',[r.id]);
    if(old&&!can(u,JSON.parse(old.payload))||!can(u,r))throw error('Esta liderança não pertence ao seu acesso.',403);
    if(u.role==='leader'){
      const reference=old?JSON.parse(old.payload):await db.first('SELECT coordinator FROM crm_records WHERE leadership=? AND deleted=0 LIMIT 1',[u.scope]);
      if(!reference||normalize(r.coordinator)!==normalize(reference.coordinator))throw error('A liderança não pode mudar sua coordenação.',403);
    }
    if(old&&old.version!==r.version||!old&&r.version!==0)throw error('Um cadastro foi atualizado em outro aparelho. Revise as duas versões.',409,{recordId:r.id});
    if(data.recoveryCreatedAt!==undefined&&u.role!=='owner')throw error('Somente o responsável pode recuperar datas de inclusão.',403);
    const recoveredDate=data.recoveryCreatedAt?.[r.id]===undefined?null:creationDate(data.recoveryCreatedAt[r.id]);
    changes.push({r,old:old?JSON.parse(old.payload):null,version:(old?.version||0)+1,createdAt:old?.created_at||recoveredDate||(!old?stamp:null)});
  }
  const commit=random(),next=state.revision+1,result={revision:next,applied:changes.length,operationId:data.operationId};
  const commands=[["UPDATE crm_state SET revision=?,commit_token=? WHERE id='main' AND revision=?",[next,commit,state.revision]]];
  const guard="EXISTS(SELECT 1 FROM crm_state WHERE id='main' AND commit_token=?)";
  for(const {r,old,version,createdAt}of changes){
    commands.push([`INSERT INTO crm_records(id,leadership,coordinator,name,title,payload,version,deleted,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,? WHERE ${guard} ON CONFLICT(id) DO UPDATE SET leadership=excluded.leadership,coordinator=excluded.coordinator,name=excluded.name,title=excluded.title,payload=excluded.payload,version=excluded.version,deleted=excluded.deleted,created_at=COALESCE(crm_records.created_at,excluded.created_at),updated_at=excluded.updated_at`,[r.id,r.leadership,r.coordinator,r.name,r.title,JSON.stringify(r),version,+r.deleted,createdAt,stamp,commit]]);
    commands.push([`INSERT INTO crm_audit(id,record_id,user_id,user_name,before_value,after_value,operation,created_at) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`,[crypto.randomUUID(),r.id,u.id,u.name,old?JSON.stringify(old):null,JSON.stringify({...r,version}),r.deleted?'arquivar':old?'atualizar':'cadastrar',stamp,commit]]);
  }
  commands.push([`INSERT INTO crm_operations(id,user_id,result,created_at) SELECT ?,?,?,? WHERE ${guard}`,[data.operationId,u.id,JSON.stringify(result),stamp,commit]]);
  const applied=await db.batch(commands);if(!applied[0].meta?.changes)throw error('Outra atualização chegou ao mesmo tempo. Seus dados foram preservados para revisão.',409);
  return reply({...result,snapshot:await snapshot(db,env,u)});
}
export async function crm(req,env){
  const path=new URL(req.url).pathname;if(!path.startsWith('/api/crm/'))return null;
  try{
    const db=database(env),id=identity(req);
    if(path==='/api/crm/session'){
      let u=await member(db,id);
      if(req.method==='GET'){
        if(u?.disabled||!u&&id.email!==OWNER)throw error('Seu acesso à base de lideranças ainda não foi autorizado pelo responsável.',403);
        let active=false;try{if(u)await actor(req,db);active=!!u;}catch{}
        return reply({user:u?safeUser(u):{...id,name:'RESPONSÁVEL DE EXEMPLO',role:'owner',scope:''},needsSetup:!u?.password_hash,mfaEnabled:!!(u&&(await mfaState(db,u))?.enabled),unlocked:active,integrations:{whatsapp:Boolean(env.WHATSAPP_APP_SECRET&&env.WHATSAPP_ACCESS_TOKEN&&env.WHATSAPP_PHONE_ID&&env.WHATSAPP_VERIFY_TOKEN&&env.WHATSAPP_GRAPH_VERSION),ocr:true}});
      }
      if(req.method==='DELETE'){
        await body(req,1000);const token=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);
        if(u&&token&&/^[a-f0-9]{64}$/.test(token))await db.run('DELETE FROM crm_sessions WHERE user_id=? AND token=?',[u.id,digest(token)]);
        return reply({locked:true},200,{'Set-Cookie':`${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`});
      }
      if(req.method!=='POST')throw error('Método inválido.',405);
      const data=await body(req,6000),pass=password(data.password);
      if(data.email?.toLowerCase()!==id.email)throw error('Use o e-mail da conta autorizada que está acessando o site.',403);
      if(u?.disabled||!u&&id.email!==OWNER)throw error('Acesso não autorizado.',403);
      const key=digest(id.id),attempt=await db.first('SELECT * FROM crm_attempts WHERE key=?',[key]);
      if(attempt&&attempt.until>Date.now()&&attempt.count>=5)throw error('Muitas tentativas. Aguarde 15 minutos antes de tentar novamente.',429);
      if(!u?.password_hash){
        const salt=random(),hash=await passwordHash(pass,salt);
        if(!u){
          await db.run('INSERT OR IGNORE INTO crm_users(id,email,name,role,scope,password_hash,salt,created_at) VALUES(?,?,?,?,?,?,?,?)',[id.id,id.email,'RESPONSÁVEL DE EXEMPLO','owner','',hash,salt,now()]);
        }else{
          await db.run('UPDATE crm_users SET id=?,password_hash=?,salt=?,version=version+1 WHERE email=? AND password_hash IS NULL',[id.id,hash,salt,id.email]);
        }
        u=await member(db,id);
        if(!equal(u.password_hash,hash))throw error('A senha já foi definida em outro acesso. Entre com ela.',409);
        if(u.role==='owner')await seed(db,u);
      }else{
        const check=await passwordHash(pass,u.salt);
        if(!equal(check,u.password_hash)||u.id!==id.id){
          const count=attempt&&attempt.until>Date.now()?attempt.count+1:1;
          await db.run('INSERT INTO crm_attempts(key,count,until) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,until=excluded.until',[key,count,Date.now()+900000]);throw error('E-mail ou senha não conferem.',401);
        }
      }
      if(!await verifyMfa(db,u,data.code,env.CRM_MFA_KEY)){
        const count=attempt&&attempt.until>Date.now()?attempt.count+1:1;await db.run('INSERT INTO crm_attempts(key,count,until) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,until=excluded.until',[key,count,Date.now()+900000]);throw error('Informe o código do autenticador ou um código de recuperação ainda não utilizado.',401,{mfaRequired:true});
      }
      await db.run('DELETE FROM crm_attempts WHERE key=?',[key]);
      await applyAuthorizedImport(db,u);
      await applySancleiReconciliation(db,u);
      await applyPastorImport(db,u);
      return reply({user:safeUser(u),snapshot:await snapshot(db,env,u)},200,{'Set-Cookie':await issueSession(db,u)});
    }
    if(path==='/api/crm/intake'){
      if(req.method!=='POST')throw error('Método inválido.',405);
      const data=await body(req,16000);if(typeof data.token!=='string'||!/^[a-f0-9]{64}$/.test(data.token))throw error('Link inválido.',404);
      const link=await db.first('SELECT * FROM crm_links WHERE token=? AND disabled=0',[digest(data.token)]);if(!link)throw error('Link desativado ou inexistente.',404);
      if(data.inspect)return reply({leadership:link.leadership,coordinator:link.coordinator});
      if(!data.consent)throw error('Confirme que autoriza o registro dos dados para esta finalidade.');
      const r=cleanRecord({...data.record,leadership:link.leadership,coordinator:link.coordinator,id:crypto.randomUUID(),source:'Formulário da liderança'});
      if(!r.name)throw error('Informe seu nome.');const submissionId=crypto.randomUUID();
      await db.run('INSERT INTO crm_intake(id,link_id,payload,status,source,created_at) VALUES(?,?,?,?,?,?)',[submissionId,link.id,JSON.stringify(r),'pending','formulário',now()]);return reply({received:true,id:submissionId,message:'Recebido para revisão. O envio não declara em quem você votou.'},201);
    }
    const u=await actor(req,db);
    if(path==='/api/crm/audit-index'&&req.method==='GET'){owner(u);const state=await db.first("SELECT revision FROM crm_state WHERE id='main'",[]);return reply({revision:state?.revision||0,ids:(await db.all('SELECT id FROM crm_audit',[])).map(r=>r.id)});}
    if(path==='/api/crm/operations'&&req.method==='GET'){owner(u);return reply({metrics:await readOperationalMetrics(db),backups:await listAutomaticBackups(db,env)});}
    if(path==='/api/crm/automatic-backups'){
      owner(u);
      if(req.method==='GET'){const id=new URL(req.url).searchParams.get('id');return id?await downloadAutomaticBackup(db,env,id):reply(await listAutomaticBackups(db,env));}
      if(req.method==='POST'){const data=await body(req,2000);if(data.action==='verify')return reply(await verifyAutomaticBackup(db,env,data.id));return reply(await createAutomaticBackup(db,env,{source:'manual'}));}
      throw error('Método inválido.',405);
    }
    if(path==='/api/crm/automatic-backups/key'&&req.method==='POST'){
      owner(u);const data=await body(req,1000),attemptKey='backup-key:'+digest(u.id),attempt=await db.first('SELECT * FROM crm_attempts WHERE key=?',[attemptKey]);
      if(attempt?.count>=5&&attempt.until>Date.now())throw error('Muitas tentativas. Aguarde 15 minutos.',429);
      if(typeof data.password!=='string'||data.password.length>200||!equal(await passwordHash(data.password,u.salt),u.password_hash)){const count=attempt&&attempt.until>Date.now()?attempt.count+1:1;await db.run('INSERT INTO crm_attempts(key,count,until) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,until=excluded.until',[attemptKey,count,Date.now()+900000]);throw error('Confirme a senha atual da base.',401);}
      await db.run('DELETE FROM crm_attempts WHERE key=?',[attemptKey]);
      if(!/^[a-f0-9]{64}$/.test(env.PA_AUTOMATIC_BACKUP_KEY||''))throw error('A chave de backup não está configurada.',503);
      const state=await listAutomaticBackups(db,env);return reply({key:env.PA_AUTOMATIC_BACKUP_KEY,keyId:state.keyId});
    }
    if(path==='/api/crm/quality'){
      if(req.method==='GET')return reply({assignees:await qualityAssignees(db,u),snapshot:await snapshot(db,env,u)});
      if(req.method==='POST'){const result=await saveQualityReview(db,u,await body(req,12000),await locationMap(env));return reply({...result,snapshot:await snapshot(db,env,u)});}
      throw error('Método inválido.',405);
    }
    if(path==='/api/crm/recovery-backup'){
      owner(u);
      if(req.method==='GET')return await recoveryBackup(db,env,u,new URL(req.url).searchParams.get('id'));
      if(req.method==='POST')return reply(await protectRecovery(db,env,u,await body(req,30*1024*1024)));
      throw error('Método inválido.',405);
    }
    if(path==='/api/crm/recovery-metadata'&&req.method==='POST'){
      owner(u);const value=await restoreMetadata(db,env,u,await body(req),{features:LEADERSHIP_GEOGRAPHY.features,verifyCandidate:(office,id,version)=>partnershipCandidate(env,office,id,version)});
      return reply({...value,snapshot:await snapshot(db,env,u)});
    }
    if(path==='/api/crm/duplicates/backup'&&req.method==='GET')return await duplicateBackup(db,env,u,new URL(req.url).searchParams.get('operationId'));
    if(path==='/api/crm/duplicates'){
      const locations=await locationMap(env);
      if(req.method==='GET'){const {rows,...value}=await readDuplicates(db,locations,r=>can(u,r));return reply(value);}
      if(req.method!=='POST')throw error('Método inválido.',405);
      owner(u);const result=await updateDuplicates(db,env,u,await body(req,30*1024*1024),locations);
      const {rows,...duplicates}=await readDuplicates(db,locations,r=>can(u,r));
      return reply({...result,duplicates,snapshot:await snapshot(db,env,u)});
    }
    if(path==='/api/crm/groups/correct'&&req.method==='POST'){owner(u);const value=await correctGroup(db,u,await body(req,6000));return reply({...value,snapshot:await snapshot(db,env,u)});}
    if(path==='/api/crm/security'){
      if(req.method==='GET'){const mfa=await mfaState(db,u),sessions=await db.all('SELECT expires FROM crm_sessions WHERE user_id=? AND expires>?',[u.id,Date.now()]);return reply({enabled:!!mfa?.enabled,available:typeof env.CRM_MFA_KEY==='string'&&env.CRM_MFA_KEY.length>=32,sessions:sessions.length,recoveryRemaining:mfa?.enabled?JSON.parse(mfa.recovery||'[]').length:0});}
      if(req.method!=='POST')throw error('Método inválido.',405);
      const data=await body(req,4000),attemptKey='security:'+digest(u.id),attempt=await db.first('SELECT * FROM crm_attempts WHERE key=?',[attemptKey]);if(attempt?.count>=5&&attempt.until>Date.now())throw error('Muitas tentativas. Aguarde 15 minutos.',429);
      let value;try{if(typeof data.password!=='string'||data.password.length>200||!equal(await passwordHash(data.password,u.salt),u.password_hash))throw error('Confirme a senha atual da base.',401);if(data.action==='revokeOthers'){const token=req.headers.get('cookie')?.split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);await db.run('DELETE FROM crm_sessions WHERE user_id=? AND token<>?',[u.id,digest(token)]);value={revoked:true};}else value=await security(db,u,data,env.CRM_MFA_KEY);}catch(e){const count=attempt&&attempt.until>Date.now()?attempt.count+1:1;await db.run('INSERT INTO crm_attempts(key,count,until) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET count=excluded.count,until=excluded.until',[attemptKey,count,Date.now()+900000]);throw e;}
      await db.run('DELETE FROM crm_attempts WHERE key=?',[attemptKey]);
      await db.run('INSERT INTO crm_audit(id,record_id,user_id,user_name,before_value,after_value,operation,created_at) VALUES(?,?,?,?,?,?,?,?)',[crypto.randomUUID(),'security:'+digest(u.id),u.id,u.name,null,JSON.stringify({action:data.action,enabled:value.enabled??null}),'seguranca',now()]);
      return reply(value,200,['enable','disable'].includes(data.action)?{'Set-Cookie':await issueSession(db,await member(db,id))}:{});
    }
    if(path==='/api/crm/cep'&&req.method==='GET')return reply(await lookupCep(new URL(req.url).searchParams.get('cep'),LEADERSHIP_GEOGRAPHY.features));
    if(path==='/api/crm/address'&&req.method==='POST')return reply(await lookupAddress(await body(req,2000),LEADERSHIP_GEOGRAPHY.features,env));
    if(path==='/api/crm/records'&&req.method==='GET'){
      await applyAuthorizedImport(db,u);
      await applySancleiReconciliation(db,u);
      await applyPastorImport(db,u);
      const known=req.headers.get('x-pa-known-revision');
      if(known!==null&&/^\d+$/.test(known)){const state=await db.first("SELECT revision FROM crm_state WHERE id='main'",[]);if(Number(known)===(state?.revision||0))return reply({notModified:true,revision:state?.revision||0,serverTime:now()});}
      return reply(await snapshot(db,env,u));
    }
    if(path==='/api/crm/sync'&&req.method==='POST')return await sync(req,db,env,u);
    if(path==='/api/crm/partnerships'&&req.method==='POST')return await savePartnership(req,db,env,u);
    if(path==='/api/crm/leadership-locations'&&req.method==='POST')return await saveLeadershipLocation(req,db,env,u);
    if(path==='/api/crm/audit'&&req.method==='GET'){
      const recordId=new URL(req.url).searchParams.get('id');let list;
      if(recordId){const r=await db.first('SELECT payload FROM crm_records WHERE id=?',[recordId]);if(!r||!can(u,JSON.parse(r.payload)))throw error('Cadastro fora do seu acesso.',403);list=await db.all('SELECT * FROM crm_audit WHERE record_id=? ORDER BY created_at DESC LIMIT 100',[recordId]);}
      else{owner(u);list=await db.all('SELECT * FROM crm_audit ORDER BY created_at DESC LIMIT 100',[]);}
      return reply({items:list.map(r=>({...r,before:r.before_value?JSON.parse(r.before_value):null,after:r.after_value?JSON.parse(r.after_value):null,before_value:undefined,after_value:undefined}))});
    }
    if(path==='/api/crm/members'){
      owner(u);if(req.method==='GET')return reply({items:(await db.all('SELECT * FROM crm_users',[])).map(r=>({...safeUser(r),disabled:Boolean(r.disabled),needsSetup:!r.password_hash}))});
      if(req.method!=='POST')throw error('Método inválido.',405);
      const data=await body(req,5000),email=String(data.email||'').toLowerCase().trim();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email===OWNER)throw error('Informe outro e-mail válido.');
      if(data.action==='disable'||data.action==='reset'){
        if(data.action==='reset'&&env.AUTH_MODE==='independent'){const pass=password(data.initialPassword),salt=random();await db.run('UPDATE crm_users SET password_hash=?,salt=?,version=version+1 WHERE email=?',[await passwordHash(pass,salt),salt,email]);return reply({saved:true});}
        const statement=data.action==='disable'?'UPDATE crm_users SET disabled=?,version=version+1 WHERE email=?':'UPDATE crm_users SET password_hash=NULL,salt=NULL,version=version+1 WHERE email=?';
        await db.run(statement,data.action==='disable'?[data.disabled?1:0,email]:[email]);return reply({saved:true});
      }
      if(!['leader','coordinator'].includes(data.role)||!String(data.scope||'').trim())throw error('Escolha o perfil e a liderança ou coordenação.');
      if(env.AUTH_MODE==='independent'){
        const existing=await db.first('SELECT * FROM crm_users WHERE email=?',[email]);if(!existing?.password_hash&&!data.initialPassword)throw error('Defina uma senha inicial para esta conta.');
        const salt=data.initialPassword?random():null,hash=salt?await passwordHash(password(data.initialPassword),salt):null;
        await db.run('INSERT INTO crm_users(id,email,name,role,scope,password_hash,salt,created_at) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,role=excluded.role,scope=excluded.scope,password_hash=COALESCE(excluded.password_hash,crm_users.password_hash),salt=COALESCE(excluded.salt,crm_users.salt),version=crm_users.version+1',[crypto.randomUUID(),email,String(data.name||email).slice(0,120),data.role,String(data.scope).trim().toUpperCase().slice(0,100),hash,salt,now()]);return reply({saved:true});
      }
      await db.run('INSERT INTO crm_users(id,email,name,role,scope,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET name=excluded.name,role=excluded.role,scope=excluded.scope,version=crm_users.version+1',[crypto.randomUUID(),email,String(data.name||email).slice(0,120),data.role,String(data.scope).trim().toUpperCase().slice(0,100),now()]);return reply({saved:true});
    }
    if(path==='/api/crm/links'){
      if(req.method==='GET'){
        const items=await db.all('SELECT id,leadership,coordinator,disabled,created_at FROM crm_links',[]);return reply({items:items.filter(r=>can(u,r))});
      }
      if(req.method!=='POST')throw error('Método inválido.',405);
      const data=await body(req,4000);
      if(data.disable){const link=await db.first('SELECT * FROM crm_links WHERE id=?',[data.id]);if(!link||!can(u,link))throw error('Link fora do seu acesso.',403);await db.run('UPDATE crm_links SET disabled=1 WHERE id=?',[link.id]);return reply({saved:true});}
      const r=cleanRecord(data);if(!can(u,r)||r.leadership==='SEM LIDERANÇA')throw error('Escolha uma liderança do seu acesso.',403);
      if(u.role==='leader'){const reference=await db.first('SELECT coordinator FROM crm_records WHERE leadership=? AND deleted=0 LIMIT 1',[u.scope]);if(!reference||normalize(r.coordinator)!==normalize(reference.coordinator))throw error('Use a coordenação atribuída à sua liderança.',403);}
      const token=random(),linkId=crypto.randomUUID();await db.run('INSERT INTO crm_links(id,token,leadership,coordinator,created_at) VALUES(?,?,?,?,?)',[linkId,digest(token),r.leadership,r.coordinator,now()]);return reply({id:linkId,token,leadership:r.leadership},201);
    }
    if(path==='/api/crm/submissions'){
      if(req.method==='GET'){
        const items=await db.all('SELECT * FROM crm_intake WHERE status=? ORDER BY created_at DESC LIMIT 300',['pending']);return reply({items:items.map(r=>({...r,record:JSON.parse(r.payload),payload:undefined})).filter(r=>can(u,r.record))});
      }
      if(req.method!=='POST')throw error('Método inválido.',405);
      const data=await body(req,3000),item=await db.first('SELECT * FROM crm_intake WHERE id=?',[data.id]);if(!item||!can(u,JSON.parse(item.payload)))throw error('Envio fora do seu acesso.',403);
      if(!['approved','rejected'].includes(data.status))throw error('Situação inválida.');
      if(data.status==='approved'){const saved=await db.first('SELECT payload FROM crm_records WHERE id=? AND deleted=0',[data.recordId]);if(!saved||!can(u,JSON.parse(saved.payload)))throw error('Salve primeiro o cadastro revisado na base central dentro do seu acesso.');}
      await db.run('UPDATE crm_intake SET status=? WHERE id=?',[data.status,data.id]);return reply({saved:true});
    }
    throw error('Consulta não encontrada.',404);
  }catch(e){if(!e.status)console.error('Falha na base central:',e.message);return reply({error:e.status?e.message:'Não foi possível concluir. Seus dados foram preservados.',details:e.details},e.status||503);}
}
