import {buildLeadershipPendencyReport,leadershipPendencyModes} from '../lib/leadership-pendency-report.mjs';
import {initGroupAdmin} from './group-admin-view.mjs';
import {initSecurityView} from './security-view.mjs';
import {registerPdfBatchTool} from './pdf-batch-agent.mjs';
import {matchesElectoralFilter,electoralChoices} from '../lib/record-filters.mjs';
import { initUniversalSearch } from './unified-search.mjs';
import QRCode from 'qrcode';
import { countableForResults, confirmedElectoralLocation, cleanRecord, assess, assessRecords, quality, normalize, validTitle, parseIntakeText, sameRecord, identityFields, documentaryReviewPending, setDocumentaryReview } from '../lib/crm-model.mjs';
import { deriveVaultKey, seal, unseal, newSalt, vaultStore } from '../public/secure-vault.mjs';
import { createBackup, readBackup, recoveryChanges,MAX_BACKUP_BYTES } from '../lib/crm-backup.mjs';
import {recoveryMetadataChanges,cleanDuplicateDrafts} from '../lib/crm-recovery.mjs';
import {initGroupPartnership} from './group-partnership-view.mjs';
import {initLeadershipMap} from './leadership-map-view.mjs';
import {cleanLeadershipLocation,locationGroupId,recoverLeadershipLocations} from '../lib/leadership-location.mjs';
import {buildPendencyReport,registrationCategory,municipalitySummary} from '../lib/pendency-report.mjs';
import {buildSimpleRegistrationReport,simpleRegistrationModes} from '../lib/simple-registration-report.mjs';
import {createRegistrationDistributionView} from './registration-distribution-view.mjs';
import {initDuplicateRecords} from './duplicate-records-view.mjs';
import {fetchCrmJSON} from './crm-request.mjs';
import {keepEmergencyCopy,emergencyCopies,clearEmergencyCopy} from './protected-recovery.mjs';
import {createTabActivity} from './crm-tab-activity.mjs';
import {initArchivedRecords} from './archived-records-view.mjs';
import {initQualityWorkflow} from './quality-workflow-view.mjs';
import {initOperationsView} from './operations-view.mjs';
import {initDocumentReview} from './document-review-view.mjs';
import {auditOperationLabels,auditMetadata,auditProvenance} from './audit-details.mjs';
import {cleanQualityReview,cleanQualityDrafts,sameQualityReview} from '../lib/quality-workflow.mjs';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fieldLabels={name:'Nome',title:'Título',zone:'Zona',section:'Seção',contact:'Telefone',leadership:'Liderança',coordinator:'Coordenador',mother:'Mãe',cpf:'CPF',rg:'RG',birth:'Nascimento',source:'Fonte',notes:'Observações',deleted:'Arquivado'};
function validationMarkup(r){
  const primary=r.primaryFlags||[],secondary=r.secondaryFlags||[];
  return `<span class="crm-main-status ${r.ready?'is-ok':'is-priority'}">${r.ready?'✓ OK — dados principais validados':'! COM PENDÊNCIA — revisar dados principais'}</span>${primary.length?`<ul class="crm-primary-flags">${primary.map(f=>`<li>${esc(f.message)}</li>`).join('')}</ul>`:''}${secondary.length?`<details class="crm-secondary-notes"><summary>${secondary.length} pendência(s) secundária(s)</summary><ul>${secondary.map(f=>`<li>${esc(f.message)}</li>`).join('')}</ul></details>`:'<small class="crm-complete-note">Sem pendências secundárias</small>'}`;
}
const notifyPrivateState=()=>document.dispatchEvent(new CustomEvent('crm:state-change'));
let loginMode='sites';
let storageUnavailable=false,accessEpoch=0;
let api,user,key,salt,cloud={revision:0,records:[]},pending=new Map(),locations={},conflicts=[],inflight=null,unlocked=false,busy=false,lockTimer,saveTail=Promise.resolve(),lastOnline='',submissionToApprove=null,submissionApprovals={},recoveryCopies=[];
let universalSearch;
const registrationViews={};
let registrationMunicipalityOverride=null;
let partnershipView,securityView,groupAdmin,duplicateView,archivedView,qualityView,operationsView,documentReview;
let leadershipMap,leadershipMapRequested=false,homeSummary=null,locationDrafts=new Map(),duplicateDrafts=new Map(),qualityDrafts=new Map();
let approved=false,reviewReason='',intakeToken='',ocrWorker;
let checkedBackup=null,backupEpoch=0;
let recoveryPlan=null,lastRecoveryBackupId='';
const pendingCount=()=>pending.size+(recoveryPlan?.entries?.length||0);
const backupOptions=()=>({partnerships:cloud.partnerships||[],duplicateReviews:cloud.duplicateReviews||[],duplicateDrafts:[...duplicateDrafts.entries()],qualityReviews:cloud.qualityReviews||[],qualityDrafts:[...qualityDrafts.entries()],recordCreatedAt:Object.fromEntries(cloud.records.map(r=>[r.id,r.createdAt||null]))});
let tabActivity;
async function request(path,method='GET',data,options={}){
  const epoch=accessEpoch,identity=user?.id,privateRequest=path!=='session'&&!path.startsWith('intake');
  const {response:r,value}=await fetchCrmJSON(path,method,data,{headers:options.knownRevision===undefined?{}:{'X-PA-Known-Revision':String(options.knownRevision)}});
  if(privateRequest&&(!unlocked||epoch!==accessEpoch||identity!==user?.id))throw Object.assign(new Error('O acesso mudou durante a consulta. Entre novamente para continuar.'),{code:'ACCESS_CHANGED'});
  if(!r.ok){
    if(unlocked&&path!=='session'&&(r.status===401||r.status===403)){
      let revoke=r.status===401;
      if(r.status===403){const {response:check}=await fetchCrmJSON('session');revoke=check.status===403;}
      if(revoke){lastOnline='';await lock('Acesso precisa de nova validação online.',false);}
    }
    throw Object.assign(new Error(value.error||'Não foi possível concluir.'),{status:r.status,details:value.details});
  }return value;
}
const rawWorking=()=>{const map=new Map(cloud.records.map(r=>[r.id,r]));for(const [id,r]of pending)map.set(id,r);return [...map.values()];};
let assessmentCache=null,searchTimer=null;
const searchIndex=new WeakMap();
function recordSearch(r){if(!searchIndex.has(r))searchIndex.set(r,normalize([r.name,r.title,r.zone,r.section,r.id,r.contact,r.leadership,r.coordinator,...(r.primaryFlags||[]).map(f=>f.message)].join(' ')));return searchIndex.get(r);}
let ocrLoading=null;
async function loadOCR(){
  if(window.PlatformOCR)return window.PlatformOCR;
  if(!ocrLoading)ocrLoading=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='/ocr-runtime.js?v=2026-10-14-performance-v47';script.onload=()=>resolve(window.PlatformOCR);script.onerror=()=>{script.remove();ocrLoading=null;reject(new Error('Não foi possível carregar a leitura de fotos. Confira a conexão ou prepare o uso offline.'));};document.head.append(script);});return ocrLoading;
}
const working=()=>{
  const entries=[...pending.entries()];
  if(assessmentCache&&assessmentCache.records===cloud.records&&assessmentCache.locations===locations&&assessmentCache.entries.length===entries.length&&entries.every(([id,r],i)=>id===assessmentCache.entries[i][0]&&r===assessmentCache.entries[i][1]))return assessmentCache.value;
  const value=assessRecords(rawWorking(),locations);assessmentCache={records:cloud.records,locations,entries,value};return value;
};
const canEdit=()=>unlocked&&!storageUnavailable&&!busy&&!inflight;
function status(message,error=false){$('crm-status').textContent=message;$('crm-status').classList.toggle('error-text',error);}
function maskPasswords(){for(const id of ['crm-password','crm-confirm'])$(id).type='password';for(const b of document.querySelectorAll('[data-password-target]')){b.textContent='Mostrar';b.setAttribute('aria-pressed','false');b.setAttribute('aria-label','Mostrar senha');}}
function consultationOnly(){storageUnavailable=true;key=null;}
const storageNotice='Senha validada. Base central aberta somente para consulta: o armazenamento protegido deste navegador está indisponível. Feche outras abas da plataforma e entre novamente para habilitar edições. As cópias anteriores foram preservadas.';
function privateState(){return {user,cloud,pending:[...pending.entries()],locationDrafts:[...locationDrafts.entries()],duplicateDrafts:[...duplicateDrafts.entries()],qualityDrafts:[...qualityDrafts.entries()],recoveryPlan,lastRecoveryBackupId,conflicts,inflight,approved,lastOnline,reviewReason,submissionApprovals};}
function restoreQualityDrafts(entries){
  const visible=new Set(cloud.records.map(r=>r.id)),result=new Map();
  for(const entry of entries||[]){try{if(!Array.isArray(entry)||!visible.has(entry[0]))continue;const draft=cleanQualityReview({...entry[1],recordId:entry[0]}),operation=entry[1]?.operation;if(operation&&/^[-A-Za-z0-9]{12,100}$/.test(operation.operationId||'')&&Number.isSafeInteger(operation.revision)&&operation.revision>=0&&operation.recordId===entry[0])draft.operation={...cleanQualityReview(operation),operationId:operation.operationId,revision:operation.revision};result.set(entry[0],draft);}catch{}}
  return result;
}
function restoreDuplicateDrafts(entries){
  if(user?.role!=='owner'||!Array.isArray(entries))return new Map();
  const visible=new Set(cloud.records.map(r=>r.id));
  return new Map(entries.filter(entry=>Array.isArray(entry)&&entry.length===2&&typeof entry[0]==='string'&&entry[0].startsWith('dup:')&&entry[0].slice(4).split('|').every(id=>visible.has(id))&&typeof entry[1]?.observation==='string'&&entry[1].observation.length<=1600&&typeof entry[1]?.baseObservation==='string'&&entry[1].baseObservation.length<=1600));
}
function save(){
  if(!key||!user)return Promise.resolve();const value=privateState(),captureKey=key,email=user.email,currentSalt=salt;
  saveTail=saveTail.catch(()=>{}).then(async()=>{const encrypted=await seal(value,captureKey),copy={salt:currentSalt,...encrypted};try{await vaultStore('put',email,copy);}catch(e){keepEmergencyCopy(email,copy);throw e;}});
  return saveTail.catch(e=>{status(e.message,true);throw e;});
}
function mirror(){
  const groups=new Map();for(const r of working().filter(r=>!r.deleted)){const groupKey=normalize(r.coordinator)+'|'+normalize(r.leadership);if(!groups.has(groupKey))groups.set(groupKey,{id:'central-'+encodeURIComponent(groupKey),name:r.leadership,coordinator:r.coordinator,createdAt:r.updatedAt||'',records:[]});groups.get(groupKey).records.push(r);}
  api.reloadLists(unlocked?[...groups.values()]:[]);
}
function armLock(broadcast=true){clearTimeout(lockTimer);if(unlocked){lockTimer=setTimeout(()=>lock('Bloqueado após 15 minutos sem atividade.'),15*60000);if(broadcast!==false)tabActivity?.activity();}}
function clearPrivateView(){
  clearTimeout(searchTimer);assessmentCache=null;
  for(const view of Object.values(registrationViews))view.clear();
  $('crm-municipality-summary').textContent='';$('crm-accounting-alert').hidden=true;$('crm-uncounted-count').textContent='';$('crm-uncounted-scope').textContent='';$('crm-show-unknown').disabled=true;
  $('crm-leader-filter').replaceChildren(new Option('Todas',''));$('crm-place-filter').replaceChildren(new Option('Todos os locais',''));
  for(const id of ['crm-zone-filter','crm-section-filter','crm-neighborhood-filter','crm-coordinator-filter'])$(id).replaceChildren(new Option('Todos',''));
  $('crm-filter-summary').textContent='';
  homeSummary=null;
  leadershipMapRequested=false;
  resetBackup();$('crm-backup-before-recovery').hidden=true;$('crm-backup-before-recovery').removeAttribute('href');
  groupAdmin?.clear();securityView?.clear();partnershipView?.clear();leadershipMap?.clear();duplicateView?.clear();archivedView?.clear();qualityView?.clear();operationsView?.clear();documentReview?.clear();window.ReportCenter?.clearPrivate?.();
  document.body.classList.add('crm-locked');$('crm-auth').hidden=false;$('crm-central').hidden=true;$('crm-lock').hidden=true;
  for(const id of ['crm-table-body','crm-audit-items','crm-submissions','crm-members','crm-links','crm-link-output','crm-review-items','crm-conflict-items','crm-leadership-options','crm-quality','crm-quality-summary']){$(id).replaceChildren();$(id)._items=[];}
  for(const id of ['crm-editor','crm-review','crm-conflicts-dialog','crm-recovery-dialog'])if($(id).open)$(id).close();
  $('crm-edit-form').reset();$('crm-member-form').reset();$('crm-recovery-form').reset();$('crm-text').value='';$('crm-photo').value='';$('crm-live-validation').textContent='';$('crm-editor-partnership').textContent='';$('crm-account-label').textContent='Protegido';
  $('crm-backup-form').reset();$('crm-backup-preview').textContent='';$('crm-backup-status').textContent='';$('crm-backup-restore').disabled=true;
  $('crm-audit-items')._items=[];$('crm-submissions')._items=[];submissionToApprove=null;
  notifyPrivateState();
}
async function lock(message='Base bloqueada. Use sua senha para abrir novamente.',server=true,propagate=true){
  accessEpoch++;const identity=user?.id,wasUnlocked=unlocked;let capture;
  try{if(wasUnlocked)capture=leadershipMap?.captureDraft();}catch(e){capture=Promise.reject(e);}
  const captured=Promise.resolve(capture).catch(()=>{}),persisted=wasUnlocked?save():Promise.resolve();
  if(propagate)tabActivity?.lock(identity);
  key=null;unlocked=false;busy=false;cloud={revision:0,records:[]};pending=new Map();locationDrafts=new Map();duplicateDrafts=new Map();qualityDrafts=new Map();recoveryPlan=null;lastRecoveryBackupId='';conflicts=[];user=null;inflight=null;submissionApprovals={};clearPrivateView();
  storageUnavailable=false;mirror();status(message);$('crm-password').value='';maskPasswords();clearTimeout(lockTimer);
  if(server&&navigator.onLine)request('session','DELETE',{}).catch(()=>{});
  const results=await Promise.allSettled([captured,persisted]);
  if(!unlocked&&results.some(r=>r.status==='rejected'))status(message+' Não foi possível gravar a cópia principal. Uma cópia de emergência criptografada foi preservada quando o aparelho permitiu. Entre novamente para recuperar as edições.',true);
}
function fields(prefix,full=true){return `<div class="crm-form-grid">
  <label class="field crm-wide"><span>Nome</span><input name="name" id="${prefix}-name" required maxlength="120" autocomplete="name"></label>
  <label class="field"><span>Título de eleitor</span><input name="title" id="${prefix}-title" inputmode="numeric" maxlength="24"></label>
  <label class="field"><span>Telefone com DDD</span><input name="contact" id="${prefix}-contact" type="tel" maxlength="60" autocomplete="tel"></label>
  <label class="field"><span>Zona</span><input name="zone" id="${prefix}-zone" inputmode="numeric" maxlength="6"></label>
  <label class="field"><span>Seção</span><input name="section" id="${prefix}-section" inputmode="numeric" maxlength="6"></label>
  ${full?`<label class="field"><span>Liderança</span><input name="leadership" id="${prefix}-leadership" list="crm-leadership-options" required maxlength="80"></label><label class="field"><span>Coordenador</span><input name="coordinator" id="${prefix}-coordinator" maxlength="100"></label><details class="crm-wide"><summary>Dados complementares</summary><div class="crm-form-grid"><label class="field crm-wide"><span>Nome da mãe</span><input name="mother" id="${prefix}-mother" maxlength="120"></label><label class="field"><span>RG</span><input name="rg" id="${prefix}-rg" maxlength="24"></label><label class="field"><span>CPF</span><input name="cpf" id="${prefix}-cpf" inputmode="numeric" maxlength="20"></label><label class="field"><span>Nascimento</span><input name="birth" id="${prefix}-birth" type="date"></label><label class="field crm-wide"><span>Observações</span><textarea name="notes" id="${prefix}-notes" rows="2" maxlength="1600"></textarea></label></div></details>`:''}
  ${full?`<label class="crm-consent crm-wide"><input name="documentaryReview" id="${prefix}-documentary-review" type="checkbox"> Pendente de conferência documental</label><p class="compact-note crm-wide">Mantenha marcado enquanto houver divergências na ficha. Depois de corrigir e conferir os dados, desmarque para concluir a conferência documental.</p>`:''}
  </div>`;}
