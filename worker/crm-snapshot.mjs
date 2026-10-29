import {normalize,titleIndex,coordinatorIndex,assess,quality} from '../lib/crm-model.mjs';
const can=(u,r)=>u.role==='owner'||u.role==='coordinator'&&normalize(r.coordinator)===normalize(u.scope)||u.role==='leader'&&normalize(r.leadership)===normalize(u.scope);
const columns='id,payload,version,deleted,created_at,updated_at';
const fail=()=>Object.assign(new Error('A base mudou durante a consulta. Atualize novamente; as edições locais foram preservadas.'),{status:409});

// Read only visible payloads for restricted roles. All-role title/coordination
// indexes are small projections and retain the existing validation semantics.
export async function readCrmSnapshot(db,locations,user,{attempts=2}={}){
  for(let attempt=0;attempt<attempts;attempt++){
    const before=await db.first("SELECT revision FROM crm_state WHERE id='main'",[]);
    const indexRows=await db.all(user.role==='owner'?`SELECT ${columns},title,leadership,coordinator FROM crm_records`:'SELECT id,title,leadership,coordinator,deleted FROM crm_records',[]);
    const wanted=indexRows.filter(r=>can(user,r)),rows=user.role==='owner'?indexRows:[];
    if(wanted.length>50000)throw Object.assign(new Error('A consulta excede o limite de registros desta versão. Solicite um recorte da base.'),{status:413});
    if(user.role!=='owner')for(let start=0;start<wanted.length;start+=320){const parts=[];for(let offset=start;offset<Math.min(start+320,wanted.length);offset+=80){const ids=wanted.slice(offset,offset+80).map(r=>r.id);parts.push(db.all(`SELECT ${columns} FROM crm_records WHERE id IN (${ids.map(()=>'?').join(',')})`,ids));}rows.push(...(await Promise.all(parts)).flat());}
    const titles=titleIndex(indexRows.map(r=>({...r,deleted:!!r.deleted}))),coordinators=coordinatorIndex(indexRows.map(r=>({...r,deleted:!!r.deleted})));
    const records=rows.map(row=>({...assess({...JSON.parse(row.payload),version:row.version,deleted:!!row.deleted},locations,titles,coordinators),updatedAt:row.updated_at,createdAt:row.created_at||null}));
    const partnerships=(await db.all('SELECT payload FROM crm_partnerships',[])).map(r=>JSON.parse(r.payload)).filter(r=>can(user,r));
    const leadershipLocations=(await db.all('SELECT payload FROM crm_leadership_locations',[])).map(r=>JSON.parse(r.payload)).filter(r=>can(user,r));
    const duplicateReviews=user.role==='owner'?(await db.all('SELECT payload FROM crm_duplicate_reviews',[])).map(r=>JSON.parse(r.payload)):[];
    const visibleIds=new Set(records.map(r=>r.id));
    const qualityReviews=(await db.all('SELECT payload FROM crm_quality_reviews',[])).map(r=>JSON.parse(r.payload)).filter(r=>visibleIds.has(r.recordId));
    const after=await db.first("SELECT revision FROM crm_state WHERE id='main'",[]);
    if((before?.revision||0)!==(after?.revision||0))continue;
    return {revision:after?.revision||0,records,partnerships,leadershipLocations,duplicateReviews,qualityReviews,quality:quality(records),serverTime:new Date().toISOString()};
  }
  throw fail();
}
