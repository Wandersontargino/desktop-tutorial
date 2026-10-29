(function(root){
  'use strict';
  const M=root.PairedAnalysis, S=root.ElectoralScope, $=id=>document.getElementById(id);
  const integerFormat=new Intl.NumberFormat('pt-BR'),percentFormat=new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:1,maximumFractionDigits:1});
  const int=v=>v===null||v===undefined?'—':integerFormat.format(v);
  const pct=v=>v===null||v===undefined?'Sem base':percentFormat.format(v);
  const compatibilityFormat=new Intl.NumberFormat('pt-BR',{style:'percent',minimumFractionDigits:2,maximumFractionDigits:2});
  const compatPct=v=>v==null?'Sem base':compatibilityFormat.format(v);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const offices=['estadual','federal'], short=['Estadual','Federal'], colors=['#2358ed','#007b78','#7082b4','#5b9390'];
  const change=(current,previous)=>current==null?{label:'Sem cobertura',className:''}:S.change(current,previous);
  const display=c=>`${c[1]} — ${c[2]}`;
  let api,bases=null,rows=[],selection=null,result=null,setupPromise=null,requestId=0,controller=null;
  const historyCache=new Map();
  async function json(path,signal,optional=false){
    const response=await fetch(path,{credentials:'same-origin',signal,cache:path.endsWith('/manifest')?'no-store':'default'});
    if(optional&&response.status===404)return null;
    if(!response.ok)throw new Error('Não foi possível carregar a base. Confira a conexão e tente novamente.');
    return response.json();
  }
  const url=(office,version,file)=>`/api/election/${office}/data/${file}?version=${encodeURIComponent(version)}`;
  function options(id,values,first,preserve=true){
    const node=$(id),old=node.value;node.replaceChildren(new Option(first,''));
    values.forEach(([value,label])=>node.add(new Option(label,String(value))));
    node.value=preserve&&values.some(([v])=>String(v)===old)?old:'';
  }
  function cityOptions(){
    const region=$('pair-region').value;
    options('pair-city',bases[0].regional.municipalities.filter(c=>!region||c[2]===region).map(c=>[c[0],c[1]]),'Todos os municípios do recorte');
  }
  function invalidate(){
    requestId++;controller?.abort();rows=[];selection=null;result=null;$('pair-results').hidden=true;
    $('pair-submit').disabled=!bases;$('pair-status').textContent='Filtros alterados. Clique em Comparar dupla para atualizar o quadro.';
  }
  async function setup(){
    if(setupPromise)return setupPromise;
    setupPromise=(async()=>{
      const manifests=await Promise.all(offices.map(o=>json(`/api/election/${o}/manifest`)));
      if(bases&&bases.every((b,i)=>b.version===manifests[i].active))return;
      const next=await Promise.all(offices.map(async(office,i)=>{
        const version=manifests[i].active;
        const [statewide,regional,index]=await Promise.all(['statewide.json','regional.json','index.json'].map(f=>json(url(office,version,f))));
        if(index.electionYear!==2026||index.office!==office||index.totals.votes!==statewide.totalVotes)throw new Error('Índice municipal incompatível com a base do cargo.');
        await root.CandidateIdentity?.load(office).catch(()=>null);
        if(statewide.electionYear!==2026||statewide.office!==office||regional.currentElectionYear!==2026||regional.office!==office||regional.previousElectionYear!==2022)throw new Error('Ano ou cargo incompatível na base.');
        if(regional.regions.length!==13||new Set(regional.municipalities.map(c=>String(c[0]))).size!==144)throw new Error('A divisão regional precisa cobrir os 144 municípios.');
        return {office,version,statewide,regional,index,manifest:manifests[i]};
      }));
      if(JSON.stringify(next[0].regional.municipalities)!==JSON.stringify(next[1].regional.municipalities))throw new Error('Os dois cargos têm divisões regionais diferentes.');
      const first=!bases; bases=next;invalidate();
      next.forEach((b,i)=>{
        const id='pair-'+b.office, list=$(id+'-options');
        list.replaceChildren(...[...b.statewide.candidates].sort((a,c)=>a[2].localeCompare(c[2],'pt-BR')).map(c=>new Option(display(c),display(c))));
        $(id).disabled=false;
        if(first&&api.getState().office===b.office){const c=b.statewide.candidates.find(c=>String(c[0])===String(api.getState().candidate?.[0]));if(c)$(id).value=display(c);}
      });
      options('pair-region',next[0].regional.regions.map(r=>[r[0],r[1]]),'Todas as 13 regiões');
      if(first)$('pair-region').value=api.getState().regionFilter||'';
      cityOptions();
      if(first&&next[0].regional.municipalities.some(c=>String(c[0])===api.getState().cityCode))$('pair-city').value=api.getState().cityCode;
      ['pair-region','pair-city','pair-submit'].forEach(id=>$(id).disabled=false);
      $('pair-status').textContent=first?'Escolha os dois candidatos e clique em Comparar dupla.':'A base mudou. Clique em Comparar dupla para consultar as versões atuais.';
    })().finally(()=>setupPromise=null);
    return setupPromise;
  }
  function candidate(i){
    const value=$('pair-'+offices[i]).value.trim(),list=bases[i].statewide.candidates;
    const matches=list.filter(c=>display(c)===value||String(c[1])===value||M.normalize(c[2])===M.normalize(value));
    return matches.length===1?matches[0]:null;
  }
  async function detailHistory(base,previous){
    if(!previous)return null;
    const key=base.office+'|'+previous[0];
    if(!historyCache.has(key))historyCache.set(key,(async()=>{
      const h=await json(url(base.office,'bundled',`history-2022/${previous[0]}.json`),undefined,true);
      if(!h||h.year!==2022||h.office!==base.office||String(h.candidateId)!==String(previous[0]))return null;
      return h.rows;
    })().catch(()=>{historyCache.delete(key);return null;}));
    while(historyCache.size>4)historyCache.delete(historyCache.keys().next().value);
    return historyCache.get(key);
  }
  async function compare(event){
    event?.preventDefault();
    try{await setup();}catch(e){$('pair-status').textContent=e.message;return;}
    const candidates=[candidate(0),candidate(1)];
    if(candidates.some(c=>!c)){$('pair-status').textContent='Selecione um nome da lista ou informe o número exato de cada candidato.';return;}
    controller?.abort();controller=new AbortController();const signal=controller.signal,id=++requestId;
    const region=$('pair-region').value,city=$('pair-city').value;
    const cities=bases[0].regional.municipalities.filter(c=>(!region||c[2]===region)&&(!city||String(c[0])===city));
    const snapshot=bases.slice(),previous=candidates.map((c,i)=>S.previousCandidate(c,snapshot[i].regional.previousCandidates,snapshot[i].statewide.candidates));
    $('pair-submit').disabled=true;$('pair-results').hidden=true;result=null;
    let completed=0,next=0;const tasks=cities.flatMap(c=>offices.map((_,i)=>[c,i])),projected=[[],[]];
    try{
      await Promise.all(Array.from({length:Math.min(3,tasks.length)},async()=>{
        while(next<tasks.length){
          const [c,i]=tasks[next++],base=snapshot[i];
          let summary;
          try{
            const response=await fetch(`/api/election/${base.office}/projection?version=${encodeURIComponent(base.version)}&municipality=${c[0]}&candidate=${candidates[i][0]}`,{credentials:'same-origin',signal});
            if(!response.ok)throw Object.assign(new Error('Consulta resumida indisponível.'),{status:response.status});
            const value=await response.json();if(value.year!==2026||value.office!==base.office||value.version!==base.version||value.municipality!==String(c[0])||value.candidate!==String(candidates[i][0]))throw new Error('Consulta resumida incompatível.');summary=value.rows;
          }catch(error){
            if(error.name==='AbortError'||[401,403].includes(error.status))throw error;
            const data=await json(url(base.office,base.version,`${c[0]}.json`),signal);
            if(String(data.m?.[0])!==String(c[0]))throw new Error('Município incompatível na base.');summary=M.project(data,candidates[i][0],base.office);
          }
          projected[i].push(...summary);
          completed++;if(id===requestId)$('pair-status').textContent=`Carregando ${int(cities.length)} município(s) • ${Math.round(100*completed/tasks.length)}%`;
        }
      }));
      const histories=await Promise.all(snapshot.map((b,i)=>detailHistory(b,previous[i])));
      if(id!==requestId)return;
      rows=M.join(projected[0],projected[1]);
      selection={candidates,previous,histories,bases:snapshot,cities,region,city};
      ['pair-zone','pair-section','pair-place'].forEach(n=>$(n).value='');
      renderFilters();$('pair-results').hidden=false;
      $('pair-status').textContent=`2026 • 1º turno • ${int(cities.length)} município(s). As bases dos dois cargos foram consultadas separadamente.`;
      render();
    }catch(e){if(id===requestId&&e.name!=='AbortError'){$('pair-status').textContent=e.message;api.toast(e.message,'error');}}
    finally{if(id===requestId)$('pair-submit').disabled=false;}
  }
  function filter(r,except=''){
    const values={zone:r.zone,section:r.section,place:M.placeKey(r)};
    return Object.entries(values).every(([k,v])=>k===except||!$('pair-'+k).value||$('pair-'+k).value===v);
  }
  function renderFilters(){
    const definitions=[['zone','Todas as zonas',r=>r.zone,r=>'Zona '+String(r.zone).padStart(3,'0')],['section','Todas as seções',r=>r.section,r=>'Seção '+String(r.section).padStart(4,'0')],['place','Todos os locais',M.placeKey,r=>M.label(r,'place')]];
    // Each option list uses the other active filters; repeat after clearing invalid choices.
    for(let pass=0;pass<2;pass++)for(const [name,first,key,label] of definitions){
      const values=new Map();rows.filter(r=>filter(r,name)).forEach(r=>values.set(key(r),label(r)));
      options('pair-'+name,[...values].sort((a,b)=>a[1].localeCompare(b[1],'pt-BR',{numeric:true})),first);
    }
  }
  function historicalRows(i){
    const hist=selection.histories[i];if(!hist)return null;
    const codes=new Set(selection.cities.map(c=>String(c[0]))),names=new Map(selection.cities.map(c=>[String(c[0]),c[1]]));
    const places=new Map();
    rows.filter(M.placeVerified).forEach(r=>{const key=JSON.stringify([r.code,M.normalize(r.place)]);if(!places.has(key))places.set(key,new Map());places.get(key).set(M.placeKey(r),r);});
    const out=[];
    hist.forEach(([code,zone,section,place,votes])=>{
      code=String(code);if(!codes.has(code))return;
      const r={key:M.sectionKey(code,zone,section),code,city:names.get(code),zone:String(Number(zone)),section:String(Number(section)),place:place||'Local não informado',neighborhood:'Bairro não informado',votes};
      const matches=places.get(JSON.stringify([code,M.normalize(r.place)]));
      // Never resolve renamed schools or schools with ambiguous neighborhoods by guesswork.
      if(matches?.size===1){const current=[...matches.values()][0];r.place=current.place;r.neighborhood=current.neighborhood;r.placeMatched=!current.locationConflict;}
      if($('pair-zone').value&&r.zone!==$('pair-zone').value)return;
      if($('pair-section').value&&r.section!==$('pair-section').value)return;
      if($('pair-place').value&&(!r.placeMatched||M.placeKey(r)!==$('pair-place').value))return;
      out.push(r);
    });return out;
  }
  function historyForGroups(groups,unit,hr,includeMetrics=true){
    const previousValues=groups.map(()=>[null,null]);
    for(let i=0;i<2;i++){
      if(!selection.previous[i])continue;
      let values;
      if(hr[i]){
        values=new Map();hr[i].forEach(r=>{if(unit==='place'&&!r.placeMatched)return;const key=M.groupKey(r,unit);values.set(key,(values.get(key)||0)+r.votes);});
      }else continue;
      groups.forEach((g,j)=>{if(values.has(g.key))previousValues[j][i]=values.get(g.key);});
    }
    let previousMetrics=null;
    if(includeMetrics&&hr.every(Boolean)){
      const merged=new Map();hr.forEach((hist,i)=>hist.forEach(r=>{if(!merged.has(r.key))merged.set(r.key,{...r,e:0,f:0,te:0,tf:0});merged.get(r.key)[i?'f':'e']+=r.votes;}));
      const sectionRows=[...merged.values()];
      previousMetrics={...M.metrics(sectionRows),...M.counts(sectionRows),sectionRows};
    }
    return {previousValues,previousMetrics};
  }
  function metric(label,value,note,className=''){return `<div class="metric-card ${className}"><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(note)}</small></div>`;}
  function series(g,previous){
    const values=[{label:'E 2026',value:g.e,color:colors[0]},{label:'F 2026',value:g.f,color:colors[1]}];
    previous.forEach((v,i)=>{if(v!==null)values.push({label:i?'F 2022':'E 2022',value:v,color:colors[i+2]});});
    return values;
  }
  const decorate=g=>({...g,...M.counts(g.rows)});
  function compatibleText(m){
    if(m.upper==null)return 'Compatibilidade indisponível: falta cobertura em um dos cargos.';
    if(!m.e&&!m.f)return 'Limite de 0 votos; percentual sem base porque ambos têm zero votos.';
    return `Limite de compatibilidade: até ${int(m.upper)} votos • Estadual: ${compatPct(m.compatibleShareE)} • Federal: ${compatPct(m.compatibleShareF)}`;
  }
  function remainderText(m){return `Sobra estimada: Estadual ${int(m.aboveLimitE)} votos • Federal ${int(m.aboveLimitF)} votos`;}
  function exactCompatibility(m){return `<div class="pair-exact-row"><span>Estadual <strong>${int(m.e)} votos</strong></span><span>Federal <strong>${int(m.f)} votos</strong></span><span class="pair-exact-compatible">Compatíveis · teto <strong>${m.upper==null?'Sem cobertura':'Até '+int(m.upper)+' votos'}</strong></span></div>`;}
  function remainderNote(votes,remainder){return remainder==null?'Falta cobertura em um dos cargos.':votes>0?pct(remainder/votes)+' dos votos do candidato, além do limite por seção.':'Sem votos para este candidato no recorte.';}
  function estimateNote(m){
    if(m.upper==null)return compatibleText(m)+' Dados ausentes não são tratados como zero.';
    return compatibleText(m)+`. Votos além desse limite: ${int(m.aboveLimitE)} do estadual e ${int(m.aboveLimitF)} do federal. O cálculo soma o menor total em cada município, zona e seção; não confirma votos das mesmas pessoas nem indica abstenção.`;
  }
  const sectionLabel=g=>g.label+' • '+g.rows[0].place;
  const tolerance=()=>Number($('pair-tolerance').value||0)/100;
  const correlationFormat=new Intl.NumberFormat('pt-BR',{minimumFractionDigits:3,maximumFractionDigits:3});
  const corrNumber=v=>v==null?'Indisponível':(v>0?'+':'')+correlationFormat.format(v);
  const correlationBasis=()=>$('pair-correlation-basis').value==='share'?'share':'votes';
  const basisLabel=()=>correlationBasis()==='share'?'Participação no cargo (%)':'Quantidade de votos';
  function correlationMeaning(c){
    if(c.r===null)return c.reason;
    if(c.r===0)return 'Sem relação linear observada entre as duas votações.';
    return c.r>0?'Positiva: seções com maior votação para um tendem a ter maior votação para o outro.':'Negativa: seções com maior votação para um tendem a ter menor votação para o outro.';
  }
  function scatterModel(current,previous){
    const datasets=[{label:'2026',color:colors[0],...current},...(previous?[{label:'2022',color:colors[2],...previous}]:[])];
    const maxima=datasets.reduce((out,d)=>{for(const p of d.points){out[0]=Math.max(out[0],p.x);out[1]=Math.max(out[1],p.y);}return out;},[1,1]);
    const maxX=maxima[0]*1.05,maxY=maxima[1]*1.05;
    return {type:'scatter',title:'Correlação por seção • '+basisLabel(),basis:correlationBasis(),maxX,maxY,
      datasets:datasets.map(d=>({label:d.label,color:d.color,points:M.scatter(d.points,maxX,maxY),r:d.r,n:d.n,slope:d.slope,intercept:d.intercept}))};
  }
  function renderCorrelation(){
    const current=result.correlation,previous=result.previousCorrelation,model=result.scatter;
    $('pair-correlation-metrics').innerHTML=metric('Pearson • 2026',corrNumber(current.r),correlationMeaning(current))+metric('Seções analisadas • 2026',int(current.n),`${int(current.zero)} sem votos para ambos • ${int(current.missing+current.noDenominator)} sem dados suficientes`)+(previous?metric('Pearson • 2022',corrNumber(previous.r),int(previous.n)+' seções. '+correlationMeaning(previous)):'');
    const tick=v=>new Intl.NumberFormat('pt-BR',{maximumFractionDigits:correlationBasis()==='share'?1:0}).format(v);
    const mobile=root.innerWidth<650,left=mobile?85:70,right=mobile?360:550,ticks=mobile?2:4;
    const x=v=>left+(right-left)*v/model.maxX,y=v=>325-270*v/model.maxY;
    let chart='';
    for(let i=0;i<=ticks;i++){
      const px=x(model.maxX*i/ticks),py=y(model.maxY*i/ticks);
      chart+=`<path d="M${left} ${py}H${right} M${px} 55V325" stroke="#dce5ef" stroke-width="1"/><text x="${left-12}" y="${py+5}" text-anchor="end">${esc(tick(model.maxY*i/ticks))}</text><text x="${px}" y="350" text-anchor="middle">${esc(tick(model.maxX*i/ticks))}</text>`;
    }
    for(const d of [...model.datasets].reverse()){
      chart+=d.points.map(p=>`<circle cx="${x(p.x)}" cy="${y(p.y)}" r="${Math.min(7,2+Math.log2(p.count))}" fill="${d.color}" fill-opacity=".65"><title>${esc(d.label)}: ${int(p.count)} seção(ões). Estadual ${esc(tick(p.minX))}–${esc(tick(p.maxX))}; federal ${esc(tick(p.minY))}–${esc(tick(p.maxY))}.</title></circle>`).join('');
      if(d.r!==null){
        const ends=[[0,d.intercept],[model.maxX,d.intercept+d.slope*model.maxX]];
        if(d.slope!==0){ends.push([-d.intercept/d.slope,0],[(model.maxY-d.intercept)/d.slope,model.maxY]);}
        const inside=ends.filter(([a,b])=>a>=0&&a<=model.maxX&&b>=0&&b<=model.maxY);
        if(inside.length>=2)chart+=`<path d="M${x(inside[0][0])} ${y(inside[0][1])}L${x(inside[1][0])} ${y(inside[1][1])}" stroke="${d.color}" stroke-width="2" stroke-dasharray="6 5"/>`;
      }
    }
    const unit=correlationBasis()==='share'?' (%)':' (votos)';
    $('pair-scatter').innerHTML=model.datasets.some(d=>d.points.length)?`<svg viewBox="0 0 ${mobile?400:600} 390" role="img" aria-label="Dispersão por seção. Eixo horizontal: estadual. Eixo vertical: federal. Pearson 2026: ${esc(corrNumber(current.r))}."><text x="${left}" y="25">Federal${unit}</text>${chart}<text x="${(left+right)/2}" y="380" text-anchor="middle">Estadual${unit}</text></svg>`:'<p class="compact-note">Nenhuma seção com dados suficientes para este gráfico.</p>';
    $('pair-scatter-legend').innerHTML=model.datasets.map(d=>`<span><i style="background:${d.color}"></i>${d.label} • ${int(d.n)} seções</span>`).join('');
    $('pair-scatter-note').textContent='Pontos agrupam seções com valores próximos; tamanho indica quantidade. Linha tracejada: tendência linear. O coeficiente usa todas as observações válidas, sem agrupar os cálculos.';
    const previousNote=correlationBasis()==='share'?'2022 indisponível nesta medida: a base histórica não informa o total nominal de cada cargo por seção.':previous?'2022 usa as seções com votos da dupla naquele ano; a quantidade e a composição podem diferir de 2026. Os valores não expressam crescimento percentual.':'2022 exige histórico por seção e correspondência única dos dois candidatos no mesmo cargo.';
    $('pair-correlation-note').textContent='Pearson varia de −1 a +1; não é porcentagem de votos casados. Usa o recorte geográfico, excluindo seções sem dados e seções sem votos para ambos. Filtros de igualdade, tolerância e ordenação não mudam a correlação. Em votos, o tamanho das seções pode influenciar o índice; a participação divide os votos pelo total nominal do próprio cargo em cada seção. '+previousNote;
  }
  const badge=(g,school=false)=>{const status=M.assess(g,tolerance(),school);return `<span class="pair-badge ${status.tone}">${esc(status.label)}</span>`;};
  function barRows(groups,previous,school=false){
    const max=Math.max(1,...groups.flatMap((g,j)=>series(g,previous[j]).map(v=>v.value??0)));
    return groups.map((g,j)=>`<div class="pair-bar-row"><strong>${esc(school?g.label:sectionLabel(g))}</strong>${exactCompatibility(g)}${series(g,previous[j]).map(v=>`<div class="pair-bar-line"><span>${esc(v.label)}</span><div><i style="width:${v.value==null?0:100*v.value/max}%;background:${v.color}"></i></div><b>${int(v.value)}</b></div>`).join('')}<p>${badge(g,school)} <span>Diferença: ${int(g.gap)} votos • ${esc(pct(g.gapRatio))}</span>${school&&g.gap===0&&g.sectionGap>0?`<br><span>${int(g.rows.filter(r=>r.e!==r.f).length)} seção(ões) com diferenças que se compensam no total.</span>`:''}</p><p class="pair-compatibility-row">${esc(compatibleText(g))}</p><p class="pair-remainder-row">${esc(remainderText(g))}</p><p>${[0,1].filter(i=>previous[j][i]!==null).map(i=>{const c=change(i?g.f:g.e,previous[j][i]);return `<span class="${c.className}">${esc(short[i])} ${esc(c.label)} frente a 2022</span>`;}).join(' • ')}</p>${school&&g.locationVerified?`<button class="button secondary pair-detail-button" type="button" data-pair-place="${esc(g.key)}" aria-label="Ver seções de ${esc(g.label)}">Ver seções</button>`:''}</div>`).join('');
  }
  function render(){
    if(!selection)return;
    const filtered=rows.filter(r=>filter(r)),allGroups=M.group(filtered,'section').map(decorate);
    const groups=M.select(allGroups,$('pair-match').value,$('pair-order').value,tolerance());
    const metrics={...M.metrics(filtered),...M.counts(filtered)};
    const schools=M.group(filtered,'place').map(decorate);
    const zones=M.group(filtered,'zone').map(decorate);
    const hr=[historicalRows(0),historicalRows(1)];
    const history=historyForGroups(groups,'section',hr),schoolHistory=historyForGroups(schools,'place',hr,false);
    const previous=history.previousValues;
    result={filtered,unit:'section',allGroups,groups,schools,zones,metrics,previous,schoolPrevious:schoolHistory.previousValues,previousMetrics:history.previousMetrics};
    result.correlation=M.correlation(filtered,correlationBasis());
    result.previousCorrelation=correlationBasis()==='votes'&&history.previousMetrics?M.correlation(history.previousMetrics.sectionRows):null;
    result.scatter=scatterModel(result.correlation,result.previousCorrelation);renderCorrelation();
    $('pair-coverage').textContent=`${int(filtered.length)} seção(ões) • ${int(new Set(filtered.map(r=>r.code)).size)} município(s) • ${int(metrics.active)} seção(ões) com votos para pelo menos um. ${int(metrics.equalPositive)} seção(ões) com totais iguais e votos. ${metrics.missing?int(metrics.missing)+' seção(ões) sem cobertura em um dos cargos; percentuais comparativos indisponíveis.':''}${filtered.some(r=>!M.placeVerified(r))?' Há locais não informados ou divergentes, mantidos separados para conferência.':''}`;
    $('pair-metrics').innerHTML=metric('Votos estadual • '+selection.candidates[0][1],int(metrics.e)+' votos',pct(metrics.shareE)+' dos votos nominais de estadual'+(metrics.missing?' • cobertura parcial':''))+metric('Votos federal • '+selection.candidates[1][1],int(metrics.f)+' votos',pct(metrics.shareF)+' dos votos nominais de federal'+(metrics.missing?' • cobertura parcial':''))+metric('Votos compatíveis · teto estimado',metrics.upper==null?'Sem cobertura':'Até '+int(metrics.upper)+' votos','Soma dos menores totais de cada seção; estimativa agregada','pair-compatibility-highlight')+metric('Compatibilidade máxima',compatPct(metrics.alignment),'Limite dividido pelo maior total de votos da dupla');
    $('pair-remainder-metrics').innerHTML=metric('Sobra estimada • Estadual',metrics.aboveLimitE==null?'Indisponível':int(metrics.aboveLimitE)+' votos',remainderNote(metrics.e,metrics.aboveLimitE))+metric('Sobra estimada • Federal',metrics.aboveLimitF==null?'Indisponível':int(metrics.aboveLimitF)+' votos',remainderNote(metrics.f,metrics.aboveLimitF));
    $('pair-estimate-note').textContent=estimateNote(metrics);
    $('pair-zone-summary').textContent=`Resultado seco por zona • ${int(zones.length)} zona(s)`;
    $('pair-zone-table').innerHTML=zones.slice(0,250).map(g=>`<tr><td>${esc(g.label)}</td><td>${int(g.e)}</td><td>${int(g.f)}</td><td class="pair-compatible-cell">${int(g.upper)}</td><td class="pair-remainder-cell">${int(g.aboveLimitE)}</td><td class="pair-remainder-cell">${int(g.aboveLimitF)}</td></tr>`).join('');
    $('pair-zone-table-note').textContent=zones.length>250?'Mostrando 250 zonas. O CSV e o relatório detalhado incluem todas.':'Todas as zonas do recorte geográfico. Traço (—) indica dados ausentes.';
    $('pair-history-note').textContent=selection.previous.map((p,i)=>!p?short[i]+': sem correspondência histórica única em 2022.':!selection.histories[i]?short[i]+': histórico por seção indisponível; sem comparação neste quadro.':short[i]+': 2022 aparece quando há dados verificáveis; escolas exigem o mesmo nome.').join(' ')+' Traço (—) indica ausência de dado verificável, sem converter em zero.';
    const enabled=[0,1].filter(i=>previous.some(v=>v[i]!==null)||schoolHistory.previousValues.some(v=>v[i]!==null));
    const legend=[0,1,...enabled.map(i=>i+2)].map(i=>`<span><i style="background:${colors[i]}"></i>${esc(short[i%2])} ${i<2?'2026':'2022'}</span>`).join('');
    $('pair-legend').innerHTML=legend;$('pair-school-legend').innerHTML=legend;
    const top=groups.slice(0,30);
    $('pair-chart-note').textContent=`${int(top.length)} de ${int(groups.length)} seção(ões) selecionadas. ${criteriaLabel()} A soma dos votos dos dois cargos não representa eleitores únicos. O relatório inclui todas as seções selecionadas.`;
    $('pair-bars').innerHTML=barRows(top,previous.slice(0,30))||'<p class="compact-note">Nenhuma seção atende aos critérios. Ajuste os filtros de exibição.</p>';
    const gauges=[[2026,metrics.alignment],[2022,history.previousMetrics?.alignment??null]].filter(([year,value])=>year===2026||value!==null);
    $('pair-similarity').innerHTML=gauges.map(([year,value])=>`<div class="pair-gauge-wrap"><div class="pair-gauge${value===null?' unavailable':''}" style="--pair-score:${value===null?0:value*100}%" role="img" aria-label="Compatibilidade máxima por seção ${year}: ${esc(compatPct(value))}"><div><strong>${esc(compatPct(value))}</strong><span>${year}</span></div></div></div>`).join('');
    if(history.previousMetrics?.alignment==null)$('pair-similarity').insertAdjacentHTML('beforeend','<p class="compact-note">2022: índice indisponível neste recorte. Exige histórico por seção para ambos e votos no recorte.</p>');
    $('pair-table').innerHTML=groups.slice(0,250).map(g=>`<tr><td>${esc(sectionLabel(g))}</td><td>${int(g.e)}</td><td>${int(g.f)}</td><td class="pair-compatible-cell">${int(g.upper)}</td><td>${esc(compatPct(g.alignment))}</td><td>${int(g.gap)}</td><td>${esc(pct(g.gapRatio))}</td><td class="pair-remainder-cell">${int(g.aboveLimitE)}</td><td class="pair-remainder-cell">${int(g.aboveLimitF)}</td><td>${badge(g)}</td></tr>`).join('');
    $('pair-table-summary').textContent=`Tabela das seções • ${int(groups.length)} selecionadas de ${int(allGroups.length)}`;
    $('pair-table-note').textContent=groups.length>250?'Mostrando 250 linhas. O CSV e o PDF incluem todas as seções selecionadas.':'Todas as seções que atendem aos critérios de exibição.';
    const equalSchools=schools.filter(g=>g.locationVerified&&g.e>0&&g.gap===0),offset=equalSchools.filter(g=>g.sectionGap>0);
    const schoolTop=schools.map((g,j)=>({g,previous:schoolHistory.previousValues[j]})).filter(({g})=>g.e>0||g.f>0).slice(0,10);
    $('pair-school-note').textContent=`${int(schools.filter(g=>g.locationVerified).length)} local(is) identificado(s) • ${int(equalSchools.length)} com totais iguais e votos • ${int(offset.length)} desses com diferenças entre seções. Gráfico: até 10 locais com votos, por volume. O filtro de exibição das seções não reduz os totais das escolas. Tolerância: ${pct(tolerance())}.`;
    $('pair-school-bars').innerHTML=barRows(schoolTop.map(v=>v.g),schoolTop.map(v=>v.previous),true)||'<p class="compact-note">Nenhum voto para a dupla neste recorte.</p>';
    $('pair-school-table').innerHTML=schools.slice(0,250).map(g=>`<tr><td>${esc(g.label)}</td><td>${int(g.sections)}</td><td>${int(g.e)}</td><td>${int(g.f)}</td><td class="pair-compatible-cell">${int(g.upper)}</td><td>${esc(compatPct(g.alignment))}</td><td>${int(g.gap)}</td><td>${esc(pct(g.gapRatio))}</td><td class="pair-remainder-cell">${int(g.aboveLimitE)}</td><td class="pair-remainder-cell">${int(g.aboveLimitF)}</td><td>${badge(g,true)}</td><td>${g.locationVerified?`<button class="button secondary pair-detail-button" type="button" data-pair-place="${esc(g.key)}" aria-label="Ver seções de ${esc(g.label)}">Ver seções</button>`:'Local a conferir'}</td></tr>`).join('');
    $('pair-school-summary').textContent=`Todos os locais do recorte • ${int(schools.length)}`;
    $('pair-school-table-note').textContent=schools.length>250?'Mostrando 250 locais. O CSV e o PDF incluem todos, inclusive os sem votos.':'Todos os locais, inclusive os sem votos; locais não identificados permanecem separados por seção.';
    $('pair-clear-place').hidden=!$('pair-place').value;
    $('pair-sources').textContent=selection.bases.map((b,i)=>`${short[i]}: ${b.regional.sources.current} • versão ${b.version==='bundled'?'publicada inicialmente':b.version}`).join(' | ')+' • Histórico: '+selection.bases[0].regional.sources.previous;
    ['pair-pdf','pair-csv'].forEach(id=>$(id).disabled=!filtered.length);
  }
  const headers=['Seção / escola','Estadual 2026','Federal 2026','Limite compatível (votos)','Compatibilidade máxima (%)','Diferença (votos)','Diferença (%)','Sobra estadual (votos)','Sobra federal (votos)','Conferência'];
  const schoolHeaders=['Escola / município','Seções','Estadual 2026','Federal 2026','Limite por seção (votos)','Compatibilidade máxima (%)','Diferença (votos)','Diferença (%)','Sobra estadual (votos)','Sobra federal (votos)','Conferência das seções'];
  const pdfHeaders=['Seção / escola','Est.','Fed.','Limite (votos)','Compat. (%)','Sobra Est.','Sobra Fed.','Situação'];
  const pdfSchoolHeaders=['Escola / município','Seções','Est.','Fed.','Limite (votos)','Compat. (%)','Sobra Est.','Sobra Fed.','Situação'];
  const sectionTable=()=>result.groups.map(g=>[sectionLabel(g),int(g.e),int(g.f),int(g.upper),compatPct(g.alignment),int(g.gap),pct(g.gapRatio),int(g.aboveLimitE),int(g.aboveLimitF),M.assess(g,tolerance()).label]);
  const schoolTable=()=>result.schools.map(g=>[g.label,int(g.sections),int(g.e),int(g.f),int(g.upper),compatPct(g.alignment),int(g.gap),pct(g.gapRatio),int(g.aboveLimitE),int(g.aboveLimitF),M.assess(g,tolerance(),true).label]);
  const zoneHeaders=['Município / zona','Estadual (votos)','Federal (votos)','Compatíveis · teto (votos)','Sobra estadual','Sobra federal'];
  const pdfZoneHeaders=['Município / zona','Est.','Fed.','Compatíveis · teto','Sobra Est.','Sobra Fed.'];
  const zoneTable=()=>result.zones.map(g=>[g.label,int(g.e),int(g.f),int(g.upper),int(g.aboveLimitE),int(g.aboveLimitF)]);
  function historyTable(groups,previous){return groups.map((g,j)=>[g.label,int(previous[j][0]),change(g.e,previous[j][0]).label,int(previous[j][1]),change(g.f,previous[j][1]).label]);}
  function criteriaLabel(){
    const labels={voted:'Com votos para pelo menos um',equal:'Totais iguais, com votos',near:'Dentro da tolerância',different:'Acima da tolerância',missing:'Sem cobertura completa',all:'Todas, inclusive sem votos'};
    const order={votes:'maior volume de votos',gap:'maior diferença em votos',closest:'maior proximidade percentual'};
    return `${labels[$('pair-match').value]} • tolerância ${pct(tolerance())} • ordem: ${order[$('pair-order').value]}.`;
  }
  const historyHeaders=['Seção / local','Estadual 2022','Variação estadual 2026 × 2022','Federal 2022','Variação federal 2026 × 2022'];
  function csv(){
    if(!result)return;
    const metadata=[['Eleição','2026 • 1º turno'],['Estadual',display(selection.candidates[0])],['Federal',display(selection.candidates[1])],['Recorte',scopeLabel()],['Seções exibidas',criteriaLabel()],['Escolas','Recorte geográfico completo; sem filtro de exibição de seções'],['Aviso','Proximidade de totais não comprova votos casados. Diferença percentual = diferença absoluta / maior total.'],['Estimativa de compatibilidade',estimateNote(result.metrics)],['Fontes',$('pair-sources').textContent],['Correlação 2026 • Pearson',corrNumber(result.correlation.r)],['Medida da correlação',basisLabel()],['Seções na correlação 2026',result.correlation.n],['Correlação 2022 • Pearson',result.previousCorrelation?corrNumber(result.previousCorrelation.r):'Indisponível'],['Critério da correlação',$('pair-correlation-note').textContent]];
    const records=[...metadata,[],['Resultado seco por zona'],zoneHeaders,...zoneTable(),[],['Votação por seção'],[...headers,...historyHeaders.slice(1)],...sectionTable().map((r,j)=>[...r,...historyTable([result.groups[j]],[result.previous[j]])[0].slice(1)]),[],['Conferência por escola — recorte geográfico completo'],[...schoolHeaders,...historyHeaders.slice(1)],...schoolTable().map((r,j)=>[...r,...historyTable([result.schools[j]],[result.schoolPrevious[j]])[0].slice(1)])];
    const number=new Intl.NumberFormat('pt-BR',{useGrouping:false,maximumFractionDigits:10});
    records.push([],['Observações da correlação • todas as seções válidas do recorte geográfico'],['Ano','Município / zona / seção','Estadual • '+basisLabel(),'Federal • '+basisLabel()]);
    for(const [year,c] of [[2026,result.correlation],[2022,result.previousCorrelation]])if(c)for(const p of c.points)records.push([year,p.label,number.format(p.x),number.format(p.y)]);
    const text='\ufeff'+records.map(row=>row.map(v=>'"'+String(v).replace(/^[=+@-]/,c=>"'"+c).replace(/"/g,'""')+'"').join(';')).join('\r\n');
    const address=URL.createObjectURL(new Blob([text],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=address;a.download='dupla-por-secao-e-escola-2026.csv';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(address),60000);
  }
  function scopeLabel(){
    const region=selection.region?selection.bases[0].regional.regions.find(r=>r[0]===selection.region)?.[1]:'Pará';
    const city=selection.city?selection.cities[0]?.[1]:`Todos os ${selection.cities.length} municípios`;
    const labels=['zone','section','place'].filter(k=>$('pair-'+k).value).map(k=>$('pair-'+k).selectedOptions[0].textContent);
    return [region,city,...labels].join(' • ');
  }
  function report(){
    if(!result)return null;const m=result.metrics;
    const schoolTop=result.schools.map((g,j)=>({g,previous:result.schoolPrevious[j]})).filter(({g})=>g.e>0||g.f>0).slice(0,10);
    const historicalBlocks=[];
    if(result.previous.some(v=>v.some(n=>n!==null)))historicalBlocks.push({type:'table',title:'Histórico das seções selecionadas • 2022',headers:historyHeaders,rows:historyTable(result.groups,result.previous),widths:[3,1,1.5,1,1.5]});
    if(result.schoolPrevious.some(v=>v.some(n=>n!==null)))historicalBlocks.push({type:'table',title:'Histórico por escola • 2022, nomes verificáveis',headers:historyHeaders,rows:historyTable(result.schools,result.schoolPrevious),widths:[3,1,1.5,1,1.5]});
    return {title:'Estadual × Federal • seções e escolas',subtitle:'Votação por seção • conferência por local de votação',generatedAt:new Date().toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'}),
      finalResult:{title:'Resultado final do recorte',summary:m.upper==null?'Compatibilidade não calculada: falta cobertura completa.':'Até '+int(m.upper)+' votos no limite agregado • '+compatPct(m.alignment),detail:'Estadual: '+int(m.e)+' votos • Federal: '+int(m.f)+' votos. Limite somado por seção; não confirma votos das mesmas pessoas.',items:[['Votos estadual',int(m.e)],['Votos federal',int(m.f)],['Limite de compatibilidade',m.upper==null?'Não calculado':int(m.upper)],['Compatibilidade máxima',compatPct(m.alignment)]]},
      meta:[['Eleição','2026 • 1º turno'],['Estadual',display(selection.candidates[0])],['Federal',display(selection.candidates[1])],['Recorte',scopeLabel()],['Seções exibidas',criteriaLabel()],['Fontes',$('pair-sources').textContent]],
      indicators:[{label:'Votos estadual',value:int(m.e),note:pct(m.shareE)+' dos votos nominais do cargo'},{label:'Votos federal',value:int(m.f),note:pct(m.shareF)+' dos votos nominais do cargo'},{label:'Sobra estimada • Estadual',value:m.aboveLimitE==null?'Indisponível':int(m.aboveLimitE)+' votos',note:remainderNote(m.e,m.aboveLimitE)},{label:'Sobra estimada • Federal',value:m.aboveLimitF==null?'Indisponível':int(m.aboveLimitF)+' votos',note:remainderNote(m.f,m.aboveLimitF)},{label:'Diferença dos totais',value:int(m.gap)+' votos',note:pct(m.gapRatio)+' do maior total no recorte'},{label:'Limite de compatibilidade',value:m.upper==null?'Sem base':'Até '+int(m.upper)+' votos',note:'Menor total em cada seção, somado no recorte'},{label:'Compatibilidade máxima',value:compatPct(m.alignment),note:'Sobre o maior total da dupla • '+int(m.equalPositive)+' seções com totais iguais'},{label:'Pearson • 2026',value:corrNumber(result.correlation.r),note:basisLabel()+' • '+int(result.correlation.n)+' seções'},{label:'Pearson • 2022',value:result.previousCorrelation?corrNumber(result.previousCorrelation.r):'Indisponível',note:result.previousCorrelation?int(result.previousCorrelation.n)+' seções históricas':'Sem base histórica suficiente nesta medida'}],
      note:estimateNote(m)+' Os votos públicos não permitem associar escolhas de uma mesma pessoa entre cargos. Diferença percentual = diferença absoluta / maior total. Proximidade por seção = soma dos menores totais por seção / maior total da dupla no recorte. Os indicadores e as escolas usam todo o recorte geográfico; o critério de exibição seleciona somente as seções. Totais escolares iguais podem esconder diferenças entre seções. '+$('pair-coverage').textContent+' '+$('pair-history-note').textContent+' '+$('pair-correlation-note').textContent,
      blocks:[{type:'table',title:'Resultado seco por zona • votos e teto estimado',headers:pdfZoneHeaders,rows:zoneTable(),widths:[3.2,1,1,1.4,1.2,1.2]},result.scatter,{type:'bars',title:'Votação por seção • até 30 seções selecionadas',rows:result.groups.slice(0,30).map((g,j)=>({label:sectionLabel(g),values:series(g,result.previous[j])}))},
        ...(m.alignment===null?[]:[{type:'pie',unit:'percent',title:'Compatibilidade máxima por seção • 2026',rows:[{label:'Limite compatível',value:100*m.alignment},{label:'Além do limite',value:100*(1-m.alignment)}]}]),
        ...(result.previousMetrics?.alignment==null?[]:[{type:'pie',unit:'percent',title:'Compatibilidade máxima por seção • 2022',rows:[{label:'Limite compatível',value:100*result.previousMetrics.alignment},{label:'Além do limite',value:100*(1-result.previousMetrics.alignment)}]}]),
        {type:'table',title:'Todas as seções selecionadas • '+criteriaLabel(),headers:pdfHeaders,rows:sectionTable().map(r=>[r[0],r[1],r[2],r[3],r[4],r[7],r[8],r[9]]),widths:[3.2,1,1,1.3,1.3,.95,.95,1.5]},
        {type:'bars',title:'Conferência por escola • até 10 locais com votos',rows:schoolTop.map(({g,previous})=>({label:g.label+' • '+M.assess(g,tolerance(),true).label,values:series(g,previous)}))},
        {type:'table',title:'Todos os locais • recorte geográfico completo',headers:pdfSchoolHeaders,rows:schoolTable().map(r=>[r[0],r[1],r[2],r[3],r[4],r[5],r[8],r[9],r[10]]),widths:[3.2,1.2,1,1,1.3,1.3,.95,.95,1.8]},
        ...historicalBlocks]};
  }
  function municipalReport(i){
    if(!result||!selection)return null;
    const base=selection.bases[i],candidate=selection.candidates[i];
    return root.MunicipalReport.build({office:base.office,candidate,index:base.index,statewide:base.statewide,regional:base.regional,cityCodes:selection.cities.map(c=>String(c[0])),ballotName:root.CandidateIdentity?.ballot(candidate,base.office)||''});
  }
  function downloadMunicipal(i){
    openReport('municipal-'+i);
  }
  function reportSignature(){return JSON.stringify([selection?.bases.map(b=>b.version),selection?.candidates.map(c=>c[0]),selection?.region,selection?.city,
    ...['estadual','federal','region','city','zone','section','place','match','order','tolerance','correlation-basis'].map(key=>$('pair-'+key).value)]);}
  function openReport(defaultType='compact'){
    if(!result)return api.toast('Selecione e compare a dupla antes de gerar o relatório.','error');
    const options=[
      {id:'compact',label:'Resumo da dupla',description:'Votos, compatibilidade, sobras e gráficos do recorte. As tabelas completas de escolas e seções ficam no relatório detalhado.',prepare:()=>{
        if(!result)throw new Error('Compare a dupla novamente.');const value=report();value.title='Resumo • Estadual × Federal';value.blocks=value.blocks.filter(b=>b.type!=='table');value.compactIndicators=true;
        return {report:value,filename:'RESUMO_DUPLA_PA_2026.pdf'};
      }},
      {id:'detailed',label:'Detalhado — seções e escolas',description:'Todas as seções selecionadas e escolas do recorte. Confira a quantidade de páginas antes de baixar.',prepare:()=>{
        if(!result)throw new Error('Compare a dupla novamente.');return {report:report(),filename:'DUPLA_SECOES_ESCOLAS_PA_2026.pdf'};
      }},
      ...[0,1].map(i=>({id:'municipal-'+i,label:short[i]+' — votação por município',description:'Todos os municípios selecionados para a dupla, com Top 30 e histórico disponível. Os filtros de seção e escola não reduzem este relatório.',prepare:()=>{
        if(!result)throw new Error('Compare a dupla novamente.');return {report:municipalReport(i),filename:`votacao_municipios_${offices[i]}_${selection.candidates[i][1]}_2026.pdf`};
      }})),
    ];
    root.ReportCenter.open({options,defaultType,signature:reportSignature});
  }
  function drill(event){
    const button=event.target.closest('[data-pair-place]');if(!button||!result)return;
    if(!result.schools.some(g=>g.key===button.dataset.pairPlace&&g.locationVerified))return;
    $('pair-place').value=button.dataset.pairPlace;renderFilters();render();
    $('pair-chart-title').scrollIntoView({behavior:'smooth',block:'start'});
  }
  function init(callbacks){
    api=callbacks;$('pair-form').addEventListener('submit',compare);
    ['pair-estadual','pair-federal'].forEach(id=>$(id).addEventListener('input',invalidate));
    $('pair-region').addEventListener('change',()=>{cityOptions();invalidate();});$('pair-city').addEventListener('change',invalidate);
    ['zone','section','place'].forEach(k=>$('pair-'+k).addEventListener('change',()=>{renderFilters();render();}));
    ['match','order','tolerance','correlation-basis'].forEach(k=>$('pair-'+k).addEventListener('change',render));
    $('pair-results').addEventListener('click',drill);
    $('pair-clear-place').addEventListener('click',()=>{$('pair-place').value='';renderFilters();render();});
    $('pair-csv').addEventListener('click',csv);
    $('pair-estadual-municipal-pdf').addEventListener('click',()=>downloadMunicipal(0));
    $('pair-federal-municipal-pdf').addEventListener('click',()=>downloadMunicipal(1));
    $('pair-pdf').addEventListener('click',()=>openReport());
  }
  async function activate(){try{await setup();}catch(e){$('pair-status').textContent=e.message;}}
  root.PairedView={init,activate};
})(window);
