import {cleanLeadershipLocation} from '../lib/leadership-location.mjs';
import {cleanSavedPartnership,cleanDuplicateReview,creationDate,validRecordId,reviewMatchesSource} from '../lib/crm-recovery.mjs';
import {cleanQualityReview} from '../lib/quality-workflow.mjs';
import {normalize} from '../lib/crm-model.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const operationId=value=>{if(!/^[-a-zA-Z0-9]{12,100}$/.test(value||''))throw fail('Identificador da recuperação inválido.');return 'recovery-'+value;};
const key=id=>'crm/recovery-backups/'+id+'.json';
const guard="EXISTS(SELECT 1 FROM crm_state WHERE id='main' AND commit_token=?)";

export async function protectRecovery(db,env,user,input){
  if(user.role!=='owner')throw fail('Somente o responsável pode recuperar uma cópia.',403);
  const id=operationId(input.operationId),prior=await db.first('SELECT user_id,result FROM crm_operations WHERE id=?',[id]);
  if(prior){if(prior.user_id!==user.id)throw fail('Operação de outra conta.',403);return {...JSON.parse(prior.result),replayed:true};}
  const state=await db.first("SELECT revision FROM crm_state WHERE id='main'",[]);
  if(!Number.isSafeInteger(input.revision)||input.revision!==(state?.revision||0))throw fail('A base mudou. Atualize a consulta antes da recuperação.',409);
  const b=input.backup;
  if(!b||b.format!=='pa-2026-leadership-backup'||![1,2].includes(b.version)||!['salt','iv','cipher'].every(f=>typeof b[f]==='string'&&b[f].length>0)||JSON.stringify(b).length>28*1024*1024||!env.BUCKET?.put)throw fail('Prepare a cópia protegida antes da recuperação.',503);
  await env.BUCKET.put(key(id),JSON.stringify(b),{httpMetadata:{contentType:'application/json'}});
  const result={backupId:id,revision:input.revision};
  await db.run('INSERT INTO crm_operations(id,user_id,result,created_at) VALUES(?,?,?,?)',[id,user.id,JSON.stringify(result),new Date().toISOString()]);
  return result;
}

