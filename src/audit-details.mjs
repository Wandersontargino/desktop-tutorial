import {reviewStates} from '../lib/quality-workflow.mjs';
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const auditOperationLabels={'qualidade-conferencia':'Conferência cadastral','recuperacao-quality':'Recuperação de conferência','historico-recuperado':'Histórico recuperado de uma cópia'};
export function auditProvenance(item){const origin=item.after?._sourceAudit;return origin?`<p class="compact-note">Origem da cópia: ${esc(origin.createdAt)} • ${esc(origin.userName)} • ${esc(origin.operation)}. Recuperação registrada separadamente em ${esc(item.created_at)}.</p>`:'';}
export function auditMetadata(item){
  const value=item.after||{};
  if(value.recordId&&Object.hasOwn(reviewStates,value.status))return `<dl class="crm-archived-fields">${[['Conferência',reviewStates[value.status]],['Responsável',value.assigneeName||'Não atribuído'],['Prazo',value.dueDate||'Não informado'],['Fonte documental conferida',value.evidence||'Não informada'],['Observação',value.note||'Não informada']].map(([label,text])=>`<div><dt>${label}</dt><dd>${esc(text)}</dd></div>`).join('')}</dl>`;
  if(typeof value.observation==='string')return `<p class="crm-archived-observation">${esc(value.observation)}</p>`;
  return null;
}
