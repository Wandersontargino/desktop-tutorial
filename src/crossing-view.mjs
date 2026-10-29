import {createRegistryUtilizationView} from './registry-utilization-view.mjs';
import {groups,registryScope,registrySelection} from '../lib/group-partnership.mjs';
import {normalize} from '../lib/crm-model.mjs';
const $=id=>document.getElementById(id),P=window.PairedAnalysis,M=window.CrossingModel;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>n===null?'Sem cobertura':new Intl.NumberFormat('pt-BR').format(n),officeLabel={estadual:'Estadual',federal:'Federal'};
let api,bases=new Map(),loaded=null,result=null,job=0,controller,setupPromise,ready=false,manualCities=[],selectedSchools=[],registry=null,registryStamp=0;
let availableGroups=[],selectedGroups=new Set(),leaderAlerts=[],utilizationEntries=[],utilizationView;
const dataURL=(office,version,file)=>`/api/election/${office}/data/${file}?version=${encodeURIComponent(version)}`;
const displayed=c=>c[1]+' — '+c[2],sourceMode=()=> $('cross-source').value==='registry',activeSlots=()=> $('cross-mode').value==='first'?[0]:$('cross-mode').value==='second'?[1]:[0,1];
const select=(id,items,first)=>{const n=$(id),previous=n.value;n.replaceChildren(new Option(first,''),...items.map(([value,label])=>new Option(label,value)));n.value=items.some(([v])=>v===previous)?previous:'';};
async function json(path,signal){const r=await fetch(path,{credentials:'same-origin',signal,cache:path.endsWith('/manifest')?'no-store':'default'});if(!r.ok)throw Object.assign(new Error('Não foi possível carregar a base eleitoral. Confira a conexão ou a cópia offline.'),{status:r.status});return r.json();}
function install(){
  $('crossing-hub').innerHTML=`<div class="panel-heading"><div><p class="dashboard-kicker">Painel eleitoral · 2026</p><h2>Monte seu cruzamento</h2><p class="compact-note">Cargos, candidatos e território em uma única consulta.</p></div></div>
  <form id="cross-form">
    <div class="cross-toolbar"><label class="field"><span>Consultar</span><select id="cross-mode"><option value="both">Os dois candidatos</option><option value="first">Somente candidato 1</option><option value="second">Somente candidato 2</option></select></label><label class="field"><span>Tipo de cruzamento</span><select id="cross-source"><option value="votes">Somente votos</option><option value="registry">Cadastros × votos</option></select></label></div>
    <section id="cross-group-field" class="cross-registry-filter" aria-label="Seleção de lideranças e coordenador" hidden>
      <div class="cross-toolbar"><label class="field"><span>Lideranças / coordenação</span><select id="cross-group-mode"><option value="all">Todas as lideranças autorizadas</option><option value="manual">Selecionar várias lideranças</option><option value="coordinator">Por coordenador</option></select></label><label class="field" id="cross-coordinator-field" hidden><span>Coordenador</span><select id="cross-coordinator"><option value="">Escolha o coordenador</option></select></label></div>
      <details id="cross-group-picker" class="data-details" hidden><summary>Selecionar lideranças manualmente</summary><div class="school-picker-content"><label class="field"><span>Buscar liderança ou coordenador</span><input id="cross-group-search" type="search" autocomplete="off" placeholder="Digite um nome"></label><div class="button-row"><button type="button" class="button secondary" id="cross-group-mark">Marcar exibidas</button><button type="button" class="button secondary" id="cross-group-clear">Limpar seleção</button></div><fieldset class="school-picker-options"><legend class="sr-only">Lideranças disponíveis</legend><div id="cross-group"></div></fieldset></div></details>
      <p id="cross-group-summary" class="compact-note" role="status" aria-live="polite"></p><p class="compact-note">O relatório reúne o total do recorte e um resumo por liderança. Títulos repetidos contam uma vez no total.</p>
    </section>
    <div class="cross-candidates">${[0,1].map(i=>`<fieldset class="cross-candidate"><legend>Candidato ${i+1}</legend><label class="field"><span>Cargo do candidato ${i+1}</span><select id="cross-office-${i}"><option value="estadual" ${i?'':'selected'}>Deputado estadual</option><option value="federal" ${i?'selected':''}>Deputado federal</option></select></label><label class="field"><span>Nome ou número do candidato ${i+1}</span><input id="cross-candidate-${i}" type="search" list="cross-options-${i}" placeholder="Digite o nome ou número" autocomplete="off" disabled><datalist id="cross-options-${i}"></datalist></label></fieldset>`).join('')}</div>
    <p id="cross-pair-label" class="cross-pair-label" role="status"></p>
    <div class="cross-territory"><label class="field"><span>Região</span><select id="cross-region" disabled><option value="">Todas as regiões</option></select></label><label class="field"><span>Município</span><select id="cross-city" disabled><option value="">Todos do recorte</option></select></label></div>
    <details id="cross-city-picker" class="data-details"><summary>Selecionar municípios manualmente</summary><div class="school-picker-content"><label class="field"><span>Buscar município</span><input id="cross-city-search" type="search" placeholder="Nome do município" autocomplete="off"></label><p id="cross-city-count" class="compact-note" role="status"></p><fieldset class="school-picker-options"><legend class="sr-only">Municípios disponíveis</legend><div id="cross-city-options"></div></fieldset><div class="button-row"><button type="button" class="button primary" id="cross-city-apply">Aplicar municípios</button><button type="button" class="button secondary" id="cross-city-clear">Todos os municípios do recorte</button></div></div></details>
    <p id="cross-lock" class="compact-note" hidden>Abra a base protegida de cadastros para usar este modo. <button type="button" class="link-button" id="cross-unlock">Abrir cadastros</button></p>
    <div class="button-row"><button id="cross-run" type="submit" class="button primary" disabled>Consultar cruzamento</button><button id="cross-state-run" type="button" class="button secondary" disabled>Consultar todo o Pará</button></div>
  </form>
  <p id="cross-status" role="status" aria-live="polite">Preparando os seletores…</p>
  <section id="cross-output" hidden>
    <div class="cross-territory"><label class="field"><span>Zona</span><select id="cross-zone"><option value="">Todas as zonas</option></select></label><label class="field"><span>Seção</span><select id="cross-section"><option value="">Todas as seções</option></select></label><label class="field"><span>Local de votação / escola</span><select id="cross-place"><option value="">Todos os locais</option></select></label><label class="field"><span>Bairro</span><select id="cross-neighborhood"><option value="">Todos os bairros</option></select></label></div>
    <div id="cross-school-picker" class="territory-school-filter"></div><div class="button-row"><button id="cross-clear-filters" type="button" class="button secondary">Limpar filtros territoriais</button><button id="cross-pdf" type="button" class="button secondary">Gerar PDF</button><button id="cross-csv" type="button" class="button secondary">Exportar CSV</button></div>
    <p id="cross-filter-context" class="compact-note"></p><div id="cross-metrics" class="metric-grid"></div><p id="cross-reading" class="compact-note"></p><p id="cross-registry-quality" class="compact-note" hidden></p>
    <section id="cross-selected-schools" class="school-selection-results" hidden aria-label="Escolas selecionadas"></section>
    <div class="button-row cross-units" role="group" aria-label="Detalhamento do resultado">${[['municipality','Municípios'],['zone','Zonas'],['place','Locais de votação'],['section','Seções'],['neighborhood','Bairros']].map(([value,label])=>`<button type="button" class="button secondary" data-cross-unit="${value}" aria-pressed="${value==='zone'}">${label}</button>`).join('')}</div>
    <h3 id="cross-table-title">Resultado por zona</h3><div class="table-wrap cross-table" tabindex="0" role="region" aria-label="Resultado do cruzamento"><table><thead id="cross-head"></thead><tbody id="cross-body"></tbody><tfoot id="cross-total"></tfoot></table></div><p id="cross-table-note" class="compact-note"></p>
    <p id="cross-source-note" class="compact-note"></p><a href="https://dadosabertos.tse.jus.br/dataset/resultados-2026" target="_blank" rel="noopener noreferrer">Fonte oficial: resultados de 2026 do TSE</a>
  </section>`;
  $('cross-form').classList.add('dashboard-filter-panel');
  const output=$('cross-output'),heading=document.createElement('div');heading.className='dashboard-results-heading';
  heading.innerHTML='<div><h3>Visão do recorte</h3><p id="cross-result-scope">Indicadores dos candidatos e territórios consultados</p></div><div class="button-row" id="cross-export-actions"></div>';
  const actions=$('cross-clear-filters').parentElement,territorial=output.querySelector('.cross-territory'),refine=document.createElement('details');refine.className='dashboard-scope-panel';
  refine.innerHTML='<summary>Refinar por zona, escola, seção e bairro</summary>';
  output.prepend(heading,$('cross-metrics'));heading.querySelector('.button-row').append($('cross-pdf'),$('cross-csv'));
  refine.append(territorial,$('cross-school-picker'),actions,$('cross-filter-context'));$('cross-metrics').after(refine);
  const facts=document.createElement('div');facts.id='cross-comparison-facts';facts.className='dashboard-comparison-facts';refine.after(facts);
  const reach=document.createElement('section');reach.id='cross-reach';reach.className='dashboard-reach-panel';reach.hidden=true;
  reach.innerHTML='<div id="cross-reach-donut" class="dashboard-zone-donut" role="img"><div><strong id="cross-reach-percent"></strong><span>alcance estimado</span></div></div><div><h3 id="cross-reach-title">Alcance estimado da base</h3><p id="cross-reach-counts"></p><p id="cross-reach-note" class="compact-note"></p></div>';
  const alerts=document.createElement('details');alerts.id='cross-alerts';alerts.className='dashboard-scope-panel';alerts.hidden=true;
  alerts.innerHTML='<summary>Seções com teto zero e cobertura a conferir</summary><p id="cross-alert-counts" class="compact-note"></p><p class="compact-note">Rosa: teto agregado zero. Amarelo: dados sem cobertura completa ou local divergente. São situações da seção; não classificam o voto de pessoas cadastradas.</p><div class="button-row"><button type="button" class="button secondary" id="cross-alert-pdf">Gerar listagem PDF</button><button type="button" class="button secondary" id="cross-alert-csv">Exportar listagem CSV</button></div><div class="table-wrap cross-table" tabindex="0" role="region" aria-label="Seções com teto zero e cobertura a conferir"><table><thead id="cross-alert-head"></thead><tbody id="cross-alert-body"></tbody></table></div><p id="cross-alert-note" class="compact-note"></p>';
  const leaderPanel=document.createElement('section');leaderPanel.id='cross-alert-leaderships';leaderPanel.hidden=true;
  leaderPanel.innerHTML='<h4>Conferência por liderança</h4><p class="compact-note">Quantidades por liderança, mantendo separados teto zero, seções não calculadas e pendências cadastrais. Não some as linhas de grupos que compartilham seções ou cadastros. A relação nominal continua nos relatórios cadastrais.</p><div class="button-row"><button id="cross-alert-leadership-pdf" type="button" class="button primary">Relatório por liderança</button><button id="cross-alert-leadership-csv" type="button" class="button secondary">CSV por liderança</button></div><div class="table-wrap cross-table" tabindex="0" role="region" aria-label="Seções com teto zero por liderança"><table><thead id="cross-alert-leadership-head"></thead><tbody id="cross-alert-leadership-body"></tbody></table></div><p id="cross-alert-leadership-note" class="compact-note"></p>';
  alerts.querySelector('#cross-alert-counts').after(leaderPanel);
  const dashboard=document.createElement('div');dashboard.className='dashboard-panels';dashboard.id='cross-dashboard';dashboard.innerHTML=`
    <section class="dashboard-panel" aria-labelledby="cross-chart-title"><h3 id="cross-chart-title">Votos por zona</h3><p id="cross-chart-description">Mesma escala para os candidatos consultados.</p><div id="cross-chart-legend" class="dashboard-chart-legend"></div><div id="cross-bar-chart"></div></section>
    <section class="dashboard-panel" aria-labelledby="cross-zone-title"><h3 id="cross-zone-title">Seções por zona</h3><p>Distribuição das seções do recorte, incluindo as sem votos.</p><div id="cross-zone-donut" class="dashboard-zone-donut" role="img"><div><strong id="cross-zone-total"></strong><span>seções no filtro</span></div></div><div id="cross-zone-legend" class="dashboard-zone-legend"></div></section>`;
  const capacity=document.createElement('section');capacity.id='cross-utilization';capacity.className='registry-utilization-panel';capacity.hidden=true;
  const units=output.querySelector('.cross-units');facts.after(reach,capacity,alerts,$('cross-reading'),$('cross-registry-quality'),units,dashboard);
  utilizationView=createRegistryUtilizationView({container:capacity,getState:()=>result&&sourceMode()&&window.CrmWorkspace?.isUnlocked?.()?{result,entries:utilizationEntries}:null,onReport:()=>report('utilization'),onCSV:()=>{if(result&&sourceMode()&&window.CrmWorkspace?.isUnlocked?.())exportCsv(M.utilizationReport(result,reportOptions(true),['leaders','sections']),'aproveitamento_liderancas_2026.csv');}});
  const tablePanel=document.createElement('section');tablePanel.className='dashboard-table-panel';tablePanel.append($('cross-table-title'),$('cross-head').closest('.table-wrap'),$('cross-table-note'));dashboard.after($('cross-selected-schools'),tablePanel);
}
function invalidate(message='Escolhas alteradas. Use Consultar cruzamento para atualizar.'){
  utilizationEntries=[];utilizationView?.clear();leaderAlerts=[];$('cross-alerts').hidden=true;$('cross-alerts').open=false;$('cross-alert-leaderships').hidden=true;for(const id of ['cross-alert-counts','cross-alert-head','cross-alert-body','cross-alert-note','cross-alert-leadership-head','cross-alert-leadership-body','cross-alert-leadership-note'])$(id).replaceChildren();
  job++;controller?.abort();loaded=null;result=null;registry=null;$('cross-output').hidden=true;for(const id of ['cross-metrics','cross-head','cross-body','cross-total','cross-result-scope','cross-registry-quality','cross-source-note','cross-reading','cross-selected-schools','cross-comparison-facts','cross-bar-chart','cross-chart-legend','cross-zone-legend','cross-zone-total','cross-chart-description','cross-reach-percent','cross-reach-counts','cross-reach-note'])$(id).replaceChildren();$('cross-reach').hidden=true;$('cross-reach-donut').style.background='#e8edf6';$('cross-reach-donut').removeAttribute('aria-label');$('cross-zone-donut').style.background='#e8edf6';$('cross-zone-donut').setAttribute('aria-label','Consulta não preparada.');$('cross-pdf').disabled=true;$('cross-csv').disabled=true;$('cross-status').textContent=message;updateControls();
}
function pairLabel(){return [0,1].map(i=>officeLabel[$('cross-office-'+i).value]).join(' × ');}
function updateControls(){
  const active=activeSlots();[0,1].forEach(i=>{$('cross-office-'+i).disabled=!active.includes(i);$('cross-candidate-'+i).disabled=!ready||!active.includes(i);});
  const mode=$('cross-mode');for(const [i,value]of [[0,'first'],[1,'second']])mode.querySelector('option[value="'+value+'"]').textContent=sourceMode()?'Cadastros × '+officeLabel[$('cross-office-'+i).value]+' (candidato '+(i+1)+')':'Somente candidato '+(i+1);
  $('cross-pair-label').textContent=active.length===2?(sourceMode()?'Cadastros × ':'')+pairLabel():sourceMode()?'Cadastros × '+officeLabel[$('cross-office-'+active[0]).value]+' • candidato '+(active[0]+1):'Apuração individual do candidato '+(active[0]+1);
  const unlocked=!!window.CrmWorkspace?.isUnlocked?.();
  $('cross-group-field').hidden=!sourceMode();$('cross-lock').hidden=!sourceMode()||unlocked;$('cross-run').disabled=!ready||sourceMode()&&(!unlocked||!selection().ids.length);
  $('cross-group-mode').disabled=!unlocked;$('cross-coordinator').disabled=!unlocked;
  $('cross-state-run').hidden=sourceMode();$('cross-state-run').disabled=!ready;
}
function candidateOptions(i){
  const office=$('cross-office-'+i).value,base=bases.get(office);$('cross-options-'+i).replaceChildren(...[...(base?.statewide.candidates||[])].sort((a,b)=>a[2].localeCompare(b[2],'pt-BR')).map(c=>new Option(displayed(c),displayed(c))));
}
function candidate(i){const value=$('cross-candidate-'+i).value.trim(),list=bases.get($('cross-office-'+i).value)?.statewide.candidates||[],matches=list.filter(c=>displayed(c)===value||String(c[1])===value||P.normalize(c[2])===P.normalize(value));return matches.length===1?matches[0]:null;}
function cityList(){const base=bases.get('estadual'),region=$('cross-region').value;return (base?.regional.municipalities||[]).filter(c=>!region||String(c[2])===region).sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));}
function renderCities(){select('cross-city',cityList().map(c=>[String(c[0]),c[1]]),'Todos os municípios do recorte');$('cross-city').disabled=!ready||!!manualCities.length;renderCityPicker();}
let cityDraft=new Set(),pendingLegacy=null;
function renderCityPicker(){
  const q=P.normalize($('cross-city-search').value);$('cross-city-options').replaceChildren();
  for(const c of cityList().filter(c=>!q||P.normalize(c[1]).includes(q))){const label=document.createElement('label');label.className='municipality-choice';const input=document.createElement('input');input.type='checkbox';input.value=String(c[0]);input.checked=cityDraft.has(input.value);input.addEventListener('change',()=>{input.checked?cityDraft.add(input.value):cityDraft.delete(input.value);$('cross-city-count').textContent=cityDraft.size+' município(s) marcado(s)';});const name=document.createElement('span');name.textContent=c[1];label.append(input,name);$('cross-city-options').append(label);}
  $('cross-city-count').textContent=cityDraft.size+' município(s) marcado(s)'+(manualCities.length?' • seleção aplicada: '+manualCities.length:'');
}
function selection(){return registrySelection(availableGroups.flatMap(g=>g.records),{mode:$('cross-group-mode').value,ids:[...selectedGroups],coordinator:$('cross-coordinator').value});}
function matchingGroups(){const q=P.normalize($('cross-group-search').value);return availableGroups.filter(g=>!q||P.normalize(g.leadership+' '+g.coordinator).includes(q));}
function renderGroupSummary(){
  const mode=$('cross-group-mode').value,s=selection(),unlocked=!!window.CrmWorkspace?.isUnlocked?.();
  $('cross-coordinator-field').hidden=mode!=='coordinator';$('cross-group-picker').hidden=mode!=='manual';
  $('cross-group-summary').textContent=!unlocked?'Abra a base protegida para selecionar lideranças.':!s.ids.length?(mode==='coordinator'?'Escolha um coordenador para reunir suas lideranças.':'Marque pelo menos uma liderança para consultar.'):`${s.label} • ${s.ids.length} liderança(s)`+(mode==='all'?'':': '+s.groups.map(g=>g.leadership+' • '+(g.coordinator||'Sem coordenador')).join('; '));
  updateControls();
}
function renderGroupPicker(){
  $('cross-group').replaceChildren();const list=matchingGroups();
  for(const g of list){const label=document.createElement('label');label.className='municipality-choice';const input=document.createElement('input');input.type='checkbox';input.value=g.id;input.checked=selectedGroups.has(g.id);input.addEventListener('change',()=>{input.checked?selectedGroups.add(g.id):selectedGroups.delete(g.id);renderGroupSummary();invalidate();});const name=document.createElement('span');name.textContent=g.leadership+' • '+(g.coordinator||'Sem coordenador');label.append(input,name);$('cross-group').append(label);}
  if(!list.length){const note=document.createElement('p');note.className='compact-note';note.textContent='Nenhuma liderança encontrada.';$('cross-group').append(note);}
  $('cross-group-mark').disabled=!list.length;renderGroupSummary();
}
function registryGroups(){
  if(!window.CrmWorkspace?.isUnlocked?.()){registry=null;availableGroups=[];selectedGroups.clear();$('cross-group-search').value='';$('cross-group-picker').open=false;select('cross-coordinator',[],'Abra a base de cadastros');renderGroupPicker();return;}
  availableGroups=groups(window.CrmWorkspace.getRecords());selectedGroups=new Set([...selectedGroups].filter(id=>availableGroups.some(g=>g.id===id)));
  const coordinators=[...new Map(availableGroups.filter(g=>normalize(g.coordinator)).map(g=>[normalize(g.coordinator),g.coordinator])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
  select('cross-coordinator',coordinators,'Escolha o coordenador');renderGroupPicker();
}
async function setup(){
  if(setupPromise)return setupPromise;
  setupPromise=(async()=>{
    const manifests=await Promise.all(['estadual','federal'].map(o=>json(`/api/election/${o}/manifest`)));
    const changed=!ready||['estadual','federal'].some((o,i)=>bases.get(o)?.version!==manifests[i].active);if(!changed)return;
    const next=await Promise.all(['estadual','federal'].map(async(office,i)=>{const version=manifests[i].active,[statewide,regional,index]=await Promise.all(['statewide.json','regional.json','index.json'].map(f=>json(dataURL(office,version,f))));if(index.electionYear!==2026||index.office!==office||statewide.electionYear!==2026||statewide.office!==office||regional.office!==office||regional.currentElectionYear!==2026||!(index.turn===1||version==='bundled'&&index.turn==null&&index.title?.includes('1º turno de 2026'))||statewide.totalVotes!==index.totals.votes)throw Error('Ano, cargo ou total da fonte incompatível.');return {office,version,statewide,regional,index};}));
    if(JSON.stringify(next[0].regional.municipalities)!==JSON.stringify(next[1].regional.municipalities))throw Error('Os cargos usam territórios incompatíveis.');
    const first=!ready;bases=new Map(next.map(b=>[b.office,b]));ready=true;invalidate(first?'Escolha os candidatos e o tipo de cruzamento.':'A base foi atualizada. Consulte novamente para usar as versões atuais.');[0,1].forEach(candidateOptions);
    select('cross-region',next[0].regional.regions.map(r=>[String(r[0]),r[1]]),'Todas as regiões');$('cross-region').disabled=false;
    if(first){const s=api.getState();$('cross-region').value=s.regionFilter||'';if(s.cityCode==='__selected__'){const allowed=new Set(cityList().map(c=>String(c[0])));manualCities=(s.manualMunicipalityCodes||[]).filter(code=>allowed.has(String(code)));cityDraft=new Set(manualCities);}renderCities();if(cityList().some(c=>String(c[0])===String(s.cityCode)))$('cross-city').value=String(s.cityCode);if(s.candidate){const i=s.office==='federal'?1:0,c=bases.get(s.office)?.statewide.candidates.find(c=>String(c[0])===String(s.candidate[0]));if(c&&$('cross-office-'+i).value===s.office&&!$('cross-candidate-'+i).value)$('cross-candidate-'+i).value=displayed(c);}}
    renderCities();if(pendingLegacy){const legacy=pendingLegacy;pendingLegacy=null;fromLegacy(legacy.view,legacy.state);}updateControls();
  })().finally(()=>setupPromise=null);return setupPromise;
}
function currentSlots(){return [0,1].map(i=>activeSlots().includes(i)?{office:$('cross-office-'+i).value,candidate:candidate(i)}:null);}
function filters(){return {cities:loaded?.cities.map(c=>String(c[0]))||[],zone:$('cross-zone').value,section:$('cross-section').value,places:selectedSchools.length?selectedSchools:$('cross-place').value?[$('cross-place').value]:[],neighborhood:$('cross-neighborhood').value};}
let unit='zone';
function locationOptions(){
  const rows=loaded?.rows||[];select('cross-zone',[...new Set(rows.map(r=>r.zone))].sort((a,b)=>Number(a)-Number(b)).map(v=>[v,'Zona '+v]),'Todas as zonas');
  const zoneRows=rows.filter(r=>!$('cross-zone').value||r.zone===$('cross-zone').value);select('cross-section',[...new Set(zoneRows.map(r=>r.section))].sort((a,b)=>Number(a)-Number(b)).map(v=>[v,'Seção '+v]),'Todas as seções');
  const schoolMap=new Map(rows.map(r=>[P.placeKey(r),P.label(r,'place')]));select('cross-place',[...schoolMap].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')),'Todos os locais');$('cross-place').disabled=!!selectedSchools.length;
  select('cross-neighborhood',[...new Map(rows.map(r=>[P.neighborhoodKey(r),P.label(r,'neighborhood')]))].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR')),'Todos os bairros');
  window.SchoolPicker?.render($('cross-school-picker'),{options:[...schoolMap].map(([value,label])=>({value,label})),selected:selectedSchools,onApply:values=>{selectedSchools=values;for(const id of ['cross-zone','cross-section','cross-place','cross-neighborhood'])$(id).value='';locationOptions();render();}});
}
async function project(base,municipality,candidate,signal){
  try{const value=await json(`/api/election/${base.office}/projection?version=${encodeURIComponent(base.version)}&municipality=${municipality}&candidate=${candidate[0]}`,signal);if(value.year!==2026||value.office!==base.office||value.version!==base.version||String(value.municipality)!==municipality||String(value.candidate)!==String(candidate[0]))throw Error('Projeção incompatível com a consulta.');return value.rows;}
  catch(e){if(e.name==='AbortError'||[401,403].includes(e.status))throw e;const city=await json(dataURL(base.office,base.version,municipality+'.json'),signal);if(String(city.m?.[0])!==municipality)throw Error('Município incompatível.');return P.project(city,candidate[0],base.office);}
}
async function run(event){
  event?.preventDefault();try{await setup();}catch(e){$('cross-status').textContent=e.message;return;}
  const slots=currentSlots();if(slots.some(s=>s&&!s.candidate)){$('cross-status').textContent='Selecione o nome da lista ou o número exato de cada candidato utilizado.';return;}
  if(slots[0]&&slots[1]&&slots[0].office===slots[1].office&&String(slots[0].candidate[0])===String(slots[1].candidate[0])){$('cross-status').textContent='Escolha candidatos diferentes no mesmo cargo.';return;}
  if(sourceMode()&&!window.CrmWorkspace?.isUnlocked?.()){$('cross-status').textContent='Abra a base de cadastros para usar este modo.';updateControls();return;}
  const groupSelection=sourceMode()?selection():null;
  if(groupSelection&&!groupSelection.ids.length){$('cross-status').textContent='Selecione pelo menos uma liderança ou escolha um coordenador antes de consultar.';return;}
  const cities=cityList().filter(c=>manualCities.length?manualCities.includes(String(c[0])):!$('cross-city').value||String(c[0])===$('cross-city').value);if(!cities.length){$('cross-status').textContent='Escolha pelo menos um município disponível.';return;}
  controller?.abort();controller=new AbortController();const signal=controller.signal,id=++job,privateGeneration=registryStamp;
  const snapshot=slots.map(s=>s?bases.get(s.office):null),projected=[[],[]],tasks=cities.flatMap(c=>slots.flatMap((slot,i)=>slot?[[String(c[0]),i]]:[]));let next=0,done=0;
  $('cross-run').disabled=true;$('cross-state-run').disabled=true;$('cross-output').hidden=true;result=null;
  try{
    await Promise.all(Array.from({length:Math.min(3,tasks.length)},async()=>{while(next<tasks.length){const [city,i]=tasks[next++],rows=await project(snapshot[i],city,slots[i].candidate,signal);projected[i].push(...rows);if(id===job)$('cross-status').textContent=`Consultando ${cities.length} município(s) • ${Math.round(100*++done/tasks.length)}%`;}}));
    if(id!==job)return;if(sourceMode()&&(!window.CrmWorkspace?.isUnlocked?.()||privateGeneration!==registryStamp))throw Error('O acesso ou a base de cadastros mudou. Consulte novamente.');
    registry=groupSelection?registryScope(window.CrmWorkspace.getRecords(),groupSelection.ids):null;
    const countedIds=new Set(registry?.countedIds||[]);
    const groupScopes=groupSelection?.groups.map(g=>({leadership:g.leadership,coordinator:g.coordinator,registry:registryScope(g.records,g.id),utilizationRegistry:registryScope(g.records.filter(r=>countedIds.has(r.id)),g.id)}))||[];
    const selectedScopes=new Map(groupScopes.map(g=>[g.registry.id,g]));
    const overlapScopes=groupSelection?availableGroups.map(g=>selectedScopes.get(g.id)||{leadership:g.leadership,coordinator:g.coordinator,registry:registryScope(g.records,g.id)}):[];
    loaded={projected,slots,snapshot,cities,rows:P.join(...projected),groupLabel:groupSelection?.label,groupScopes,overlapScopes};selectedSchools=[];for(const id of ['cross-zone','cross-section','cross-place','cross-neighborhood'])$(id).value='';locationOptions();if(!sourceMode()&&slots.every(Boolean)&&slots[0].office!==slots[1].office)unit='municipality';$('cross-output').hidden=false;render();$('cross-status').textContent='Consulta concluída. Refine os mesmos resultados por zona, local, seção ou bairro.';
  }catch(e){if(id===job&&e.name!=='AbortError'){$('cross-status').textContent=e.message;api.toast?.(e.message,'error');}}
  finally{if(id===job)updateControls();}
}
function filterLabel(){return [$('cross-zone').value?'Zona '+$('cross-zone').value:'',$('cross-section').value?'Seção '+$('cross-section').value:'',...filters().places.map(v=>[...$('cross-place').options].find(o=>o.value===v)?.textContent||v),$('cross-neighborhood').value?$('cross-neighborhood').selectedOptions[0]?.textContent:''].filter(Boolean).join(' • ')||'Todos os locais dos municípios consultados';}
function stateCityCodes(){return (bases.get('estadual')?.regional.municipalities||[]).map(c=>String(c[0]));}
function voteTotals(){return result?M.voteTotals(result,{stateCityCodes:stateCityCodes()}):null;}
function reportOptions(includeGroups=false){const totals=voteTotals();return {stateCityCodes:stateCityCodes(),sources:loaded.slots.map((s,i)=>s?`Campo ${i+1}: ${loaded.snapshot[i].index.source} • versão ${loaded.snapshot[i].version}`:null),scope:totals?.statewide?'Todo o Pará • '+totals.municipalities+' municípios':loaded.cities.map(c=>c[1]).join(', '),filterLabel:filterLabel(),groupLabel:loaded.groupLabel,leadershipAlerts:includeGroups?leaderAlerts:[],utilizationEntries:includeGroups?utilizationEntries:[],registryGroups:(includeGroups?loaded.groupScopes:[]).map(g=>({leadership:g.leadership,coordinator:g.coordinator,total:g.registry.total,eligible:g.registry.eligible,pending:g.registry.pending,registered:M.evaluate({projected:loaded.projected,slots:loaded.slots,filters:filters(),registry:g.registry,registryMode:true,joined:loaded.rows}).metrics.registered}))};}
function signature(){return JSON.stringify([job,registryStamp,sourceMode(),$('cross-group-mode').value,$('cross-coordinator').value,[...selectedGroups].sort(),filters(),loaded?.slots,loaded?.snapshot.map(b=>b?.version)]);}
function render(){
  if(!loaded)return;if(sourceMode()&&!window.CrmWorkspace?.isUnlocked?.()){invalidate('A base de cadastros foi bloqueada. Abra a base para consultar novamente.');return;}
  result=M.evaluate({projected:loaded.projected,slots:loaded.slots,filters:filters(),registry,registryMode:sourceMode(),joined:loaded.rows});const m=result.metrics;
  leaderAlerts=sourceMode()?M.leadershipAlerts(result,loaded.groupScopes,loaded.rows):[];
  utilizationEntries=sourceMode()?M.leadershipUtilization(result,loaded.groupScopes,loaded.rows,loaded.overlapScopes):[];
  utilizationView?.render();
  const icons={votes:'M5 3h14v18H5zM8 8h8M8 12h5M8 16l2 2 5-5',registry:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',city:'M3 21V7h9v14M12 11h9v10M6 10h3M6 14h3M6 18h3M15 14h3M15 18h3',school:'M3 21V8h18v13M1 8l11-6 11 6M8 21v-6h8v6M6 11h3M15 11h3',section:'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z'};
  const card=(label,value,note='',tone='violet',icon='votes',id='')=>`<div class="metric-card" data-tone="${tone}"${id?' id="'+id+'"':''}><svg class="dashboard-metric-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[icon]}"/></svg><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`;
  const placeCount=new Set(result.rows.filter(P.placeVerified).map(P.placeKey)).size,cityCount=new Set(result.rows.map(r=>r.code)).size;
  const totals=voteTotals();
  $('cross-result-scope').textContent=totals?totals.totalLabel+' • '+totals.municipalities+' município(s) • compatibilidade estimada pela soma dos tetos de cada seção':'Indicadores dos candidatos e territórios consultados';
  $('cross-metrics').innerHTML=(totals?card('Votos compatíveis (teto estimado)',totals.upper===null?'Não calculado':fmt(totals.upper),totals.totalLabel+' • soma dos tetos por seção','blue','votes','cross-compatibility-total'):'')+loaded.slots.map((s,i)=>s?card('Votos • candidato '+(i+1),fmt(m[i?'b':'a']),M.name(s),i?'green':'violet'):'').join('')+(sourceMode()?card('Cadastros no filtro',fmt(m.registered),'Zona, seção e local confirmados','orange','registry'):'')+card('Municípios',fmt(cityCount),'Com seções neste resultado','blue','city')+card('Locais / escolas',fmt(placeCount),'Identificados na base de votação','pink','school')+card('Seções no filtro',fmt(m.sections),'Seções do recorte consultado','cyan','section');
  $('cross-comparison-facts').innerHTML=(loaded.slots.every(Boolean)?'<span>Diferença de votos • 2 − 1<strong>'+esc(fmt(m.difference))+'</strong></span>':'')+(m.cross&&sourceMode()?'<span>Teto agregado por seção<strong>'+esc(fmt(m.upper))+'</strong></span>':'')+(sourceMode()&&(m.cross||m.single)?'<span>Teto com cadastros<strong>'+esc(fmt(m.registryUpper))+'</strong></span>':'');
  const reach=M.reach(result);$('cross-reach').hidden=!reach;
  if(reach){
    $('cross-reach-title').textContent=M.reachLabel(result);
    const percent=reach.ratio===null?(reach.total?'Sem cobertura':'Sem base'):new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1}).format(reach.ratio);
    $('cross-reach-percent').textContent=percent;$('cross-reach-counts').textContent=fmt(reach.reached)+' de '+fmt(reach.total)+' cadastros • '+(reach.remaining===null?'restante indisponível':fmt(reach.remaining)+' fora do teto estimado');
    $('cross-reach-note').textContent='Teto com cadastros no recorte ÷ base contabilizável selecionada sem repetições, antes dos filtros. Estimativa agregada; não confirma votos individuais.';
    $('cross-reach-donut').style.background=reach.ratio===null?'#e8edf6':`conic-gradient(#008068 ${reach.ratio*360}deg, #e8edf6 0deg)`;
    $('cross-reach-donut').setAttribute('aria-label','Alcance estimado: '+percent+'. '+$('cross-reach-counts').textContent);
  }else{for(const id of ['cross-reach-percent','cross-reach-counts','cross-reach-note'])$(id).textContent='';$('cross-reach-donut').style.background='#e8edf6';$('cross-reach-donut').removeAttribute('aria-label');}
  $('cross-reading').textContent=M.note(result)+(m.missing?' '+m.missing+' seção(ões) sem cobertura; ausência não foi convertida em zero.':'');$('cross-filter-context').textContent=filterLabel();
  $('cross-registry-quality').hidden=!sourceMode();$('cross-registry-quality').textContent=registry?`${loaded.groupLabel} • ${loaded.groupScopes.length} liderança(s) • ${registry.total} registros no recorte • ${registry.eligible} cadastros contabilizáveis antes dos filtros • ${registry.pendingIncluded||0} contabilizados com pendência • ${registry.pending} fora da contagem • ${registry.repeated} repetições contadas uma vez • ${result.divergent} cadastros com local divergente da base de votação, fora da contagem do filtro.`:'';
  $('cross-source-note').textContent=reportOptions().sources.filter(Boolean).join(' • ');$('cross-pdf').disabled=false;$('cross-csv').disabled=false;
  const selected=filters().places,selectedPanel=$('cross-selected-schools');selectedPanel.hidden=!selected.length;selectedPanel.replaceChildren();
  if(selected.length){const title=document.createElement('h4');title.textContent=selected.length+' escola(s) selecionada(s) — votos por candidato';const wrap=document.createElement('div');wrap.className='table-wrap';const block=M.table(result,'place');wrap.innerHTML='<table><thead><tr>'+block.headers.map(v=>'<th>'+esc(v)+'</th>').join('')+'</tr></thead><tbody>'+tableRows(block)+'</tbody></table>';selectedPanel.append(title,wrap);}

  renderAlerts();renderTable();
}
function tableRows(block){return block.rows.slice(0,250).map((row,i)=>{const status=block.rowStatus?.[i],kind=status?.kind||'normal';return '<tr class="cross-row-'+kind+'"'+(status?.label?' title="'+esc(status.label)+'"':'')+'>'+row.map((t,j)=>'<td>'+esc(t)+(j===0&&kind!=='normal'?'<small class="cross-status-badge">'+(kind==='zero'?'Teto zero':'A conferir')+'</small>':'')+'</td>').join('')+'</tr>';}).join('');}
function renderAlerts(){
  $('cross-alert-leaderships').hidden=!sourceMode()||!M.hasSectionCeiling(result);
  for(const id of ['cross-alert-leadership-head','cross-alert-leadership-body','cross-alert-leadership-note'])$(id).replaceChildren();
  $('cross-alerts').hidden=!M.hasSectionCeiling(result);if(!M.hasSectionCeiling(result)){for(const id of ['cross-alert-counts','cross-alert-head','cross-alert-body','cross-alert-note'])$(id).replaceChildren();return;}
  const alerts=M.sectionAlerts(result),block=M.sectionAlertTable(result,[...alerts.zero,...alerts.missing],'Seções a conferir');
  $('cross-alert-counts').textContent=alerts.zero.length+' seção(ões) com teto zero'+(result.registryMode?' • '+fmt(alerts.zero.reduce((n,r)=>n+r.registered,0))+' cadastros nessas seções':'')+' • '+alerts.missing.length+' seção(ões) sem cobertura completa.';
  $('cross-alert-head').innerHTML='<tr>'+block.headers.map(t=>'<th scope="col">'+esc(t)+'</th>').join('')+'</tr>';$('cross-alert-body').innerHTML=tableRows(block);
  $('cross-alert-note').textContent=block.rows.length>250?'Mostrando 250 de '+block.rows.length+' seções. PDF e CSV incluem todas.':block.rows.length?'Listagem agregada do mesmo recorte e dos mesmos candidatos.':'Nenhuma seção com teto zero ou cobertura a conferir neste recorte.';
  if(sourceMode()){
    const summary=M.leadershipAlertSummary(leaderAlerts);
    $('cross-alert-leadership-head').innerHTML='<tr>'+summary.headers.map(t=>'<th scope="col">'+esc(t)+'</th>').join('')+'</tr>';
    $('cross-alert-leadership-body').innerHTML=tableRows(summary);
    $('cross-alert-leadership-note').textContent=leaderAlerts.length+' liderança(s) no mesmo recorte. O relatório detalha município, escola, zona, seção e motivo; não classifica o voto de cada eleitor.';
  }
}
function renderTable(){
  if(!result)return;const totals=voteTotals(),block=M.table(result,unit,{includeTotal:!!totals,totalLabel:totals?.totalLabel});$('cross-table-title').textContent=(totals?'Votos e compatibilidade por ':'Resultado por ')+({municipality:'município',zone:'zona',place:'local de votação',section:'seção',neighborhood:'bairro'}[unit]);
  $('cross-head').innerHTML='<tr>'+block.headers.map(t=>'<th scope="col">'+esc(t)+'</th>').join('')+'</tr>';$('cross-body').innerHTML=tableRows(block);$('cross-total').innerHTML=block.totalRow?'<tr>'+block.totalRow.map((t,i)=>i?'<td>'+esc(t)+'</td>':'<th scope="row">'+esc(t)+'</th>').join('')+'</tr>':'';$('cross-table-note').textContent=(block.rows.length>250?`Mostrando 250 de ${block.rows.length} linhas. PDF e CSV incluem todas.`:block.rows.length+' linha(s) do recorte')+(totals?' Compatíveis (teto): soma dos menores totais de cada seção; a última linha consolida todo o recorte.':'')+(M.hasSectionCeiling(result)?' Rosa: teto agregado zero. Amarelo: cobertura a conferir.':'');document.querySelectorAll('[data-cross-unit]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.crossUnit===unit)));renderDashboard();
}
function renderDashboard(){
  if(!result||!loaded)return;
  const groups=result.groups[unit],shown=groups.slice(0,8),colors=['#6840d7','#00806b'],label={municipality:'município',zone:'zona',place:'local de votação',section:'seção',neighborhood:'bairro'}[unit];
  $('cross-chart-title').textContent='Votos por '+label;
  $('cross-chart-description').textContent=groups.length>8?'Primeiros 8 de '+groups.length+' territórios em ordem alfabética e numérica. A tabela e os relatórios detalham o recorte.':'Mesma escala para os candidatos. Territórios em ordem alfabética e numérica.';
  $('cross-chart-legend').innerHTML=loaded.slots.map((slot,i)=>slot?`<span style="--series-color:${colors[i]}"><i></i>${esc(M.name(slot))}</span>`:'').join('');
  const max=Math.max(1,...shown.flatMap(g=>loaded.slots.flatMap((slot,i)=>slot&&g[i?'b':'a']!==null?[g[i?'b':'a']]:[])));
  $('cross-bar-chart').innerHTML=shown.length?shown.map(g=>`<div class="dashboard-bar-row"><strong>${esc(g.label)}</strong>${loaded.slots.map((slot,i)=>slot?`<div class="dashboard-bar-line" style="--series-color:${colors[i]}"><span>Candidato ${i+1}</span><div aria-hidden="true"><i style="width:${g[i?'b':'a']===null?0:100*g[i?'b':'a']/max}%"></i></div><b>${esc(g[i?'b':'a']===null?'—':fmt(g[i?'b':'a']))}</b></div>`:'').join('')}</div>`).join(''):'<p class="compact-note">Nenhum resultado para este recorte.</p>';
  const zoneColors=['#ef9900','#1763d8','#00806b','#7146db','#c32170','#087ba0','#8a99b0'],zones=result.groups.zone,parts=zones.slice(0,6).map(g=>({label:g.label,count:g.sections}));if(zones.length>6)parts.push({label:'Outras zonas',count:zones.slice(6).reduce((n,g)=>n+g.sections,0)});
  let cursor=0;const total=result.metrics.sections,segments=parts.map((part,i)=>{const start=cursor;cursor+=part.count/Math.max(1,total)*360;return `${zoneColors[i]} ${start}deg ${cursor}deg`;});
  $('cross-zone-donut').style.background=total?'conic-gradient('+segments.join(',')+')':'#e8edf6';$('cross-zone-total').textContent=fmt(total);$('cross-zone-donut').setAttribute('aria-label',total?parts.map(p=>p.label+': '+p.count+' seções').join('; '):'Nenhuma seção no recorte.');
  $('cross-zone-legend').innerHTML=parts.map((part,i)=>`<div style="--series-color:${zoneColors[i]}"><i></i><span>${esc(part.label)}</span><b>${fmt(part.count)} • ${new Intl.NumberFormat('pt-BR',{style:'percent',maximumFractionDigits:1}).format(part.count/Math.max(1,total))}</b></div>`).join('');
}
function report(defaultType=null){
  if(!result){api.toast?.('Consulte o cruzamento antes de gerar o relatório.','error');return;}
  defaultType||='summary';
  const stamp=signature(),options=reportOptions(true),defaultSections=[unit];
  const prepare=(report,filename)=>()=>{if(stamp!==signature()||sourceMode()&&!window.CrmWorkspace?.isUnlocked?.())throw Error('A consulta ou o acesso mudou. Prepare o relatório novamente.');return {report:typeof report==='function'?report():report,filename};};
  window.ReportCenter.open({private:sourceMode(),options:[
    {id:'territorial',label:'Selecionar conteúdo — municípios, zonas, locais…',description:'Escolha um ou vários quadros. O PDF mantém os candidatos e os filtros atuais e inclui somente os detalhamentos marcados.',sections:Object.entries(M.reportUnits).map(([id,label])=>({id,label})),defaultSections,
      prepare:(layout,sections=defaultSections)=>{if(stamp!==signature()||sourceMode()&&!window.CrmWorkspace?.isUnlocked?.())throw Error('A consulta ou o acesso mudou. Prepare o relatório novamente.');return {report:M.selectedReport(result,sections,options),filename:'cruzamento_'+sections.map(id=>({municipality:'municipios',zone:'zonas',place:'locais',section:'secoes',neighborhood:'bairros'}[id])).join('_')+'_2026.pdf'};}},
    ...(sourceMode()&&M.hasSectionCeiling(result)?[{id:'utilization',label:'Aproveitamento máximo — por liderança',description:'Cadastros, teto, percentual e diferença no recorte atual. Seções compartilhadas identificadas; o total único não soma as linhas das lideranças.',sections:[{id:'leaders',label:'Resumo por liderança'},{id:'sections',label:'Detalhar todas as seções do recorte'}],defaultSections:['leaders'],prepare:(layout,sections=['leaders'])=>{if(stamp!==signature()||!window.CrmWorkspace?.isUnlocked?.())throw Error('A consulta ou o acesso mudou. Prepare o relatório novamente.');return {report:M.utilizationReport(result,options,sections),filename:'aproveitamento_liderancas_2026.pdf'};}}]:[]),
    ...(voteTotals()?[{id:'vote-municipalities',label:'Compatibilidade por município e total',description:'Votos dos dois candidatos, compatibilidade estimada de cada município e total consolidado. Quando todo o estado foi consultado, identifica o Total do Pará.',prepare:prepare(()=>M.voteCompatibilityReport(result,options),'compatibilidade_por_municipio_2026.pdf')}]:[]),
    {id:'summary',singlePage:true,label:'Resumo simples — 1 página (A4)',description:'Totais, compatibilidade e indicadores de todo o recorte em uma folha. Listas extensas são consolidadas automaticamente, com destaques e os demais territórios agrupados; todos entram nos totais.',prepare:prepare(()=>M.summaryReport(result,options),'resumo_simples_cruzamento_2026.pdf')},
    {id:'crossing',label:'Cruzamento completo — todos os detalhamentos',description:'Inclui lideranças, municípios, zonas, locais de votação, seções e bairros. Escolha Enxuto para manter todas as linhas.',prepareSummary:prepare(()=>M.summaryReport(result,options),'resumo_simples_cruzamento_2026.pdf'),prepare:prepare(()=>M.report(result,options),'cruzamento_territorial_2026.pdf')},
    ...(M.hasSectionCeiling(result)?[{id:'zero',label:'Seções com teto zero e cobertura a conferir',description:'Município, escola, zona, seção, quantitativos e motivo. Dados agregados, sem classificar eleitores individualmente.',prepare:prepare(()=>M.sectionReport(result,options),'secoes_teto_zero_2026.pdf')},...(sourceMode()?[{id:'zero-leadership',label:'Teto zero e não calculados — por liderança',description:'Resumo e seções de cada liderança, com resultado consolidado final. Pendências e falta de cobertura ficam separadas de zero.',prepare:prepare(()=>M.leadershipAlertReport(result,options),'teto_zero_por_lideranca_2026.pdf')}]:[])]:[])
  ],defaultType,signature});
}
function exportCsv(report,filename){const quote=v=>'"'+String(v??'').replaceAll('"','""')+'"',d=report.dashboard,dashboard=d?[[report.dashboardTitle||'Alcance estimado da base'],['Base selecionada sem repetições',fmt(d.total)],['Teto com cadastros',fmt(d.reached)],['Alcance estimado (%)',d.ratio===null?(d.total?'Sem cobertura':'Sem base'):new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1}).format(d.ratio)]]:[],rows=[[report.title],[report.subtitle],...report.meta,...dashboard,[],[report.note],...report.blocks.flatMap(b=>[[],[b.title],b.headers,...b.rows]),...(report.finalResult?[[],[report.finalResult.title],[report.finalResult.summary],[report.finalResult.detail],...report.finalResult.items]:[])];api.download(filename,rows.map(r=>r.map(quote).join(';')).join('\r\n'));}
function csv(){if(result)exportCsv(M.report(result,reportOptions(true)),'cruzamento_territorial_2026.csv');}
function fromLegacy(view,state){if(!api)return;if(view==='comparison'&&!ready)pendingLegacy={view,state:{office:state.office,compareCandidateIds:[...(state.compareCandidateIds||[])]}};if(['analysis','partnership'].includes(view))$('cross-source').value='registry';if(view==='comparison')$('cross-source').value='votes';if(ready&&view==='comparison'){for(let i=0;i<2;i++){const c=bases.get(state.office)?.statewide.candidates.find(c=>String(c[0])===String(state.compareCandidateIds[i]||''));if(c){$('cross-office-'+i).value=state.office;candidateOptions(i);$('cross-candidate-'+i).value=displayed(c);}}}registryGroups();invalidate('Escolha os candidatos e use Consultar cruzamento para atualizar a central.');updateControls();}
function init(value){
  api=value;install();$('cross-form').addEventListener('submit',run);
  for(const i of [0,1]){$('cross-office-'+i).addEventListener('change',()=>{$('cross-candidate-'+i).value='';candidateOptions(i);invalidate();});$('cross-candidate-'+i).addEventListener('input',()=>invalidate());}
  $('cross-mode').addEventListener('change',()=>invalidate());$('cross-source').addEventListener('change',()=>{registryGroups();invalidate();});
  $('cross-group-mode').addEventListener('change',()=>{if($('cross-group-mode').value==='manual')$('cross-group-picker').open=true;renderGroupSummary();invalidate();});
  $('cross-coordinator').addEventListener('change',()=>{renderGroupSummary();invalidate();});$('cross-group-search').addEventListener('input',renderGroupPicker);
  $('cross-group-mark').addEventListener('click',()=>{for(const g of matchingGroups())selectedGroups.add(g.id);renderGroupPicker();invalidate();});
  $('cross-group-clear').addEventListener('click',()=>{selectedGroups.clear();renderGroupPicker();invalidate();});
  $('cross-region').addEventListener('change',()=>{manualCities=[];cityDraft.clear();renderCities();invalidate();});$('cross-city').addEventListener('change',()=>invalidate());$('cross-city-search').addEventListener('input',renderCityPicker);
  $('cross-city-picker').addEventListener('toggle',()=>{if($('cross-city-picker').open){cityDraft=new Set(manualCities);renderCityPicker();}});
  $('cross-city-apply').addEventListener('click',()=>{if(!cityDraft.size){$('cross-status').textContent='Marque pelo menos um município ou use Todos os municípios do recorte.';return;}manualCities=[...cityDraft];$('cross-city').value='';$('cross-city-picker').open=false;renderCities();invalidate(manualCities.length+' municípios selecionados. Use Consultar cruzamento.');});
  $('cross-city-clear').addEventListener('click',()=>{manualCities=[];cityDraft.clear();$('cross-city').value='';renderCities();invalidate();});$('cross-unlock').addEventListener('click',()=>api.showView('lists'));
  $('cross-state-run').addEventListener('click',()=>{if(sourceMode()||!ready)return;manualCities=[];cityDraft.clear();$('cross-region').value='';$('cross-city').value='';$('cross-city-search').value='';$('cross-city-picker').open=false;renderCities();invalidate('Preparando consulta de todo o Pará…');run();});
  for(const id of ['cross-zone','cross-section','cross-place','cross-neighborhood'])$(id).addEventListener('change',()=>{if(id==='cross-zone')$('cross-section').value='';if(id==='cross-place')selectedSchools=[];locationOptions();render();});
  $('cross-clear-filters').addEventListener('click',()=>{selectedSchools=[];for(const id of ['cross-zone','cross-section','cross-place','cross-neighborhood'])$(id).value='';locationOptions();render();});
  document.querySelectorAll('[data-cross-unit]').forEach(b=>b.addEventListener('click',()=>{unit=b.dataset.crossUnit;renderTable();}));$('cross-pdf').addEventListener('click',()=>report());$('cross-alert-leadership-pdf').addEventListener('click',()=>report('zero-leadership'));$('cross-alert-leadership-csv').addEventListener('click',()=>{if(result&&sourceMode()&&window.CrmWorkspace?.isUnlocked?.())exportCsv(M.leadershipAlertReport(result,reportOptions(true)),'teto_zero_por_lideranca_2026.csv');});$('cross-csv').addEventListener('click',csv);$('cross-alert-pdf').addEventListener('click',()=>report('zero'));$('cross-alert-csv').addEventListener('click',()=>{if(result&&M.hasSectionCeiling(result))exportCsv(M.sectionReport(result,reportOptions()),'secoes_teto_zero_2026.csv');});
  document.addEventListener('crm:state-change',()=>{registryStamp++;registryGroups();if(sourceMode()){window.ReportCenter?.clearPrivate?.();invalidate('A base ou o acesso aos cadastros mudou. Consulte novamente.');}});
  updateControls();
}
window.CrossingHub={init,activate:async()=>{try{await setup();registryGroups();}catch(e){$('cross-status').textContent=e.message;ready=false;updateControls();}},fromLegacy,report};
