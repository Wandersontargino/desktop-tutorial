(function(root){
  'use strict';
  const $=id=>document.getElementById(id),model=()=>root.ElectionArchiveModel;
  const cache=new Map();let api,data,previous,result,entity,epoch=0,tab='municipal',ready=false;
  const fmt=n=>new Intl.NumberFormat('pt-BR').format(n),pct=n=>n==null?'—':n.toLocaleString('pt-BR',{minimumFractionDigits:1,maximumFractionDigits:1})+'%';
  const filters=()=>({region:$('archive-region').value,municipality:$('archive-city').value,zone:$('archive-zone').value});
  const signature=()=>JSON.stringify([epoch,data?.electionYear,data?.office,data?.source.version,previous?.electionYear,filters(),$('archive-mode').value,$('archive-entity').value,data?.electionYear===2026?root.PlatformTools.manifests.get(data.office)?.active:null]);
  function option(value,label){return new Option(label,value);}
  async function json(path){if(root.ElectionDataCache)return root.ElectionDataCache.load(path);const response=await fetch(path,{credentials:'same-origin'});if(!response.ok||!response.headers.get('content-type')?.includes('application/json'))throw new Error('A base desta eleição não está disponível. Conecte à internet ou prepare o uso offline.');return response.json();}
  async function getData(year,office,run){
    if(year!==2026){const key=year+'|'+office;if(!cache.has(key))cache.set(key,json(`/history-data/${year}/${office}.json`).then(value=>model().validate(value,year,office)).catch(error=>{cache.delete(key);throw error;}));return cache.get(key);}
    const manifest=await root.PlatformTools.loadManifest(office),version=manifest.active,key='2026|'+office+'|'+version;
    if(cache.has(key))return cache.get(key);
    if(version==='bundled'){
      const pending=json(`/history-data/2026/${office}.json`).then(async value=>{model().validate(value,2026,office);const after=await root.PlatformTools.loadManifest(office);if(value.source.version!=='bundled'||after.active!=='bundled')throw new Error('A base ativa mudou. Selecione a eleição novamente para atualizar.');return value;}).catch(error=>{cache.delete(key);throw error;});cache.set(key,pending);while(cache.size>4)cache.delete(cache.keys().next().value);return pending;
    }
    const path=file=>`/api/election/${office}/data/${file}?version=${encodeURIComponent(version)}`;
    const pending=(async()=>{
      const [index,statewide,regional,metadata]=await Promise.all(['index.json','statewide.json','regional.json','candidate-parties-2026.json'].map(file=>json(path(file))));
      const summary=model().createCurrentSummary(index,statewide,regional,metadata,version);let done=0;
      for(let offset=0;offset<index.municipalities.length;offset+=3){
        if(run!==epoch)throw new Error('Consulta substituída por outra eleição.');
        const cities=await Promise.all(index.municipalities.slice(offset,offset+3).map(([code])=>json(path(code+'.json'))));
        for(let i=0;i<cities.length;i++){summary.addCity(cities[i]);cities[i]=null;}
        done+=cities.length;if(run===epoch)$('archive-status').textContent=`Conferindo a base ativa de 2026: ${done} de ${index.municipalities.length} municípios…`;
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      const after=await root.PlatformTools.loadManifest(office);if(after.active!==version)throw new Error('A base de 2026 mudou durante a consulta. Selecione a eleição novamente para atualizar.');
      return summary.finish();
    })().catch(error=>{cache.delete(key);throw error;});cache.set(key,pending);while(cache.size>4)cache.delete(cache.keys().next().value);return pending;
  }
  function syncYears(){
    const selected=Number($('archive-year').value),years=model().yearsForOffice($('archive-office').value);
    $('archive-year').replaceChildren(...years.map(year=>option(String(year),year===2026?'2026 — base ativa':String(year))));
    $('archive-year').value=String(years.includes(selected)?selected:years[0]);
  }
  function fillTerritory(reset=false){
    const f=reset?{}:filters();$('archive-region').replaceChildren(option('','Todas as 13 regiões'),...data.regions.map(([id,name])=>option(id,name)));$('archive-region').value=f.region||'';
    const cities=data.municipalities.filter(row=>!$('archive-region').value||String(row[2])===$('archive-region').value);
    $('archive-city').replaceChildren(option('','Todos os municípios do recorte'),...cities.map(([id,name])=>option(String(id),name)));
    const local=data.office==='vereador'&&$('archive-mode').value==='candidate',preferred=f.municipality||String(api?.getState?.().cityCode||'4154');
    if(local)$('archive-city').options[0].disabled=true;
    $('archive-city').value=cities.some(row=>String(row[0])===f.municipality)?f.municipality:local?(cities.find(row=>String(row[0])===preferred)||cities[0])?.[0]||'':'';
    fillZones(reset?'':f.zone);
  }
  function fillZones(value=$('archive-zone').value){
    const allowed=new Set(model().scopeMunicipalities(data,filters()).map(row=>String(row[0]))),zones=[...new Set(data.zones.filter(row=>allowed.has(String(row[0]))).map(row=>String(row[1])))].sort((a,b)=>Number(a)-Number(b));
    $('archive-zone').replaceChildren(option('','Todas as zonas'),...zones.map(zone=>option(zone,'Zona '+zone.padStart(3,'0'))));$('archive-zone').value=zones.includes(value)?value:'';
  }
  function fillEntities(preserve=true){
    const old=preserve?$('archive-entity').value:'',mode=$('archive-mode').value,term=model().normalize($('archive-search').value);
    const items=model().entities(data,mode,filters()).filter(item=>!term||model().normalize(item.label+' '+(item.fullName||'')).includes(term));
    $('archive-entity').replaceChildren(...items.map(item=>option(item.id,`${item.label} • ${fmt(item.votes)} votos ${data.office==='vereador'?($('archive-city').value?'no município':'no recorte'):'no Pará'}`)));
    if(items.some(item=>item.id===old))$('archive-entity').value=old;
    $('archive-search').placeholder=mode==='candidate'?'Digite o nome de urna, nome completo ou número':mode==='party'?'Digite a sigla ou o nome do partido':'Digite a sigla ou o nome da federação';
    $('archive-search-label').textContent=mode==='candidate'?'Buscar candidato':'Buscar '+(mode==='party'?'partido':'federação');
    $('archive-entity-label').textContent=mode==='candidate'?'Candidato':mode==='party'?'Partido':'Federação';
    const missing=data.candidates.filter(candidate=>!candidate.party).length;
    $('archive-metadata-note').textContent=missing?`${fmt(missing)} candidatura(s) da versão ativa sem partido confirmado. Consulte-as por candidato; elas não são atribuídas a um partido por suposição.`:mode==='candidate'?'':mode==='party'?'Soma dos votos nominais dos candidatos do partido na eleição selecionada. Não inclui votos de legenda nem calcula cadeiras.':'Soma dos votos nominais dos candidatos da federação na eleição selecionada. Não inclui votos de legenda nem coligações.';
    render();
  }
  async function load(reset=true){
    const run=++epoch,year=Number($('archive-year').value),office=$('archive-office').value;
    data=null;previous=null;result=null;entity=null;$('archive-result').hidden=true;$('archive-pdf').disabled=true;$('archive-csv').disabled=true;$('archive-status').textContent='Carregando e conferindo a eleição selecionada…';
    for(const id of ['archive-region','archive-city','archive-zone','archive-mode','archive-search','archive-entity','archive-previous-year'])$(id).disabled=true;
    try{
      const value=await getData(year,office,run);if(run!==epoch)return;data=value;fillTerritory(reset);if(reset)$('archive-search').value='';
      const years=model().yearsForOffice(office).filter(y=>y<year);$('archive-previous-year').replaceChildren(option('','Sem comparação'),...years.map(y=>option(String(y),String(y))));$('archive-previous-year').value=years.length?String(years[0]):'';
      let prior=null,comparisonError='';
      if(years.length)try{prior=await getData(years[0],office,run);}catch(error){comparisonError=error.message;}
      if(run!==epoch)return;previous=prior;
      for(const id of ['archive-region','archive-city','archive-zone','archive-mode','archive-search','archive-entity'])$(id).disabled=false;
      fillEntities(!reset);$('archive-status').textContent=`${year} • 1º turno • ${model().officeName(office)} • ${fmt(data.candidates.length)} candidaturas • 144 municípios • ${fmt(data.totalVotes)} votos nominais no Pará.`+(comparisonError?' Comparação indisponível: '+comparisonError:'');
    }catch(error){if(run!==epoch)return;data=null;$('archive-result').hidden=true;$('archive-status').textContent=error.message;}
  }
  async function loadPrevious(){
    if(!data)return;const run=++epoch,year=Number($('archive-previous-year').value);previous=null;$('archive-result').hidden=true;$('archive-pdf').disabled=true;$('archive-csv').disabled=true;$('archive-status').textContent='Conferindo a eleição de comparação…';
    try{const prior=year?await getData(year,data.office,run):null;if(run!==epoch)return;previous=prior;render();$('archive-status').textContent=`Consulta de ${data.electionYear} • ${model().officeName(data.office)} • 1º turno.`;}catch(error){if(run===epoch){previous=null;render();$('archive-status').textContent=error.message+' A consulta continua sem comparação.';}}
  }
  function render(){
    if(!data)return;
    const mode=$('archive-mode').value;entity=model().entities(data,mode,filters()).find(item=>item.id===$('archive-entity').value);
    $('archive-result').hidden=!entity;$('archive-pdf').disabled=!entity;$('archive-csv').disabled=!entity;$('archive-previous-year').disabled=mode!=='candidate';
    if(!entity){$('archive-metadata-note').textContent='Nenhum resultado corresponde à busca nesta eleição e neste tipo de consulta.';return;}
    result=model().compare(data,entity,filters(),mode==='candidate'?previous:null);
    $('archive-name').textContent=entity.label;$('archive-context').textContent=`${data.electionYear} • ${model().officeName(data.office)} • 1º turno • Pará`;
    const local=data.office==='vereador'&&mode==='candidate';
    if(local)tab='zones';
    for(const button of document.querySelectorAll('[data-archive-tab]'))button.hidden=local&&button.dataset.archiveTab!=='zones';
    if(local)$('archive-context').textContent+=' • '+data.municipalities.find(row=>String(row[0])===entity.municipality)?.[1];
    $('archive-votes').textContent=fmt(result.total);$('archive-share').textContent=pct(result.share);$('archive-coverage-label').textContent=local?'Zonas com votos':'Municípios com votos';$('archive-coverage-note').textContent=local?'com votos / zonas do recorte':'com votos / municípios do recorte';$('archive-coverage').textContent=local?`${fmt(result.zoneCoverage)} / ${fmt(result.zoneCount)}`:`${fmt(result.coverage)} / ${fmt(result.municipalities)}`;
    $('archive-summary').textContent=model().summary(data,entity,result,filters());
    const info=entity.candidates.length===1?entity.candidates[0]:null;$('archive-party-info').textContent=info?[info.party?.sigla||'Partido não confirmado',info.federation?.name,info.fullName].filter(Boolean).join(' • '):`${fmt(entity.candidates.length)} candidaturas neste grupo`;
    $('archive-change-card').hidden=!result.comparisonAvailable;$('archive-change-label').textContent=`Variação em votos e % • ${result.previousYear} → ${data.electionYear}`;$('archive-change').textContent=model().voteChange(result.total,result.previous).label;$('archive-change').className=model().voteChange(result.total,result.previous).className;
    $('archive-comparison-note').textContent=mode!=='candidate'?'Compare partidos e federações consultando cada ano separadamente. A comparação automática desta área usa a identidade do candidato.':!previous?'Selecione uma eleição anterior para comparar.':!result.matched?`Sem correspondência única pelo nome completo neste cargo${local?' e município':''}. Não é possível afirmar, apenas com essa ausência, que foi a primeira candidatura.`:!result.comparisonAvailable?'A zona selecionada não tem cobertura equivalente na base anterior. O dado ausente não foi tratado como zero.':`Correspondência única pelo nome completo em ${previous.electionYear}${local?' no mesmo município':''}. Número e partido podem mudar. Comparação de zonas usa município e código; limites territoriais podem mudar entre eleições.`;
    renderCharts();renderTable();renderSources();
  }
  function renderCharts(){
    const local=data.office==='vereador'&&!!entity.municipality,distribution=local?result.zones:result.regional;
    $('archive-chart-title').textContent=local?'Votação por zona':'Municípios com mais votos';$('archive-pie-title').textContent=local?'Distribuição por zona':'Distribuição por região';$('archive-pie-note').textContent=local?'Percentual dos votos do candidato em cada zona do município.':'Percentual dos votos desta consulta em cada região.';
    const rows=(local?result.zones:result.municipal).slice(0,10),maximum=Math.max(1,...rows.flatMap(row=>[row.votes,row.previous||0]));
    $('archive-chart-legend').textContent=result.comparisonAvailable?`${data.electionYear} (azul) × ${result.previousYear} (cinza)`:`Votos nominais • ${data.electionYear}`;
    $('archive-chart').replaceChildren();
    for(const row of rows){const box=document.createElement('div');box.className='archive-chart-row';const label=document.createElement('strong');label.textContent=row.name;box.append(label);
      for(const [year,votes,prior]of [[data.electionYear,row.votes,false],...(result.comparisonAvailable&&row.previous!=null?[[result.previousYear,row.previous,true]]:[])]){const line=document.createElement('div');line.className='archive-bar-line';const caption=document.createElement('span');caption.textContent=String(year);const track=document.createElement('div');track.className='archive-bar-track';const bar=document.createElement('i');bar.className=prior?'previous':'';bar.style.width=votes/maximum*100+'%';track.append(bar);const count=document.createElement('span');count.textContent=fmt(votes);line.append(caption,track,count);box.append(line);}
      if(row.previous!=null){const note=document.createElement('small');note.className=row.difference>0?'trend-up':row.difference<0?'trend-down':'';note.textContent=model().voteChange(row.votes,row.previous).label;box.append(note);}
      $('archive-chart').append(box);
    }
    const colors=model().distributionColors(data,result,local);let angle=0;const stops=[];$('archive-pie-legend').replaceChildren();
    distribution.forEach((row,i)=>{const share=result.total?row.votes/result.total*100:0;stops.push(`${colors.get(row.key)} ${angle}% ${angle+share}%`);angle+=share;const line=document.createElement('div'),swatch=document.createElement('i'),text=document.createElement('span');swatch.style.background=colors.get(row.key);text.textContent=`${row.name} • ${pct(share)} • ${fmt(row.votes)} votos`;line.append(swatch,text);$('archive-pie-legend').append(line);});
    $('archive-pie').style.background=result.total?'conic-gradient('+stops.join(',')+')':'#e4edf6';$('archive-pie').setAttribute('aria-label',`Distribuição ${local?'por zona':'regional'} de ${fmt(result.total)} votos nominais em ${data.electionYear}. Valores descritos na legenda.`);
    $('archive-prior-pie-panel').hidden=!result.comparisonAvailable;
    if(result.comparisonAvailable){$('archive-prior-pie-title').textContent='Eleição anterior • '+result.previousYear;$('archive-prior-pie-legend').replaceChildren();let cursor=0;const segments=[];
      (local?result.previousZones:distribution).forEach((row,i)=>{const value=local?row.votes:row.previous;const share=result.previous?((value||0)/result.previous*100):0;segments.push(`${colors.get(row.key)} ${cursor}% ${cursor+share}%`);cursor+=share;const line=document.createElement('div'),swatch=document.createElement('i'),text=document.createElement('span');swatch.style.background=colors.get(row.key);text.textContent=`${row.name} • ${pct(share)} • ${value==null?'—':fmt(value)} votos`;line.append(swatch,text);$('archive-prior-pie-legend').append(line);});
      $('archive-prior-pie').style.background=result.previous?'conic-gradient('+segments.join(',')+')':'#e4edf6';$('archive-prior-pie').setAttribute('aria-label',`Distribuição ${local?'por zona':'regional'} de ${fmt(result.previous)} votos nominais em ${result.previousYear}. Valores descritos na legenda.`);
    }
  }
  function renderTable(){
    if(!result)return;$('archive-table-title').textContent=tab==='municipal'?'Todos os municípios do recorte':tab==='regional'?'Regiões do recorte':'Municípios e zonas do recorte';
    for(const button of document.querySelectorAll('[data-archive-tab]'))button.setAttribute('aria-pressed',String(button.dataset.archiveTab===tab));
    const header=$('archive-table-head');header.replaceChildren();const tr=document.createElement('tr');for(const label of ['Território',`Votos ${data.electionYear}`,'% dos votos nominais',...(result.comparisonAvailable?[`Votos ${result.previousYear}`,'Diferença: votos e %']:[])]){const th=document.createElement('th');th.textContent=label;tr.append(th);}header.append(tr);
    $('archive-table-body').replaceChildren(...result[tab].map(row=>{const tr=document.createElement('tr');const values=[row.name,fmt(row.votes),pct(row.share),...(result.comparisonAvailable?[row.previous==null?'—':fmt(row.previous),model().voteChange(row.votes,row.previous).label]:[])];values.forEach((value,i)=>{const td=document.createElement('td');td.textContent=value;if(i)td.className='number-cell';if(i===4)td.classList.add(row.difference>0?'trend-up':row.difference<0?'trend-down':'trend-neutral');tr.append(td);});return tr;}));
  }
  function renderSources(){
    $('archive-source').textContent=data.source.title;$('archive-source-link').href=data.source.url;$('archive-source-link').textContent='Abrir a base oficial no TSE';$('archive-generation').textContent=data.source.generation||'Consulte a fonte';$('archive-version').textContent=data.electionYear===2026?data.source.version:'Arquivo histórico validado • SHA-256 '+data.source.archiveSHA256.slice(0,16)+'…';
    $('archive-previous-source').hidden=!result.comparisonAvailable;if(result.comparisonAvailable){$('archive-previous-source-link').href=previous.source.url;$('archive-previous-source-link').textContent=`Fonte TSE ${previous.electionYear} • ${previous.source.generation}`;}
  }
  function pdf(){if(!data||!entity||!result)return;root.ReportCenter.open({signature,defaultType:'complete',options:[{id:'complete',label:entity.municipality?'Completo compacto — votação por zona':'Completo compacto — regiões, municípios e zonas',description:'Todos os territórios do recorte, gráficos e comparação disponível. Sem escolas ou seções.',prepare:async()=>({report:model().report(data,entity,result,filters(),$('archive-mode').value,'complete'),filename:`eleicao_${data.electionYear}_${data.office}_compacto.pdf`})},{id:'summary',label:'Resumo com gráfico',description:entity.municipality?'Indicadores, resumo e gráfico de votação por zona.':'Indicadores, resumo factual e os dez municípios com mais votos no recorte.',prepare:async()=>({report:model().report(data,entity,result,filters(),$('archive-mode').value,'summary'),filename:`eleicao_${data.electionYear}_${data.office}_resumo.pdf`})}]});}
  function csv(){
    if(!result)return;const quote=value=>'"'+String(value??'').replace(/^[=+@-]/,"'").replace(/"/g,'""')+'"';
    const rows=[['Eleição',data.electionYear],['Cargo',data.office],['Consulta',entity.label],['Fonte',data.source.title],['Região',filters().region||'Todas'],['Município',filters().municipality||'Todos'],['Zona',filters().zone||'Todas'],['Denominador','Votos nominais do cargo; exclui legenda'],[],['Território','Votos '+data.electionYear,'% nominal',...(result.comparisonAvailable?['Votos '+result.previousYear,'Diferença de votos','Variação %']:[])],...result[tab].map(row=>[row.name,row.votes,pct(row.share),...(result.comparisonAvailable?[row.previous,row.difference,row.change==null?'':pct(row.change)]:[])])];
    const url=URL.createObjectURL(new Blob(['\uFEFF'+rows.map(row=>row.map(quote).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download=`eleicao_${data.electionYear}_${data.office}_${tab}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  function init(callbacks){
    if(ready)return;ready=true;api=callbacks;
    $('archive-year').addEventListener('change',()=>{$('archive-search').value='';load($('archive-office').value!=='vereador');});
    $('archive-office').addEventListener('change',()=>{syncYears();tab='municipal';load(true);});
    $('archive-region').addEventListener('change',()=>{fillTerritory();if(data.office==='vereador'){$('archive-search').value='';fillEntities(false);}else render();});
    $('archive-city').addEventListener('change',()=>{fillZones('');if(data.office==='vereador'){$('archive-search').value='';fillEntities(false);}else render();});
    $('archive-zone').addEventListener('change',render);
    $('archive-mode').addEventListener('change',()=>{$('archive-search').value='';if(data.office==='vereador')fillTerritory();fillEntities(false);});
    $('archive-search').addEventListener('input',()=>fillEntities());$('archive-entity').addEventListener('change',render);$('archive-previous-year').addEventListener('change',loadPrevious);
    for(const button of document.querySelectorAll('[data-archive-tab]'))button.addEventListener('click',()=>{tab=button.dataset.archiveTab;renderTable();});
    $('archive-pdf').addEventListener('click',pdf);$('archive-csv').addEventListener('click',csv);
  }
  function activate(){if(!data||Number($('archive-year').value)===2026)load(!data);}
  root.ElectionArchive={init,activate,loadData:(year,office)=>getData(year,office,-1)};
})(window);
