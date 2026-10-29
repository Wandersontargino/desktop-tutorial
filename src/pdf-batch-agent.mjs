import {cleanRecord,normalize,digits,sameRecord,documentaryReviewPending,setDocumentaryReview} from '../lib/crm-model.mjs';
const fieldNames=['id','name','title','zone','section','contact','leadership','coordinator','mother','cpf','rg','birth','notes','source'];
const conflictNote='Pessoa ou documento semelhante em outro cadastro. Conferir sem substituir os dados existentes.';
const withoutConflictNote=r=>cleanRecord({...r,notes:String(r.notes||'').replace(conflictNote,'').trim()});
export function planPdfBatch(input,current){
 if(!input||typeof input!=='object'||Object.keys(input).some(k=>!['operationId','records'].includes(k))||!/^[-a-zA-Z0-9]{12,100}$/.test(input.operationId||'')||!Array.isArray(input.records)||!input.records.length||input.records.length>150)throw Error('Informe um lote de 1 a 150 cadastros com identificador estável.');
 const additions=[],duplicates=[],seen=new Set();
 for(const item of input.records){
  if(!item||typeof item!=='object'||Object.keys(item).some(k=>![...fieldNames,'documentaryReview'].includes(k))||fieldNames.some(k=>item[k]!==undefined&&typeof item[k]!=='string')||item.documentaryReview!==undefined&&typeof item.documentaryReview!=='boolean')throw Error('Campos do cadastro inválidos.');
  if(!/^[-a-zA-Z0-9]{1,80}$/.test(item.id||'')||seen.has(item.id)||!item.name?.trim()||!item.leadership?.trim()||!item.coordinator?.trim())throw Error('Confira ID, nome, liderança e coordenação.');
  seen.add(item.id);
  const record=cleanRecord({...item,version:0,deleted:false,notes:setDocumentaryReview(item.notes,item.documentaryReview===true||documentaryReviewPending(item))});
  if(record.title!==digits(item.title))throw Error('O título precisa ser preservado como transcrito; confira a normalização antes de importar.');
  const existing=current.find(r=>r.id===record.id);
  if(existing){if(!existing.deleted&&sameRecord(withoutConflictNote(existing),withoutConflictNote(record))&&existing.source===record.source){duplicates.push(record.id);continue;}throw Error('Um ID do lote já existe com outros dados. Corrija o cadastro existente na plataforma.');}
  const sameName=[...current,...additions].filter(r=>normalize(r.name)===normalize(record.name));
  const same=sameName.find(r=>record.title&&digits(r.title)===record.title&&normalize(r.leadership)===normalize(record.leadership)&&normalize(r.coordinator)===normalize(record.coordinator));
  if(same){if(same.deleted)throw Error('Pessoa já arquivada. Confira o cadastro existente antes de reativar.');duplicates.push(record.id);continue;}
  const documentConflict=[...current,...additions].some(r=>record.title&&digits(r.title)===record.title||digits(record.cpf).length===11&&digits(r.cpf)===digits(record.cpf));
  if(sameName.length||documentConflict)record.notes=setDocumentaryReview([record.notes,conflictNote].filter(Boolean).join(' '),true);
  additions.push(record);
 }
 return {additions,duplicates};
}
export function registerPdfBatchTool({registry,ready,refresh,current,backup,apply}){
 if(typeof registry?.registerTool!=='function')return null;
 const lifecycle=new AbortController();
 const tool={name:'import_pdf_registrations',description:'Inclui na base os cadastros transcritos de PDFs enviados pelo responsável. Requer a base desbloqueada como responsável e autorização do usuário para o lote. Faz backup protegido antes, preserva os cadastros existentes, inclui pendências documentais sinalizadas, evita reinserções e confirma a gravação. Até 150 cadastros por lote; não altera cadastros existentes.',inputSchema:{type:'object',properties:{operationId:{type:'string',pattern:'^[-a-zA-Z0-9]{12,100}$'},records:{type:'array',minItems:1,maxItems:150,items:{type:'object',properties:{...Object.fromEntries(fieldNames.map(k=>[k,{type:'string'}])),documentaryReview:{type:'boolean'}},required:['id','name','leadership','coordinator'],additionalProperties:false}}},required:['operationId','records'],additionalProperties:false},async execute(input){
   ready();await refresh();ready();const previous=current().map(cleanRecord),plan=planPdfBatch(input,current());
   if(!plan.additions.length)return {completed:true,added:0,duplicates:plan.duplicates.length,active:current().filter(r=>!r.deleted).length};
   const copy=await backup();if(!copy?.verified)throw Error('Não foi possível confirmar o backup. Nenhum cadastro foi enviado.');
   const result=await apply(input.operationId,plan.additions);await refresh();
   const saved=current();
   for(const r of previous){const actual=saved.find(x=>x.id===r.id);if(!actual||!sameRecord(actual,r)||actual.version!==r.version||actual.source!==r.source)throw Error('Conferência dos cadastros anteriores requer atenção. Não repetir o lote.');}
   for(const r of plan.additions){const actual=saved.find(x=>x.id===r.id);if(!actual||!sameRecord(actual,r)||actual.source!==r.source)throw Error('Não foi possível confirmar todos os campos gravados. Não repetir o lote.');}
   return {completed:true,added:plan.additions.length,duplicates:plan.duplicates.length,documentaryPending:plan.additions.filter(documentaryReviewPending).length,active:saved.filter(r=>!r.deleted).length,revision:result.revision,backupFilename:copy.filename,backupVerified:true,previousRecordsPreserved:true};
 }};
 try{Promise.resolve(registry.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
 return ()=>lifecycle.abort();
}
