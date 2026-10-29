(function(root){
  'use strict';
  const $=id=>document.getElementById(id),fmt=n=>n==null?'Não informado':new Intl.NumberFormat('pt-BR').format(n),pct=n=>n==null?'—':n.toLocaleString('pt-BR',{maximumFractionDigits:1})+'%';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let locationsPromise,profilePromise,candidatesPromise,context,live=null,profileEpoch=0,sectionEpoch=0,candidateEpoch=0;
  async function json(url){const r=await fetch(url,{credentials:'same-origin',signal:AbortSignal.timeout(20000)});if(!r.ok||!r.headers.get('content-type')?.includes('application/json'))throw new Error('Fonte indisponível. Conecte à internet ou prepare a cópia offline.');const value=await r.json();if(value.error)throw new Error(value.error);return value;}
  function locations(){if(!locationsPromise)locationsPromise=json('/locations-2026.json').then(root.TseModel.validateLocations).catch(e=>{locationsPromise=null;throw e;});return locationsPromise;}
  function update(value){
    const signature=c=>JSON.stringify([c?.office,c?.filters.region,c?.filters.municipality,c?.filters.zone]),changed=signature(context)!==signature(value);context=value;
    if(changed){live=null;profileEpoch++;$('tse-live-details').textContent='Consulte a apuração para conferir fase, geração e destinação dos votos.';$('tse-destination-rows').replaceChildren();$('tse-destination-scope').textContent='';$('tse-live-source').removeAttribute('href');$('tse-live-source').hidden=true;if($('tse-profile-panel').open)renderProfile();}
    renderCandidate(value.candidate);
  }
  function renderCandidate(candidate){
    const epoch=++candidateEpoch;if(context)context.candidate=candidate;
    const node=$('tse-candidate-card');if(!node)return;node.hidden=!candidate;
    if(!candidate)return;
    const official=live?.candidates?.find(c=>c.id===String(candidate.id)&&c.number===String(candidate.number)&&root.TseModel.normalize(c.fullName)===root.TseModel.normalize(candidate.fullName));
    $('tse-candidate-identity').textContent=`${candidate.number} • ${candidate.fullName} • ${candidate.party||'Partido não informado'} • ${candidate.status||'Situação não disponível'}`;
    $('tse-candidate-destination').textContent=official?.destination?'Destinação no arquivo online: '+official.destination+'. Fonte gerada em '+live.generatedAt+'.':'Destinação online ainda não conferida para esta candidatura.';
    $('tse-candidate-id').textContent='Identificador TSE: '+candidate.id+'. Consulte a candidatura e as contas no DivulgaCandContas; os documentos abrem no portal oficial.';
    $('tse-candidate-extra').textContent='Carregando os dados públicos da candidatura…';
    if(!candidatesPromise)candidatesPromise=json('/results-data/candidate-profiles-2026.json').catch(e=>{candidatesPromise=null;throw e;});
    candidatesPromise.then(data=>{
      if(epoch!==candidateEpoch)return;
      if(data.schema!==1||data.electionYear!==2026||data.turn!==1||data.uf!=='PA')throw new Error('Fonte de candidaturas incompatível.');
      const c=data.candidates?.[candidate.id];
      if(!c||String(c.number)!==String(candidate.number)||root.TseModel.normalize(c.fullName)!==root.TseModel.normalize(candidate.fullName)){$('tse-candidate-extra').textContent='Sem correspondência confirmada na fonte complementar. Consulte o portal oficial.';return;}
      $('tse-candidate-extra').textContent=[['Registro',c.registrationStatus],['Federação',c.federation],['Coligação',c.coalition],['Ocupação',c.occupation],['Escolaridade',c.education]].filter(([,v])=>v).map(([k,v])=>k+': '+v).join(' • ')+'. Fonte de candidaturas gerada em '+data.generation+'.';
    }).catch(e=>{if(epoch===candidateEpoch)$('tse-candidate-extra').textContent=e.message;});
  }
  function progress(data){
    live=data;const exact=context&&!context.filters.region&&!context.filters.zone||context?.filters.municipality;
    const same=exact&&data.voteTotals?.nominal!=null&&context.total===data.voteTotals.nominal;
    $('tse-live-details').textContent=`Ambiente ${data.phase||'não informado'} • eleição ${data.election||'não informada'} • 1º turno • geração ${data.generatedAt} • última totalização ${data.totalizedAt} • consulta ${new Date(data.consultedAt).toLocaleString('pt-BR')}. `+(data.notInstalled==null?'':fmt(data.notInstalled)+' seções não instaladas. ')+(exact&&data.voteTotals?.nominal!=null?(same?'O total nominal da base exibida confere com esta consulta online.':'O total nominal online difere da base exibida. Confira as datas das extrações antes de atualizar os arquivos.'):'O arquivo online abrange o estado; os totais abaixo identificam esse recorte e não substituem a tabela filtrada.');
    const labels={valid:'Válidos',nominal:'Nominais válidos',party:'Legenda válida',annulled:'Anulados',subJudice:'Anulados sob julgamento',blank:'Brancos',null:'Nulos'};
    $('tse-destination-rows').innerHTML=Object.entries(labels).map(([key,label])=>`<tr><td>${label}</td><td>${fmt(data.voteTotals?.[key])}</td></tr>`).join('');
    $('tse-destination-scope').textContent=(data.municipality?(context?.municipalities.find(r=>String(r[0])===data.municipality)?.[1]||data.municipality)+(data.zone?' • Zona '+data.zone:''):'Pará')+' • '+(context?.officeLabel||data.office)+' • fonte online independente da versão de votação carregada.';
    const link=$('tse-live-source');if(/^https:\/\/resultados\.tse\.jus\.br\/oficial\//.test(data.source||'')){link.href=data.source;link.hidden=false;}
    renderCandidate(context?.candidate);
  }
  async function renderProfile(){
    if(!context)return;const epoch=++profileEpoch,snapshot=context;$('tse-profile-status').textContent='Carregando o perfil oficial do recorte…';$('tse-profile-content').replaceChildren();$('tse-profile-csv').disabled=true;
    try{
      if(!profilePromise)profilePromise=json('/results-data/electorate-profile-2026.json').catch(e=>{profilePromise=null;throw e;});
      const data=await profilePromise;if(epoch!==profileEpoch)return;const summary=root.TseModel.profile(data,snapshot.municipalities.map(r=>r[0]),snapshot.filters.zone);
      $('tse-profile-status').textContent=fmt(summary.total)+' eleitores no perfil • '+fmt(summary.zones)+' recortes de município/zona • '+(snapshot.filters.municipality?snapshot.municipalities[0]?.[1]:snapshot.filters.region?'Região selecionada':'Pará')+(snapshot.filters.zone?' • Zona '+snapshot.filters.zone:'')+'. Fonte gerada em '+data.generation+'. Os filtros de candidato, partido e situação não alteram o perfil.';
      $('tse-profile-content').innerHTML=Object.entries({gender:'Gênero',age:'Faixa etária',education:'Escolaridade'}).map(([key,title])=>`<section><h4>${title}</h4><div class="table-wrap"><table><thead><tr><th>Categoria</th><th>Eleitores</th><th>% do perfil</th></tr></thead><tbody>${summary.groups[key].map(r=>`<tr><td>${esc(r.label)}</td><td>${fmt(r.value)}</td><td>${pct(r.share)}</td></tr>`).join('')}</tbody></table></div></section>`).join('');
      $('tse-profile-csv').disabled=!summary.total;$('tse-profile-csv').onclick=()=>{
        const rows=[['Perfil do eleitorado','2026','PA'],['Fonte',data.source],['Geração',data.generation],['Recorte',snapshot.municipalities.map(r=>r[1]).join(', ')],['Zona',snapshot.filters.zone||'Todas'],['Total do perfil',summary.total],['Observação','Composição do eleitorado; não identifica voto por gênero nem voto individual'],[],['Dimensão','Categoria','Eleitores','% do perfil'],...Object.entries(summary.groups).flatMap(([key,values])=>values.map(r=>[key,r.label,r.value,r.share]))];
        download('PERFIL_ELEITORADO_2026.csv',rows);
      };
    }catch(e){if(epoch===profileEpoch)$('tse-profile-status').textContent=e.message;}
  }
  function download(filename,rows){const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(r=>r.map(v=>'"'+String(/^[=+@-]/.test(String(v))?"'"+v:v??'').replace(/"/g,'""')+'"').join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  async function lookup(event){
    event.preventDefault();const run=++sectionEpoch,city=$('tse-section-city').value,zone=$('tse-section-zone').value,section=$('tse-section-number').value;
    $('tse-section-output').replaceChildren();$('tse-section-status').textContent='Conferindo o local na fonte de 2026…';$('tse-section-submit').disabled=true;
    try{
      const result=root.TseModel.findLocation(await locations(),{municipality:city,zone,section});if(run!==sectionEpoch)return;
      $('tse-section-status').textContent=result.status==='confirmed'?'Local confirmado na fonte de 2026 • geração '+result.generation:result.status==='ambiguous'?'Há locais conflitantes neste recorte. Confira os documentos oficiais.':'Seção não localizada neste município na fonte de 2026. Título antigo ou mudança de seção exige confirmação no atendimento oficial.';
      $('tse-section-output').innerHTML=result.matches.map(r=>`<article class="tse-location-card"><h4>${esc(r.place)}</h4><p>${esc(r.neighborhood||'Bairro não informado')} • ${esc(r.city)} • Zona ${esc(r.zone)} / Seção ${esc(r.section)}</p></article>`).join('');
      if(!navigator.onLine)return;
      $('tse-section-status').textContent+=' Conferindo disponibilidade do boletim no TSE…';
      try{const metadata=await json('/api/tse2026/section?'+new URLSearchParams({municipality:city,zone:String(Number(zone)),section:String(Number(section))}));if(run!==sectionEpoch)return;
        const p=document.createElement('p');p.className='compact-note';p.textContent='TSE: '+metadata.status+(metadata.principal!==metadata.section?' • seção agregada à '+metadata.principal:'')+' • geração '+metadata.generatedAt+'.';$('tse-section-output').append(p);
    for(const file of metadata.files){const a=document.createElement('a');a.className='button secondary';a.href=file.url;a.textContent='Baixar boletim de urna'+(file.receivedAt?' • '+file.receivedAt:'');a.title=file.name+' • '+file.status;a.target='_blank';a.rel='noopener noreferrer';$('tse-section-output').append(a);}
      }catch(e){if(run===sectionEpoch){const p=document.createElement('p');p.className='compact-note';p.textContent='Boletim online: '+e.message;$('tse-section-output').append(p);}}
      if(run===sectionEpoch)$('tse-section-status').textContent=$('tse-section-status').textContent.replace(' Conferindo disponibilidade do boletim no TSE…','');
    }catch(e){if(run===sectionEpoch)$('tse-section-status').textContent=e.message;}
    finally{if(run===sectionEpoch)$('tse-section-submit').disabled=false;}
  }
  function init(){
    $('tse-profile-panel').addEventListener('toggle',()=>{if($('tse-profile-panel').open)renderProfile();});
    $('tse-section-form').addEventListener('submit',lookup);
    for(const id of ['tse-section-city','tse-section-zone','tse-section-number'])$(id).addEventListener('input',()=>{sectionEpoch++;$('tse-section-submit').disabled=false;$('tse-section-output').replaceChildren();$('tse-section-status').textContent='Toque em Conferir seção para consultar o novo recorte.';});
    $('tse-location-audit').addEventListener('click',async()=>{const b=$('tse-location-audit');b.disabled=true;try{const a=root.TseModel.auditLocations(await locations());$('tse-location-audit-status').textContent=`Fonte de 2026 • geração ${a.generation} • ${fmt(a.municipalities)} municípios • ${fmt(a.sections)} pares zona/seção • ${fmt(a.conflicts)} conflitos de locais no mesmo município • ${fmt(a.missingNeighborhood)} vínculos sem bairro. A conferência não altera os cadastros.`;}catch(e){$('tse-location-audit-status').textContent=e.message;}finally{b.disabled=false;}});
  }
  function setTerritory(territory){const select=$('tse-section-city');if(select.options.length<=1)select.replaceChildren(new Option('Selecione o município',''),...territory.municipalities.map(([code,name])=>new Option(name,String(code))));}
  root.TseResources={init,update,progress,renderCandidate,setTerritory};
})(window);
