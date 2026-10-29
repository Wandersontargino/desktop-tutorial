import {cleanRecord,sameRecord} from './crm-model.mjs';
import {cleanPartnership} from './group-partnership.mjs';
import {cleanLeadershipLocation,sameLeadershipLocation} from './leadership-location.mjs';
import {sameQualityReview} from './quality-workflow.mjs';

export const validRecordId=id=>typeof id==='string'&&/^[-A-Za-z0-9]{1,80}$/.test(id);
export function creationDate(value){
  if(value===null||value===undefined||value==='')return null;
  const time=typeof value==='string'?Date.parse(value):NaN;
  if(!Number.isFinite(time)||time<0||time>Date.now()+120000)throw new Error('Data de inclusão inválida na cópia.');
  return new Date(time).toISOString();
}
export function cleanSavedPartnership(input){
  const value=cleanPartnership(input);
  if(input.sourceVersions){value.sourceVersions={};for(const office of ['estadual','federal']){const version=input.sourceVersions[office];if(version!=='bundled'&&!/^[a-f0-9-]{36}$/.test(String(version)))throw new Error('Versão eleitoral inválida na parceria da cópia.');value.sourceVersions[office]=version;}}
  return value;
}
export function cleanDuplicateReview(input,allowed){
  if(!input||!Array.isArray(input.recordIds)||input.recordIds.length<2||input.recordIds.length>50000||input.recordIds.some(id=>!validRecordId(id)||allowed&&!allowed.has(id))||new Set(input.recordIds).size!==input.recordIds.length)throw new Error('Referência de duplicidade inválida na cópia.');
  const ids=[...input.recordIds].sort(),id='dup:'+ids.join('|');
  if(input.id!==id||!['review','resolved'].includes(input.status)||typeof input.observation!=='string'||!input.observation.trim()||input.observation.length>1600||input.principalId&&!ids.includes(input.principalId))throw new Error('Revisão de duplicidade inválida na cópia.');
  const recordVersions={},recordCreatedAt={};for(const recordId of ids){const version=input.recordVersions?.[recordId];if(!Number.isSafeInteger(version)||version<0)throw new Error('Versão de cadastro inválida na revisão da cópia.');recordVersions[recordId]=version;recordCreatedAt[recordId]=creationDate(input.recordCreatedAt?.[recordId]);}
  return {id,recordIds:ids,recordVersions,recordCreatedAt,principalId:input.principalId||null,status:input.status,observation:input.observation.trim(),updatedAt:creationDate(input.updatedAt),updatedBy:String(input.updatedBy||'').slice(0,120),backupId:typeof input.backupId==='string'?input.backupId.slice(0,120):null};
}
export function cleanDuplicateDrafts(input,allowed){
  if(input===undefined)return [];
  if(!Array.isArray(input)||input.length>50000)throw new Error('Rascunhos de duplicidade inválidos na cópia.');
  const seen=new Set();return input.map(entry=>{
    if(!Array.isArray(entry)||entry.length!==2||typeof entry[0]!=='string'||!entry[0].startsWith('dup:')||seen.has(entry[0]))throw new Error('Rascunho de duplicidade inválido na cópia.');
    seen.add(entry[0]);const [id,draft]=entry,ids=id.slice(4).split('|');
    if(ids.length<2||ids.some(key=>!validRecordId(key)||allowed&&!allowed.has(key))||typeof draft?.observation!=='string'||draft.observation.length>1600||typeof draft.baseObservation!=='string'||draft.baseObservation.length>1600)throw new Error('Texto ou referência do rascunho inválidos na cópia.');
    return [id,{observation:draft.observation,baseObservation:draft.baseObservation,operation:null,updatedAt:creationDate(draft.updatedAt)||new Date().toISOString()}];
  });
}
const pairValue=input=>{const {version,sourceVersions,...value}=cleanSavedPartnership(input);return JSON.stringify(value);};
const reviewValue=input=>JSON.stringify([input.recordIds.slice().sort(),input.principalId||null,input.status,input.observation]);
export function recoveryMetadataChanges(backup,current){
  const entries=[],recordMap=new Map(current.records.map(r=>[r.id,r])),sourceRecords=new Map(backup.records.map(r=>[r.id,r]));
  const locations=new Map((current.leadershipLocations||[]).map(r=>[r.id,r]));
  for(const desired of backup.leadershipLocations||[]){const before=locations.get(desired.id);if(!sameLeadershipLocation(desired,before))entries.push({kind:'location',id:desired.id,desired,expectedVersion:before?.version||0});}
  const partnerships=new Map((current.partnerships||[]).map(r=>[r.id,r]));
  for(const desired of backup.partnerships||[]){const before=partnerships.get(desired.id);if(!before||pairValue(desired)!==pairValue(before))entries.push({kind:'partnership',id:desired.id,desired,expectedVersion:before?.version||0});}
  const reviews=new Map((current.duplicateReviews||[]).map(r=>[r.id,r]));
  for(const desired of backup.duplicateReviews||[]){const before=reviews.get(desired.id);if(!before||reviewValue(desired)!==reviewValue(before))entries.push({kind:'review',id:desired.id,desired,expectedUpdatedAt:before?.updatedAt||null,sourceRecords:desired.recordIds.map(id=>cleanRecord(sourceRecords.get(id)))});}
  for(const [id,date]of Object.entries(backup.recordCreatedAt||{})){const before=recordMap.get(id);if(date&&before&&!before.createdAt)entries.push({kind:'creation',id,desired:creationDate(date),expectedCreatedAt:null});}
  const reviewsById=new Map((current.qualityReviews||[]).map(r=>[r.recordId,r]));
  for(const desired of backup.qualityReviews||[]){const before=reviewsById.get(desired.recordId),record=recordMap.get(desired.recordId),source=sourceRecords.get(desired.recordId);if(!sameQualityReview(desired,before)||record&&source&&!sameRecord(record,source))entries.push({kind:'quality',id:desired.recordId,desired,expectedVersion:before?.version||0});}
  const existingAuditIds=new Set(backup.existingAuditIds||[]);
  for(const desired of backup.auditHistory||[])if(!existingAuditIds.has(desired.id)&&!existingAuditIds.has('restored-'+desired.id))entries.push({kind:'audit',id:desired.id,desired});
  return entries;
}
export function reviewMatchesSource(records,source){return records.length===source.length&&records.every(record=>{const original=source.find(r=>r.id===record.id);return original&&sameRecord(record,original);});}