export async function recoveryBackup(db,env,user,id){
  if(user.role!=='owner')throw fail('Somente o responsável pode baixar esta cópia.',403);
  if(!/^recovery-[-a-zA-Z0-9]{12,100}$/.test(id||''))throw fail('Cópia inválida.');
  const prior=await db.first('SELECT user_id,result FROM crm_operations WHERE id=?',[id]);
  if(!prior||prior.user_id!==user.id||JSON.parse(prior.result).backupId!==id)throw fail('Cópia não encontrada.',404);
  const object=await env.BUCKET?.get(key(id));if(!object)throw fail('Cópia não encontrada.',404);
  return new Response(await object.text(),{headers:{'Content-Type':'application/json','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'attachment; filename="COPIA_ANTES_RECUPERACAO.json"'}});
}

export async function restoreMetadata(db,env,user,input,{features,verifyCandidate}){
  if(user.role!=='owner')throw fail('Somente o responsável pode recuperar uma cópia.',403);
  const id=operationId(input.operationId),prior=await db.first('SELECT user_id,result FROM crm_operations WHERE id=?',[id]);
  if(prior){if(prior.user_id!==user.id)throw fail('Operação de outra conta.',403);return {...JSON.parse(prior.result),replayed:true};}
  const protectedOperation=await db.first('SELECT user_id,result FROM crm_operations WHERE id=?',[String(input.backupId||'')]);
  if(!protectedOperation||protectedOperation.user_id!==user.id||JSON.parse(protectedOperation.result).backupId!==input.backupId)throw fail('A recuperação exige uma cópia protegida anterior.');
  const state=await db.first("SELECT revision FROM crm_state WHERE id='main'",[]);
  if(!Number.isSafeInteger(input.revision)||input.revision!==(state?.revision||0))throw fail('A base mudou. Revise a recuperação antes de continuar.',409);
  if(!Array.isArray(input.entries)||!input.entries.length||input.entries.length>50)throw fail('Recupere de 1 a 50 itens por etapa.');
  const records=(await db.all('SELECT id,payload,version,deleted,created_at FROM crm_records',[])).map(r=>({...JSON.parse(r.payload),id:r.id,version:r.version,deleted:!!r.deleted,createdAt:r.created_at}));
  const known=new Set(records.map(r=>r.id)),stamp=new Date().toISOString(),commit=crypto.randomUUID(),commands=[],seen=new Set();let skipped=0;
  for(const entry of input.entries){
    const marker=entry.kind+':'+entry.id;if(seen.has(marker))throw fail('Item repetido na recuperação.');seen.add(marker);
    let before=null,after,recordId;
    if(entry.kind==='location'||entry.kind==='partnership'){
      const table=entry.kind==='location'?'crm_leadership_locations':'crm_partnerships';
      after=entry.kind==='location'?cleanLeadershipLocation(entry.desired,features):cleanSavedPartnership(entry.desired);
      if(after.id!==entry.id)throw fail('Referência de grupo inválida.');
      const old=await db.first(`SELECT payload,version FROM ${table} WHERE id=?`,[entry.id]);before=old?.payload||null;
      if(!Number.isSafeInteger(entry.expectedVersion)||(old?.version||0)!==entry.expectedVersion)throw fail('O grupo mudou desde a revisão. Nenhum item desta etapa foi substituído.',409);
      if(entry.kind==='partnership')for(const office of ['estadual','federal']){
        const candidate=await verifyCandidate(office,after[office].id,after.sourceVersions?.[office]||'bundled');
        if(candidate.number!==after[office].number||candidate.name!==after[office].name)throw fail('Confira o candidato da parceria antes de recuperar.');after[office]=candidate;
      }
      after.version=(old?.version||0)+1;after.updatedAt=stamp;after.updatedBy=user.name;
      commands.push([`INSERT INTO ${table}(id,leadership,coordinator,payload,version,commit_token,updated_at) SELECT ?,?,?,?,?,?,? WHERE ${guard} ON CONFLICT(id) DO UPDATE SET leadership=excluded.leadership,coordinator=excluded.coordinator,payload=excluded.payload,version=excluded.version,commit_token=excluded.commit_token,updated_at=excluded.updated_at`,[entry.id,after.leadership,after.coordinator,JSON.stringify(after),after.version,commit,stamp,commit]]);
      recordId='recovery-'+entry.kind+':'+entry.id;
    }else if(entry.kind==='review'){
      after=cleanDuplicateReview(entry.desired,known);if(after.id!==entry.id)throw fail('Grupo de duplicidade inválido.');
      const old=await db.first('SELECT payload,updated_at FROM crm_duplicate_reviews WHERE id=?',[entry.id]);before=old?.payload||null;
      if((old?.updated_at||null)!==entry.expectedUpdatedAt)throw fail('A observação mudou desde a revisão. Confira o texto central.',409);
      // Restore text and evidence without approving identities or archiving anyone.
      const selected=records.filter(r=>after.recordIds.includes(r.id));
      if(!Array.isArray(entry.sourceRecords)||!reviewMatchesSource(selected,entry.sourceRecords))throw fail('Os cadastros desta duplicidade diferem da cópia. Confira-os antes de recuperar a observação.',409);
      after.status='review';after.recordVersions=Object.fromEntries(selected.map(r=>[r.id,r.version]));after.recordCreatedAt=Object.fromEntries(selected.map(r=>[r.id,r.createdAt||null]));after.backupId=null;after.updatedAt=stamp;after.updatedBy=user.name;
      commands.push([`INSERT INTO crm_duplicate_reviews(id,payload,updated_at) SELECT ?,?,? WHERE ${guard} ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`,[entry.id,JSON.stringify(after),stamp,commit]]);
      recordId=after.recordIds[0];
    }else if(entry.kind==='quality'){
      after=cleanQualityReview(entry.desired);if(after.recordId!==entry.id||!known.has(entry.id))throw fail('Cadastro da conferência não encontrado.');
      const old=await db.first('SELECT payload,version FROM crm_quality_reviews WHERE record_id=?',[entry.id]);before=old?.payload||null;
      if((old?.version||0)!==entry.expectedVersion)throw fail('A conferência mudou desde a revisão. Atualize antes de recuperar.',409);
      const record=records.find(r=>r.id===entry.id);if(after.status==='validated')after.status='review';
      if(after.assigneeId){const person=await db.first('SELECT id,name,role,scope,disabled FROM crm_users WHERE id=?',[after.assigneeId]),allowed=person&&!person.disabled&&(person.role==='owner'||person.role==='leader'&&normalize(person.scope)===normalize(record.leadership)||person.role==='coordinator'&&normalize(person.scope)===normalize(record.coordinator));if(!allowed){after.assigneeId='';after.assigneeName='';}else after.assigneeName=person.name;}
      after.version=(old?.version||0)+1;after.recordVersion=record.version;after.updatedAt=stamp;after.updatedBy=user.name;
      commands.push([`INSERT INTO crm_quality_reviews(record_id,payload,version,updated_at) SELECT ?,?,?,? WHERE ${guard} ON CONFLICT(record_id) DO UPDATE SET payload=excluded.payload,version=excluded.version,updated_at=excluded.updated_at`,[entry.id,JSON.stringify(after),after.version,stamp,commit]]);recordId=entry.id;
    }else if(entry.kind==='audit'){
      const source=entry.desired;
      if(!source||source.id!==entry.id||!/^[-A-Za-z0-9]{1,160}$/.test(source.id)||typeof source.record_id!=='string'||source.record_id.length>240||typeof source.user_name!=='string'||source.user_name.length>160||typeof source.operation!=='string'||source.operation.length>120||!creationDate(source.created_at))throw fail('Registro histórico inválido na cópia.');
      const existing=await db.first('SELECT id FROM crm_audit WHERE id=? OR id=?',[source.id,'restored-'+source.id]);if(existing){skipped++;continue;}
      const parse=value=>{if(value===null||value===undefined)return null;if(typeof value!=='string'||value.length>20000)throw fail('Conteúdo histórico inválido.');try{return JSON.parse(value);}catch{throw fail('Conteúdo histórico inválido.');}};
      const originalBefore=parse(source.before_value),originalAfter=parse(source.after_value),priorOrigin=originalAfter?._sourceAudit,sourceId=priorOrigin?.id||source.id;
      if(!/^[-A-Za-z0-9]{1,160}$/.test(sourceId))throw fail('Origem histórica inválida.');
      const targetId='restored-'+sourceId;if(await db.first('SELECT id FROM crm_audit WHERE id=?',[targetId])){skipped++;continue;}
      const afterValue={...(originalAfter&&typeof originalAfter==='object'&&!Array.isArray(originalAfter)?originalAfter:{value:originalAfter}),_sourceAudit:priorOrigin||{id:source.id,createdAt:source.created_at,userName:source.user_name,operation:source.operation}};
      commands.push([`INSERT OR IGNORE INTO crm_audit(id,record_id,user_id,user_name,before_value,after_value,operation,created_at) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`,[targetId,source.record_id,user.id,user.name,JSON.stringify(originalBefore),JSON.stringify(afterValue),'historico-recuperado',stamp,commit]]);
      continue;
    }else if(entry.kind==='creation'){
      if(!validRecordId(entry.id)||!known.has(entry.id))throw fail('Cadastro da data recuperada não encontrado.');
      const record=records.find(r=>r.id===entry.id);after=creationDate(entry.desired);if(!after)throw fail('Data de inclusão ausente.');
      if(record.createdAt)throw fail('Uma data de inclusão já está registrada. Atualize a revisão.',409);
      commands.push([`UPDATE crm_records SET created_at=? WHERE id=? AND created_at IS NULL AND ${guard}`,[after,entry.id,commit]]);recordId=entry.id;
    }else throw fail('Tipo de recuperação inválido.');
    // JSON null means "no prior metadata". SQL NULL is reserved by legacy
    // creation evidence, so a first recovered note must not look like a birth.
    commands.push([`INSERT INTO crm_audit(id,record_id,user_id,user_name,before_value,after_value,operation,created_at) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`,[crypto.randomUUID(),recordId,user.id,user.name,before===null?'null':before,JSON.stringify(after),'recuperacao-'+entry.kind,stamp,commit]]);
  }
  const result={applied:input.entries.length-skipped,processed:input.entries.length,skipped,revision:input.revision+1,backupId:input.backupId};
  const applied=await db.batch([["UPDATE crm_state SET revision=revision+1,commit_token=? WHERE id='main' AND revision=?",[commit,input.revision]],...commands,[`INSERT INTO crm_operations(id,user_id,result,created_at) SELECT ?,?,?,? WHERE ${guard}`,[id,user.id,JSON.stringify(result),stamp,commit]]]);
  if(!applied[0].meta?.changes)throw fail('Outra atualização chegou ao mesmo tempo. Revise antes de recuperar.',409);
  return result;
}
