import {database} from './database.mjs';
import {backupKey,sealServerBackup,openServerBackup,validateBackupSnapshot} from '../lib/server-backup-crypto.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const validId=id=>/^auto-\d{4}-\d{2}-\d{2}-\d+$/.test(id||'');
const keyFor=id=>'crm/automatic-backups/'+id+'.json';
export async function captureBackupData(db){
  for(let attempt=0;attempt<2;attempt++){
    const before=await db.first("SELECT revision FROM crm_state WHERE id='main'",[]);if(!before)throw fail('A base ainda não foi preparada.',409);
    const rows=await db.all('SELECT id,payload,version,deleted,created_at,updated_at FROM crm_records',[]);
    const records=rows.map(r=>({...JSON.parse(r.payload),id:r.id,version:r.version,deleted:!!r.deleted,createdAt:r.created_at,updatedAt:r.updated_at}));
    const value={project:'analise-eleitoral-pa',year:2026,createdAt:new Date().toISOString(),revision:before.revision,records};
    for(const [field,table]of [['partnerships','crm_partnerships'],['leadershipLocations','crm_leadership_locations'],['duplicateReviews','crm_duplicate_reviews'],['qualityReviews','crm_quality_reviews']])value[field]=(await db.all('SELECT payload FROM '+table,[])).map(r=>JSON.parse(r.payload));
    value.auditHistory=await db.all('SELECT id,record_id,user_id,user_name,before_value,after_value,operation,created_at FROM crm_audit ORDER BY created_at,id',[]);
    const after=await db.first("SELECT revision FROM crm_state WHERE id='main'",[]);if(after.revision!==before.revision)continue;
    validateBackupSnapshot(value);return value;
  }
  throw fail('A base mudou durante a cópia. A cópia anterior foi preservada; tente novamente.',409);
}
export async function verifyAutomaticBackup(db,env,id){
  if(!validId(id))throw fail('Cópia automática inválida.');
  const row=await db.first('SELECT * FROM crm_automatic_backups WHERE id=?',[id]);if(!row)throw fail('Cópia automática não encontrada.',404);
  try{
    const object=await env.BUCKET?.get(keyFor(id));if(!object)throw fail('Arquivo da cópia não encontrado.',404);
    const file=await object.json(),value=await openServerBackup(file,env.PA_AUTOMATIC_BACKUP_KEY),counts=validateBackupSnapshot(value);
    if(file.digest!==row.digest||value.revision!==row.revision||counts.records!==row.records||counts.archived!==row.archived)throw fail('Os metadados da cópia não conferem.',409);
    const verifiedAt=new Date().toISOString();await db.run("UPDATE crm_automatic_backups SET status='verified',verified_at=? WHERE id=?",[verifiedAt,id]);
    return {id,revision:value.revision,verifiedAt,integrityVerified:true,restorationSimulation:'memory',counts,keyId:file.keyId};
  }catch(e){await db.run("UPDATE crm_automatic_backups SET status='failed' WHERE id=?",[id]);throw e;}
}
export async function createAutomaticBackup(db,env,{source='service',now=new Date()}={}){
  if(!env.BUCKET?.put)throw fail('O armazenamento da cópia automática está indisponível.',503);await backupKey(env.PA_AUTOMATIC_BACKUP_KEY);
  const value=await captureBackupData(db),id='auto-'+now.toISOString().slice(0,10)+'-'+value.revision,objectKey=keyFor(id),existing=await db.first('SELECT id FROM crm_automatic_backups WHERE id=?',[id]);value.createdAt=now.toISOString();
  if(existing)return {...await verifyAutomaticBackup(db,env,id),reused:true};
  const file=await sealServerBackup(value,env.PA_AUTOMATIC_BACKUP_KEY,id),stored=await env.BUCKET.put(objectKey,JSON.stringify(file),{httpMetadata:{contentType:'application/json'},onlyIf:new Headers({'If-None-Match':'*'})});
  const object=await env.BUCKET.get(objectKey);if(!object)throw fail('Não foi possível reler a cópia gravada.',503);
  const storedFile=await object.json(),recovered=await openServerBackup(storedFile,env.PA_AUTOMATIC_BACKUP_KEY);if(stored!==null&&JSON.stringify(recovered)!==JSON.stringify(value)||recovered.revision!==value.revision)throw fail('A cópia gravada diverge da origem.',503);
  const stamp=new Date().toISOString();await db.run('INSERT OR IGNORE INTO crm_automatic_backups(id,object_key,created_at,revision,records,archived,key_id,digest,verified_at,source,status) VALUES(?,?,?,?,?,?,?,?,?,?,?)',[id,objectKey,recovered.createdAt,recovered.revision,storedFile.counts.records,storedFile.counts.archived,storedFile.keyId,storedFile.digest,stamp,source==='manual'?'manual':'service','verified']);
  const result=await verifyAutomaticBackup(db,env,id);
  // Retention touches only our own automatic-copy namespace, after a new copy
  // has been re-read, decrypted and checked. Legacy/manual recovery stays intact.
  const older=await db.all("SELECT id,object_key FROM crm_automatic_backups WHERE status='verified' AND id<>? ORDER BY created_at DESC,id DESC LIMIT -1 OFFSET 13",[id]);
  for(const row of older)if(validId(row.id)&&row.object_key===keyFor(row.id)){await env.BUCKET.delete(row.object_key);await db.run('DELETE FROM crm_automatic_backups WHERE id=?',[row.id]);}
  await db.run('DELETE FROM platform_metrics WHERE window_start<?',[new Date(now.getTime()-30*86400000).toISOString()]);
  return {...result,retention:14};
}
export async function listAutomaticBackups(db,env){
  let configured=false,keyId=null;try{keyId=(await backupKey(env.PA_AUTOMATIC_BACKUP_KEY)).keyId;configured=true;}catch{}
  const items=await db.all('SELECT id,created_at,revision,records,archived,key_id,verified_at,source,status FROM crm_automatic_backups ORDER BY created_at DESC LIMIT 30',[]);
  return {configured,keyId,retention:14,items,overdue:!items.length||Date.now()-Date.parse(items[0].created_at)>26*3600000};
}
export async function downloadAutomaticBackup(db,env,id){
  if(!validId(id))throw fail('Cópia inválida.');await verifyAutomaticBackup(db,env,id);
  const object=await env.BUCKET.get(keyFor(id));return new Response(await object.text(),{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'attachment; filename="COPIA_AUTOMATICA_'+id+'.json"'}});
}
// This shared writer is enabled only for the verified owner-private hosted Site.
// Sites validates service access before dispatch. It accepts no records or keys,
// returns no personal data, and cannot restore, alter or delete CRM records.
export async function automaticBackupMaintenance(request,env){
  const reply=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  try{
    if(env.PA_PRIVATE_BACKUP_UPDATER!=='enabled')throw fail('A rotina privada de backup não está habilitada.',403);
    if(request.method!=='POST')throw fail('Método inválido.',405);
    if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)throw fail('Origem inválida.',403);
    if(!request.headers.get('content-type')?.startsWith('application/json'))throw fail('Formato inválido.',415);
    const text=await request.text();if(text.length>1024)throw fail('Envio inválido.',413);
    let body;try{body=JSON.parse(text);}catch{throw fail('Conteúdo inválido.');}if(!body||Object.keys(body).some(k=>k!=='verifyOnly'))throw fail('A rotina não recebe cadastros ou parâmetros de recuperação.');
    const db=database(env);
    const caller=request.headers.get('oai-authenticated-user-id'),email=request.headers.get('oai-authenticated-user-email');
    if(caller||email){const owner=await db.first("SELECT id FROM crm_users WHERE id=? AND lower(email)=? AND role='owner' AND disabled=0",[caller||'',String(email||'').toLowerCase()]);if(!owner)throw fail('Somente a rotina privada ou o responsável pode criar esta cópia.',403);}
    if(body.verifyOnly){const state=await listAutomaticBackups(db,env);if(!state.items.length)throw fail('Ainda não há cópia para verificar.',409);return reply(await verifyAutomaticBackup(db,env,state.items[0].id));}
    return reply(await createAutomaticBackup(db,env));
  }catch(e){return reply({error:e.status?e.message:'Não foi possível criar ou verificar a cópia automática.'},e.status||503);}
}
