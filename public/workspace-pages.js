(function(root){
  'use strict';
  const $=id=>document.getElementById(id);
  const areas={home:{label:'Início',view:'home'},cadastros:{label:'Cadastros',view:'lists'},cruzamentos:{label:'Cruzamentos',view:'paired'},resultados:{label:'Resultados',view:'results'},relatorios:{label:'Relatórios',view:'reports'},gestao:{label:'Gestão',view:'management'}};
  const pages={
    home:['home','inicio','Início'],menu:['','menu','Todas as áreas'],
    lists:['cadastros','cadastros/registros','Registros'],'quality-review':['cadastros','cadastros/qualidade','Qualidade e conferência'],operations:['gestao','gestao/saude','Saúde e backups'],'archived-records':['cadastros','cadastros/arquivados','Cadastros arquivados'],duplicates:['cadastros','cadastros/duplicidades','Duplicidades'],distribution:['cadastros','cadastros/distribuicao','Distribuição'],leadership:['cadastros','cadastros/mapa','Mapa das lideranças'],intake:['cadastros','cadastros/recebimentos','Recebimentos e importação'],
    partnership:['cruzamentos','cruzamentos/lideranca','Dupla × cadastros'],analysis:['cruzamentos','cruzamentos/candidato','Candidato × cadastros'],paired:['cruzamentos','cruzamentos/central','Central de cruzamentos'],
    results:['resultados','resultados/apuracao','Apuração por cargo'],overview:['resultados','resultados/candidato','Resumo do candidato'],xray:['resultados','resultados/cobertura','Cobertura e principais municípios'],comparison:['resultados','resultados/comparar','Apurações individuais'],territory:['resultados','resultados/zonas','Zonas e locais'],map:['resultados','resultados/mapa','Mapa eleitoral'],regional:['resultados','resultados/regioes','Regiões'],archive:['resultados','resultados/historico','Histórico e partidos'],
    quocients:['resultados','resultados/quocientes','Quocientes e vagas'],
    council:['resultados','resultados/conselho-tutelar','Conselho Tutelar 2023'],
    reports:['relatorios','relatorios','Central de relatórios'],management:['gestao','gestao','Gestão da plataforma'],base:['gestao','gestao/resultados','Importar resultados TSE'],'crm-settings':['gestao','gestao/cadastros','Backup e administração'],help:['gestao','gestao/ajuda','Ajuda e fontes']
  };
  const navigation={cadastros:[['lists','Registros'],['quality-review','Qualidade'],['archived-records','Arquivados'],['duplicates','Duplicidades'],['distribution','Distribuição'],['leadership','Mapa'],['intake','Recebimentos']],cruzamentos:[['paired','Central de cruzamentos']],resultados:[['results','Apuração'],['overview','Candidato',['overview','xray']],['paired','Comparar / cruzar'],['territory','Território',['territory','map','regional']],['archive','Histórico'],['quocients','Quocientes e vagas'],['council','Conselho Tutelar 2023']],gestao:[['management','Visão geral'],['operations','Saúde e backups'],['base','Resultados TSE'],['crm-settings','Backup e acessos'],['help','Ajuda']]};
  let api=null,current='home',historyNavigation=false;
  function route(){
    const value=root.location.hash.slice(1);
    const match=Object.entries(pages).find(([,p])=>value==='/'+p[1]);
    if(match)return match[0];
    if(value==='/cruzamentos/votacoes')return 'paired';
    const legacy={topo:'home',liderancas:'lists',analise:'analysis','raio-x':'xray',metodologia:'help'};
    return legacy[value]||'home';
  }
  function button(view,label){const b=document.createElement('button');b.type='button';b.dataset.view=view;b.textContent=label;return b;}
  function renderSectionNavigation(view){
    const page=pages[view],section=$('workspace-section-nav'),detail=$('workspace-detail-nav');
    if(!page||!section)return;
    section.replaceChildren();section.hidden=!navigation[page[0]];
    for(const [target,label,children] of navigation[page[0]]||[]){const b=button(target,label);b.setAttribute('aria-current',(children||[target]).includes(view)?'page':'false');section.append(b);}
    const detailItems=['overview','xray'].includes(view)?[['overview','Resumo'],['xray','Cobertura e Top 30']]:['territory','map','regional'].includes(view)?[['territory','Zona, seção e escola'],['map','Mapa dos municípios'],['regional','Resultados por região']]:[];
    detail.replaceChildren();detail.hidden=!detailItems.length;
    for(const [target,label]of detailItems){const b=button(target,label);b.setAttribute('aria-current',view===target?'page':'false');detail.append(b);}
  }
  function reportScope(){const gate=$('workspace-analysis-locked');if(gate)gate.hidden=!!root.CrmWorkspace?.isUnlocked?.();const node=$('workspace-report-scope');if(!node)return;const scope=root.CrmWorkspace?.getReportContext?.();node.textContent=scope?'Liderança: '+scope.leadership+' • Município: '+scope.municipality:'Abra a base para consultar o recorte dos relatórios de cadastros.';}
  function update(view){
    if(!pages[view])return;current=view;
    const [area,path,label]=pages[view];document.body.dataset.workspaceArea=area;
    for(const b of document.querySelectorAll('[data-workspace-area]'))b.setAttribute('aria-current',area&&b.dataset.workspaceArea===area?'page':'false');
    for(const b of document.querySelectorAll('#mobile-app-navigation [data-view]')){const target=pages[b.dataset.view]?.[0];b.setAttribute('aria-current',b.dataset.view===view||target&&target===area?'page':'false');}
    const crumb=$('workspace-breadcrumb');if(crumb){crumb.hidden=view==='home'||view==='menu';$('workspace-parent').textContent=areas[area]?.label||'Início';$('workspace-parent').dataset.view=areas[area]?.view||'home';$('workspace-current').textContent=label;}
    renderSectionNavigation(view);root.CrmWorkspace?.setPage?.(view);reportScope();
    // Intake invitation hashes and unrelated anchors carry their own context.
    // Never overwrite them while the form is in use.
    const intake=new URLSearchParams(root.location.hash.slice(1)).has('cadastro');
    if(!historyNavigation&&!intake&&root.location.hash!=='#/'+path){
      const url=root.location.pathname+root.location.search+'#/'+path;
      if(!root.location.hash||root.location.hash==='#topo')root.history.replaceState({workspaceView:view},'',url);
      else root.history.pushState({workspaceView:view},'',url);
    }
  }
  function navigateHistory(){const next=route();if(next===current)return;historyNavigation=true;try{api.showView(next);}finally{historyNavigation=false;}}
  function feedback(message){$('workspace-action-status').textContent=message;}
  function reportAction(action){
    if(action==='pendencies'){if(!root.CrmWorkspace?.openLeadershipPendenciesReport?.())feedback('Abra a base com sua senha para emitir o relatório.');else feedback('Um PDF com todas as lideranças autorizadas; cada uma começa em nova página. Escolha o tipo de pendência e prepare a prévia.');return;}
    if(action==='registrations'||action==='municipal'){
      if(!root.CrmWorkspace?.openRegistrationReport?.(action==='municipal'))feedback('Abra a base em Cadastros com sua senha para emitir o relatório.');else feedback('Escolha o tipo de listagem e prepare a prévia antes de baixar.');
      return;
    }
    if(action==='partnership'){api.showView('partnership');return;}
    if(action==='candidate'){
      const state=api.getState();api.showView('overview');
      if(state.candidate)api.report();else api.toast?.('Escolha um candidato e o território para gerar o relatório.');
    }
  }
  function init(value){
    api=value;
    const tools=document.querySelector('.app-access-toolbar');if(tools&&$('workspace-management-tools'))$('workspace-management-tools').append(tools);
    document.addEventListener('click',event=>{const b=event.target.closest?.('[data-workspace-action]');if(b)reportAction(b.dataset.workspaceAction);});
    root.addEventListener('popstate',navigateHistory);root.addEventListener('hashchange',navigateHistory);
    document.addEventListener('crm:state-change',()=>{reportScope();if(!root.CrmWorkspace?.isUnlocked?.())feedback('Os relatórios de cadastros exigem a base desbloqueada.');});
  }
  root.WorkspacePages={init,update,route,pages,areas};
})(window);
