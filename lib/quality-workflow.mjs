import {normalize} from './crm-model.mjs';
export const reviewStates={awaiting:'Aguardando documento',review:'Em conferência',proposed:'Correção proposta',validated:'Validado'};
const text=(value,max)=>String(value??'').trim().slice(0,max);
export function cleanQualityReview(input){
  if(!input||!/^[-A-Za-z0-9]{1,80}$/.test(input.recordId||'')||!Object.hasOwn(reviewStates,input.status))throw new Error('Conferência cadastral inválida.');
  const version=Number(input.version??0),recordVersion=Number(input.recordVersion??0);
  if(!Number.isSafeInteger(version)||version<0||!Number.isSafeInteger(recordVersion)||recordVersion<0)throw new Error('Versão da conferência inválida.');
  const dueDate=text(input.dueDate,10);
  if(dueDate&&(!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)||!Number.isFinite(Date.parse(dueDate+'T12:00:00Z'))||new Date(dueDate+'T12:00:00Z').toISOString().slice(0,10)!==dueDate))throw new Error('Prazo inválido.');
  return {recordId:input.recordId,status:input.status,version,recordVersion,assigneeId:text(input.assigneeId,120),assigneeName:text(input.assigneeName,120),dueDate,evidence:text(input.evidence,1200),note:text(input.note,1600),updatedAt:text(input.updatedAt,40),updatedBy:text(input.updatedBy,120)};
}
export function cleanQualityDrafts(input,ids){
  if(input===undefined)return [];if(!Array.isArray(input)||input.length>50000)throw new Error('Rascunhos de conferência inválidos.');
  const seen=new Set();return input.map(entry=>{if(!Array.isArray(entry)||entry.length!==2||seen.has(entry[0])||ids&&!ids.has(entry[0]))throw new Error('Referência do rascunho de conferência inválida.');seen.add(entry[0]);return [entry[0],{...cleanQualityReview({...entry[1],recordId:entry[0]}),operation:null}];});
}
export function qualityCases(records,reviews=[]){
  const saved=new Map(reviews.map(r=>[r.recordId,r]));
  return records.filter(r=>!r.deleted&&((r.flags||[]).length||saved.has(r.id))).map(record=>{
    const stored=saved.get(record.id),stale=stored?.status==='validated'&&(stored.recordVersion!==record.version||(record.flags||[]).length>0);
    const review=stored?{...stored,status:stale?'review':stored.status}:{recordId:record.id,status:'awaiting',version:0,recordVersion:record.version,assigneeId:'',assigneeName:'',dueDate:'',evidence:'',note:''};
    return {record,review,stale,reasons:record.flags||[],primary:(record.primaryFlags||[]).length>0,duplicate:!!record.duplicate,unlocated:!record.location,search:normalize([record.name,record.title,record.cpf,record.contact,record.leadership,record.coordinator,review.assigneeName,review.note,...(record.flags||[]).map(f=>f.message)].join(' '))};
  }).sort((a,b)=>Number(b.primary)-Number(a.primary)||a.record.name.localeCompare(b.record.name,'pt-BR'));
}
export function sameQualityReview(a,b){const fields=['status','assigneeId','dueDate','evidence','note'];return !!a&&!!b&&fields.every(k=>String(a[k]||'')===String(b[k]||''));}
