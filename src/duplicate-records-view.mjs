import {normalize} from '../lib/crm-model.mjs';
import {duplicateFields} from '../lib/duplicate-records.mjs';
import {findSimilarRecords,suggestDuplicateObservation} from '../lib/local-record-review.mjs';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={review:'Revisão necessária',eligible:'Dados coincidentes',resolved:'Tratada — mais antigo ativo'};
const date=value=>value&&Number.isFinite(Date.parse(value))?new Date(value).toLocaleString('pt-BR'):'Data de criação não comprovada';

export function initDuplicateRecords({container,request,getState,prepareBackup,acceptSnapshot,openRecord,setBusy=()=>{},getRecords=()=>[],getDrafts=()=>new Map(),setDraft=()=>{},persistDrafts=async()=>{}}){
  let data=null,loading=false,saving=false,epoch=0,currentPage=0,draftTimer,similar=null;
  container.innerHTML=`<h3>Duplicidades</h3><p class="compact-note">Compare os cadastros e confira a observação de cada grupo. O tratamento mantém o mais antigo ativo quando a identidade, os dados e a ordem de criação estão comprovados. As repetições são arquivadas com histórico.</p><div class="crm-duplicate-toolbar"><button type="button" class="button secondary" id="crm-duplicates-refresh">Atualizar duplicidades</button><button type="button" class="button primary" id="crm-duplicates-safe">Tratar casos seguros</button></div><p id="crm-duplicates-status" role="status" aria-live="polite"></p><div id="crm-duplicates-summary" class="metric-grid"></div><div class="crm-duplicate-filters"><label class="field"><span>Buscar duplicidades</span><input id="crm-duplicates-search" type="search" placeholder="Nome, documento, liderança ou observação" maxlength="300"></label><label class="field"><span>Situação da duplicidade</span><select id="crm-duplicates-filter"><option value="">Todas as situações</option><option value="review">Revisão necessária</option><option value="eligible">Dados coincidentes</option><option value="resolved">Tratadas</option></select></label></div><p id="crm-duplicates-count" class="compact-note"></p><div id="crm-duplicates-items"></div><div class="button-row"><button type="button" class="button secondary" id="crm-duplicates-previous">Anterior</button><span id="crm-duplicates-page"></span><button type="button" class="button secondary" id="crm-duplicates-next">Próxima</button></div>`;
  const $=id=>container.querySelector('#crm-duplicates-'+id);
  const draftsPanel=container.ownerDocument.createElement('div');draftsPanel.className='crm-duplicate-observation';draftsPanel.innerHTML='<p id="crm-duplicates-drafts-status" role="status"></p><button type="button" class="button secondary" id="crm-duplicates-resume">Retomar observações pendentes</button>';container.querySelector('.crm-duplicate-toolbar').after(draftsPanel);
  const localPanel=container.ownerDocument.createElement('details');localPanel.className='crm-tool';localPanel.innerHTML='<summary>Conferência local: nomes semelhantes</summary><p class="compact-note">Busca auxiliar por pequenas diferenças de escrita. A semelhança não comprova identidade. Os motivos e documentos divergentes aparecem para revisão individual, sem tratamento automático. O cálculo ocorre neste aparelho, sem enviar dados a serviços de IA.</p><button type="button" class="button secondary" id="crm-duplicates-similar">Buscar nomes semelhantes</button><p id="crm-duplicates-similar-status" role="status" aria-live="polite"></p><div id="crm-duplicates-similar-items"></div>';$('summary').after(localPanel);
  const draftAllowed=()=>{const s=getState();return s.unlocked&&s.owner&&(s.canDraft??s.canEdit);};
  const draftEntries=()=>getDrafts() instanceof Map?[...getDrafts().entries()]:[];
  function draftStatus(){const count=draftEntries().length;draftsPanel.hidden=!getState().unlocked||!count;$('drafts-status').textContent=count+' observação(ões) pendente(s) neste aparelho. Os rascunhos usam a cópia protegida e podem ser retomados após entrar novamente.';$('resume').disabled=!allowed()||!count;}
  async function persist(){clearTimeout(draftTimer);try{await persistDrafts();}catch(e){message('Não foi possível salvar o rascunho protegido: '+e.message,true);throw e;}}
  function message(text,error=false){$('status').textContent=text;$('status').classList.toggle('error-text',error);}
  function allowed(){const state=getState();return state.unlocked&&state.owner&&state.canEdit&&!state.dirty&&navigator.onLine&&!saving&&!loading;}
  function render(){
    const state=getState(),groups=data?.groups||[];
    const expanded=new Set([...container.querySelectorAll('.crm-duplicate-note[open]')].map(el=>el.closest('[data-duplicate-group]').dataset.duplicateGroup));
    draftStatus();
    localPanel.hidden=!state.unlocked;$('similar').disabled=!state.unlocked||!data||state.dirty||loading||saving;
    $('similar-status').textContent=similar?`${similar.matches.length} par(es) sugerido(s) para revisão. Nenhum cadastro alterado.${similar.limited?' A busca foi limitada; os resultados não são exaustivos.':''}`:'';
    $('similar-items').innerHTML=(similar?.matches||[]).map(pair=>`<article class="crm-duplicate-observation"><h4>${pair.records.map(r=>esc(r.name)).join(' / ')}</h4><ul>${pair.reasons.map(reason=>`<li>${esc(reason)}</li>`).join('')}</ul>${pair.warnings.length?`<ul class="crm-duplicate-alerts">${pair.warnings.map(warning=>`<li>${esc(warning)}</li>`).join('')}</ul>`:''}<p class="compact-note">Possível coincidência; confira os documentos de cada pessoa.</p><div class="button-row">${pair.records.map(r=>`<button type="button" class="button secondary" data-duplicate-edit="${esc(r.id)}" ${state.canEdit?'':'disabled'}>Revisar ${esc(r.name)}${r.deleted?' (arquivado)':''}</button>`).join('')}</div></article>`).join('');
    $('refresh').disabled=loading||saving||!state.unlocked||!navigator.onLine;
    $('safe').hidden=!state.owner;$('safe').disabled=!allowed()||!data?.summary?.eligible;
    $('summary').innerHTML=data?[['Grupos encontrados',data.summary.groups],['Para revisão',data.summary.review],['Dados coincidentes',data.summary.eligible],['Tratados',data.summary.resolved]].map(([label,n])=>`<div class="metric-card"><span>${label}</span><strong>${n}</strong></div>`).join(''):'';
    const term=normalize($('search').value),filter=$('filter').value;
    const visible=groups.filter(g=>(!filter||g.status===filter)&&(!term||normalize([g.observation,...g.records.flatMap(r=>[r.id,r.name,r.title,r.cpf,r.leadership,r.coordinator])].join(' ')).includes(term)));
    currentPage=Math.min(currentPage,Math.max(0,Math.ceil(visible.length/10)-1));
    $('count').textContent=data?`${visible.length} grupo(s) no filtro. A comparação abrange toda a base autorizada.`:'';
    $('items').innerHTML=visible.slice(currentPage*10,currentPage*10+10).map(g=>{
      const divergent=new Set(g.differences.map(d=>d.field)),draft=getDrafts().get(g.id);
      return `<article class="crm-duplicate-card is-${g.status}" data-duplicate-group="${esc(g.id)}"><div class="subpanel-heading"><h4>${esc(g.records.find(r=>r.id===g.principalId)?.name||g.records[0].name||'Nome não informado')}</h4><span class="crm-duplicate-badge">${labels[g.status]}</span></div><p class="compact-note">${g.records.length} cadastros · ${g.active} ativo(s)${g.principalId?' · '+(g.status==='resolved'?'Principal mantido: ':'Mais antigo: ')+esc(g.principalId):''}</p><div class="crm-duplicate-observation"><strong>Observação</strong><p>${esc(g.observation)}</p>${g.review?`<small>${esc(g.review.updatedBy)} · ${esc(date(g.review.updatedAt))}</small>`:''}</div>${g.blockers.length?`<ul class="crm-duplicate-alerts">${g.blockers.map(b=>`<li>${esc(b)}</li>`).join('')}</ul>`:''}<details class="crm-duplicate-comparison" ${g.status==='review'?'open':''}><summary>Comparar os dados dos ${g.records.length} cadastros</summary><div class="table-scroll"><table class="data-table"><caption>Campos divergentes destacados para conferência</caption><thead><tr><th>Campo</th>${g.records.map(r=>`<th scope="col">${esc(r.name)}<small>${esc(r.id)}</small><span>${r.deleted?'Arquivado':r.id===g.principalId?'Ativo · mais antigo':'Ativo'}</span><small>${esc(date(r.createdAt))}</small><button type="button" class="button secondary" data-duplicate-edit="${esc(r.id)}" ${state.canEdit?'':'disabled'}>Revisar cadastro</button></th>`).join('')}</tr></thead><tbody>${Object.entries(duplicateFields).map(([field,label])=>`<tr class="${divergent.has(field)?'crm-duplicate-divergent':''}"><th scope="row">${label}${divergent.has(field)?' · divergência':''}</th>${g.records.map(r=>`<td>${esc(r[field]||'Não informado')}</td>`).join('')}</tr>`).join('')}<tr><th scope="row">Observações do cadastro</th>${g.records.map(r=>`<td>${esc(r.notes||'Sem observações')}</td>`).join('')}</tr><tr><th scope="row">Fonte</th>${g.records.map(r=>`<td>${esc(r.source||'Não informada')}</td>`).join('')}</tr></tbody></table></div></details>${g.eligible?`<button type="button" class="button primary" data-duplicate-resolve="${esc(g.id)}" ${allowed()?'':'disabled'}>Manter mais antigo e arquivar repetições</button>`:''}${state.owner?`<details class="crm-duplicate-note" ${expanded.has(g.id)||draft?'open':''}><summary>Registrar observação${draft?' · rascunho pendente':''}</summary><form data-duplicate-note="${esc(g.id)}"><label class="field" for="duplicate-note-${esc(encodeURIComponent(g.id))}"><span>Observação da duplicidade</span><textarea id="duplicate-note-${esc(encodeURIComponent(g.id))}" name="observation" rows="3" maxlength="1600" required ${draftAllowed()&&!saving?'':'disabled'}>${esc(draft?.observation??g.observation)}</textarea></label><button class="button secondary" type="submit" ${allowed()?'':'disabled'}>Salvar observação</button></form></details>`:''}${state.owner&&g.review?.backupId?`<a class="button secondary" href="/api/crm/duplicates/backup?operationId=${encodeURIComponent(g.review.backupId)}" download>Baixar cópia anterior protegida</a>`:''}</article>`;
    }).join('')||(data?'<p class="compact-note">Nenhuma duplicidade encontrada neste filtro.</p>':'');
    for(const g of visible.slice(currentPage*10,currentPage*10+10)){
      const form=[...$('items').querySelectorAll('[data-duplicate-note]')].find(el=>el.dataset.duplicateNote===g.id),suggestion=suggestDuplicateObservation(g);
      if(!form||!suggestion)continue;
      const preview=container.ownerDocument.createElement('details');preview.className='crm-tool';
      preview.innerHTML=`<summary>Sugestão local de observação</summary><p class="compact-note">Texto montado pelas regras de conferência. Revise antes de salvar na base central.</p><p>${esc(suggestion)}</p><button type="button" class="button secondary" data-duplicate-suggest="${esc(g.id)}" ${draftAllowed()&&!saving&&!loading&&!getDrafts().has(g.id)?'':'disabled'}>Usar como rascunho</button>`;
      form.before(preview);
    }
    $('page').textContent=data?`Página ${currentPage+1} de ${Math.max(1,Math.ceil(visible.length/10))}`:'';
    $('previous').disabled=currentPage===0;$('next').disabled=(currentPage+1)*10>=visible.length;
  }
  async function open(){
    if(!getState().unlocked||loading||saving)return;
    if(!navigator.onLine){message('Conecte à internet para conferir as duplicidades na base central.');return;}
    const token=++epoch;loading=true;similar=null;render();message('Conferindo identidade, dados e histórico de inclusão…');
    try{const value=await request('duplicates');if(token!==epoch||!getState().unlocked)return;data=value;render();message(getState().dirty?'Há edições locais pendentes. Sincronize antes de tratar duplicidades.':`${value.summary.groups} grupo(s) conferido(s). ${value.summary.review} com revisão necessária; ${value.summary.eligible} com dados coincidentes; ${value.summary.resolved} tratado(s).`);}
    catch(e){if(token===epoch)message(e.message,true);}finally{if(token===epoch){loading=false;render();}}
  }
  async function apply(action,groupId,observation){
    if(!allowed()||!data)return false;
    if(action==='note'&&(!String(observation??'').trim()||String(observation).length>1600)){message('Escreva uma observação com até 1600 caracteres.',true);return false;}
    let operation,protectedDraft=action!=='note';
    if(action==='note'){
      const group=data.groups.find(g=>g.id===groupId);if(!group)return false;
      const prior=getDrafts().get(groupId),same=prior?.observation===observation;
      operation=same&&prior.operation?prior.operation:{operationId:crypto.randomUUID(),revision:data.revision};
      setDraft(groupId,{observation,baseObservation:same?prior.baseObservation:group.observation,operation,updatedAt:new Date().toISOString()});
    }
    const token=epoch;saving=true;setBusy(true);render();message(action==='note'?'Salvando observação…':'Preparando cópia protegida e tratando os dados coincidentes…');
    try{
      if(action==='note'){await persist();protectedDraft=true;}
      const backup=action==='note'?undefined:await prepareBackup(data.revision);
      if(token!==epoch||!getState().unlocked)return;
      const result=await request('duplicates','POST',{action,groupId,observation,backup,revision:operation?.revision??data.revision,operationId:operation?.operationId??crypto.randomUUID()});
      if(token!==epoch||!getState().unlocked)return;
      await acceptSnapshot(result.snapshot);if(token!==epoch)return;
      data=result.duplicates;similar=null;if(action==='note'){const draft=getDrafts().get(groupId);if(draft?.observation===observation&&draft.operation?.operationId===operation.operationId)setDraft(groupId,null);await persist();}
      render();message(action==='note'?'Observação salva e exibida nesta aba.':`${result.groups} grupo(s) tratado(s). ${result.archived} repetição(ões) arquivada(s). O cadastro mais antigo permanece ativo com observação. Cópia protegida e histórico preservados.`);return true;
    }catch(e){if(token===epoch){if(action==='note'&&e.status===409){const draft=getDrafts().get(groupId);if(draft){setDraft(groupId,{...draft,operation:null});await persist().catch(()=>{});}}message(e.message+(action==='note'?(protectedDraft?' A observação permanece como rascunho protegido. Entre novamente, atualize a consulta e retome o envio.':' O envio não foi iniciado. Mantenha a aba aberta para recuperar o texto.'):' Atualize a consulta para conferir o estado central.'),true);}return false;}finally{setBusy(false);if(token===epoch){saving=false;render();}}
  }
  async function resume(){
    if(!allowed())return;await open();if(!data||!allowed())return;
    let sent=0,conflicted=0;
    for(const [id,draft]of draftEntries()){
      const group=data.groups.find(g=>g.id===id);
      if(!group){conflicted++;continue;}
      if(group.review?.observation===draft.observation){setDraft(id,null);await persist();sent++;continue;}
      if(group.observation!==draft.baseObservation){conflicted++;continue;}
      if(!await apply('note',id,draft.observation))return;sent++;
    }
    render();message(sent+' observação(ões) confirmada(s) na base central.'+(conflicted?' '+conflicted+' rascunho(s) exige(m) comparação com a observação central atual. Abra Registrar observação, confira os dois textos e use Salvar observação.':''));
  }
  container.addEventListener('input',event=>{
    const form=event.target.closest('[data-duplicate-note]');if(!form||!draftAllowed()||saving)return;
    const id=form.dataset.duplicateNote,group=data?.groups.find(g=>g.id===id);if(!group)return;
    const observation=form.elements.observation.value,previous=getDrafts().get(id);
    setDraft(id,observation===group.observation?null:{observation,baseObservation:previous?.baseObservation??group.observation,operation:null,updatedAt:new Date().toISOString()});
    draftStatus();clearTimeout(draftTimer);draftTimer=setTimeout(()=>persist().catch(()=>{}),250);
  });
  $('resume').addEventListener('click',()=>resume().catch(e=>message(e.message,true)));
  $('similar').addEventListener('click',()=>{const s=getState();if(!s.unlocked||!data||s.dirty||loading||saving)return;similar=findSimilarRecords(getRecords(),data.groups);render();});
  $('refresh').addEventListener('click',open);$('safe').addEventListener('click',()=>apply('resolve-safe'));
  for(const id of ['search','filter'])$(id).addEventListener(id==='search'?'input':'change',()=>{currentPage=0;render();});
  $('previous').addEventListener('click',()=>{currentPage--;render();});$('next').addEventListener('click',()=>{currentPage++;render();});
  container.addEventListener('click',event=>{const b=event.target.closest('button');if(b?.dataset.duplicateEdit)openRecord(b.dataset.duplicateEdit);if(b?.dataset.duplicateResolve)apply('resolve',b.dataset.duplicateResolve);if(b?.dataset.duplicateSuggest&&draftAllowed()&&!loading&&!saving){const group=data?.groups.find(g=>g.id===b.dataset.duplicateSuggest),observation=suggestDuplicateObservation(group);if(!observation||getDrafts().has(group.id))return;try{const token=epoch;setDraft(group.id,{observation,baseObservation:group.observation,operation:null,updatedAt:new Date().toISOString()});render();persist().then(()=>{if(token===epoch&&getState().unlocked)message('Sugestão guardada como rascunho protegido. Confira o texto e use Salvar observação.');}).catch(()=>{});}catch(e){message(e.message,true);}}});
  container.addEventListener('submit',event=>{const form=event.target.closest('[data-duplicate-note]');if(!form)return;event.preventDefault();apply('note',form.dataset.duplicateNote,form.elements.observation.value);});
  function clear(){clearTimeout(draftTimer);epoch++;data=null;similar=null;localPanel.open=false;loading=false;saving=false;currentPage=0;$('search').value='';$('filter').value='';message('');render();}
  return {open,clear,refresh:render};
}
