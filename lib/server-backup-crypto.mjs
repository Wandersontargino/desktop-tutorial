const encoder=new TextEncoder(),decoder=new TextDecoder();
const hex=bytes=>[...bytes].map(x=>x.toString(16).padStart(2,'0')).join('');
const encode=bytes=>{let value='';for(let i=0;i<bytes.length;i+=32768)value+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(value);};
const decode=value=>Uint8Array.from(atob(value),c=>c.charCodeAt(0));
export const digestBackup=async value=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',typeof value==='string'?encoder.encode(value):value)));
export async function backupKey(value){if(!/^[a-f0-9]{64}$/.test(value||''))throw new Error('A chave exclusiva de backup não está configurada.');const bytes=Uint8Array.from(value.match(/../g),v=>parseInt(v,16));return {key:await crypto.subtle.importKey('raw',bytes,'AES-GCM',false,['encrypt','decrypt']),keyId:(await digestBackup(bytes)).slice(0,16)};}
export function validateBackupSnapshot(value){
  if(value?.project!=='analise-eleitoral-pa'||value.year!==2026||!Number.isSafeInteger(value.revision)||!Array.isArray(value.records)||value.records.length>50000)throw new Error('Estrutura da cópia automática inválida.');
  const restored=new Map();for(const record of value.records){if(!record||!/^[-A-Za-z0-9]{1,80}$/.test(record.id||'')||restored.has(record.id)||!Number.isSafeInteger(record.version)||record.version<1)throw new Error('Cadastro inválido na cópia automática.');restored.set(record.id,{...record});}
  if(JSON.stringify([...restored.values()])!==JSON.stringify(value.records))throw new Error('A simulação de recuperação não preservou os campos.');
  for(const field of ['partnerships','leadershipLocations','duplicateReviews','qualityReviews','auditHistory'])if(!Array.isArray(value[field])||value[field].length>(field==='auditHistory'?100000:50000))throw new Error('Metadados incompletos na cópia automática.');
  for(const review of value.duplicateReviews)if(!Array.isArray(review.recordIds)||review.recordIds.some(id=>!restored.has(id)))throw new Error('Duplicidade com referência ausente na cópia.');
  for(const review of value.qualityReviews)if(!restored.has(review.recordId))throw new Error('Conferência com cadastro ausente na cópia.');
  return {records:restored.size,archived:[...restored.values()].filter(r=>r.deleted).length,qualityReviews:value.qualityReviews.length,auditHistory:value.auditHistory.length};
}
export async function sealServerBackup(value,secret,id){
  const counts=validateBackupSnapshot(value),text=JSON.stringify(value),bytes=encoder.encode(text);if(bytes.length>20*1024*1024)throw new Error('A cópia excede o limite de 20 MB de conteúdo.');
  const {key,keyId}=await backupKey(secret),iv=crypto.getRandomValues(new Uint8Array(12)),aad=encoder.encode('analise-eleitoral-pa|'+id+'|'+keyId);
  const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:aad},key,bytes);
  return {format:'pa-server-backup-v1',version:1,id,keyId,iv:encode(iv),cipher:encode(new Uint8Array(cipher)),digest:await digestBackup(text),counts};
}
export async function openServerBackup(file,secret){
  if(file?.format!=='pa-server-backup-v1'||file.version!==1||typeof file.id!=='string'||file.id.length>120||typeof file.cipher!=='string'||file.cipher.length>28*1024*1024||typeof file.iv!=='string'||file.iv.length>100)throw new Error('Arquivo de cópia automática inválido.');
  const {key,keyId}=await backupKey(secret);if(keyId!==file.keyId)throw new Error('Esta chave não corresponde à cópia automática.');
  let bytes;try{bytes=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(file.iv),additionalData:encoder.encode('analise-eleitoral-pa|'+file.id+'|'+keyId)},key,decode(file.cipher));}catch{throw new Error('A cópia automática foi alterada ou a chave não confere.');}
  const text=decoder.decode(bytes);if(await digestBackup(text)!==file.digest)throw new Error('A integridade da cópia automática não confere.');
  const value=JSON.parse(text),counts=validateBackupSnapshot(value);if(JSON.stringify(counts)!==JSON.stringify(file.counts))throw new Error('As contagens da cópia automática não conferem.');return value;
}
