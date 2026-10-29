import {assessRecords} from '../lib/crm-model.mjs';
import {duplicateGroups,duplicateSummary} from '../lib/duplicate-records.mjs';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const backupKey=id=>'crm/duplicate-backups/'+id+'.json';

export async function readDuplicates(db,locations,canSee=()=>true){
  const state=await db.first("SELECT revision FROM crm_state WHERE id='main'",[]);
  const rows=await db.all('SELECT * FROM crm_records',[]);
  const births=await db.all("SELECT record_id,MIN(created_at) AS created_at FROM crm_audit WHERE (before_value IS NULL OR operation='cadastrar') AND operation<>'duplicidade-observacao' GROUP BY record_id",[]);
  const born=new Map(births.map(r=>[r.record_id,r.created_at]));
  const allReviews=(await db.all('SELECT payload FROM crm_duplicate_reviews',[])).map(r=>JSON.parse(r.payload));
  for(const review of allReviews)for(const [id,date]of Object.entries(review.recordCreatedAt||{}))if(date&&!born.has(id))born.set(id,date);
  const raw=rows.map(row=>({...JSON.parse(row.payload),version:row.version,deleted:Boolean(row.deleted)}));
  // updated_at proves creation only for version 1. Later edits do not become
  // creation dates, and client-provided timestamps are never trusted.
  const dates=new Map(rows.map(row=>{const proven=[row.created_at,born.get(row.id)].filter(date=>date&&Number.isFinite(Date.parse(date))).sort((a,b)=>Date.parse(a)-Date.parse(b));return [row.id,proven[0]||(row.version===1?row.updated_at:null)];}));
  const records=assessRecords(raw,locations).filter(canSee).map(r=>({...r,createdAt:dates.get(r.id)}));
  const visible=new Set(records.map(r=>r.id));
  const reviews=allReviews.filter(r=>r.recordIds.every(id=>visible.has(id)));
  const groups=duplicateGroups(records,reviews,locations);
  const after=await db.first("SELECT revision FROM crm_state WHERE id='main'",[]);
  if(state?.revision!==after?.revision)throw fail('A base mudou durante a conferência. Atualize as duplicidades.',409);
  return {revision:state?.revision||0,groups,summary:duplicateSummary(groups),rows};
}

