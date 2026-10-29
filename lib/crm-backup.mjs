import { seal, unseal, deriveVaultKey } from '../public/secure-vault.mjs';
import { cleanRecord, sameRecord } from './crm-model.mjs';
import {cleanLeadershipLocation} from './leadership-location.mjs';
import {creationDate,cleanSavedPartnership,cleanDuplicateReview,cleanDuplicateDrafts,validRecordId} from './crm-recovery.mjs';
import {cleanQualityReview,cleanQualityDrafts} from './quality-workflow.mjs';
import {openServerBackup} from './server-backup-crypto.mjs';
const FORMAT='pa-2026-leadership-backup';
export const MAX_BACKUP_BYTES=28*1024*1024;
const normalizeEmail=value=>String(value||'').trim().toLowerCase();
export async function createBackup({email,records,leadershipLocations=[],partnerships=[],duplicateReviews=[],duplicateDrafts=[],qualityReviews=[],qualityDrafts=[],recordCreatedAt={},key,salt,revision}){
  const ids=new Set(records.map(r=>r.id));
  const value={project:'analise-eleitoral-pa',year:2026,email:normalizeEmail(email),createdAt:new Date().toISOString(),revision,records:records.map(cleanRecord),leadershipLocations:leadershipLocations.map(r=>cleanLeadershipLocation(r)),partnerships:partnerships.map(cleanSavedPartnership),duplicateReviews:duplicateReviews.map(r=>cleanDuplicateReview(r,ids)),duplicateDrafts:cleanDuplicateDrafts(duplicateDrafts,ids),recordCreatedAt:Object.fromEntries(records.map(r=>[r.id,creationDate(recordCreatedAt[r.id]??r.createdAt)]))};
  value.qualityReviews=qualityReviews.map(cleanQualityReview);value.qualityDrafts=cleanQualityDrafts(qualityDrafts,ids);
  if(value.qualityReviews.some(r=>!ids.has(r.recordId)))throw new Error('Conferência vinculada a cadastro ausente da cópia.');
  const encrypted=await seal(value,key),check=await unseal(encrypted,key);
  if(JSON.stringify(check)!==JSON.stringify(value))throw new Error('Não foi possível conferir a cópia protegida.');
  const file={format:FORMAT,version:2,salt,...encrypted};if(JSON.stringify(file).length>MAX_BACKUP_BYTES)throw new Error('A cópia excede o limite de 28 MB.');return file;
}
export async function readBackup(text,password,email,{recoveryKeyText}={}){
  if(text.length>MAX_BACKUP_BYTES)throw new Error('A cópia excede o limite de 28 MB.');
  let file;try{file=JSON.parse(text);}catch{throw new Error('Arquivo de cópia inválido.');}
  if(file.format==='pa-server-backup-v1'){
    if(!recoveryKeyText)throw new Error('Selecione também a chave de recuperação protegida desta cópia automática.');
    let keyFile,keyData;try{keyFile=JSON.parse(recoveryKeyText);if(keyFile.format!=='pa-server-backup-key'||keyFile.version!==1)throw Error();keyData=await unseal(keyFile,await deriveVaultKey(password,keyFile.salt));}catch{throw new Error('A senha não abre a chave de recuperação ou o arquivo foi alterado.');}
    if(keyData.project!=='analise-eleitoral-pa'||normalizeEmail(keyData.email)!==normalizeEmail(email))throw new Error('A chave de recuperação pertence a outra conta.');
    const value=await openServerBackup(file,keyData.key),ids=new Set(value.records.map(r=>r.id));
    return {...value,formatVersion:3,email:normalizeEmail(email),records:value.records.map(cleanRecord),leadershipLocations:value.leadershipLocations.map(r=>cleanLeadershipLocation(r)),partnerships:value.partnerships.map(cleanSavedPartnership),duplicateReviews:value.duplicateReviews.map(r=>cleanDuplicateReview(r,ids)),duplicateDrafts:[],qualityReviews:value.qualityReviews.map(cleanQualityReview),qualityDrafts:[],recordCreatedAt:Object.fromEntries(value.records.map(r=>[r.id,creationDate(r.createdAt)]))};
  }
  if(file.format!==FORMAT||![1,2].includes(file.version)||typeof file.salt!=='string'||typeof file.iv!=='string'||typeof file.cipher!=='string'||file.salt.length>100||file.iv.length>100)throw new Error('Este arquivo não é uma cópia protegida da plataforma.');
  let value;try{value=await unseal(file,await deriveVaultKey(password,file.salt));}catch{throw new Error('A senha não abre esta cópia ou o arquivo foi alterado.');}
  if(value.project!=='analise-eleitoral-pa'||value.year!==2026||normalizeEmail(value.email)!==normalizeEmail(email))throw new Error('A cópia pertence a outra conta ou plataforma.');
  if(!Array.isArray(value.records)||value.records.length>50000||!value.records.every(r=>r&&typeof r==='object'&&typeof r.id==='string'&&r.id&&r.id.length<=80))throw new Error('Os cadastros da cópia estão inválidos.');
  if(new Set(value.records.map(r=>r.id)).size!==value.records.length)throw new Error('A cópia contém identificadores repetidos.');
  if(value.leadershipLocations!==undefined&&(!Array.isArray(value.leadershipLocations)||value.leadershipLocations.length>50000))throw new Error('Locais de referência da cópia inválidos.');
  const leadershipLocations=(value.leadershipLocations||[]).map(r=>cleanLeadershipLocation(r));if(new Set(leadershipLocations.map(r=>r.id)).size!==leadershipLocations.length)throw new Error('A cópia contém locais de referência repetidos.');
  const ids=new Set(value.records.map(r=>r.id));if(value.records.some(r=>!validRecordId(r.id)))throw new Error('Identificador inválido na cópia.');
  for(const field of ['partnerships','duplicateReviews'])if(value[field]!==undefined&&(!Array.isArray(value[field])||value[field].length>50000))throw new Error('Metadados inválidos na cópia.');
  const partnerships=(value.partnerships||[]).map(cleanSavedPartnership),duplicateReviews=(value.duplicateReviews||[]).map(r=>cleanDuplicateReview(r,ids)),duplicateDrafts=cleanDuplicateDrafts(value.duplicateDrafts,ids),recordCreatedAt={};
  if(value.recordCreatedAt!==undefined&&(!value.recordCreatedAt||typeof value.recordCreatedAt!=='object'||Array.isArray(value.recordCreatedAt)))throw new Error('Datas de inclusão inválidas na cópia.');
  for(const [id,date]of Object.entries(value.recordCreatedAt||{})){if(!ids.has(id))throw new Error('Data vinculada a cadastro ausente da cópia.');recordCreatedAt[id]=creationDate(date);}
  for(const list of [partnerships,duplicateReviews])if(new Set(list.map(r=>r.id)).size!==list.length)throw new Error('Metadados repetidos na cópia.');
  if(value.qualityReviews!==undefined&&(!Array.isArray(value.qualityReviews)||value.qualityReviews.length>50000))throw new Error('Conferências da cópia inválidas.');
  const qualityReviews=(value.qualityReviews||[]).map(cleanQualityReview),qualityDrafts=cleanQualityDrafts(value.qualityDrafts,ids);
  if(qualityReviews.some(r=>!ids.has(r.recordId))||new Set(qualityReviews.map(r=>r.recordId)).size!==qualityReviews.length)throw new Error('Referências de conferência inválidas na cópia.');
  return {...value,formatVersion:file.version,records:value.records.map(cleanRecord),leadershipLocations,partnerships,duplicateReviews,duplicateDrafts,qualityReviews,qualityDrafts,recordCreatedAt};
}
export function recoveryChanges(backup,current){
  const map=new Map(current.map(r=>[r.id,r]));
  return backup.records.filter(r=>!map.has(r.id)||!sameRecord(r,map.get(r.id))).map(r=>({...r,version:map.get(r.id)?.version||0}));
}
