import {normalize} from '../lib/crm-model.mjs';
import {cleanQualityReview} from '../lib/quality-workflow.mjs';
import {readCrmSnapshot} from './crm-snapshot.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const can=(u,r)=>u.role==='owner'||u.role==='leader'&&normalize(u.scope)===normalize(r.leadership)||u.role==='coordinator'&&normalize(u.scope)===normalize(r.coordinator);
export async function qualityAssignees(db,user){
  if(user.role!=='owner')return [{id:user.id,name:user.name,role:user.role,scope:user.scope||''}];
  return db.all('SELECT id,name,role,scope FROM crm_users WHERE disabled=0',[]);
}
export async function saveQualityReview(db,user,input,locations){
  const id='quality-'+String(input.operationId||'');if(!/^quality-[-A-Za-z0-9]{12,100}$/.test(id))throw fail('Identificador da conferência inválido.');
  const previous=await db.first('SELECT user_id,result FROM crm_operations WHERE id=?',[id]);
  if(previous){if(previous.user_id!==user.id)throw fail('Operação de outro usuário.',403);return {...JSON.parse(previous.result),replayed:true};}
  let review;try{review=cleanQualityReview(input);}catch(e){throw fail(e.message);}
  const snapshot=await readCrmSnapshot(db,locations,user),record=snapshot.records.find(r=>r.id===review.recordId);
  if(!record||!can(user,record))throw fail('Cadastro fora do seu acesso.',403);
  if(record.deleted)throw fail('O cadastro está arquivado. Confira a ficha na área Arquivados.',409);
  if(!Number.isSafeInteger(input.revision)||input.revision!==snapshot.revision||review.recordVersion!==record.version)throw fail('O cadastro ou a base mudou. Atualize e confira a proposta antes de salvar.',409);
  const old=await db.first('SELECT payload,version FROM crm_quality_reviews WHERE record_id=?',[record.id]);if((old?.version||0)!==review.version)throw fail('A conferência mudou em outro aparelho. Confira o rascunho contra a versão central.',409);
  if(review.assigneeId){
    const assignee=await db.first('SELECT id,name,role,scope,disabled FROM crm_users WHERE id=?',[review.assigneeId]);
    if(!assignee||assignee.disabled||!can(assignee,record)||user.role!=='owner'&&assignee.id!==user.id)throw fail('Escolha um responsável autorizado para este cadastro.',403);
    review.assigneeName=assignee.name;
  }else review.assigneeName='';
  if(review.status==='validated'){
    if((record.flags||[]).length)throw fail('Ainda há pendências cadastrais. Corrija e sincronize os dados antes de validar.',409);
    if(!review.evidence||!review.assigneeId)throw fail('Informe o responsável e a fonte documental conferida antes de validar.');
  }
  const stamp=new Date().toISOString(),commit=crypto.randomUUID();review.version++;review.updatedAt=stamp;review.updatedBy=user.name;
  const guard="EXISTS(SELECT 1 FROM crm_state WHERE id='main' AND commit_token=?)",result={saved:true,recordId:record.id,revision:snapshot.revision+1};
  const applied=await db.batch([
    ["UPDATE crm_state SET revision=revision+1,commit_token=? WHERE id='main' AND revision=?",[commit,snapshot.revision]],
    [`INSERT INTO crm_quality_reviews(record_id,payload,version,updated_at) SELECT ?,?,?,? WHERE ${guard} ON CONFLICT(record_id) DO UPDATE SET payload=excluded.payload,version=excluded.version,updated_at=excluded.updated_at`,[record.id,JSON.stringify(review),review.version,stamp,commit]],
    [`INSERT INTO crm_audit(id,record_id,user_id,user_name,before_value,after_value,operation,created_at) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`,[crypto.randomUUID(),record.id,user.id,user.name,old?.payload||'null',JSON.stringify(review),'qualidade-conferencia',stamp,commit]],
    [`INSERT INTO crm_operations(id,user_id,result,created_at) SELECT ?,?,?,? WHERE ${guard}`,[id,user.id,JSON.stringify(result),stamp,commit]]
  ]);if(!applied[0].meta?.changes)throw fail('Outra conferência chegou ao mesmo tempo. Atualize antes de salvar.',409);
  return result;
}