export async function updateDuplicates(db,env,user,input,locations){
  if(user.role!=='owner')throw fail('Somente o responsável pode tratar duplicidades.',403);
  const operationId='duplicates-'+String(input.operationId||'');
  if(!/^duplicates-[-a-zA-Z0-9]{12,100}$/.test(operationId))throw fail('Identificador da operação inválido.');
  const previous=await db.first('SELECT user_id,result FROM crm_operations WHERE id=?',[operationId]);
  if(previous){if(previous.user_id!==user.id)throw fail('Operação de outro usuário.',403);return {...JSON.parse(previous.result),replayed:true};}
  if(!['resolve','resolve-safe','note'].includes(input.action))throw fail('Escolha uma ação de duplicidade válida.');
  const current=await readDuplicates(db,locations);
  if(!Number.isSafeInteger(input.revision)||input.revision!==current.revision)throw fail('A base mudou. Atualize e confira as duplicidades novamente.',409);
  let selected=input.action==='resolve-safe'?current.groups.filter(g=>g.eligible):current.groups.filter(g=>g.id===input.groupId);
  if(!selected.length)throw fail('Nenhum grupo elegível foi encontrado. Atualize a consulta.',409);
  if(input.action!=='note'&&selected.some(g=>!g.eligible))throw fail('Há divergências ou a ordem de criação não está comprovada. Corrija e confira os dados antes de tratar.',409);
  if(input.action==='note'&&(typeof input.observation!=='string'||!input.observation.trim()||input.observation.length>1600))throw fail('Escreva uma observação com até 1600 caracteres.');
  const chosen=[];let count=0;for(const group of selected){if(count+group.records.length>150)break;chosen.push(group);count+=group.records.length;}
  selected=chosen;if(!selected.length)throw fail('O grupo excede o limite de tratamento. Confira os cadastros individualmente.');
  const stamp=new Date().toISOString(),commit=crypto.randomUUID(),commands=[],guard="EXISTS(SELECT 1 FROM crm_state WHERE id='main' AND commit_token=?)";
  const result={operationId,revision:current.revision+1,groups:selected.length,archived:input.action==='note'?0:selected.reduce((n,g)=>n+g.active-1,0),principalIds:input.action==='note'?[]:selected.map(g=>g.principalId)};
  if(input.action!=='note'){
    const b=input.backup;
    if(!b||b.format!=='pa-2026-leadership-backup'||![1,2].includes(b.version)||!['salt','iv','cipher'].every(k=>typeof b[k]==='string'&&b[k].length>0)||b.cipher.length>28*1024*1024||!env.BUCKET?.put)throw fail('A cópia protegida precisa estar pronta antes de tratar as duplicidades.',503);
    await env.BUCKET.put(backupKey(operationId),JSON.stringify(b),{httpMetadata:{contentType:'application/json'}});
    result.backupId=operationId;
  }
  commands.push(["UPDATE crm_state SET revision=revision+1,commit_token=? WHERE id='main' AND revision=?",[commit,current.revision]]);
  for(const group of selected){
    const resolved=input.action!=='note',principal=group.records.find(r=>r.id===group.principalId);
    const observation=resolved?`Duplicidade conferida em ${new Date(stamp).toLocaleString('pt-BR',{timeZone:'America/Belem'})}. Cadastro mais antigo ${principal.id} mantido ativo, com identidade e dados coincidentes. ${group.active-1} repetição(ões) arquivada(s), com histórico preservado.`:input.observation.trim();
    const versions=Object.fromEntries(group.records.map(r=>[r.id,r.version+(resolved?1:0)]));
    const review={id:group.id,recordIds:group.records.map(r=>r.id),recordVersions:versions,recordCreatedAt:Object.fromEntries(group.records.map(r=>[r.id,r.createdAt])),principalId:resolved?principal.id:group.principalId,status:resolved||group.status==='resolved'?'resolved':'review',observation,updatedAt:stamp,updatedBy:user.name,backupId:resolved?operationId:group.review?.backupId||null};
    if(resolved)for(const record of group.records){
      const row=current.rows.find(r=>r.id===record.id),before=JSON.parse(row.payload),next={...before,deleted:record.id!==principal.id};
      const note=record.id===principal.id?'DUPLICIDADE CONFERIDA: cadastro mais antigo mantido ativo. Consulte a aba Duplicidades.':`DUPLICIDADE CONFERIDA: repetição arquivada. Cadastro principal: ${principal.id}.`;
      if(!String(next.notes||'').includes(note)&&String(next.notes||'').length+note.length+1<=1600)next.notes=[next.notes,note].filter(Boolean).join(' ');
      commands.push([`UPDATE crm_records SET payload=?,deleted=?,version=version+1,updated_at=? WHERE id=? AND version=? AND ${guard}`,[JSON.stringify(next),+next.deleted,stamp,record.id,row.version,commit]]);
      commands.push([`INSERT INTO crm_audit(id,record_id,user_id,user_name,before_value,after_value,operation,created_at) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`,[crypto.randomUUID(),record.id,user.id,user.name,JSON.stringify({...before,version:row.version,deleted:Boolean(row.deleted)}),JSON.stringify({...next,version:row.version+1}),record.id===principal.id?'duplicidade-principal':'duplicidade-arquivada',stamp,commit]]);
    }
    commands.push([`INSERT INTO crm_duplicate_reviews(id,payload,updated_at) SELECT ?,?,? WHERE ${guard} ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=excluded.updated_at`,[group.id,JSON.stringify(review),stamp,commit]]);
    commands.push([`INSERT INTO crm_audit(id,record_id,user_id,user_name,before_value,after_value,operation,created_at) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`,[crypto.randomUUID(),group.records[0].id,user.id,user.name,group.review?JSON.stringify(group.review):null,JSON.stringify(review),'duplicidade-observacao',stamp,commit]]);
  }
  commands.push([`INSERT INTO crm_operations(id,user_id,result,created_at) SELECT ?,?,?,? WHERE ${guard}`,[operationId,user.id,JSON.stringify(result),stamp,commit]]);
  const applied=await db.batch(commands);
  if(!applied[0].meta?.changes)throw fail('Outra atualização chegou ao mesmo tempo. Atualize a conferência antes de tratar.',409);
  return result;
}

export async function duplicateBackup(db,env,user,id){
  if(user.role!=='owner')throw fail('Somente o responsável pode baixar a cópia protegida.',403);
  if(!/^duplicates-[-a-zA-Z0-9]{12,100}$/.test(id||''))throw fail('Cópia inválida.');
  const operation=await db.first('SELECT result FROM crm_operations WHERE id=?',[id]);
  if(!operation||JSON.parse(operation.result).backupId!==id)throw fail('Cópia não encontrada.',404);
  const file=await env.BUCKET?.get(backupKey(id));if(!file)throw fail('Cópia não encontrada.',404);
  return new Response(await file.text(),{headers:{'Content-Type':'application/json','Content-Disposition':'attachment; filename="COPIA_ANTES_DUPLICIDADES.json"','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
}
