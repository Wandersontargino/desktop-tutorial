(function(root){
  'use strict';
  const $=id=>document.getElementById(id),key='pa-home-shortcuts-v1',recentKey='pa-home-public-query-v1';
  const icons={
    xray:'<circle cx="10" cy="10" r="6"/><path d="m15 15 6 6M7 10h6M10 7v6"/>',
    comparison:'<path d="M3 20V7h6v13M15 20V3h6v17M1 22h22"/>',
    lists:'<circle cx="9" cy="7" r="3"/><path d="M3 21v-4a6 6 0 0 1 12 0v4M17 4a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5"/>',
    leadership:'<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
    analysis:'<path d="M8 4H5v18h14V4h-3M8 2h8v5H8zM8 12l2 2 5-5M8 18h7"/>',
    reports:'<path d="M5 2h9l5 5v15H5zM14 2v6h5M8 13h8M8 17h6"/>',
    results:'<path d="M4 20V12M10 20V4M16 20v-7M2 22h20"/>',
    map:'<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16M15 5v16"/>',
    territory:'<path d="M3 22V8h18v14M1 8l11-6 11 6M8 22v-6h8v6M7 11h2M15 11h2"/>',
    regional:'<path d="m3 8 8-5 10 5-8 5ZM3 12l10 5 8-5M3 16l10 5 8-5"/>',
    quocients:'<path d="M4 21V10h4v11M10 21V4h4v17M16 21v-7h4v7M2 22h20"/>',
    council:'<path d="M3 21V8h18v13M1 8l11-6 11 6M8 21v-6h8v6M7 11h2M15 11h2"/>',
    archive:'<path d="M4 5h16v17H4zM7 2v6M17 2v6M4 10h16M8 14h3M8 18h7"/>',
    paired:'<path d="M3 5h6v14H3zM15 5h6v14h-6zM9 12h6"/>',
    partnership:'<path d="M3 5h6v14H3zM15 5h6v14h-6zM9 12h6"/>',
    management:'<path d="M5 4h14v16H5zM8 8h8M8 12h8M8 16h4"/>',
    distribution:'<path d="M4 20V8M10 20V4M16 20v-7M2 22h20"/>',
    base:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>'
  };
  const actions=[
    ['xray','Raio-X','Votação do candidato','blue'],
    ['lists','Eleitores e lideranças','Consultar e editar','coral'],['leadership','Mapa das lideranças','Locais de referência','teal'],
    ['reports','Relatórios','Prévia antes de baixar','cyan'],
    ['results','Resultados 2026','Apuração oficial','blue'],['map','Mapa eleitoral','Votação no território','teal'],
    ['territory','Zonas e locais','Consulta detalhada','cyan'],['regional','Regiões','Municípios de cada região','teal'],
    ['archive','Eleições anteriores','Consultar histórico','violet'],['paired','Central de cruzamentos','Escolher cargos e território','violet'],
    ['quocients','Quocientes e vagas','Partidos e federações','blue'],
    ['council','Conselho Tutelar 2023','Escolas e votação de Ananindeua','violet'],
    ['base','Atualizar base','Importar e revisar','coral']
  ];
  actions.push(['management','Gestão','Backup, acesso e instalação','coral'],['distribution','Distribuição dos cadastros','Zonas, escolas e bairros','teal']);
  const defaults=['lists','distribution','paired','results','reports','management'];let favorites=defaults,api,recent=null;
  const icon=id=>'<svg viewBox="0 0 24 24" aria-hidden="true">'+icons[id]+'</svg>';
  function stored(name){try{return JSON.parse(localStorage.getItem(name)||'null');}catch{return null;}}
  function save(name,value){try{localStorage.setItem(name,JSON.stringify(value));}catch{}}
  function renderShortcuts(){
    const box=$('home-shortcuts');if(!box)return;box.replaceChildren();
    for(const id of favorites){const a=actions.find(a=>a[0]===id);if(!a)continue;const b=document.createElement('button');b.type='button';b.className='home-shortcut';b.dataset.homeAction=id;b.dataset.accent=a[3];b.innerHTML=icon(id)+'<strong></strong><small></small>';b.querySelector('strong').textContent=a[1];b.querySelector('small').textContent=a[2];box.append(b);}
    const options=$('home-favorite-options');options.replaceChildren();
    for(const [id,label]of actions){const l=document.createElement('label'),input=document.createElement('input'),s=document.createElement('span');input.type='checkbox';input.value=id;input.checked=favorites.includes(id);s.textContent=label;l.append(input,s);options.append(l);}
  }
  async function activate(id){
    if(id==='leadership'){root.CrmWorkspace?.openLeadershipMap?.();return;}
    if(id==='reports'){api.showView('reports');return;}
    api.showView(id);
  }
  function validRecent(value){return value&&['estadual','federal'].includes(value.office)&&['overview','xray','comparison','territory','regional'].includes(value.view)&&typeof value.candidate==='string'&&typeof value.city==='string';}
  function update(view){
    if(!api)return;const s=api.getState();
    if(['overview','xray','comparison','territory','regional'].includes(view)&&s.candidate&&s.cityCode){
      recent={office:s.office,city:String(s.cityCode),candidate:String(s.candidate[0]),view,name:api.candidateName(s.candidate)||s.candidate[2],number:s.candidate[1],region:s.regionFilter||'',candidateIds:s.compareCandidateIds.slice(0,2),zone:s.territoryZone||'',section:s.territorySection||'',place:s.territoryPlace||'',places:[...(s.territoryPlaces||[])],selectionPlaces:[...(s.selectionPlaces||[])],selectionPlace:s.selectionPlace||'',selectionPlaceSearch:s.selectionPlaceSearch||'',selectionMunicipality:s.selectionMunicipality||'',selectionZone:s.selectionZone||'',neighborhood:s.territoryNeighborhood||'',manualMunicipalityCodes:s.manualMunicipalityCodes.slice(0,144)};save(recentKey,recent);
    }
    $('home-recent-name').textContent=recent?recent.name+' · '+recent.number:'Sua próxima consulta começa aqui';
    $('home-recent-context').textContent=recent?(recent.office==='federal'?'Deputado federal':'Deputado estadual')+' · eleição 2026':'Busque um candidato pelo nome ou número acima.';
    $('home-resume').disabled=!recent;
    $('home-connection').textContent=navigator.onLine?'Online':'Offline';
    const summary=root.CrmWorkspace?.getHomeSummary?.();const box=$('home-private-summary');box.hidden=!summary;
    for(const button of box.querySelectorAll('[data-home-filter]'))button.disabled=!summary;
    for(const id of ['home-base-total','home-base-ready','home-base-priority','home-base-secondary','home-base-sync','home-base-uncounted'])$(id).textContent='';
    $('home-private-locked').hidden=Boolean(summary);$('home-uncounted-alert').hidden=!summary;
    if(summary){const fmt=new Intl.NumberFormat('pt-BR');const uncounted=Number(summary.uncounted)||0;$('home-base-uncounted').textContent=fmt.format(uncounted);$('home-show-uncounted').disabled=!uncounted;$('home-uncounted-alert').dataset.empty=String(!uncounted);$('home-base-total').textContent=fmt.format(summary.total);$('home-base-ready').textContent=fmt.format(summary.ready);$('home-base-priority').textContent=fmt.format(summary.pending);$('home-base-secondary').textContent=fmt.format(summary.complementary);$('home-base-sync').textContent=summary.changes+' alteração(ões) neste aparelho'+(summary.lastOnline?' · Conferência central: '+new Date(summary.lastOnline).toLocaleString('pt-BR'):'');}
  }
  function init(value){
    api=value;const saved=stored(key);if(Array.isArray(saved)){const list=[...new Set(saved.map(id=>['comparison','analysis','partnership'].includes(id)?'paired':id))].filter(id=>actions.some(a=>a[0]===id)).slice(0,6);if(list.length)favorites=list;}
    const old=stored(recentKey);if(validRecent(old))recent=old;
    renderShortcuts();
    $('home-customize').addEventListener('click',e=>{e.preventDefault();$('home-favorites').open=true;$('home-favorites').scrollIntoView?.({behavior:'smooth',block:'nearest'});$('home-favorites').querySelector('summary').focus();});
    $('home-essential-map').addEventListener('click',()=>activate('leadership').catch(err=>$('home-action-note').textContent=err.message));
    $('home-access-help').addEventListener('click',()=>$('access-help').click());
    $('home-shortcuts').addEventListener('click',e=>{const b=e.target.closest('[data-home-action]');if(b)activate(b.dataset.homeAction).catch(err=>$('home-action-note').textContent=err.message);});
    $('home-private-summary').addEventListener('click',e=>{
      const button=e.target.closest('[data-home-filter]');if(!button||button.disabled||!root.CrmWorkspace?.getHomeSummary?.())return;
      if(typeof root.CrmWorkspace.openHomeFilter!=='function'){$('home-action-note').textContent='A base ainda está carregando. Aguarde e tente novamente.';return;}
      root.CrmWorkspace.openHomeFilter(button.dataset.homeFilter);
    });
    $('home-favorite-options').addEventListener('change',e=>{const ids=[...$('home-favorite-options').querySelectorAll('input:checked')].map(i=>i.value);if(!ids.length||ids.length>6){e.target.checked=!e.target.checked;$('home-favorite-note').textContent='Escolha de 1 a 6 atalhos.';return;}favorites=[...favorites.filter(id=>ids.includes(id)),...ids.filter(id=>!favorites.includes(id))];const focused=e.target.value;save(key,favorites);renderShortcuts();$('home-favorite-options').querySelector('input[value="'+focused+'"]')?.focus();$('home-favorite-note').textContent='Atalhos salvos neste aparelho.';});
    $('home-favorite-reset').addEventListener('click',()=>{favorites=[...defaults];save(key,favorites);renderShortcuts();$('home-favorite-note').textContent='Seis atalhos iniciais restaurados.';});
    $('home-resume').addEventListener('click',async()=>{if(!recent)return;const q={...recent};try{$('home-resume').disabled=true;await api.query(q);}catch(e){$('home-action-note').textContent=e.message;}finally{update();}});
    document.addEventListener('crm:state-change',()=>update());root.addEventListener('online',()=>update());root.addEventListener('offline',()=>update());update();
  }
  root.AppHome={init,update};
})(window);