function installUI(){
  const target=document.querySelector('.import-card');if(!target)return;
  const query=document.createElement('form');query.id='guided-query-form';query.className='guided-query';query.innerHTML=`<div class="unified-search-field"><label class="field"><span>Busca por candidato ou escola</span><input id="guided-query-input" type="search" placeholder="Nome, número do candidato ou escola" maxlength="400" autocomplete="off"></label><div id="guided-query-results" class="unified-search-results" role="listbox" hidden></div></div><button class="button secondary" type="submit">Consultar</button><p id="guided-query-status" class="compact-note crm-wide" role="status">O cargo é identificado automaticamente. Para nomes semelhantes, escolha o candidato ou a escola com o município correto.</p><p id="guided-query-coverage" class="compact-note crm-wide search-coverage" hidden></p>`;document.querySelector('.hero')?.after(query);
  const panel=document.createElement('section');panel.id='crm-panel';panel.innerHTML=`
  <div class="crm-access-card"><div class="subpanel-heading"><h3>Acesso à base de lideranças</h3><span id="crm-account-label">Protegido</span></div>
  <p id="crm-status" role="status" aria-live="polite">Preparando o acesso seguro.</p>
  <form id="crm-auth" class="crm-auth-grid" novalidate><label class="field"><span>E-mail da conta autorizada</span><input id="crm-email" type="email" required autocomplete="username"></label><label class="field" for="crm-password"><span>Senha da base</span><div class="crm-password-control"><input id="crm-password" type="password" minlength="12" maxlength="200" required autocomplete="current-password"><button class="button secondary" type="button" data-password-target="crm-password" aria-controls="crm-password" aria-pressed="false" aria-label="Mostrar senha">Mostrar</button></div></label><label class="field" id="crm-confirm-wrap" for="crm-confirm" hidden><span>Confirme a nova senha</span><div class="crm-password-control"><input id="crm-confirm" type="password" minlength="12" maxlength="200" autocomplete="new-password"><button class="button secondary" type="button" data-password-target="crm-confirm" aria-controls="crm-confirm" aria-pressed="false" aria-label="Mostrar senha">Mostrar</button></div></label><label class="field" id="crm-mfa-wrap" hidden><span>Código do autenticador ou de recuperação</span><input id="crm-mfa-code" autocomplete="one-time-code" maxlength="32"></label><button class="button primary" id="crm-unlock" type="submit">Entrar</button><p id="crm-auth-note" class="compact-note crm-wide">O acesso ao site usa sua conta autorizada. A senha protege a base e a cópia offline neste aparelho. Use uma frase de pelo menos 12 caracteres.</p></form>
  <div class="button-row"><button id="crm-lock" class="button secondary" type="button" hidden>Bloquear base</button><a id="crm-signout" class="button secondary" href="/signout-with-chatgpt?return_to=/">Sair da conta</a></div><button id="crm-recover-copy" class="button secondary" type="button" hidden>Recuperar edições da senha anterior</button>
  </div>
  <section id="crm-intake-panel" class="crm-access-card" hidden><h3 id="crm-intake-title">Enviar cadastro</h3><form id="crm-intake-form">${fields('intake',false)}<label class="crm-consent"><input id="intake-consent" type="checkbox" required> Autorizo o registro destas informações na base da liderança informada.</label><p class="compact-note">Não informe em quem votou. O cadastro será revisado antes de entrar na base.</p><button class="button primary" type="submit">Enviar para revisão</button><p id="crm-intake-status" role="status"></p></form></section>
  <section id="crm-central" hidden>
  <section id="crm-accounting-alert" class="crm-accounting-alert" aria-label="Cadastros não contabilizados" hidden><div><strong><span id="crm-uncounted-count"></span> não contabilizados nos resultados</strong><p>Local não confirmado · Conferir zona e seção</p><small id="crm-uncounted-scope"></small></div><button id="crm-show-unknown" class="button primary" type="button" disabled>Ver cadastros não contabilizados</button></section><p class="compact-note crm-general-accounting">Visão geral da base autorizada: os indicadores abaixo incluem todos os municípios da liderança selecionada. A contabilidade do município aparece no painel territorial.</p><div id="crm-quality" class="metric-grid crm-quality"></div><p id="crm-quality-summary" class="compact-note" role="status"></p>
  <div class="crm-toolbar"><button id="crm-new" class="button primary" type="button">Novo cadastro</button><button id="crm-sync" class="button primary" type="button">Sincronizar</button><button id="crm-review-button" class="button secondary" type="button" hidden>Revisar atualização</button><button id="crm-conflict-button" class="button secondary" type="button" hidden>Resolver conflitos</button><button id="crm-refresh" class="button secondary" type="button">Atualizar do servidor</button><button id="crm-export" class="button secondary" type="button">Exportar base completa</button></div>
  <p id="crm-sync-status" class="compact-note" role="status"></p>
  <details class="crm-tool" id="crm-backup-tool"><summary>Cópia de segurança protegida</summary><p class="compact-note">Guarda todos os campos, inclusive cadastros arquivados, parcerias, observações de duplicidade, rascunhos e datas de inclusão disponíveis, com a senha da base. A recuperação apresenta as diferenças para revisão antes de sincronizar.</p><button id="crm-backup-download" class="button secondary" type="button">Salvar cópia protegida</button><form id="crm-backup-form" class="crm-form-grid"><label class="field"><span>Cópia da plataforma (.json)</span><input id="crm-backup-file" type="file" accept=".json,application/json" required></label><label class="field"><span>Chave protegida (.json), para cópia automática</span><input id="crm-backup-key-file" type="file" accept=".json,application/json"></label><label class="field"><span>Senha usada ao salvar a cópia ou a chave</span><input id="crm-backup-password" type="password" required autocomplete="off" maxlength="200"></label><button id="crm-backup-check" class="button secondary" type="submit">Conferir cópia</button></form><p id="crm-backup-preview" class="compact-note"></p><button id="crm-backup-restore" class="button primary" type="button" disabled>Revisar recuperação</button><p id="crm-backup-status" class="compact-note" role="status" aria-live="polite"></p><a id="crm-backup-before-recovery" class="button secondary" hidden>Baixar cópia anterior à recuperação</a></details>
  <details id="crm-security" class="crm-tool"></details><details id="crm-group-admin" class="crm-tool" hidden></details><div class="crm-quality-legend"><span class="crm-main-status is-ok">✓ Verde: dados principais OK</span><span class="crm-secondary-label">Pendências secundárias ficam indicadas à parte</span><span class="crm-main-status is-priority">! Vermelho: COM PENDÊNCIA nos dados principais</span></div>
  <div class="crm-filter-grid"><label class="field"><span>Buscar cadastro</span><input id="crm-search" type="search" placeholder="Nome, título, zona ou seção"></label><label class="field"><span>Liderança</span><select id="crm-leader-filter"><option value="">Todas</option></select></label><label class="field"><span>Situação</span><select id="crm-status-filter"><option value="">Todos os ativos</option><option value="red">COM PENDÊNCIA: dados principais</option><option value="green">OK: dados principais validados</option><option value="secondary">Aprovados com pendências secundárias</option><option value="complete">100% completos</option><option value="unknown">Não contabilizados: local não confirmado</option><option value="archived">Arquivados</option></select></label><label class="field"><span>Local de votação</span><select id="crm-place-filter"><option value="">Todos os locais</option></select></label><label class="field"><span>Zona eleitoral</span><select id="crm-zone-filter"><option value="">Todas as zonas</option></select></label><label class="field"><span>Seção eleitoral</span><select id="crm-section-filter"><option value="">Todas as seções</option></select></label><label class="field"><span>Bairro do local de votação</span><select id="crm-neighborhood-filter"><option value="">Todos os bairros</option></select></label><label class="field"><span>Coordenação</span><select id="crm-coordinator-filter"><option value="">Todas as coordenações</option></select></label></div><div class="crm-filter-actions"><p id="crm-filter-summary" class="compact-note" role="status"></p><button id="crm-clear-filters" class="button secondary" type="button">Limpar filtros da lista</button></div>
  <section class="crm-priority-actions" aria-label="Busca rápida de cadastros para revisão"><h4>Cadastros COM PENDÊNCIA — busca rápida</h4><p class="compact-note">Use a busca da lista para localizar por nome, título, telefone ou motivo da pendência.</p><div class="button-row"><button id="crm-show-unapproved" class="button secondary" type="button">Buscar com pendência</button><button id="crm-unapproved-report" class="button primary" type="button">Relatório com pendência</button></div></section>
  <section id="crm-registration-summary" class="registration-summary" hidden></section>
  <label class="field"><span>Município da contabilidade e dos relatórios</span><select id="crm-report-municipality"><option value="4154" selected>ANANINDEUA</option><option value="">Todos os municípios identificados</option></select></label>
  <p id="crm-municipality-summary" class="compact-note" role="status"></p>
  <div class="crm-toolbar"><button id="crm-pendency-report" class="button secondary" type="button" aria-describedby="crm-pendency-note">Relatório simples por liderança</button><button id="crm-municipality-report" class="button primary" type="button">Resumo por municípios</button></div><p id="crm-pendency-note" class="compact-note">Relatório simples com total, OK e com pendência por liderança. Mostra apenas nome, zona, seção, local de votação e situação. OK considera os dados principais; pendências secundárias não entram neste relatório. O resumo por municípios permanece disponível à parte.</p>
  <p id="crm-list-note" class="compact-note"></p><p class="table-scroll-hint">Deslize a tabela para ver todas as colunas.</p><div class="table-scroll" role="region" aria-label="Cadastros da base" tabindex="0"><table class="data-table crm-table"><thead><tr><th>Nome / ID</th><th>Liderança</th><th>Título</th><th>Zona / seção</th><th>Escola / bairro</th><th>Conferência</th><th>Ações</th></tr></thead><tbody id="crm-table-body"></tbody></table></div><div class="button-row"><button id="crm-previous-page" class="button secondary" type="button">Anterior</button><span id="crm-page-note"></span><button id="crm-next-page" class="button secondary" type="button">Próxima</button></div>
  <details class="crm-tool"><summary>Receber cadastros por link ou QR Code</summary><p class="compact-note">Os destinatários precisam de acesso autorizado ao site. Os envios chegam para revisão, sem modificar automaticamente a base.</p><div class="crm-auth-grid"><label class="field"><span>Liderança</span><input id="crm-link-leader" list="crm-leadership-options" maxlength="80"></label><label class="field"><span>Coordenador</span><input id="crm-link-coordinator" maxlength="100"></label><button id="crm-create-link" class="button secondary" type="button">Gerar link e QR Code</button></div><div id="crm-link-output"></div><div id="crm-links"></div></details>
  <details class="crm-tool"><summary>Ler foto de ficha ou colar texto</summary><p class="compact-note">A leitura da foto acontece neste aparelho. Confira títulos e seções antes de salvar. Texto impresso costuma ter melhor leitura que manuscrito.</p><label class="field"><span>Foto da ficha</span><input id="crm-photo" type="file" accept="image/*" capture="environment"></label><button id="crm-read-photo" class="button secondary" type="button">Extrair texto da foto</button><label class="field"><span>Texto da ficha ou mensagem recebida</span><textarea id="crm-text" rows="6" placeholder="NOME: ...&#10;TÍTULO: ...&#10;ZONA: ... SEÇÃO: ...&#10;FONE: ..."></textarea></label><button id="crm-use-text" class="button secondary" type="button">Conferir campos extraídos</button><p id="crm-ocr-status" class="compact-note" role="status"></p></details>
  <details class="crm-tool"><summary>Cadastros recebidos para revisão</summary><button id="crm-load-submissions" class="button secondary" type="button">Consultar recebidos</button><div id="crm-submissions"></div></details>
  <details class="crm-tool"><summary>Histórico e recuperação</summary><p class="compact-note">O histórico central registra o responsável, a data e os valores anteriores. Recuperar uma versão gera uma nova alteração.</p><button id="crm-load-audit" class="button secondary" type="button">Consultar últimas alterações</button><div id="crm-audit-items"></div></details>
  <details id="crm-members-tool" class="crm-tool" hidden><summary>Acessos de lideranças e coordenadores</summary><p id="crm-members-note" class="compact-note">Cadastre o mesmo e-mail usado na conta de acesso ao site. Autorize também a pessoa nas opções de compartilhamento do Sites; cadastrar o perfil aqui não amplia o público do site.</p><form id="crm-member-form" class="crm-form-grid"><label class="field"><span>Nome</span><input name="name" required maxlength="120"></label><label class="field"><span>E-mail</span><input name="email" type="email" required></label><label class="field"><span>Perfil</span><select name="role"><option value="leader">Liderança</option><option value="coordinator">Coordenador</option></select></label><label class="field"><span>Nome da liderança ou coordenação</span><input name="scope" required list="crm-leadership-options" maxlength="100"></label><label id="crm-member-pass-wrap" class="field" hidden><span>Senha inicial ou nova senha</span><input id="crm-member-pass" name="initialPassword" type="password" minlength="12" maxlength="200" autocomplete="new-password"></label><input id="crm-member-action" name="action" type="hidden"><button class="button secondary" type="submit">Salvar acesso</button></form><div id="crm-members"></div></details>
  <details class="crm-tool"><summary>Conexão com WhatsApp</summary><p id="crm-whatsapp-status" class="compact-note">A entrada por WhatsApp precisa de uma conta empresarial e configuração da integração. Você já pode colar mensagens recebidas para conferir os campos.</p><p class="compact-note">A recepção automática exige token, número empresarial, segredo do aplicativo e um encaminhador autorizado para este site privado. Nenhum envio automático é ativado sem essa configuração.</p></details>
  </section>
  <datalist id="crm-leadership-options"></datalist>
  <dialog id="crm-recovery-dialog" class="crm-dialog"><form id="crm-recovery-form"><div class="subpanel-heading"><h3>Recuperar edições protegidas</h3><button class="button secondary crm-close" type="button">Fechar</button></div><p>Abra a base com sua senha atual. Depois informe a senha anterior para recuperar alterações que ficaram neste aparelho. Elas serão revisadas antes de sincronizar.</p><label class="field"><span>Senha anterior</span><input id="crm-recovery-password" type="password" required minlength="12" autocomplete="off"></label><button class="button primary" type="submit">Conferir edições anteriores</button><button id="crm-download-recovery" class="button secondary" type="button">Baixar cópias criptografadas</button><p id="crm-recovery-status" role="status"></p></form></dialog>
  <dialog id="crm-editor" class="crm-dialog"><form id="crm-edit-form"><div class="subpanel-heading"><h3 id="crm-edit-title">Novo cadastro</h3><button class="button secondary crm-close" type="button">Fechar</button></div><input name="id" id="edit-id" type="hidden"><input name="version" id="edit-version" type="hidden"><input name="source" id="edit-source" type="hidden"><input name="literalTitle" id="edit-literalTitle" type="hidden"><div class="crm-editor-layout"><aside id="crm-editor-source"></aside><div>${fields('edit')}</div></div><p id="crm-editor-partnership" class="compact-note"></p><div id="crm-live-validation" class="crm-validation" role="status"></div><button id="crm-save-record" class="button primary" type="submit">Salvar cadastro</button></form></dialog>
  <dialog id="crm-review" class="crm-dialog"><div class="subpanel-heading"><h3>Revisar atualização da base</h3><button class="button secondary crm-close" type="button">Fechar</button></div><p id="crm-review-note"></p><div id="crm-review-items"></div><button id="crm-accept-review" class="button primary" type="button">Aprovar alterações para sincronização</button><button id="crm-discard-review" class="button secondary" type="button">Descartar alterações deste aparelho</button></dialog>
  <dialog id="crm-conflicts-dialog" class="crm-dialog"><div class="subpanel-heading"><h3>Escolher a versão de cada cadastro</h3><button class="button secondary crm-close" type="button">Fechar</button></div><div id="crm-conflict-items"></div></dialog>
  `;
  target.before(panel);const legacy=document.createElement('details');legacy.id='crm-import-tools';legacy.className='crm-tool crm-private';const summary=document.createElement('summary');summary.textContent='Importar planilhas, colar colunas e exportar listas';target.before(legacy);legacy.append(summary);
  for(const node of [target,$('paste-details')])if(node)legacy.append(node);
  $('manual-form')?.closest('details').setAttribute('hidden','');
  document.body.classList.add('crm-locked');
}
function formRecord(prefix='edit'){const r=Object.fromEntries(new FormData($(prefix==='edit'?'crm-edit-form':'crm-intake-form')));if(prefix==='edit'){r.notes=setDocumentaryReview(r.notes,$('edit-documentary-review')?.checked);r.literalTitle=$('edit-literalTitle')?.value==='true';}return cleanRecord(r);}
let currentCrmPage='lists';
function organizeCrmPages(){
  const central=$('crm-central');if(!central||$('crm-page-records'))return;
  const original=[...central.children];
  const create=(id,pages,title)=>{const section=document.createElement('section');section.id='crm-page-'+id;section.className='crm-workspace-page';section.dataset.crmPages=pages;if(title){const heading=document.createElement('h3');heading.textContent=title;section.append(heading);}return section;};
  const records=create('records','lists','Registros da base'),filters=create('filters','lists distribution','Recorte dos cadastros'),distribution=create('distribution','distribution','Distribuição por território'),map=create('map','leadership','Localização das lideranças'),partnership=create('partnership','partnership','Conferência da dupla'),intake=create('intake','intake','Adicionar e revisar cadastros'),settings=create('settings','crm-settings','Administração da base');
  const move=(section,node)=>{if(node)section.append(node);};
  for(const node of original)records.append(node);
  central.append(records);
  move(filters,$('crm-search').closest('.crm-filter-grid'));move(filters,records.querySelector('.crm-filter-actions'));
  move(filters,$('crm-report-municipality').closest('label'));move(filters,$('crm-municipality-summary'));
  move(distribution,$('crm-registration-summary'));move(map,$('crm-leadership-map'));move(partnership,$('crm-partnership-tool'));
  for(const id of ['crm-create-link','crm-photo','crm-load-submissions'])move(intake,$(id)?.closest('details'));
  move(intake,$('crm-import-tools'));
  for(const id of ['crm-backup-tool','crm-members-tool','crm-security','crm-group-admin'])move(settings,$(id));
  for(const id of ['crm-load-audit','crm-whatsapp-status'])move(settings,$(id)?.closest('details'));
  const exportRow=document.createElement('div');exportRow.className='button-row';move(exportRow,$('crm-export'));settings.prepend(exportRow);
  const syncRow=$('crm-sync')?.closest('.crm-toolbar');if(syncRow){const newRow=document.createElement('div');newRow.className='button-row';move(newRow,$('crm-new'));records.prepend(newRow);central.append(syncRow);}
  move(central,$('crm-sync-status'));
  const reportActions=$('crm-pendency-report')?.closest('.crm-toolbar');if(reportActions){reportActions.hidden=true;move(records,reportActions);}
  if($('crm-pendency-note'))$('crm-pendency-note').hidden=true;
  const reportLink=document.createElement('button');reportLink.type='button';reportLink.className='button secondary';reportLink.dataset.view='reports';reportLink.textContent='Abrir central de relatórios';records.append(reportLink);
  const duplicates=create('duplicates','duplicates','Duplicidades');
  const archived=create('archived','archived-records','');
  const review=create('quality','quality-review',''),operations=create('operations','operations','');
  for(const section of [filters,records,duplicates,archived,review,operations,distribution,map,partnership,intake,settings])central.append(section);
  document.body.classList.add('crm-organized');
  const query=$('guided-query-form');query.dataset.viewContent='home results overview territory regional xray comparison map paired archive';query.classList.toggle('is-view-hidden',!query.dataset.viewContent.split(' ').includes(api.state?.view||'home'));
  setPage(api.state?.view||currentCrmPage);
}
function setPage(view){
  if(view!=='leadership'&&document.body.classList.contains('leadership-map-expanded'))leadershipMap?.collapse();
  if(!['lists','archived-records','quality-review','operations','duplicates','distribution','leadership','partnership','intake','crm-settings'].includes(view))return;
  currentCrmPage=view;
  for(const section of document.querySelectorAll('[data-crm-pages]'))section.hidden=!section.dataset.crmPages.split(' ').includes(view);
  if(unlocked&&view==='partnership')partnershipView?.open();
  if(unlocked&&view==='leadership')leadershipMap?.open();
  if(unlocked&&view==='duplicates')duplicateView?.open();
  if(unlocked&&view==='archived-records')archivedView?.open();
  if(unlocked&&view==='quality-review')qualityView?.open();
  if(unlocked&&view==='operations')operationsView?.open();
}
function getReportContext(){return unlocked?{leadership:$('crm-leader-filter').value||'Todas as lideranças autorizadas',municipality:$('crm-report-municipality').selectedOptions[0]?.textContent||'Município selecionado'}:null;}
function openRegistrationReport(municipal=false){
  if(!unlocked){api.showView('lists');status('Desbloqueie a base para emitir os relatórios por liderança.');$('crm-password')?.focus();return false;}
  openPendencyReport(municipal);return true;
}
function options(select,values,all){const previous=select.value;select.replaceChildren(new Option(all,''));for(const v of values)select.add(new Option(v,v));select.value=values.includes(previous)?previous:'';}
let page=0;
function filteredRegistrationRows(){
  if(!unlocked)return [];
  const term=normalize($('crm-search').value),leader=$('crm-leader-filter').value,filter=$('crm-status-filter').value;
  const matchesStatus=r=>!filter||filter==='archived'||filter==='ready'||filter==='green'?(!['ready','green'].includes(filter)||r.ready):filter==='unknown'?!countableForResults(r):filter==='secondary'?r.ready&&r.secondaryPending:filter==='complete'?r.ready&&!r.secondaryPending:r.status===filter;
  return working().filter(r=>(filter==='archived'?r.deleted:!r.deleted)&&(!leader||r.leadership===leader)&&(!term||recordSearch(r).includes(term))&&matchesStatus(r)&&matchesElectoralFilter(r,{place:$('crm-place-filter').value,zone:$('crm-zone-filter').value,section:$('crm-section-filter').value,neighborhood:$('crm-neighborhood-filter').value,coordinator:$('crm-coordinator-filter').value})).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'));
}
function registrationMunicipality(kind){
  const city=$('crm-report-municipality'),actual=String(api.state?.cityCode||'');
  const choices=new Map([['4154','ANANINDEUA'],...(api.state?.index?.municipalities||[]).map(c=>[String(c[0]),c[1]]),...working().filter(r=>r.location?.cityCode).map(r=>[String(r.location.cityCode),r.location.city])]);
  const code=registrationMunicipalityOverride!==null?registrationMunicipalityOverride:kind==='analysis'&&city.value&&choices.has(actual)?actual:city.value;
  return {municipality:{code,name:choices.get(code)||city.selectedOptions[0]?.textContent||'Município selecionado'},municipalityChoices:[...choices]};
}
function setRegistrationMunicipality(code){
  const select=$('crm-report-municipality');if([...select.options].some(o=>o.value===code)){registrationMunicipalityOverride=code;select.value=code;for(const id of ['crm-zone-filter','crm-section-filter','crm-place-filter','crm-neighborhood-filter'])$(id).value='';if(api.state)api.state.analysisZone='';const zone=$('analysis-zone-select');if(zone)zone.value='';render();registrationViews.analysis?.render();partnershipView?.setReferenceCity();notifyPrivateState();}
}
function registrationSnapshot(kind){
  if(!unlocked)return null;
  const note='Base central: revisão '+cloud.revision+'. '+pending.size+' alteração(ões) local(is) ainda não sincronizada(s).';
  if(kind==='analysis')return {...(api.getRegistrationSummary?.()||{records:working().filter(r=>!r.deleted),label:'Todas as lideranças autorizadas'}),note,zoneFilter:api.state?.analysisZone||'',...registrationMunicipality(kind)};
  const filters=['crm-search','crm-leader-filter','crm-status-filter','crm-place-filter','crm-zone-filter','crm-section-filter','crm-neighborhood-filter','crm-coordinator-filter'].filter(id=>$(id).value).map(id=>$(id).tagName==='SELECT'?$(id).selectedOptions[0]?.textContent:$('crm-search').value);
  return {...registrationMunicipality(kind),records:filteredRegistrationRows(),zoneFilter:$('crm-zone-filter').value,archived:$('crm-status-filter').value==='archived',label:$('crm-leader-filter').value||'Todas as lideranças autorizadas',filterLabel:filters.join(' • ')||'Sem filtros adicionais',note};
}
function render({listOnly=false}={}){
  if(!unlocked)return;const records=working();
  if(!listOnly){
  homeSummary={...quality(records),changes:pending.size,lastOnline};
  $('crm-group-admin').hidden=user.role!=='owner';$('crm-backup-tool').hidden=user.role!=='owner';$('crm-backup-download').disabled=!canEdit();$('crm-backup-check').disabled=!canEdit();const previousCopy=$('crm-backup-before-recovery');previousCopy.hidden=!unlocked||user.role!=='owner'||!/^recovery-[-a-zA-Z0-9]{12,100}$/.test(lastRecoveryBackupId);if(!previousCopy.hidden)previousCopy.href='/api/crm/recovery-backup?id='+encodeURIComponent(lastRecoveryBackupId);else previousCopy.removeAttribute('href');
  const leaders=[...new Set(records.map(r=>r.leadership))].sort(),places=[...new Set(records.filter(r=>!r.deleted&&r.location).map(r=>r.location.place+' • '+r.location.city))].sort();
  options($('crm-leader-filter'),leaders,'Todas as lideranças');options($('crm-place-filter'),places,'Todos os locais');$('crm-leadership-options').innerHTML=leaders.map(l=>`<option value="${esc(l)}"></option>`).join('');
  const choices=electoralChoices(records,$('crm-zone-filter').value);
  for(const [id,values,label]of [['crm-zone-filter',choices.zones,'Todas as zonas'],['crm-section-filter',choices.sections,'Todas as seções'],['crm-neighborhood-filter',choices.neighborhoods,'Todos os bairros'],['crm-coordinator-filter',choices.coordinators,'Todas as coordenações']])options($(id),values,label);
  const citySelect=$('crm-report-municipality'),previousCity=citySelect.value,cityNames=new Map([['4154','ANANINDEUA'],...(api.state?.index?.municipalities||[]).map(c=>[String(c[0]),c[1]]),...records.filter(r=>r.location?.cityCode).map(r=>[String(r.location.cityCode),r.location.city])]);
  citySelect.replaceChildren(new Option('Todos os municípios identificados',''),...[...cityNames].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')).map(([code,name])=>new Option(name,code)));citySelect.value=previousCity;
  const leader=$('crm-leader-filter').value;
  const q=quality(records.filter(r=>!leader||r.leadership===leader));
  const municipal=municipalitySummary(records.filter(r=>!leader||r.leadership===leader),{municipality:citySelect.value,municipalityName:citySelect.selectedOptions[0]?.textContent});
  $('crm-municipality-summary').textContent=municipal.name+': '+municipal.selected.total+' cadastros; '+municipal.selected.approved+' aprovados na conferência cadastral; '+municipal.selected.unapproved+' não aprovados. '+(municipal.code?municipal.outside+' em outros municípios confirmados; ':'')+municipal.unknown+' com município não identificado. A listagem geral preserva todos os cadastros da liderança.';
  $('crm-quality').innerHTML=[['Cadastros ativos',q.total,''],['100% completos',q.complete,'is-ok'],['Aprovados com secundárias',q.complementary,'has-secondary'],['Não aprovados',q.pending,'is-priority']].map(([label,value,style])=>`<div class="metric-card ${style}"><span>${label}</span><strong>${value}</strong></div>`).join('');
  $('crm-quality-summary').textContent=(leader||'Todas as lideranças autorizadas')+': '+q.ready+' de '+q.total+' aprovados na conferência cadastral ('+(q.rate==null?'—':q.rate.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%')+'). 100% completos + aprovados com pendências secundárias = aprovados. Não aprovados permanecem listados e ficam fora dessa contagem. O resumo considera a liderança escolhida, independentemente da busca, situação e local.';
  }
  const accountingLeader=$('crm-leader-filter').value,accountingCoordinator=$('crm-coordinator-filter').value;
  const excluded=records.filter(r=>!r.deleted&&(!accountingLeader||r.leadership===accountingLeader)&&matchesElectoralFilter(r,{coordinator:accountingCoordinator})&&!countableForResults(r));
  $('crm-accounting-alert').hidden=false;$('crm-accounting-alert').dataset.empty=String(!excluded.length);$('crm-uncounted-count').textContent=String(excluded.length);$('crm-show-unknown').disabled=!excluded.length;
  $('crm-uncounted-scope').textContent=[accountingLeader||'Todas as lideranças autorizadas',accountingCoordinator||'Todas as coordenações'].join(' · ')+'. Cadastros ativos, antes da deduplicação. Pendências secundárias não impedem a contagem quando o local está confirmado.';
  const rows=filteredRegistrationRows();
  const activeFilters=['crm-search','crm-leader-filter','crm-status-filter','crm-place-filter','crm-zone-filter','crm-section-filter','crm-neighborhood-filter','crm-coordinator-filter'].filter(id=>$(id).value);
  $('crm-filter-summary').textContent=activeFilters.length+' filtro(s) ativo(s) · '+rows.length+' cadastro(s) encontrados. O resumo da liderança e os relatórios municipais mantêm seu recorte próprio.';
  $('crm-clear-filters').disabled=!activeFilters.length;
  registrationViews.lists?.render();
  const pages=Math.max(1,Math.ceil(rows.length/50));page=Math.min(page,pages-1);
  $('crm-table-body').innerHTML=rows.slice(page*50,page*50+50).map(r=>`<tr class="crm-row-${r.status}" data-accounting="${!r.deleted&&!countableForResults(r)?'excluded':''}"><td><strong>${esc(r.name||'Nome não informado')}</strong><small>${esc(r.id)}</small></td><td>${esc(r.leadership)}</td><td>${esc(r.title)}</td><td>${esc(r.zone)} / ${esc(r.section)}</td><td>${!r.deleted&&!countableForResults(r)?'<span class="crm-accounting-badge">Não contabilizado</span>':''}${esc(r.location?.place||'Local não confirmado')}<small>${esc(r.location?`${r.location.neighborhood} • ${r.location.city}`:'Conferir zona e seção')}</small></td><td>${validationMarkup(r)}</td><td><div class="crm-row-actions"><button class="button secondary" data-edit="${esc(r.id)}">Editar</button><button class="button secondary" data-history="${esc(r.id)}">Histórico</button><button class="button secondary" data-archive="${esc(r.id)}">${r.deleted?'Reativar':'Arquivar'}</button></div></td></tr>`).join('');
  $('crm-list-note').textContent=`${rows.length} cadastro(s) no filtro. Pendências permanecem na listagem. Situação oficial dos títulos não consultada no TSE.`;
  $('crm-page-note').textContent=`Página ${page+1} de ${pages}`;$('crm-previous-page').disabled=page===0;$('crm-next-page').disabled=page>=pages-1;
  $('crm-review-button').hidden=storageUnavailable||!pendingCount()||approved;$('crm-conflict-button').hidden=storageUnavailable||!conflicts.length;$('crm-sync').disabled=storageUnavailable||busy||!pendingCount()||!approved||!!conflicts.length||!navigator.onLine;
  $('crm-sync-status').textContent=`${pendingCount()} alteração(ões) neste aparelho${approved?' aprovadas':' para revisão'}${inflight||recoveryPlan?.inflight?' • envio aguardando confirmação':''}. ${lastOnline?'Última conferência central: '+new Date(lastOnline).toLocaleString('pt-BR')+'.':''} ${navigator.onLine?'Online.':'Offline: alterações serão enviadas após voltar à internet e validar o acesso.'}`;
  $('crm-new').disabled=!canEdit();$('crm-refresh').disabled=busy||!!inflight;$('crm-members-tool').hidden=user.role!=='owner';$('crm-account-label').textContent=`${user.name} • ${user.role==='owner'?'Responsável':user.role==='leader'?'Liderança':'Coordenador'}`;
  if(storageUnavailable){$('crm-sync-status').textContent=storageNotice;for(const b of document.querySelectorAll('[data-edit],[data-archive]'))b.disabled=true;}
  if(!listOnly){partnershipView?.refresh();leadershipMap?.refresh();duplicateView?.refresh();archivedView?.refresh();if(currentCrmPage==='quality-review')qualityView?.refresh();if(currentCrmPage==='operations')operationsView?.refresh();notifyPrivateState();}
}
async function saveLocationDraft(input){
  if(!canEdit())throw new Error('Desbloqueie a base e conclua o envio pendente antes de editar o local.');
  const r=cleanLeadershipLocation(input);if(!inScope(r))throw new Error('Local fora do seu acesso.');locationDrafts.set(r.id,r);await save();leadershipMap?.refresh();
}
async function saveLeadershipReference(input){
  if(!canEdit()||!navigator.onLine)throw new Error('Entre online para salvar o local na base central.');
  const identity=user.id;const result=await request('leadership-locations','POST',{...input,operationId:crypto.randomUUID()});
  if(!unlocked||user?.id!==identity)throw new Error('A base foi bloqueada durante o salvamento.');
  cloud=result.snapshot;locationDrafts.delete(input.id||locationGroupId(input));lastOnline=new Date().toISOString();detectConflicts();await save();mirror();render();return cloud.leadershipLocations.find(r=>r.id===input.id);
}
async function saveGroupPartnership(input){
  if(!canEdit()||!navigator.onLine)throw new Error('Conclua o envio pendente e conecte à internet para salvar a parceria.');
  const captureKey=key,actor=user.id;
  const result=await request('partnerships','POST',input);
  if(!unlocked||key!==captureKey||user?.id!==actor)return;
  cloud=result.snapshot;lastOnline=new Date().toISOString();detectConflicts();await save();mirror();render();
}
function openEditor(input={},submission=null,withSource=false){
  if(!withSource)documentReview?.clearEditor();
  if(!canEdit())return status('Conclua a sincronização pendente antes de editar.',true);
  submissionToApprove=submission;const base=cleanRecord({id:crypto.randomUUID(),version:0,coordinator:user.role==='coordinator'?user.scope:user.role==='leader'?(working().find(r=>normalize(r.leadership)===normalize(user.scope))?.coordinator||''):'',leadership:user.role==='leader'?user.scope:'',...input});
  for(const field of ['id','version','source','literalTitle',...identityFields])if($('edit-'+field))$('edit-'+field).value=base[field]??'';
  $('edit-documentary-review').checked=documentaryReviewPending(base);
  $('edit-leadership').readOnly=user.role==='leader';$('edit-coordinator').readOnly=user.role!=='owner';$('crm-edit-title').textContent=input.id?'Editar cadastro':'Novo cadastro';validateForm();$('crm-editor').showModal();
}
function validateForm(){
  const r=assess(formRecord(),locations,rawWorking());$('crm-live-validation').className='crm-validation crm-row-'+r.status;
  $('crm-editor-partnership').textContent=partnershipView?.editorLabel(r)||'';
  $('crm-live-validation').innerHTML=validationMarkup(r)+`<p class="compact-note">${esc(r.location?`${r.location.place} • ${r.location.neighborhood} • ${r.location.city}`:'Local de votação não confirmado.')}</p>`;
  $('crm-save-record').textContent=r.ready?'Salvar cadastro':'Salvar com pendências';
}
async function stage(r,reason='Cadastro editado neste aparelho.'){
  if(!canEdit())throw new Error('Conclua o envio pendente antes de editar.');pending.set(r.id,cleanRecord(r));approved=false;reviewReason=reason;await save();mirror();render();
}
async function saveForm(event){
  event.preventDefault();try{
    const record=formRecord();if(!record.name)throw new Error('Informe o nome.');const checked=assess(record,locations,rawWorking());
    if(!checked.ready&&!confirm('O cadastro tem pendências principais. Salvá-lo sinalizado para conferência?'))return;
    if(submissionToApprove)submissionApprovals[submissionToApprove]=record.id;await stage(record);submissionToApprove=null;$('crm-editor').close();status('Cadastro salvo na cópia protegida. Revise e sincronize para atualizar a base central.');showReview();
  }catch(e){status(e.message,true);}
}
function changesTable(local,remote){const fields=[...identityFields,'deleted'].filter(k=>String(local?.[k]??'')!==String(remote?.[k]??''));return `<div class="table-scroll"><table class="data-table"><thead><tr><th>Campo</th><th>Central</th><th>Neste aparelho</th></tr></thead><tbody>${fields.map(k=>`<tr><td>${esc(fieldLabels[k])}</td><td>${esc(remote?.[k]??'')}</td><td>${esc(local?.[k]??'')}</td></tr>`).join('')}</tbody></table></div>`;}
function showReview(){
  $('crm-review-note').textContent=`${pendingCount()} alterações. ${reviewReason} As novas informações substituirão somente os campos mostrados. Documentos inconsistentes serão mantidos sinalizados.`;
  $('crm-review-items').innerHTML=[...pending.values()].map(r=>{const old=cloud.records.find(o=>o.id===r.id);return `<details class="crm-tool"><summary>${esc(r.name)} • ${old?'Atualização':'Novo'}${r.deleted?' • Arquivar':''}</summary>${changesTable(r,old)}</details>`;}).join('')+(recoveryPlan?.entries||[]).slice(0,100).map(recoveryReviewMarkup).join('')+((recoveryPlan?.entries.length||0)>100?'<p>Prévia dos primeiros 100 itens complementares. Todos os '+recoveryPlan.entries.length+' itens selecionados serão processados em etapas, preservando históricos já existentes.</p>':'');$('crm-review').showModal();
}
function recoveryReviewMarkup(entry){
  const label={partnership:'parceria',review:'observação de duplicidade',creation:'data de inclusão',quality:'conferência cadastral',audit:'registro histórico'}[entry.kind];let name,body;
  if(entry.kind==='partnership'){
    name=entry.desired.leadership;const old=cloud.partnerships?.find(r=>r.id===entry.id);
    body=['estadual','federal'].map(office=>`<p>${office==='estadual'?'Estadual':'Federal'} • Central: ${esc(old?.[office]?.name||'Sem parceria')} ${esc(old?.[office]?.number||'')}<br>Cópia: ${esc(entry.desired[office].name)} ${esc(entry.desired[office].number)}</p>`).join('');
  }else if(entry.kind==='review'){
    name=entry.desired.recordIds.map(id=>cloud.records.find(r=>r.id===id)?.name||id).join(' / ');const old=cloud.duplicateReviews?.find(r=>r.id===entry.id);
    body=`<p>Central: ${esc(old?.observation||'Sem observação')}</p><p>Cópia: ${esc(entry.desired.observation)}</p><p>A identidade continuará para conferência. Esta ação não arquiva cadastros.</p>`;
  }else if(entry.kind==='quality'){name=cloud.records.find(r=>r.id===entry.id)?.name||entry.id;body=`<p>Responsável registrado: ${esc(entry.desired.assigneeName||'Sem responsável')}</p><p>Fonte: ${esc(entry.desired.evidence)}</p><p>${esc(entry.desired.note)}</p><p>Uma validação recuperada ficará em conferência até nova revisão dos dados.</p>`;}
  else if(entry.kind==='audit'){name=cloud.records.find(r=>r.id===entry.desired.record_id)?.name||'Histórico da base';body=`<p>Origem: ${esc(entry.desired.created_at)} • ${esc(entry.desired.user_name)} • ${esc(entry.desired.operation)}</p><p>Somente históricos ausentes serão acrescentados, identificados como recuperados e sem substituir o histórico atual.</p>`;}
  else{name=cloud.records.find(r=>r.id===entry.id)?.name||entry.id;body=`<p>Data documentada na cópia: ${esc(new Date(entry.desired).toLocaleString('pt-BR'))}. A recuperação só preenche uma data ausente.</p>`;}
  return `<details class="crm-tool"><summary>Recuperar ${esc(label)} • ${esc(name)}</summary>${body}</details>`;
}
function showConflicts(){
  $('crm-conflict-items').innerHTML=conflicts.map(c=>`<div class="crm-tool"><h4>${esc(c.local.name)}</h4>${changesTable(c.local,c.remote)}<div class="button-row"><button class="button secondary" data-resolve-remote="${esc(c.local.id)}">Usar versão central</button><button class="button primary" data-resolve-local="${esc(c.local.id)}">Reaplicar minha edição</button></div></div>`).join('');$('crm-conflicts-dialog').showModal();
}
async function protectBeforeRecovery(){
  if(!recoveryPlan||recoveryPlan.backupId)return;
  recoveryPlan.backupOperationId||=crypto.randomUUID();await save();
  const backup=await createBackup({email:user.email,records:cloud.records,leadershipLocations:cloud.leadershipLocations||[],...backupOptions(),key,salt,revision:cloud.revision});
  const result=await request('recovery-backup','POST',{operationId:recoveryPlan.backupOperationId,revision:cloud.revision,backup});
  recoveryPlan.backupId=result.backupId;lastRecoveryBackupId=result.backupId;await save();
}
async function syncRecoveryMetadata(){
  if(!recoveryPlan?.entries.length)return;
  recoveryPlan.inflight||={operationId:crypto.randomUUID(),revision:cloud.revision,backupId:recoveryPlan.backupId,entries:recoveryPlan.entries.slice(0,50)};
  await save();const sent=recoveryPlan.inflight,result=await request('recovery-metadata','POST',sent);
  recoveryPlan.entries.splice(0,sent.entries.length);recoveryPlan.inflight=null;cloud=result.snapshot;
}
async function sync(){
  if(!unlocked||storageUnavailable||busy||!approved||conflicts.length||!navigator.onLine)return;const epoch=accessEpoch;busy=true;render();
  try{
    await protectBeforeRecovery();if(epoch!==accessEpoch)return;
    if(!pending.size&&!inflight){await syncRecoveryMetadata();if(recoveryPlan&&!recoveryPlan.entries.length)recoveryPlan=null;approved=!!pendingCount();await save();mirror();render();status('Recuperação sincronizada. Observações recuperadas continuam sujeitas à conferência de identidade.');if(approved)queueMicrotask(sync);return;}
    if(!inflight)inflight={operationId:crypto.randomUUID(),revision:cloud.revision,changes:[...pending.values()].slice(0,150),...(recoveryPlan?{recoveryCreatedAt:recoveryPlan.recordCreatedAt}: {})};
    await save();let result;
    try{result=await request('sync','POST',inflight);}catch(e){
      if(e.status!==409)throw e;
      const fresh=await request('records');conflicts=[];
      for(const local of inflight.changes){const remote=fresh.records.find(r=>r.id===local.id);if((remote?.version||0)!==local.version)conflicts.push({local,remote});}
      cloud=fresh;inflight=null;await save();mirror();
      if(conflicts.length){status('Há alterações do mesmo cadastro em dois aparelhos. Escolha a versão antes de continuar.',true);showConflicts();return;}
      status('A base central mudou em outros cadastros. Revise o recorte atualizado e sincronize novamente.');return;
    }
    for(const r of inflight.changes)if(sameRecord(pending.get(r.id),r))pending.delete(r.id);
    cloud=result.snapshot;inflight=null;lastOnline=new Date().toISOString();approved=!!pendingCount();if(recoveryPlan&&!pendingCount())recoveryPlan=null;await save();mirror();render();status('Alterações sincronizadas. Histórico central atualizado.');
    await approveSavedSubmissions();
  }catch(e){if(epoch!==accessEpoch)return;if(e.status===409&&recoveryPlan){approved=false;recoveryPlan.inflight=null;}status(e.message+' As alterações deste aparelho foram preservadas.',true);if(unlocked&&(e.status===401||e.status===403))await lock('Acesso precisa de nova validação. Entre novamente com sua senha.',false);}finally{if(epoch===accessEpoch){busy=false;render();}}
  if(unlocked&&pendingCount()&&approved&&!conflicts.length&&navigator.onLine&&!inflight)sync();
}
async function refresh(){
  if(!unlocked||!navigator.onLine)return status('Conecte à internet para consultar a base central.');
  const epoch=accessEpoch;
  try{const fresh=await request('records','GET',undefined,{knownRevision:cloud.revision});if(fresh.notModified){lastOnline=new Date().toISOString();await save();if(epoch===accessEpoch)status('Base central já está atualizada. Nenhum cadastro precisou ser transferido novamente.');return;}
    conflicts=[...pending.values()].filter(r=>(fresh.records.find(o=>o.id===r.id)?.version||0)!==r.version).map(local=>({local,remote:fresh.records.find(r=>r.id===local.id)}));cloud=fresh;lastOnline=new Date().toISOString();await save();if(epoch!==accessEpoch)return;mirror();render();status('Base central consultada. Edições locais preservadas.');if(conflicts.length)showConflicts();}catch(e){if(epoch===accessEpoch)status(e.message,true);}
}
const inScope=r=>user.role==='owner'||user.role==='leader'&&normalize(r.leadership)===normalize(user.scope)||user.role==='coordinator'&&normalize(r.coordinator)===normalize(user.scope);
function detectConflicts(){conflicts=[...pending.values()].filter(r=>(cloud.records.find(o=>o.id===r.id)?.version||0)!==r.version).map(local=>({local,remote:cloud.records.find(r=>r.id===local.id)}));}
async function approveSavedSubmissions(){
  let changed=false;for(const [id,recordId]of Object.entries(submissionApprovals))if(cloud.records.some(r=>r.id===recordId&&!r.deleted)&&!pending.has(recordId)){
    await request('submissions','POST',{id,recordId,status:'approved'});delete submissionApprovals[id];changed=true;
  }
  if(changed){await save();await loadSubmissions();}
}
async function preserveCopy(email,vault){
  recoveryCopies=await vaultStore('get',email+'::recovery')||[];
  if(!recoveryCopies.some(v=>v.cipher===vault.cipher)){recoveryCopies.push({...vault,preservedAt:new Date().toISOString()});await vaultStore('put',email+'::recovery',recoveryCopies);}
}
async function recoverCopy(event){
  event.preventDefault();if(!canEdit())return $('crm-recovery-status').textContent='Abra primeiro a base com a senha atual e conclua o envio pendente.';
  try{
    const pass=$('crm-recovery-password').value;let found=false,count=0,mapCount=0,noteCount=0,qualityCount=0;const recoveredCopies=[];
    for(const copy of recoveryCopies){let recovered;try{recovered=await unseal(copy,await deriveVaultKey(pass,copy.salt));}catch{continue;}found=true;
      let complete=true;
      for(const [id,r]of recovered.pending||[])if(inScope(r)){if(!pending.has(id)){pending.set(id,r);count++;}else if(!sameRecord(pending.get(id),r))complete=false;}
      for(const [id,r]of recovered.locationDrafts||[])if(inScope(r)){if(!locationDrafts.has(id)){locationDrafts.set(id,r);mapCount++;}else if(JSON.stringify(locationDrafts.get(id))!==JSON.stringify(r))complete=false;}
      for(const [id,draft]of restoreDuplicateDrafts(recovered.duplicateDrafts)){if(!duplicateDrafts.has(id)){duplicateDrafts.set(id,draft);noteCount++;}else if(duplicateDrafts.get(id).observation!==draft.observation)complete=false;}
      for(const [id,draft]of restoreQualityDrafts(recovered.qualityDrafts)){if(!qualityDrafts.has(id)){qualityDrafts.set(id,draft);qualityCount++;}else if(!sameQualityReview(qualityDrafts.get(id),draft))complete=false;}
      for(const [id,recordId]of Object.entries(recovered.submissionApprovals||{}))if(pending.has(recordId))submissionApprovals[id]=recordId;
      if(complete)recoveredCopies.push(copy);
    }
    if(!found)throw new Error('A senha não abre nenhuma cópia preservada.');approved=false;reviewReason='Edições recuperadas de uma cópia protegida anterior.';detectConflicts();await save();for(const copy of recoveredCopies)clearEmergencyCopy(user.email,copy.cipher);mirror();render();$('crm-recovery-password').value='';$('crm-recovery-status').textContent=count+' edição(ões), '+mapCount+' local(is) e '+noteCount+' observação(ões) recuperados para revisão. '+qualityCount+' conferência(s) recuperadas. Rascunhos atuais diferentes foram preservados.';if(count){$('crm-recovery-dialog').close();conflicts.length?showConflicts():showReview();}
  }catch(e){$('crm-recovery-status').textContent=e.message;}
}
async function unlock(event){
  event.preventDefault();const button=$('crm-unlock');if(button.disabled)return;
  const epoch=++accessEpoch,online=navigator.onLine;let protectedCopyFailed=false,authenticated=false;
  try{
    const email=$('crm-email').value.toLowerCase().trim(),pass=$('crm-password').value;
    if(!email||!$('crm-email').checkValidity()){$('crm-email').focus();throw new Error('Informe o e-mail da conta autorizada.');}
    if(pass.length<12||pass.length>200){$('crm-password').focus();throw new Error('A senha da base precisa ter entre 12 e 200 caracteres.');}
    if(!$('crm-confirm-wrap').hidden&&pass!==$('crm-confirm').value){$('crm-confirm').focus();throw new Error('As duas senhas precisam ser iguais.');}
    button.disabled=true;button.setAttribute('aria-busy','true');button.textContent='Entrando…';storageUnavailable=false;
    if(online){
      status('Validando a senha no servidor…');
      const result=await request('session','POST',{email,password:pass,code:$('crm-mfa-code').value.trim()});if(epoch!==accessEpoch)return;
      user=result.user;cloud=result.snapshot;lastOnline=new Date().toISOString();authenticated=true;
    }
    try{
      status(online?'Senha validada. Abrindo a cópia protegida deste aparelho…':'Abrindo a cópia protegida offline…');
      const vault=await vaultStore('get',email);if(epoch!==accessEpoch)return;
      salt=vault?.salt||newSalt();key=await deriveVaultKey(pass,salt);let saved;
      if(vault){try{saved=await unseal(vault,key);}catch{protectedCopyFailed=true;}}
      if(online){
        if(protectedCopyFailed){await preserveCopy(email,vault);salt=newSalt();key=await deriveVaultKey(pass,salt);}
        if(saved?.pending?.some(([,r])=>!inScope(r))||saved?.qualityDrafts?.some(([id])=>!cloud.records.some(r=>r.id===id)))await preserveCopy(email,vault);
        pending=new Map((saved?.pending||[]).filter(([,r])=>inScope(r)));locationDrafts=new Map((saved?.locationDrafts||[]).filter(([,r])=>inScope(r)));inflight=saved?.inflight&&saved.inflight.changes.every(inScope)?saved.inflight:null;approved=!!saved?.approved;reviewReason=saved?.reviewReason||'';
        submissionApprovals=Object.fromEntries(Object.entries(saved?.submissionApprovals||{}).filter(([,id])=>pending.has(id)));detectConflicts();
      }else{
        if(protectedCopyFailed)throw new Error('Senha não confere com a cópia protegida deste aparelho.');
        if(!saved)throw new Error('Entre online uma vez para preparar a cópia protegida.');
        const checked=Date.parse(saved.lastOnline);if(!Number.isFinite(checked)||Date.now()-checked>7*86400000)throw new Error('Conecte à internet para renovar o acesso offline, válido por até 7 dias.');
        user=saved.user;cloud=saved.cloud;pending=new Map(saved.pending);locationDrafts=new Map(saved.locationDrafts||[]);inflight=saved.inflight;conflicts=saved.conflicts||[];approved=saved.approved;lastOnline=saved.lastOnline;reviewReason=saved.reviewReason;submissionApprovals=saved.submissionApprovals||{};
      }
      duplicateDrafts=restoreDuplicateDrafts(saved?.duplicateDrafts);qualityDrafts=restoreQualityDrafts(saved?.qualityDrafts);recoveryPlan=user?.role==='owner'?saved?.recoveryPlan||null:null;lastRecoveryBackupId=user?.role==='owner'?saved?.lastRecoveryBackupId||'':'';
      recoveryCopies=await vaultStore('get',email+'::recovery')||[];
      for(const copy of emergencyCopies(email))if(!recoveryCopies.some(v=>v.cipher===copy.cipher))recoveryCopies.push(copy);
    }catch(e){if(!online)throw e;consultationOnly();}
    if(epoch!==accessEpoch){key=null;return;}
    if(!Object.keys(locations).length){const r=await fetch('/locations-2026.json');if(!r.ok)throw new Error('Não foi possível carregar os locais de votação. Confira a conexão ou a preparação offline.');locations=(await r.json()).locations;}
    if(epoch!==accessEpoch){key=null;return;}
    unlocked=true;
    try{await save();}catch(e){if(!online)throw e;consultationOnly();}
    if(epoch!==accessEpoch){key=null;return;}
    document.body.classList.remove('crm-locked');$('crm-auth').hidden=true;$('crm-central').hidden=false;$('crm-lock').hidden=false;$('crm-password').value='';$('crm-mfa-code').value='';$('crm-confirm').value='';maskPasswords();$('crm-confirm-wrap').hidden=true;$('crm-confirm').required=false;$('crm-password').autocomplete='current-password';$('crm-recover-copy').hidden=storageUnavailable||!recoveryCopies.length;
    mirror();render();armLock();status(storageUnavailable?storageNotice:protectedCopyFailed?'Senha atual confirmada. A cópia anterior foi preservada; use Recuperar edições para conferir alterações antigas.':online?'Base central desbloqueada.':'Cópia offline desbloqueada.');
    if(duplicateDrafts.size)status(duplicateDrafts.size+' observação(ões) de duplicidade recuperada(s) da cópia protegida. Abra Duplicidades para conferir e retomar o envio.');
    setPage(currentCrmPage);
    if(leadershipMapRequested){leadershipMapRequested=false;await leadershipMap.open();}
    if(user.role==='owner'&&!storageUnavailable){
      let lists;try{const old=localStorage.getItem(api.storageKey);lists=old&&JSON.parse(old);}catch{}
      if(lists?.length&&confirm('Há listas antigas neste aparelho. Preparar sua migração para a base central, com revisão de duplicidades?')){await captureLists([...api.state.lists,...lists]);await save();localStorage.removeItem(api.storageKey);}
    }
    if(!storageUnavailable){if(conflicts.length)showConflicts();if(inflight&&online)sync();if(online)approveSavedSubmissions().catch(e=>status(e.message,true));}if(user.role==='owner'&&online)loadMembers();
  }catch(e){
    if(epoch!==accessEpoch)return;
    key=null;unlocked=false;cloud={revision:0,records:[]};pending=new Map();locationDrafts=new Map();duplicateDrafts=new Map();qualityDrafts=new Map();recoveryPlan=null;lastRecoveryBackupId='';conflicts=[];inflight=null;submissionApprovals={};user=null;clearPrivateView();mirror();status(authenticated?'Senha validada, mas a abertura da base falhou: '+e.message:e.message,true);if(e.details?.mfaRequired){$('crm-mfa-wrap').hidden=false;$('crm-mfa-code').focus();}
  }finally{button.disabled=false;button.removeAttribute('aria-busy');button.textContent=$('crm-confirm-wrap').hidden?'Entrar':'Definir senha e abrir base';}
}
async function captureLists(lists){
  if(!canEdit())return status('Desbloqueie a base e conclua o envio pendente antes de importar.',true);
  const previous=working(),merged=new Map(),used=new Set();
  for(const list of lists)for(const record of list.records||[]){
    let leadership=String(list.name||'SEM LIDERANÇA').toUpperCase();const base=leadership.replace(/ \(\d+\)$/,'');if(previous.some(r=>normalize(r.leadership)===normalize(base)))leadership=base;
    const candidates=previous.filter(r=>!r.deleted&&validTitle(record.title)&&r.title===record.title&&normalize(r.name)===normalize(record.name));
    const exact=previous.find(r=>r.id===record.id)||candidates.length===1&&candidates[0];
    const r=cleanRecord({...exact,...record,id:exact?.id||record.id||crypto.randomUUID(),version:exact?.version||0,leadership,coordinator:list.coordinator||exact?.coordinator||''});
    if(!inScope(r))throw new Error('A importação inclui uma liderança fora do seu acesso.');
    for(const f of ['mother','cpf','rg','birth','notes','source'])if(!record[f]&&exact?.[f])r[f]=exact[f];
    if(merged.has(r.id)&&!sameRecord(merged.get(r.id),r))throw new Error('Duas versões do mesmo cadastro na importação. Confira antes de consolidar.');
    merged.set(r.id,r);used.add(r.id);
  }
  const proposals=new Map(pending);for(const r of merged.values()){const old=cloud.records.find(o=>o.id===r.id);if(!old||!sameRecord(r,old))proposals.set(r.id,r);}
  for(const old of previous)if(!old.deleted&&!used.has(old.id))proposals.set(old.id,{...old,deleted:true});
  pending=proposals;approved=false;reviewReason='Dados importados comparados por ID, ou por título conferente e mesmo nome completo. Novos cadastros e alterações apresentados abaixo.';
  await save();mirror();render();showReview();return true;
}
async function loadAudit(id=''){
  try{const value=await request('audit'+(id?'?id='+encodeURIComponent(id):''));$('crm-audit-items').innerHTML=value.items.map(item=>`<details class="crm-tool"><summary>${esc(item.after?.name||item.before?.name||cloud.records.find(r=>r.id===item.record_id)?.name||'Conferência registrada')} • ${esc(auditOperationLabels[item.operation]||item.operation)} • ${new Date(item.created_at).toLocaleString('pt-BR')} • ${esc(item.user_name)}</summary>${auditProvenance(item)}${auditMetadata(item)||(item.operation==='local-lideranca'?`<p>Local de referência: ${esc(item.after?.reference||'Não informado')} • ${esc(item.after?.latitude??'Sem ponto')}, ${esc(item.after?.longitude??'')} • ${item.after?.confirmed?'Conferência informada':'A conferir'}</p>`:item.operation==='parceria'?`<p>Estadual: ${esc(item.after.estadual.number)} — ${esc(item.after.estadual.name)}<br>Federal: ${esc(item.after.federal.number)} — ${esc(item.after.federal.name)}</p>`:changesTable(item.after,item.before))}${item.before&&item.before.id===item.record_id&&typeof item.before.name==='string'?`<button class="button secondary" data-restore-audit="${esc(item.id)}">Recuperar valores anteriores</button>`:''}</details>`).join('')||'<p>Nenhuma alteração registrada neste recorte.</p>';$('crm-audit-items')._items=value.items;$('crm-audit-items').closest('details').open=true;}catch(e){status(e.message,true);}
}
async function loadMembers(){try{const value=await request('members');$('crm-members')._items=value.items;$('crm-members').innerHTML=value.items.map(m=>`<div class="crm-tool"><strong>${esc(m.name)}</strong> • ${esc(m.email)} • ${esc(m.scope||'Responsável')} • ${m.disabled?'Desativado':'Ativo'}${m.role!=='owner'?`<div class="button-row"><button class="button secondary" data-member-toggle="${esc(m.email)}" data-disabled="${!m.disabled}">${m.disabled?'Ativar':'Desativar'}</button><button class="button secondary" data-member-reset="${esc(m.email)}">Solicitar nova senha</button></div>`:''}</div>`).join('');}catch(e){status(e.message,true);}}
async function loadSubmissions(){try{const value=await request('submissions');$('crm-submissions').innerHTML=value.items.map(item=>`<div class="crm-tool"><strong>${esc(item.record.name)}</strong> • ${esc(item.record.leadership)} • ${esc(item.source)}<p>${esc(item.record.title)} • Zona ${esc(item.record.zone)} • Seção ${esc(item.record.section)}</p><div class="button-row"><button class="button secondary" data-submission-edit="${esc(item.id)}">Conferir e cadastrar</button><button class="button secondary" data-submission-reject="${esc(item.id)}">Marcar como não aproveitado</button></div></div>`).join('')||'<p>Nenhum envio aguardando revisão.</p>';$('crm-submissions')._items=value.items;}catch(e){status(e.message,true);}}
async function createLink(){try{const result=await request('links','POST',{leadership:$('crm-link-leader').value,coordinator:$('crm-link-coordinator').value});const link=location.origin+'/#cadastro='+result.token;const data=await QRCode.toDataURL(link,{width:240,margin:2});$('crm-link-output').innerHTML=`<label class="field"><span>Link de ${esc(result.leadership)}</span><input readonly value="${esc(link)}"></label><img src="${data}" width="240" height="240" alt="QR Code do formulário de cadastro"><p class="compact-note">Guarde este link. Você pode desativá-lo e gerar outro.</p>`;const list=await request('links');$('crm-links').innerHTML=list.items.map(l=>`<div>${esc(l.leadership)} • ${l.disabled?'Desativado':`<button class="button secondary" data-link-disable="${esc(l.id)}">Desativar link</button>`}</div>`).join('');}catch(e){status(e.message,true);}}
async function readPhoto(){return documentReview?.read();}

async function downloadBackup(){
  if(!canEdit()||user.role!=='owner')return;
  const captureKey=key,email=user.email;$('crm-backup-download').disabled=true;
  $('crm-backup-status').textContent='Salvando e conferindo a cópia protegida…';
  try{
    await leadershipMap?.captureDraft();await save();const mapLocations=new Map((cloud.leadershipLocations||[]).map(r=>[r.id,r]));for(const [id,r]of locationDrafts)mapLocations.set(id,r);const file=await createBackup({email,records:working(),leadershipLocations:[...mapLocations.values()],...backupOptions(),key:captureKey,salt,revision:cloud.revision});
    if(!unlocked||key!==captureKey)return;
    const filename='COPIA_PROTEGIDA_PA_2026_'+new Date().toISOString().slice(0,10)+'.json';const url=URL.createObjectURL(new Blob([JSON.stringify(file)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
    try{localStorage.setItem('pa-backup-export:'+user.id,new Date().toISOString());}catch{}notifyPrivateState();
    $('crm-backup-status').textContent='Cópia protegida conferida e enviada para download. Guarde o arquivo e a senha usada.';
    return {filename,revision:cloud.revision,records:working().length,verified:true};
  }catch(e){if(unlocked)$('crm-backup-status').textContent=e.message;return null;}
  finally{if(unlocked)$('crm-backup-download').disabled=!canEdit();}
}
async function downloadBackupRecoveryKey(password){
  if(!canEdit()||user?.role!=='owner')throw new Error('Abra a base como responsável para guardar a chave protegida.');
  const captureKey=key,captureSalt=salt,email=user.email,epoch=accessEpoch;
  const result=await request('automatic-backups/key','POST',{password});
  const encrypted=await seal({project:'analise-eleitoral-pa',email,key:result.key,keyId:result.keyId,createdAt:new Date().toISOString()},captureKey);
  if(!unlocked||key!==captureKey||epoch!==accessEpoch)return;
  const file={format:'pa-server-backup-key',version:1,salt:captureSalt,...encrypted},url=URL.createObjectURL(new Blob([JSON.stringify(file)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='CHAVE_PROTEGIDA_BACKUP_PA_'+new Date().toISOString().slice(0,10)+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function resetBackup(){backupEpoch++;checkedBackup=null;$('crm-backup-preview').textContent='';$('crm-backup-restore').disabled=true;}
async function checkBackup(event){
  event.preventDefault();if(!canEdit()||user.role!=='owner')return;
  resetBackup();const run=backupEpoch,file=$('crm-backup-file').files[0],captureKey=key,email=user.email;
  $('crm-backup-check').disabled=true;$('crm-backup-status').textContent='Abrindo e conferindo a cópia…';
  try{
    if(!file)throw new Error('Escolha a cópia protegida.');if(file.size>MAX_BACKUP_BYTES)throw new Error('A cópia excede o limite de 28 MB.');
    const keyFile=$('crm-backup-key-file').files[0];if(keyFile?.size>100000)throw new Error('Arquivo de chave muito grande.');const backup=await readBackup(await file.text(),$('crm-backup-password').value,email,{recoveryKeyText:keyFile?await keyFile.text():undefined});
    if(backup.auditHistory?.length&&navigator.onLine){const index=await request('audit-index');if(index.revision!==cloud.revision)throw new Error('A base mudou. Atualize a consulta antes de conferir esta recuperação.');backup.existingAuditIds=index.ids;}
    if(!unlocked||key!==captureKey||run!==backupEpoch)return;
    checkedBackup=backup;const changes=recoveryChanges(backup,working()),mapChanges=recoverLeadershipLocations(backup,cloud.leadershipLocations||[]),metadata=recoveryMetadataChanges(backup,cloud).filter(e=>e.kind!=='location'),drafts=(backup.duplicateDrafts||[]).filter(([id])=>!duplicateDrafts.has(id));
    $('crm-backup-preview').textContent=`Cópia de ${new Date(backup.createdAt).toLocaleString('pt-BR')} • ${backup.records.length} cadastros, inclusive arquivados • ${changes.length} diferenças em relação à base aberta. A recuperação acrescenta ou atualiza esses itens e preserva os demais cadastros atuais.`;
    $('crm-backup-preview').textContent+=' Locais de referência: '+(backup.leadershipLocations||[]).length+'; diferenças: '+mapChanges.length+'. Os locais recuperados ficam como rascunhos para revisão.';
    $('crm-backup-preview').textContent+=' Parcerias, observações e datas: '+metadata.length+' diferença(s). Rascunhos recuperáveis: '+drafts.length+'.'+(backup.formatVersion===1?' Esta cópia antiga não inclui parcerias, observações e datas de inclusão.':' Observações recuperadas ficam para conferência e não arquivam cadastros.');
    const reviewDrafts=(backup.qualityDrafts||[]).filter(([id])=>!qualityDrafts.has(id));
    $('crm-backup-preview').textContent+=' Rascunhos de conferência recuperáveis: '+reviewDrafts.length+'. Validações recuperadas ficarão em conferência.';
    const different=changes.length||mapChanges.length||metadata.length||drafts.length||reviewDrafts.length;
    $('crm-backup-restore').disabled=!different;$('crm-backup-status').textContent=different?'Cópia válida. Confira a recuperação antes de sincronizar.':'Cópia válida. Os cadastros já correspondem à base aberta.';
    $('crm-backup-password').value='';
  }catch(e){if(unlocked)$('crm-backup-status').textContent=e.message;}
  finally{if(unlocked)$('crm-backup-check').disabled=!canEdit();}
}
async function restoreBackup(){
  if(!canEdit()||user.role!=='owner'||!checkedBackup)return;
  try{
    if(recoveryPlan)throw new Error('Conclua ou descarte a recuperação em revisão antes de preparar outra cópia.');
    const changes=recoveryChanges(checkedBackup,working()),mapChanges=recoverLeadershipLocations(checkedBackup,cloud.leadershipLocations||[]),changedIds=new Set(changes.map(r=>r.id)),metadata=recoveryMetadataChanges(checkedBackup,cloud).filter(e=>e.kind!=='location'&&!(e.kind==='creation'&&changedIds.has(e.id)));
    const drafts=cleanDuplicateDrafts(checkedBackup.duplicateDrafts,new Set([...working(),...checkedBackup.records].map(r=>r.id))).filter(([id])=>!duplicateDrafts.has(id));
    const reviewDrafts=cleanQualityDrafts(checkedBackup.qualityDrafts,new Set([...working(),...checkedBackup.records].map(r=>r.id))).filter(([id])=>!qualityDrafts.has(id));
    if(!changes.length&&!mapChanges.length&&!metadata.length&&!drafts.length&&!reviewDrafts.length)return resetBackup();
    for(const r of changes)pending.set(r.id,r);
    for(const r of mapChanges)if(inScope(r))locationDrafts.set(r.id,r);
    for(const [id,draft]of drafts)duplicateDrafts.set(id,draft);
    for(const [id,draft]of reviewDrafts)qualityDrafts.set(id,draft);
    if(changes.length||metadata.length)recoveryPlan={entries:metadata,recordCreatedAt:checkedBackup.recordCreatedAt||{},backupId:null,backupOperationId:null,inflight:null};
    approved=false;reviewReason='Recuperação de cópia protegida de '+new Date(checkedBackup.createdAt).toLocaleString('pt-BR');
    detectConflicts();await save();resetBackup();mirror();render();if(pendingCount())conflicts.length?showConflicts():showReview();else if(mapChanges.length)leadershipMap?.open();else if(reviewDrafts.length){api.showView('quality-review');setPage('quality-review');}else setPage('duplicates');
    $('crm-backup-status').textContent=changes.length+' cadastro(s), '+mapChanges.length+' local(is), '+metadata.length+' metadado(s) e '+drafts.length+' rascunho(s) preparados para revisão. Rascunhos atuais diferentes foram preservados.';
  }catch(e){status(e.message,true);}
}
function exportRecords(){
  const columns=['ID','COORDENADOR','LIDERANÇA','NOME','TÍTULO','ZONA','SEÇÃO','CONTATO','MÃE','RG','CPF','NASCIMENTO','OBSERVAÇÕES','ESCOLA','BAIRRO','MUNICÍPIO','VALIDAÇÃO PRINCIPAL','PENDÊNCIAS PRINCIPAIS','PENDÊNCIAS SECUNDÁRIAS','CLASSIFICAÇÃO CADASTRAL'],quote=v=>'"'+String(v??'').replaceAll('"','""')+'"';
  const rows=working().filter(r=>!r.deleted).map(r=>[r.id,r.coordinator,r.leadership,r.name,r.title,r.zone,r.section,r.contact,r.mother,r.rg,r.cpf,r.birth,r.notes,r.location?.place||'',r.location?.neighborhood||'',r.location?.city||'',r.ready?'OK':'PENDENTE',r.primaryFlags.map(f=>f.message).join(' | '),r.secondaryFlags.map(f=>f.message).join(' | '),registrationCategory(r)==='complete'?'100% COMPLETO':registrationCategory(r)==='secondary'?'APROVADO COM PENDÊNCIAS SECUNDÁRIAS':'NÃO APROVADO']);
  const blob=new Blob(['\ufeff'+[columns,...rows].map(r=>r.map(v=>quote(/^[=+@-]/.test(String(v))?"'"+v:v)).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='BASE_CENTRAL_LIDERANCAS_PA_2026.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function openPendencyReport(summaryOnly=false,quick=false){
  if(!unlocked)return status('Desbloqueie a base para emitir os relatórios por liderança.');
  if(!window.ReportCenter||!window.ReportPDF)return status('O gerador de relatórios não carregou. Reabra a plataforma.',true);
  const signature=()=>unlocked?JSON.stringify([user.id,user.role,user.scope,$('crm-leader-filter').value,$('crm-report-municipality').value,cloud.revision,[...pending.keys()],conflicts.length,quick?$('crm-search').value:'',working()]):'locked';
  const leadership=$('crm-leader-filter').value;
  const options=simpleRegistrationModes.map(mode=>({id:mode.id,label:mode.label,description:(leadership||'Todas as lideranças autorizadas')+'. Total, OK e com pendência. Apenas nome, zona, seção, local de votação e situação dos dados principais.',prepare:async()=>{
    if(!unlocked)throw new Error('Desbloqueie a base para emitir o relatório.');
    return buildSimpleRegistrationReport(working(),{user,leadership:$('crm-leader-filter').value,mode:mode.id,search:quick?$('crm-search').value:'',municipality:$('crm-report-municipality').value,municipalityName:$('crm-report-municipality').selectedOptions[0]?.textContent,revision:cloud.revision,pendingChanges:pending.size,conflicts:conflicts.length,online:navigator.onLine});
  }}));
  options.unshift({id:'municipal',label:'Resumo por municípios',description:'Quantidades por liderança e município, aprovados, não aprovados, fora do município escolhido e não identificados. Sem fichas individuais.',prepare:async()=>{
    if(!unlocked)throw new Error('Desbloqueie a base para emitir o relatório.');
    return buildPendencyReport(working(),{user,leadership:$('crm-leader-filter').value,municipality:$('crm-report-municipality').value,municipalityName:$('crm-report-municipality').selectedOptions[0]?.textContent,summaryOnly:true,revision:cloud.revision,pendingChanges:pending.size,conflicts:conflicts.length,online:navigator.onLine});
  }});
  window.ReportCenter.open({private:true,signature,options,defaultType:summaryOnly?'municipal':quick?'simple-problems':'simple-all'});
}
function openLeadershipPendenciesReport(){
  if(!unlocked){api.showView('lists');status('Desbloqueie a base para gerar as pendências de todas as lideranças.');$('crm-password')?.focus();return false;}
  if(!window.ReportCenter||!window.ReportPDF){status('O gerador de relatórios não carregou. Reabra a plataforma.',true);return false;}
  const signature=()=>unlocked?JSON.stringify([user.id,user.role,user.scope,cloud.revision,[...pending.keys()],conflicts.length,working()]):'locked';
  window.ReportCenter.open({private:true,signature,defaultFormat:'compact',defaultType:'all',options:leadershipPendencyModes.map(mode=>({id:mode.id,label:mode.label,leadershipPages:true,description:'Todas as lideranças autorizadas, de uma vez, independentemente dos filtros da lista. Cada liderança/coordenação começa em uma nova página, com nomes, zona, seção e pendências. Lideranças sem pendências deste tipo não geram folhas extras.',prepare:async()=>{
    if(!unlocked)throw Error('Desbloqueie a base para emitir o relatório.');
    return buildLeadershipPendencyReport(working(),{user,mode:mode.id,revision:cloud.revision,pendingChanges:pending.size,conflicts:conflicts.length,online:navigator.onLine});
  }}))});return true;
}
async function intake(){
  intakeToken=new URLSearchParams(location.hash.slice(1)).get('cadastro')||'';if(!intakeToken)return;
  api.showView('lists');$('crm-intake-panel').hidden=false;
  try{const info=await request('intake','POST',{token:intakeToken,inspect:true});$('crm-intake-title').textContent='Cadastro para '+info.leadership;}catch(e){$('crm-intake-status').textContent=e.message;}
  $('crm-intake-form').addEventListener('submit',async e=>{e.preventDefault();try{const result=await request('intake','POST',{token:intakeToken,record:formRecord('intake'),consent:$('intake-consent').checked});$('crm-intake-status').textContent=result.message;e.target.reset();}catch(e){$('crm-intake-status').textContent=e.message;}});
}
async function guidedQuery(event){
  event.preventDefault();const text=normalize($('guided-query-input').value),state=api.state;
  try{
    if(/CADASTR|PENDENC|INCOMPLET|DUPLIC/.test(text)){
      api.showView('lists');if(!unlocked)return $('guided-query-status').textContent='Desbloqueie a base para consultar cadastros.';
      $('crm-status-filter').value=/PENDENC|INCOMPLET/.test(text)?'red':'';$('crm-search').value='';render();$('guided-query-status').textContent='Base de lideranças aberta com o filtro solicitado.';return;
    }
    if(/CORRELAC|ESTADUAL.*FEDERAL|FEDERAL.*ESTADUAL/.test(text)){api.showView('paired');$('guided-query-status').textContent='Selecione a dupla no quadro Estadual × Federal e pressione Comparar.';return;}
    if(!state.index)throw new Error('Aguarde o carregamento da base eleitoral.');
    const office=/FEDERAL/.test(text)?'federal':/ESTADUAL/.test(text)?'estadual':state.office;
    if(office!==state.office)await api.query({office,view:'overview'});
    const cities=state.index.municipalities||[],city=cities.filter(c=>text.includes(normalize(c[1]))).sort((a,b)=>String(b[1]).length-String(a[1]).length)[0];
    const candidates=(state.statewide?.candidates||state.city?.c||[]).filter(c=>text.includes(normalize(c[2]))||new RegExp('(?:^|\\D)'+String(c[1])+'(?:\\D|$)').test(text));
    const view=/RAIO|TOP 30|HISTOR|EVOLUC|DECLIN/.test(text)?'xray':/COMPAR/.test(text)?'comparison':/ZONA|SECAO|ESCOLA|LOCAL/.test(text)?'territory':'overview';
    if(!city&&!candidates.length&&!/ZONA|SECAO/.test(text))throw new Error('Não identifiquei o candidato ou município. Use o nome completo ou número e o município.');
    const zone=text.match(/ZONA\s*(\d+)/)?.[1],section=text.match(/SECAO\s*(\d+)/)?.[1];
    await api.query({office,city:city?String(city[0]):undefined,candidate:candidates[0]?.[0],candidateIds:view==='comparison'?candidates.slice(0,3).map(c=>c[0]):undefined,zone,section,view});
    $('guided-query-status').textContent='Consulta aberta nos filtros da plataforma. Os gráficos usam os dados carregados e o histórico elegível.';
  }catch(e){$('guided-query-status').textContent=e.message;}
}
function pdfImportReady(){if(!unlocked||user?.role!=='owner')throw new Error('Desbloqueie a base como responsável para importar o PDF.');if(!navigator.onLine)throw new Error('Conecte à internet para confirmar a atualização.');if(!canEdit()||busy||pendingCount()||conflicts.length||inflight||locationDrafts.size)throw new Error('Conclua as alterações locais antes de importar outro lote.');}
async function applyPdfBatch(operationId,records){
  pdfImportReady();pending=new Map(records.map(r=>[r.id,r]));approved=true;reviewReason='Inclusão de lote de PDF autorizada pelo responsável, com pendências preservadas.';
  inflight={operationId,revision:cloud.revision,changes:records};await save();mirror();render();await sync();
  if(!unlocked||pending.size||inflight)throw new Error('A gravação ainda não foi confirmada. As alterações foram preservadas; confira a sincronização antes de repetir.');
  return {revision:cloud.revision};
}
async function init(callbacks){
  tabActivity?.close();tabActivity=createTabActivity({getIdentity:()=>unlocked?user?.id:null,onActivity:()=>armLock(false),onLock:()=>{if(unlocked)lock('Base bloqueada em outra aba deste aparelho.',false,false);},Channel:window.BroadcastChannel});
  registerPdfBatchTool({registry:document.modelContext,ready:pdfImportReady,refresh,current:()=>cloud.records,backup:downloadBackup,apply:applyPdfBatch});
  api=callbacks;installUI();if(!$('crm-panel'))return;documentReview=initDocumentReview({getState:()=>({unlocked,canEdit:canEdit()}),loadOCR,openRecord:(record,withSource)=>openEditor(record,null,withSource)});securityView=initSecurityView({request,getUser:()=>unlocked?user:null});groupAdmin=initGroupAdmin({request,getState:()=>({user:unlocked?user:null,records:unlocked?working():[],...getOperationalState()}),acceptSnapshot:async snapshot=>{if(!unlocked)return;cloud=snapshot;assessmentCache=null;lastOnline=new Date().toISOString();await save();mirror();render();}});mirror();window.SearchableSelect?.init();window.OfflineManager?.init();
  registrationViews.lists=createRegistrationDistributionView({container:$('crm-registration-summary'),getSnapshot:()=>registrationSnapshot('lists'),onMunicipality:setRegistrationMunicipality,onOpenMap:openLeadershipMap,onReset:()=>{for(const id of ['crm-zone-filter','crm-section-filter','crm-place-filter','crm-neighborhood-filter'])$(id).value='';page=0;render();},onZone:zone=>{$('crm-zone-filter').value=zone;$('crm-section-filter').value='';page=0;render();}});
  registrationViews.analysis=createRegistrationDistributionView({container:$('analysis-registration-summary'),getSnapshot:()=>registrationSnapshot('analysis'),onMunicipality:setRegistrationMunicipality,onOpenMap:openLeadershipMap,onReset:()=>{const select=$('analysis-zone-select');if(select){select.value='';select.dispatchEvent(new Event('change',{bubbles:true}));}},onZone:zone=>{const select=$('analysis-zone-select');if(select){select.value=zone;select.dispatchEvent(new Event('change',{bubbles:true}));}}});
  partnershipView=initGroupPartnership({getRecords:working,getUser:()=>unlocked?user:null,getPartnerships:()=>cloud.partnerships||[],getLeaderFilter:()=>$('crm-leader-filter').value,getReferenceCity:()=>({code:$('crm-report-municipality').value,name:$('crm-report-municipality').selectedOptions[0]?.textContent}),canEdit,savePartnership:saveGroupPartnership,refresh});
  leadershipMap=initLeadershipMap({getRecords:working,getUser:()=>unlocked?user:null,getLocations:()=>cloud.leadershipLocations||[],getDrafts:()=>[...locationDrafts.values()],canEdit,lookupCep:cep=>request('cep?cep='+encodeURIComponent(cep)),lookupAddress:input=>request('address','POST',input),saveLocation:saveLeadershipReference,saveDraft:saveLocationDraft,discardDraft:async id=>{locationDrafts.delete(id);await save();},refresh});
  organizeCrmPages();
  const acceptAdministrativeSnapshot=async value=>{if(!unlocked)return;cloud=value;assessmentCache=null;lastOnline=new Date().toISOString();detectConflicts();await save();if(unlocked){mirror();render();}};
  qualityView=initQualityWorkflow({container:$('crm-page-quality'),getRecords:()=>unlocked?working():[],getReviews:()=>unlocked?cloud.qualityReviews||[]:[],getDrafts:()=>qualityDrafts,setDraft:(id,value)=>{if(!unlocked||storageUnavailable||!key)throw new Error('Abra a cópia protegida para guardar esta conferência.');if(value)qualityDrafts.set(id,value);else qualityDrafts.delete(id);},persist:save,getState:()=>({unlocked,canDraft:unlocked&&!storageUnavailable&&!!key,canEdit:canEdit(),dirty:!!(pendingCount()||conflicts.length||inflight||locationDrafts.size),revision:cloud.revision}),request,acceptSnapshot:acceptAdministrativeSnapshot,openRecord:id=>{const record=working().find(r=>r.id===id);if(record&&canEdit())openEditor(record);}});
  operationsView=initOperationsView({container:$('crm-page-operations'),getState:()=>({unlocked,owner:user?.role==='owner',canEdit:canEdit()}),request,exportKey:downloadBackupRecoveryKey});
  archivedView=initArchivedRecords({container:$('crm-page-archived'),getRecords:()=>{if(!unlocked)return [];const originals=new Map(cloud.records.map(r=>[r.id,r]));return working().filter(r=>r.deleted).map(r=>({...r,createdAt:originals.get(r.id)?.createdAt,updatedAt:originals.get(r.id)?.updatedAt}));},getReviews:()=>unlocked?cloud.duplicateReviews||[]:[],getState:()=>({unlocked,canEdit:canEdit(),revision:cloud.revision}),request,reactivate:async record=>{
    if(!canEdit())throw new Error('Desbloqueie a base e conclua o envio pendente antes de reativar.');
    const current=working().find(r=>r.id===record.id&&r.deleted);if(!current)return false;
    if(!confirm('Preparar a reativação de '+current.name+'? Confira a identidade, os documentos e as observações: a reativação pode reabrir duplicidades. A mudança será apresentada para revisão antes de sincronizar.'))return false;
    await stage({...current,deleted:false},'Reativação de cadastro arquivado: confira a identidade e os documentos antes de aprovar.');showReview();return true;
  }});
  duplicateView=initDuplicateRecords({container:$('crm-page-duplicates'),request,getRecords:()=>unlocked?working():[],getDrafts:()=>duplicateDrafts,setDraft:(id,draft)=>{if(!unlocked||storageUnavailable||user?.role!=='owner'||!key)throw new Error('Abra a cópia protegida como responsável para guardar observações.');if(draft)duplicateDrafts.set(id,draft);else duplicateDrafts.delete(id);},persistDrafts:save,getState:()=>({unlocked,owner:user?.role==='owner',canEdit:canEdit(),canDraft:unlocked&&!storageUnavailable&&!!key,dirty:!!(pendingCount()||conflicts.length||inflight||locationDrafts.size)}),openRecord:id=>{const record=working().find(r=>r.id===id);if(record&&canEdit())openEditor(record);},prepareBackup:async revision=>{
    if(!unlocked||storageUnavailable||user?.role!=='owner'||!navigator.onLine||pendingCount()||conflicts.length||inflight||locationDrafts.size)throw new Error('Desbloqueie a base como responsável e conclua as alterações locais antes de tratar duplicidades.');
    const epoch=accessEpoch,identity=user.id;const fresh=await request('records');
    if(!unlocked||epoch!==accessEpoch||user?.id!==identity)throw new Error('A base foi bloqueada durante a conferência.');
    if(fresh.revision!==revision)throw new Error('A base mudou. Atualize as duplicidades antes de tratar.');
    const backup=await createBackup({email:user.email,records:fresh.records,leadershipLocations:fresh.leadershipLocations||[],partnerships:fresh.partnerships||[],duplicateReviews:fresh.duplicateReviews||[],duplicateDrafts:[...duplicateDrafts.entries()],qualityReviews:fresh.qualityReviews||[],qualityDrafts:[...qualityDrafts.entries()],key,salt,revision});
    if(!unlocked||epoch!==accessEpoch)throw new Error('A base foi bloqueada durante a cópia protegida.');return backup;
  },setBusy:value=>{busy=value;render();},acceptSnapshot:async snapshot=>{if(!unlocked)return;cloud=snapshot;assessmentCache=null;lastOnline=new Date().toISOString();await save();mirror();render();}});
  $('crm-open-leadership-map')?.addEventListener('click',openLeadershipMap);
  $('crm-open-partnership')?.addEventListener('click',()=>{if(window.CrossingHub){api.showView('partnership');return;}api.showView('partnership');setPage('partnership');if(unlocked)partnershipView.open();else status('Desbloqueie a base para conferir a parceria do grupo.');});
  $('crm-auth').addEventListener('submit',unlock);
  for(const b of document.querySelectorAll('[data-password-target]'))b.addEventListener('click',()=>{const input=$(b.dataset.passwordTarget),show=input.type==='password';input.type=show?'text':'password';b.textContent=show?'Ocultar':'Mostrar';b.setAttribute('aria-pressed',String(show));b.setAttribute('aria-label',show?'Ocultar senha':'Mostrar senha');});$('crm-lock').addEventListener('click',()=>lock());$('crm-new').addEventListener('click',()=>openEditor());$('crm-edit-form').addEventListener('submit',saveForm);$('crm-edit-form').addEventListener('input',validateForm);
  $('edit-leadership').addEventListener('change',()=>{const matches=working().filter(r=>normalize(r.leadership)===normalize($('edit-leadership').value)),values=[...new Set(matches.map(r=>r.coordinator))];if(values.length===1)$('edit-coordinator').value=values[0];validateForm();});
  document.querySelectorAll('.crm-close').forEach(b=>b.addEventListener('click',()=>b.closest('dialog').close()));
  $('crm-sync').addEventListener('click',sync);$('crm-refresh').addEventListener('click',refresh);$('crm-review-button').addEventListener('click',showReview);$('crm-conflict-button').addEventListener('click',showConflicts);
  $('crm-accept-review').addEventListener('click',async()=>{approved=true;await save();$('crm-review').close();render();if(navigator.onLine)sync();});
  $('crm-discard-review').addEventListener('click',async()=>{if(inflight||recoveryPlan?.inflight)return status('Confirme o envio pendente antes de descartar.',true);if(!confirm('Descartar somente as alterações ainda não enviadas deste aparelho? A base central será preservada.'))return;pending.clear();recoveryPlan=null;conflicts=[];approved=false;await save();mirror();render();$('crm-review').close();});
  $('crm-search').addEventListener('input',()=>{clearTimeout(searchTimer);searchTimer=setTimeout(()=>{page=0;render({listOnly:true});},140);});
  ['crm-leader-filter','crm-status-filter','crm-place-filter','crm-zone-filter','crm-section-filter','crm-neighborhood-filter','crm-coordinator-filter'].forEach(id=>$(id).addEventListener('change',()=>{clearTimeout(searchTimer);if(id==='crm-zone-filter')$('crm-section-filter').value='';page=0;render({listOnly:id!=='crm-leader-filter'});}));
  function quickFilter(value){clearTimeout(searchTimer);if(value==='unknown')$('crm-search').value='';for(const id of ['crm-place-filter','crm-zone-filter','crm-section-filter','crm-neighborhood-filter'])$(id).value='';$('crm-status-filter').value=value;page=0;render();if(value==='unknown')$('crm-list-note').scrollIntoView?.({behavior:'smooth',block:'start'});else $('crm-search').focus();}
  $('crm-show-unapproved').addEventListener('click',()=>quickFilter('red'));
  $('crm-show-unknown').addEventListener('click',()=>quickFilter('unknown'));
  $('crm-unapproved-report').addEventListener('click',()=>{quickFilter('red');openPendencyReport(false,true);});
  $('crm-clear-filters').addEventListener('click',()=>{for(const id of ['crm-search','crm-leader-filter','crm-status-filter','crm-place-filter','crm-zone-filter','crm-section-filter','crm-neighborhood-filter','crm-coordinator-filter'])$(id).value='';page=0;render();$('crm-search').focus();});
  $('crm-report-municipality').addEventListener('change',()=>setRegistrationMunicipality($('crm-report-municipality').value));
  $('crm-previous-page').addEventListener('click',()=>{page--;render({listOnly:true});});$('crm-next-page').addEventListener('click',()=>{page++;render({listOnly:true});});
  $('crm-recover-copy').addEventListener('click',()=>{if(!unlocked)return status('Entre com a senha atual para recuperar edições anteriores.');$('crm-recovery-dialog').showModal();});$('crm-recovery-form').addEventListener('submit',recoverCopy);
  $('crm-download-recovery').addEventListener('click',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({format:'pa-2026-encrypted-recovery',copies:recoveryCopies})],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='COPIAS_PROTEGIDAS_PA_2026.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  $('crm-export').addEventListener('click',exportRecords);$('crm-pendency-report').addEventListener('click',()=>openPendencyReport());$('crm-municipality-report').addEventListener('click',()=>openPendencyReport(true));$('crm-create-link').addEventListener('click',createLink);$('crm-read-photo').addEventListener('click',readPhoto);
  $('crm-backup-download').addEventListener('click',downloadBackup);$('crm-backup-form').addEventListener('submit',checkBackup);$('crm-backup-file').addEventListener('change',resetBackup);$('crm-backup-key-file').addEventListener('change',resetBackup);$('crm-backup-password').addEventListener('input',resetBackup);$('crm-backup-restore').addEventListener('click',restoreBackup);
  $('crm-use-text').addEventListener('click',()=>documentReview?.useText());
  $('crm-load-audit').addEventListener('click',()=>loadAudit());$('crm-load-submissions').addEventListener('click',loadSubmissions);
  $('crm-member-form').addEventListener('submit',async e=>{e.preventDefault();try{await request('members','POST',Object.fromEntries(new FormData(e.target)));e.target.reset();await loadMembers();$('crm-member-pass').required=false;status(loginMode==='independent'?'Conta configurada. Informe a senha inicial diretamente à pessoa autorizada.':'Perfil salvo. Autorize também o acesso da pessoa nas opções de compartilhamento do site.');}catch(err){status(err.message,true);}});
  $('crm-panel').addEventListener('click',async e=>{
    const b=e.target.closest('button');if(!b)return;
    try{
      if(b.dataset.edit)openEditor(working().find(r=>r.id===b.dataset.edit));
      if(b.dataset.archive){const r=working().find(r=>r.id===b.dataset.archive);if(confirm(`${r.deleted?'Reativar':'Arquivar'} ${r.name}? O histórico será preservado.`)){await stage({...r,deleted:!r.deleted});showReview();}}
      if(b.dataset.history)await loadAudit(b.dataset.history);
      if(b.dataset.restoreAudit){const item=$('crm-audit-items')._items.find(i=>i.id===b.dataset.restoreAudit),current=working().find(r=>r.id===item.record_id);openEditor({...item.before,id:current.id,version:current.version});}
      if(b.dataset.resolveRemote||b.dataset.resolveLocal){const id=b.dataset.resolveRemote||b.dataset.resolveLocal,c=conflicts.find(c=>c.local.id===id);if(b.dataset.resolveRemote)pending.delete(id);else pending.set(id,{...c.local,version:c.remote?.version||0});conflicts=conflicts.filter(c=>c.local.id!==id);await save();mirror();render();if(conflicts.length){$('crm-conflicts-dialog').close();showConflicts();}else $('crm-conflicts-dialog').close();}
      if(b.dataset.memberToggle){await request('members','POST',{action:'disable',email:b.dataset.memberToggle,disabled:b.dataset.disabled==='true'});await loadMembers();}
      if(b.dataset.memberReset){if(loginMode==='independent'){const member=$('crm-members')._items.find(m=>m.email===b.dataset.memberReset),form=$('crm-member-form');for(const name of ['name','email','role','scope'])form.elements[name].value=member[name]||'';$('crm-member-action').value='reset';$('crm-member-pass').required=true;$('crm-member-pass').focus();status('Defina a nova senha e use Salvar acesso.');}else if(confirm('Pedir que esta pessoa defina uma nova senha no próximo acesso?')){await request('members','POST',{action:'reset',email:b.dataset.memberReset});await loadMembers();}}
      if(b.dataset.linkDisable){await request('links','POST',{disable:true,id:b.dataset.linkDisable});b.disabled=true;b.textContent='Desativado';}
      if(b.dataset.submissionEdit){const item=$('crm-submissions')._items.find(i=>i.id===b.dataset.submissionEdit),existing=working().find(r=>r.id===item.record.id&&!r.deleted);openEditor({...item.record,id:existing?.id||crypto.randomUUID(),version:existing?.version||0},item.id);}
      if(b.dataset.submissionReject){await request('submissions','POST',{id:b.dataset.submissionReject,status:'rejected'});await loadSubmissions();}
    }catch(err){status(err.message,true);}
  });
  document.addEventListener('pointerdown',armLock,{passive:true});document.addEventListener('keydown',armLock);window.addEventListener('online',()=>{render();if(unlocked&&approved)sync();});window.addEventListener('offline',()=>{if(storageUnavailable&&unlocked)lock('A consulta central precisa de conexão. Entre novamente quando a internet voltar.',false);else render();});
  window.addEventListener('pagehide',()=>{save().catch(()=>{});accessEpoch++;maskPasswords();key=null;unlocked=false;cloud={revision:0,records:[]};pending.clear();locationDrafts.clear();duplicateDrafts.clear();qualityDrafts.clear();recoveryPlan=null;lastRecoveryBackupId='';conflicts=[];inflight=null;user=null;submissionApprovals={};clearPrivateView();mirror();clearTimeout(lockTimer);});
  universalSearch=initUniversalSearch({...api,fallback:guidedQuery});
  try{const info=await request('session');$('crm-mfa-wrap').hidden=!info.mfaEnabled;$('crm-email').value=info.user.email;loginMode=info.loginMode||'sites';$('crm-email').readOnly=loginMode!=='independent';if(loginMode==='independent'){$('crm-auth-note').textContent='O acesso usa o e-mail e a senha da própria plataforma. A mesma senha protege a cópia offline neste aparelho.';$('crm-members-note').textContent='Cadastre a conta e sua liderança ou coordenação. Contas novas precisam de uma senha inicial com pelo menos 12 caracteres; em contas existentes, deixe em branco para manter a senha.';$('crm-member-pass-wrap').hidden=false;$('crm-signout').href='/';$('crm-signout').addEventListener('click',async event=>{event.preventDefault();await lock();if(!unlocked)location.replace('/');});}$('crm-confirm-wrap').hidden=!info.needsSetup;$('crm-confirm').required=info.needsSetup;$('crm-password').autocomplete=info.needsSetup?'new-password':'current-password';$('crm-unlock').textContent=info.needsSetup?'Definir senha e abrir base':'Entrar';status(info.needsSetup?'Defina sua senha. A base inicial será carregada no primeiro acesso do responsável; a plataforma mostrará as quantidades da base disponível.':'Use sua senha para abrir a base central e a cópia protegida.');if(info.integrations.whatsapp)$('crm-whatsapp-status').textContent='Credenciais empresariais configuradas. A recepção exige o encaminhador autorizado para o site privado.';}catch(e){status(navigator.onLine?e.message:'Sem internet. Informe o e-mail e a senha usados ao preparar este aparelho.',navigator.onLine);}
  await intake();
}
function openLeadershipMap(){
  api?.showView('leadership');setPage('leadership');if(unlocked){leadershipMapRequested=false;return leadershipMap?.open();}
  leadershipMapRequested=true;status('Desbloqueie a base para consultar o mapa privado das lideranças.');$('crm-password')?.focus();
}
function getHomeSummary(){return unlocked&&homeSummary?{...homeSummary}:null;}
function openCouncilRecord(id){
  if(!unlocked)return false;
  const record=working().find(r=>r.id===id&&!r.deleted);if(!record)return false;
  api?.showView('lists');setPage('lists');
  if(!canEdit()){status('Aguarde a sincronização ou habilite a edição para revisar este cadastro.');return false;}
  openEditor(record);return true;
}
function openHomeFilter(kind){
  const categories={all:'',ready:'green',priority:'red',secondary:'secondary',uncounted:'unknown'};
  if(!Object.hasOwn(categories,kind))return false;
  api.showView('lists');setPage('lists');
  if(!unlocked){status('Desbloqueie a base para consultar os cadastros deste indicador.');$('crm-password')?.focus();return false;}
  clearTimeout(searchTimer);
  // Home counters cover all active records authorized for this account. Clear
  // older list filters so one click shows exactly the selected counter.
  for(const id of ['crm-search','crm-leader-filter','crm-status-filter','crm-place-filter','crm-zone-filter','crm-section-filter','crm-neighborhood-filter','crm-coordinator-filter'])$(id).value='';
  $('crm-status-filter').value=categories[kind];page=0;render({listOnly:true});
  $('crm-status-filter').focus();$(kind==='uncounted'?'crm-list-note':'crm-filter-summary').scrollIntoView?.({behavior:'smooth',block:kind==='uncounted'?'start':'nearest'});
  return true;
}
function getAuditSummary(){if(!unlocked)return null;const records=working().filter(r=>!r.deleted),counts={complete:0,secondary:0,unapproved:0};for(const record of records)counts[registrationCategory(record)]++;const located=records.filter(countableForResults);return {'Cadastros ativos':records.length,'100% completos':counts.complete,'Aprovados com secundárias':counts.secondary,'Pendência principal':counts.unapproved,'Localização eleitoral confirmada':located.length,'Localização não confirmada':records.length-located.length,'Localização confirmada com pendência principal':located.filter(r=>!r.ready).length,'Nota':'Contagens cadastrais, antes da deduplicação das análises; não representam votos.'};}
function getOperationalState(){let lastBackupAt='';try{if(unlocked&&user)lastBackupAt=localStorage.getItem('pa-backup-export:'+user.id)||'';}catch{}return {loginMode,unlocked,lastBackupAt,consultationOnly:storageUnavailable,busy,revision:unlocked?cloud.revision:null,pending:unlocked?pendingCount():0,conflicts:unlocked?conflicts.length:0,locationDrafts:unlocked?locationDrafts.size:0,qualityDrafts:unlocked?qualityDrafts.size:0,inflight:unlocked&&!!inflight,lastOnline:unlocked?lastOnline:''};}
window.CrmWorkspace={init,captureLists,lock,isUnlocked:()=>unlocked,canEdit,getRecords:()=>unlocked?working():[],getHomeSummary,openCouncilRecord,openHomeFilter,getAuditSummary,getOperationalState,refreshCentral:refresh,openLeadershipMap,setPage,openRegistrationReport,openLeadershipPendenciesReport,getReportContext,renderRegistrationSummary:()=>registrationViews.analysis?.render(),refreshSearchCoverage:()=>universalSearch?.coverage()};
