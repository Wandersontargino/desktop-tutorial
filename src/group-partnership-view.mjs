import {ALL_LEADERSHIPS,analyzeAllLeaderships,groups,groupId,registryScope,analyzeRegistry,leadershipIndicators,leadershipOverlap,simulatePartnership,partnershipReport} from '../lib/group-partnership.mjs';
import Paired from '../public/paired-analysis.js';
const $=id=>document.getElementById(id),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const int=n=>n==null?'—':new Intl.NumberFormat('pt-BR').format(n),pct=n=>n==null?'—':(n*100).toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
const offices=['estadual','federal'];
const dataURL=(office,version,file)=>`/api/election/${office}/data/${file}?version=${encodeURIComponent(version)}`;
async function json(path){if(window.ElectionDataCache)return window.ElectionDataCache.load(path);const r=await fetch(path,{credentials:'same-origin'});if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw new Error('Base eleitoral indisponível. Conecte à internet ou prepare o uso offline.');return r.json();}

export function initGroupPartnership(context){
  const panel=document.createElement('details');panel.className='crm-tool crm-partnership';panel.id='crm-partnership-tool';
  panel.innerHTML=`<summary>Conferência da parceria Estadual × Federal</summary>
    <p class="compact-note">Escolha a liderança e a dupla trabalhada. Confira a compatibilidade dos cadastros e simule hipóteses de voto. Os indicadores não identificam escolhas individuais.</p>
    <div class="crm-form-grid">
      <label class="field crm-wide"><span>Grupo de trabalho</span><select id="crm-partnership-group"></select></label>
      ${offices.map(office=>`<label class="field"><span>Deputado ${office==='estadual'?'Estadual':'Federal'}</span><input id="crm-partnership-${office}" type="search" list="crm-partnership-${office}-options" placeholder="Digite o nome ou número" autocomplete="off" disabled><datalist id="crm-partnership-${office}-options"></datalist></label>`).join('')}
    </div>
    <div class="button-row"><button id="crm-partnership-save" class="button secondary" type="button" disabled>Salvar parceria declarada</button><button id="crm-partnership-reload" class="button secondary" type="button">Recarregar parceria central</button></div>
    <p id="crm-partnership-saved" class="compact-note"></p>
    <div class="crm-filter-grid">
      <label class="field"><span>Município</span><select id="crm-partnership-city"></select></label>
      <label class="field"><span>Zona</span><select id="crm-partnership-zone"></select></label>
      <label class="field"><span>Local de votação</span><select id="crm-partnership-place"></select></label>
      <label class="field"><span>Detalhar por</span><select id="crm-partnership-unit"><option value="zones">Zona</option><option value="places">Local de votação</option><option value="rows">Seção</option></select></label>
    </div>
    <div class="button-row"><button id="crm-partnership-run" class="button primary" type="button" disabled>Conferir parceria</button><button id="crm-partnership-all" class="button secondary" type="button" disabled>Conferir todas as lideranças</button><button id="crm-partnership-report" class="button secondary" type="button" disabled>Gerar relatório compacto</button></div>
    <p id="crm-partnership-status" role="status" aria-live="polite"></p>
    <section id="crm-partnership-results" hidden>
      <h4 id="crm-partnership-title"></h4><div id="crm-partnership-metrics" class="metric-grid"></div>
      <section id="crm-partnership-leaderships" hidden><h4>Conferência de todas as lideranças</h4><p class="compact-note">A mesma dupla é consultada em cada grupo, sem alterar as parcerias declaradas. Eleitores e seções compartilhados contam uma vez no total geral; não some os votos das linhas.</p><div class="table-scroll"><table class="data-table"><thead><tr><th>Liderança / coordenação</th><th>Ativos</th><th>Aptos no recorte</th><th>Fora da contagem</th><th>Estadual</th><th>Federal</th><th>Teto da dupla</th></tr></thead><tbody id="crm-partnership-leadership-body"></tbody></table></div></section>
      <p id="crm-partnership-reading" class="compact-note"></p>
      <details class="data-details"><summary id="crm-partnership-quality-summary">Cobertura, pendências e sobreposição</summary><div id="crm-partnership-quality" class="metric-grid"></div><p id="crm-partnership-overlap-note" class="compact-note"></p><ul id="crm-partnership-overlap-list"></ul></details>
      <div class="archive-dashboard"><article class="chart-card"><h4>Indicadores por zona</h4><label class="field"><span>Mostrar no gráfico</span><select id="crm-partnership-chart-mode"><option value="compatibility">Compatibilidade e proximidade (%)</option><option value="votes">Votos dos candidatos</option></select></label><p id="crm-partnership-chart-legend" class="compact-note"></p><div id="crm-partnership-chart"></div></article><article class="chart-card"><h4>Votação da dupla nas seções</h4><div id="crm-partnership-secondary" class="metric-grid"></div><p id="crm-partnership-correlation" class="compact-note"></p></article></div>
      <details class="data-details crm-scenario" id="crm-partnership-simulator"><summary>Simular votos na dupla e em apenas um candidato</summary><p class="compact-note">Informe quantidades hipotéticas para os cadastros deste recorte. A simulação confere os votos disponíveis em cada seção. Não estima probabilidades nem atribui escolhas a pessoas.</p><div class="crm-form-grid">${[['both','Nos dois candidatos'],['only-state','Somente estadual'],['only-federal','Somente federal']].map(([id,label])=>`<label class="field"><span>${label}</span><input id="crm-scenario-${id}" type="number" min="0" step="1" inputmode="numeric" placeholder="0" autocomplete="off"></label>`).join('')}<div class="field"><span>Nenhum dos dois / abstenção</span><output id="crm-scenario-remainder">—</output></div></div><div class="button-row"><button id="crm-scenario-test" class="button primary" type="button">Testar cenário</button><button id="crm-scenario-ceiling" class="button secondary" type="button">Usar teto possível</button><button id="crm-scenario-clear" class="button secondary" type="button">Limpar hipótese</button></div><p id="crm-scenario-status" role="status" aria-live="polite"></p><div id="crm-scenario-result" hidden><div id="crm-scenario-bar" class="crm-scenario-bar" role="img"></div><div id="crm-scenario-metrics" class="metric-grid"></div><p class="compact-note">Cenário informado pelo usuário e compatível com os limites disponíveis. A distribuição por seção é uma solução matemática possível, sem nomes de eleitores. A hipótese não é salva como voto dos cadastros.</p></div></details>
      <p class="table-scroll-hint">Deslize a tabela para ver as colunas.</p><div class="table-scroll" tabindex="0" role="region" aria-label="Votação agregada da parceria"><table class="data-table"><thead id="crm-partnership-head"></thead><tbody id="crm-partnership-body"></tbody></table></div>
      <details class="data-details"><summary>Critérios e fontes</summary><p id="crm-partnership-source" class="compact-note"></p><p class="compact-note">Entram cadastros com zona, seção e local de votação confirmados, mesmo com outras pendências. As pendências permanecem no cadastro. Locais não confirmados ficam fora do cálculo. Títulos válidos repetidos contam uma vez; conflitos de localização precisam de conferência. A situação oficial individual do título não foi consultada. Os votos incluem todos os eleitores das seções, inclusive pessoas de fora do grupo. A diferença de votos não informa sua origem. O limite compatível com cadastros soma o menor valor entre cadastros, votos estadual e federal em cada seção. Os indicadores não são probabilidades de acerto individual.</p></details>
    </section>`;
  $('crm-central').insertBefore(panel,$('crm-central').querySelector('.crm-filter-grid'));
  window.SearchableSelect?.attach($('crm-partnership-place'));
  let bases=[],registry=null,result=null,selectedPair=null,scenario=null,sourceSignature='',run=0,accessGeneration=0,loading=null,saving=false,renderStamp='',referencePending=true;
  const scenarioIds=['both','only-state','only-federal'];
  let recordRef=null,recordStamp='',groupCache=[];
  const recordSignature=()=>{const records=context.getRecords();if(records!==recordRef){recordRef=records;recordStamp=JSON.stringify(records.filter(r=>!r.deleted).map(r=>[r.id,r.version,r.name,r.title,r.zone,r.section,r.coordinator,r.leadership]));groupCache=groups(records);}return recordStamp;};
  const availableGroups=()=>{recordSignature();return groupCache;};
  const filters=()=>({city:$('crm-partnership-city').value,zone:$('crm-partnership-zone').value,place:$('crm-partnership-place').value});
  const currentGroup=()=> $('crm-partnership-group').value===ALL_LEADERSHIPS?{id:ALL_LEADERSHIPS,leadership:'Todas as lideranças autorizadas',coordinator:'Recorte geral'}:availableGroups().find(g=>g.id===$('crm-partnership-group').value);
  const currentSaved=()=>context.getPartnerships().find(p=>p.id===$('crm-partnership-group').value);
  const display=c=>`${c[1]} — ${window.CandidateIdentity?.ballot(c,c.office)||c[2]}`;
  const signature=()=>JSON.stringify([context.getUser()?.id,recordSignature(),currentSaved()?.version,$('crm-partnership-group').value,...offices.map(o=>$('crm-partnership-'+o).value),filters(),bases.map(b=>b.version),sourceSignature,scenarioIds.map(id=>$('crm-scenario-'+id).value),scenario?.ok||false]);
  let projectionController=null;
  function invalidate(){projectionController?.abort();projectionController=null;run++;result=null;selectedPair=null;clearScenario();$('crm-partnership-results').hidden=true;$('crm-partnership-leaderships').hidden=true;$('crm-partnership-leadership-body').replaceChildren();$('crm-partnership-report').disabled=true;}
  function options(id,items,label){const select=$(id),old=select.value;select.replaceChildren(new Option(label,''),...items.map(([v,t])=>new Option(t,String(v))));select.value=items.some(([v])=>String(v)===old)?old:'';}
  function fillFilters(){
    const group=currentGroup();registry=group?registryScope(context.getRecords(),group.id):null;
    const sections=registry?.sections||[],cities=[...new Map(sections.map(r=>[r.code,r.city])).entries()].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR'));
    const reference=context.getReferenceCity?.();
    if(reference?.code&&!cities.some(([code])=>code===reference.code))cities.push([reference.code,reference.name]);
    options('crm-partnership-city',cities,'Todos os municípios do grupo');
    if(referencePending){$('crm-partnership-city').value=reference?.code||'';referencePending=false;}
    const inCity=sections.filter(r=>!filters().city||r.code===filters().city),zones=[...new Set(inCity.map(r=>r.zone))].sort((a,b)=>Number(a)-Number(b));
    options('crm-partnership-zone',zones.map(z=>[z,'Zona '+z.padStart(3,'0')]),'Todas as zonas do recorte');
    const inZone=inCity.filter(r=>!filters().zone||r.zone===filters().zone),places=[...new Map(inZone.map(r=>[Paired.placeKey(r),r.place+' • '+r.city+' • '+r.neighborhood])).entries()];
    options('crm-partnership-place',places,'Todos os locais do recorte');
  }
  function selectSaved(){
    invalidate();const saved=currentSaved();
    offices.forEach(office=>$('crm-partnership-'+office).value='');
    offices.forEach((office,i)=>{const found=bases[i]?.data.candidates.find(c=>String(c[0])===saved?.[office]?.id&&String(c[1])===saved[office].number&&Paired.normalize(c[2])===Paired.normalize(saved[office].name));if(found)$('crm-partnership-'+office).value=display(Object.assign([...found],{office}));});
    $('crm-partnership-saved').textContent=saved?`Parceria declarada • versão ${saved.version} • ${new Date(saved.updatedAt).toLocaleString('pt-BR')} • ${saved.updatedBy||'responsável'}.`:'Nenhuma parceria declarada para este grupo. Selecione os dois candidatos e salve.';
    fillFilters();setButtons();
  }
  function refresh(){
    if(!context.getUser())return clear();
    const stamp=JSON.stringify([recordSignature(),context.getUser().id,context.getPartnerships(),context.getLeaderFilter()]);
    if(stamp===renderStamp){setButtons();return;}renderStamp=stamp;
    const old=$('crm-partnership-group').value,list=availableGroups();
    $('crm-partnership-group').replaceChildren(...list.map(g=>new Option(g.leadership+' • '+g.records.length+' cadastros • '+(g.coordinator||'Sem coordenador'),g.id)),new Option('Todas as lideranças autorizadas — contagem única',ALL_LEADERSHIPS));
    if(old===ALL_LEADERSHIPS||list.some(g=>g.id===old))$('crm-partnership-group').value=old;
    const byLeader=list.filter(g=>g.leadership===context.getLeaderFilter());if(byLeader.length===1)$('crm-partnership-group').value=byLeader[0].id;
    if($('crm-partnership-group').value!==old)resetGroupFilters();
    selectSaved();
    if(panel.open&&!bases.length&&!loading)setup();
  }
  function setButtons(){const accessible=!!context.getUser(),group=!!currentGroup();$('crm-partnership-run').disabled=!accessible||!group||bases.length!==2||saving||!!loading;$('crm-partnership-all').disabled=!accessible||!group||bases.length!==2||saving||!!loading;$('crm-partnership-save').disabled=$('crm-partnership-group').value===ALL_LEADERSHIPS||!accessible||!group||!context.canEdit()||!navigator.onLine||bases.length!==2||saving||!!loading;$('crm-partnership-reload').disabled=!accessible||!navigator.onLine||saving||!!loading;}
  async function setup(force=false){
    if(loading)return loading;
    if(!force&&bases.length===2)return;
    loading=(async()=>{
      const generation=accessGeneration,user=context.getUser()?.id;if(!user)return;
      $('crm-partnership-status').textContent='Carregando os candidatos da base ativa de 2026…';
      const next=await Promise.all(offices.map(async office=>{const manifest=await json(`/api/election/${office}/manifest`),[data,index]=await Promise.all(['statewide.json','index.json'].map(file=>json(dataURL(office,manifest.active,file))));if(data.electionYear!==2026||data.office!==office||index.electionYear!==2026||index.office!==office||!(index.turn===1||manifest.active==='bundled'&&index.turn==null&&index.title?.includes('1º turno de 2026'))||index.totals.votes!==data.totalVotes)throw new Error('Eleição, cargo ou total incompatível.');await window.CandidateIdentity?.load(office).catch(()=>null);return {office,version:manifest.active,data,source:index.source};}));
      if(!context.getUser()||context.getUser().id!==user||generation!==accessGeneration)return;
      bases=next;
      for(const b of bases){$('crm-partnership-'+b.office).disabled=false;$('crm-partnership-'+b.office+'-options').replaceChildren(...b.data.candidates.map(c=>new Option(display(Object.assign([...c],{office:b.office})),display(Object.assign([...c],{office:b.office})))));}
      selectSaved();$('crm-partnership-status').textContent=navigator.onLine?'Selecione a dupla trabalhada e pressione Conferir parceria.':'Consulta offline. Parcerias novas precisam ser salvas quando houver conexão.';
    })().catch(e=>{if(context.getUser())$('crm-partnership-status').textContent=e.message;}).finally(()=>{loading=null;setButtons();});setButtons();return loading;
  }
  function candidates(){
    return offices.map((office,i)=>{const value=$('crm-partnership-'+office).value.trim(),number=/^[\d .-]+$/.test(value)?value.replace(/\D/g,''):value,exact=value?bases[i]?.data.candidates.filter(c=>display(Object.assign([...c],{office}))===value||String(c[1])===number||Paired.normalize(c[2])===Paired.normalize(value)||Paired.normalize(window.CandidateIdentity?.ballot(c,office))===Paired.normalize(value)):[];if(exact?.length!==1)throw new Error('Escolha um candidato único da lista de '+office+'.');const c=exact[0];return {id:String(c[0]),number:String(c[1]),name:c[2]};});
  }
  async function savePair(){
    if($('crm-partnership-save').disabled)return;
    try{const group=currentGroup(),[estadual,federal]=candidates();saving=true;setButtons();const input={year:2026,turn:1,leadership:group.leadership,coordinator:group.coordinator,version:currentSaved()?.version||0,estadual,federal,sourceVersions:Object.fromEntries(bases.map(b=>[b.office,b.version])),operationId:crypto.randomUUID()};await context.savePartnership(input);if(!context.getUser())return;selectSaved();$('crm-partnership-status').textContent='Parceria declarada salva na base central.';}
    catch(e){if(context.getUser())$('crm-partnership-status').textContent=e.message;}
    finally{saving=false;setButtons();}
  }
  async function analyze(){
    if($('crm-partnership-run').disabled)return;
    invalidate();const epoch=run,user=context.getUser()?.id;
    try{
      const group=currentGroup(),[estadual,federal]=candidates();selectedPair={year:2026,turn:1,coordinator:group.coordinator,leadership:group.leadership,estadual,federal};fillFilters();
      if(!registry.sections.length)throw new Error('Este grupo ainda não tem cadastros com zona, seção e local confirmados. As pendências continuam na listagem geral.');
      const snapshot=bases.slice(),start=signature(),codes=[...new Set(registry.sections.filter(r=>!filters().city||r.code===filters().city).map(r=>r.code))],projected=[[],[]];
      if(!codes.length)throw new Error('Não há cadastros contabilizáveis no município escolhido. Os cadastros de outros municípios não entram nesta contabilidade.');
      $('crm-partnership-status').textContent='Conferindo as mesmas seções nos dois cargos…';$('crm-partnership-run').disabled=true;
      const controller=new AbortController();projectionController=controller;
      let next=0,done=0;await Promise.all(Array.from({length:Math.min(2,codes.length)},async()=>{while(next<codes.length){
        if(epoch!==run||controller.signal.aborted)return;
        const code=codes[next++],selected=registry.sections.filter(r=>r.code===code).map(r=>r.zone+'-'+r.section);
        for(let i=0;i<snapshot.length;i++){
          const b=snapshot[i],candidate=[estadual,federal][i];let rows=[];
          try{
            for(let offset=0;offset<selected.length;offset+=500){
              const path=`/api/election/${b.office}/projection?version=${encodeURIComponent(b.version)}&municipality=${code}&candidate=${candidate.id}&sections=${selected.slice(offset,offset+500).join(',')}`;
              const response=await fetch(path,{credentials:'same-origin',signal:controller.signal});
              if(!response.ok)throw Object.assign(new Error('Consulta resumida indisponível.'),{status:response.status});
              const value=await response.json();if(value.year!==2026||value.office!==b.office||value.version!==b.version||value.candidate!==candidate.id||value.municipality!==code)throw new Error('Consulta resumida incompatível.');rows.push(...value.rows);
            }
          }catch(error){
            if(error.name==='AbortError'||[401,403].includes(error.status))throw error;
            // Offline/independent copies keep using their prepared municipality data.
            const city=await json(dataURL(b.office,b.version,code+'.json'));
            if(String(city.m?.[0])!==code)throw new Error('Município divergente na base eleitoral.');
            const wanted=new Set(selected);rows=Paired.project(city,candidate.id,b.office).filter(r=>wanted.has(r.zone+'-'+r.section));
          }
          projected[i].push(...rows);
        }
        if(epoch===run)$('crm-partnership-status').textContent=`Conferindo seções: ${++done} de ${codes.length} municípios.`;
      }}));
      const after=await Promise.all(offices.map(office=>json(`/api/election/${office}/manifest`)));
      if(!context.getUser()||context.getUser().id!==user||epoch!==run)return;
      if(after.some((m,i)=>m.active!==snapshot[i].version))throw new Error('A base eleitoral mudou durante a consulta. Recarregue os candidatos e confira novamente.');
      if(signature()!==start)throw new Error('O grupo ou os filtros mudaram. Confira novamente.');
      sourceSignature=JSON.stringify(snapshot.map(b=>[b.office,b.version]));const joined=Paired.join(...projected);result=group.id===ALL_LEADERSHIPS?analyzeAllLeaderships(context.getRecords(),joined,filters()):analyzeRegistry(registry,joined,filters());if(group.id!==ALL_LEADERSHIPS)result.overlap=leadershipOverlap(context.getRecords(),registry,result.rows);renderResults();
      $('crm-partnership-status').textContent=result.missing?`${result.missing} seção(ões) sem votação e localização compatíveis nos dois cargos. Indicadores incompletos aparecem como “—”.`:'Conferência pronta. Resultados agregados das seções do grupo.';
    }catch(e){if(context.getUser()&&epoch===run){result=null;$('crm-partnership-results').hidden=true;$('crm-partnership-status').textContent=e.message;}}
    finally{setButtons();}
  }
  function renderResults(){
    if(!result||!context.getUser())return;
    $('crm-partnership-leaderships').hidden=!result.leaderships;
    $('crm-partnership-leadership-body').innerHTML=(result.leaderships||[]).map(g=>'<tr>'+[g.leadership+' • '+(g.coordinator||'Sem coordenação'),int(g.registry.total),int(g.registered),int(g.registry.pending),int(g.e),int(g.f),int(g.registryUpper)].map(v=>'<td>'+esc(v)+'</td>').join('')+'</tr>').join('');
    $('crm-partnership-results').hidden=false;$('crm-partnership-report').disabled=false;
    const saved=currentSaved(),declared=saved&&offices.every(o=>saved[o].id===selectedPair[o].id);
    $('crm-partnership-title').textContent=(declared?'Parceria declarada':'Consulta avulsa • parceria não salva')+' — '+selectedPair.leadership;
    const metrics=[['Cadastros únicos no recorte',int(result.registered)],['Compatibilidade máxima possível',result.compatibilityPercent==null?'—':'Até '+pct(result.compatibilityPercent),int(result.registryUpper)+' de '+int(result.registered)+' cadastros'],['Votos estadual nas seções',int(result.e)],['Votos federal nas seções',int(result.f)],['Proximidade territorial ponderada',pct(result.weightedProximity)],['Diferença para o teto da dupla',int(result.outsideCeiling),pct(result.deficitPercent)+' dos cadastros do recorte; sem atribuição individual']];
    $('crm-partnership-metrics').innerHTML=metrics.map(([label,value,note])=>`<div class="metric-card"><span>${label}</span><strong>${value}</strong>${note?'<small>'+esc(note)+'</small>':''}</div>`).join('');
    $('crm-partnership-secondary').innerHTML=[['Proximidade dos totais',pct(result.proximity)],['Proximidade por seção',pct(result.alignment)],['Coincidência territorial máxima',int(result.upper)],['Estadual acima do limite',int(result.aboveLimitE)],['Federal acima do limite',int(result.aboveLimitF)],['Diferença dos totais',int(result.gap)]].map(([label,value])=>`<div class="metric-card"><span>${label}</span><strong>${value}</strong></div>`).join('');
    $('crm-partnership-reading').textContent=`Recorte: ${int(result.registered)} cadastros únicos com localização confirmada em ${int(result.sections)} seções do recorte selecionado. Fora da contabilidade: ${int(result.outsideMunicipality)} cadastros em outros municípios e ${int(result.unknownMunicipality)} com município não identificado. A compatibilidade é um máximo teórico de ${int(result.registryUpper)} cadastros, não uma contagem confirmada de votos do grupo. Os votos exibidos são de todos os eleitores dessas seções. ${result.compatibilityPercent===1?'O teto de 100% indica apenas que as contagens disponíveis não impedem essa hipótese. ':''}A proximidade ponderada mede equilíbrio territorial, não adesão.`;
    const overlap=result.overlap;
    $('crm-partnership-quality-summary').textContent=`Cobertura: ${pct(result.coverage)} • ${int(registry.total)} cadastros ativos • ${int(registry.pendingIncluded||0)} contabilizados com pendência • ${int(registry.pending)} fora da contagem • ${int(overlap.sections)} seções compartilhadas`;
    $('crm-partnership-quality').innerHTML=[['Cadastros com votação e local compatíveis',int(result.matched)+' / '+int(result.registered)],['Contabilizados com pendência',int(registry.pendingIncluded||0)],['Fora da contagem',int(registry.pending)],['Repetições contadas uma vez',int(registry.repeated)],['Cadastros em seções compartilhadas',int(overlap.registered)]].map(([label,value])=>`<div class="metric-card"><span>${label}</span><strong>${value}</strong></div>`).join('');
    $('crm-partnership-overlap-note').textContent=overlap.sections?`${int(overlap.sections)} seções também contêm cadastros de ${int(overlap.leaders.length)} outros grupos visíveis ao seu perfil. Os votos dessas seções não podem ser atribuídos integralmente a cada liderança nem somados como entregas independentes.`:'Nenhuma seção compartilhada com outros grupos nos cadastros visíveis ao seu perfil. Isso não confirma a origem dos votos.';
    $('crm-partnership-overlap-list').innerHTML=overlap.leaders.slice(0,10).map(g=>'<li>'+esc(g.leadership+' • '+(g.coordinator||'Sem coordenador')+' • '+g.sections+' seções em comum')+'</li>').join('')+(overlap.leaders.length>10?'<li>Mais '+int(overlap.leaders.length-10)+' grupos com seções em comum.</li>':'');
    for(const id of scenarioIds){$('crm-scenario-'+id).max=String(result.registered);$('crm-scenario-'+id).disabled=!!result.missing;}
    $('crm-scenario-test').disabled=!!result.missing;$('crm-scenario-ceiling').disabled=result.registryUpper==null;
    $('crm-scenario-status').textContent=result.missing?'Complete a cobertura de votação e localização para testar cenários deste recorte.':'Preencha as três hipóteses ou use o teto possível como exemplo.';
    $('crm-partnership-correlation').textContent=result.correlation.r==null?'Correlação: '+result.correlation.reason:`Correlação de Pearson entre as seções: ${result.correlation.r.toLocaleString('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:3})} • ${result.correlation.n} seções. Mede associação entre as distribuições, não a origem dos votos.`;
    renderChart();
    $('crm-partnership-source').textContent=bases.map(b=>`${b.office==='estadual'?'Estadual':'Federal'} • ${b.source} • versão ${b.version}`).join(' | ');
    renderTable();
  }
  function renderChart(){
    if(!result)return;const compatibility=$('crm-partnership-chart-mode').value==='compatibility',maximum=compatibility?1:Math.max(1,...result.zones.flatMap(r=>[r.e||0,r.f||0]));
    $('crm-partnership-chart-legend').textContent=compatibility?'Azul: máximo possível nos cadastros • verde: proximidade ponderada da dupla. Escala de 0 a 100%.':'Azul: estadual • verde: federal. Votos de todos os eleitores das seções do grupo.';
    $('crm-partnership-chart').innerHTML=result.zones.slice(0,15).map(r=>`<div class="archive-chart-row"><strong>${esc(r.label)}</strong>${(compatibility?[['Máximo',r.compatibilityPercent,''],['Proximidade',r.weightedProximity,'federal']]:[['Estadual',r.e,''],['Federal',r.f,'federal']]).map(([label,value,cls])=>`<div class="archive-bar-line"><span>${label}</span><div class="archive-bar-track"><i class="${cls}" style="width:${(value||0)/maximum*100}%"></i></div><span>${compatibility?pct(value):int(value)}</span></div>`).join('')}</div>`).join('')+(result.zones.length>15?'<p class="compact-note">Primeiras 15 zonas no gráfico. A tabela e o relatório incluem todas as zonas do recorte.</p>':'');
  }
  function renderTable(){
    if(!result)return;const unit=$('crm-partnership-unit').value,rows=result[unit];
    $('crm-partnership-head').innerHTML='<tr>'+['Território','Cadastros','Estadual','Federal','Teto da dupla','Máximo possível (%)','Proximidade ponderada','Diferença'].map(s=>'<th>'+s+'</th>').join('')+'</tr>';
    $('crm-partnership-body').innerHTML=rows.map(r=>{const m=leadershipIndicators(r.rows||[r]);return '<tr>'+[r.label||Paired.label(r,'section'),int(r.registered),int(r.e),int(r.f),int(r.registryUpper),pct(m.compatibilityPercent),pct(m.weightedProximity),int(r.gap)].map((s,i)=>`<td class="${i?'number-cell':''}">${esc(s)}</td>`).join('')+'</tr>';}).join('');
  }
  function clearScenario(){scenario=null;scenarioIds.forEach(id=>{$('crm-scenario-'+id).value='';if(result)$('crm-scenario-'+id).max=String(result.registered);else $('crm-scenario-'+id).removeAttribute('max');});$('crm-scenario-remainder').textContent='—';$('crm-scenario-status').textContent='';$('crm-scenario-status').removeAttribute('data-tone');$('crm-scenario-result').hidden=true;$('crm-scenario-metrics').replaceChildren();$('crm-scenario-bar').replaceChildren();$('crm-scenario-bar').removeAttribute('aria-label');}
  function scenarioInput(){return Object.fromEntries(['both','onlyState','onlyFederal'].map((key,i)=>{const value=$('crm-scenario-'+scenarioIds[i]).value;return [key,/^\d+$/.test(value)?Number(value):NaN];}));}
  function editScenario(){
    scenario=null;$('crm-scenario-result').hidden=true;$('crm-scenario-metrics').replaceChildren();$('crm-scenario-bar').replaceChildren();$('crm-scenario-bar').removeAttribute('aria-label');$('crm-scenario-status').removeAttribute('data-tone');
    const input=scenarioInput(),sum=Object.values(input).reduce((n,v)=>n+v,0);$('crm-scenario-remainder').textContent=result&&Number.isSafeInteger(sum)&&sum<=result.registered?int(result.registered-sum):'—';
    $('crm-scenario-status').textContent='Hipótese alterada. Pressione Testar cenário para conferir os limites por seção.';
  }
  function testScenario(){
    if(!result||!context.getUser())return;
    scenario=simulatePartnership(result,scenarioInput());$('crm-scenario-status').dataset.tone=scenario.ok?'valid':'invalid';$('crm-scenario-result').hidden=!scenario.ok;
    if(!scenario.ok){$('crm-scenario-status').textContent=scenario.message;return;}
    $('crm-scenario-status').textContent='Cenário compatível com os limites disponíveis por seção. É uma hipótese informada, não uma estimativa apurada.';$('crm-scenario-remainder').textContent=int(scenario.neither);
    const entries=[['Nos dois candidatos',scenario.both,'#1262ae'],['Somente estadual',scenario.onlyState,'#7864b6'],['Somente federal',scenario.onlyFederal,'#148379'],['Nenhum / abstenção',scenario.neither,'#697b91']];
    $('crm-scenario-metrics').innerHTML=entries.map(([label,value,color])=>`<div class="metric-card"><span><i class="crm-scenario-dot" style="background:${color}"></i>${label}</span><strong>${int(value)} <small>(${pct(value/scenario.total)})</small></strong></div>`).join('');
    $('crm-scenario-bar').innerHTML=entries.filter(([,value])=>value>0).map(([,value,color])=>`<i style="width:${value/scenario.total*100}%;background:${color}"></i>`).join('');$('crm-scenario-bar').setAttribute('aria-label',entries.map(([label,value])=>label+': '+int(value)+' ('+pct(value/scenario.total)+')').join('; '));
  }
  function report(){
    if(!result||!context.getUser())return;const f=filters();f.cityName=$('crm-partnership-city').selectedOptions[0]?.textContent;f.placeName=f.place?$('crm-partnership-place').selectedOptions[0]?.textContent:'';
    const options=[{id:'partnership',label:'Compatibilidade da liderança — resumo compacto',description:'Percentuais, cobertura, sobreposição, gráficos e tabelas por município e zona. Sem nomes ou títulos de eleitores.',prepare:async()=>({report:partnershipReport(selectedPair,result,bases,f),filename:'COMPATIBILIDADE_LIDERANCA_PA_2026.pdf'})}];
    if(scenario?.ok)options.push({id:'scenario',label:'Compatibilidade + cenário hipotético',description:'Inclui a hipótese testada, com quantitativos, percentuais e gráfico de pizza. Não é resultado apurado.',prepare:async()=>({report:partnershipReport(selectedPair,result,bases,f,scenario),filename:'CENARIO_LIDERANCA_PA_2026.pdf'})});
    window.ReportCenter.open({signature,private:true,options});
  }
  function clear(){invalidate();recordRef=null;recordStamp='';groupCache=[];accessGeneration++;bases=[];registry=null;sourceSignature='';renderStamp='';panel.open=false;$('crm-partnership-simulator').open=false;for(const id of ['crm-partnership-group','crm-partnership-head','crm-partnership-body','crm-partnership-metrics','crm-partnership-chart','crm-partnership-secondary','crm-partnership-quality','crm-partnership-overlap-list','crm-partnership-estadual-options','crm-partnership-federal-options'])$(id).replaceChildren();for(const office of offices){$('crm-partnership-'+office).value='';$('crm-partnership-'+office).disabled=true;}for(const id of ['crm-partnership-title','crm-partnership-reading','crm-partnership-correlation','crm-partnership-saved','crm-partnership-source','crm-partnership-status','crm-partnership-overlap-note','crm-partnership-chart-legend'])$(id).textContent='';$('crm-partnership-quality-summary').textContent='Cobertura, pendências e sobreposição';['city','zone','place'].forEach(id=>$('crm-partnership-'+id).replaceChildren());setButtons();}
  panel.addEventListener('toggle',()=>{if(panel.open&&context.getUser())setup();});
  function resetGroupFilters(){referencePending=true;['city','zone','place'].forEach(id=>$('crm-partnership-'+id).value='');}
  $('crm-partnership-group').addEventListener('change',()=>{resetGroupFilters();selectSaved();});
  offices.forEach(o=>$('crm-partnership-'+o).addEventListener('input',invalidate));
  ['city','zone','place'].forEach(id=>$('crm-partnership-'+id).addEventListener('change',()=>{invalidate();fillFilters();}));
  $('crm-partnership-unit').addEventListener('change',renderTable);
  $('crm-partnership-chart-mode').addEventListener('change',renderChart);
  scenarioIds.forEach(id=>$('crm-scenario-'+id).addEventListener('input',editScenario));
  $('crm-scenario-test').addEventListener('click',testScenario);$('crm-scenario-clear').addEventListener('click',clearScenario);
  $('crm-scenario-ceiling').addEventListener('click',()=>{if(!result||result.registryUpper==null)return;scenarioIds.forEach((id,i)=>$('crm-scenario-'+id).value=String(i===0?result.registryUpper:0));testScenario();});
  $('crm-partnership-all').addEventListener('click',()=>{if($('crm-partnership-all').disabled)return;$('crm-partnership-group').value=ALL_LEADERSHIPS;invalidate();resetGroupFilters();fillFilters();setButtons();analyze();});
  $('crm-partnership-save').addEventListener('click',savePair);$('crm-partnership-run').addEventListener('click',analyze);$('crm-partnership-report').addEventListener('click',report);
  $('crm-partnership-reload').addEventListener('click',async()=>{if($('crm-partnership-reload').disabled)return;try{await context.refresh();refresh();await setup(true);}catch(e){$('crm-partnership-status').textContent=e.message;}});
  return {refresh,clear,setReferenceCity:()=>{resetGroupFilters();invalidate();fillFilters();},open:()=>{if(!context.getUser())return;panel.open=true;setup();},editorLabel:r=>{const saved=context.getPartnerships().find(p=>p.id===groupId(r));return saved?`Parceria declarada do grupo: estadual ${saved.estadual.number} — ${saved.estadual.name} • federal ${saved.federal.number} — ${saved.federal.name}.`:'Grupo sem parceria declarada. Configure a dupla na conferência da parceria.';}};
}
