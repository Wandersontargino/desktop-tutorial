import {normalize} from '../lib/crm-model.mjs';
import {locationGroupId} from '../lib/leadership-location.mjs';
const fail=(message,status=400)=>Object.assign(Error(message),{status});
export async function correctGroup(db,user,data){
  if(user.role!=='owner')throw fail('Somente o responsável pode corrigir um grupo completo.',403);
  const from={leadership:String(data.from?.leadership||'').trim(),coordinator:String(data.from?.coordinator||'').trim()},to={leadership:String(data.to?.leadership||'').trim().toUpperCase(),coordinator:String(data.to?.coordinator||'').trim().toUpperCase()},source=locationGroupId(from),target=locationGroupId(to),op='group-correction:'+String(data.operationId||'');
  if(!to.leadership||to.leadership.length>80||!to.coordinator||to.coordinator.length>100||source===target||!/^group-correction:[a-zA-Z0-9-]{12,100}$/.test(op))throw fail('Confira liderança, coordenação e identificação da correção.');
  const previous=await db.first('SELECT * FROM crm_operations WHERE id=?',[op]);if(previous){if(previous.user_id!==user.id)throw fail('Operação de outro responsável.',403);return JSON.parse(previous.result);}
  const state=await db.first("SELECT revision FROM crm_state WHERE id='main'",[]);if(state?.revision!==data.revision)throw fail('A base mudou. Atualize e confira a correção novamente.',409);
  const all=(await db.all('SELECT id,payload,version FROM crm_records',[])).map(row=>({...row,record:JSON.parse(row.payload)})),affected=all.filter(row=>locationGroupId(row.record)===source);
  if(!affected.length)throw fail('Grupo de origem não encontrado.');
  if(all.some(row=>locationGroupId(row.record)===target))throw fail('O grupo de destino já existe. A união de grupos exige uma revisão separada.',409);
  if(normalize(from.leadership)!==normalize(to.leadership)&&all.some(row=>normalize(row.record.leadership)===normalize(from.leadership)&&locationGroupId(row.record)!==source))throw fail('Há outra coordenação com esta liderança. Corrija primeiro a vinculação dos grupos.',409);
  const stamp=new Date().toISOString(),token=crypto.randomUUID(),revision=data.revision+1,guard="EXISTS(SELECT 1 FROM crm_state WHERE id='main' AND commit_token=?)",commands=[["UPDATE crm_state SET revision=?,commit_token=? WHERE id='main' AND revision=?",[revision,token,data.revision]]];
  for(const row of affected){const after={...row.record,...to,version:row.version+1};commands.push([`UPDATE crm_records SET leadership=?,coordinator=?,payload=?,version=?,updated_at=? WHERE id=? AND ${guard}`,[to.leadership,to.coordinator,JSON.stringify(after),after.version,stamp,row.id,token]]);commands.push([`INSERT INTO crm_audit(id,record_id,user_id,user_name,before_value,after_value,operation,created_at) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}`,[crypto.randomUUID(),row.id,user.id,user.name,row.payload,JSON.stringify(after),'corrigir-grupo',stamp,token]]);}
  for(const table of ['crm_partnerships','crm_leadership_locations']){
    const old=await db.first(`SELECT * FROM ${table} WHERE id=?`,[source]),existing=await db.first(`SELECT id FROM ${table} WHERE id=?`,[target]);if(existing)throw fail('Há mapa ou parceria no destino. Confira os vínculos antes de unir.',409);if(!old)continue;
    const payload={...JSON.parse(old.payload),...to,id:target,version:old.version+1,updatedAt:stamp,updatedBy:user.name};commands.push([`INSERT INTO ${table}(id,leadership,coordinator,payload,version,commit_token,updated_at) SELECT ?,?,?,?,?,?,? WHERE ${guard}`,[target,to.leadership,to.coordinator,JSON.stringify(payload),payload.version,token,stamp,token]],[`DELETE FROM ${table} WHERE id=? AND ${guard}`,[source,token]]);
  }
  for(const link of await db.all('SELECT id,leadership,coordinator FROM crm_links',[]))if(locationGroupId(link)===source)commands.push([`UPDATE crm_links SET leadership=?,coordinator=? WHERE id=? AND ${guard}`,[to.leadership,to.coordinator,link.id,token]]);
  for(const item of await db.all("SELECT id,payload FROM crm_intake WHERE status='pending'",[])){const record=JSON.parse(item.payload);if(locationGroupId(record)===source)commands.push([`UPDATE crm_intake SET payload=? WHERE id=? AND ${guard}`,[JSON.stringify({...record,...to}),item.id,token]]);}
  if(normalize(from.leadership)!==normalize(to.leadership))for(const member of await db.all("SELECT id,scope FROM crm_users WHERE role='leader'",[]))if(normalize(member.scope)===normalize(from.leadership))commands.push([`UPDATE crm_users SET scope=?,version=version+1 WHERE id=? AND ${guard}`,[to.leadership,member.id,token]],[`DELETE FROM crm_sessions WHERE user_id=? AND ${guard}`,[member.id,token]]);
  const result={changed:affected.length,revision};commands.push([`INSERT INTO crm_operations(id,user_id,result,created_at) SELECT ?,?,?,? WHERE ${guard}`,[op,user.id,JSON.stringify(result),stamp,token]]);
  const applied=await db.batch(commands);if(!applied[0].meta?.changes)throw fail('Outra alteração chegou ao mesmo tempo. A correção não foi aplicada.',409);return result;
}
