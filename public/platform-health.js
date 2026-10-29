(function(root){
  'use strict';
  const VERSION='2.15.0',$=id=>document.getElementById(id);
  let context,newVersion='',lastAudit=null,auditBusy=false;
  async function read(path){const response=await fetch(path,{cache:'no-store',credentials:'same-origin'});if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw Error('Fonte indisponível ou sessão expirada. Entre novamente e confira.');return response.json();}
  function auditSummary(){
    const crm=root.CrmWorkspace?.getOperationalState?.()||{},offline=root.OfflineManager?.getState?.()||{},local=['localhost','127.0.0.1','::1'].includes(location.hostname),sync=root.PlatformAudit?.synchronization(crm,navigator.onLine,local);
    if(sync){$('platform-health-sync').dataset.tone=sync.tone;$('platform-health-sync').textContent=sync.label+' — '+sync.detail;}
    const quality=root.CrmWorkspace?.getAuditSummary?.();$('platform-health-quality').replaceChildren();
    if(quality)for(const [label,value]of Object.entries(quality)){const row=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=String(value);row.append(dt,dd);$('platform-health-quality').append(row);}
    if(!crm.unlocked)$('platform-health-quality').textContent='Indicadores cadastrais protegidos. Desbloqueie a base para conferir.';
    const backup=crm.lastBackupAt?new Date(crm.lastBackupAt):null;$('platform-health-backup').textContent=!crm.unlocked?'':backup?'Última exportação de cópia protegida: '+backup.toLocaleString('pt-BR')+'. Guarde o arquivo e teste a recuperação.':'Nenhuma exportação de cópia protegida registrada neste aparelho. Use Cópia de segurança em Cadastros.';
    const off=offline.freshness;$('platform-health-offline').textContent=off==='stale'?'A versão eleitoral mudou após o preparo offline. Prepare novamente antes de trabalhar sem internet.':off==='ready'?'Cópia offline conferida para as versões conhecidas neste aparelho.':offline.preparedAt?'Há um preparo anterior; confira as versões antes de depender da cópia offline.':'Este aparelho ainda não tem uma cópia eleitoral preparada.';
  }
  async function audit(){
    if(auditBusy)return;if(!navigator.onLine)return $('platform-health-audit-status').textContent='A auditoria das versões centrais exige conexão.';
    auditBusy=true;$('platform-health-audit').disabled=true;$('platform-health-audit-status').textContent='Conferindo fontes, somas municipais e divisão regional…';lastAudit=null;
    try{const results=[];for(const office of ['estadual','federal']){
      const prefix='/api/election/'+office,manifest=await read(prefix+'/manifest'),suffix='?version='+encodeURIComponent(manifest.active);
      const [index,regional]=await Promise.all([read(prefix+'/data/index.json'+suffix),read(prefix+'/data/regional.json'+suffix)]),end=await read(prefix+'/manifest');
      if(end.active!==manifest.active||end.revision!==manifest.revision)throw Error('A fonte mudou durante a auditoria. Confira novamente.');
      results.push({...root.PlatformAudit.election(index,manifest,office),regional:root.PlatformAudit.regions(regional,index)});
    }lastAudit={checkedAt:new Date().toISOString(),sources:results};const rows=$('platform-health-audit-results');rows.replaceChildren();
      for(const value of results){const item=document.createElement('p');item.dataset.tone=value.ok&&value.regional.ok?'ok':'error';item.textContent=(value.office==='estadual'?'Estadual':'Federal')+': '+value.municipalities+' municípios • '+new Intl.NumberFormat('pt-BR').format(value.votes)+' votos • '+value.regional.regions+' regiões • versão '+value.version+'. '+[...value.errors,...value.regional.errors].join(' ');rows.append(item);}
      $('platform-health-audit-status').textContent=results.every(value=>value.ok&&value.regional.ok)?'Conferência concluída: versões capturadas e totais reconciliados. Não verifica a situação individual de títulos.':'Foram encontradas divergências. Confira os avisos antes de usar os resultados.';
    }catch(e){$('platform-health-audit-results').replaceChildren();$('platform-health-audit-status').textContent=e.message;}finally{auditBusy=false;$('platform-health-audit').disabled=false;}
  }
  function diagnostics(){const data={interfaceVersion:VERSION,generatedAt:new Date().toISOString(),connection:navigator.onLine?'online':'offline',sourceAudit:lastAudit,registry:root.CrmWorkspace?.getAuditSummary?.()||null,offline:root.OfflineManager?.getState?.()||null};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'})),link=document.createElement('a');link.href=url;link.download='diagnostico_eleitoral_pa_'+VERSION+'.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  const unsafe=()=>{
    const s=root.CrmWorkspace?.getOperationalState?.()||{},offline=root.OfflineManager?.getState?.()||{};
    return s.busy||s.inflight||s.pending||s.conflicts||s.locationDrafts||offline.busy||$('crm-editor')?.open||$('crm-review')?.open||$('crm-conflicts-dialog')?.open||$('base-preview')?.hidden===false;
  };
  function render(){
    if(!$('platform-health-dialog')?.open)return;
    auditSummary();
    const state=context.getState(),crm=root.CrmWorkspace?.getOperationalState?.()||{},off=root.OfflineManager?.getState?.()||{},local=['localhost','127.0.0.1','::1'].includes(location.hostname),independent=crm.loginMode==='independent';
    $('platform-health-version').textContent='Interface '+VERSION;
    const environment=local?'Cópia local deste computador':independent?'Servidor independente configurado':'Base central do site';
    const entries=[['Ambiente',environment],['Conexão',navigator.onLine?'Online':'Offline'],['Base eleitoral',`${state.office||'estadual'} • 2026 • versão ${root.PlatformTools?.manifests.get(state.office)?.active||'aguardando carregamento'}`],['Fonte eleitoral',state.index?.source||'Aguardando carregamento'],['Base de lideranças',crm.unlocked?'Revisão '+crm.revision+' • '+crm.pending+' edições locais • '+crm.conflicts+' conflitos':'Protegida — desbloqueie para conferir a revisão'],['Armazenamento central','Cadastros no banco central; resumos eleitorais no armazenamento do servidor'],['Consultas reutilizadas',String(root.ElectionDataCache?.stats().hits||0)],['Dados temporários da consulta',((root.ElectionDataCache?.stats().estimatedBytes||0)/1048576).toLocaleString('pt-BR',{maximumFractionDigits:1})+' MB estimados • limite de 8 MB'],['Última conferência central',crm.unlocked&&crm.lastOnline?new Date(crm.lastOnline).toLocaleString('pt-BR'):'Não disponível nesta sessão'],['Preparo offline desta versão',off.preparedAt?new Date(off.preparedAt).toLocaleString('pt-BR'):'Ainda não preparado nesta versão']];
    $('platform-health-details').replaceChildren(...entries.map(([label,value])=>{const div=document.createElement('div'),dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=label;dd.textContent=value;div.append(dt,dd);return div;}));
    $('platform-health-environment').textContent=local?'Esta cópia tem banco e senha próprios. Para trabalhar na mesma base do Android e do site, use Abrir base central. Dados locais não são unidos automaticamente ao servidor.':'Neste endereço, os aparelhos autorizados consultam a mesma base central. Alterações feitas offline precisam ser revisadas e sincronizadas para aparecer nos demais aparelhos.';
    $('platform-health-central').hidden=!local;$('platform-health-refresh').disabled=!navigator.onLine||!crm.unlocked||crm.busy||crm.inflight;
    $('platform-health-apply').disabled=!newVersion||!!unsafe();if($('platform-health-clean'))$('platform-health-clean').disabled=!!unsafe();
  }
  function open(){if(!$('platform-health-dialog').open)$('platform-health-dialog').showModal();render();}
  async function check(){
    $('platform-health-status').textContent='Conferindo a versão disponível…';
    if(!navigator.onLine)return $('platform-health-status').textContent='Conecte à internet para procurar uma atualização.';
    try{
      const response=await fetch('/platform-release.json',{cache:'no-store',credentials:'same-origin'});if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error('Não foi possível conferir a atualização. Entre novamente e tente.');
      const release=await response.json();newVersion=release.version!==VERSION?release.version:'';
      const registration=await navigator.serviceWorker?.getRegistration?.();if(registration)await registration.update();
      $('platform-health-status').textContent=newVersion?'Versão '+newVersion+' disponível. '+(unsafe()?'Conclua as edições, conflitos ou importações antes de aplicar.':'Use Aplicar atualização para reabrir a plataforma.'):'A interface '+VERSION+' já corresponde à versão deste endereço. No Windows local, use o pacote novo e Atualizar.cmd para atualizar o programa.';
    }catch(e){$('platform-health-status').textContent=e.message;}render();
  }
  async function refresh(){
    try{await root.CrmWorkspace.refreshCentral();$('platform-health-status').textContent='Base central conferida. Edições locais foram preservadas.';}catch(e){$('platform-health-status').textContent=e.message;}render();
  }
  function apply(){if(unsafe())return $('platform-health-status').textContent='Conclua ou salve as edições e a importação antes de reabrir.';if(newVersion)location.reload();}
  function init(options){context=options;$('platform-health-audit')?.addEventListener('click',audit);$('platform-health-diagnostics')?.addEventListener('click',diagnostics);$('platform-health-open')?.addEventListener('click',open);$('platform-health-close')?.addEventListener('click',()=>$('platform-health-dialog').close());$('platform-health-check')?.addEventListener('click',check);$('platform-health-apply')?.addEventListener('click',apply);$('platform-health-refresh')?.addEventListener('click',refresh);$('platform-health-clean')?.addEventListener('click',()=>{if(unsafe())return;root.PlatformPerformance?.clear();$('platform-health-status').textContent='Dados temporários das consultas liberados. Cadastros, edições e cópias protegidas preservados.';render();});document.addEventListener('crm:state-change',()=>{if(!root.CrmWorkspace?.isUnlocked?.()){$('platform-health-quality')?.replaceChildren();if($('platform-health-backup'))$('platform-health-backup').textContent='';}render();});document.addEventListener('platform:source-change',render);root.addEventListener('online',render);root.addEventListener('offline',render);}
  root.PlatformHealth={init};
})(window);
